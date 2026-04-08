import { callLLM } from "../llm/client";
import { extractJSON, extractTextContent } from "../llm/parser";
import { writeFile, readFile, createDirectory } from "./fileTool";
import { runCommand } from "./terminalTool";

export interface SpawnedAgent {
  id: string;
  name: string;
  type: "telegram-bot" | "slack-bot" | "email-automation" | "cron-automation" | "webhook-agent" | "api-agent" | "custom";
  description: string;
  files: string[];
  status: "created" | "deployed" | "running" | "stopped";
  config: Record<string, any>;
  createdAt: Date;
}

const spawnedAgents = new Map<string, SpawnedAgent>();
const WORKSPACE = process.env.WORKSPACE_DIR || "./workspace";

export async function spawnAgent(params: {
  description: string;
}): Promise<{ success: boolean; output: string; agent?: SpawnedAgent }> {
  console.log(`\n🤖 Spawning agent: ${params.description.slice(0, 80)}...`);

  const response = await callLLM({
    system: `You build autonomous agents from descriptions. Analyze the request and determine:
1. What type of agent (telegram-bot, slack-bot, email-automation, cron-automation, webhook-agent, api-agent, custom)
2. What files need to be created
3. What packages are needed
4. What environment variables are required

Respond with JSON:
{
  "name": "agent-name",
  "type": "type",
  "description": "what this agent does",
  "packages": ["list of npm packages"],
  "envVars": { "VAR_NAME": "description" },
  "files": {
    "path/to/file.ts": "complete file content"
  },
  "entryPoint": "path/to/main.ts",
  "cronSchedule": "if applicable"
}`,
    messages: [{ role: "user", content: `Build this agent: ${params.description}` }],
    maxTokens: 8192,
  });

  const spec = extractJSON(extractTextContent(response.content));
  if (!spec) return { success: false, output: "Failed to design agent" };

  const agentDir = `${WORKSPACE}/agents/${spec.name}`;
  const agent: SpawnedAgent = {
    id: `agent_${Date.now()}`,
    name: spec.name,
    type: spec.type,
    description: spec.description,
    files: [],
    status: "created",
    config: { envVars: spec.envVars, entryPoint: spec.entryPoint },
    createdAt: new Date(),
  };

  await createDirectory({ path: agentDir });

  for (const [filePath, content] of Object.entries(spec.files || {})) {
    const fullPath = `${agentDir}/${filePath}`;
    const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
    await createDirectory({ path: dir });
    await writeFile({ path: fullPath, content: content as string });
    agent.files.push(fullPath);
  }

  const pkgJson = {
    name: spec.name,
    version: "1.0.0",
    scripts: {
      start: `tsx ${spec.entryPoint}`,
      dev: `tsx watch ${spec.entryPoint}`,
    },
    dependencies: Object.fromEntries((spec.packages || []).map((p: string) => [p, "latest"])),
    devDependencies: { tsx: "latest", typescript: "latest" },
  };
  await writeFile({ path: `${agentDir}/package.json`, content: JSON.stringify(pkgJson, null, 2) });
  agent.files.push(`${agentDir}/package.json`);

  if (spec.envVars && Object.keys(spec.envVars).length > 0) {
    const envContent = Object.entries(spec.envVars)
      .map(([key, desc]) => `# ${desc}\n${key}=`)
      .join("\n\n");
    await writeFile({ path: `${agentDir}/.env`, content: envContent });
    agent.files.push(`${agentDir}/.env`);
  }

  await writeFile({ path: `${agentDir}/Dockerfile`, content: `FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["npm", "start"]
` });
  agent.files.push(`${agentDir}/Dockerfile`);

  const install = await runCommand({ command: `cd ${agentDir} && npm install`, timeout: 60000 });

  spawnedAgents.set(agent.id, agent);

  const lines = [
    `## Agent Created: ${agent.name}`,
    `**ID**: ${agent.id}`,
    `**Type**: ${agent.type}`,
    `**Description**: ${agent.description}`,
    `**Files**: ${agent.files.length}`,
    `**Status**: ${agent.status}`,
    install.success ? `**Dependencies**: installed` : `**Dependencies**: install failed`,
  ];

  console.log(`  ✅ Agent ${agent.name} created (${agent.files.length} files)`);
  return { success: true, output: lines.join("\n"), agent };
}

export async function deployAgent(params: {
  agentId: string;
}): Promise<{ success: boolean; output: string }> {
  const agent = spawnedAgents.get(params.agentId);
  if (!agent) return { success: false, output: `Agent ${params.agentId} not found` };

  const agentDir = `${WORKSPACE}/agents/${agent.name}`;
  const result = await runCommand({ command: `cd ${agentDir} && nohup npm start > /tmp/agent-${agent.name}.log 2>&1 &`, timeout: 10000 });

  agent.status = "running";
  return { success: true, output: `Agent ${agent.name} deployed and running. Logs: /tmp/agent-${agent.name}.log` };
}

export async function stopAgent(params: {
  agentId: string;
}): Promise<{ success: boolean; output: string }> {
  const agent = spawnedAgents.get(params.agentId);
  if (!agent) return { success: false, output: `Agent ${params.agentId} not found` };

  await runCommand({ command: `pkill -f "agents/${agent.name}" 2>/dev/null || true`, timeout: 5000 });
  agent.status = "stopped";
  return { success: true, output: `Agent ${agent.name} stopped` };
}

export async function listSpawnedAgents(params: {}): Promise<{ success: boolean; output: string; agents?: SpawnedAgent[] }> {
  const agents = Array.from(spawnedAgents.values());
  if (agents.length === 0) return { success: true, output: "No agents spawned yet" };

  const lines = [
    `## Spawned Agents (${agents.length})`,
    ``,
    ...agents.map(a => {
      const icon = a.status === "running" ? "🟢" : a.status === "stopped" ? "🔴" : "🟡";
      return `${icon} **${a.name}** [${a.id}] — ${a.type} — ${a.status}`;
    }),
  ];

  return { success: true, output: lines.join("\n"), agents };
}

export async function getAgentLogs(params: {
  agentId: string;
  lines?: number;
}): Promise<{ success: boolean; output: string }> {
  const agent = spawnedAgents.get(params.agentId);
  if (!agent) return { success: false, output: `Agent ${params.agentId} not found` };

  const logFile = `/tmp/agent-${agent.name}.log`;
  const tail = params.lines || 50;
  const result = await runCommand({ command: `tail -${tail} ${logFile} 2>/dev/null || echo "No logs found"`, timeout: 5000 });

  return { success: true, output: `## Logs: ${agent.name}\n\n\`\`\`\n${result.stdout}\n\`\`\`` };
}

export const AGENT_SPAWNER_TOOLS = [
  {
    name: "spawn_agent",
    description: "יצירת סוכן אוטונומי חדש — AI מתכנן ובונה: Telegram bot, Slack bot, webhook, cron, API agent, או custom",
    input_schema: {
      type: "object" as const,
      properties: {
        description: { type: "string", description: "תיאור הסוכן הרצוי — מה הוא צריך לעשות" },
      },
      required: ["description"] as string[],
    },
  },
  {
    name: "deploy_agent",
    description: "הפעלת סוכן שנוצר — מריץ כתהליך רקע",
    input_schema: {
      type: "object" as const,
      properties: {
        agentId: { type: "string", description: "ID הסוכן" },
      },
      required: ["agentId"] as string[],
    },
  },
  {
    name: "stop_agent",
    description: "עצירת סוכן פעיל",
    input_schema: {
      type: "object" as const,
      properties: {
        agentId: { type: "string", description: "ID הסוכן" },
      },
      required: ["agentId"] as string[],
    },
  },
  {
    name: "list_spawned_agents",
    description: "רשימת כל הסוכנים שנוצרו — סטטוס, סוג, תיאור",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "get_agent_logs",
    description: "צפייה בלוגים של סוכן פעיל",
    input_schema: {
      type: "object" as const,
      properties: {
        agentId: { type: "string", description: "ID הסוכן" },
        lines: { type: "number", description: "כמות שורות (ברירת מחדל: 50)" },
      },
      required: ["agentId"] as string[],
    },
  },
];
