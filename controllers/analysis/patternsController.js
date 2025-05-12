// backend/controllers/analysis/patternsController.js

import JournalEntry from '../../models/journalEntryModel.js';
import { ChutesClient } from '../../utils/chutesClient.js';

/**
 * GET /api/analysis/patterns
 * - Ищет негативные и позитивные триггеры в записях пользователя
 * - Возвращает JSON с анализом: негативные темы, позитивные, рекомендации
 */
export async function getEmotionalPatterns(req, res) {
  const userId = req.user.id;

  // Берём последние 50 записей для анализа
  const recentEntries = await JournalEntry
    .find({ userId })
    .sort({ date: -1 })
    .limit(50);

  if (!recentEntries.length) {
    return res.status(400).json({
      success: false,
      message: "Недостаточно записей для анализа"
    });
  }

  // Собираем всё содержимое в один текст для AI
  const combinedText = recentEntries.map(e => e.content).join('\n');

  const aiPrompt = `
Проанализируй этот текст. Определи, какие темы/события чаще всего вызывают негативные эмоции, а какие — позитивные.
Дай краткий список:
- Что чаще всего портит настроение?
- Что улучшает?
А также дай короткие рекомендации по улучшению эмоционального состояния.

Текст:
${combinedText}
  `.trim();

  try {
    const aiResponse = await ChutesClient.post('/chat/completions', {
      model: process.env.CHUTES_MODEL || 'Qwen/Qwen2.5-VL-32B-Instruct',
      temperature: 0.6,
      max_tokens: 700,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Отвечай только на русском языке.' },
        { role: 'user', content: aiPrompt }
      ]
    });

    const content = aiResponse.data.choices[0].message.content;
    res.json({
      success: true,
      analysis: JSON.parse(content)
    });

  } catch (error) {
    console.error("Ошибка при генерации эмоциональных паттернов:", error.message || error);
    res.status(500).json({
      success: false,
      message: "Не удалось выполнить анализ"
    });
  }
}
