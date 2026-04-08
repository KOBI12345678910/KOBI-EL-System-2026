import { writeFile, createDirectory } from "./fileTool";
import { runCommand } from "./terminalTool";

const WORKSPACE = process.env.WORKSPACE_DIR || "./workspace";

export interface MCPServer {
  name: string;
  url: string;
  transport: "stdio" | "http" | "sse";
  tools: MCPToolDef[];
  status: "connected" | "disconnected" | "error";
}

export interface MCPToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}

const servers = new Map<string, MCPServer>();

export async function connectMCPServer(params: {
  name: string;
  url: string;
  transport: string;
  command?: string;
}): Promise<{ success: boolean; output: string; server?: MCPServer }> {
  console.log(`\n🔌 מתחבר לשרת MCP: ${params.name}...`);

  const server: MCPServer = {
    name: params.name,
    url: params.url,
    transport: (params.transport as "stdio" | "http" | "sse") || "http",
    tools: [],
    status: "disconnected",
  };

  try {
    if (server.transport === "http") {
      const result = await runCommand({
        command: `curl -s "${params.url}/tools" -H "Content-Type: application/json"`,
        timeout: 10000,
      });
      if (result.stdout) {
        const tools = JSON.parse(result.stdout);
        server.tools = tools.tools || tools;
        server.status = "connected";
      }
    } else if (server.transport === "stdio" && params.command) {
      const result = await runCommand({
        command: `echo '{"method":"tools/list"}' | ${params.command}`,
        timeout: 10000,
      });
      if (result.stdout) {
        try {
          const response = JSON.parse(result.stdout);
          server.tools = response.tools || [];
          server.status = "connected";
        } catch {}
      }
    }
  } catch {
    server.status = "error";
  }

  servers.set(params.name, server);
  const toolNames = server.tools.map(t => t.name).join(", ");
  return {
    success: server.status === "connected",
    output: server.status === "connected"
      ? `חיבור הצליח! ${server.tools.length} כלים: ${toolNames}`
      : `שגיאה בחיבור ל-${params.name}`,
    server,
  };
}

export async function callMCPTool(params: {
  serverName: string;
  toolName: string;
  args: string;
}): Promise<{ success: boolean; output: string }> {
  const server = servers.get(params.serverName);
  if (!server || server.status !== "connected") {
    return { success: false, output: `שרת לא מחובר: ${params.serverName}` };
  }

  if (server.transport === "http") {
    const result = await runCommand({
      command: `curl -s -X POST "${server.url}/tools/${params.toolName}" -H "Content-Type: application/json" -d '${params.args}'`,
      timeout: 30000,
    });
    return { success: true, output: result.stdout || result.stderr };
  }

  return { success: false, output: `Transport ${server.transport} call לא נתמך עדיין` };
}

export async function listMCPServers(params: {}): Promise<{ success: boolean; output: string }> {
  if (servers.size === 0) return { success: true, output: "אין שרתי MCP מחוברים" };

  const lines = Array.from(servers.values()).map(s => {
    const status = s.status === "connected" ? "✅" : s.status === "error" ? "❌" : "⏸️";
    return `${status} ${s.name} (${s.transport}) — ${s.tools.length} כלים | ${s.url}`;
  });

  return { success: true, output: `שרתי MCP (${servers.size}):\n${lines.join("\n")}` };
}

export async function listMCPTools(params: {}): Promise<{ success: boolean; output: string }> {
  const allTools: string[] = [];
  for (const [name, server] of servers) {
    for (const tool of server.tools) {
      allTools.push(`[${name}] ${tool.name}: ${tool.description}`);
    }
  }
  if (allTools.length === 0) return { success: true, output: "אין כלי MCP זמינים" };
  return { success: true, output: `כלי MCP זמינים (${allTools.length}):\n${allTools.join("\n")}` };
}

export async function disconnectMCPServer(params: {
  name: string;
}): Promise<{ success: boolean; output: string }> {
  if (servers.delete(params.name)) {
    return { success: true, output: `${params.name} נותק ✅` };
  }
  return { success: false, output: `שרת לא נמצא: ${params.name}` };
}

export async function generateMCPServer(params: {
  name: string;
  tools: string;
}): Promise<{ success: boolean; output: string }> {
  console.log(`\n🏗️ מייצר שרת MCP: ${params.name}...`);

  let toolSpecs: Array<{ name: string; description: string; handler: string }>;
  try {
    toolSpecs = JSON.parse(params.tools);
  } catch {
    return { success: false, output: "פורמט כלים לא תקין — נדרש JSON array" };
  }

  const toolsDef = JSON.stringify(toolSpecs.map(t => ({
    name: t.name,
    description: t.description,
    inputSchema: { type: "object", properties: {} },
  })), null, 4);

  const cases = toolSpecs.map(t =>
    `    case "${t.name}":\n      ${t.handler}\n      break;`
  ).join("\n");

  const code = `import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const server = new Server({ name: "${params.name}", version: "1.0.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: ${toolsDef}
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  switch (request.params.name) {
${cases}
    default:
      throw new Error("Unknown tool: " + request.params.name);
  }
});

const transport = new StdioServerTransport();
server.connect(transport);
console.error("${params.name} MCP server running");
`;

  const dir = `${WORKSPACE}/mcp-servers/${params.name}`;
  await createDirectory({ path: dir });
  await writeFile({ path: `${dir}/index.ts`, content: code });
  await runCommand({ command: `cd ${dir} && npm init -y && npm install @modelcontextprotocol/sdk`, timeout: 30000 });

  return { success: true, output: `שרת MCP "${params.name}" נוצר ב-${dir} עם ${toolSpecs.length} כלים` };
}

export const MCP_TOOLS = [
  {
    name: "connect_mcp_server",
    description: "חיבור לשרת MCP — HTTP, stdio, או SSE",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "שם השרת" },
        url: { type: "string", description: "כתובת השרת" },
        transport: { type: "string", description: "stdio, http, sse" },
        command: { type: "string", description: "פקודת הפעלה (עבור stdio)" },
      },
      required: ["name", "url", "transport"] as string[],
    },
  },
  {
    name: "call_mcp_tool",
    description: "קריאה לכלי בשרת MCP מחובר",
    input_schema: {
      type: "object" as const,
      properties: {
        serverName: { type: "string", description: "שם השרת" },
        toolName: { type: "string", description: "שם הכלי" },
        args: { type: "string", description: "ארגומנטים (JSON)" },
      },
      required: ["serverName", "toolName", "args"] as string[],
    },
  },
  {
    name: "list_mcp_servers",
    description: "רשימת שרתי MCP מחוברים",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "list_mcp_tools",
    description: "רשימת כל הכלים הזמינים משרתי MCP",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "disconnect_mcp_server",
    description: "ניתוק שרת MCP",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "שם השרת לניתוק" },
      },
      required: ["name"] as string[],
    },
  },
  {
    name: "generate_mcp_server",
    description: "יצירת שרת MCP חדש — SDK מלא עם כלים מותאמים",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "שם השרת" },
        tools: { type: "string", description: "JSON array של כלים: [{name, description, handler}]" },
      },
      required: ["name", "tools"] as string[],
    },
  },
];
