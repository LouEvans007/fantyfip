// backend/routes/authRoutes.js
import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/userModel.js'; // Убедитесь, что модель пользователя содержит refreshTokenTid
import { generateAccessToken, setAuthCookies } from '../utils/jwtUtils.js';
import crypto from 'crypto';

// Импорт утилит
import { REFRESH_COOKIE } from '../utils/cookies.js';
import { CSRF_COOKIE, getCookieOptions } from '../utils/csrf.js';

const router = express.Router();

/**
 * @route   POST /api/auth/refresh
 * @desc    Обновить access-токен через refresh-токен с проверкой tid для безопасности
 * @access  Private
 */
router.post('/refresh', async (req, res) => {
  const refreshToken = req.cookies?.[REFRESH_COOKIE];

  if (!refreshToken) {
    return res.status(401).json({ success: false, message: 'No refresh token found' });
  }

  let payload;
  try {
    payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
  }

  const user = await User.findById(payload.id).select('refreshToken refreshTokenTid role');
  if (!user) {
    return res.status(401).json({ success: false, message: 'User not found' });
  }

  const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

  if (user.refreshToken !== refreshTokenHash) {
    return res.status(401).json({ success: false, message: 'Refresh token revoked' });
  }

  // Проверка соответствия tid в токене и в БД
  if (payload.tid !== user.refreshTokenTid) {
    return res.status(401).json({ success: false, message: 'Mismatched token ID (tid)' });
  }

  // Генерируем новый tid и новые токены
  const newTid = crypto.randomUUID();
  const newAccessToken = generateAccessToken(user._id, user.role);
  const newRefreshToken = jwt.sign(
    { id: user._id, tid: newTid },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );

  // Хэшируем и сохраняем новый refresh-токен и его tid
  const newRefreshTokenHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');

  try {
    await User.findByIdAndUpdate(user._id, {
      refreshToken: newRefreshTokenHash,
      refreshTokenTid: newTid
    });
  } catch (err) {
    console.error("Error saving new refresh token:", err);
    return res.status(500).json({ success: false, message: "Failed to update refresh token" });
  }

  // Устанавливаем куки с новыми токенами
  setAuthCookies(res, newAccessToken, newRefreshToken);

  // Устанавливаем новый CSRF-токен локально, без импорта
  const csrfToken = crypto.randomBytes(64).toString('hex');
  res.cookie(CSRF_COOKIE, csrfToken, getCookieOptions());

  res.json({
    success: true,
    message: 'Tokens successfully refreshed',
    accessToken: newAccessToken
  });
});

export default router;
