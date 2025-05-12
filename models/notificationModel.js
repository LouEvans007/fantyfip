//backend/models/notificationModel.js

import mongoose from 'mongoose';

const { Schema, model, models } = mongoose;

/**
 * Схема уведомления
 *  – userId      &rarr; владелец (обязателен)
 *  – title       &rarr; краткий заголовок
 *  – body        &rarr; расширенный текст (необязателен)
 *  – url         &rarr; deep‑link, куда вести по клику (необязательно)
 *  – isRead      &rarr; прочитано ли пользователем
 *  – createdAt   &rarr; дата создания (генерируется автоматически)
 */
const notificationSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 140,
    },
    body: {
      type: String,
      trim: true,
    },
    url: {
      type: String,
      trim: true,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // createdAt автоматически
    versionKey: false,                                 // убираем __v
  }
);

// ⚠️  При hot‑reload (nodemon / Next.js) модель может уже существовать
export default models.Notification || model('Notification', notificationSchema);
