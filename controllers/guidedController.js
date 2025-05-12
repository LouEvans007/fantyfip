// backend/controllers/guidedController.js
import Template from '../models/templateModel.js';
import JournalEntry from '../models/journalEntryModel.js';

/**
 * GET /api/journaling/templates
 * - Standard: 5 штук, Premium: все
 */
export async function listTemplates(req, res) {
  const all = await Template.find().sort({ order: 1 });
  if (req.user.plan === 'premium') {
    return res.json(all);
  }
  // standard &rarr; 5 шт
  res.json(all.slice(0, 5));
}

/**
 * POST /api/journaling/entry-from-template
 * body: { templateId, answers: {...} }
 */
export async function createFromTemplate(req, res) {
  const { templateId, answers } = req.body;
  const tmpl = await Template.findById(templateId);
  if (!tmpl) return res.status(404).json({ message:'Template not found' });

  // форматируем контент для дневника
  const content = `Упражнение "${tmpl.title}"\n\n${JSON.stringify(answers, null, 2)}`;

  const entry = await JournalEntry.create({
    userId: req.user.id,
    mood: { score: null }, // пусть пользователь вручную поставит?
    content,
    date: new Date(),
  });

  res.json({ success: true, entry });
}
