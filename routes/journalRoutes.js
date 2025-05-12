// backend/routes/journalRoutes.js
import express from 'express';
import { verifyToken } from '../middlewares/verifyToken.js';
import { requirePlan } from '../middlewares/requirePlan.js'; // ✅ Импортируем requirePlan
import { celebrate } from 'celebrate';

// Controllers
import {
  getJournalEntries,
  createJournalEntry,
  getJournalInsights,
  getJournalEntry,
  updateJournalEntry,
  deleteJournalEntry,
  reprocessJournalEntries,
  reprocessSingleEntry,
} from '../controllers/journalController.js';

import { getWordCloudData } from '../controllers/moodController.js';

// Validators
import {
  create as validateCreate,
  update as validateUpdate,
  reprocess as validateReprocess
} from '../validators/journal.js';

const router = express.Router();

// Все маршруты требуют авторизации
router.use(verifyToken);

// === Journal API ===

// Получить все записи
router.get('/', getJournalEntries);

// Создать новую запись
router.post('/', celebrate(validateCreate), createJournalEntry);

// Получить аналитику (инсайты)
router.get('/insights', requirePlan('basic'), getJournalInsights); // 🔒 Standard или Premium

// Перепроцессинг всех невыполненных записей
router.post('/reprocess', requirePlan('basic'), reprocessJournalEntries); // 🔒 Только Premium

// Word cloud данные
router.get('/wordcloud', requirePlan('basic'), getWordCloudData); // 🔒 Standard или выше

// === Single Entry Routes ===

// Получить конкретную запись по ID
router.get('/:id', getJournalEntry);

// Обновить запись
router.put('/:id', celebrate(validateUpdate), updateJournalEntry);

// Удалить запись
router.delete('/:id', deleteJournalEntry);

// Перепроцессинг одной записи
router.post('/:id/reprocess', celebrate(validateReprocess), reprocessSingleEntry);

// === very light status check ======================================
router.get('/:id/status', verifyToken, async (req, res) => {
  const { id } = req.params;
  const entry = await JournalEntry.findOne(
    { _id: id, userId: req.user.id },
    'analysis.processed'
  );
  if (!entry) return res.status(404).end();
  res.json({ processed: !!entry.analysis?.processed });
});

// Экспорт маршрутов
export default router;
