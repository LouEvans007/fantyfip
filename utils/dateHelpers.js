/*  backend/utils/dateHelpers.js  */

/**
 * Вернёт ISO‑номер недели (1‑53) для указанной даты.
 * Используем UTC, чтобы не поймать смещение часового пояса.
 */
export function getISOWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() === 0 ? 7 : d.getUTCDay();     // 1 — понедельник … 7 — воскресенье
  d.setUTCDate(d.getUTCDate() + 4 - day);                  // смещаемся к четвергу
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 864e5 + 1) / 7);     // миллисекунды &rarr; дни &rarr; недели
}

/**
 * Ключ вида &laquo;YYYY‑MM&raquo; — удобно хранить лимиты в Mongo.
 * Пример: 2025‑05
 */
export function getMonthKey(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
