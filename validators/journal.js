// validators/journal.js

import Joi from 'joi';

/**
 * Валидация для создания новой записи
 */
export const create = {
  body: Joi.object({
    content: Joi.string().min(5).max(10_000).required(),
    mood: Joi.object({
      score: Joi.number().integer().min(1).max(10).required(),
      label: Joi.string().max(30).required()
    }).required(),
    tags: Joi.array().items(Joi.string().max(24)).max(10).default([])
  })
};

/**
 * Валидация для обновления существующей записи
 */
export const update = {
  params: Joi.object({
    id: Joi.string().hex().length(24).required() // ObjectId из MongoDB
  }),
  body: Joi.object({
    content: Joi.string().min(5).max(10_000).optional(),
    mood: Joi.object({
      score: Joi.number().integer().min(1).max(10).optional(),
      label: Joi.string().max(30).optional()
    }).optional(),
    tags: Joi.array().items(Joi.string().max(24)).max(10).optional()
  }).min(1) // Хотя бы одно поле должно быть передано
};

/**
 * Валидация для перепроцессинга одной записи
 */
export const reprocess = {
  params: Joi.object({
    id: Joi.string().hex().length(24).required() // ObjectId из MongoDB
  })
};
