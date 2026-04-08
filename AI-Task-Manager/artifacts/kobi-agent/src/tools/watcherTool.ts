import chokidar from "chokidar";
import * as path from "path";

const WORKSPACE_DIR = process.env.WORKSPACE_DIR || process.env.WORKSPACE_ROOT || "/home/runner/workspace";

type WatchEvent = "add" | "change" | "unlink" | "addDir" | "unlinkDir";

interface WatcherInfo {
  watcher: chokidar.FSWatcher;
  patterns: string[];
  events: Array<{ event: WatchEvent; file: string; time: string }>;
}

const watchers: Map<string, WatcherInfo> = new Map();

export async function startWatcher(params: { id: string; patterns: string | string[]; ignored?: string[] }): Promise<{ success: boolean; output: string }> {
  if (watchers.has(params.id)) {
    await stopWatcher({ id: params.id });
  }

  const patterns = Array.isArray(params.patterns) ? params.patterns : [params.patterns];
  const ignored = ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/.next/**", "**/.snapshots/**", ...(params.ignored || [])];

  const watcher = chokidar.watch(patterns, {
    cwd: WORKSPACE_DIR,
    ignored,
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
  });

  const info: WatcherInfo = { watcher, patterns, events: [] };

  const eventTypes: WatchEvent[] = ["add", "change", "unlink", "addDir", "unlinkDir"];
  for (const event of eventTypes) {
    watcher.on(event, (filePath: string) => {
      info.events.push({ event, file: filePath, time: new Date().toISOString() });
      if (info.events.length > 100) info.events.shift();
    });
  }

  watcher.on("error", (error) => console.error(`[Watcher ${params.id}] Error:`, error));

  watchers.set(params.id, info);
  return { success: true, output: `Watcher '${params.id}' started on: ${patterns.join(", ")}` };
}

export async function stopWatcher(params: { id: string }): Promise<{ success: boolean; output: string }> {
  const info = watchers.get(params.id);
  if (!info) return { success: false, output: `Watcher '${params.id}' not found` };
  await info.watcher.close();
  watchers.delete(params.id);
  return { success: true, output: `Watcher '${params.id}' stopped` };
}

export async function stopAllWatchers(): Promise<{ success: boolean; output: string }> {
  const ids = Array.from(watchers.keys());
  for (const id of ids) await stopWatcher({ id });
  return { success: true, output: `Stopped ${ids.length} watchers` };
}

export async function listWatchers(): Promise<{ success: boolean; output: string; watchers?: string[] }> {
  const ids = Array.from(watchers.keys());
  if (ids.length === 0) return { success: true, output: "No active watchers", watchers: [] };
  const lines = ids.map(id => {
    const info = watchers.get(id)!;
    return `${id}: ${info.patterns.join(", ")} (${info.events.length} events)`;
  });
  return { success: true, output: lines.join("\n"), watchers: ids };
}

export async function getWatcherEvents(params: { id: string; last?: number }): Promise<{ success: boolean; output: string; events?: any[] }> {
  const info = watchers.get(params.id);
  if (!info) return { success: false, output: `Watcher '${params.id}' not found` };
  const last = params.last || 20;
  const events = info.events.slice(-last);
  const output = events.length === 0 ? "No events recorded" : events.map(e => `[${e.time}] ${e.event}: ${e.file}`).join("\n");
  return { success: true, output, events };
}

export const WATCHER_TOOLS = [
  { name: "start_watcher", description: "Start a file watcher on patterns (e.g. **/*.ts)", input_schema: { type: "object" as const, properties: { id: { type: "string" }, patterns: { oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }] }, ignored: { type: "array", items: { type: "string" } } }, required: ["id", "patterns"] as string[] } },
  { name: "stop_watcher", description: "Stop a file watcher by ID", input_schema: { type: "object" as const, properties: { id: { type: "string" } }, required: ["id"] as string[] } },
  { name: "stop_all_watchers", description: "Stop all active file watchers", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "list_watchers", description: "List all active file watchers", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "get_watcher_events", description: "Get recent events from a file watcher", input_schema: { type: "object" as const, properties: { id: { type: "string" }, last: { type: "number" } }, required: ["id"] as string[] } },
];