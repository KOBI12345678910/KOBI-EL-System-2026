import { WebSocket, WebSocketServer } from "ws";
import { runCommand } from "../tools/terminalTool";
import { startWatcher, stopAllWatchers } from "../tools/watcherTool";
import { queryLogs } from "../tools/logViewerTool";
import { broadcast } from "../ws/socket";

export interface RealtimeEvent {
  type: string;
  channel: string;
  data: any;
  timestamp: Date;
  source: string;
}

export interface RealtimeChannel {
  name: string;
  subscribers: Set<string>;
  lastEvent?: RealtimeEvent;
  eventCount: number;
}

const clients = new Map<string, { ws: WebSocket; channels: Set<string>; userId?: string }>();
const channels = new Map<string, RealtimeChannel>();
let eventHistory: RealtimeEvent[] = [];
const MAX_HISTORY = 1000;
let wss: WebSocketServer | null = null;
let healthInterval: ReturnType<typeof setInterval> | null = null;
let metricsInterval: ReturnType<typeof setInterval> | null = null;
let initialized = false;

function publishEvent(channel: string, data: any, source = "system"): void {
  const event: RealtimeEvent = {
    type: "event",
    channel,
    data,
    timestamp: new Date(),
    source,
  };

  eventHistory.push(event);
  if (eventHistory.length > MAX_HISTORY) {
    eventHistory = eventHistory.slice(-MAX_HISTORY);
  }

  let ch = channels.get(channel);
  if (!ch) {
    ch = { name: channel, subscribers: new Set(), eventCount: 0 };
    channels.set(channel, ch);
  }
  ch.lastEvent = event;
  ch.eventCount++;

  const msg = JSON.stringify(event);
  for (const subscriberId of ch.subscribers) {
    const client = clients.get(subscriberId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      try { client.ws.send(msg); } catch {}
    }
  }

  broadcast({ type: "realtime", channel, data });
}

function handleClientMessage(clientId: string, msg: any) {
  const client = clients.get(clientId);
  if (!client) return;

  switch (msg.type) {
    case "subscribe": {
      const chName = msg.channel;
      if (!channels.has(chName)) {
        channels.set(chName, { name: chName, subscribers: new Set(), eventCount: 0 });
      }
      channels.get(chName)!.subscribers.add(clientId);
      client.channels.add(chName);

      const history = eventHistory.filter(e => e.channel === chName).slice(-20);
      if (history.length > 0) {
        client.ws.send(JSON.stringify({ type: "history", channel: chName, events: history }));
      }
      break;
    }
    case "unsubscribe": {
      channels.get(msg.channel)?.subscribers.delete(clientId);
      client.channels.delete(msg.channel);
      break;
    }
    case "publish": {
      publishEvent(msg.channel, msg.data, `user:${clientId}`);
      break;
    }
  }
}

function ensureChannel(name: string) {
  if (!channels.has(name)) {
    channels.set(name, { name, subscribers: new Set(), eventCount: 0 });
  }
}

export async function initRealtimeFlow(params: {
  server: any;
}): Promise<{ success: boolean; output: string }> {
  if (initialized) return { success: true, output: "Realtime already initialized" };

  wss = new WebSocketServer({ server: params.server, path: "/realtime" });

  wss.on("connection", (ws: WebSocket) => {
    const clientId = `rt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    clients.set(clientId, { ws, channels: new Set() });

    ws.send(JSON.stringify({
      type: "connected",
      clientId,
      availableChannels: Array.from(channels.keys()),
    }));

    ws.on("message", (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        handleClientMessage(clientId, msg);
      } catch {}
    });

    ws.on("close", () => {
      const client = clients.get(clientId);
      if (client) {
        for (const ch of client.channels) {
          channels.get(ch)?.subscribers.delete(clientId);
        }
      }
      clients.delete(clientId);
    });
  });

  ensureChannel("file-changes");
  ensureChannel("build-status");
  ensureChannel("server-health");
  ensureChannel("logs");
  ensureChannel("system-metrics");
  ensureChannel("agent-status");
  ensureChannel("errors");

  await startWatcher({
    id: "realtime-files",
    patterns: ["**/*"],
    ignored: ["**/node_modules/**", "**/.git/**", "**/.agent/**"],
  }).catch(() => {});

  healthInterval = setInterval(async () => {
    const result = await runCommand({
      command: 'curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null || echo "0"',
      timeout: 3000,
    });
    publishEvent("server-health", {
      status: parseInt(result.stdout.trim()) || 0,
      timestamp: new Date(),
    });
  }, 10000);

  metricsInterval = setInterval(async () => {
    const cpuResult = await runCommand({ command: "top -bn1 2>/dev/null | grep 'Cpu' | awk '{print $2}' || echo '0'", timeout: 3000 });
    const memResult = await runCommand({ command: "free -m 2>/dev/null | awk 'NR==2{printf \"%.1f\", $3/$2*100}' || echo '0'", timeout: 3000 });

    publishEvent("system-metrics", {
      cpu: parseFloat(cpuResult.stdout) || 0,
      memory: parseFloat(memResult.stdout) || 0,
      timestamp: new Date(),
    });
  }, 15000);

  initialized = true;
  console.log("📡 Real-time channels initialized: " + Array.from(channels.keys()).join(", "));
  return { success: true, output: `Realtime initialized with ${channels.size} channels on /realtime` };
}

export async function publishToChannel(params: {
  channel: string;
  data: any;
  source?: string;
}): Promise<{ success: boolean; output: string }> {
  publishEvent(params.channel, params.data, params.source || "api");
  return { success: true, output: `Published to ${params.channel}` };
}

export async function publishAgentStatus(params: {
  taskId: string;
  phase: string;
  progress: number;
  message: string;
}): Promise<{ success: boolean; output: string }> {
  publishEvent("agent-status", params, "agent");
  return { success: true, output: `Agent status: ${params.phase} (${params.progress}%)` };
}

export async function publishError(params: {
  message: string;
  file?: string;
  severity: string;
}): Promise<{ success: boolean; output: string }> {
  publishEvent("errors", params, "system");
  return { success: true, output: `Error published: ${params.message.slice(0, 80)}` };
}

export async function publishBuildStatus(params: {
  phase: string;
  success: boolean;
  output?: string;
}): Promise<{ success: boolean; output: string }> {
  publishEvent("build-status", params, "build");
  return { success: true, output: `Build status: ${params.phase} — ${params.success ? "✅" : "❌"}` };
}

export async function getRealtimeChannels(params: {}): Promise<{ success: boolean; output: string; channels?: any[] }> {
  const chList = Array.from(channels.values()).map(ch => ({
    name: ch.name,
    subscribers: ch.subscribers.size,
    eventCount: ch.eventCount,
    lastEvent: ch.lastEvent?.timestamp,
  }));

  const lines = [
    `## ערוצי Real-Time`,
    ``,
    `**לקוחות מחוברים**: ${clients.size}`,
    `**ערוצים**: ${channels.size}`,
    ``,
    ...chList.map(c => `- **${c.name}**: ${c.subscribers} subscribers, ${c.eventCount} events`),
  ];

  return { success: true, output: lines.join("\n"), channels: chList };
}

export async function getRealtimeHistory(params: {
  channel?: string;
  limit?: number;
}): Promise<{ success: boolean; output: string; events?: RealtimeEvent[] }> {
  const limit = params.limit || 50;
  let events = eventHistory;
  if (params.channel) events = events.filter(e => e.channel === params.channel);
  events = events.slice(-limit);

  return {
    success: true,
    output: `${events.length} events${params.channel ? ` in ${params.channel}` : ""}`,
    events,
  };
}

export async function cleanupRealtime(params: {}): Promise<{ success: boolean; output: string }> {
  if (healthInterval) clearInterval(healthInterval);
  if (metricsInterval) clearInterval(metricsInterval);
  await stopAllWatchers().catch(() => {});

  for (const [, client] of clients) {
    client.ws.close();
  }
  clients.clear();
  channels.clear();
  eventHistory = [];
  initialized = false;

  if (wss) {
    wss.close();
    wss = null;
  }

  return { success: true, output: "Realtime cleaned up" };
}

export const REALTIME_FLOW_TOOLS = [
  {
    name: "init_realtime",
    description: "אתחול מערכת Real-Time — WebSocket בערוצים: file-changes, build-status, server-health, logs, system-metrics, agent-status, errors",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "publish_to_channel",
    description: "פרסום הודעה לערוץ real-time",
    input_schema: {
      type: "object" as const,
      properties: {
        channel: { type: "string", description: "שם הערוץ" },
        data: { type: "object", description: "נתונים לשליחה" },
        source: { type: "string", description: "מקור ההודעה" },
      },
      required: ["channel", "data"] as string[],
    },
  },
  {
    name: "publish_agent_status",
    description: "עדכון סטטוס agent בזמן אמת — taskId, phase, progress, message",
    input_schema: {
      type: "object" as const,
      properties: {
        taskId: { type: "string" },
        phase: { type: "string" },
        progress: { type: "number", description: "0-100" },
        message: { type: "string" },
      },
      required: ["taskId", "phase", "progress", "message"] as string[],
    },
  },
  {
    name: "publish_error_event",
    description: "דיווח שגיאה בזמן אמת",
    input_schema: {
      type: "object" as const,
      properties: {
        message: { type: "string" },
        file: { type: "string" },
        severity: { type: "string", description: "critical|high|medium|low" },
      },
      required: ["message", "severity"] as string[],
    },
  },
  {
    name: "publish_build_status",
    description: "עדכון סטטוס build בזמן אמת",
    input_schema: {
      type: "object" as const,
      properties: {
        phase: { type: "string" },
        success: { type: "boolean" },
        output: { type: "string" },
      },
      required: ["phase", "success"] as string[],
    },
  },
  {
    name: "get_realtime_channels",
    description: "הצגת כל ערוצי real-time, מנויים, ואירועים",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "get_realtime_history",
    description: "היסטוריית אירועים real-time — לפי ערוץ ומגבלה",
    input_schema: {
      type: "object" as const,
      properties: {
        channel: { type: "string", description: "סנן לפי ערוץ" },
        limit: { type: "number", description: "כמות אירועים (ברירת מחדל: 50)" },
      },
      required: [] as string[],
    },
  },
  {
    name: "cleanup_realtime",
    description: "ניקוי מערכת Real-Time — סגירת חיבורים, watchers, intervals",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
];
