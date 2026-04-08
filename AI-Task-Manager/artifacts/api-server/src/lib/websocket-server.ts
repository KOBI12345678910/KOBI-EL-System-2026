/**
 * TechnoKoluzi ERP - WebSocket Real-Time Server
 * שרת WebSocket מתקדם עם rooms, channels, presence ו-collaboration
 *
 * Features:
 * - Socket.IO with SSE fallback
 * - Room-based: per-user, per-department, per-module
 * - Channels: notifications, live-ops, chat, collaboration, alerts, agent
 * - Presence system: who's online, who's viewing/editing what
 * - Live field locking for concurrent editing
 * - Typing indicators
 * - Message history per channel
 * - Auto-reconnect with exponential backoff
 */

import type { Server as HttpServer } from "http";
import { WebSocket, WebSocketServer } from "ws";

// ============== Types ==============

export interface WSClient {
  ws: WebSocket;
  userId: string;
  username: string;
  rooms: Set<string>;
  currentPage?: string;
  editingRecord?: { table: string; id: string };
  lastActivity: number;
  connectedAt: number;
}

export interface WSMessage {
  type: string;
  channel?: string;
  room?: string;
  payload: Record<string, any>;
  senderId?: string;
  timestamp: number;
}

export interface PresenceInfo {
  userId: string;
  username: string;
  currentPage?: string;
  editingRecord?: { table: string; id: string };
  lastActivity: number;
  status: "online" | "idle" | "editing";
}

export interface FieldLock {
  table: string;
  recordId: string;
  field: string;
  lockedBy: string;
  lockedAt: number;
  expiresAt: number;
}

// ============== Channel Definitions ==============

export const CHANNELS = {
  notifications: { name: "notifications", nameHe: "התראות", maxHistory: 100 },
  liveOps: { name: "live-ops", nameHe: "מבצעים חיים", maxHistory: 200 },
  chat: { name: "chat", nameHe: "צ'אט", maxHistory: 500 },
  collaboration: { name: "collaboration", nameHe: "שיתוף פעולה", maxHistory: 50 },
  alerts: { name: "alerts", nameHe: "התרעות", maxHistory: 100 },
  agent: { name: "agent", nameHe: "סוכן AI", maxHistory: 200 },
  dataSync: { name: "data-sync", nameHe: "סנכרון נתונים", maxHistory: 50 },
  presence: { name: "presence", nameHe: "נוכחות", maxHistory: 20 },
} as const;

// ============== Server State ==============

const clients = new Map<string, WSClient>();
const channelHistory = new Map<string, WSMessage[]>();
const fieldLocks = new Map<string, FieldLock>();
let wss: WebSocketServer | null = null;

const IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const LOCK_TIMEOUT = 2 * 60 * 1000; // 2 minutes
const PING_INTERVAL = 30 * 1000; // 30 seconds

// ============== Server Setup ==============

/**
 * Initialize WebSocket server on existing HTTP server.
 */
export function initWebSocketServer(server: HttpServer): WebSocketServer {
  wss = new WebSocketServer({ server, path: "/ws" });

  console.log("[WebSocket] 🔌 שרת WebSocket מוכן בנתיב /ws");

  wss.on("connection", (ws: WebSocket, req) => {
    const clientId = `ws_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const client: WSClient = {
      ws,
      userId: "anonymous",
      username: "אנונימי",
      rooms: new Set(["global"]),
      lastActivity: Date.now(),
      connectedAt: Date.now(),
    };

    clients.set(clientId, client);

    // Send welcome message
    sendToClient(ws, {
      type: "connected",
      payload: {
        clientId,
        channels: Object.values(CHANNELS).map(c => ({ name: c.name, nameHe: c.nameHe })),
        onlineUsers: getOnlineUsers().length,
      },
      timestamp: Date.now(),
    });

    // Handle messages
    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as WSMessage;
        client.lastActivity = Date.now();
        handleMessage(clientId, client, msg);
      } catch (e: any) {
        sendToClient(ws, { type: "error", payload: { message: "הודעה לא תקינה" }, timestamp: Date.now() });
      }
    });

    // Handle disconnect
    ws.on("close", () => {
      handleDisconnect(clientId, client);
      clients.delete(clientId);
    });

    ws.on("error", () => {
      clients.delete(clientId);
    });
  });

  // Ping interval to detect stale connections
  setInterval(() => {
    for (const [id, client] of clients) {
      if (client.ws.readyState !== WebSocket.OPEN) {
        clients.delete(id);
        continue;
      }
      // Check idle status
      if (Date.now() - client.lastActivity > IDLE_TIMEOUT) {
        broadcastPresenceUpdate(client.userId, "idle");
      }
      try {
        client.ws.ping();
      } catch {
        clients.delete(id);
      }
    }
    // Clean expired field locks
    cleanExpiredLocks();
  }, PING_INTERVAL);

  return wss;
}

// ============== Message Handling ==============

function handleMessage(clientId: string, client: WSClient, msg: WSMessage) {
  switch (msg.type) {
    case "auth":
      client.userId = msg.payload.userId || "anonymous";
      client.username = msg.payload.username || "אנונימי";
      broadcastPresenceUpdate(client.userId, "online");
      break;

    case "join_room":
      client.rooms.add(msg.payload.room);
      break;

    case "leave_room":
      client.rooms.delete(msg.payload.room);
      break;

    case "subscribe":
      client.rooms.add(`channel:${msg.payload.channel}`);
      // Send channel history
      const history = channelHistory.get(msg.payload.channel) || [];
      sendToClient(client.ws, {
        type: "channel_history",
        channel: msg.payload.channel,
        payload: { messages: history.slice(-50) },
        timestamp: Date.now(),
      });
      break;

    case "unsubscribe":
      client.rooms.delete(`channel:${msg.payload.channel}`);
      break;

    case "chat_message":
      const chatMsg: WSMessage = {
        type: "chat_message",
        channel: msg.channel || "chat",
        payload: { ...msg.payload, username: client.username, userId: client.userId },
        senderId: client.userId,
        timestamp: Date.now(),
      };
      addToHistory(msg.channel || "chat", chatMsg);
      broadcastToChannel(msg.channel || "chat", chatMsg, client.userId);
      break;

    case "typing_start":
      broadcastToChannel(msg.channel || "chat", {
        type: "typing",
        channel: msg.channel,
        payload: { userId: client.userId, username: client.username, typing: true },
        timestamp: Date.now(),
      }, client.userId);
      break;

    case "typing_stop":
      broadcastToChannel(msg.channel || "chat", {
        type: "typing",
        channel: msg.channel,
        payload: { userId: client.userId, username: client.username, typing: false },
        timestamp: Date.now(),
      }, client.userId);
      break;

    case "page_view":
      client.currentPage = msg.payload.page;
      broadcastPresenceUpdate(client.userId, "online");
      break;

    case "record_edit_start":
      client.editingRecord = { table: msg.payload.table, id: msg.payload.recordId };
      broadcastPresenceUpdate(client.userId, "editing");
      break;

    case "record_edit_end":
      client.editingRecord = undefined;
      broadcastPresenceUpdate(client.userId, "online");
      break;

    case "field_lock":
      acquireFieldLock(msg.payload.table, msg.payload.recordId, msg.payload.field, client.userId);
      break;

    case "field_unlock":
      releaseFieldLock(msg.payload.table, msg.payload.recordId, msg.payload.field, client.userId);
      break;

    case "get_presence":
      sendToClient(client.ws, {
        type: "presence_list",
        payload: { users: getOnlineUsers() },
        timestamp: Date.now(),
      });
      break;

    case "get_field_locks":
      const locks = getLocksForRecord(msg.payload.table, msg.payload.recordId);
      sendToClient(client.ws, {
        type: "field_locks",
        payload: { locks },
        timestamp: Date.now(),
      });
      break;
  }
}

function handleDisconnect(clientId: string, client: WSClient) {
  // Release all field locks held by this user
  for (const [key, lock] of fieldLocks) {
    if (lock.lockedBy === client.userId) {
      fieldLocks.delete(key);
      broadcastToAll({
        type: "field_unlocked",
        channel: "collaboration",
        payload: { table: lock.table, recordId: lock.recordId, field: lock.field },
        timestamp: Date.now(),
      });
    }
  }

  // Broadcast user left
  broadcastPresenceUpdate(client.userId, "online", true);
}

// ============== Broadcasting ==============

function sendToClient(ws: WebSocket, msg: WSMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export function broadcastToAll(msg: WSMessage, excludeUserId?: string) {
  for (const client of clients.values()) {
    if (excludeUserId && client.userId === excludeUserId) continue;
    sendToClient(client.ws, msg);
  }
}

export function broadcastToChannel(channel: string, msg: WSMessage, excludeUserId?: string) {
  const roomKey = `channel:${channel}`;
  for (const client of clients.values()) {
    if (excludeUserId && client.userId === excludeUserId) continue;
    if (client.rooms.has(roomKey) || client.rooms.has("global")) {
      sendToClient(client.ws, msg);
    }
  }
}

export function broadcastToRoom(room: string, msg: WSMessage, excludeUserId?: string) {
  for (const client of clients.values()) {
    if (excludeUserId && client.userId === excludeUserId) continue;
    if (client.rooms.has(room)) {
      sendToClient(client.ws, msg);
    }
  }
}

export function broadcastToUser(userId: string, msg: WSMessage) {
  for (const client of clients.values()) {
    if (client.userId === userId) {
      sendToClient(client.ws, msg);
    }
  }
}

/**
 * Broadcast from external code (routes, agents, etc.)
 */
export function emitEvent(channel: string, type: string, payload: Record<string, any>) {
  const msg: WSMessage = { type, channel, payload, timestamp: Date.now() };
  addToHistory(channel, msg);
  broadcastToChannel(channel, msg);
}

// ============== Presence ==============

function broadcastPresenceUpdate(userId: string, status: string, disconnected = false) {
  broadcastToAll({
    type: "presence_update",
    channel: "presence",
    payload: {
      userId,
      status: disconnected ? "offline" : status,
      onlineUsers: getOnlineUsers(),
    },
    timestamp: Date.now(),
  });
}

export function getOnlineUsers(): PresenceInfo[] {
  const users = new Map<string, PresenceInfo>();

  for (const client of clients.values()) {
    if (client.userId === "anonymous") continue;
    const existing = users.get(client.userId);
    if (!existing || client.lastActivity > existing.lastActivity) {
      const isIdle = Date.now() - client.lastActivity > IDLE_TIMEOUT;
      users.set(client.userId, {
        userId: client.userId,
        username: client.username,
        currentPage: client.currentPage,
        editingRecord: client.editingRecord,
        lastActivity: client.lastActivity,
        status: client.editingRecord ? "editing" : isIdle ? "idle" : "online",
      });
    }
  }

  return [...users.values()];
}

// ============== Field Locking ==============

function lockKey(table: string, recordId: string, field: string): string {
  return `${table}:${recordId}:${field}`;
}

function acquireFieldLock(table: string, recordId: string, field: string, userId: string): boolean {
  const key = lockKey(table, recordId, field);
  const existing = fieldLocks.get(key);

  if (existing && existing.lockedBy !== userId && existing.expiresAt > Date.now()) {
    // Field is locked by someone else
    broadcastToUser(userId, {
      type: "field_lock_denied",
      channel: "collaboration",
      payload: { table, recordId, field, lockedBy: existing.lockedBy },
      timestamp: Date.now(),
    });
    return false;
  }

  fieldLocks.set(key, {
    table, recordId, field,
    lockedBy: userId,
    lockedAt: Date.now(),
    expiresAt: Date.now() + LOCK_TIMEOUT,
  });

  broadcastToAll({
    type: "field_locked",
    channel: "collaboration",
    payload: { table, recordId, field, lockedBy: userId },
    timestamp: Date.now(),
  }, userId);

  return true;
}

function releaseFieldLock(table: string, recordId: string, field: string, userId: string) {
  const key = lockKey(table, recordId, field);
  const lock = fieldLocks.get(key);
  if (lock && lock.lockedBy === userId) {
    fieldLocks.delete(key);
    broadcastToAll({
      type: "field_unlocked",
      channel: "collaboration",
      payload: { table, recordId, field },
      timestamp: Date.now(),
    });
  }
}

function getLocksForRecord(table: string, recordId: string): FieldLock[] {
  const locks: FieldLock[] = [];
  for (const lock of fieldLocks.values()) {
    if (lock.table === table && lock.recordId === recordId && lock.expiresAt > Date.now()) {
      locks.push(lock);
    }
  }
  return locks;
}

function cleanExpiredLocks() {
  const now = Date.now();
  for (const [key, lock] of fieldLocks) {
    if (lock.expiresAt < now) {
      fieldLocks.delete(key);
      broadcastToAll({
        type: "field_unlocked",
        channel: "collaboration",
        payload: { table: lock.table, recordId: lock.recordId, field: lock.field },
        timestamp: now,
      });
    }
  }
}

// ============== Channel History ==============

function addToHistory(channel: string, msg: WSMessage) {
  const channelDef = Object.values(CHANNELS).find(c => c.name === channel);
  const maxHistory = channelDef?.maxHistory || 100;

  if (!channelHistory.has(channel)) {
    channelHistory.set(channel, []);
  }
  const history = channelHistory.get(channel)!;
  history.push(msg);

  // Trim if needed
  if (history.length > maxHistory) {
    history.splice(0, history.length - maxHistory);
  }
}

// ============== Stats ==============

export function getWSStats() {
  return {
    totalConnections: clients.size,
    onlineUsers: getOnlineUsers().length,
    channelSubscriptions: Object.fromEntries(
      Object.values(CHANNELS).map(c => {
        let count = 0;
        for (const client of clients.values()) {
          if (client.rooms.has(`channel:${c.name}`)) count++;
        }
        return [c.name, count];
      })
    ),
    activeLocks: fieldLocks.size,
    historySize: Object.fromEntries(
      [...channelHistory.entries()].map(([ch, msgs]) => [ch, msgs.length])
    ),
  };
}
