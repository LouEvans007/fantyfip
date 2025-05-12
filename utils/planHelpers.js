// backend/utils/planHelpers.js

/* --------------------------------------------------------- */
/*  Утилиты работы с тарифами                                */
/* --------------------------------------------------------- */

/**
 * Уровни доступа по тарифам
 * Позволяет сравнивать права: basic < standard < premium
 */
export const PLAN_ORDER = { basic: 0, standard: 1, premium: 2 };

/**
 * Проверяет, имеет ли пользователь достаточный уровень плана.
 * @param {string} userPlan – текущий тариф пользователя ('basic', 'standard', 'premium')
 * @param {string} requiredPlan – минимальный требуемый тариф
 * @returns {boolean}
 */
export const hasPlan = (userPlan, requiredPlan = 'basic') =>
  PLAN_ORDER[userPlan] >= PLAN_ORDER[requiredPlan];

/**
 * Проверяет, подпадает ли пользователь под ограничения Standard-тарифа
 * Например, лимит на AI-отчёты или частые функции
 * @param {string} plan – тариф пользователя
 * @returns {boolean}
 */
export const isStandardLimited = (plan) => plan === 'standard';

/**
 * Получить дату окончания подписки:
 * - если у пользователя уже есть активная подписка → продлеваем от неё
 * - иначе → начинаем с сегодняшней даты
 * @param {Date | null} currentExpiry – текущая дата окончания
 * @param {number} daysToAdd – сколько дней добавить (по умолчанию 30)
 * @returns {Date}
 */
export const getNewPlanExpires = (currentExpiry, daysToAdd = 30) => {
  const now = new Date();
  const start = currentExpiry && currentExpiry > now ? new Date(currentExpiry) : now;
  return new Date(start.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
};

/**
 * Определяет, истекла ли подписка у пользователя
 * @param {Date | null} planExpires – дата окончания подписки
 * @returns {boolean}
 */
export const isPlanExpired = (planExpires) => {
  if (!planExpires) return true;
  return new Date(planExpires) <= new Date();
};
