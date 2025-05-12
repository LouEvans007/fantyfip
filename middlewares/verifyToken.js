// backend/middlewares/verifyToken.js

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import User from '../models/userModel.js'; // ← добавлен импорт модели

// ─── Константы и утилиты ────────────────────────────────────────────────────
import { ACCESS_COOKIE } from '../utils/cookies.js';
import { CSRF_COOKIE, CSRF_HEADER, getCookieOptions } from '../utils/csrf.js';
import { CSRF_TOKEN_LENGTH } from '../utils/csrf.js';

/** Генерирует случайный CSRF-токен */
function generateCsrfToken() {
  return crypto.randomBytes(CSRF_TOKEN_LENGTH).toString('hex');
}

/** Ставит cookie с CSRF-токеном */
function setCsrfCookie(res, token) {
  res.cookie(CSRF_COOKIE, token, getCookieOptions());
}

// ─── Middleware ─────────────────────────────────────────────────────────────

/**
 * Проверяет access-токен и управляет CSRF-защитой.
 * Логика ротации: для «безопасных» HTTP-методов (GET/HEAD/OPTIONS)
 * всегда выдаём новый CSRF-токен; для остальных — проверяем совпадение header ↔ cookie.
 */
export const verifyToken = async (req, res, next) => {
  try {
    /* ---------- 1. Аутентификация по JWT ---------- */
    const access = req.cookies[ACCESS_COOKIE];
    if (!access) {
      res.clearCookie(CSRF_COOKIE); // нет сессии → чистим CSRF
      return res.status(401).json({ success: false, message: 'Access denied. No token provided' });
    }

    const decoded = jwt.verify(access, process.env.JWT_SECRET);

    // ✅ Достаём пользователя из базы, чтобы получить актуальный plan
    const user = await User.findById(decoded.id).select('plan planExpires role');
    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    const { plan, planExpires, role } = user;

    // ✅ Вычисляем effectivePlan — если подписка истекла, то plan → basic
    const expired = planExpires && planExpires < new Date();
    const effectivePlan = expired ? 'basic' : plan;

    // ✅ Объект пользователя с актуальным тарифом
    req.user = {
      id: decoded.id,
      role,
      plan,
      planExpires,
      effectivePlan
    };

    /* ---------- 2. Проверка / ротация CSRF ---------- */
    const header = req.headers[CSRF_HEADER]; // токен из заголовка
    const cookie = req.cookies[CSRF_COOKIE]; // токен из cookie
    const isSafe = ['GET', 'HEAD', 'OPTIONS'].includes(req.method);

    if (!isSafe) {
      // «Небезопасные» методы — требуем полное совпадение header ↔ cookie
      if (!header || !cookie || header !== cookie) {
        return res.status(403).json({ success: false, message: 'Invalid or missing CSRF token' });
      }
    }

    // Всегда обновляем токен для safe-методов или если cookie отсутствует
    const newToken = generateCsrfToken();
    if (isSafe || !cookie) {
      setCsrfCookie(res, newToken);
    }

    /* ---------- 3. Всё ок — продолжаем ---------- */
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired' });
    }

    console.error('[verifyToken] error:', err);
    res.status(500).json({ success: false, message: 'Authentication error' });
  }
};

/**
 * Ограничивает доступ по ролям: allowRoles('admin', 'user')
 */
export const allowRoles = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'User not authenticated' });
  }
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Forbidden: Access denied' });
  }

  next();
};

export default { verifyToken, allowRoles };
