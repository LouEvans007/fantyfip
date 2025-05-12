// backend/models/userModel.js

import mongoose from "mongoose";
import crypto from 'crypto'; // ✅ Импорт модуля crypto для генерации referralCode

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  refreshToken: {
    type: String,
    default: null,
    // Хранит HASH refresh-токена (безопасно)
  },
  refreshTokenTid: {
    type: String,
    default: null,
    // Хранит идентификатор токена (tid), чтобы сравнивать при /refresh
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  // Streak tracking fields
  currentStreak: {
    type: Number,
    default: 0
  },
  longestStreak: {
    type: Number,
    default: 0
  },
  lastEntryDate: {
    type: Date,
    default: null
  },
  // 🔐 Поля для защиты от брутфорса
  failedLogins: {
    type: Number,
    default: 0
  },
  lockUntil: {
    type: Date,
    default: null
  },
  // 💳 Подписка пользователя
  plan: {
    type: String,
    enum: ['basic', 'standard', 'premium'],
    default: 'basic'
  },
  planExpires: {
    type: Date,
    default: null
  },

  // 🌟 Реферальные поля
  referralCode: {
    type: String,
    unique: true,
    default: () => crypto.randomBytes(4).toString('hex') // Генерация 8-символьного кода
  },
  referredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  referralBonusExpires: {
    type: Date,
    default: null
  },
  _refRewarded: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

// ✅ TTL-индекс для автоматического сброса блокировки
userSchema.index({ lockUntil: 1 }, { expireAfterSeconds: 0 });

const User = mongoose.model("User", userSchema);

export default User;
