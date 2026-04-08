import * as fs from "fs";
import * as path from "path";
import { callLLM } from "../llm/client";
import { extractJSON, extractTextContent } from "../llm/parser";

const WORKSPACE_DIR = path.resolve(process.env.WORKSPACE_DIR || "./workspace");
const AGENT_DIR = path.join(WORKSPACE_DIR, ".agent");
const INSIGHTS_FILE = path.join(AGENT_DIR, "insights.json");
const HISTORY_FILE = path.join(AGENT_DIR, "history.json");

interface ProjectInsight {
  patterns: string[];
  conventions: Record<string, string>;
  techStack: string[];
  codeStyle: Record<string, string>;
  commonErrors: string[];
  performanceHotspots: string[];
  lastUpdated: string;
}

interface TaskHistory {
  taskId: string;
  task: string;
  success: boolean;
  stepsCount: number;
  errorsCount: number;
  duration: number;
  fixesApplied: string[];
  timestamp: string;
}

let insights: ProjectInsight = { patterns: [], conventions: {}, techStack: [], codeStyle: {}, commonErrors: [], performanceHotspots: [], lastUpdated: new Date().toISOString() };
let taskHistory: TaskHistory[] = [];

function ensureDir() { if (!fs.existsSync(AGENT_DIR)) fs.mkdirSync(AGENT_DIR, { recursive: true }); }

function loadInsights(): ProjectInsight {
  try { if (fs.existsSync(INSIGHTS_FILE)) return JSON.parse(fs.readFileSync(INSIGHTS_FILE, "utf-8")); } catch {}
  return insights;
}

function loadHistory(): TaskHistory[] {
  try { if (fs.existsSync(HISTORY_FILE)) return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8")); } catch {}
  return [];
}

function save() {
  ensureDir();
  fs.writeFileSync(INSIGHTS_FILE, JSON.stringify(insights, null, 2));
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(taskHistory.slice(-200), null, 2));
}

function init() {
  insights = loadInsights();
  taskHistory = loadHistory();
}
init();

export async function analyzeProject(): Promise<{ success: boolean; output: string; insights?: ProjectInsight }> {
  const fileList: string[] = [];
  const scan = (dir: string, depth = 0) => {
    if (depth > 4) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (["node_modules", ".git", "dist", ".next", ".agent", "coverage"].includes(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isFile()) fileList.push(path.relative(WORKSPACE_DIR, full));
        else if (entry.isDirectory()) scan(full, depth + 1);
      }
    } catch {}
  };
  scan(WORKSPACE_DIR);

  const sampleFiles: Record<string, string> = {};
  const codeFiles = fileList.filter(f => /\.(ts|tsx|js|jsx|py|go|rs)$/.test(f)).slice(0, 15);
  for (const file of codeFiles) {
    try { sampleFiles[file] = fs.readFileSync(path.join(WORKSPACE_DIR, file), "utf-8").slice(0, 2000); } catch {}
  }

  const response = await callLLM({
    system: `Analyze this project and extract insights. Respond with JSON:
{
  "patterns": ["design patterns used"],
  "conventions": { "naming": "", "fileStructure": "", "imports": "" },
  "techStack": ["list of technologies"],
  "codeStyle": { "indentation": "", "quotes": "", "semicolons": "" },
  "commonErrors": ["likely error patterns"],
  "performanceHotspots": ["potential performance issues"]
}`,
    messages: [{ role: "user", content: `Project files (${fileList.length} total):\n${fileList.slice(0, 100).join("\n")}\n\nSample code:\n${Object.entries(sampleFiles).map(([f, c]) => `--- ${f} ---\n${c}`).join("\n\n")}` }],
  });

  const analysis = extractJSON(extractTextContent(response.content));
  if (analysis) {
    insights = { ...analysis, lastUpdated: new Date().toISOString() };
    save();
  }

  return { success: true, output: `Project analyzed:\nTech Stack: ${insights.techStack.join(", ")}\nPatterns: ${insights.patterns.join(", ")}\nConventions: ${JSON.stringify(insights.conventions)}\nPotential issues: ${insights.performanceHotspots.length}`, insights };
}

export async function recordTask(params: { taskId: string; task: string; success: boolean; stepsCount: number; errorsCount: number; duration: number; fixesApplied: string[] }): Promise<{ success: boolean; output: string }> {
  const entry: TaskHistory = { ...params, timestamp: new Date().toISOString() };
  taskHistory.push(entry);

  for (const fix of params.fixesApplied) {
    if (!insights.commonErrors.includes(fix)) {
      insights.commonErrors.push(fix);
      if (insights.commonErrors.length > 50) insights.commonErrors = insights.commonErrors.slice(-50);
    }
  }
  insights.lastUpdated = new Date().toISOString();
  save();

  return { success: true, output: `Task recorded: "${params.task}" — ${params.success ? "success" : "failed"} (${params.errorsCount} errors, ${params.duration}ms)` };
}

export async function getContextForTask(params: { task: string }): Promise<{ success: boolean; output: string }> {
  let context = "";

  if (insights.techStack.length > 0) context += `Tech Stack: ${insights.techStack.join(", ")}\n`;
  if (Object.keys(insights.conventions).length > 0) context += `Conventions: ${JSON.stringify(insights.conventions)}\n`;
  if (insights.patterns.length > 0) context += `Patterns: ${insights.patterns.join(", ")}\n`;

  const relevantHistory = taskHistory
    .filter(h => { const words = params.task.toLowerCase().split(/\s+/); return words.some(w => h.task.toLowerCase().includes(w)); })
    .slice(-5);

  if (relevantHistory.length > 0) {
    context += `\nRelevant past tasks:\n`;
    for (const h of relevantHistory) {
      context += `- "${h.task}" → ${h.success ? "Success" : "Failed"} (${h.errorsCount} errors, ${h.duration}ms)\n`;
      if (h.fixesApplied.length > 0) context += `  Fixes needed: ${h.fixesApplied.join(", ")}\n`;
    }
  }

  if (insights.commonErrors.length > 0) {
    context += `\nCommon errors to watch for:\n${insights.commonErrors.slice(-10).join("\n")}\n`;
  }

  return { success: true, output: context || "No context available yet. Run analyze_project first." };
}

export async function getAgentStats(): Promise<{ success: boolean; output: string; stats?: any }> {
  const total = taskHistory.length;
  if (total === 0) return { success: true, output: "No tasks recorded yet.", stats: { totalTasks: 0, successRate: 0, avgDuration: 0, avgErrors: 0, mostCommonErrors: [] } };

  const successes = taskHistory.filter(t => t.success).length;
  const successRate = Math.round((successes / total) * 100);
  const avgDuration = Math.round(taskHistory.reduce((s, t) => s + t.duration, 0) / total);
  const avgErrors = Math.round(taskHistory.reduce((s, t) => s + t.errorsCount, 0) / total * 10) / 10;

  const errorCounts = new Map<string, number>();
  for (const task of taskHistory) for (const fix of task.fixesApplied) errorCounts.set(fix, (errorCounts.get(fix) || 0) + 1);
  const topErrors = Array.from(errorCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([e]) => e);

  const stats = { totalTasks: total, successRate, avgDuration, avgErrors, mostCommonErrors: topErrors };
  return { success: true, output: `Agent Stats:\n- Total tasks: ${total}\n- Success rate: ${successRate}%\n- Avg duration: ${avgDuration}ms\n- Avg errors: ${avgErrors}\n- Top errors: ${topErrors.join(", ") || "none"}`, stats };
}

export const SMART_CONTEXT_TOOLS = [
  { name: "analyze_project", description: "Deep-analyze the project: detect tech stack, patterns, conventions, code style, common errors, performance hotspots", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "record_task", description: "Record a completed task for learning: success/failure, errors, fixes applied, duration", input_schema: { type: "object" as const, properties: { taskId: { type: "string" }, task: { type: "string" }, success: { type: "boolean" }, stepsCount: { type: "number" }, errorsCount: { type: "number" }, duration: { type: "number" }, fixesApplied: { type: "array", items: { type: "string" } } }, required: ["taskId", "task", "success", "stepsCount", "errorsCount", "duration", "fixesApplied"] as string[] } },
  { name: "get_context_for_task", description: "Get smart context for a new task: relevant history, patterns, common errors to watch for", input_schema: { type: "object" as const, properties: { task: { type: "string", description: "Task description to find relevant context for" } }, required: ["task"] as string[] } },
  { name: "get_agent_stats", description: "Get agent performance statistics: success rate, avg duration, common errors", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
];