const express = require('express');
const router = express.Router();
const { getNotifications, getUnreadCount, markAsRead, markAllAsRead } = require('../services/notification.service');

router.get('/', (req, res) => {
  const notifications = getNotifications(parseInt(req.query.limit) || 50);
  const unreadCount = getUnreadCount();
  res.json({ notifications, unreadCount });
});

router.patch('/:id/read', (req, res) => {
  markAsRead(req.params.id);
  res.json({ success: true });
});

router.patch('/read-all', (req, res) => {
  markAllAsRead();
  res.json({ success: true });
});

module.exports = router;
