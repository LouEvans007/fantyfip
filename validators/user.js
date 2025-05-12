// backend/validators/user.js
import Joi from 'joi';

export const register = {
  body: Joi.object({
    username: Joi.string().min(2).max(30).required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(6).max(128).required(),
    ref: Joi.string().hex().length(8).optional() // ← Поле для реферального кода
  })
};

export const login = {
  body: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
  })
};

// Обновление профиля: username, email и/или newPassword
export const update = {
  body: Joi.object({
    username: Joi.string().min(2).max(30),
    email: Joi.string().email(),
    newPassword: Joi.string().min(6).max(128)
  }).or('username', 'email', 'newPassword') // Должно быть хотя бы одно поле
};
