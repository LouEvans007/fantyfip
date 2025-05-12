// backend/routes/notificationRoutes.js
import express from 'express';
import { verifyToken } from '../middlewares/verifyToken.js';
import { listNotifications, markRead } from '../controllers/notificationController.js';

const router = express.Router();

router.use(verifyToken);
router.get('/',   listNotifications);
router.post('/read', markRead);

export default router;
