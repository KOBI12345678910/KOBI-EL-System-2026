import { WebSocket, WebSocketServer } from "ws";

export interface CollabUser {
  id: string;
  name: string;
  color: string;
  cursor?: { file: string; line: number; column: number };
  selection?: { file: string; start: number; end: number };
  lastActive: string;
}

export interface CollabOperation {
  type: "insert" | "delete" | "replace" | "cursor" | "selection" | "file_open" | "file_save";
  userId: string;
  file: string;
  data: any;
  timestamp: string;
  version: number;
}

const users: Map<string, CollabUser> = new Map();
const clients: Map<string, WebSocket> = new Map();
const operations: CollabOperation[] = [];
const fileVersions: Map<string, number> = new Map();
const colors = ["#e74c3c", "#3498db", "#2ecc71", "#f39c12", "#9b59b6", "#1abc9c", "#e67e22", "#e91e63"];
let colorIndex = 0;
let collabWss: WebSocketServer | null = null;

function broadcast(data: any, excludeUserId?: string): void {
  const msg = JSON.stringify(data);
  for (const [userId, ws] of clients) {
    if (userId !== excludeUserId && ws.readyState === WebSocket.OPEN) {
      try { ws.send(msg); } catch {}
    }
  }
}

function handleMessage(userId: string, msg: any): void {
  const user = users.get(userId);
  if (!user) return;
  user.lastActive = new Date().toISOString();

  switch (msg.type) {
    case "cursor_move":
      user.cursor = { file: msg.file, line: msg.line, column: msg.column };
      broadcast({ type: "cursor_update", userId, cursor: user.cursor, color: user.color, name: user.name }, userId);
      break;
    case "selection_change":
      user.selection = { file: msg.file, start: msg.start, end: msg.end };
      broadcast({ type: "selection_update", userId, selection: user.selection, color: user.color }, userId);
      break;
    case "text_change":
      const version = (fileVersions.get(msg.file) || 0) + 1;
      fileVersions.set(msg.file, version);
      const op: CollabOperation = { type: msg.operation, userId, file: msg.file, data: { position: msg.position, text: msg.text, length: msg.length }, timestamp: new Date().toISOString(), version };
      operations.push(op);
      broadcast({ type: "text_change", userId, operation: op, name: user.name, color: user.color }, userId);
      break;
    case "file_open":
      broadcast({ type: "file_opened", userId, file: msg.file, name: user.name }, userId);
      break;
    case "set_name":
      user.name = msg.name;
      broadcast({ type: "user_renamed", userId, name: user.name });
      break;
    case "chat":
      broadcast({ type: "chat_message", userId, name: user.name, message: msg.message, timestamp: new Date().toISOString() });
      break;
    case "task_suggestion":
      broadcast({ type: "task_suggestion", userId, name: user.name, task: msg.task });
      break;
  }
}

export function initCollabWebSocket(server: any): void {
  if (collabWss) return;
  collabWss = new WebSocketServer({ server, path: "/collab" });

  collabWss.on("connection", (ws: WebSocket) => {
    const userId = `user_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const userName = `User ${users.size + 1}`;
    const color = colors[colorIndex++ % colors.length];

    const user: CollabUser = { id: userId, name: userName, color, lastActive: new Date().toISOString() };
    users.set(userId, user);
    clients.set(userId, ws);

    ws.send(JSON.stringify({ type: "welcome", userId, user, users: Array.from(users.values()) }));
    broadcast({ type: "user_joined", user }, userId);

    ws.on("message", (data: Buffer) => {
      try { handleMessage(userId, JSON.parse(data.toString())); } catch {}
    });

    ws.on("close", () => {
      users.delete(userId);
      clients.delete(userId);
      broadcast({ type: "user_left", userId });
    });
  });
}

export async function getCollabUsers(): Promise<{ success: boolean; output: string; users?: CollabUser[] }> {
  const list = Array.from(users.values());
  return { success: true, output: `${list.length} connected users:\n${list.map(u => `${u.name} (${u.id}) - ${u.color} - last active: ${u.lastActive}`).join("\n") || "No users connected"}`, users: list };
}

export async function getCollabHistory(params: { file: string; limit?: number }): Promise<{ success: boolean; output: string; operations?: CollabOperation[] }> {
  const limit = params.limit || 100;
  const ops = operations.filter(op => op.file === params.file).slice(-limit);
  return { success: true, output: `${ops.length} operations on ${params.file}:\n${ops.map(o => `[v${o.version}] ${o.type} by ${o.userId} at ${o.timestamp}`).join("\n") || "No operations"}`, operations: ops };
}

export async function getCollabStatus(): Promise<{ success: boolean; output: string }> {
  const userCount = users.size;
  const totalOps = operations.length;
  const filesEdited = new Set(operations.map(o => o.file)).size;
  return { success: true, output: `Collaboration Status:\n- Connected users: ${userCount}\n- Total operations: ${totalOps}\n- Files edited: ${filesEdited}\n- WebSocket: ${collabWss ? "active" : "not initialized"}` };
}

export const COLLAB_TOOLS = [
  { name: "get_collab_users", description: "Get list of connected collaboration users with cursors and colors", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "get_collab_history", description: "Get operation history for a specific file in collaboration", input_schema: { type: "object" as const, properties: { file: { type: "string", description: "File path to get history for" }, limit: { type: "number", description: "Max operations to return (default 100)" } }, required: ["file"] as string[] } },
  { name: "get_collab_status", description: "Get real-time collaboration status: users, operations, files edited", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
];