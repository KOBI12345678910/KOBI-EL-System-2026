const db = require('../db/connection');

function createNotification(type, entityType, entityId, message) {
  return db.prepare(`
    INSERT INTO notifications (type, entity_type, entity_id, message)
    VALUES (?, ?, ?, ?)
  `).run(type, entityType, entityId, message);
}

function getUnreadCount() {
  return db.prepare('SELECT COUNT(*) as count FROM notifications WHERE is_read = 0').get().count;
}

function getNotifications(limit = 50) {
  return db.prepare(`
    SELECT * FROM notifications ORDER BY created_at DESC LIMIT ?
  `).all(limit);
}

function markAsRead(id) {
  return db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(id);
}

function markAllAsRead() {
  return db.prepare('UPDATE notifications SET is_read = 1 WHERE is_read = 0').run();
}

module.exports = { createNotification, getUnreadCount, getNotifications, markAsRead, markAllAsRead };
