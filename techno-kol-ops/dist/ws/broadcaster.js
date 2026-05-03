"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.broadcastEvent = broadcastEvent;
exports.broadcastToRoom = broadcastToRoom;
/**
 * WebSocket broadcaster — thin wrapper over the core WS module.
 * Supports typed trigger events for the notification system.
 *
 * Trigger types:
 *   'notification'      — new in-app notification
 *   'alert'             — system alert
 *   'work_order_update' — work-order status change
 *   'project_update'    — project status change
 */
const websocket_1 = require("../realtime/websocket");
/**
 * Broadcast an event to ALL connected WebSocket clients (global room).
 */
function broadcastEvent(event, data) {
    (0, websocket_1.broadcastToAll)(event, data);
}
/**
 * Broadcast an event to a specific room (e.g. a user-id room or a department).
 */
function broadcastToRoom(room, event, data) {
    (0, websocket_1.broadcast)(room, event, data);
}
