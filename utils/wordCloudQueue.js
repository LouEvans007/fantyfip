//backend/utils/wordCloudQueue.js

import { Queue } from 'bullmq';

// Проверяем наличие переменной окружения
const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  throw new Error('REDIS_URL не задан в переменных окружения');
}

export const wordCloudQueue = new Queue('wordCloud', {
  connection: {
    url: redisUrl,
  },
});
