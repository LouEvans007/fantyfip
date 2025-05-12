//backend/models/growthCacheModel.js
import mongoose from 'mongoose';

const growthCacheSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  timeframe: {
    type: String,
    required: true,
    enum: ['week', 'month', 'year', 'all'], // допустимые периоды
    index: true
  },
  data: {
    type: mongoose.Schema.Types.Mixed, // JSON-объект с результатами анализа
    required: true
  },
  generatedAt: {
    type: Date,
    default: Date.now
  }
});

// Индекс для быстрого поиска и автоудаления устаревших записей (опционально)
growthCacheSchema.index({ userId: 1, timeframe: 1 });

export default mongoose.models.GrowthCache || mongoose.model('GrowthCache', growthCacheSchema);
