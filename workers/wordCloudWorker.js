// backend/workers/wordCloudWorker.js
import 'dotenv/config'; // ← Самый первый импорт!

import { Worker } from 'bullmq';
import Redis from 'ioredis';
import JournalEntry from '../models/journalEntryModel.js';

/* ─────────────── Логгер ─────────────── */
const logger = console;

/* ─────────────── Проверка REDIS_URL ─────────────── */
const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  logger.error('[WordCloud] REDIS_URL не задан в окружении');
  process.exit(1);
}

/* ─────────────── Redis клиент (Upstash / облачный) ─────────────── */
const redis = new Redis({
  url: redisUrl,
  tls: {},
  maxRetriesPerRequest: null,
  enableOfflineQueue: true
});

redis.on('error', (err) => logger.error('[WordCloud] Redis error:', err));
redis.on('connect', () => logger.info('[WordCloud] Redis connected'));

/* ─────────────── Воркер Word-Cloud ─────────────── */
const wordCloudWorker = new Worker(
  'wordCloud',
  async (job) => {
    const { userId, timeframe = 'all' } = job.data;
    logger.info(`[WordCloud] Build for ${userId} (${timeframe})`);

    /* 1. Дата-фильтр */
    const dateFilter = {};
    const now = new Date();

    // Сбрасываем время на полночь (UTC)
    now.setHours(0, 0, 0, 0);

    if (timeframe === 'week') {
      dateFilter.$gte = new Date(now);
      dateFilter.$gte.setDate(now.getDate() - 7);
      dateFilter.$gte.setHours(0, 0, 0, 0); // ещё раз — для чистоты
    } else if (timeframe === 'month') {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 1);
      d.setHours(0, 0, 0, 0);
      dateFilter.$gte = d;
    }

    /* 2. Записи пользователя */
    const query = dateFilter.$gte
      ? { userId, date: dateFilter }
      : { userId };

    const entries = await JournalEntry.find(query).select('content');

    /* 3. Токенизация */
    const tokens = entries.flatMap(({ content }) =>
      content
        .toLowerCase()
        .split(/[^a-zа-яё]+/g)
        .filter((w) => w.length > 2)
    );

    /* 4. Подсчёт частот */
    const freq = tokens.reduce((acc, w) => {
      acc[w] = (acc[w] || 0) + 1;
      return acc;
    }, {});

    const top50 = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .map(([word, count]) => ({ word, count }));

    /* 5. Кэширование на 1 час */
    const key = `wc:${userId}:${timeframe}`;
    await redis.set(key, JSON.stringify(top50), 'EX', 3600);

    logger.info(`[WordCloud] Cached ${key} (${top50.length} words)`);
    return top50;
  },
  {
    connection: redis,
    concurrency: 2
  }
);

/* ─────────────── Логи BullMQ ─────────────── */
wordCloudWorker.on('completed', (job) =>
  logger.info(`[WordCloud] Job ${job.id} completed`)
);
wordCloudWorker.on('failed', (job, err) =>
  logger.error(`[WordCloud] Job ${job?.id || '?'} failed:`, err)
);

logger.info('[WordCloud] Worker ready and waiting for jobs…');

/* ─────────────── Graceful shutdown ─────────────── */
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, async () => {
    logger.info(`[WordCloud] Caught ${sig}, shutting down…`);
    try {
      await wordCloudWorker.close();
      await redis.quit();
      logger.info('[WordCloud] Shutdown complete');
      process.exit(0);
    } catch (e) {
      logger.error('[WordCloud] Shutdown error:', e);
      process.exit(1);
    }
  });
}

export default wordCloudWorker;
