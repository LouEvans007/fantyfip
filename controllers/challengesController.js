// backend/controllers/challengesController.js
import AnalysisUsage            from '../models/analysisUsageModel.js';
import JournalEntry             from '../models/journalEntryModel.js';
import { ChutesClient }         from '../utils/chutesClient.js';
import { isStandardLimited }    from '../utils/planHelpers.js';
import { LIMITS }               from '../utils/limits.js';

/* ------------------------------------------------------------------ */
/*  Константы                                                         */
/* ------------------------------------------------------------------ */
const STD_DAY_LIMIT   = LIMITS.challenges.standard.count;   // 3
const STD_PERIOD_MS   = LIMITS.challenges.standard.per;     // 24 h
const MODEL_FALLBACK  = 'Qwen/Qwen2.5-VL-32B-Instruct';
const MAX_JOURNAL_ENTRIES = 40;

/* ISO‑дата вида YYYY‑MM‑DD &rarr; ключ “ch‑YYYY‑MM‑DD” */
const dayKey = (d = new Date()) => `ch-${d.toISOString().slice(0, 10)}`;

/* ------------------------------------------------------------------ */
/*  GET /api/analysis/challenges                                       */
/* ------------------------------------------------------------------ */
export async function getGuidedChallenges(req, res) {
  const { id: userId, effectivePlan } = req.user;
  const stdLimited = isStandardLimited(effectivePlan);
  const key        = dayKey();

  /* ---------- 1. Лимит Standard‑тарифа ---------- */
  if (stdLimited) {
    const usage = await AnalysisUsage.findOne({ userId, monthKey: key });
    if (usage?.usedCount >= STD_DAY_LIMIT) {
      return res.status(429).json({
        message: `Достигнут дневной лимит ${STD_DAY_LIMIT} генераций челленджей`
      });
    }
  }

  /* ---------- 2. Берём последние записи дневника ---------- */
  const entries = await JournalEntry.find({ userId })
    .sort({ date: -1 })
    .limit(MAX_JOURNAL_ENTRIES)
    .select('content');

  if (!entries.length) {
    return res.status(400).json({ message: 'Недостаточно записей для генерации челленджей' });
  }

  const diaryText = entries.map(e => e.content).join('\n');

  /* ---------- 3. Собираем prompt для LLM ---------- */
  const userPrompt = `
Ниже даны записи дневника пользователя (русский язык).
Предложи **ровно три** коротких персональных челленджа, которые помогут улучшить эмоциональное состояние.
Верни ТОЛЬКО валидный JSON‑массив без пояснений. Формат каждого элемента:

{
  "title":        "Короткий заголовок (&le; 6 слов)",
  "description":  "Описание действия (&le; 25 слов)"
}

Записи:
${diaryText}`.trim();

  /* ---------- 4. Запрос к Chutes.ai ---------- */
  try {
    const { data } = await ChutesClient.post('/chat/completions', {
      model: process.env.CHUTES_MODEL || MODEL_FALLBACK,
      temperature: 0.6,
      max_tokens: 400,
      timeout: Number(process.env.CHUTES_TIMEOUT ?? 120_000),
      messages: [
        {
          role: 'system',
          content:
            'Ты коуч по эмоциональному благополучию. Отвечай ТОЛЬКО на русском. ' +
            'Верни исключительно JSON без Markdown и дополнительных комментариев.'
        },
        { role: 'user', content: userPrompt }
      ]
      // response_format опускаем — ожидаем массив, а не объект
    });

    /* ---------- 5. Парсим ответ ---------- */
    let raw = (data.choices?.[0]?.message?.content ?? '').trim();
    raw = raw.replace(/^\s*```(?:json)?|```\s*$/gi, '').trim();      // убираем ```json … ```
    let challenges;

    try {
      challenges = JSON.parse(raw);
    } catch {
      // пытаемся вырезать JSON‑массив из произвольного текста
      const first = raw.indexOf('[');
      const last  = raw.lastIndexOf(']');
      if (first !== -1 && last !== -1 && last > first) {
        challenges = JSON.parse(raw.slice(first, last + 1));
      } else {
        throw new Error('Не удалось извлечь JSON‑массив из ответа LLM');
      }
    }

    if (!Array.isArray(challenges) || challenges.length === 0) {
      throw new Error('JSON не содержит массив челленджей');
    }

    /* ---------- 6. Фиксируем расход лимита ---------- */
    if (stdLimited) {
      await AnalysisUsage.findOneAndUpdate(
        { userId, monthKey: key },
        { $inc: { usedCount: 1 } },
        { upsert: true }
      );
    }

    return res.json({ success: true, data: challenges });
  } catch (err) {
    console.error('[GuidedChallenges] parse fail &rarr; fallback:', err.message || err);

    /* ---------- 7. Fallback, чтобы фронт не упал ---------- */
    const fallback = [
      {
        title: '10‑минутная медитация',
        description: 'Каждый день уделите 10 минут осознанному дыханию.'
      },
      {
        title: 'Дневник благодарности',
        description: 'Запишите три вещи, за которые благодарны сегодня.'
      },
      {
        title: 'Прогулка офлайн',
        description: '30 минут пешком без телефона и наушников.'
      }
    ];

    if (stdLimited) {
      await AnalysisUsage.findOneAndUpdate(
        { userId, monthKey: key },
        { $inc: { usedCount: 1 } },
        { upsert: true }
      );
    }

    return res.json({ success: true, data: fallback, fallback: true });
  }
}
