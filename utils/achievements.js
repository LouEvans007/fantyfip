// backend/utils/achievements.js
import Achievement from '../models/achievementModel.js';
import JournalEntry from '../models/journalEntryModel.js';

export async function checkAchievements(userId) {
  const countEntries = await JournalEntry.countDocuments({ userId });
  // Пример: "30‑notes" ачивка
  if (countEntries >= 30) {
    const found = await Achievement.findOne({ userId, code:'30-notes' });
    if (!found) {
      await Achievement.create({ userId, code:'30-notes' });
      // тут можно добавить отправку уведомления "получен бейдж" 
    }
  }
  // и т.д.
}
