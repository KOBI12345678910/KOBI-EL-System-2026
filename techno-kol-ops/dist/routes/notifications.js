"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createNotification = createNotification;
const express_1 = require("express");
const websocket_1 = require("../realtime/websocket");
const router = (0, express_1.Router)();
// In-memory store (replace with DB queries when table is available)
const notificationsStore = [];
let nextId = 1;
function createNotification(data) {
    const notification = {
        id: String(nextId++),
        ...data,
        read: false,
        createdAt: new Date().toISOString(),
    };
    notificationsStore.unshift(notification);
    // Keep last 500 notifications in memory
    if (notificationsStore.length > 500) {
        notificationsStore.pop();
    }
    // Broadcast to WebSocket clients
    (0, websocket_1.broadcastToAll)('notification', notification);
    return notification;
}
// GET /api/notifications — list recent notifications
router.get('/', (req, res) => {
    try {
        const userId = req.user?.id;
        const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
        const notifications = notificationsStore
            .filter((n) => !n.userId || n.userId === String(userId))
            .slice(0, limit);
        const unreadCount = notifications.filter((n) => !n.read).length;
        res.json({ notifications, unreadCount });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});
// POST /api/notifications — create notification (internal use / service-to-service)
router.post('/', (req, res) => {
    try {
        const { type, title, message, priority = 'medium', userId } = req.body;
        if (!type || !title || !message) {
            return res.status(400).json({ error: 'type, title and message are required' });
        }
        const notification = createNotification({ type, title, message, priority, userId });
        res.status(201).json({ notification });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to create notification' });
    }
});
// POST /api/notifications/:id/read — mark single notification as read
router.post('/:id/read', (req, res) => {
    try {
        const { id } = req.params;
        const notification = notificationsStore.find((n) => n.id === id);
        if (!notification) {
            return res.status(404).json({ error: 'Notification not found' });
        }
        notification.read = true;
        res.json({ notification });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to mark notification as read' });
    }
});
// POST /api/notifications/read-all — mark all as read
router.post('/read-all', (req, res) => {
    try {
        const userId = req.user?.id;
        notificationsStore
            .filter((n) => !n.userId || n.userId === String(userId))
            .forEach((n) => { n.read = true; });
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to mark all notifications as read' });
    }
});
exports.default = router;
