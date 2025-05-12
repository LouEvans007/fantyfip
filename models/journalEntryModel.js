// models/journalEntryModel.js

import mongoose from "mongoose";

const journalEntrySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: true
  },
  date: {
    type: Date,
    default: Date.now
  },
  mood: {
    score: {
      type: Number,
      min: 1,
      max: 10
    },
    label: {
      type: String,
      enum: ['Very Negative', 'Negative', 'Neutral', 'Positive', 'Very Positive']
    }
  },
  analysis: {
    supportiveResponse: String,
    identifiedPatterns: [String],
    suggestedStrategies: [String],
    processed: {
      type: Boolean,
      default: false
    }
  },
  tags: [String]
}, {
  timestamps: true
});

// 🔧 Создаем индекс для частых запросов по userId + date
journalEntrySchema.index({ userId: 1, date: -1 });

const JournalEntry = mongoose.model('JournalEntry', journalEntrySchema);

export default JournalEntry;
