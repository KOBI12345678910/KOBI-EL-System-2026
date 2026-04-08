import { Response } from "express";

interface SSEClient {
  userId: number;
  res: Response;
  channels: Set<string>;
}

const clients: Set<SSEClient> = new Set();

export function addSSEClient(userId: number, res: Response, channels: string[] = ["notifications"]) {
  const client: SSEClient = { userId, res, channels: new Set(channels) };
  clients.add(client);

  res.on("close", () => {
    clients.delete(client);
  });

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });

  res.write(`data: ${JSON.stringify({ type: "connected", timestamp: new Date().toISOString() })}\n\n`);

  const keepAlive = setInterval(() => {
    if (res.writableEnded) {
      clearInterval(keepAlive);
      clients.delete(client);
      return;
    }
    res.write(": ping\n\n");
  }, 25000);

  res.on("close", () => clearInterval(keepAlive));
}

export interface NotificationPayload {
  notificationId: number;
  type: string;
  title: string;
  message: string;
  priority: string;
  category: string;
  userId: number | null;
  actionUrl?: string | null;
}

export function notifyClients(payload: NotificationPayload) {
  const data = JSON.stringify({ ...payload, eventType: "notification", timestamp: new Date().toISOString() });
  const toRemove: SSEClient[] = [];

  for (const client of clients) {
    if (!client.channels.has("notifications")) continue;
    if (payload.userId !== null && client.userId !== payload.userId) continue;
    try {
      if (client.res.writableEnded) {
        toRemove.push(client);
        continue;
      }
      client.res.write(`data: ${data}\n\n`);
    } catch {
      toRemove.push(client);
    }
  }

  for (const c of toRemove) clients.delete(c);
}

export type LiveOpsCategory = "production" | "sales" | "inventory" | "finance" | "alerts" | "users";
export type LiveOpsSeverity = "critical" | "warning" | "info";

export interface LiveOpsEvent {
  id: string;
  category: LiveOpsCategory;
  severity: LiveOpsSeverity;
  title: string;
  description: string;
  module?: string;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
}

const liveOpsHistory: LiveOpsEvent[] = [];
const MAX_HISTORY = 200;
let liveOpsSeq = 0;

export function emitLiveOpsEvent(event: Omit<LiveOpsEvent, "id">) {
  liveOpsSeq++;
  const fullEvent: LiveOpsEvent = { ...event, id: `loe-${Date.now()}-${liveOpsSeq}` };

  liveOpsHistory.push(fullEvent);
  if (liveOpsHistory.length > MAX_HISTORY) {
    liveOpsHistory.splice(0, liveOpsHistory.length - MAX_HISTORY);
  }

  const data = JSON.stringify({ eventType: "live-ops", timestamp: new Date().toISOString(), ...fullEvent });
  const toRemove: SSEClient[] = [];

  for (const client of clients) {
    if (!client.channels.has("live-ops")) continue;
    try {
      if (client.res.writableEnded) {
        toRemove.push(client);
        continue;
      }
      client.res.write(`data: ${data}\n\n`);
    } catch {
      toRemove.push(client);
    }
  }

  for (const c of toRemove) clients.delete(c);
}

export function getLiveOpsHistory(limit = 50): LiveOpsEvent[] {
  return liveOpsHistory.slice(-limit).reverse();
}

export function getLiveOpsClientCount(): number {
  let count = 0;
  for (const client of clients) {
    if (client.channels.has("live-ops")) count++;
  }
  return count;
}

export function getConnectedClientCount(): number {
  return clients.size;
}
