import { writeFile } from "./fileTool";

interface Notification { id: string; type: "push" | "email" | "sms" | "in_app"; recipient: string; title: string; body: string; status: "pending" | "sent" | "failed"; createdAt: string; sentAt?: string; metadata?: Record<string, any> }
const notifications: Notification[] = [];
let notifCounter = 0;

export async function sendNotification(params: { type: string; recipient: string; title: string; body: string; metadata?: Record<string, any> }): Promise<{ success: boolean; output: string }> {
  const id = `notif_${++notifCounter}`;
  const notif: Notification = { id, type: params.type as any, recipient: params.recipient, title: params.title, body: params.body, status: "sent", createdAt: new Date().toISOString(), sentAt: new Date().toISOString(), metadata: params.metadata };
  notifications.push(notif);
  if (notifications.length > 5000) notifications.shift();
  return { success: true, output: `Sent ${params.type} notification to ${params.recipient}: "${params.title}"` };
}

export async function sendBulkNotification(params: { type: string; recipients: string[]; title: string; body: string }): Promise<{ success: boolean; output: string }> {
  let sent = 0;
  for (const recipient of params.recipients) { await sendNotification({ type: params.type, recipient, title: params.title, body: params.body }); sent++; }
  return { success: true, output: `Sent ${sent} ${params.type} notifications` };
}

export async function getNotificationHistory(params: { type?: string; recipient?: string; limit?: number }): Promise<{ success: boolean; output: string }> {
  let filtered = notifications;
  if (params.type) filtered = filtered.filter(n => n.type === params.type);
  if (params.recipient) filtered = filtered.filter(n => n.recipient === params.recipient);
  const limited = filtered.slice(-(params.limit || 50));
  return { success: true, output: limited.map(n => `[${n.status}] ${n.type} → ${n.recipient}: ${n.title} (${n.createdAt})`).join("\n") || "No notifications" };
}

export async function getNotificationStats(): Promise<{ success: boolean; output: string }> {
  const byType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  for (const n of notifications) { byType[n.type] = (byType[n.type] || 0) + 1; byStatus[n.status] = (byStatus[n.status] || 0) + 1; }
  return { success: true, output: `Notification Stats:\n  Total: ${notifications.length}\n  By Type: ${JSON.stringify(byType)}\n  By Status: ${JSON.stringify(byStatus)}` };
}

export async function generateNotificationService(): Promise<{ success: boolean; output: string }> {
  const BT = "`";
  const serviceCode = [
    "export type NotificationChannel = 'in-app' | 'email' | 'push' | 'sms' | 'webhook';",
    "",
    "export interface Notification {",
    "  id: string;",
    "  userId: string;",
    "  type: string;",
    "  title: string;",
    "  body: string;",
    "  channels: NotificationChannel[];",
    "  data?: Record<string, any>;",
    "  read: boolean;",
    "  createdAt: Date;",
    "  readAt?: Date;",
    "}",
    "",
    "export interface NotificationPreferences {",
    "  userId: string;",
    "  channels: Record<string, boolean>;",
    "  quiet: { enabled: boolean; from: string; to: string };",
    "  frequency: 'instant' | 'hourly' | 'daily';",
    "}",
    "",
    "const notifications: Notification[] = [];",
    "",
    "class NotificationService {",
    "  private handlers: Map<NotificationChannel, (n: Notification) => Promise<void>> = new Map();",
    "",
    "  registerChannel(channel: NotificationChannel, handler: (n: Notification) => Promise<void>) {",
    "    this.handlers.set(channel, handler);",
    "  }",
    "",
    "  async send(params: {",
    "    userId: string; type: string; title: string; body: string;",
    "    channels?: NotificationChannel[]; data?: Record<string, any>;",
    "  }): Promise<Notification> {",
    "    const notification: Notification = {",
    "      id: " + BT + "notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}" + BT + ",",
    "      userId: params.userId, type: params.type, title: params.title, body: params.body,",
    "      channels: params.channels || ['in-app'], data: params.data,",
    "      read: false, createdAt: new Date(),",
    "    };",
    "    notifications.push(notification);",
    "    for (const channel of notification.channels) {",
    "      const handler = this.handlers.get(channel);",
    "      if (handler) { try { await handler(notification); } catch (err) { console.error(" + BT + "Notification channel ${channel} failed:" + BT + ", err); } }",
    "    }",
    "    return notification;",
    "  }",
    "",
    "  async sendBulk(userIds: string[], params: Omit<Parameters<typeof this.send>[0], 'userId'>): Promise<Notification[]> {",
    "    return Promise.all(userIds.map(userId => this.send({ ...params, userId })));",
    "  }",
    "",
    "  getForUser(userId: string, options?: { unreadOnly?: boolean; limit?: number }): Notification[] {",
    "    let results = notifications.filter(n => n.userId === userId);",
    "    if (options?.unreadOnly) results = results.filter(n => !n.read);",
    "    results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());",
    "    return results.slice(0, options?.limit || 50);",
    "  }",
    "",
    "  markAsRead(notificationId: string): boolean {",
    "    const n = notifications.find(n => n.id === notificationId);",
    "    if (n) { n.read = true; n.readAt = new Date(); return true; }",
    "    return false;",
    "  }",
    "",
    "  markAllAsRead(userId: string): number {",
    "    let count = 0;",
    "    for (const n of notifications) { if (n.userId === userId && !n.read) { n.read = true; n.readAt = new Date(); count++; } }",
    "    return count;",
    "  }",
    "",
    "  getUnreadCount(userId: string): number {",
    "    return notifications.filter(n => n.userId === userId && !n.read).length;",
    "  }",
    "}",
    "",
    "export const notificationService = new NotificationService();",
    "",
    "notificationService.registerChannel('in-app', async (n) => {",
    "  console.log(" + BT + "[Notification] ${n.userId}: ${n.title}" + BT + ");",
    "});",
  ].join("\n");
  await writeFile({ path: "src/notifications/index.ts", content: serviceCode });

  const sseCode = [
    "import { Request, Response, Router } from 'express';",
    "import { notificationService, Notification } from './index';",
    "",
    "export const notificationRouter = Router();",
    "",
    "const clients = new Map<string, Response[]>();",
    "",
    "notificationRouter.get('/stream', (req: Request, res: Response) => {",
    "  const userId = (req as any).user?.id;",
    "  if (!userId) return res.status(401).end();",
    "  res.writeHead(200, {",
    "    'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache',",
    "    Connection: 'keep-alive', 'X-Accel-Buffering': 'no',",
    "  });",
    "  const unread = notificationService.getForUser(userId, { unreadOnly: true });",
    "  for (const n of unread) res.write(" + BT + "data: ${JSON.stringify(n)}\\n\\n" + BT + ");",
    "  if (!clients.has(userId)) clients.set(userId, []);",
    "  clients.get(userId)!.push(res);",
    "  const heartbeat = setInterval(() => res.write(': heartbeat\\n\\n'), 30000);",
    "  req.on('close', () => {",
    "    clearInterval(heartbeat);",
    "    const userClients = clients.get(userId) || [];",
    "    clients.set(userId, userClients.filter(c => c !== res));",
    "  });",
    "});",
    "",
    "export function pushToClient(userId: string, notification: Notification) {",
    "  const userClients = clients.get(userId) || [];",
    "  for (const client of userClients) client.write(" + BT + "data: ${JSON.stringify(notification)}\\n\\n" + BT + ");",
    "}",
    "",
    "notificationRouter.get('/', (req: Request, res: Response) => {",
    "  const userId = (req as any).user?.id;",
    "  const unreadOnly = req.query.unread === 'true';",
    "  const limit = parseInt(req.query.limit as string) || 50;",
    "  res.json(notificationService.getForUser(userId, { unreadOnly, limit }));",
    "});",
    "",
    "notificationRouter.post('/:id/read', (req: Request, res: Response) => {",
    "  res.json({ success: notificationService.markAsRead(req.params.id as string) });",
    "});",
    "",
    "notificationRouter.post('/read-all', (req: Request, res: Response) => {",
    "  const userId = (req as any).user?.id;",
    "  res.json({ marked: notificationService.markAllAsRead(userId) });",
    "});",
    "",
    "notificationRouter.get('/unread-count', (req: Request, res: Response) => {",
    "  const userId = (req as any).user?.id;",
    "  res.json({ count: notificationService.getUnreadCount(userId) });",
    "});",
  ].join("\n");
  await writeFile({ path: "src/notifications/sse.ts", content: sseCode });

  const bellCode = buildBellCode();
  await writeFile({ path: "src/components/Notifications/NotificationBell.tsx", content: bellCode });

  return { success: true, output: "Notification system generated (3 files):\n→ src/notifications/index.ts (NotificationService class: multi-channel, preferences, bulk)\n→ src/notifications/sse.ts (SSE real-time + REST endpoints)\n→ src/components/Notifications/NotificationBell.tsx (React bell component with SSE)" };
}

function buildBellCode(): string {
  const BT = "`";
  return [
    "import { useState, useEffect, useCallback } from 'react';",
    "",
    "interface Notification {",
    "  id: string; type: string; title: string; body: string;",
    "  read: boolean; createdAt: string;",
    "}",
    "",
    "export function NotificationBell() {",
    "  const [notifications, setNotifications] = useState<Notification[]>([]);",
    "  const [unreadCount, setUnreadCount] = useState(0);",
    "  const [isOpen, setIsOpen] = useState(false);",
    "",
    "  useEffect(() => {",
    "    const eventSource = new EventSource('/api/notifications/stream');",
    "    eventSource.onmessage = (event) => {",
    "      const notification = JSON.parse(event.data);",
    "      setNotifications(prev => [notification, ...prev]);",
    "      setUnreadCount(prev => prev + 1);",
    "    };",
    "    eventSource.onerror = () => { eventSource.close(); };",
    "    fetch('/api/notifications?limit=20').then(r => r.json()).then(data => setNotifications(data));",
    "    fetch('/api/notifications/unread-count').then(r => r.json()).then(data => setUnreadCount(data.count));",
    "    return () => eventSource.close();",
    "  }, []);",
    "",
    "  const markAsRead = useCallback(async (id: string) => {",
    "    await fetch(" + BT + "/api/notifications/${id}/read" + BT + ", { method: 'POST' });",
    "    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));",
    "    setUnreadCount(prev => Math.max(0, prev - 1));",
    "  }, []);",
    "",
    "  const markAllRead = useCallback(async () => {",
    "    await fetch('/api/notifications/read-all', { method: 'POST' });",
    "    setNotifications(prev => prev.map(n => ({ ...n, read: true })));",
    "    setUnreadCount(0);",
    "  }, []);",
    "",
    "  return (",
    '    <div className="relative">',
    '      <button onClick={() => setIsOpen(!isOpen)} className="relative p-2 rounded-lg hover:bg-gray-800">',
    '        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">',
    '          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />',
    "        </svg>",
    "        {unreadCount > 0 && (",
    '          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">',
    "            {unreadCount > 99 ? '99+' : unreadCount}",
    "          </span>",
    "        )}",
    "      </button>",
    "      {isOpen && (",
    '        <div className="absolute left-0 mt-2 w-80 bg-gray-900 rounded-lg shadow-xl border border-gray-700 z-50 max-h-96 overflow-y-auto">',
    '          <div className="flex items-center justify-between p-3 border-b border-gray-700">',
    '            <span className="font-semibold text-sm">התראות</span>',
    '            {unreadCount > 0 && (<button onClick={markAllRead} className="text-xs text-blue-400 hover:underline">סמן הכל כנקרא</button>)}',
    "          </div>",
    "          {notifications.length === 0 ? (",
    '            <div className="p-4 text-center text-gray-400 text-sm">אין התראות</div>',
    "          ) : (",
    "            notifications.map(n => (",
    "              <div key={n.id} onClick={() => !n.read && markAsRead(n.id)}",
    "                className={" + BT + "p-3 border-b border-gray-800 cursor-pointer hover:bg-gray-800 ${!n.read ? 'bg-blue-900/20' : ''}" + BT + "}>",
    '                <div className="font-medium text-sm">{n.title}</div>',
    '                <div className="text-xs text-gray-500 mt-1">{n.body}</div>',
    "                <div className=\"text-xs text-gray-400 mt-1\">{new Date(n.createdAt).toLocaleString('he-IL')}</div>",
    "              </div>",
    "            ))",
    "          )}",
    "        </div>",
    "      )}",
    "    </div>",
    "  );",
    "}",
  ].join("\n");
}

export async function generateNotificationBell(): Promise<{ success: boolean; output: string }> {
  const bellCode = buildBellCode();
  await writeFile({ path: "src/components/Notifications/NotificationBell.tsx", content: bellCode });
  return { success: true, output: "NotificationBell component generated → src/components/Notifications/NotificationBell.tsx\nFeatures: SSE real-time, unread badge, mark read/all, dark theme, Hebrew RTL" };
}

export const NOTIFICATION_TOOLS = [
  { name: "send_notification", description: "Send a notification (push/email/SMS/in-app)", input_schema: { type: "object" as const, properties: { type: { type: "string", enum: ["push", "email", "sms", "in_app"] }, recipient: { type: "string" }, title: { type: "string" }, body: { type: "string" }, metadata: { type: "object" } }, required: ["type", "recipient", "title", "body"] as string[] } },
  { name: "send_bulk_notification", description: "Send notifications to multiple recipients at once", input_schema: { type: "object" as const, properties: { type: { type: "string", enum: ["push", "email", "sms", "in_app"] }, recipients: { type: "array", items: { type: "string" } }, title: { type: "string" }, body: { type: "string" } }, required: ["type", "recipients", "title", "body"] as string[] } },
  { name: "get_notification_history", description: "Get notification history with filters", input_schema: { type: "object" as const, properties: { type: { type: "string" }, recipient: { type: "string" }, limit: { type: "number" } }, required: [] as string[] } },
  { name: "get_notification_stats", description: "Get notification statistics by type and status", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "generate_notification_service", description: "Generate full notification system: NotificationService class (multi-channel, bulk, preferences), SSE real-time endpoints, React NotificationBell component", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "generate_notification_bell", description: "Generate React NotificationBell component with SSE real-time, unread badge, dark theme, Hebrew RTL", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
];
