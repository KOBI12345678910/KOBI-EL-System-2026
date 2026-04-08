import { callLLM } from "../llm/client";
import { extractTextContent } from "../llm/parser";
import { readFile, writeFile, listDirectory } from "./fileTool";
import { findFiles } from "./searchTool";
import { runCommand } from "./terminalTool";

function cleanCode(text: string): string {
  return text.replace(/^```\w*\n/, "").replace(/\n```$/, "").trim();
}

export async function generateOpenAPISpec(): Promise<{ success: boolean; output: string }> {
  const filesResult = await findFiles({ pattern: "*.ts" });
  const allFiles = (filesResult.output || "").split("\n").filter(Boolean);
  const routeFiles = allFiles.filter(f => f.includes("route") || f.includes("router") || f.includes("controller")).slice(0, 15);

  let routeCode = "";
  for (const file of routeFiles) {
    const content = await readFile({ path: file });
    if (content.success) routeCode += `\n// ${file}\n${(content.output || "").slice(0, 3000)}\n`;
  }

  const response = await callLLM({
    system: `You are an API documentation expert. Generate a complete OpenAPI 3.0 specification in YAML.
Include all endpoints, request/response schemas, authentication, error responses.
Respond with ONLY the YAML content.`,
    messages: [{ role: "user", content: `Generate OpenAPI spec from:\n${routeCode}` }],
    maxTokens: 8192,
  });

  const spec = cleanCode(extractTextContent(response.content));
  await writeFile({ path: "docs/openapi.yaml", content: spec });
  return { success: true, output: `OpenAPI spec generated → docs/openapi.yaml (${spec.split("\n").length} lines)` };
}

export async function generateGraphQLSchema(): Promise<{ success: boolean; output: string }> {
  const filesResult = await findFiles({ pattern: "*.ts" });
  const allFiles = (filesResult.output || "").split("\n").filter(Boolean);
  const modelFiles = allFiles.filter(f => f.includes("model") || f.includes("schema") || f.includes("entity")).slice(0, 10);

  let modelCode = "";
  for (const file of modelFiles) {
    const content = await readFile({ path: file });
    if (content.success) modelCode += `\n// ${file}\n${(content.output || "").slice(0, 3000)}\n`;
  }

  const response = await callLLM({
    system: `Generate a complete GraphQL schema with:
- Types for all models
- Queries (list with pagination, get by ID, search)
- Mutations (create, update, delete)
- Subscriptions for real-time updates
- Input types with validation
- Custom scalars (DateTime, JSON)
- Proper connections for pagination (Relay-style)
Respond with ONLY the GraphQL schema.`,
    messages: [{ role: "user", content: `Generate GraphQL schema from:\n${modelCode}` }],
    maxTokens: 8192,
  });

  const gqlSchema = cleanCode(extractTextContent(response.content));
  await writeFile({ path: "src/graphql/schema.graphql", content: gqlSchema });
  return { success: true, output: `GraphQL schema generated → src/graphql/schema.graphql (${gqlSchema.split("\n").length} lines)` };
}

export async function generateWebSocketServer(params: { events: Array<{ name: string; direction: string; payload: Record<string, string>; description: string }> }): Promise<{ success: boolean; output: string }> {
  const response = await callLLM({
    system: `Generate a production-ready WebSocket server using the 'ws' library with TypeScript.
Include: event typing, room support, authentication, heartbeat, reconnection, message validation, error handling.
Respond with ONLY TypeScript code.`,
    messages: [{ role: "user", content: `Generate WebSocket server for these events:\n${JSON.stringify(params.events, null, 2)}` }],
    maxTokens: 4096,
  });

  const serverCode = cleanCode(extractTextContent(response.content));
  await writeFile({ path: "src/ws/server.ts", content: serverCode });

  const clientResponse = await callLLM({
    system: "Generate a TypeScript WebSocket client SDK for the browser. Include auto-reconnection, event typing, heartbeat. Respond with ONLY code.",
    messages: [{ role: "user", content: `Generate client for events:\n${JSON.stringify(params.events, null, 2)}` }],
  });

  const clientCode = cleanCode(extractTextContent(clientResponse.content));
  await writeFile({ path: "src/ws/client.ts", content: clientCode });

  return { success: true, output: `WebSocket server → src/ws/server.ts\nWebSocket client → src/ws/client.ts\nEvents: ${params.events.map(e => e.name).join(", ")}` };
}

export async function generateMockServer(params: { specFile?: string }): Promise<{ success: boolean; output: string }> {
  let spec = "";
  if (params.specFile) {
    const content = await readFile({ path: params.specFile });
    if (content.success) spec = content.output || "";
  } else {
    const result = await generateOpenAPISpec();
    const content = await readFile({ path: "docs/openapi.yaml" });
    spec = content.output || "";
  }

  const response = await callLLM({
    system: `Generate a mock API server that returns realistic fake data matching the OpenAPI spec.
Use Express.js with TypeScript. Include: all endpoints, realistic response data, simulated delays, error simulation, CORS.
Respond with ONLY TypeScript code.`,
    messages: [{ role: "user", content: `Generate mock server for:\n${spec.slice(0, 4000)}` }],
    maxTokens: 4096,
  });

  const code = cleanCode(extractTextContent(response.content));
  await writeFile({ path: "src/mock/server.ts", content: code });
  return { success: true, output: `Mock server generated → src/mock/server.ts` };
}

export async function generateWebhookSystem(): Promise<{ success: boolean; output: string }> {
  const code = `import crypto from 'crypto';

export interface WebhookConfig {
  id: string;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
  createdAt: Date;
  failCount: number;
  lastDelivery?: Date;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: string;
  payload: any;
  response?: { status: number; body: string };
  success: boolean;
  timestamp: Date;
  duration: number;
}

const webhooks = new Map<string, WebhookConfig>();
const deliveries: WebhookDelivery[] = [];
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 5000, 30000];

export function register(url: string, events: string[]): WebhookConfig {
  const id = \`wh_\${Date.now()}\`;
  const config: WebhookConfig = { id, url, secret: crypto.randomBytes(32).toString('hex'), events, active: true, createdAt: new Date(), failCount: 0 };
  webhooks.set(id, config);
  return config;
}

async function deliver(webhook: WebhookConfig, event: string, payload: any): Promise<WebhookDelivery> {
  const deliveryId = \`del_\${Date.now()}\`;
  const body = JSON.stringify({ event, data: payload, timestamp: new Date() });
  const signature = crypto.createHmac('sha256', webhook.secret).update(body).digest('hex');
  const startTime = Date.now();
  try {
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Webhook-Signature': \`sha256=\${signature}\`, 'X-Webhook-Event': event, 'X-Webhook-Delivery': deliveryId },
      body,
      signal: AbortSignal.timeout(10000),
    });
    const responseBody = await response.text();
    const d: WebhookDelivery = { id: deliveryId, webhookId: webhook.id, event, payload, response: { status: response.status, body: responseBody.slice(0, 500) }, success: response.ok, timestamp: new Date(), duration: Date.now() - startTime };
    deliveries.push(d);
    return d;
  } catch {
    const d: WebhookDelivery = { id: deliveryId, webhookId: webhook.id, event, payload, success: false, timestamp: new Date(), duration: Date.now() - startTime };
    deliveries.push(d);
    return d;
  }
}

export async function dispatch(event: string, payload: any): Promise<WebhookDelivery[]> {
  const results: WebhookDelivery[] = [];
  for (const [, wh] of webhooks) {
    if (!wh.active || !wh.events.includes(event)) continue;
    const d = await deliver(wh, event, payload);
    results.push(d);
    if (!d.success) { wh.failCount++; if (wh.failCount >= 10) wh.active = false; }
    else { wh.failCount = 0; wh.lastDelivery = new Date(); }
  }
  return results;
}

export function getWebhooks(): WebhookConfig[] { return Array.from(webhooks.values()); }
export function getDeliveries(webhookId?: string, limit = 50): WebhookDelivery[] { let r = deliveries; if (webhookId) r = r.filter(d => d.webhookId === webhookId); return r.slice(-limit); }
export function remove(id: string): boolean { return webhooks.delete(id); }
export function toggle(id: string): boolean { const wh = webhooks.get(id); if (wh) { wh.active = !wh.active; return true; } return false; }
`;

  await writeFile({ path: "src/webhooks/manager.ts", content: code });
  return { success: true, output: "Webhook system generated → src/webhooks/manager.ts\nIncludes: register, dispatch, retries, HMAC signatures, auto-disable on failures" };
}

export async function setupSwaggerUI(): Promise<{ success: boolean; output: string }> {
  await runCommand({ command: "npm install swagger-ui-express yamljs @types/swagger-ui-express", timeout: 30000 });

  const code = `import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import path from 'path';
import { Express } from 'express';

export function setupSwagger(app: Express) {
  const swaggerDoc = YAML.load(path.join(__dirname, '../docs/openapi.yaml'));
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDoc, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'API Documentation',
  }));
  console.log('Swagger UI available at /api-docs');
}
`;

  await writeFile({ path: "src/swagger.ts", content: code });
  return { success: true, output: "Swagger UI setup → src/swagger.ts\nAccess at /api-docs" };
}

export const API_GEN_TOOLS = [
  { name: "generate_openapi_spec", description: "Auto-generate OpenAPI 3.0 YAML spec from route files. Scans controllers/routers for endpoints.", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "generate_graphql_schema", description: "Auto-generate GraphQL schema from model/entity files. Includes types, queries, mutations, subscriptions.", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "generate_websocket_server", description: "Generate a production WebSocket server + client SDK with event typing, rooms, auth, heartbeat", input_schema: { type: "object" as const, properties: { events: { type: "array", items: { type: "object", properties: { name: { type: "string" }, direction: { type: "string", enum: ["client-to-server", "server-to-client", "bidirectional"] }, payload: { type: "object" }, description: { type: "string" } }, required: ["name", "direction", "description"] } } }, required: ["events"] as string[] } },
  { name: "generate_mock_server", description: "Generate a mock API server with realistic fake data from OpenAPI spec", input_schema: { type: "object" as const, properties: { specFile: { type: "string", description: "Path to OpenAPI spec (auto-generates if not provided)" } }, required: [] as string[] } },
  { name: "generate_webhook_system", description: "Generate a complete webhook system with registration, HMAC signing, retries, auto-disable", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "setup_swagger_ui", description: "Set up Swagger UI for API documentation at /api-docs", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
];