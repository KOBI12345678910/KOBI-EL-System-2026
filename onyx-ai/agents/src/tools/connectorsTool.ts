import { callLLM } from "../llm/client";
import { extractTextContent } from "../llm/parser";
import { writeFile, createDirectory } from "./fileTool";
import { runCommand } from "./terminalTool";

export interface Connector {
  id: string;
  name: string;
  type: string;
  status: "connected" | "disconnected" | "error";
  config: Record<string, string>;
}

const connectors = new Map<string, Connector>();
const WORKSPACE = process.env.WORKSPACE_DIR || "./workspace";

const AVAILABLE_CONNECTORS = [
  { name: "Stripe", type: "payment", package: "stripe", envVars: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"] },
  { name: "PayPal", type: "payment", package: "@paypal/checkout-server-sdk", envVars: ["PAYPAL_CLIENT_ID", "PAYPAL_SECRET"] },
  { name: "Notion", type: "productivity", package: "@notionhq/client", envVars: ["NOTION_TOKEN"] },
  { name: "Slack", type: "communication", package: "@slack/web-api", envVars: ["SLACK_BOT_TOKEN", "SLACK_SIGNING_SECRET"] },
  { name: "Linear", type: "project", package: "@linear/sdk", envVars: ["LINEAR_API_KEY"] },
  { name: "Google Sheets", type: "data", package: "googleapis", envVars: ["GOOGLE_CLIENT_EMAIL", "GOOGLE_PRIVATE_KEY", "GOOGLE_SHEET_ID"] },
  { name: "SendGrid", type: "email", package: "@sendgrid/mail", envVars: ["SENDGRID_API_KEY"] },
  { name: "Twilio", type: "sms", package: "twilio", envVars: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE"] },
  { name: "OpenAI", type: "ai", package: "openai", envVars: ["OPENAI_API_KEY"] },
  { name: "Supabase", type: "database", package: "@supabase/supabase-js", envVars: ["SUPABASE_URL", "SUPABASE_ANON_KEY"] },
  { name: "Firebase", type: "database", package: "firebase-admin", envVars: ["FIREBASE_PROJECT_ID", "FIREBASE_PRIVATE_KEY", "FIREBASE_CLIENT_EMAIL"] },
  { name: "AWS S3", type: "storage", package: "@aws-sdk/client-s3", envVars: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION", "S3_BUCKET"] },
  { name: "Cloudinary", type: "media", package: "cloudinary", envVars: ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"] },
  { name: "Plaid", type: "fintech", package: "plaid", envVars: ["PLAID_CLIENT_ID", "PLAID_SECRET", "PLAID_ENV"] },
  { name: "BigQuery", type: "data", package: "@google-cloud/bigquery", envVars: ["GOOGLE_APPLICATION_CREDENTIALS"] },
  { name: "Redis", type: "cache", package: "ioredis", envVars: ["REDIS_URL"] },
  { name: "MongoDB", type: "database", package: "mongodb", envVars: ["MONGODB_URI"] },
  { name: "Telegram", type: "bot", package: "telegraf", envVars: ["TELEGRAM_BOT_TOKEN"] },
  { name: "Discord", type: "bot", package: "discord.js", envVars: ["DISCORD_BOT_TOKEN"] },
];

export async function listAvailableConnectors(params: {}): Promise<{ success: boolean; output: string }> {
  const byType = new Map<string, typeof AVAILABLE_CONNECTORS>();
  for (const c of AVAILABLE_CONNECTORS) {
    if (!byType.has(c.type)) byType.set(c.type, []);
    byType.get(c.type)!.push(c);
  }

  const lines = [
    `## Available Connectors (${AVAILABLE_CONNECTORS.length})`,
    ``,
    ...Array.from(byType.entries()).map(([type, items]) => {
      const header = `### ${type.toUpperCase()}`;
      const list = items.map(c => {
        const connected = Array.from(connectors.values()).some(conn => conn.name === c.name);
        return `- ${connected ? "🟢" : "⚪"} **${c.name}** — \`${c.package}\` — env: ${c.envVars.join(", ")}`;
      });
      return [header, ...list].join("\n");
    }),
  ];

  return { success: true, output: lines.join("\n") };
}

export async function connectService(params: {
  connectorName: string;
}): Promise<{ success: boolean; output: string; connector?: Connector }> {
  const spec = AVAILABLE_CONNECTORS.find(c => c.name.toLowerCase() === params.connectorName.toLowerCase());
  if (!spec) {
    return { success: false, output: `Unknown connector: ${params.connectorName}. Available: ${AVAILABLE_CONNECTORS.map(c => c.name).join(", ")}` };
  }

  console.log(`\n🔌 Connecting: ${spec.name}...`);

  await runCommand({ command: `cd ${WORKSPACE} && npm install ${spec.package}`, timeout: 30000 });

  const response = await callLLM({
    system: `Generate a production-ready connector/SDK wrapper for ${spec.name}.
Include: initialization, common operations, error handling, TypeScript types.
Respond with ONLY TypeScript code.`,
    messages: [{
      role: "user",
      content: `Generate ${spec.name} connector using ${spec.package}.
Env vars: ${spec.envVars.join(", ")}
Include: init, common CRUD operations, error handling, types.`,
    }],
  });

  let code = extractTextContent(response.content);
  code = code.replace(/^```\w*\n/, "").replace(/\n```$/, "").trim();

  const filePath = `${WORKSPACE}/src/connectors/${spec.name.toLowerCase().replace(/\s/g, "-")}.ts`;
  const dir = filePath.substring(0, filePath.lastIndexOf("/"));
  await createDirectory({ path: dir });
  await writeFile({ path: filePath, content: code });

  const connector: Connector = {
    id: `conn_${Date.now()}`,
    name: spec.name,
    type: spec.type,
    status: "connected",
    config: Object.fromEntries(spec.envVars.map(v => [v, process.env[v] || ""])),
  };

  connectors.set(connector.id, connector);

  const missingVars = spec.envVars.filter(v => !process.env[v]);
  const lines = [
    `## Connected: ${spec.name}`,
    `**ID**: ${connector.id}`,
    `**Type**: ${spec.type}`,
    `**Package**: ${spec.package}`,
    `**File**: ${filePath}`,
    missingVars.length > 0 ? `\n⚠️ Missing env vars: ${missingVars.join(", ")}` : "✅ All env vars set",
  ];

  console.log(`  ✅ ${spec.name} connected`);
  return { success: true, output: lines.join("\n"), connector };
}

export async function disconnectService(params: {
  connectorId: string;
}): Promise<{ success: boolean; output: string }> {
  const connector = connectors.get(params.connectorId);
  if (!connector) return { success: false, output: `Connector ${params.connectorId} not found` };

  connector.status = "disconnected";
  connectors.delete(params.connectorId);
  return { success: true, output: `${connector.name} disconnected` };
}

export async function listConnectedServices(params: {}): Promise<{ success: boolean; output: string }> {
  const list = Array.from(connectors.values());
  if (list.length === 0) return { success: true, output: "No services connected yet" };

  const lines = [
    `## Connected Services (${list.length})`,
    ``,
    ...list.map(c => {
      const icon = c.status === "connected" ? "🟢" : c.status === "error" ? "🔴" : "⚪";
      return `${icon} **${c.name}** [${c.id}] — ${c.type} — ${c.status}`;
    }),
  ];

  return { success: true, output: lines.join("\n") };
}

export const CONNECTORS_TOOLS = [
  {
    name: "list_available_connectors",
    description: "רשימת כל החיבורים הזמינים — Stripe, Slack, Telegram, Firebase, S3, ועוד 19 שירותים",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "connect_service",
    description: "חיבור שירות חיצוני — התקנת SDK, יצירת קוד connector, בדיקת env vars",
    input_schema: {
      type: "object" as const,
      properties: {
        connectorName: { type: "string", description: "שם השירות (Stripe, Slack, Telegram, etc.)" },
      },
      required: ["connectorName"] as string[],
    },
  },
  {
    name: "disconnect_service",
    description: "ניתוק שירות חיצוני",
    input_schema: {
      type: "object" as const,
      properties: {
        connectorId: { type: "string", description: "ID החיבור" },
      },
      required: ["connectorId"] as string[],
    },
  },
  {
    name: "list_connected_services",
    description: "רשימת שירותים מחוברים כרגע",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
];
