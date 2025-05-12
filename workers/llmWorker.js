// backend/workers/llmWorker.js
import 'dotenv/config'; // ← Самый первый импорт!
import mongoose from 'mongoose';
import { Worker } from 'bullmq';
import { processEntryWithLLM } from '../controllers/journalController.js';

/* ─────────────── Подключение к MongoDB ─────────────── */
const connectToMongo = async () => {
  const mongoUri = process.env.MONGO;
  if (!mongoUri) {
    console.error('[LLM Worker] MONGO_URI не задан в окружении');
    process.exit(1);
  }

  try {
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000, // таймаут при старте
      socketTimeoutMS: 45000,         // таймаут сокета
    });
    console.log('[LLM Worker] MongoDB успешно подключена');
  } catch (err) {
    console.error('[LLM Worker] Ошибка подключения к MongoDB:', err.message || err);
    process.exit(1);
  }
};

/* ─────────────── Redis подключение через URL (Upstash) ─────────────── */
const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  console.error('[LLM Worker] REDIS_URL не задан в окружении');
  process.exit(1);
}

const connection = {
  url: redisUrl,
};

/* ─────────────── Воркер LLM-очереди ─────────────── */
let llmWorker;

const startWorker = async () => {
  await connectToMongo();

  llmWorker = new Worker(
    'llm',
    async (job) => {
      console.log(`[LLM] Processing job ${job.id} for entry ${job.data.entryId}`);
      await processEntryWithLLM(job.data.entryId);
    },
    {
      connection,
      concurrency: 5,
    }
  );

  /* ─────────────── Логи BullMQ ─────────────── */
  llmWorker.on('error', (err) =>
    console.error('[LLM Worker Error]:', err.message || err)
  );
  llmWorker.on('failed', (job, err) =>
    console.error(`[LLM] Job ${job?.id} failed (${job?.attemptsMade} attempts):`, err)
  );

  console.log('[LLM Worker] Ready and listening for jobs…');
};

startWorker();

/* ─────────────── Graceful shutdown ─────────────── */
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, async () => {
    console.log(`[LLM Worker] Caught ${sig}, shutting down…`);
    try {
      if (llmWorker) await llmWorker.close();
      await mongoose.disconnect();
      console.log('[LLM Worker] Closed successfully');
      process.exit(0);
    } catch (e) {
      console.error('[LLM Worker] Shutdown error:', e);
      process.exit(1);
    }
  });
}

export default llmWorker;
