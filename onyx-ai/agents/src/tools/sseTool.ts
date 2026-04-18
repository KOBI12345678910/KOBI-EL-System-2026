import { writeFile } from "./fileTool";

interface SSEChannel { name: string; clients: number; lastEvent?: string; eventCount: number }
const channels = new Map<string, SSEChannel>();
const eventLog: Array<{ channel: string; event: string; data: any; timestamp: string }> = [];

export async function createSSEChannel(params: { name: string }): Promise<{ success: boolean; output: string }> {
  channels.set(params.name, { name: params.name, clients: 0, eventCount: 0 });
  return { success: true, output: `Created SSE channel "${params.name}"` };
}

export async function sendSSEEvent(params: { channel: string; event: string; data: any }): Promise<{ success: boolean; output: string }> {
  const ch = channels.get(params.channel);
  if (!ch) return { success: false, output: `Channel "${params.channel}" not found` };
  ch.lastEvent = params.event;
  ch.eventCount++;
  eventLog.push({ channel: params.channel, event: params.event, data: params.data, timestamp: new Date().toISOString() });
  if (eventLog.length > 1000) eventLog.shift();
  return { success: true, output: `Sent event "${params.event}" to channel "${params.channel}" (${ch.clients} clients)` };
}

export async function listSSEChannels(): Promise<{ success: boolean; output: string }> {
  const all = Array.from(channels.values());
  if (!all.length) return { success: true, output: "No SSE channels" };
  return { success: true, output: all.map(c => `${c.name}: ${c.clients} clients, ${c.eventCount} events sent${c.lastEvent ? `, last: ${c.lastEvent}` : ""}`).join("\n") };
}

export async function getSSEEventLog(params: { channel?: string; limit?: number }): Promise<{ success: boolean; output: string }> {
  let events = eventLog;
  if (params.channel) events = events.filter(e => e.channel === params.channel);
  const limited = events.slice(-(params.limit || 50));
  return { success: true, output: limited.map(e => `[${e.timestamp}] ${e.channel}/${e.event}: ${JSON.stringify(e.data).slice(0, 200)}`).join("\n") || "No events" };
}

export async function generateSSEServer(): Promise<{ success: boolean; output: string }> {
  const code = `import { Router, Request, Response } from 'express';

interface SSEClient { id: string; res: Response; channels: Set<string> }
const clients = new Map<string, SSEClient>();

export const sseRouter = Router();

sseRouter.get('/events/:channel', (req: Request, res: Response) => {
  const channel = String(req.params.channel);
  const clientId = Date.now().toString(36) + Math.random().toString(36).slice(2);

  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write(\`data: {"type":"connected","clientId":"\${clientId}"}\\n\\n\`);

  const client: SSEClient = { id: clientId, res, channels: new Set([channel]) };
  clients.set(clientId, client);

  const heartbeat = setInterval(() => res.write(': heartbeat\\n\\n'), 30000);
  req.on('close', () => { clearInterval(heartbeat); clients.delete(clientId); });
});

export function broadcast(channel: string, event: string, data: any) {
  const message = \`event: \${event}\\ndata: \${JSON.stringify(data)}\\n\\n\`;
  for (const [, client] of clients) {
    if (client.channels.has(channel)) client.res.write(message);
  }
}

export function getConnectedClients(): number { return clients.size; }
`;
  await writeFile({ path: "src/sse/server.ts", content: code });
  return { success: true, output: "SSE server generated → src/sse/server.ts\nEndpoint: GET /events/:channel\nFunctions: broadcast, getConnectedClients" };
}

export const SSE_TOOLS = [
  { name: "create_sse_channel", description: "Create a Server-Sent Events channel for real-time updates", input_schema: { type: "object" as const, properties: { name: { type: "string" } }, required: ["name"] as string[] } },
  { name: "send_sse_event", description: "Send an event to an SSE channel", input_schema: { type: "object" as const, properties: { channel: { type: "string" }, event: { type: "string" }, data: {} }, required: ["channel", "event", "data"] as string[] } },
  { name: "list_sse_channels", description: "List all SSE channels with client count and event stats", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "get_sse_event_log", description: "Get recent SSE events log", input_schema: { type: "object" as const, properties: { channel: { type: "string" }, limit: { type: "number" } }, required: [] as string[] } },
  { name: "generate_sse_server", description: "Generate Express SSE server with channel support and heartbeat", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
];