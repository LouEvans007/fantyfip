// backend/models/promoCodeModel.js

import mongoose from 'mongoose';

const promoCodeSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  discountPct: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  freeDays: {
    type: Number,
    default: 0
  },
  maxUses: {
    type: Number,
    default: 1
  },
  usedCount: {
    type: Number,
    default: 0
  },
  active: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

export default mongoose.model('PromoCode', promoCodeSchema);
