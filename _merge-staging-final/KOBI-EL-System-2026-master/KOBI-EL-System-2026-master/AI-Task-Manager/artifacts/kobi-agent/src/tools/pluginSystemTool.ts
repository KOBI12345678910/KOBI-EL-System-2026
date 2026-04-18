import * as fs from "fs";
import * as path from "path";
import { runCommand } from "./terminalTool";

const WORKSPACE_DIR = path.resolve(process.env.WORKSPACE_DIR || "./workspace");
const PLUGINS_DIR = path.join(WORKSPACE_DIR, ".agent", "plugins");

interface PluginInfo {
  name: string;
  version: string;
  description: string;
  author: string;
  enabled: boolean;
  hooks: string[];
  tools: string[];
  config: Record<string, any>;
}

const plugins = new Map<string, PluginInfo & { hookHandlers: Record<string, Function>; toolHandlers: Record<string, { description: string; handler: Function }> }>();
const hookSubscribers = new Map<string, Array<{ pluginName: string; handler: Function }>>();

function ensureDir() {
  if (!fs.existsSync(PLUGINS_DIR)) fs.mkdirSync(PLUGINS_DIR, { recursive: true });
}

export async function loadPlugin(params: { pluginPath: string }): Promise<{ success: boolean; output: string }> {
  try {
    const pluginPath = path.isAbsolute(params.pluginPath) ? params.pluginPath : path.join(WORKSPACE_DIR, params.pluginPath);
    const manifestPath = path.join(pluginPath, "manifest.json");
    if (!fs.existsSync(manifestPath)) return { success: false, output: `No manifest.json found at ${pluginPath}` };

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    const mainPath = path.join(pluginPath, manifest.main);
    if (!fs.existsSync(mainPath)) return { success: false, output: `Main file not found: ${manifest.main}` };

    const mod = require(mainPath);

    const plugin: PluginInfo & { hookHandlers: Record<string, Function>; toolHandlers: Record<string, { description: string; handler: Function }> } = {
      name: manifest.name, version: manifest.version, description: manifest.description, author: manifest.author || "unknown",
      enabled: true, hooks: [], tools: [], config: {}, hookHandlers: {}, toolHandlers: {},
    };

    if (mod.hooks) {
      for (const [hookName, handler] of Object.entries(mod.hooks)) {
        plugin.hooks.push(hookName);
        plugin.hookHandlers[hookName] = handler as Function;
        if (!hookSubscribers.has(hookName)) hookSubscribers.set(hookName, []);
        hookSubscribers.get(hookName)!.push({ pluginName: manifest.name, handler: handler as Function });
      }
    }

    if (mod.tools) {
      for (const [toolName, tool] of Object.entries(mod.tools)) {
        plugin.tools.push(toolName);
        plugin.toolHandlers[toolName] = tool as any;
      }
    }

    if (manifest.config) {
      for (const [key, def] of Object.entries(manifest.config as Record<string, any>)) {
        plugin.config[key] = def.default;
      }
    }

    plugins.set(manifest.name, plugin);
    return { success: true, output: `Loaded plugin "${manifest.name}" v${manifest.version}\nHooks: ${plugin.hooks.join(", ") || "none"}\nTools: ${plugin.tools.join(", ") || "none"}` };
  } catch (e: any) {
    return { success: false, output: `Failed to load plugin: ${e.message}` };
  }
}

export async function installPlugin(params: { source: string }): Promise<{ success: boolean; output: string }> {
  ensureDir();
  const source = params.source;

  if (source.startsWith("http") || source.startsWith("git@")) {
    const name = source.split("/").pop()?.replace(".git", "") || "plugin";
    const destPath = path.join(PLUGINS_DIR, name);
    const result = await runCommand({ command: `git clone ${source} ${destPath}`, timeout: 30000 });
    if (result.success) {
      const loadResult = await loadPlugin({ pluginPath: destPath });
      return { success: loadResult.success, output: `Cloned and ${loadResult.output}` };
    }
    return { success: false, output: `Git clone failed: ${result.output}` };
  }

  if (source.startsWith("/") || source.startsWith(".")) {
    return loadPlugin({ pluginPath: source });
  }

  const destPath = path.join(PLUGINS_DIR, source);
  fs.mkdirSync(destPath, { recursive: true });
  const result = await runCommand({ command: `cd ${destPath} && npm init -y && npm install ${source}`, timeout: 30000 });
  return { success: result.success, output: result.success ? `Installed npm plugin "${source}"` : `Install failed: ${result.output}` };
}

export async function uninstallPlugin(params: { name: string }): Promise<{ success: boolean; output: string }> {
  const plugin = plugins.get(params.name);
  if (!plugin) return { success: false, output: `Plugin "${params.name}" not found` };

  for (const hookName of plugin.hooks) {
    const subs = hookSubscribers.get(hookName);
    if (subs) hookSubscribers.set(hookName, subs.filter(s => s.pluginName !== params.name));
  }

  plugins.delete(params.name);
  const pluginPath = path.join(PLUGINS_DIR, params.name);
  if (fs.existsSync(pluginPath)) fs.rmSync(pluginPath, { recursive: true });
  return { success: true, output: `Uninstalled plugin "${params.name}"` };
}

export async function listPlugins(): Promise<{ success: boolean; output: string }> {
  if (!plugins.size) return { success: true, output: "No plugins installed" };
  return { success: true, output: Array.from(plugins.values()).map(p => `[${p.enabled ? "ON" : "OFF"}] ${p.name} v${p.version}\n  ${p.description}\n  Hooks: ${p.hooks.join(", ") || "none"} | Tools: ${p.tools.join(", ") || "none"}`).join("\n\n") };
}

export async function togglePlugin(params: { name: string }): Promise<{ success: boolean; output: string }> {
  const plugin = plugins.get(params.name);
  if (!plugin) return { success: false, output: `Plugin "${params.name}" not found` };
  plugin.enabled = !plugin.enabled;
  return { success: true, output: `Plugin "${params.name}" is now ${plugin.enabled ? "ENABLED" : "DISABLED"}` };
}

export async function triggerHook(params: { hookName: string; args?: any[] }): Promise<{ success: boolean; output: string }> {
  const subscribers = hookSubscribers.get(params.hookName) || [];
  if (!subscribers.length) return { success: true, output: `No subscribers for hook "${params.hookName}"` };

  const results: string[] = [];
  for (const sub of subscribers) {
    const plugin = plugins.get(sub.pluginName);
    if (!plugin?.enabled) continue;
    try {
      const result = await (sub.handler as any)(...(params.args || []));
      results.push(`${sub.pluginName}: OK${result ? ` → ${JSON.stringify(result).slice(0, 200)}` : ""}`);
    } catch (e: any) {
      results.push(`${sub.pluginName}: ERROR → ${e.message}`);
    }
  }
  return { success: true, output: `Hook "${params.hookName}" results:\n${results.join("\n")}` };
}

export async function callPluginTool(params: { pluginName: string; toolName: string; input?: any }): Promise<{ success: boolean; output: string }> {
  const plugin = plugins.get(params.pluginName);
  if (!plugin?.enabled) return { success: false, output: `Plugin "${params.pluginName}" not found or disabled` };
  const tool = plugin.toolHandlers[params.toolName];
  if (!tool) return { success: false, output: `Tool "${params.toolName}" not found in plugin "${params.pluginName}"` };
  try {
    const result = await (tool.handler as any)(params.input || {});
    return { success: true, output: typeof result === "string" ? result : JSON.stringify(result, null, 2) };
  } catch (e: any) {
    return { success: false, output: `Plugin tool error: ${e.message}` };
  }
}

export async function getAvailableHooks(): Promise<{ success: boolean; output: string }> {
  const hooks = ["before:task", "after:task", "before:step", "after:step", "on:error", "on:file_change", "on:build", "on:deploy", "on:test", "before:commit", "after:commit"];
  return { success: true, output: `Available hooks:\n${hooks.map(h => `  - ${h}`).join("\n")}\n\nActive subscriptions:\n${Array.from(hookSubscribers.entries()).map(([h, subs]) => `  ${h}: ${subs.map(s => s.pluginName).join(", ")}`).join("\n") || "  none"}` };
}

export async function loadAllPlugins(): Promise<{ success: boolean; output: string }> {
  ensureDir();
  if (!fs.existsSync(PLUGINS_DIR)) return { success: true, output: "No plugins directory" };
  const dirs = fs.readdirSync(PLUGINS_DIR, { withFileTypes: true });
  let loaded = 0;
  for (const dir of dirs) {
    if (dir.isDirectory()) {
      const r = await loadPlugin({ pluginPath: path.join(PLUGINS_DIR, dir.name) });
      if (r.success) loaded++;
    }
  }
  return { success: true, output: `Loaded ${loaded} plugins from ${PLUGINS_DIR}` };
}

export const PLUGIN_SYSTEM_TOOLS = [
  { name: "load_plugin", description: "Load a plugin from a directory path (must have manifest.json)", input_schema: { type: "object" as const, properties: { pluginPath: { type: "string", description: "Path to plugin directory" } }, required: ["pluginPath"] as string[] } },
  { name: "install_plugin", description: "Install a plugin from git URL, npm package name, or local path", input_schema: { type: "object" as const, properties: { source: { type: "string", description: "Git URL, npm package, or local path" } }, required: ["source"] as string[] } },
  { name: "uninstall_plugin", description: "Uninstall a plugin and remove its files", input_schema: { type: "object" as const, properties: { name: { type: "string" } }, required: ["name"] as string[] } },
  { name: "list_plugins", description: "List all installed plugins with status, hooks, and tools", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "toggle_plugin", description: "Enable or disable a plugin", input_schema: { type: "object" as const, properties: { name: { type: "string" } }, required: ["name"] as string[] } },
  { name: "trigger_hook", description: "Manually trigger a plugin hook (e.g. before:task, on:build)", input_schema: { type: "object" as const, properties: { hookName: { type: "string", description: "Hook name to trigger" }, args: { type: "array", description: "Arguments to pass" } }, required: ["hookName"] as string[] } },
  { name: "call_plugin_tool", description: "Call a specific tool provided by a plugin", input_schema: { type: "object" as const, properties: { pluginName: { type: "string" }, toolName: { type: "string" }, input: { type: "object" } }, required: ["pluginName", "toolName"] as string[] } },
  { name: "get_available_hooks", description: "List all available hooks and their current subscribers", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "load_all_plugins", description: "Scan and load all plugins from the plugins directory", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
];