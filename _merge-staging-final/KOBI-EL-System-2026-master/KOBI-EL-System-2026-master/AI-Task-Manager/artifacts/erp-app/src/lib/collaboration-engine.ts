/**
 * TechnoKoluzi ERP - Live Collaboration Engine (Frontend)
 * שיתוף פעולה בזמן אמת כמו Figma
 *
 * Features:
 * - WebSocket connection to server
 * - Presence: who's online, who's viewing/editing what
 * - Field locking: prevent concurrent edits
 * - Typing indicators
 * - Real-time notifications
 * - Auto-reconnect with exponential backoff
 */

// ============== Types ==============

export interface PresenceUser {
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
}

export interface CollabEvent {
  type: string;
  channel?: string;
  payload: Record<string, any>;
  timestamp: number;
}

export type CollabEventHandler = (event: CollabEvent) => void;

// ============== WebSocket Client ==============

let ws: WebSocket | null = null;
let clientId: string | null = null;
let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pingInterval: ReturnType<typeof setInterval> | null = null;
const eventHandlers = new Map<string, Set<CollabEventHandler>>();
const MAX_RECONNECT_ATTEMPTS = 15;
const BASE_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;

/**
 * Connect to the WebSocket server.
 */
export function connect(userId: string, username: string): Promise<boolean> {
  return new Promise((resolve) => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        reconnectAttempts = 0;
        console.log("[Collab] WebSocket connected");

        // Authenticate
        send({ type: "auth", payload: { userId, username }, timestamp: Date.now() });

        // Start ping
        if (pingInterval) clearInterval(pingInterval);
        pingInterval = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping", payload: {}, timestamp: Date.now() }));
          }
        }, 25000);

        resolve(true);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as CollabEvent;

          if (msg.type === "connected") {
            clientId = msg.payload.clientId;
          }

          // Dispatch to handlers
          const handlers = eventHandlers.get(msg.type);
          if (handlers) {
            for (const handler of handlers) handler(msg);
          }

          // Also dispatch to wildcard handlers
          const wildcardHandlers = eventHandlers.get("*");
          if (wildcardHandlers) {
            for (const handler of wildcardHandlers) handler(msg);
          }
        } catch {}
      };

      ws.onclose = () => {
        console.log("[Collab] WebSocket disconnected");
        if (pingInterval) clearInterval(pingInterval);
        scheduleReconnect(userId, username);
      };

      ws.onerror = () => {
        resolve(false);
      };
    } catch {
      resolve(false);
    }
  });
}

/**
 * Disconnect from server.
 */
export function disconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (pingInterval) clearInterval(pingInterval);
  if (ws) {
    ws.onclose = null; // prevent reconnect
    ws.close();
    ws = null;
  }
}

function scheduleReconnect(userId: string, username: string) {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return;

  const delay = Math.min(BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY);
  reconnectAttempts++;

  reconnectTimer = setTimeout(() => connect(userId, username), delay);
}

function send(msg: CollabEvent) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

// ============== Event System ==============

/**
 * Subscribe to a specific event type.
 */
export function on(eventType: string, handler: CollabEventHandler): () => void {
  if (!eventHandlers.has(eventType)) {
    eventHandlers.set(eventType, new Set());
  }
  eventHandlers.get(eventType)!.add(handler);

  return () => {
    eventHandlers.get(eventType)?.delete(handler);
  };
}

/**
 * Subscribe to a WebSocket channel.
 */
export function subscribe(channel: string) {
  send({ type: "subscribe", payload: { channel }, timestamp: Date.now() });
}

/**
 * Unsubscribe from a channel.
 */
export function unsubscribe(channel: string) {
  send({ type: "unsubscribe", payload: { channel }, timestamp: Date.now() });
}

// ============== Presence ==============

/**
 * Report current page view.
 */
export function reportPageView(page: string) {
  send({ type: "page_view", payload: { page }, timestamp: Date.now() });
}

/**
 * Report start editing a record.
 */
export function reportEditStart(table: string, recordId: string) {
  send({ type: "record_edit_start", payload: { table, recordId }, timestamp: Date.now() });
}

/**
 * Report stop editing.
 */
export function reportEditEnd() {
  send({ type: "record_edit_end", payload: {}, timestamp: Date.now() });
}

/**
 * Request current presence list.
 */
export function requestPresence() {
  send({ type: "get_presence", payload: {}, timestamp: Date.now() });
}

// ============== Field Locking ==============

/**
 * Lock a field for editing.
 */
export function lockField(table: string, recordId: string, field: string) {
  send({ type: "field_lock", payload: { table, recordId, field }, timestamp: Date.now() });
}

/**
 * Unlock a field.
 */
export function unlockField(table: string, recordId: string, field: string) {
  send({ type: "field_unlock", payload: { table, recordId, field }, timestamp: Date.now() });
}

/**
 * Get locks for a record.
 */
export function requestFieldLocks(table: string, recordId: string) {
  send({ type: "get_field_locks", payload: { table, recordId }, timestamp: Date.now() });
}

// ============== Chat ==============

/**
 * Send a chat message.
 */
export function sendChatMessage(channel: string, message: string, metadata?: Record<string, any>) {
  send({
    type: "chat_message",
    channel,
    payload: { message, ...metadata },
    timestamp: Date.now(),
  });
}

/**
 * Report typing start.
 */
export function startTyping(channel: string) {
  send({ type: "typing_start", channel, payload: {}, timestamp: Date.now() });
}

/**
 * Report typing stop.
 */
export function stopTyping(channel: string) {
  send({ type: "typing_stop", channel, payload: {}, timestamp: Date.now() });
}

// ============== Status ==============

export function isConnected(): boolean {
  return ws?.readyState === WebSocket.OPEN;
}

export function getClientId(): string | null {
  return clientId;
}

export function getConnectionState(): "connected" | "connecting" | "disconnected" {
  if (!ws) return "disconnected";
  switch (ws.readyState) {
    case WebSocket.OPEN: return "connected";
    case WebSocket.CONNECTING: return "connecting";
    default: return "disconnected";
  }
}
