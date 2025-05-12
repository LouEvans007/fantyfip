// backend/controllers/analysis/monthlyReportController.js

import JournalEntry from '../../models/journalEntryModel.js';
import AnalysisUsage from '../../models/analysisUsageModel.js';
import { ChutesClient } from '../../utils/chutesClient.js';
import { getMonthKey } from '../../utils/dateHelpers.js';
import { LIMITS } from '../../utils/limits.js'; // ✅ новый импорт

/**
 * POST /api/analysis/monthly
 * - Генерация «Углубленного отчёта» (AI)
 * - Для Standard: лимит 2 в месяц
 * - Для Premium: безлимит
 */
export async function getMonthlyReport(req, res) {
  const { effectivePlan } = req.user;

  // Логика ограничений для тарифа Standard
  if (effectivePlan === 'standard') {
    const mk = getMonthKey(new Date());
    let usage = await AnalysisUsage.findOne({ userId: req.user.id, monthKey: mk });

    if (!usage) {
      usage = new AnalysisUsage({ userId: req.user.id, monthKey: mk, usedCount: 0 });
    }

    // ✅ Замена: 2 → LIMITS.monthly.standard.count
    if (usage.usedCount >= LIMITS.monthly.standard.count) {
      return res.status(429).json({
        success: false,
        message: `Лимит ${LIMITS.monthly.standard.count} углублённых отчёта в этом месяце`
      });
    }

    usage.usedCount += 1;
    await usage.save();
  }

  // Берём записи за последние 30 дней
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const entries = await JournalEntry.find({
    userId: req.user.id,
    date: { $gte: since }
  });

  if (!entries.length) {
    return res.json({
      success: false,
      message: "Недостаточно записей для отчёта"
    });
  }

  const text = entries.map(e => e.content).join('\n');

  const prompt = `
Ты — практикующий психотерапевт. Проанализируй следующие записи дневника (последние 30 дней):
- Определи основные моменты
- Найди эмоциональные паттерны
- Дай практические рекомендации по улучшению настроения
Текст:
${text}
  `.trim();

  try {
    const aiResponse = await ChutesClient.post('/chat/completions', {
      model: process.env.CHUTES_MODEL || 'Qwen/Qwen2.5-VL-32B-Instruct',
      temperature: 0.6,
      max_tokens: 700,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Отвечай только на русском языке.' },
        { role: 'user',   content: prompt }
      ]
    });

    const content = aiResponse.data.choices[0].message.content;

    res.json({
      success: true,
      report: content
    });

  } catch (error) {
    console.error("Ошибка при генерации ежемесячного отчёта:", error.message || error);
    res.status(500).json({
      success: false,
      message: "Не удалось сгенерировать отчёт"
    });
  }
}
