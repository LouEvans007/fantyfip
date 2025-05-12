// backend/models/paymentModel.js

import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  plan: {
    type: String,
    enum: ['standard', 'premium'],
    required: true
  },
  amount: Number, // сумма в копейках (например: 59900)
  currency: {
    type: String,
    default: 'RUB'
  },
  provider: {
    type: String,
    default: 'yookassa'
  },
  status: {
    type: String,
    enum: ['pending', 'succeeded', 'canceled'],
    default: 'pending'
  },
  ykId: String, // ID платежа в YooKassa

  // ✅ Добавлено: начало и конец оплаченного периода
  paidPeriodStart: {
    type: Date,
    required: true
  },
  paidPeriodEnd: {
    type: Date,
    required: true
  },

  // ✅ Новый: номер кассового чека от YooKassa
  ykReceipt: {
    type: String
  },

  createdAt: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model('Payment', paymentSchema);
