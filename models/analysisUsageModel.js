// backend/models/analysisUsageModel.js
import mongoose from 'mongoose';

const analysisUsageSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  monthKey:  { type: String }, // "2025-05" для отслеживания лимитов в конкретном месяце
  usedCount: { type: Number,  default: 0 }
});

analysisUsageSchema.index({ userId: 1, monthKey: 1 }, { unique: true });

export default mongoose.model('AnalysisUsage', analysisUsageSchema);
