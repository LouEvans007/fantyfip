// backend/routes/billingRoutes.js

import express from 'express';
import { verifyToken } from '../middlewares/verifyToken.js';
import { requirePlan } from '../middlewares/requirePlan.js'; // ✅ Импортируем requirePlan
import { createCheckout, webhook, getPaymentHistory } from '../controllers/billingController.js';

const router = express.Router();

// Все роуты требуют авторизации
router.use(verifyToken);

// Создание платежа
router.post('/checkout', createCheckout);

/**
 * YooKassa Webhook
 *
 * ВАЖНО:
 * - Используем express.raw() для получения СЫРОГО JSON-тела.
 * - Это необходимо для проверки подписи X-YM-SIG от YooKassa.
 * - req.body будет Buffer, его нужно привести к строке через .toString('utf8').
 */
router.post('/webhook', express.raw({ type: 'application/json' }), webhook);

// Получение истории платежей — только для Premium
router.get('/history', requirePlan('premium'), getPaymentHistory); // 🔒 Только premium

export default router;
