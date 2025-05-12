// backend/controllers/analysis/growthController.js
import JournalEntry  from '../../models/journalEntryModel.js';
import GrowthCache   from '../../models/growthCacheModel.js';
import { ChutesClient } from '../../utils/chutesClient.js';
import { LIMITS }       from '../../utils/limits.js';
import { jsonrepair }   from 'jsonrepair';          // &larr; новый импорт

/* ------------------------------------------------------------------ */
/*  Вспомогательные утилиты                                           */
/* ------------------------------------------------------------------ */

const MODEL_FALLBACK = 'Qwen/Qwen2.5-VL-32B-Instruct';

/* дата‑граница */
const sinceDate = (period) => {
  const d = new Date();
  switch (period) {
    case 'week':  d.setDate(d.getDate() - 7);  break;
    case 'month': d.setMonth(d.getMonth() - 1); break;
    case 'year':  d.setFullYear(d.getFullYear() - 1); break;
    case 'all':   d.setTime(0); break;
  }
  return d;
};

/* — сколько записей &laquo;резюмируем&raquo; локально — */
const summaryLimit = (period, prem) =>
  !prem ? 20 : { week: 50, month: 80, year: 120, all: 150 }[period] ?? 50;

/* — лимит токенов ответа — */
const tokenLimit = (period, prem) =>
  !prem ? 700 : { week: 1200, month: 1500, year: 1800, all: 1800 }[period] ?? 1200;

/* Сокращаем записи до короткой сводки */
function buildSummary(entries, lim) {
  return entries.slice(-lim).map(e => {
    const text = e.content.length > 300 ? e.content.slice(0, 300) + '…' : e.content;
    return `• ${e.date.toISOString().slice(0,10)} (score ${e.mood?.score ?? 'n/a'}) — ${text}`;
  }).join('\n');
}

/* Надёжный парсер: JSON.parse &rarr; jsonrepair &rarr; извлечение {...} / [...] */
function safeJSON(raw) {
  raw = raw.trim().replace(/^\s*```(?:json)?|```\s*$/gi, '').trim();
  try {
    return JSON.parse(raw);
  } catch { /* ignore */ }

  /* jsonrepair чинит кавычки, лишние запятые и т.п. */
  try {
    return JSON.parse(jsonrepair(raw));
  } catch { /* ignore */ }

  /* последний шанс — вырезать самый длинный {...} или [...] */
  const m = raw.match(/(\{[\s\S]+\}|$$[\s\S]+$$)/);
  if (m) {
    try { return JSON.parse(jsonrepair(m[0])); } catch { /* ignore */ }
  }
  throw new Error('Failed to extract JSON');
}

/* ------------------------------------------------------------------ */
/*  GET /api/analysis/growth                                          */
/* ------------------------------------------------------------------ */
export async function getGrowthReport(req, res) {
  const plan      = req.user.plan.toLowerCase();                 // basic|standard|premium
  const period    = (req.query.period || 'week').toLowerCase();  // week|month|year|all
  const force     = req.query.force === 'true';

  if (plan === 'basic')
    return res.status(403).json({ message: 'Функция доступна на тарифах Standard и Premium' });
  if (plan === 'standard' && period !== 'week')
    return res.status(403).json({ message: 'Standard: анализ только за 7 дней' });

  const cacheKey = { userId: req.user.id, timeframe: period };
  const cached   = await GrowthCache.findOne(cacheKey);

  if (plan === 'standard' && cached && !force) {
    const fresh = Date.now() - cached.generatedAt < LIMITS.growth.standard.per;
    if (fresh) {
      return res.json({
        success      : true,
        data         : cached.data,
        cached       : true,
        generatedAt  : cached.generatedAt,
        nextAllowedAt: new Date(cached.generatedAt.getTime() + LIMITS.growth.standard.per)
      });
    }
  }

  /* ---------- собираем записи ---------- */
  const since      = sinceDate(period);
  const premium    = plan === 'premium';
  const entries    = await JournalEntry.find({ userId: req.user.id, date: { $gte: since } })
                                       .sort({ date: 1 }).lean();

  const minN = premium ? 2 : 3;
  if (entries.length < minN)
    return res.status(400).json({ message:`Нужно минимум ${minN} записи для анализа` });

  const summary = buildSummary(entries, summaryLimit(period, premium));

  const prompt = premium ? fullPrompt(summary) : litePrompt(summary);

  /* ---------- запрос к LLM ---------- */
  try {
    const { data: completion } = await ChutesClient.post('/chat/completions', {
      model: premium
        ? process.env.CHUTES_MODEL_PRO || process.env.CHUTES_MODEL || MODEL_FALLBACK
        : process.env.CHUTES_MODEL     || MODEL_FALLBACK,
      temperature: 0.6,
      max_tokens : tokenLimit(period, premium),
      response_format : { type:'json_object' },     // просим строгий JSON
      messages: [
        { role:'system', content:'Ты психолог‑коуч. Ответ ‑ ТОЛЬКО JSON на русском.' },
        { role:'user',   content: prompt }
      ],
      timeout: Number(process.env.CHUTES_TIMEOUT ?? 120_000)
    });

    const raw  = completion.choices[0]?.message?.content || '{}';
    const json = safeJSON(raw);

    if (!Array.isArray(json.moodTrend)) {
      json.moodTrend = entries.map(e => ({
        date : e.date.toISOString().slice(0,10),
        score: e.mood?.score ?? null
      }));
    }

    const generatedAt = new Date();
    await GrowthCache.findOneAndUpdate(
      cacheKey,
      { data: json, generatedAt },
      { upsert: true }
    );

    return res.json({
      success : true,
      data    : json,
      cached  : false,
      generatedAt,
      nextAllowedAt: plan === 'standard'
        ? new Date(generatedAt.getTime() + LIMITS.growth.standard.per)
        : null
    });

  } catch (err) {
    console.error('[GrowthReport] error:', err.message || err);
    res.status(500).json({ success:false, message:'Не удалось выполнить анализ' });
  }
}

/* ------------------------------------------------------------------ */
/*  Prompt‑шаблоны                                                    */
/* ------------------------------------------------------------------ */
function litePrompt(summary) {
  return `
Проанализируй сводку дневника за 7 дней и верни JSON:
{
  "progress"       : "3–4 предложения об улучшениях",
  "areasToImprove" : ["…", "…"],
  "nextStep"       : "Короткая рекомендация"
}

Сводка:
${summary}`.trim();
}

function fullPrompt(summary) {
  return `
Ты — опытный коуч‑психотерапевт. Проанализируй сводку и верни JSON:
{
  "progress"       : "Абзац о положительных изменениях",
  "areasToImprove" : ["…", "…", "…"],
  "nextStep"       : "Один практический шаг",
  "moodTrend"      : [{ "date":"YYYY-MM-DD", "score":1-10 }, …],
  "topEmotions"    : ["эмоция 1", "эмоция 2", "эмоция 3"]
}

Сводка:
${summary}`.trim();
}
