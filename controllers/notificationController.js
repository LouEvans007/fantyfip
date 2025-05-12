// backend/controllers/notificationController.js
import Notification from '../models/notificationModel.js';

export async function listNotifications(req, res) {
  const notifs = await Notification.find({ userId: req.user.id })
    .sort({ createdAt: -1 })
    .limit(20);
  res.json(notifs);
}

export async function markRead(req, res) {
  const { ids } = req.body;
  await Notification.updateMany(
    { _id: { $in: ids }, userId: req.user.id },
    { $set: { isRead: true } }
  );
  res.json({ success: true });
}
