// backend/controllers/billingController.js
import axios from 'axios';
import Payment from '../models/paymentModel.js';
import User from '../models/userModel.js';
import PromoCode from '../models/promoCodeModel.js';
import crypto from 'crypto';

import { getNewPlanExpires } from '../utils/planHelpers.js';

function ykAuth() {
  const creds = Buffer.from(`${process.env.YOOKASSA_SHOP_ID}:${process.env.YOOKASSA_SECRET_KEY}`).toString('base64');
  return { Authorization: `Basic ${creds}` };
}

/* --------------------------------------------- */
/*  POST /api/billing/checkout                   */
/* --------------------------------------------- */
export const createCheckout = async (req, res) => {
  try {
    const { plan, promoCode } = req.body;

    if (plan === 'basic') {
      return res.status(400).json({ success: false, message: "Невозможно оплатить тариф Basic" });
    }

    const priceMap = { standard: 59900, premium: 99900 }; // копейки

    if (!priceMap[plan]) {
      return res.status(400).json({ success: false, message: "Неизвестный тариф" });
    }

    const user = await User.findById(req.user.id).select('plan planExpires');

    const stillActive = user.plan === plan && user.planExpires && user.planExpires > new Date();
    if (stillActive) {
      return res.status(409).json({
        success: false,
        message: `У вас уже есть активная подписка "${plan}" до ${user.planExpires.toISOString().slice(0, 10)}`
      });
    }

    let paidPeriodStart = user.planExpires && user.planExpires > new Date()
      ? new Date(user.planExpires)
      : new Date();

    let paidPeriodEnd = getNewPlanExpires(paidPeriodStart, 30);

    let discount = 0;
    let bonusDays = 0;

    if (promoCode) {
      const promo = await PromoCode.findOneAndUpdate(
        {
          code: promoCode.trim(),
          active: true,
          $expr: { $lt: ['$usedCount', '$maxUses'] }
        },
        {
          $inc: { usedCount: 1 }
        },
        {
          new: true
        }
      );

      if (!promo) {
        return res.status(400).json({ success: false, message: 'Промо-код недоступен' });
      }

      discount = promo.discountPct;
      bonusDays = promo.freeDays;
    }

    if (bonusDays > 0) {
      paidPeriodEnd = getNewPlanExpires(paidPeriodEnd, bonusDays);
    }

    const baseAmount = priceMap[plan];
    const amount = Math.max(0, Math.round(baseAmount * (1 - discount / 100)));

    const payment = await Payment.create({
      userId: req.user.id,
      plan,
      amount,
      currency: 'RUB',
      provider: 'yookassa',
      status: 'pending',
      paidPeriodStart,
      paidPeriodEnd
    });

    const ykRes = await axios.post(
      'https://api.yookassa.ru/v3/payments ',
      {
        amount: {
          value: (amount / 100).toFixed(2),
          currency: 'RUB'
        },
        confirmation: {
          type: 'redirect',
          return_url: `${process.env.FRONTEND_URL}/pricing/success`
        },
        capture: true,
        metadata: {
          paymentId: payment._id.toString(),
          paidPeriodStart: paidPeriodStart.toISOString(),
          paidPeriodEnd: paidPeriodEnd.toISOString(),
          userId: req.user.id,
          discount,
          bonusDays,
          promoCode // ✅ Передаём в метаданные для возможного отката
        }
      },
      {
        headers: {
          'Idempotence-Key': crypto.randomUUID(),
          ...ykAuth(),
          'Content-Type': 'application/json'
        }
      }
    );

    payment.ykId = ykRes.data.id;
    payment.status = 'pending';
    await payment.save();

    res.json({ confirmationUrl: ykRes.data.confirmation.confirmation_url });
  } catch (error) {
    console.error("Ошибка при создании чекаута:", error.message || error);
    res.status(500).json({ success: false, message: "Не удалось начать оплату" });
  }
};

/* --------------------------------------------- */
/*  POST /api/billing/webhook                    */
/* --------------------------------------------- */
export const webhook = async (req, res) => {
  const sign = req.headers['x-yookassa-signature-sha256'];
  const rawBody = req.body.toString('utf8');

  // 🔐 Используем отдельный секрет для вебхуков
  const calc = crypto.createHmac('sha256', process.env.YOOKASSA_WEBHOOK_SECRET)
                     .update(rawBody)
                     .digest('hex');

  if (sign !== calc) {
    return res.status(403).end();
  }

  const { event, object } = req.body;

  if (event !== 'payment.succeeded') {
    return res.status(200).end();
  }

  const { metadata, status } = object;
  const payment = await Payment.findById(metadata.paymentId);

  if (!payment) {
    return res.status(200).end();
  }

  // ✅ Идемпотентность
  if (payment.status === 'succeeded') {
    return res.status(200).end();
  }

  payment.status = status;
  await payment.save();

  // ❌ Платёж отменён → вернуть использованный промокод
  if (status === 'canceled' && metadata.promoCode) {
    await PromoCode.updateOne(
      { code: metadata.promoCode.trim() },
      { $inc: { usedCount: -1 } }
    );
    return res.status(200).end();
  }

  // ❌ Неуспешный статус (не canceled и не succeeded)
  if (status !== 'succeeded') {
    return res.status(200).end();
  }

  // ✅ Обновляем подписку без усечения
  const user = await User.findById(payment.userId).select('planExpires');
  const newExpiry = payment.paidPeriodEnd > user.planExpires
    ? payment.paidPeriodEnd
    : user.planExpires;

  await User.findByIdAndUpdate(payment.userId, {
    plan: payment.plan,
    planExpires: newExpiry
  });

  // ✅ --- НАЧИСЛЕНИЕ РЕФЕРАЛЬНОГО БОНУСА ---
  const payer = await User.findById(payment.userId);

  if (payer.referredBy && !payer._refRewarded) {
    const referrer = await User.findById(payer.referredBy);

    if (referrer) {
      const bonusDays = 14;
      const now = new Date();

      const base = referrer.plan === 'premium' && referrer.planExpires > now
        ? referrer.planExpires
        : now;

      referrer.plan = 'premium';
      referrer.planExpires = new Date(base.getTime() + bonusDays * 864e5);
      referrer.referralBonusExpires = referrer.planExpires;
      await referrer.save();
    }

    payer._refRewarded = true;
    await payer.save();
  }

  res.status(200).end();
};

/* --------------------------------------------- */
/*  GET /api/billing/history                     */
/* --------------------------------------------- */
export const getPaymentHistory = async (req, res) => {
  try {
    const history = await Payment.find({ userId: req.user.id })
                                 .sort({ createdAt: -1 })
                                 .select('-__v');

    res.status(200).json(history);
  } catch (error) {
    console.error("Ошибка при получении истории платежей:", error);
    res.status(500).json({ success: false, message: "Не удалось загрузить историю платежей" });
  }
};
