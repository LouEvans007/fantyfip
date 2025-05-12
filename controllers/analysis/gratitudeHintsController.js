// backend/controllers/analysis/gratitudeHintsController.js

import GratitudeEntry from '../../models/gratitudeEntryModel.js';
import { ChutesClient } from '../../utils/chutesClient.js';

/**
 * GET /api/analysis/gratitude-hints
 * - Извлекает записи благодарности пользователя
 * - Передаёт их AI для анализа
 * - Возвращает подсказки: что вдохновляет, короткие рекомендации
 */
export async function getGratitudeHints(req, res) {
  const userId = req.user.id;

  // Берём последние 20 записей благодарности
  const gratitudeEntries = await GratitudeEntry
    .find({ userId })
    .sort({ day: -1 }) // дата в формате YYYY-MM-DD (UTC)
    .limit(20);

  if (!gratitudeEntries.length) {
    return res.json({ success: true, hints: 'Пока нет благодарностей' });
  }

  // Собираем всё содержимое из entries[].content в один текст
  const allGratitudeText = gratitudeEntries
    .flatMap(g => g.entries.map(e => e.content))
    .join('\n');

  const prompt = `
Проанализируй эти благодарности. Найди общие темы и дай короткие подсказки, что вдохновляет пользователя.

Текст:
${allGratitudeText}
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
    res.json({ success: true, hints: content });

  } catch (error) {
    console.error("Ошибка при генерации подсказок благодарности:", error.message || error);
    res.status(500).json({
      success: false,
      message: "Не удалось сгенерировать подсказки"
    });
  }
}
