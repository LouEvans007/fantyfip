// backend/utils/chutesClient.js

import axios from 'axios';
import axiosRetry from 'axios-retry'; // для автоматических повторных попыток
import Bottleneck from 'bottleneck';  // для rate-limiting

/* ------------------------------------------------------------------ */
/*  1. Axios-инстанс для Chutes.ai                                   */
/* ------------------------------------------------------------------ */

const chutes = axios.create({
  baseURL: 'https://llm.chutes.ai/v1',
  headers: {
    Authorization: `Bearer ${process.env.CHUTES_API_KEY}`,
    'Content-Type': 'application/json'
  },
  timeout: Number(process.env.CHUTES_TIMEOUT ?? 120_000) // ms (default: 120_000)
});

// Настройка ретриев
axiosRetry(chutes, {
  retries: 2,
  retryCondition: (error) =>
    error.code === 'ECONNABORTED' || axiosRetry.isNetworkOrIdempotentRequestError(error),
  retryDelay: axiosRetry.exponentialDelay
});

/* ------------------------------------------------------------------ */
/*  2. Rate-limiter (тот же профиль, что был для OpenRouter)          */
/* ------------------------------------------------------------------ */

const limiter = new Bottleneck({
  reservoir: 10,                    // 10 запросов
  reservoirRefreshAmount: 10,       // каждые …
  reservoirRefreshInterval: 10_000, // … 10 секунд
  maxConcurrent: 2,                 // не более 2 одновременных
  minTime: 1000,                    // ≥ 1 сек между запросами
  highWater: 100,
  strategy: Bottleneck.strategy.OVERFLOW
});

limiter.on('error', (e) => console.error('[Limiter] error:', e.message));
limiter.on('overload', () => console.warn('[Limiter] overload – задачи отброшены'));

/* ------------------------------------------------------------------ */
/*  3. Тонкая обёртка → совместима с ORClient API                     */
/* ------------------------------------------------------------------ */

function createCompletion(options) {
  return limiter.schedule(() =>
    chutes
      .post('/chat/completions', {
        ...options,
        response_format: { type: 'json_object' }, // ← требуем "чистый" JSON
        max_tokens: 512,                          // ← уменьшаем max_tokens
        temperature: 0.5                          // ← немного понижаем температуру
      })
      .then((r) => r.data)
  );
}

/* ------------------------------------------------------------------ */
/*  4. Экспорт                                                        */
/* ------------------------------------------------------------------ */

const ChutesClient = chutes; // default-экспорт — axios-инстанс

// «OR-совместимый» нейм-экспорт
ChutesClient.chat = {
  completions: {
    create: createCompletion
  }
};

// utility-функция (необязательно, но привычно)
export const chutesRequest = async (opts) => createCompletion(opts);

export { ChutesClient };
export default ChutesClient;
