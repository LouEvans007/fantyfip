// backend/utils/sanitizeEntry.js
import DOMPurify from 'isomorphic-dompurify'; // безопасная очистка HTML

/* ─── Регулярные выражения ──────────────────────────────────────────────
   MD_IMAGE_RE  — полностью удаляем ![alt](url)
   MD_LINK_RE   — оставляем только &laquo;текст&raquo; из [текст](url)                */
const MD_IMAGE_RE = /!$$[^$$]*]$[^)]*$/g;
const MD_LINK_RE  = /$$([^$$]+)]$[^)]*$/g;

export default function sanitizeEntry(text) {
  if (typeof text !== 'string') return '';

  /* 1. Ограничиваем размер входа (10 000 символов) */
  text = text.slice(0, 10_000);

  /* 2. Удаляем блоки кода  ``` … ```  и  ~~~ … ~~~ */
  text = text.replace(/(```|~~~)[\s\S]*?\1/g, '');

  /* 3. Чистим HTML/JS-теги */
  text = DOMPurify.sanitize(text, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });

  /* 4. Удаляем лишнее markdown-форматирование */
  text = text
    .replace(/\n#+\s.*$/gm, '')                       // # Заголовки
    .replace(/\n-{3,}\s*$/gm, '')                     // --- разделители
    .replace(/(?:^|\s)[*_]{1,2}[^*_]+[*_]{1,2}/g, '') // *курсив* **жирный**
    .replace(/(?:^|\s)`{1,2}[^`]+`{1,2}/g, '')        // `inline code`
    .replace(/^>\s.*$/gm, '')                         // > цитаты
    .replace(/^\d+\.\s.*$/gm, '')                     // 1. списки
    .replace(/^[-*+]\s.*$/gm, '');                    // - списки

  /* 5. Удаляем markdown-изображения */
  text = text.replace(MD_IMAGE_RE, '');

  /* 6. Превращаем markdown-ссылки в чистый текст */
  text = text.replace(MD_LINK_RE, '$1');

  /* 7. Удаляем e-mail-ы и телефоны (PII) */
  text = text
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]')
    .replace(/(\+?\d[\d\s().-]{6,}\d)/g, '[phone]');

  /* 8. Блокируем типичные prompt-инъекции */
  text = text.replace(
    /\b(ignore|override|disregard|forget)(\s+(all|previous|earlier))?(\s+instructions|commands|prompts)\b/gi,
    ''
  );

  /* 9. Удаляем потенциально опасные символы */
  text = text.replace(/[{}$`]/g, '');

  /* 10. Нормализуем пробелы */
  return text.replace(/\s+/g, ' ').trim();
}
