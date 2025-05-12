// backend/models/gratitudeEntryModel.js
import mongoose from "mongoose";

const gratitudeEntrySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Календарный день в виде строки YYYY-MM-DD (например: "2025-04-30")
  day: {
    type: String,
    required: true
  },

  entries: [{
    content: {
      type: String,
      required: true
    }
  }],

  date: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Уникальный индекс: один пользователь — одна запись в день
gratitudeEntrySchema.index({ userId: 1, day: 1 }, { unique: true });

const GratitudeEntry = mongoose.model('GratitudeEntry', gratitudeEntrySchema);

export default GratitudeEntry;
