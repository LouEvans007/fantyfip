// controllers/quotesController.js
import axios from 'axios';
import Joi from 'joi';
import { getRedisClient } from '../utils/redisClient.js';

// Joi schema для валидации ответа ZenQuotes
const quoteSchema = Joi.array().items(Joi.object({
  q: Joi.string().required(),   // Цитата
  a: Joi.string().required(),   // Автор
  h: Joi.string().optional()    // HTML-версия (необязательно)
}));

/**
 * Получает случайную цитату из ZenQuotes API
 */
export const getRandomQuote = async (req, res) => {
  try {
    const redis = await getRedisClient(); // ✅ Получаем клиент Redis

    // Проверяем кэш
    const cached = await redis.get('quote:random');
    if (cached) return res.json(JSON.parse(cached));

    // Запрашиваем данные
    const response = await axios.get('https://zenquotes.io/api/random', {
      timeout: 5000 // 5 секунд
    });

    const data = response.data;

    // Валидируем ответ
    const { error } = quoteSchema.validate(data);
    if (error) {
      console.error('Invalid ZenQuotes response format:', error.message);
      return res.status(502).json({
        success: false,
        message: 'Received invalid response from quotes API'
      });
    }

    // Сохраняем в кэш на 30 минут
    await redis.set('quote:random', JSON.stringify(data), { EX: 60 * 30 }); // 30 мин

    res.json(data);
  } catch (error) {
    console.error('Error fetching random quote from ZenQuotes API:', error);

    if (error.code === 'ECONNABORTED') {
      return res.status(504).json({
        success: false,
        message: 'Request to quotes API timed out'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to fetch quote',
      error: error.message
    });
  }
};

/**
 * Получает ежедневную цитату из ZenQuotes API
 */
export const getDailyQuote = async (req, res) => {
  try {
    const redis = await getRedisClient(); // ✅ Получаем клиент Redis

    // Проверяем кэш
    const cached = await redis.get('quote:daily');
    if (cached) return res.json(JSON.parse(cached));

    const response = await axios.get('https://zenquotes.io/api/today', {
      timeout: 5000 // 5 секунд
    });

    const data = response.data;

    // Валидируем ответ
    const { error } = quoteSchema.validate(data);
    if (error) {
      console.error('Invalid ZenQuotes response format:', error.message);
      return res.status(502).json({
        success: false,
        message: 'Received invalid response from quotes API'
      });
    }

    // Сохраняем в кэш на 24 часа
    await redis.set('quote:daily', JSON.stringify(data), { EX: 86_400 }); // 24 часа

    res.json(data);
  } catch (error) {
    console.error('Error fetching daily quote from ZenQuotes API:', error);

    if (error.code === 'ECONNABORTED') {
      return res.status(504).json({
        success: false,
        message: 'Request to quotes API timed out'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to fetch daily quote',
      error: error.message
    });
  }
};
