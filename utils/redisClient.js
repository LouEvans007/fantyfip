// backend/utils/redisClient.js

import { createClient } from 'redis';

let redisClient = null;

/**
 * Создаёт и возвращает клиент Redis.
 * Если клиент уже создан и подключён — возвращает существующий экземпляр.
 */
export const getRedisClient = async () => {
  if (!redisClient) {
    // Получаем URL из переменной окружения
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
      throw new Error('REDIS_URL не задан в переменных окружения');
    }

    redisClient = createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 5) {
            console.error('Maximum Redis reconnection attempts reached');
            return new Error('Redis connection lost');
          }
          return Math.min(retries * 100, 2000);
        },
      },
      tls: {}, // TLS автоматически используется при rediss://
    });

    // Обработчики событий
    redisClient.on('error', (err) => {
      console.error('Redis client error:', err.message);
    });

    redisClient.on('connect', () => {
      console.log('✅ Успешно подключено к Redis (Upstash)');
    });

    redisClient.on('reconnecting', () => {
      console.warn('🔁 Переподключение к Redis...');
    });

    redisClient.on('end', () => {
      console.log('🔚 Соединение с Redis закрыто');
    });

    try {
      await redisClient.connect();
    } catch (err) {
      console.error('❌ Не удалось подключиться к Redis:', err.message);
      redisClient = null; // Сбросим клиент для повторной попытки
      throw err;
    }
  }

  return redisClient;
};
