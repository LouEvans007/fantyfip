// backend/controllers/gratitudeController.js
import GratitudeEntry from '../models/gratitudeEntryModel.js';

/* ========================================================================== */
/*  ⚙️  ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ                                                */
/* ========================================================================== */

/**
 * Преобразует объект Date &rarr; строку календарного дня **в UTC**: YYYY-MM-DD.
 * Используем один-единственный формат везде, чтобы исключить проблемы
 * с часовыми поясами и дубликатами записей.
 */
const toDayString = (date = new Date()) => {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/**
 * Формирует массив строк-дней за `n` последних дней, включая сегодня.
 * Например, при `n = 7` вернёт 7 элементов – сегодня и 6 предыдущих.
 */
const buildRecentDayRange = (n = 7) => {
  const days = [];
  const todayUTC = new Date();                                    // уже в UTC
  todayUTC.setUTCHours(0, 0, 0, 0);                               // обнуляем
  for (let i = 0; i < n; i++) {
    const d = new Date(todayUTC);
    d.setUTCDate(d.getUTCDate() - i);
    days.push(toDayString(d));
  }
  return days;
};

/* ========================================================================== */
/*  📥  СОХРАНИТЬ / ОБНОВИТЬ ЗАПИСЬ                                            */
/* ========================================================================== */

export const createOrUpdateGratitude = async (req, res) => {
  try {
    const { entries } = req.body;

    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ message: 'Требуется хотя бы одна запись благодарности' });
    }

    const formattedEntries = entries.map(content => ({ content }));
    const day = toDayString();                                     // &larr; всегда UTC

    const updatedEntry = await GratitudeEntry.findOneAndUpdate(
      { userId: req.user.id, day },
      {
        $set:   { entries: formattedEntries },
        $setOnInsert: { date: new Date() }                         // дата создания (meta)
      },
      { new: true, upsert: true }
    );

    res.status(200).json(updatedEntry);
  } catch (error) {
    console.error('Ошибка при сохранении записи благодарности:', error);
    res.status(500).json({ message: 'Не удалось сохранить запись благодарности' });
  }
};

/* ========================================================================== */
/*  📤  ПОЛУЧИТЬ СЕГОДНЯШНИЕ ЗАПИСИ                                            */
/* ========================================================================== */

export const getTodaysGratitude = async (req, res) => {
  try {
    const day = toDayString();

    const gratitudeEntry = await GratitudeEntry.findOne({
      userId: req.user.id,
      day
    });

    res.status(200).json(gratitudeEntry || { entries: [] });
  } catch (error) {
    console.error('Ошибка при получении благодарностей за сегодня:', error);
    res.status(500).json({ message: 'Не удалось загрузить благодарности за сегодня' });
  }
};

/* ========================================================================== */
/*  📤  ПОЛУЧИТЬ ЗАПИСИ ЗА ПОСЛЕДНИЕ 7 ДНЕЙ                                    */
/* ========================================================================== */

export const getRecentGratitude = async (req, res) => {
  try {
    // Последние 7 календарных дней в UTC-строках
    const lastSevenDays = buildRecentDayRange(7);

    const gratitudeEntries = await GratitudeEntry.find({
      userId: req.user.id,
      day: { $in: lastSevenDays }
    }).sort({ day: -1 });                                           // свежие первыми

    res.status(200).json(gratitudeEntries);
  } catch (error) {
    console.error('Ошибка при получении недавних благодарностей:', error);
    res.status(500).json({ message: 'Не удалось загрузить недавние благодарности' });
  }
};

/* ========================================================================== */
/*  🏁  ЭКСПОРТ                                                                */
/* ========================================================================== */

export default {
  getTodaysGratitude,
  getRecentGratitude,
  createOrUpdateGratitude
};
