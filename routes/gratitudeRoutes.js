// backend/routes/gratitudeRoutes.js
import express from 'express';
import { verifyToken } from '../middlewares/verifyToken.js';
import { celebrate } from 'celebrate';
import {
  getTodaysGratitude,
  getRecentGratitude,
  createOrUpdateGratitude
} from '../controllers/gratitudeController.js';
import { upsert } from '../validators/gratitude.js'; // ← Импорт схемы

const router = express.Router();

// Apply auth middleware to all routes
router.use(verifyToken);

// Gratitude routes
router.get('/today', getTodaysGratitude);
router.get('/recent', getRecentGratitude);
router.post('/', celebrate(upsert), createOrUpdateGratitude); // ← Валидация добавлена

export default router;
