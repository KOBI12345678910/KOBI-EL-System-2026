import { callLLM } from "../llm/client";
import { extractJSON, extractTextContent } from "../llm/parser";
import { readFile, writeFile } from "./fileTool";
import { runCommand } from "./terminalTool";

interface Breakpoint {
  id: string;
  file: string;
  line: number;
  condition?: string;
  enabled: boolean;
}

interface DebugSession {
  id: string;
  status: "running" | "paused" | "stopped" | "error";
  breakpoints: Breakpoint[];
  watches: Record<string, any>;
  output: string[];
}

const sessions = new Map<string, DebugSession>();

export async function startDebug(params: { command: string; breakpoints?: Array<{ file: string; line: number; condition?: string }> }): Promise<{ success: boolean; output: string; sessionId?: string }> {
  const id = `debug_${Date.now()}`;
  const session: DebugSession = {
    id,
    status: "running",
    breakpoints: (params.breakpoints || []).map((bp, i) => ({ id: `bp_${i}`, file: bp.file, line: bp.line, condition: bp.condition, enabled: true })),
    watches: {},
    output: [],
  };
  sessions.set(id, session);

  for (const bp of session.breakpoints) {
    await injectBreakpoint(bp);
  }

  const inspectCmd = params.command.replace(/^(node|tsx|ts-node)/, "$1 --inspect-brk=9229");
  const result = await runCommand({ command: `${inspectCmd} &`, timeout: 5000 });
  session.output.push(result.output || "");

  return { success: true, output: `Debug session started: ${id}\nBreakpoints: ${session.breakpoints.length}\nCommand: ${inspectCmd}`, sessionId: id };
}

export async function stopDebug(params: { sessionId: string }): Promise<{ success: boolean; output: string }> {
  const session = sessions.get(params.sessionId);
  if (!session) return { success: false, output: `Session ${params.sessionId} not found` };

  await runCommand({ command: "kill $(lsof -t -i:9229) 2>/dev/null || true", timeout: 5000 });
  session.status = "stopped";

  for (const bp of session.breakpoints) {
    await removeBreakpoint(bp);
  }

  return { success: true, output: `Debug session ${params.sessionId} stopped` };
}

export async function addBreakpoint(params: { sessionId: string; file: string; line: number; condition?: string }): Promise<{ success: boolean; output: string }> {
  const session = sessions.get(params.sessionId);
  if (!session) return { success: false, output: `Session ${params.sessionId} not found` };

  const bp: Breakpoint = { id: `bp_${Date.now()}`, file: params.file, line: params.line, condition: params.condition, enabled: true };
  session.breakpoints.push(bp);
  await injectBreakpoint(bp);

  return { success: true, output: `Breakpoint ${bp.id} added at ${params.file}:${params.line}${params.condition ? ` (condition: ${params.condition})` : ""}` };
}

export async function removeBreakpointById(params: { sessionId: string; breakpointId: string }): Promise<{ success: boolean; output: string }> {
  const session = sessions.get(params.sessionId);
  if (!session) return { success: false, output: `Session ${params.sessionId} not found` };

  const idx = session.breakpoints.findIndex(bp => bp.id === params.breakpointId);
  if (idx < 0) return { success: false, output: `Breakpoint ${params.breakpointId} not found` };

  await removeBreakpoint(session.breakpoints[idx]);
  session.breakpoints.splice(idx, 1);

  return { success: true, output: `Breakpoint ${params.breakpointId} removed` };
}

export async function analyzeError(params: { error: string; context?: string }): Promise<{ success: boolean; output: string; analysis?: any }> {
  const response = await callLLM({
    system: `You are an expert debugger. Analyze the error and provide:
1. Root cause analysis
2. Stack trace analysis
3. Specific fix with code
4. Related files to check

Respond with JSON:
{
  "rootCause": "",
  "stackAnalysis": "",
  "suggestedFix": "",
  "relatedFiles": []
}`,
    messages: [{ role: "user", content: `Error:\n${params.error}\n\n${params.context ? `Context:\n${params.context}` : ""}` }],
  });

  const analysis = extractJSON(extractTextContent(response.content));
  return {
    success: true,
    output: `Root Cause: ${analysis?.rootCause || "Unknown"}\nStack Analysis: ${analysis?.stackAnalysis || ""}\nSuggested Fix: ${analysis?.suggestedFix || ""}\nRelated Files: ${(analysis?.relatedFiles || []).join(", ")}`,
    analysis,
  };
}

export async function profileCode(params: { file: string }): Promise<{ success: boolean; output: string; profile?: any }> {
  const result = await runCommand({ command: `node --prof ${params.file} 2>&1; node --prof-process isolate-*.log 2>/dev/null | head -100`, timeout: 30000 });
  await runCommand({ command: "rm -f isolate-*.log", timeout: 5000 });

  const response = await callLLM({
    system: `Analyze this Node.js profiling output. Respond with JSON:
{
  "hotspots": [{ "line": 0, "function": "", "time": "", "calls": 0 }],
  "memoryLeaks": [],
  "recommendations": []
}`,
    messages: [{ role: "user", content: result.output || "No profiling output" }],
  });

  const profile = extractJSON(extractTextContent(response.content)) || { hotspots: [], memoryLeaks: [], recommendations: [] };
  return {
    success: true,
    output: `Hotspots: ${profile.hotspots.length}\nMemory Leaks: ${profile.memoryLeaks.length}\nRecommendations:\n${profile.recommendations.join("\n")}`,
    profile,
  };
}

export async function getDebugSessions(): Promise<{ success: boolean; output: string; sessions?: any[] }> {
  const list = Array.from(sessions.values()).map(s => ({ id: s.id, status: s.status, breakpoints: s.breakpoints.length, outputLines: s.output.length }));
  return { success: true, output: list.length === 0 ? "No debug sessions." : list.map(s => `${s.id}: ${s.status} (${s.breakpoints} breakpoints)`).join("\n"), sessions: list };
}

async function injectBreakpoint(bp: Breakpoint) {
  const content = await readFile({ path: bp.file });
  if (!content.success || !content.output) return;
  const lines = content.output.split("\n");
  if (bp.line > 0 && bp.line <= lines.length) {
    const condition = bp.condition ? `if(${bp.condition})` : "";
    lines.splice(bp.line - 1, 0, `${condition} debugger; // KOBI_BP_${bp.id}`);
    await writeFile({ path: bp.file, content: lines.join("\n") });
  }
}

async function removeBreakpoint(bp: Breakpoint) {
  const content = await readFile({ path: bp.file });
  if (!content.success || !content.output) return;
  const cleaned = content.output.split("\n").filter(line => !line.includes(`KOBI_BP_${bp.id}`)).join("\n");
  await writeFile({ path: bp.file, content: cleaned });
}

export const DEBUGGER_TOOLS = [
  { name: "start_debug", description: "Start a debug session with Node.js inspector. Optionally set breakpoints on specific file:line locations.", input_schema: { type: "object" as const, properties: { command: { type: "string", description: "Command to debug (e.g. 'node src/index.ts')" }, breakpoints: { type: "array", items: { type: "object", properties: { file: { type: "string" }, line: { type: "number" }, condition: { type: "string" } }, required: ["file", "line"] }, description: "Initial breakpoints" } }, required: ["command"] as string[] } },
  { name: "stop_debug", description: "Stop a running debug session and clean up breakpoints", input_schema: { type: "object" as const, properties: { sessionId: { type: "string" } }, required: ["sessionId"] as string[] } },
  { name: "add_breakpoint", description: "Add a breakpoint to a debug session at a specific file:line with optional condition", input_schema: { type: "object" as const, properties: { sessionId: { type: "string" }, file: { type: "string" }, line: { type: "number" }, condition: { type: "string", description: "Optional JS condition expression" } }, required: ["sessionId", "file", "line"] as string[] } },
  { name: "remove_breakpoint", description: "Remove a breakpoint from a debug session by ID", input_schema: { type: "object" as const, properties: { sessionId: { type: "string" }, breakpointId: { type: "string" } }, required: ["sessionId", "breakpointId"] as string[] } },
  { name: "analyze_error", description: "Deep AI analysis of an error: root cause, stack analysis, suggested fix, related files", input_schema: { type: "object" as const, properties: { error: { type: "string", description: "Error message or stack trace" }, context: { type: "string", description: "Additional context (file content, recent changes, etc.)" } }, required: ["error"] as string[] } },
  { name: "profile_code", description: "Profile a Node.js file for performance hotspots, memory leaks, and optimization recommendations", input_schema: { type: "object" as const, properties: { file: { type: "string", description: "File to profile" } }, required: ["file"] as string[] } },
  { name: "get_debug_sessions", description: "List all debug sessions with their status and breakpoint count", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
];