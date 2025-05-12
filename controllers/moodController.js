// backend/controllers/moodController.js

import JournalEntry from '../models/journalEntryModel.js';
import { removeStopwords, eng } from 'stopword'; // библиотека для стоп-слов

/* ========================================================================= */
/*  ⚙️  Вспомогательные данные                                               */
/* ========================================================================= */

/** Русские стоп-слова (дополняют стандартный английский список) */
const ruStopWords = [
  'и', 'в', 'на', 'к', 'о', 'а', 'но', 'что', 'его', 'она',
  'мы', 'вы', 'их', 'них', 'с', 'за', 'по', 'от', 'у',
  'бы', 'же', 'ни', 'ли', 'или', 'либо', 'то', 'тот', 'та', 'те',
  'там', 'того', 'той', 'этот', 'эти', 'так', 'такой',
  'такая', 'такие', 'вот', 'сейчас', 'тогда', 'только',
  'уже', 'ещё', 'никогда', 'всегда', 'иногда', 'часто',
  'редко', 'немного', 'очень', 'слишком', 'почти', 'вообще',
  'конечно', 'может', 'нужно', 'можно', 'следует', 'должен',
  'хотеть', 'надо', 'быть', 'есть', 'идти', 'ехать', 'смотреть', 'говорить'
];

/** Эмоционально окрашенные слова — будут выделены на фронтенде */
const emotionWords = [
  // Положительные
  'радость', 'счастье', 'энергия', 'удовлетворение', 'спокойствие', 'благодарность',
  'оптимизм', 'доверие', 'вдохновение', 'гордость', 'надежда', 'успех', 'уверенность',
  'победа', 'удивление',

  // Отрицательные
  'печаль', 'гнев', 'страх', 'тревога', 'разочарование', 'боль', 'стресс',
  'перегрузка', 'злость', 'вина', 'неуверенность', 'одиночество', 'утомление',
  'износ', 'непонимание', 'потеря', 'траур',

  // Нейтральные / смешанные
  'сомнение', 'странность', 'нейтрально', 'интересно', 'задумчиво',
  'воспоминания', 'смешанные чувства'
];

/* ========================================================================= */
/*  📊  Word-cloud по записям журнала                                         */
/* ========================================================================= */

export const getWordCloudData = async (req, res) => {
  const rawTimeframe = req.query.timeframe ?? 'all';   // &larr; единое значение по умолчанию
  const timeframe = rawTimeframe.toLowerCase();        // унифицируем регистр

  console.log(`[WordCloud] user=${req.user.id} timeframe=${timeframe}`);

  try {
    /* ---------- 1. Определяем границу дат ---------- */
    let startDate = new Date(0); // 'all' → с самого начала
    const now = new Date();

    switch (timeframe) {
      case 'week':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
        break;
      case 'twoweeks':
      case 'twoWeeks':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 14);
        break;
      case 'month':
        startDate = new Date(now);
        startDate.setMonth(now.getMonth() - 1);
        break;
      case 'year':
        startDate = new Date(now);
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      case 'all':
        // оставляем startDate = 1970-01-01
        break;
      default:
        console.warn(`[WordCloud] неизвестный timeframe "${rawTimeframe}", использовано 'all'`);
        break;
    }

    /* ---------- 2. Достаём записи из Mongo ---------- */
    const entries = await JournalEntry.find({
      userId: req.user.id,
      date: { $gte: startDate }
    }).select('content mood analysis.identifiedPatterns');

    if (entries.length === 0) return res.status(200).json([]);

    /* ---------- 3. Обрабатываем текст — теперь все слова проходят через облако ---------- */
    const allContent = entries.map(e => e.content).join(' ');

    const tokens = allContent
      .toLowerCase()
      .replace(/[^a-zа-яё0-9]+/gi, ' ')
      .replace(/\s+/g, ' ')
      .split(' ')
      .filter(w => w.length > 2);

    /* Remove stop-words, но оставляем эмоционально окрашенные слова */
    const filtered = removeStopwords(tokens, [...eng, ...ruStopWords]).filter(w => w && w.length > 2);

    /* Добавляем ярлык настроения и шаблоны анализа в массив слов */
    entries.forEach(({ mood, analysis }) => {
      if (mood?.label) {
        filtered.push(...Array(3).fill(mood.label.toLowerCase())); // усиливаем вес ярлыка
      }
      if (Array.isArray(analysis?.identifiedPatterns)) {
        analysis.identifiedPatterns.forEach(p => {
          filtered.push(
            ...p.toLowerCase()
               .replace(/[^a-zа-яё0-9]+/gi, ' ')
               .split(' ')
               .filter(w => w.length > 2)
          );
        });
      }
    });

    /* ---------- 4. Подсчитываем частоты ---------- */
    const freq = filtered.reduce((acc, w) => {
      acc[w] = (acc[w] || 0) + 1;
      return acc;
    }, {});

    const wordCloudData = Object.entries(freq)
      .map(([text, value]) => ({ text, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 100); // top-100

    return res.status(200).json(wordCloudData);
  } catch (err) {
    console.error('[WordCloud] error:', err);
    res.status(500).json({ message: 'Не удалось сформировать данные облака слов' });
  }
};
