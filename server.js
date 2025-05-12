//server.js
// Загружаем .env СРАЗУ, до любых других импортов
import 'dotenv/config';

// ─────────────── ОСНОВНЫЕ МОДУЛИ ───────────────
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import cookieParser from "cookie-parser";
import cron from 'node-cron'; // ✅ Импортируем node-cron

// ─────────────── SECURITY MIDDLEWARES ───────────────
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import xssClean from "xss-clean";
import mongoSanitize from "express-mongo-sanitize";
import hpp from "hpp";

// ─────────────── CELEBRATE ERROR HANDLING ───────────────
import { errors } from "celebrate";

// ─────────────── ROUTES ───────────────
import userRouter from "./routes/userRoutes.js";
import journalRouter from "./routes/journalRoutes.js";
import quotesRouter from "./routes/quotesRoutes.js";
import gratitudeRouter from "./routes/gratitudeRoutes.js";
import authRouter from "./routes/authRoutes.js";

// ✅ Добавленные роуты
import billingRouter from "./routes/billingRoutes.js";
import analysisRoutes from './routes/analysisRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import referralRoutes from './routes/referralRoutes.js';

// ─────────────── WORKERS (запускаются вместе с сервером) ───────────────
import './workers/llmWorker.js';

// ─────────────── CONNECT TO MONGODB ───────────────
mongoose.connect(process.env.MONGO)
  .then(() => {
    console.log("MongoDB is connected");
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  });

// ─────────────── EXPRESS APP SETUP ───────────────
const app = express();
const port = process.env.PORT || 5000;

// ─────────────── GLOBAL SECURITY MIDDLEWARES ──────────────

// ✅ Читаем разрешённые домены из переменной окружения
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : ['http://localhost:3000'];

// ✅ Настройка CORS — с явным заголовком
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
    return callback(new Error(msg), false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-xsrf-token'],
  credentials: true,
  maxAge: 86400 // 24 hours
}));

// ✅ Принудительная установка Access-Control-Allow-Origin
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }

  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, x-xsrf-token');

  next();
});

// Rate limiting — ограничение до 100 запросов за 10 минут с одного IP
if (process.env.NODE_ENV === 'production') {
  const limiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 100,                 // limit each IP to 100 requests per windowMs
    standardHeaders: true,     // Return rate limit info in headers
    legacyHeaders: false       // Disable X-RateLimit-* headers
  });
  app.use(limiter);
}

// Helmet — безопасные HTTP заголовки
app.use(
  helmet({
    crossOriginResourcePolicy: false // Позволяет Next.js загружать шрифты/картинки
  })
);

// CSP и HSTS — только в production
if (process.env.NODE_ENV === 'production') {
  app.use(
    helmet.contentSecurityPolicy({
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"], // если нужно
        connectSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        fontSrc: ["'self'", "data:"]
      },
    })
  );
  app.use(helmet.hsts());
}

// Парсим куки
app.use(cookieParser());

// Парсим JSON-тело запроса (ограничение: 100 KB)
app.use(express.json({ limit: "100kb" }));

// Парсим URL-encoded данные (для HTML-форм), тоже с ограничением
app.use(express.urlencoded({ extended: true, limit: "100kb" }));

// XSS Clean — очистка входных данных от XSS
app.use(xssClean());

// Mongo Sanitize — блокировка NoSQL инъекций
app.use(mongoSanitize());

// HPP — защита от параметров-дубликатов
app.use(hpp());

// ───────────────────────────────────────────────────────────
// ✅ Cron задача: сброс просроченных тарифов на 'basic'
cron.schedule('0 3 * * *', async () => {
  try {
    await User.updateMany(
      {
        plan: { $ne: 'basic' },
        planExpires: { $lt: new Date() }
      },
      { $set: { plan: 'basic' } }
    );
    console.log('[Cron] Автодаунгрейд завершён');
  } catch (err) {
    console.error('[Cron] Ошибка при обновлении пользователей:', err.message || err);
  }
});

// ───────────────────────────────────────────────────────────
// Routes
app.get("/", (req, res) => {
  res.send("API is Working");
});

// Подключаем роутеры
app.use("/api/auth", authRouter);
app.use("/api/user", userRouter);
app.use("/api/journal", journalRouter);
app.use("/api/quotes", quotesRouter);
app.use("/api/gratitude", gratitudeRouter);

// ✅ Подключение биллинга
app.use("/api/billing", billingRouter);

// ✅ Подключение новых роутов
app.use("/api/analysis", analysisRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/referral", referralRoutes);

// Celebrate error handler — после роутов, но до глобального обработчика ошибок
app.use(errors());

// 404 middleware
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

// Global error handler
app.use((err, req, res, next) => {
  // Защита от двойного ответа
  if (res.headersSent) return next(err);

  console.error(err.stack);
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || "An unexpected error occurred"
  });
});

// ───────────────────────────────────────────────────────────
// 🚪 Graceful shutdown — ловим сигналы о завершении
// ───────────────────────────────────────────────────────────

const server = app.listen(port, () => {
  console.log(`✅ Server is running on port ${port}`);
  console.log(`🧠 LLM Worker and 🌫️ WordCloud Worker уже запущены`);
});

function gracefulShutdown(exitCode = 0) {
  console.log('Graceful shutdown initiated...');
  server.close(async (err) => {
    if (err) {
      console.error('Error closing HTTP server:', err);
      return process.exit(1);
    }

    console.log('HTTP server closed.');

    try {
      await mongoose.connection.close(false);
      console.log('MongoDB connection closed.');
    } catch (mongoErr) {
      console.error('Error closing MongoDB connection:', mongoErr);
    }

    process.exit(exitCode);
  });
}

// Таймаут на завершение
const SHUTDOWN_TIMEOUT = 10_000; // 10 секунд
let shutdownInitiated = false;

['SIGTERM', 'SIGINT'].forEach(sig => {
  process.on(sig, async () => {
    if (shutdownInitiated) return;
    shutdownInitiated = true;

    console.log(`Received signal ${sig}, starting graceful shutdown...`);

    setTimeout(() => {
      console.error('Forcing shutdown due to timeout');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT);

    await gracefulShutdown(0);
  });
});
