// backend/utils/llmQueue.js

import { Queue } from 'bullmq';

// Проверяем наличие переменной окружения
const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  throw new Error('REDIS_URL не задан в переменных окружения');
}

export const llmQueue = new Queue('llm', {
  connection: {
    url: redisUrl,
  },
  defaultJobOptions: {
    attempts: 5,                         // до 5 повторов
    backoff: { type: 'exponential', delay: 10_000 }, // 10s → 20s → 40s …
    removeOnComplete: 1000,              // удалить из истории после 1000 успешных
    removeOnFail: 500                    // удалить после 500 неудачных попыток
  }
});
