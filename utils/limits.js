// backend/utils/limits.js

export const LIMITS = {
  /**
   * Лимиты на использование фич по тарифам
   * 
   * Структура:
   * featureName: {
   *   standard: { per: время в мс, count: кол-во раз },
   *   premium: null // означает "без ограничений"
   * }
   */

  growth: {
    standard: {
      per: 86400000, // 24 часа в миллисекундах
      count: 1       // 1 раз в сутки
    },
    premium: null    // безлимит
  },

  challenges: {
    standard: {
      per: 86400000, // 24 часа
      count: 3       // до 3 раз в день
    },
    premium: null    // безлимит
  },

  monthly: {
    standard: {
      per: 2592000000, // 30 дней в миллисекундах
      count: 2         // до 2 отчётов в месяц
    },
    premium: null      // безлимит
  }
};
