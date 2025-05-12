// backend/routes/analysisRoutes.js

import express from 'express';
import { verifyToken } from '../middlewares/verifyToken.js';
import { requirePlan } from '../middlewares/requirePlan.js';

// Импортируем все анализ-контроллеры через один файл
import * as analysis from '../controllers/analysis/index.js';

// Челленджи остаются отдельно — это не часть анализа
import { getGuidedChallenges } from '../controllers/challengesController.js';

const router = express.Router();

// Все роуты требуют авторизации
router.use(verifyToken);

// === Роуты для фич анализа ===
router.get('/patterns', analysis.getEmotionalPatterns);         // GET /api/analysis/patterns
router.get('/gratitude-hints', analysis.getGratitudeHints);     // GET /api/analysis/gratitude-hints
router.get('/growth', analysis.getGrowthReport);                // GET /api/analysis/growth
router.post('/monthly', requirePlan('premium'), analysis.getMonthlyReport); // POST /api/analysis/monthly

// === Челленджи (не входят в анализ) ===
router.get('/challenges', getGuidedChallenges);                 // GET /api/analysis/challenges

export default router;
