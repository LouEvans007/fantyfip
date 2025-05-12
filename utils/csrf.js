// utils/csrf.js
import process from 'process';

export const CSRF_COOKIE  = 'XSRF-TOKEN';
export const CSRF_HEADER  = 'x-xsrf-token';
export const CSRF_MAX_AGE = 24 * 60 * 60 * 1000; // 24 ч
export const CSRF_TOKEN_LENGTH  = 64;                  // &larr; ДОБАВЬТЕ ЭТУ СТРОКУ


/** Опции для CSRF‑cookie */
export function getCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  let sameSite = process.env.SAMESITE || (isProd ? 'lax' : 'strict');

  return {
    httpOnly: false,                        // cookie читается axios‑ом
    sameSite,
    secure  : isProd || sameSite === 'none',
    path    : '/',
    maxAge  : CSRF_MAX_AGE
  };
}
