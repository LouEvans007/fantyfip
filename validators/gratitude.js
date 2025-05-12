// backend/validators/gratitude.js
import Joi from 'joi';

export const upsert = {
  body: Joi.object({
    entries: Joi.array()
      .items(Joi.string().min(2).max(200))
      .min(1)
      .max(3)
      .required()
  })
};

export const deleteEntry = {
  params: Joi.object({
    id: Joi.string().hex().length(24).required() // MongoDB ObjectId
  })
};
