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
import { broadcastToAll, broadcast } from '../realtime/websocket';

export type TriggerType = 'notification' | 'alert' | 'work_order_update' | 'project_update';

/**
 * Broadcast an event to ALL connected WebSocket clients (global room).
 */
export function broadcastEvent(event: TriggerType | string, data: any): void {
  broadcastToAll(event, data);
}

/**
 * Broadcast an event to a specific room (e.g. a user-id room or a department).
 */
export function broadcastToRoom(room: string, event: TriggerType | string, data: any): void {
  broadcast(room, event, data);
}
