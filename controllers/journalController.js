// backend/controllers/journalController.js
import JournalEntry from "../models/journalEntryModel.js";
import User from "../models/userModel.js";
import { ChutesClient } from '../utils/chutesClient.js';
import sanitize from '../utils/sanitizeEntry.js';
import { llmQueue } from '../utils/llmQueue.js';
import JSON5 from 'json5/lib/index.js';

/* ========================================================================= */
/*  1. — Journal CRUD                                                        */
/* ========================================================================= */

export const getJournalEntries = async (req, res) => {
  try {
    const entries = await JournalEntry.find({ userId: req.user.id }).sort({ date: -1 });
    res.status(200).json(entries);
  } catch (err) {
    console.error("Error fetching journal entries:", err);
    res.status(500).json({ message: "Не удалось загрузить данные" });
  }
};

export const getJournalEntry = async (req, res) => {
  try {
    const entry = await JournalEntry.findOne({ _id: req.params.id, userId: req.user.id });
    if (!entry) return res.status(404).json({ message: "Запись не найдена" });
    res.status(200).json(entry);
  } catch (err) {
    console.error("Error fetching journal entry:", err);
    res.status(500).json({ message: "Не удалось загрузить данные" });
  }
};

export const createJournalEntry = async (req, res) => {
  try {
    const { content, mood, tags } = req.body;
    const entry = await JournalEntry.create({
      userId: req.user.id,
      content,
      mood,
      tags
    });

    await llmQueue.add('analyze', { entryId: entry._id });

    await updateStreak(req.user.id);
    const userStreak = await User.findById(req.user.id).select("currentStreak longestStreak");

    res.status(201).json({
      entry,
      streak: {
        current: userStreak.currentStreak,
        longest: userStreak.longestStreak
      }
    });
  } catch (err) {
    console.error("Error creating journal entry:", err);
    res.status(500).json({ message: "Не удалось создать запись" });
  }
};

export const updateJournalEntry = async (req, res) => {
  try {
    const { content, mood, tags } = req.body;
    const entry = await JournalEntry.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { content, mood, tags },
      { new: true }
    );
    if (!entry) return res.status(404).json({ message: "Запись не найдена" });

    await llmQueue.add('analyze', { entryId: entry._id });

    res.status(200).json(entry);
  } catch (err) {
    console.error("Error updating journal entry:", err);
    res.status(500).json({ message: "Не удалось обновить запись" });
  }
};

export const deleteJournalEntry = async (req, res) => {
  try {
    const entry = await JournalEntry.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!entry) return res.status(404).json({ message: "Запись не найдена" });
    res.status(200).json({ message: "Запись успешно удалена" });
  } catch (err) {
    console.error("Error deleting journal entry:", err);
    res.status(500).json({ message: "Не удалось удалить запись" });
  }
};

/* ========================================================================= */
/*  2. — Insights, word-cloud и т. д.                                         */
/* ========================================================================= */

export const getJournalInsights = async (req, res) => {
  try {
    const entries = await JournalEntry.find({ userId: req.user.id });
    if (entries.length === 0) {
      return res.status(200).json({
        moodDistribution: [],
        moodTrend: [],
        commonPatterns: [],
        unprocessedCount: 0
      });
    }

    let moodDistribution = await JournalEntry.aggregate([
      { $match: { userId: req.user.id } },
      { $group: { _id: "$mood.label", count: { $sum: 1 } } },
      { $match: { _id: { $ne: null } } }
    ]);

    if (moodDistribution.length === 0) {
      const moodCounts = {
        "Very Negative": 0,
        "Negative": 0,
        "Neutral": 0,
        "Positive": 0,
        "Very Positive": 0
      };
      entries.forEach(entry => {
        if (!entry.mood || !entry.mood.score) return;
        const score = entry.mood.score;
        if (score <= 2) moodCounts["Very Negative"]++;
        else if (score <= 4) moodCounts["Negative"]++;
        else if (score <= 6) moodCounts["Neutral"]++;
        else if (score <= 8) moodCounts["Positive"]++;
        else moodCounts["Very Positive"]++;
      });
      moodDistribution = Object.entries(moodCounts)
        .filter(([_, count]) => count > 0)
        .map(([label, count]) => ({ _id: label, count }));
    }

    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const moodTrend = await JournalEntry.find({
      userId: req.user.id,
      date: { $gte: twoWeeksAgo }
    })
      .sort({ date: 1 })
      .select("date mood.score");

    const commonPatterns = await JournalEntry.aggregate([
      { $match: { userId: req.user.id, "analysis.processed": true } },
      { $unwind: { path: "$analysis.identifiedPatterns", preserveNullAndEmptyArrays: false } },
      { $group: { _id: "$analysis.identifiedPatterns", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);

    const unprocessedCount = await JournalEntry.countDocuments({
      userId: req.user.id,
      "analysis.processed": { $ne: true }
    });

    res.status(200).json({
      moodDistribution,
      moodTrend,
      commonPatterns,
      unprocessedCount
    });
  } catch (err) {
    console.error("Error generating journal insights:", err);
    res.status(500).json({ message: "Failed to generate journal insights" });
  }
};

export const reprocessJournalEntries = async (req, res) => {
  try {
    const entries = await JournalEntry.find({
      userId: req.user.id,
      "analysis.processed": { $ne: true }
    });
    if (entries.length === 0) {
      return res.status(200).json({
        message: "Нет записей для обработки",
        processedCount: 0
      });
    }
    let processedCount = 0;
    const entriesToProcess = entries.slice(0, 10); // limit to avoid timeout
    for (const entry of entriesToProcess) {
      try {
        await llmQueue.add('analyze', { entryId: entry._id });
        processedCount++;
      } catch (error) {
        console.error(`Error processing entry ${entry._id}:`, error);
      }
    }
    const remainingCount = entries.length - processedCount;
    res.status(200).json({
      message: `Успешно обработано ${processedCount} заметок`,
      processedCount,
      remainingCount
    });
  } catch (err) {
    console.error("Error reprocessing journal entries:", err);
    res.status(500).json({ message: "Failed to reprocess journal entries" });
  }
};

export const reprocessSingleEntry = async (req, res) => {
  try {
    const entry = await JournalEntry.findOne({ _id: req.params.id, userId: req.user.id });
    if (!entry) return res.status(404).json({ message: "Запись не найдена" });

    await llmQueue.add('analyze', { entryId: entry._id });

    res.status(200).json({
      message: "Journal entry analysis started",
      entryId: entry._id
    });
  } catch (err) {
    console.error("Error reprocessing journal entry:", err);
    res.status(500).json({ message: "Failed to reprocess journal entry" });
  }
};

/* ========================================================================= */
/*  3. — Вспомогательные функции                                             */
/* ========================================================================= */

async function updateStreak(userId) {
  const user = await User.findById(userId);
  if (!user) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const last = user.lastEntryDate ? new Date(user.lastEntryDate) : null;
  const diffDays = last ? Math.round((today - last) / 864e5) : null;

  if (diffDays === 1) {
    user.currentStreak += 1;
  } else if (diffDays > 1 || diffDays === null) {
    user.currentStreak = 1;
  }

  user.lastEntryDate = today;

  if (user.currentStreak > user.longestStreak) {
    user.longestStreak = user.currentStreak;
  }

  await user.save();
}

/**
 * Анализирует запись через Chutes.ai — модель Qwen, ответ на русском
 */
export async function processEntryWithLLM(entryId) {
  try {
    const entry = await JournalEntry.findById(entryId);
    if (!entry) return;

    const sanitizedContent = sanitize(entry.content).slice(0, 4_000);

    const { data: completion } = await ChutesClient.post('/chat/completions', {
      model: process.env.CHUTES_MODEL || "Qwen/Qwen2.5-VL-32B-Instruct",
      temperature: 0.7,
      max_tokens: 512, // уменьшено с 1024 → 900 (~4KB JSON)
      stream: false,
      response_format: { type: "json_object" }, // ← главный параметр
      messages: [
        {
          role: "system",
          content: `
Ты — заботливый психолог‑друг.
Отвечай только на русском языке как живой, дружелюбный человек. Стиль - неформальный, теплый, с сочувствием, юмором или иронией, как будто пишет друг. Не пиши как робот или учитель.
Верни ТОЛЬКО JSON с ключами:
  • supportiveResponse  — тёплый отклик (<= 100 слов)
  • identifiedPatterns  — массив до 3 негативных мыслительных паттернов
  • suggestedStrategies — массив из 2‑3 практических стратегий
Без markdown, без форматирования.
`.trim()
        },
        {
          role: "user",
          content: buildPrompt(sanitizedContent)
        }
      ]
    });

const raw = completion.choices[0].message.content;
const analysis = safeParseJSON(raw);

await JournalEntry.findByIdAndUpdate(entryId, {
  analysis: { ...analysis, processed: true }
});
} catch (err) {
console.error("LLM processing error:", err);

await JournalEntry.findByIdAndUpdate(entryId, {
  analysis: {
    supportiveResponse: "Спасибо, что делитесь своими мыслями. Я здесь, чтобы поддержать вас.",
    identifiedPatterns: ["Не удалось проанализировать запись"],
    suggestedStrategies: ["Попробуйте вернуться позже и переформулировать мысли."],
    processed: true
  }
});
}
}

function buildPrompt(content) {
return `
Ниже приведена запись дневника пользователя.
ENTRY:
"${content}"

Пожалуйста, предоставь:
1. Поддерживающий ответ (max 100 слов, русский)
2. Выдели до 3 негативных паттернов
3. Предложи 2‑3 стратегии/перспективы

Верни ТОЛЬКО чистый JSON без пояснений:
{
  "supportiveResponse": "Поддерживающий текст",
  "identifiedPatterns": ["паттерн 1", "паттерн 2"],
  "suggestedStrategies": ["стратегия 1", "стратегия 2"]
}
`.trim();
}

// ✅ Новая безопасная функция парсинга через JSON5
function safeParseJSON(text) {
try {
  // 🧹 Чистим строку и извлекаем только JSON
  const cleaned = text
    .replace(/^.*?(\{(?:.|\n)*?\}).*$/s, '$1') // берём только JSON
    .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":') // правильные ключи
    .replace(/,\s*([\]}])/g, '$1') // убираем последнюю запятую
    .replace(/'/g, '"') // меняем одинарные кавычки на двойные
    .trim();

  // 🛠 Проверяем, есть ли хотя бы начало JSON
  if (!cleaned || !cleaned.startsWith('{')) {
    throw new Error('Неверный формат JSON');
  }

  // ✅ Парсим через JSON5
  return JSON5.parse(cleaned);
} catch (err) {
  console.error("❌ Не удалось спарсить JSON от ИИ:", err.message);
  console.log("👉 Сырой ответ:\n", text);

  // 💬 Резервный ответ
  return {
    supportiveResponse: "Спасибо, что делитесь своими мыслями. Я здесь, чтобы поддержать вас.",
    identifiedPatterns: ["Не удалось проанализировать запись"],
    suggestedStrategies: ["Попробуйте вернуться позже и переформулировать мысли."],
    processed: true
  };
}
}
