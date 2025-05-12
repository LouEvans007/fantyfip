// backend/utils/jwtUtils.js — ESM вариант

import jwt from 'jsonwebtoken';
import { ACCESS_COOKIE, REFRESH_COOKIE } from './cookies.js';

// Динамическая настройка sameSite в зависимости от окружения
const getCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === 'production';
  let sameSite = process.env.SAMESITE;

  if (!sameSite) {
    sameSite = isProduction ? 'lax' : 'strict';
  }

  return {
    httpOnly: true,
    sameSite,
    secure: isProduction || sameSite === 'none',
    path: '/',
  };
};

/**
 * Генерация access-токена с id, role, plan и planExpires
 */
export function generateAccessToken(id, role, plan = 'basic', planExpires = null) {
  return jwt.sign(
    {
      id,
      role,
      plan,
      planExpires: planExpires ? planExpires.toISOString() : null
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

/**
 * Генерация refresh-токена с id и tid
 */
export function generateRefreshToken(id, tid) {
  return jwt.sign(
    { id, tid },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );
}

/**
 * Установка кук с access и refresh токенами
 */
export function setAuthCookies(res, accessToken, refreshToken) {
  const opts = getCookieOptions();

  // Устанавливаем maxAge для кук
  res.cookie(ACCESS_COOKIE, accessToken, {
    ...opts,
    maxAge: 60 * 60 * 1000, // 1 час
  });

  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...opts,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 дней
  });
}

/**
 * Проверка подписи access-токена
 */
export function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}
