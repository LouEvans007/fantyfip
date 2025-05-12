// backend/routes/referralRoutes.js

import express from 'express';
import { verifyToken } from '../middlewares/verifyToken.js';
import User from '../models/userModel.js';

const router = express.Router();

// Все маршруты в этом роутере требуют авторизации
router.use(verifyToken);

/**
 * GET /api/referral/link
 * Возвращает реферальную ссылку, статистику и срок действия бонуса
 */
router.get('/link', async (req, res) => {
  try {
    const userId = req.user.id;

    // Получаем данные пользователя
    const user = await User.findById(userId).select('referralCode referralBonusExpires');

    if (!user) {
      return res.status(404).json({ success: false, message: 'Пользователь не найден' });
    }

    // Считаем количество рефералов, у которых _refRewarded === true
    const paidReferrals = await User.countDocuments({
      referredBy: userId,
      _refRewarded: true
    });

    // Формируем полный URL с реферальным кодом
    const link = `${process.env.FRONTEND_URL}/auth/register?ref=${user.referralCode}`;

    res.json({
      success: true,
      data: {
        link,
        paidReferrals,
        bonusExpires: user.referralBonusExpires
      }
    });
  } catch (error) {
    console.error('Ошибка при получении реферальной ссылки:', error);
    res.status(500).json({ success: false, message: 'Не удалось получить реферальную ссылку' });
  }
});

export default router;
