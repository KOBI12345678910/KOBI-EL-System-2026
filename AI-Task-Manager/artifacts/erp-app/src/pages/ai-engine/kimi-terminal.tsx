import { useState, useRef, useEffect, useCallback, useMemo, lazy, Suspense } from "react";
import ActionResultCard, { type ActionResult } from "./action-result-card";
import RenderContentWithCharts from "./render-content-with-charts";
import { ACTION_LABELS } from "./action-labels";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bot, Send, Trash2, Loader2, Zap, ChevronDown, Sparkles,
  Search, MessageSquare, Plus, Users, ChevronRight,
  History, X, Menu, Copy, RotateCcw, StopCircle, Maximize2, Minimize2,
  Terminal, Cpu, Globe, Layers, Hash, FolderTree, Code2,
  Database, Activity, Play, FileCode, Folder,
  FolderOpen, RefreshCw, AlertTriangle, CheckCircle2,
  XCircle, Eye, Wrench, Server, Table2,
  BarChart3, Shield, FileText, PanelLeftClose, PanelLeftOpen,
  Bug, Wand2, Network, GitBranch, GitCommit,
  ArrowLeftRight, BookOpen, MonitorCheck, FlaskConical, Gauge, ArrowRight, ImagePlus
} from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { authFetch } from "@/lib/utils";

const MonacoEditor = lazy(() => import("@monaco-editor/react").then(m => ({ default: m.default })));

const API = "/api";

function extractActionBlocks(text: string): Array<{ actionType: string; params: any }> {
  const blocks: Array<{ actionType: string; params: any }> = [];
  const regex = /```kimi-action\s*\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    try {
      let raw = match[1].trim();
      if (raw.startsWith("json")) raw = raw.slice(4).trim();
      const parsed = JSON.parse(raw);
      if (parsed.actionType) {
        blocks.push(parsed);
      }
    } catch {}
  }
  return blocks;
}



interface KimiAgent { id: number; name: string; description: string; category: string; systemPrompt: string; defaultModel: string; icon: string; isActive: boolean; }
interface Message { role: "user" | "assistant"; content: string; timestamp: Date; images?: string[]; actionResults?: ActionResult[]; isExecution?: boolean; }
interface Conversation { id: number; agentId: number | null; title: string; model: string; totalMessages: number; createdAt: string; updatedAt: string; }
interface KimiStatus { configured: boolean; name: string; defaultModel: string; availableModels: string[]; provider: string; }
interface ModelInfo { id: string; name: string; description: string; contextWindow: number; }
interface ChatTab { id: string; title: string; agent: KimiAgent | null; conversationId: number | null; messages: Message[]; streamingContent: string; isStreaming: boolean; model: string; pendingImages: string[]; loopCount?: number; }
interface FileItem { name: string; path: string; type: "directory" | "file"; extension?: string; }
interface TerminalLine { type: "input" | "output" | "error"; content: string; timestamp: Date; }
interface DbTable { table_name: string; column_count: number; }
interface SystemHealth { status: string; database: { latencyMs: number; tableCount: number }; server: { uptimeSeconds: number; memoryMB: number; maxMemoryMB: number }; topTables: any[]; timestamp: string; }
interface RouteHealth { route: string; status: number; latencyMs: number; ok: boolean; error?: string; category?: string; }

const MODEL_LABELS: Record<string, string> = {
  "moonshot-v1-8k": "8K — מהיר", "moonshot-v1-32k": "32K — מאוזן", "moonshot-v1-128k": "128K — רב-עצמה",
  "kimi-k2.5": "Kimi K2.5 — ראשי", "kimi-k2-thinking": "Kimi K2 Thinking — חשיבה עמוקה", "kimi-k2-thinking-turbo": "Kimi K2 Turbo — מהיר",
  "gpt-4o-mini": "GPT-4o Mini — מהיר", "gpt-4o": "GPT-4o — מתקדם",
};

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  "מכירות": { bg: "bg-blue-500/15", text: "text-blue-300", border: "border-blue-500/30" },
  "כספים": { bg: "bg-emerald-500/15", text: "text-emerald-300", border: "border-emerald-500/30" },
  "משאבי אנוש": { bg: "bg-violet-500/15", text: "text-violet-300", border: "border-violet-500/30" },
  "לוגיסטיקה": { bg: "bg-orange-500/15", text: "text-orange-300", border: "border-orange-500/30" },
  "רכש": { bg: "bg-pink-500/15", text: "text-pink-300", border: "border-pink-500/30" },
  "ייצור": { bg: "bg-yellow-500/15", text: "text-yellow-300", border: "border-yellow-500/30" },
  "CRM": { bg: "bg-cyan-500/15", text: "text-cyan-300", border: "border-cyan-500/30" },
  "שיווק": { bg: "bg-rose-500/15", text: "text-rose-300", border: "border-rose-500/30" },
  "IT": { bg: "bg-indigo-500/15", text: "text-indigo-300", border: "border-indigo-500/30" },
  "ניהול": { bg: "bg-amber-500/15", text: "text-amber-300", border: "border-amber-500/30" },
};

function createTab(agent?: KimiAgent | null, model?: string): ChatTab {
  return {
    id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: agent ? (typeof agent.name === "string" ? agent.name : String(agent.name ?? "סוכן")) : "צ׳אט חופשי",
    agent: agent || null, conversationId: null, messages: [], streamingContent: "", isStreaming: false,
    model: agent?.defaultModel || model || "kimi-k2.5", pendingImages: [],
  };
}

function FileTreeNode({ item, depth, onSelect, expandedDirs, toggleDir }: { item: FileItem; depth: number; onSelect: (path: string) => void; expandedDirs: Set<string>; toggleDir: (path: string) => void }) {
  const isExpanded = expandedDirs.has(item.path);
  const Icon = item.type === "directory" ? (isExpanded ? FolderOpen : Folder) : FileCode;
  const extColors: Record<string, string> = { tsx: "text-blue-400", ts: "text-blue-300", js: "text-yellow-400", json: "text-green-400", css: "text-pink-400", sql: "text-orange-400" };
  return (
    <button
      onClick={() => item.type === "directory" ? toggleDir(item.path) : onSelect(item.path)}
      className="w-full flex items-center gap-1.5 py-0.5 px-1 hover:bg-card/5 rounded text-xs text-left group"
      style={{ paddingRight: `${depth * 12 + 4}px` }}
    >
      {item.type === "directory" && <ChevronRight className={`w-3 h-3 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />}
      <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${item.type === "directory" ? "text-amber-400" : extColors[item.extension || ""] || "text-muted-foreground"}`} />
      <span className="truncate text-gray-300 group-hover:text-foreground">{item.name}</span>
    </button>
  );
}

function DevFileTree({ onFileSelect }: { onFileSelect: (path: string) => void }) {
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set(["artifacts"]));
  const [treeData, setTreeData] = useState<Record<string, FileItem[]>>({});

  const loadDir = useCallback(async (dirPath: string) => {
    try {
      const r = await authFetch(`${API}/kimi/dev/file-tree?path=${encodeURIComponent(dirPath)}`);
      const d = await r.json();
      setTreeData(prev => ({ ...prev, [dirPath]: d.items || [] }));
    } catch {}
  }, []);

  useEffect(() => { loadDir(""); }, [loadDir]);

  const toggleDir = useCallback((dirPath: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev);
      if (next.has(dirPath)) { next.delete(dirPath); } else { next.add(dirPath); loadDir(dirPath); }
      return next;
    });
  }, [loadDir]);

  const renderItems = (items: FileItem[], depth: number): JSX.Element[] => {
    return items.map(item => (
      <div key={item.path}>
        <FileTreeNode item={item} depth={depth} onSelect={onFileSelect} expandedDirs={expandedDirs} toggleDir={toggleDir} />
        {item.type === "directory" && expandedDirs.has(item.path) && treeData[item.path] &&
          renderItems(treeData[item.path], depth + 1)}
      </div>
    ));
  };

  return (
    <div className="overflow-y-auto h-full p-1 text-xs">
      <div className="flex items-center gap-1 px-2 py-1 mb-1 text-muted-foreground text-[10px] uppercase tracking-wider">
        <FolderTree className="w-3 h-3" /> סייר קבצים
      </div>
      {treeData[""] ? renderItems(treeData[""], 0) : <div className="text-muted-foreground text-center py-4"><Loader2 className="w-4 h-4 animate-spin mx-auto" /></div>}
    </div>
  );
}

const TERMINAL_QUICK_COMMANDS = [
  { label: "בריאות מערכת", cmd: "curl -s http://localhost:${PORT:-8080}/api/health | node -e \"let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.stringify(JSON.parse(d),null,2)))\"" },
  { label: "גודל פרויקט", cmd: "find artifacts -name '*.ts' -o -name '*.tsx' | wc -l && echo 'TypeScript files'" },
  { label: "שורות קוד", cmd: "wc -l artifacts/erp-app/src/pages/ai-engine/kimi-terminal.tsx artifacts/api-server/src/routes/kimi/dev-platform.ts artifacts/api-server/src/routes/kimi/agents.ts" },
  { label: "דיסק", cmd: "du -sh artifacts/* | sort -rh" },
  { label: "Node גרסה", cmd: "node -v && npm -v && pnpm -v" },
  { label: "Git סטטוס", cmd: "git status --short && echo '---' && git log --oneline -5" },
  { label: "תהליכים", cmd: "ps aux | grep -E 'node|tsx' | grep -v grep | head -10" },
  { label: "ENV", cmd: "env | grep -E '^(PORT|NODE_ENV|DATABASE)' | sort" },
];

function DevTerminalPanel() {
  const [lines, setLines] = useState<TerminalLine[]>([{ type: "output", content: "Kimi Dev Terminal v3.0 — World-Class Terminal\n📌 Quick commands above | ↑↓ history | Ctrl+L clear", timestamp: new Date() }]);
  const [cmd, setCmd] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [cmdTime, setCmdTime] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight); }, [lines]);

  const run = async () => {
    if (!cmd.trim()) return;
    const command = cmd.trim();
    if (command === "clear" || command === "cls") {
      setLines([{ type: "output", content: "Terminal cleared.", timestamp: new Date() }]);
      setCmd(""); return;
    }
    if (command === "help") {
      setLines(prev => [...prev, { type: "input", content: `$ help`, timestamp: new Date() },
        { type: "output", content: "Available quick commands:\n" + TERMINAL_QUICK_COMMANDS.map(c => `  ${c.label}: ${c.cmd.slice(0, 60)}...`).join("\n") + "\n\nType any bash command. Use ↑↓ for history. Ctrl+L to clear.", timestamp: new Date() }]);
      setCmd(""); return;
    }
    setLines(prev => [...prev, { type: "input", content: `$ ${command}`, timestamp: new Date() }]);
    setHistory(prev => [command, ...prev].slice(0, 50));
    setCmd(""); setHistIdx(-1);
    const start = Date.now();
    try {
      const r = await authFetch(`${API}/kimi/dev/terminal`, { method: "POST", body: JSON.stringify({ command }) });
      const d = await r.json();
      setCmdTime(Date.now() - start);
      setLines(prev => [...prev, { type: d.exitCode === 0 ? "output" : "error", content: d.output || d.error || "(no output)", timestamp: new Date() }]);
    } catch (err: any) {
      setLines(prev => [...prev, { type: "error", content: `Error: ${err.message}`, timestamp: new Date() }]);
    }
  };

  return (
    <div className="flex flex-col h-full bg-card font-mono text-xs">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-card">
        <span className="text-muted-foreground text-[10px] flex items-center gap-1"><Terminal className="w-3 h-3" /> TERMINAL v3.0</span>
        <div className="flex items-center gap-2">
          {cmdTime !== null && <span className="text-muted-foreground text-[10px]">⚡ {cmdTime}ms</span>}
          <button onClick={() => setLines([{ type: "output", content: "Terminal cleared.", timestamp: new Date() }])} className="text-muted-foreground hover:text-gray-300"><Trash2 className="w-3 h-3" /></button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1 px-2 py-1.5 border-b border-border/50 bg-card/50">
        {TERMINAL_QUICK_COMMANDS.map((qc, i) => (
          <button key={i} onClick={() => { setCmd(qc.cmd); inputRef.current?.focus(); }}
            className="px-1.5 py-0.5 bg-green-500/10 text-green-400 border border-green-500/20 rounded text-[9px] hover:bg-green-500/20 transition-colors whitespace-nowrap">
            {qc.label}
          </button>
        ))}
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {lines.map((l, i) => (
          <div key={i} className={l.type === "input" ? "text-cyan-400" : l.type === "error" ? "text-red-400" : "text-gray-300"}>
            <pre className="whitespace-pre-wrap break-all">{l.content}</pre>
          </div>
        ))}
      </div>
      <div className="flex items-center border-t border-border bg-card">
        <span className="text-green-400 px-2 text-sm">$</span>
        <input ref={inputRef}
          value={cmd} onChange={e => setCmd(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") run();
            if (e.key === "l" && e.ctrlKey) { e.preventDefault(); setLines([{ type: "output", content: "Terminal cleared.", timestamp: new Date() }]); }
            if (e.key === "ArrowUp") { e.preventDefault(); const idx = Math.min(histIdx + 1, history.length - 1); setHistIdx(idx); setCmd(history[idx] || ""); }
            if (e.key === "ArrowDown") { e.preventDefault(); const idx = Math.max(histIdx - 1, -1); setHistIdx(idx); setCmd(idx >= 0 ? history[idx] : ""); }
          }}
          className="flex-1 bg-transparent text-foreground outline-none py-2 text-xs" placeholder="הקלד פקודה... (↑↓ היסטוריה, Ctrl+L ניקוי)"
        />
      </div>
    </div>
  );
}

const SQL_TEMPLATES = [
  { label: "טבלאות + שורות", sql: "SELECT relname AS table_name, n_live_tup AS row_count FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 30" },
  { label: "סוכני AI", sql: "SELECT id, name, category, is_active FROM kimi_agents ORDER BY category, name LIMIT 50" },
  { label: "חשבון עובר ושב", sql: "SELECT account_number, account_name, account_type, current_balance FROM chart_of_accounts WHERE is_active = true ORDER BY account_number LIMIT 30" },
  { label: "יומן רישומים", sql: "SELECT id, entry_date, description, debit_amount, credit_amount, status FROM general_ledger ORDER BY entry_date DESC LIMIT 20" },
  { label: "גודל טבלאות", sql: "SELECT relname, pg_size_pretty(pg_total_relation_size(relid)) AS size, n_live_tup AS rows FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 20" },
  { label: "שיחות Kimi", sql: "SELECT id, title, model, total_messages, created_at FROM kimi_conversations ORDER BY created_at DESC LIMIT 20" },
  { label: "ספקים", sql: "SELECT * FROM suppliers ORDER BY created_at DESC LIMIT 20" },
  { label: "חומרי גלם", sql: "SELECT * FROM raw_materials ORDER BY name LIMIT 20" },
];

function DevDatabasePanel() {
  const [sqlInput, setSqlInput] = useState(SQL_TEMPLATES[0].sql);
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [queryTime, setQueryTime] = useState<number | null>(null);
  const [activeView, setActiveView] = useState<"query" | "tables" | "schema">("tables");
  const [selectedTable, setSelectedTable] = useState<string | null>(null);

  const { data: tables } = useQuery<{ tables: DbTable[] }>({
    queryKey: ["dev-db-tables"],
    queryFn: async () => { const r = await authFetch(`${API}/kimi/dev/db-tables`); return r.json(); },
    staleTime: 120_000,
    refetchOnWindowFocus: false,
  });

  const { data: schema } = useQuery({
    queryKey: ["dev-db-schema", selectedTable],
    queryFn: async () => { if (!selectedTable) return null; const r = await authFetch(`${API}/kimi/dev/db-schema/${selectedTable}`); return r.json(); },
    enabled: !!selectedTable,
    staleTime: 120_000,
    refetchOnWindowFocus: false,
  });

  const runQuery = async () => {
    if (!sqlInput.trim()) return;
    setLoading(true);
    const start = Date.now();
    try {
      const r = await authFetch(`${API}/kimi/dev/sql`, { method: "POST", body: JSON.stringify({ query: sqlInput }) });
      const d = await r.json();
      setQueryTime(Date.now() - start);
      setResults(d);
    } catch (err: any) { setResults({ error: err.message }); setQueryTime(null); }
    setLoading(false);
  };

  return (
    <div className="flex flex-col h-full text-xs">
      <div className="flex border-b border-border bg-card">
        {(["tables", "query", "schema"] as const).map(v => (
          <button key={v} onClick={() => setActiveView(v)}
            className={`px-4 py-2 text-xs font-medium ${activeView === v ? "text-cyan-400 border-b-2 border-cyan-400 bg-cyan-400/5" : "text-muted-foreground hover:text-gray-300"}`}>
            {v === "tables" ? "טבלאות" : v === "query" ? "שאילתה" : "סכמה"}
          </button>
        ))}
        <div className="flex-1" />
        <span className="text-muted-foreground text-[10px] self-center px-3">{tables?.tables?.length || 0} טבלאות</span>
      </div>
      <div className="flex-1 overflow-hidden">
        {activeView === "tables" && (
          <div className="overflow-y-auto h-full p-2 space-y-0.5">
            {(tables?.tables || []).map((t: DbTable) => (
              <button key={t.table_name} onClick={() => { setSelectedTable(t.table_name); setActiveView("schema"); }}
                className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-card/5 rounded text-right group">
                <div className="flex items-center gap-2">
                  <Table2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-gray-300 group-hover:text-foreground">{t.table_name}</span>
                </div>
                <span className="text-muted-foreground text-[10px]">{t.column_count} cols</span>
              </button>
            ))}
          </div>
        )}
        {activeView === "query" && (
          <div className="flex flex-col h-full">
            <div className="p-3">
              <div className="flex flex-wrap gap-1 mb-2">
                {SQL_TEMPLATES.map((t, i) => (
                  <button key={i} onClick={() => setSqlInput(t.sql)}
                    className="px-2 py-0.5 bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded text-[10px] hover:bg-cyan-500/20 transition-colors">
                    {t.label}
                  </button>
                ))}
              </div>
              <textarea value={sqlInput} onChange={e => setSqlInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runQuery(); } }}
                className="w-full h-24 bg-card text-green-300 font-mono text-xs p-3 rounded border border-border outline-none resize-none focus:border-cyan-500/50"
                placeholder="SELECT * FROM ... (Ctrl+Enter להרצה)" dir="ltr" />
              <div className="flex items-center gap-2 mt-2">
                <button onClick={runQuery} disabled={loading}
                  className="px-4 py-1.5 bg-emerald-600 text-foreground rounded text-xs hover:bg-emerald-500 disabled:opacity-50 flex items-center gap-1.5">
                  {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />} הרץ שאילתה
                </button>
                <button onClick={() => setSqlInput("")} className="px-3 py-1.5 text-muted-foreground hover:text-gray-300 text-xs">נקה</button>
                {queryTime !== null && <span className="text-muted-foreground text-[10px]">⚡ {queryTime}ms</span>}
              </div>
            </div>
            {results && (
              <div className="flex-1 overflow-auto p-3 border-t border-border">
                {results.error ? (
                  <div className="text-red-400 p-3 bg-red-900/20 rounded border border-red-500/20">{results.error}</div>
                ) : (
                  <div className="overflow-x-auto">
                    <div className="text-muted-foreground mb-2 flex items-center gap-2">
                      <CheckCircle2 className="w-3 h-3 text-green-400" />
                      {results.rowCount || 0} תוצאות
                    </div>
                    {Array.isArray(results.rows) && results.rows.length > 0 && (
                      <table className="min-w-full text-[11px]" dir="ltr">
                        <thead><tr className="border-b border-border">
                          {Object.keys(results.rows[0]).map(k => <th key={k} className="px-2 py-1.5 text-left text-muted-foreground font-medium bg-muted/30">{k}</th>)}
                        </tr></thead>
                        <tbody>
                          {results.rows.slice(0, 100).map((row: any, i: number) => (
                            <tr key={i} className="border-b border-border/50 hover:bg-card/5">
                              {Object.values(row).map((v: any, j: number) => <td key={j} className="px-2 py-1 text-gray-300 max-w-[200px] truncate">{String(v ?? "NULL")}</td>)}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {activeView === "schema" && selectedTable && (
          <div className="overflow-y-auto h-full p-3">
            <div className="flex items-center gap-2 mb-3">
              <Table2 className="w-4 h-4 text-emerald-400" />
              <span className="text-foreground font-medium text-sm">{selectedTable}</span>
              {schema?.rowCount && <span className="text-muted-foreground text-xs bg-muted px-2 py-0.5 rounded">{schema.rowCount} rows</span>}
            </div>
            <div className="space-y-0.5">
              {(schema?.columns || []).map((c: any) => (
                <div key={c.column_name} className="flex items-center justify-between px-3 py-1.5 hover:bg-card/5 rounded">
                  <div className="flex items-center gap-2">
                    <Hash className="w-3 h-3 text-muted-foreground" />
                    <span className="text-gray-300">{c.column_name}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px]">
                    <span className="text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded">{c.data_type}</span>
                    {c.is_nullable === "NO" && <span className="text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded">NOT NULL</span>}
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => { setSqlInput(`SELECT * FROM "${selectedTable}" LIMIT 20;`); setActiveView("query"); }}
              className="mt-3 px-4 py-1.5 bg-blue-600/30 text-blue-300 rounded text-xs hover:bg-blue-600/50 flex items-center gap-1.5">
              <Eye className="w-3 h-3" /> הצג נתונים
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function DevSystemHealthPanel() {
  const { data: health, isLoading, refetch } = useQuery<SystemHealth>({
    queryKey: ["dev-system-health"],
    queryFn: async () => { const r = await authFetch(`${API}/kimi/dev/system-health`); return r.json(); },
    staleTime: 60000,
    refetchInterval: 120000,
  });

  const { data: routeHealth, refetch: refetchRoutes } = useQuery<{ results: RouteHealth[] }>({
    queryKey: ["dev-route-health"],
    queryFn: async () => { const r = await authFetch(`${API}/kimi/dev/route-health`); return r.json(); },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const { data: deepAnalysis, refetch: refetchDeep, isFetching: deepLoading } = useQuery<any>({
    queryKey: ["dev-deep-analysis"],
    queryFn: async () => { const r = await authFetch(`${API}/kimi/dev/deep-analysis`); return r.json(); },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  if (isLoading) return <div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin text-cyan-400" /></div>;

  const okRoutes = routeHealth?.results?.filter(r => r.ok).length || 0;
  const totalRoutes = routeHealth?.results?.length || 0;
  const memPct = health ? Math.round((health.server.memoryMB / health.server.maxMemoryMB) * 100) : 0;
  const scoreColor = (deepAnalysis?.score || 0) >= 80 ? "text-green-400" : (deepAnalysis?.score || 0) >= 50 ? "text-yellow-400" : "text-red-400";

  return (
    <div className="overflow-y-auto h-full p-4 space-y-4 text-xs">
      <div className="flex items-center justify-between">
        <h3 className="text-foreground font-semibold flex items-center gap-2"><Activity className="w-4 h-4 text-green-400" /> מוניטור מערכת v3.0</h3>
        <button onClick={() => { refetch(); refetchRoutes(); refetchDeep(); }} className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-[10px]"><RefreshCw className="w-3 h-3" /> רענן הכל</button>
      </div>

      {deepAnalysis && (
        <div className="bg-gradient-to-r from-cyan-500/10 via-purple-500/10 to-emerald-500/10 border border-cyan-500/20 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-muted-foreground text-[10px] uppercase">ניתוח עמוק | Deep Analysis</span>
            {deepLoading && <Loader2 className="w-3 h-3 animate-spin text-cyan-400" />}
          </div>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-3">
            <div className="text-center">
              <div className={`text-2xl font-bold ${scoreColor}`}>{deepAnalysis.score}%</div>
              <div className="text-muted-foreground text-[9px]">ציון בריאות</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-cyan-400">{deepAnalysis.totalTables}</div>
              <div className="text-muted-foreground text-[9px]">טבלאות</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-purple-400">{deepAnalysis.totalRows?.toLocaleString()}</div>
              <div className="text-muted-foreground text-[9px]">שורות</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-emerald-400">{deepAnalysis.apiAvgLatency}ms</div>
              <div className="text-muted-foreground text-[9px]">ממוצע API</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-blue-400">{deepAnalysis.memoryMB}MB</div>
              <div className="text-muted-foreground text-[9px]">זיכרון</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-amber-400">{deepAnalysis.uptimeMinutes}m</div>
              <div className="text-muted-foreground text-[9px]">uptime</div>
            </div>
          </div>
          {deepAnalysis.recommendations?.length > 0 && (
            <div className="space-y-1 mt-2 pt-2 border-t border-border">
              {deepAnalysis.recommendations.map((r: string, i: number) => (
                <div key={i} className="text-gray-300 text-[11px] px-2 py-1 bg-black/30 rounded">{r}</div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
          <div className="flex items-center gap-1.5 text-emerald-400 text-[10px] mb-1"><Database className="w-3 h-3" /> מסד נתונים</div>
          <div className="text-foreground font-bold text-lg">{health?.database?.latencyMs || 0}<span className="text-xs font-normal text-muted-foreground">ms</span></div>
          <div className="text-muted-foreground text-[10px]">{health?.database?.tableCount || 0} טבלאות</div>
        </div>
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
          <div className="flex items-center gap-1.5 text-blue-400 text-[10px] mb-1"><Server className="w-3 h-3" /> זיכרון</div>
          <div className="text-foreground font-bold text-lg">{health?.server?.memoryMB || 0}<span className="text-xs font-normal text-muted-foreground">MB</span></div>
          <div className="h-1.5 bg-muted rounded-full mt-1"><div className={`h-full rounded-full ${memPct > 80 ? "bg-red-500" : "bg-blue-500"}`} style={{ width: `${memPct}%` }} /></div>
        </div>
        <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-3">
          <div className="flex items-center gap-1.5 text-purple-400 text-[10px] mb-1"><Globe className="w-3 h-3" /> API Routes</div>
          <div className="text-foreground font-bold text-lg">{okRoutes}<span className="text-xs font-normal text-muted-foreground">/{totalRoutes}</span></div>
          <div className="text-muted-foreground text-[10px]">{Math.round((okRoutes / Math.max(totalRoutes, 1)) * 100)}% תקינות</div>
        </div>
        <div className={`${health?.status === "healthy" ? "bg-green-500/10 border-green-500/20" : "bg-red-500/10 border-red-500/20"} border rounded-xl p-3`}>
          <div className="text-[10px] mb-1 flex items-center gap-1.5" style={{ color: health?.status === "healthy" ? "#4ade80" : "#f87171" }}>
            <MonitorCheck className="w-3 h-3" /> סטטוס כללי
          </div>
          <div className="text-foreground font-bold text-lg flex items-center gap-1.5">
            {health?.status === "healthy" ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
            {health?.status === "healthy" ? "תקין" : "תקלה"}
          </div>
          <div className="text-muted-foreground text-[10px]">uptime: {Math.round((health?.server?.uptimeSeconds || 0) / 60)}m</div>
        </div>
      </div>

      {routeHealth?.results && (
        <div>
          <h4 className="text-muted-foreground text-[10px] uppercase mb-2 flex items-center gap-1"><Shield className="w-3 h-3" /> בדיקת נתיבי API</h4>
          <div className="space-y-0.5 bg-card rounded-lg p-2 border border-border">
            {routeHealth.results.map((r: RouteHealth) => (
              <div key={r.route} className="flex items-center justify-between px-2 py-1 hover:bg-card/5 rounded">
                <div className="flex items-center gap-1.5">
                  {r.ok ? <CheckCircle2 className="w-3 h-3 text-green-400" /> : <XCircle className="w-3 h-3 text-red-400" />}
                  <span className="text-gray-300 font-mono text-[11px]">{r.route}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={r.ok ? "text-green-400" : "text-red-400"}>{r.status}</span>
                  <span className="text-muted-foreground w-12 text-left">{r.latencyMs}ms</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {health?.topTables && (
        <div>
          <h4 className="text-muted-foreground text-[10px] uppercase mb-2 flex items-center gap-1"><BarChart3 className="w-3 h-3" /> טבלאות מובילות</h4>
          <div className="space-y-0.5 bg-card rounded-lg p-2 border border-border">
            {health.topTables.slice(0, 10).map((t: any) => {
              const count = Number(t.row_count || t.n_live_tup || 0);
              const maxCount = Math.max(...health.topTables.slice(0, 10).map((x: any) => Number(x.row_count || x.n_live_tup || 0)), 1);
              return (
                <div key={t.table_name || t.relname} className="flex items-center gap-2 px-2 py-1">
                  <span className="text-gray-300 w-40 truncate">{t.table_name || t.relname}</span>
                  <div className="flex-1 h-1.5 bg-muted rounded-full"><div className="h-full bg-cyan-500/60 rounded-full" style={{ width: `${(count / maxCount) * 100}%` }} /></div>
                  <span className="text-cyan-400 font-mono text-[10px] w-16 text-left">{count.toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function DevQAPanel() {
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState<any>(null);

  const runFullScan = async () => {
    setScanning(true);
    try {
      const r = await authFetch(`${API}/kimi/dev/route-health-full`);
      const d = await r.json();
      setResults(d);
    } catch { setResults(null); }
    setScanning(false);
  };

  const categories = useMemo(() => {
    if (!results?.results) return {};
    const groups: Record<string, RouteHealth[]> = {};
    for (const r of results.results) {
      const cat = r.category || "Other";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(r);
    }
    return groups;
  }, [results]);

  return (
    <div className="overflow-y-auto h-full p-4 space-y-4 text-xs">
      <div className="flex items-center justify-between">
        <h3 className="text-foreground font-semibold flex items-center gap-2"><FlaskConical className="w-4 h-4 text-amber-400" /> QA Dashboard</h3>
        <button onClick={runFullScan} disabled={scanning}
          className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-foreground rounded-lg flex items-center gap-1.5">
          {scanning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
          {scanning ? "סורק..." : "הרץ בדיקות"}
        </button>
      </div>

      {results?.summary && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-center">
            <div className="text-blue-400 text-[10px]">סה"כ</div>
            <div className="text-foreground font-bold text-xl">{results.summary.total}</div>
          </div>
          <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 text-center">
            <div className="text-green-400 text-[10px]">עברו</div>
            <div className="text-green-400 font-bold text-xl">{results.summary.passed}</div>
          </div>
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-center">
            <div className="text-red-400 text-[10px]">נכשלו</div>
            <div className="text-red-400 font-bold text-xl">{results.summary.failed}</div>
          </div>
          <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-3 text-center">
            <div className="text-purple-400 text-[10px]">ממוצע</div>
            <div className="text-foreground font-bold text-xl">{results.summary.avgLatency}<span className="text-xs font-normal">ms</span></div>
          </div>
          <div className={`${results.summary.score >= 80 ? "bg-green-500/10 border-green-500/20" : results.summary.score >= 50 ? "bg-yellow-500/10 border-yellow-500/20" : "bg-red-500/10 border-red-500/20"} border rounded-xl p-3 text-center`}>
            <div className="text-[10px]" style={{ color: results.summary.score >= 80 ? "#4ade80" : results.summary.score >= 50 ? "#facc15" : "#f87171" }}>ציון</div>
            <div className="font-bold text-xl" style={{ color: results.summary.score >= 80 ? "#4ade80" : results.summary.score >= 50 ? "#facc15" : "#f87171" }}>{results.summary.score}%</div>
          </div>
        </div>
      )}

      {Object.entries(categories).map(([cat, routes]) => {
        const passed = (routes as RouteHealth[]).filter(r => r.ok).length;
        const total = (routes as RouteHealth[]).length;
        return (
          <div key={cat}>
            <div className="flex items-center gap-2 mb-2">
              <h4 className="text-gray-300 font-medium">{cat}</h4>
              <span className={`text-[10px] px-2 py-0.5 rounded ${passed === total ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                {passed}/{total}
              </span>
            </div>
            <div className="bg-card rounded-lg border border-border overflow-hidden">
              {(routes as RouteHealth[]).map(r => (
                <div key={r.route} className={`flex items-center justify-between px-3 py-2 border-b border-border/50 last:border-0 ${!r.ok ? "bg-red-500/5" : ""}`}>
                  <div className="flex items-center gap-2">
                    {r.ok ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> : <XCircle className="w-3.5 h-3.5 text-red-400" />}
                    <code className="text-gray-300 text-[11px]">{r.route}</code>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`font-mono ${r.ok ? "text-green-400" : "text-red-400"}`}>{r.status}</span>
                    <span className="text-muted-foreground font-mono">{r.latencyMs}ms</span>
                    {r.error && <span className="text-red-400 text-[10px] truncate max-w-[150px]">{typeof r.error === "string" ? r.error : JSON.stringify(r.error)}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {!results && !scanning && (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <FlaskConical className="w-12 h-12 mb-3 opacity-30" />
          <p>לחץ "הרץ בדיקות" לסריקת כל נתיבי ה-API</p>
          <p className="text-[10px] mt-1">סורק Core, Finance, AI, Kimi routes</p>
        </div>
      )}
    </div>
  );
}

function DevVersionControlPanel() {
  const { data: gitData, isLoading, refetch } = useQuery({
    queryKey: ["dev-git-log"],
    queryFn: async () => {
      const r = await authFetch(`${API}/kimi/dev/git-log`);
      if (!r.ok) throw new Error("Failed to load git data");
      return r.json();
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const [diffFile, setDiffFile] = useState<string | null>(null);
  const [diffContent, setDiffContent] = useState("");

  const loadDiff = async (filePath?: string) => {
    try {
      const url = filePath ? `${API}/kimi/dev/git-diff?path=${encodeURIComponent(filePath)}` : `${API}/kimi/dev/git-diff`;
      const r = await authFetch(url);
      const d = await r.json();
      setDiffContent(d.diff || "(no diff)");
      setDiffFile(filePath || "all");
    } catch { setDiffContent("Error loading diff"); }
  };

  if (isLoading) return <div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin text-cyan-400" /></div>;

  return (
    <div className="flex h-full">
      <div className="w-72 border-l border-border overflow-y-auto bg-card">
        <div className="p-3 border-b border-border">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-foreground font-medium flex items-center gap-1.5"><GitBranch className="w-4 h-4 text-cyan-400" /> Version Control</h4>
            <button onClick={() => refetch()} className="text-muted-foreground hover:text-foreground"><RefreshCw className="w-3 h-3" /></button>
          </div>
          {gitData?.branches && (
            <div className="space-y-0.5">
              {gitData.branches.slice(0, 5).map((b: any) => (
                <div key={b.name} className="flex items-center gap-1.5 text-[10px] px-2 py-1 bg-muted/30 rounded">
                  <GitBranch className="w-3 h-3 text-green-400" />
                  <span className="text-gray-300 truncate">{b.name}</span>
                  <span className="text-muted-foreground mr-auto">{b.hash}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        {gitData?.changedFiles?.length > 0 && (
          <div className="p-3 border-b border-border">
            <h4 className="text-muted-foreground text-[10px] uppercase mb-2">שינויים ({gitData.changedFiles.length})</h4>
            <button onClick={() => loadDiff()} className="w-full px-2 py-1 bg-blue-600/20 text-blue-300 rounded text-[10px] mb-2 hover:bg-blue-600/30">
              הצג כל השינויים
            </button>
            <div className="space-y-0.5">
              {gitData.changedFiles.map((f: any) => (
                <button key={f.path} onClick={() => loadDiff(f.path)}
                  className="w-full flex items-center gap-1.5 px-2 py-1 hover:bg-card/5 rounded text-left">
                  <span className={`text-[10px] font-mono w-4 ${f.status === "M" ? "text-amber-400" : f.status === "A" ? "text-green-400" : f.status === "D" ? "text-red-400" : "text-muted-foreground"}`}>
                    {f.status}
                  </span>
                  <span className="text-gray-300 text-[10px] truncate">{f.path}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="p-3">
          <h4 className="text-muted-foreground text-[10px] uppercase mb-2">היסטוריה</h4>
          <pre className="text-[10px] text-muted-foreground whitespace-pre font-mono leading-relaxed" dir="ltr">
            {gitData?.log || "No commits found"}
          </pre>
        </div>
      </div>
      <div className="flex-1 overflow-auto bg-card">
        {diffFile ? (
          <div className="p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-300 text-xs font-mono flex items-center gap-1.5"><GitCommit className="w-3 h-3 text-cyan-400" /> {diffFile === "all" ? "All Changes" : diffFile}</span>
              <button onClick={() => { setDiffFile(null); setDiffContent(""); }} className="text-muted-foreground hover:text-foreground"><X className="w-3 h-3" /></button>
            </div>
            <pre className="text-[11px] font-mono whitespace-pre-wrap text-gray-300 bg-card rounded-lg p-3 border border-border" dir="ltr">
              {diffContent.split("\n").map((line, i) => (
                <span key={i} className={line.startsWith("+") ? "text-green-400" : line.startsWith("-") ? "text-red-400" : line.startsWith("@@") ? "text-cyan-400" : "text-muted-foreground"}>
                  {line}{"\n"}
                </span>
              ))}
            </pre>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <GitCommit className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-xs">בחר קובץ לצפייה בשינויים</p>
          </div>
        )}
      </div>
    </div>
  );
}

function DevPreviewPanel() {
  const [previewUrl, setPreviewUrl] = useState("/");
  const [urlInput, setUrlInput] = useState("/");
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const navigate = () => { setPreviewUrl(urlInput); };
  const quickLinks = [
    { label: "דשבורד", path: "/" },
    { label: "לקוחות", path: "/customers" },
    { label: "מוצרים", path: "/products" },
    { label: "חשבוניות", path: "/invoices" },
    { label: "חשבשבת", path: "/finance/accounting-portal" },
    { label: "יומן", path: "/finance/journal" },
    { label: "מאזן", path: "/finance/balance-sheet" },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card">
        <button onClick={() => iframeRef.current?.contentWindow?.location.reload()} className="text-muted-foreground hover:text-foreground"><RefreshCw className="w-3.5 h-3.5" /></button>
        <div className="flex-1 flex items-center bg-card rounded border border-border px-2 gap-1">
          <Globe className="w-3 h-3 text-muted-foreground" />
          <input value={urlInput} onChange={e => setUrlInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && navigate()}
            className="flex-1 bg-transparent text-gray-300 text-xs py-1 outline-none font-mono" dir="ltr" />
        </div>
        <button onClick={navigate} className="px-3 py-1 bg-blue-600 text-foreground rounded text-xs hover:bg-blue-500">Go</button>
      </div>
      <div className="flex items-center gap-1 px-3 py-1 border-b border-border bg-card overflow-x-auto">
        {quickLinks.map(l => (
          <button key={l.path} onClick={() => { setUrlInput(l.path); setPreviewUrl(l.path); }}
            className={`px-2 py-0.5 rounded text-[10px] whitespace-nowrap ${previewUrl === l.path ? "bg-cyan-500/15 text-cyan-400" : "text-muted-foreground hover:text-gray-300"}`}>
            {l.label}
          </button>
        ))}
      </div>
      <div className="flex-1 bg-card">
        <iframe ref={iframeRef} src={previewUrl} className="w-full h-full border-0" title="Preview" />
      </div>
    </div>
  );
}

function DevDataFlowPanel() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["dev-data-flow"],
    queryFn: async () => {
      const r = await authFetch(`${API}/kimi/dev/data-flow`);
      return r.json();
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  if (isLoading) return <div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin text-cyan-400" /></div>;

  const flows = data?.flows || [];
  const stats = data?.departmentStats || {};
  const deptColors: Record<string, string> = {
    "מכירות": "from-blue-500 to-blue-600", "חשבונות": "from-emerald-500 to-emerald-600",
    "מלאי": "from-orange-500 to-orange-600", "רכש": "from-pink-500 to-pink-600",
    "ייצור": "from-yellow-500 to-yellow-600", "משאבי אנוש": "from-violet-500 to-violet-600",
    "CRM": "from-cyan-500 to-cyan-600", "פרויקטים": "from-indigo-500 to-indigo-600",
  };

  return (
    <div className="overflow-y-auto h-full p-4 space-y-4 text-xs">
      <div className="flex items-center justify-between">
        <h3 className="text-foreground font-semibold flex items-center gap-2"><Network className="w-4 h-4 text-blue-400" /> זרימת נתונים בין מחלקות</h3>
        <button onClick={() => refetch()} className="text-muted-foreground hover:text-foreground"><RefreshCw className="w-3 h-3" /></button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {Object.entries(stats).map(([dept, count]) => (
          <div key={dept} className="bg-muted/30 border border-border/50 rounded-xl p-3 text-center">
            <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${deptColors[dept] || "from-gray-500 to-gray-600"} mx-auto mb-1 flex items-center justify-center`}>
              <Layers className="w-4 h-4 text-foreground" />
            </div>
            <div className="text-gray-300 text-[10px]">{dept}</div>
            <div className="text-foreground font-bold">{count as number} חיבורים</div>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <h4 className="text-muted-foreground text-[10px] uppercase flex items-center gap-1"><ArrowLeftRight className="w-3 h-3" /> זרימות פעילות</h4>
        {flows.map((f: any, i: number) => (
          <div key={i} className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${f.status === "active" ? "bg-card border-border" : "bg-yellow-500/5 border-yellow-500/20"}`}>
            <div className={`px-2 py-1 rounded-lg bg-gradient-to-r ${deptColors[f.from] || "from-gray-500 to-gray-600"} text-foreground text-[11px] font-medium`}>
              {f.from}
            </div>
            <div className="flex items-center gap-1 text-muted-foreground">
              <ArrowRight className="w-4 h-4" />
            </div>
            <div className={`px-2 py-1 rounded-lg bg-gradient-to-r ${deptColors[f.to] || "from-gray-500 to-gray-600"} text-foreground text-[11px] font-medium`}>
              {f.to}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-gray-300 text-[11px]">{f.type}</div>
              <div className="text-muted-foreground text-[10px] font-mono">{f.table}</div>
            </div>
            <span className={`px-2 py-0.5 rounded text-[10px] ${f.status === "active" ? "bg-green-500/10 text-green-400" : "bg-yellow-500/10 text-yellow-400"}`}>
              {f.status === "active" ? "פעיל" : "מתוכנן"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DevModuleBuilderPanel({ onSendToChat }: { onSendToChat: (msg: string) => void }) {
  const [moduleName, setModuleName] = useState("");
  const [moduleDesc, setModuleDesc] = useState("");
  const [includeApi, setIncludeApi] = useState(true);
  const [includeDb, setIncludeDb] = useState(true);
  const [includePage, setIncludePage] = useState(true);

  const generate = () => {
    const prompt = `צור מודול חדש למערכת ERP בשם "${moduleName}":
תיאור: ${moduleDesc}
${includePage ? "✅ צור דף React עם טבלה, טופס, וחיפוש" : ""}
${includeApi ? "✅ צור API endpoints (CRUD) עם Express" : ""}
${includeDb ? "✅ צור סכמת מסד נתונים עם Drizzle ORM" : ""}

דרישות:
- השתמש ב-authFetch לכל קריאות API
- הוסף safeArray() לכל תשובות API
- הוסף תמיכה RTL בעברית
- השתמש בעיצוב TailwindCSS מותאם לשאר המערכת
- הוסף pagination, חיפוש, ומיון
- צור seed data עם לפחות 10 רשומות

אנא ספק את כל הקוד הנדרש עם הסברים.`;
    onSendToChat(prompt);
  };

  return (
    <div className="overflow-y-auto h-full p-4 space-y-4 text-xs">
      <h3 className="text-foreground font-semibold flex items-center gap-2"><Wand2 className="w-4 h-4 text-purple-400" /> בונה מודולים</h3>
      <div className="bg-card rounded-xl border border-border p-4 space-y-3">
        <div>
          <label className="text-muted-foreground text-[10px] block mb-1">שם המודול</label>
          <input value={moduleName} onChange={e => setModuleName(e.target.value)}
            className="w-full bg-card text-foreground px-3 py-2 rounded-lg border border-border outline-none text-xs focus:border-purple-500/50" placeholder="לדוגמה: ניהול ספקים" />
        </div>
        <div>
          <label className="text-muted-foreground text-[10px] block mb-1">תיאור</label>
          <textarea value={moduleDesc} onChange={e => setModuleDesc(e.target.value)}
            className="w-full h-20 bg-card text-foreground px-3 py-2 rounded-lg border border-border outline-none resize-none text-xs focus:border-purple-500/50" placeholder="תאר את הפונקציונליות..." />
        </div>
        <div className="space-y-2">
          {[
            { id: "page", label: "דף React (UI)", desc: "טבלה, טפסים, חיפוש, מיון", checked: includePage, set: setIncludePage, color: "text-blue-400" },
            { id: "api", label: "API Endpoints", desc: "CRUD routes עם Express", checked: includeApi, set: setIncludeApi, color: "text-emerald-400" },
            { id: "db", label: "סכמת מסד נתונים", desc: "Drizzle ORM schema + migration", checked: includeDb, set: setIncludeDb, color: "text-orange-400" },
          ].map(opt => (
            <label key={opt.id} className="flex items-center gap-3 text-gray-300 cursor-pointer p-2 hover:bg-card/5 rounded-lg">
              <input type="checkbox" checked={opt.checked} onChange={e => opt.set(e.target.checked)} className="rounded border-border w-4 h-4" />
              <div>
                <div className={opt.color}>{opt.label}</div>
                <div className="text-muted-foreground text-[10px]">{opt.desc}</div>
              </div>
            </label>
          ))}
        </div>
        <button onClick={generate} disabled={!moduleName.trim()}
          className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:opacity-50 text-foreground rounded-lg flex items-center justify-center gap-2 font-medium">
          <Sparkles className="w-4 h-4" /> צור מודול עם AI
        </button>
      </div>
    </div>
  );
}

function DevBugScannerPanel({ onSendToChat }: { onSendToChat: (msg: string) => void }) {
  const [scanning, setScanning] = useState(false);
  const [scanResults, setScanResults] = useState<RouteHealth[] | null>(null);

  const scan = async () => {
    setScanning(true);
    try {
      const r = await authFetch(`${API}/kimi/dev/route-health`);
      const d = await r.json();
      setScanResults(d.results || []);
    } catch { setScanResults([]); }
    setScanning(false);
  };

  const fixBugs = () => {
    const broken = (scanResults || []).filter(r => !r.ok);
    if (broken.length === 0) return;
    const prompt = `נמצאו ${broken.length} נתיבי API שבורים:\n${broken.map(r => `- ${r.route}: status ${r.status}${r.error ? ` (${r.error})` : ""}`).join("\n")}\n\nאנא נתח כל שגיאה והצע פתרון. כלול קוד מתוקן.`;
    onSendToChat(prompt);
  };

  const passed = scanResults?.filter(r => r.ok).length || 0;
  const total = scanResults?.length || 0;

  return (
    <div className="overflow-y-auto h-full p-4 space-y-4 text-xs">
      <h3 className="text-foreground font-semibold flex items-center gap-2"><Bug className="w-4 h-4 text-red-400" /> סורק באגים</h3>
      <button onClick={scan} disabled={scanning}
        className="w-full py-2.5 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 disabled:opacity-50 text-foreground rounded-lg flex items-center justify-center gap-2 font-medium">
        {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
        {scanning ? "סורק..." : "סרוק נתיבי API"}
      </button>

      {scanResults && (
        <>
          <div className="flex items-center gap-3 p-3 bg-card rounded-xl border border-border">
            <Gauge className="w-8 h-8 text-cyan-400" />
            <div>
              <div className="text-foreground font-bold text-lg">{passed}/{total} <span className="text-xs font-normal text-muted-foreground">תקינים</span></div>
              <div className="h-2 w-40 bg-muted rounded-full mt-1">
                <div className={`h-full rounded-full ${passed === total ? "bg-green-500" : "bg-amber-500"}`} style={{ width: `${(passed / Math.max(total, 1)) * 100}%` }} />
              </div>
            </div>
          </div>

          <div className="space-y-0.5 bg-card rounded-lg border border-border overflow-hidden">
            {scanResults.map(r => (
              <div key={r.route} className={`flex items-center gap-2 px-3 py-2 border-b border-border/50 last:border-0 ${!r.ok ? "bg-red-500/5" : ""}`}>
                {r.ok ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> : <XCircle className="w-3.5 h-3.5 text-red-400" />}
                <span className={`font-mono text-[11px] ${r.ok ? "text-muted-foreground" : "text-red-300"}`}>{r.route}</span>
                <span className="text-muted-foreground mr-auto font-mono">{r.latencyMs}ms</span>
              </div>
            ))}
          </div>

          {scanResults.some(r => !r.ok) && (
            <button onClick={fixBugs}
              className="w-full py-2 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-foreground rounded-lg flex items-center justify-center gap-2 font-medium">
              <Wrench className="w-4 h-4" /> תקן עם AI
            </button>
          )}
        </>
      )}
    </div>
  );
}

function DevDocsPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["dev-api-routes"],
    queryFn: async () => {
      const r = await authFetch(`${API}/kimi/dev/api-routes`);
      return r.json();
    },
    staleTime: 300_000,
    refetchOnWindowFocus: false,
  });

  if (isLoading) return <div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin text-cyan-400" /></div>;

  return (
    <div className="overflow-y-auto h-full p-4 space-y-4 text-xs">
      <h3 className="text-foreground font-semibold flex items-center gap-2"><BookOpen className="w-4 h-4 text-blue-400" /> תיעוד מערכת</h3>

      <div className="bg-card rounded-xl border border-border p-4">
        <h4 className="text-gray-300 font-medium mb-3 flex items-center gap-1.5"><Server className="w-3.5 h-3.5 text-emerald-400" /> API Routes ({(data?.apiRoutes || []).length})</h4>
        <div className="space-y-0.5">
          {(data?.apiRoutes || []).map((route: string) => (
            <div key={route} className="flex items-center gap-2 px-3 py-1.5 bg-card rounded font-mono text-[11px]">
              <span className="text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded text-[9px]">USE</span>
              <span className="text-gray-300">{route}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border p-4">
        <h4 className="text-gray-300 font-medium mb-3 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 text-blue-400" /> Frontend Pages ({(data?.frontendPages || []).length})</h4>
        <div className="grid grid-cols-2 gap-1">
          {(data?.frontendPages || []).map((page: string) => (
            <div key={page} className="flex items-center gap-1.5 px-2 py-1 text-[10px] bg-card rounded truncate">
              <FileCode className="w-3 h-3 text-blue-400 flex-shrink-0" />
              <span className="text-muted-foreground truncate">{page}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border p-4 space-y-2">
        <h4 className="text-gray-300 font-medium flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-amber-400" /> מבנה הפרויקט</h4>
        <div className="text-muted-foreground text-[11px] space-y-1 font-mono" dir="ltr">
          <div className="text-cyan-400">artifacts/</div>
          <div className="pr-4">
            <div className="text-blue-400">├── erp-app/ <span className="text-muted-foreground">← React+Vite frontend</span></div>
            <div className="text-emerald-400">├── api-server/ <span className="text-muted-foreground">← Express 5 API</span></div>
            <div className="text-orange-400">├── erp-mobile/ <span className="text-muted-foreground">← Expo mobile app</span></div>
            <div className="text-muted-foreground">└── mockup-sandbox/ <span className="text-muted-foreground">← Component preview</span></div>
          </div>
          <div className="text-purple-400 mt-1">packages/</div>
          <div className="pr-4">
            <div className="text-purple-300">└── db/ <span className="text-muted-foreground">← Drizzle ORM + PostgreSQL</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

type WorkspaceTab = "chat" | "editor" | "terminal" | "files" | "preview" | "tests" | "database" | "monitor" | "docs" | "git" | "modules" | "bugs" | "dataflow" | "swarm";

const WORKSPACE_TABS: { id: WorkspaceTab; icon: any; label: string; color: string }[] = [
  { id: "chat", icon: MessageSquare, label: "צ'אט", color: "text-cyan-400" },
  { id: "editor", icon: Code2, label: "עורך קוד", color: "text-blue-400" },
  { id: "terminal", icon: Terminal, label: "טרמינל", color: "text-green-400" },
  { id: "files", icon: FolderTree, label: "קבצים", color: "text-amber-400" },
  { id: "preview", icon: Globe, label: "תצוגה מקדימה", color: "text-purple-400" },
  { id: "tests", icon: FlaskConical, label: "בדיקות", color: "text-amber-400" },
  { id: "database", icon: Database, label: "מסד נתונים", color: "text-emerald-400" },
  { id: "monitor", icon: Activity, label: "מוניטור", color: "text-green-400" },
  { id: "git", icon: GitBranch, label: "גרסאות", color: "text-orange-400" },
  { id: "dataflow", icon: Network, label: "זרימת נתונים", color: "text-blue-400" },
  { id: "modules", icon: Wand2, label: "בונה מודולים", color: "text-purple-400" },
  { id: "bugs", icon: Bug, label: "סורק באגים", color: "text-red-400" },
  { id: "docs", icon: BookOpen, label: "תיעוד", color: "text-blue-400" },
  { id: "swarm", icon: Users, label: "נחיל סוכנים", color: "text-pink-400" },
];

export default function KimiTerminalPage() {
  const queryClient = useQueryClient();
  const [tabs, setTabs] = useState<ChatTab[]>([createTab()]);
  const [activeTabId, setActiveTabId] = useState(tabs[0].id);
  const [input, setInput] = useState("");
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashFilter, setSlashFilter] = useState("");
  const [modelOpen, setModelOpen] = useState(false);
  const [agentSearch, setAgentSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sidebarTab, setSidebarTab] = useState<"agents" | "history">("agents");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [responseMode, setResponseMode] = useState<"concise" | "detailed">("concise");
  const [chatSearch, setChatSearch] = useState("");
  const [showChatSearch, setShowChatSearch] = useState(false);
  const [pinnedMessages, setPinnedMessages] = useState<Set<number>>(new Set());
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceTab>("chat");
  const [editorFile, setEditorFile] = useState<{ path: string; content: string; language: string } | null>(null);
  const [editorDirty, setEditorDirty] = useState(false);
  const [editorContent, setEditorContent] = useState("");
  const [swarmTasks, setSwarmTasks] = useState<Array<{ task: string; agentName: string }>>([{ task: "", agentName: "סוכן 1" }]);
  const [swarmSessionId, setSwarmSessionId] = useState<string | null>(null);
  const [swarmStatus, setSwarmStatus] = useState<any>(null);
  const [swarmPolling, setSwarmPolling] = useState(false);
  const [swarmExpanded, setSwarmExpanded] = useState<Set<number>>(new Set());
  const [showActivityLog, setShowActivityLog] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRefs = useRef<Record<string, AbortController>>({});

  const activeTab = useMemo(() => tabs.find(t => t.id === activeTabId) || tabs[0], [tabs, activeTabId]);

  const updateTab = useCallback((tabId: string, updates: Partial<ChatTab>) => {
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, ...updates } : t));
  }, []);

  const { data: status } = useQuery<KimiStatus>({
    queryKey: ["kimi-status"],
    queryFn: async () => { const r = await authFetch(`${API}/kimi/status`); if (!r.ok) throw new Error("Failed"); return r.json(); },
    staleTime: 120_000,
    refetchOnWindowFocus: false,
  });

  const { data: modelsData } = useQuery<{ models: ModelInfo[]; defaultModel: string }>({
    queryKey: ["kimi-models"],
    queryFn: async () => { const r = await authFetch(`${API}/kimi/models`); if (!r.ok) throw new Error("Failed"); return r.json(); },
    staleTime: 300_000,
    refetchOnWindowFocus: false,
  });

  const { data: agentsData } = useQuery<{ agents: KimiAgent[]; categories: string[] }>({
    queryKey: ["kimi-agents", agentSearch, selectedCategory],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (agentSearch) params.set("search", agentSearch);
      if (selectedCategory) params.set("category", selectedCategory);
      const r = await authFetch(`${API}/kimi/agents?${params}`);
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const { data: conversationsData } = useQuery<{ conversations: Conversation[] }>({
    queryKey: ["kimi-conversations"],
    queryFn: async () => { const r = await authFetch(`${API}/kimi/conversations`); if (!r.ok) throw new Error("Failed"); return r.json(); },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const createConvMutation = useMutation({
    mutationFn: async (data: { agentId?: number; model: string; title: string }) => {
      let r: Response;
      try {
        r = await authFetch(`${API}/kimi/conversations`, { method: "POST", body: JSON.stringify(data) });
      } catch (e: any) {
        throw new Error(e?.name === "AbortError" ? "הבקשה בוטלה" : `שגיאת רשת: ${e?.message || "אין חיבור לשרת"}`);
      }
      if (!r.ok) {
        const errData = await r.json().catch(() => null);
        throw new Error(errData?.error || `שגיאת שרת (${r.status})`);
      }
      return r.json();
    },
  });

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [activeTab.messages, activeTab.streamingContent]);

  const loadFileContent = async (filePath: string) => {
    try {
      const r = await authFetch(`${API}/kimi/dev/file?path=${encodeURIComponent(filePath)}`);
      const d = await r.json();
      if (d.error) return;
      setEditorFile({ path: filePath, content: d.content, language: d.language });
      setEditorContent(d.content);
      setEditorDirty(false);
      setActiveWorkspace("editor");
    } catch {}
  };

  const saveFile = async () => {
    if (!editorFile) return;
    try {
      await authFetch(`${API}/kimi/dev/file`, { method: "PUT", body: JSON.stringify({ path: editorFile.path, content: editorContent }) });
      setEditorFile(prev => prev ? { ...prev, content: editorContent } : null);
      setEditorDirty(false);
    } catch {}
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key >= "1" && e.key <= "9") {
        e.preventDefault();
        const idx = parseInt(e.key) - 1;
        if (idx < WORKSPACE_TABS.length) setActiveWorkspace(WORKSPACE_TABS[idx].id);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "n" && !e.shiftKey) {
        e.preventDefault();
        addTab();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "f" && activeWorkspace === "chat") {
        e.preventDefault();
        setShowChatSearch(prev => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const MAX_AUTO_LOOPS = 10;

  const compressImage = useCallback((file: File): Promise<string> => {
    return new Promise((resolve) => {
      const MAX_DIM = 1920;
      const MAX_BYTES = 800 * 1024;
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > MAX_DIM || height > MAX_DIM) {
          const scale = Math.min(MAX_DIM / width, MAX_DIM / height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, width, height);
        let quality = 0.8;
        let result = canvas.toDataURL("image/jpeg", quality);
        while (result.length > MAX_BYTES * 1.37 && quality > 0.3) {
          quality -= 0.1;
          result = canvas.toDataURL("image/jpeg", quality);
        }
        if (result.length > MAX_BYTES * 1.37) {
          const s2 = Math.min(1280 / width, 1280 / height, 1);
          canvas.width = Math.round(width * s2);
          canvas.height = Math.round(height * s2);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          result = canvas.toDataURL("image/jpeg", 0.6);
        }
        URL.revokeObjectURL(blobUrl);
        resolve(result);
      };
      img.onerror = () => {
        URL.revokeObjectURL(blobUrl);
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      };
      const blobUrl = URL.createObjectURL(file);
      img.src = blobUrl;
    });
  }, []);

  const handleImageFiles = useCallback((files: FileList | File[]) => {
    const fileArr = Array.from(files).filter(f => f.type.startsWith("image/")).slice(0, 5);
    if (fileArr.length === 0) return;
    const currentImages = activeTab.pendingImages || [];
    if (currentImages.length >= 5) return;
    const remaining = 5 - currentImages.length;
    const toProcess = fileArr.slice(0, remaining);
    Promise.all(toProcess.map(file => compressImage(file))).then(results => {
      const current = tabs.find(t => t.id === activeTabId)?.pendingImages || [];
      updateTab(activeTabId, {
        pendingImages: [...current, ...results].slice(0, 5),
      });
    });
  }, [activeTabId, activeTab.pendingImages, tabs, updateTab, compressImage]);

  const removePendingImage = useCallback((idx: number) => {
    updateTab(activeTabId, {
      pendingImages: activeTab.pendingImages.filter((_, i) => i !== idx),
    });
  }, [activeTabId, activeTab.pendingImages, updateTab]);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (activeWorkspace !== "chat") return;
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageFiles: File[] = [];
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault();
        handleImageFiles(imageFiles);
      }
    };
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [activeWorkspace, handleImageFiles]);

  const sendMessage = async (messageContent?: string) => {
    const text = messageContent || input.trim();
    const hasImages = activeTab.pendingImages.length > 0;
    if (!text && !hasImages) return;

    const msgText = text || (hasImages ? `[צילום מסך × ${activeTab.pendingImages.length}]` : "");
    const newMsg: Message = { role: "user", content: msgText, timestamp: new Date(), images: hasImages ? [...activeTab.pendingImages] : undefined };
    const tabId = activeTabId;

    let convId = activeTab.conversationId;
    if (!convId) {
      try {
        const conv = await createConvMutation.mutateAsync({ agentId: activeTab.agent?.id, model: activeTab.model, title: text.slice(0, 50) });
        convId = conv.id;
        updateTab(tabId, { conversationId: convId });
        queryClient.invalidateQueries({ queryKey: ["kimi-conversations"] });
      } catch (err: any) {
        const errMsg: Message = { role: "assistant", content: `שגיאה ביצירת שיחה: ${err?.message || "שגיאה לא ידועה"}`, timestamp: new Date() };
        updateTab(tabId, { messages: [...activeTab.messages, newMsg, errMsg], isStreaming: false });
        setActiveWorkspace("chat");
        return;
      }
    }

    if (!messageContent) setInput("");
    setActiveWorkspace("chat");

    let localMessages: Message[] = [...activeTab.messages, newMsg];
    updateTab(tabId, { messages: localMessages, isStreaming: true, streamingContent: "", loopCount: 0 });

    const abort = new AbortController();
    abortRefs.current[tabId] = abort;

    try {
      let contextNote = "";
      if (activeTab.messages.length === 0) {
        try {
          const ctxR = await authFetch(`${API}/kimi/dev/context-snapshot`);
          const ctxD = await ctxR.json();
          if (ctxD.context) contextNote = ctxD.context;
        } catch {}
      }

      const loopMsgs: Array<{ role: string; content: string }> = localMessages.map(m => ({ role: m.role, content: m.content }));
      if (contextNote && loopMsgs.length <= 2) {
        loopMsgs[loopMsgs.length - 1] = { role: "user", content: `[הקשר מערכת: ${contextNote}]\n\n${msgText}` };
      }

      let loopCount = 0;

      while (loopCount < MAX_AUTO_LOOPS) {
        if (abort.signal.aborted) break;
        loopCount++;
        setTabs(prev => prev.map(t => t.id === tabId ? { ...t, loopCount, isStreaming: true, streamingContent: "" } : t));

        let r: Response | null = null;
        for (let retryAttempt = 0; retryAttempt < 3; retryAttempt++) {
          r = await authFetch(`${API}/kimi/chat/stream`, {
            method: "POST",
            body: JSON.stringify({
              messages: loopMsgs, model: activeTab.model, conversationId: convId,
              agentId: activeTab.agent?.id,
              images: loopCount === 1 && activeTab.pendingImages.length > 0 ? activeTab.pendingImages : undefined,
              responseMode,
            }),
            signal: abort.signal,
          });
          if (r.ok || r.status < 500) break;
          if (retryAttempt < 2) {
            setTabs(prev => prev.map(t => t.id === tabId ? { ...t, streamingContent: `⏳ שרת AI עמוס — ניסיון ${retryAttempt + 2}/3...` } : t));
            await new Promise(resolve => setTimeout(resolve, 2000 * (retryAttempt + 1)));
          }
        }

        if (!r || !r.ok) {
          const errData = await r?.json().catch(() => null);
          throw new Error(errData?.error || `שגיאת שרת (${r?.status || "unknown"})`);
        }

        const reader = r.body?.getReader();
        if (!reader) throw new Error("No reader");
        const decoder = new TextDecoder();
        let fullContent = "";
        let sseBuffer = "";
        let truncatedRetryQueued = false;
        let tooShortRetryQueued = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          sseBuffer += decoder.decode(value, { stream: true });
          const lines = sseBuffer.split("\n");
          sseBuffer = lines.pop() || "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: ")) continue;
            const data = trimmed.slice(6);
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.content) { fullContent += parsed.content; }
              else if (parsed.delta?.content) { fullContent += parsed.delta.content; }
              else if (parsed.choices?.[0]?.delta?.content) { fullContent += parsed.choices[0].delta.content; }
              else if (parsed.retryRecommended === "truncated" && !truncatedRetryQueued) {
                truncatedRetryQueued = true;
                loopMsgs.push({ role: "user", content: "התשובה נחתכה באמצע ולא הושלמה. אנא המשך מהמקום שנעצרת ותן תשובה מלאה וסגורה." });
              } else if (parsed.retryRecommended === "too_short" && !tooShortRetryQueued) {
                tooShortRetryQueued = true;
                const reinforcement = parsed.reinforcedPrompt || "אנא הרחב את תשובתך עם הסבר מפורט.";
                loopMsgs.push({ role: "user", content: reinforcement });
              }
            } catch {}
          }
          if (fullContent.length % 80 < 20) {
            setTabs(prev => prev.map(t => t.id === tabId ? { ...t, streamingContent: fullContent } : t));
          }
        }

        sseBuffer += decoder.decode(undefined, { stream: false });
        if (sseBuffer.trim()) {
          const remaining = sseBuffer.trim();
          if (remaining.startsWith("data: ")) {
            const data = remaining.slice(6);
            if (data !== "[DONE]") {
              try {
                const parsed = JSON.parse(data);
                if (parsed.content) { fullContent += parsed.content; }
                else if (parsed.delta?.content) { fullContent += parsed.delta.content; }
                else if (parsed.choices?.[0]?.delta?.content) { fullContent += parsed.choices[0].delta.content; }
              } catch {}
            }
          }
        }

        setTabs(prev => prev.map(t => t.id === tabId ? { ...t, streamingContent: fullContent } : t));
        const assistantMsg: Message = { role: "assistant", content: fullContent, timestamp: new Date() };
        localMessages = [...localMessages, assistantMsg];
        loopMsgs.push({ role: "assistant", content: fullContent });
        setTabs(prev => prev.map(t => t.id === tabId ? { ...t, messages: [...localMessages], streamingContent: "", pendingImages: [] } : t));

        const actionBlocks = extractActionBlocks(fullContent);
        const hasQualityRetry = truncatedRetryQueued || tooShortRetryQueued;
        if (actionBlocks.length === 0 && !hasQualityRetry) break;
        if (actionBlocks.length === 0 && hasQualityRetry) continue;

        const actionResults: ActionResult[] = [];
        for (let ai = 0; ai < actionBlocks.length; ai++) {
          const action = actionBlocks[ai];
          const progressMsg: Message = {
            role: "assistant",
            content: `🔄 סבב ${loopCount} — מבצע פעולה ${ai + 1}/${actionBlocks.length}: ${ACTION_LABELS[action.actionType]?.label || action.actionType}...`,
            timestamp: new Date(), isExecution: true, actionResults: [...actionResults],
          };
          setTabs(prev => prev.map(t => t.id === tabId ? {
            ...t, messages: [...localMessages.filter(m => !m.isExecution), progressMsg],
          } : t));
          try {
            const ar = await authFetch(`${API}/kimi/dev/execute-action`, { method: "POST", body: JSON.stringify(action) });
            const ad = await ar.json();
            actionResults.push({ actionType: action.actionType, success: ad.success, result: ad.result, error: ad.error, durationMs: ad.durationMs, resolvedInfo: ad.resolvedInfo, suggestions: ad.suggestions });
          } catch (e: any) {
            actionResults.push({ actionType: action.actionType, success: false, error: e.message });
          }
        }

        const succeeded = actionResults.filter(r => r.success).length;
        const execMsg: Message = {
          role: "assistant",
          content: loopCount > 1 ? `🔄 סבב ${loopCount} — **ביצוע הושלם**: ${succeeded}/${actionResults.length} פעולות הצליחו` : `⚡ **ביצוע הושלם**: ${succeeded}/${actionResults.length} פעולות הצליחו`,
          timestamp: new Date(), isExecution: true, actionResults,
        };
        localMessages = [...localMessages.filter(m => !m.isExecution), execMsg];
        setTabs(prev => prev.map(t => t.id === tabId ? { ...t, messages: [...localMessages] } : t));

        const resultsSummary = actionResults.map(r => {
          if (r.success) {
            const preview = typeof r.result === "object" ? JSON.stringify(r.result).slice(0, 800) : String(r.result);
            return `✅ ${r.actionType}: ${preview}`;
          }
          return `❌ ${r.actionType}: ${r.error}`;
        }).join("\n");

        const loopPrompt = `[תוצאות ביצוע אוטומטי — סבב ${loopCount}/${MAX_AUTO_LOOPS}]\n${resultsSummary}\n\nהמשך לבצע את המשימה אם יש עוד שלבים. אם סיימת — כתוב סיכום סופי ללא בלוקי kimi-action.`;
        const autoMsg: Message = { role: "user", content: loopPrompt, timestamp: new Date() };
        localMessages = [...localMessages, autoMsg];
        loopMsgs.push({ role: "user", content: loopPrompt });
        setTabs(prev => prev.map(t => t.id === tabId ? { ...t, messages: [...localMessages] } : t));
      }

      setTabs(prev => prev.map(t => t.id === tabId ? { ...t, isStreaming: false, loopCount: 0 } : t));
    } catch (err: any) {
      if (err.name !== "AbortError") {
        const errMsg: Message = { role: "assistant", content: `שגיאה: ${err.message}`, timestamp: new Date() };
        localMessages = [...localMessages, errMsg];
        setTabs(prev => prev.map(t => t.id === tabId ? { ...t, messages: [...localMessages], streamingContent: "", isStreaming: false } : t));
      }
    }
    delete abortRefs.current[tabId];
  };

  const launchSwarm = async () => {
    const validTasks = swarmTasks.filter(t => t.task.trim());
    if (validTasks.length === 0) return;
    try {
      const r = await authFetch(`${API}/kimi/swarm/execute`, {
        method: "POST",
        body: JSON.stringify({ tasks: validTasks, model: activeTab.model, maxLoops: 10 }),
      });
      if (!r.ok) { const err = await r.json().catch(() => ({})); setSwarmStatus({ error: err.error || `שגיאה ${r.status}` }); return; }
      const data = await r.json();
      if (data.sessionId) {
        setSwarmSessionId(data.sessionId);
        setSwarmPolling(true);
        setSwarmStatus({ ...data, agents: validTasks.map((t, i) => ({ id: `agent-${i}`, task: t.task, agentName: t.agentName, status: "pending", loops: 0, actionCount: 0, successCount: 0, finalSummary: "" })) });
      }
    } catch (e: any) {
      setSwarmStatus({ error: e.message });
    }
  };

  useEffect(() => {
    if (!swarmPolling || !swarmSessionId) return;
    let running = false;
    const interval = setInterval(async () => {
      if (running) return;
      running = true;
      try {
        const r = await authFetch(`${API}/kimi/swarm/${swarmSessionId}`);
        if (!r.ok) { running = false; return; }
        const data = await r.json();
        setSwarmStatus(data);
        if (data.status === "completed" || data.status === "failed") {
          setSwarmPolling(false);
        }
      } catch (e) { console.warn("swarm poll error", e); }
      running = false;
    }, 2000);
    return () => clearInterval(interval);
  }, [swarmPolling, swarmSessionId]);

  const stopStreaming = () => { abortRefs.current[activeTabId]?.abort(); updateTab(activeTabId, { isStreaming: false, streamingContent: "" }); };

  const addTab = (agent?: KimiAgent) => {
    const t = createTab(agent, status?.defaultModel);
    setTabs(prev => [...prev, t]);
    setActiveTabId(t.id);
    setActiveWorkspace("chat");
  };

  const closeTab = (id: string) => {
    if (tabs.length === 1) return;
    const idx = tabs.findIndex(t => t.id === id);
    setTabs(prev => prev.filter(t => t.id !== id));
    if (id === activeTabId) setActiveTabId(tabs[idx === 0 ? 1 : idx - 1]?.id || tabs[0].id);
  };

  const loadConversation = async (conv: Conversation) => {
    try {
      const r = await authFetch(`${API}/kimi/conversations/${conv.id}/messages`);
      const d = await r.json();
      const msgs: Message[] = (d.messages || []).map((m: any) => ({ role: m.role, content: typeof m.content === "string" ? m.content : (m.content != null ? JSON.stringify(m.content) : ""), timestamp: new Date(m.createdAt) }));
      const agent = agentsData?.agents?.find(a => a.id === conv.agentId) || null;
      const t = createTab(agent, conv.model);
      t.conversationId = conv.id;
      t.messages = msgs;
      t.title = typeof conv.title === "string" ? conv.title : String(conv.title ?? "שיחה");
      setTabs(prev => [...prev, t]);
      setActiveTabId(t.id);
      setActiveWorkspace("chat");
    } catch {}
  };

  const allMessages = activeTab.messages;
  const streaming = activeTab.streamingContent;
  const MESSAGES_PAGE_SIZE = 50;
  const [visibleMsgCount, setVisibleMsgCount] = useState(MESSAGES_PAGE_SIZE);
  useEffect(() => { setVisibleMsgCount(MESSAGES_PAGE_SIZE); }, [activeTabId]);

  const handleSuggestionClick = useCallback((text: string) => { sendMessage(text); }, [sendMessage]);

  return (
    <div className={`flex flex-col h-[calc(100vh-3.5rem)] bg-[#0b0f19] text-foreground ${isFullscreen ? "fixed inset-0 z-50 h-screen" : ""}`} dir="rtl">
      <div className="flex items-center border-b border-border bg-card h-10 px-2 flex-shrink-0">
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1.5 text-muted-foreground hover:text-foreground ml-1">
          {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
        </button>

        <div className="flex items-center gap-2 mx-3">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
            <Bot className="w-3.5 h-3.5 text-foreground" />
          </div>
          <span className="text-sm font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">Kimi 2 IDE</span>
        </div>

        <div className="h-5 w-px bg-muted mx-1" />

        <div className="flex items-center gap-0.5 flex-1 overflow-x-auto scrollbar-thin">
          {WORKSPACE_TABS.map((wt, idx) => (
            <button key={wt.id} onClick={() => setActiveWorkspace(wt.id)}
              title={`${wt.label} (Alt+${idx + 1})`}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] rounded whitespace-nowrap transition-all ${
                activeWorkspace === wt.id
                  ? `bg-card/10 ${wt.color} font-medium`
                  : "text-muted-foreground hover:text-gray-300 hover:bg-card/5"
              }`}>
              <wt.icon className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">{wt.label}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 mr-auto flex-shrink-0">
          <div className="relative">
            <button onClick={() => setModelOpen(!modelOpen)} className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-card/5">
              <Cpu className="w-3 h-3" /> {MODEL_LABELS[activeTab.model]?.split(" —")[0] || activeTab.model}
              <ChevronDown className="w-3 h-3" />
            </button>
            {modelOpen && (
              <div className="absolute left-0 top-full mt-1 bg-card border border-border rounded-lg shadow-xl z-50 min-w-[200px]">
                {(modelsData?.models || []).map(m => (
                  <button key={m.id} onClick={() => { updateTab(activeTabId, { model: m.id }); setModelOpen(false); }}
                    className={`w-full text-right px-3 py-2 text-xs hover:bg-card/5 ${m.id === activeTab.model ? "text-cyan-400" : "text-gray-300"}`}>
                    <div>{typeof m.name === "string" ? m.name : String(m.name ?? m.id)}</div>
                    <div className="text-[10px] text-muted-foreground">{typeof m.description === "string" ? m.description : ""}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => setResponseMode(responseMode === "concise" ? "detailed" : "concise")}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-all ${responseMode === "concise" ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30" : "bg-purple-500/15 text-purple-400 border border-purple-500/30"}`}
            title={responseMode === "concise" ? "מצב תמציתי — תשובות קצרות" : "מצב מפורט — תשובות מלאות"}>
            {responseMode === "concise" ? "⚡ תמציתי" : "📖 מפורט"}
          </button>
          <div className="text-[10px] text-muted-foreground px-2">{agentsData?.agents?.length || 0} סוכנים</div>
          <button onClick={() => setIsFullscreen(!isFullscreen)} className="p-1.5 text-muted-foreground hover:text-foreground">
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {sidebarOpen && (
          <div className="w-60 border-l border-border bg-card flex flex-col flex-shrink-0">
            <div className="flex border-b border-border">
              <button onClick={() => setSidebarTab("agents")} className={`flex-1 py-2 text-xs flex items-center justify-center gap-1 ${sidebarTab === "agents" ? "text-cyan-400 border-b-2 border-cyan-400" : "text-muted-foreground"}`}>
                <Users className="w-3.5 h-3.5" /> סוכנים
              </button>
              <button onClick={() => setSidebarTab("history")} className={`flex-1 py-2 text-xs flex items-center justify-center gap-1 ${sidebarTab === "history" ? "text-cyan-400 border-b-2 border-cyan-400" : "text-muted-foreground"}`}>
                <History className="w-3.5 h-3.5" /> היסטוריה
              </button>
            </div>

            {sidebarTab === "agents" && (
              <div className="flex-1 overflow-y-auto">
                <div className="p-2">
                  <div className="relative">
                    <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input value={agentSearch} onChange={e => setAgentSearch(e.target.value)}
                      className="w-full bg-card text-xs text-foreground py-1.5 pr-7 pl-2 rounded border border-border outline-none" placeholder="חיפוש סוכן..." />
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 px-2 pb-2">
                  {(agentsData?.categories || []).map(cat => (
                    <button key={cat} onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
                      className={`px-2 py-0.5 rounded-full text-[10px] border transition-colors ${selectedCategory === cat ? (CATEGORY_COLORS[cat]?.bg || "bg-muted") + " " + (CATEGORY_COLORS[cat]?.text || "text-foreground") + " " + (CATEGORY_COLORS[cat]?.border || "border-border") : "bg-muted/50 text-muted-foreground border-border hover:text-gray-300"}`}>
                      {cat}
                    </button>
                  ))}
                </div>
                <div className="space-y-0.5 px-2">
                  {(agentsData?.agents || []).map(agent => (
                    <button key={agent.id} onClick={() => addTab(agent)}
                      className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-card/5 text-right transition-colors group">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0 ${CATEGORY_COLORS[agent.category]?.bg || "bg-muted"}`}>
                        {agent.icon || "🤖"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-foreground truncate">{typeof agent.name === "string" ? agent.name : String(agent.name ?? "")}</div>
                        <div className="text-[10px] text-muted-foreground truncate">{typeof agent.description === "string" ? agent.description : ""}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {sidebarTab === "history" && (
              <div className="flex-1 overflow-y-auto space-y-0.5 p-2">
                {(conversationsData?.conversations || []).map(conv => (
                  <button key={conv.id} onClick={() => loadConversation(conv)}
                    className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-card/5 text-right">
                    <MessageSquare className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-foreground truncate">{typeof conv.title === "string" ? conv.title : String(conv.title ?? "")}</div>
                      <div className="text-[10px] text-muted-foreground">{conv.totalMessages} הודעות</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex-1 flex flex-col min-w-0">
          {activeWorkspace === "chat" && (
            <>
              <div className="flex items-center gap-0.5 px-2 py-1 border-b border-border bg-card overflow-x-auto">
                {tabs.map(t => (
                  <div key={t.id} onClick={() => setActiveTabId(t.id)}
                    className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded cursor-pointer max-w-[150px] group ${t.id === activeTabId ? "bg-card text-foreground border border-cyan-500/30" : "text-muted-foreground hover:text-gray-300 hover:bg-card/5"}`}>
                    <span className="truncate">{typeof t.title === "string" ? t.title : String(t.title ?? "")}</span>
                    {tabs.length > 1 && (
                      <button onClick={e => { e.stopPropagation(); closeTab(t.id); }} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
                <button onClick={() => addTab()} className="p-1 text-muted-foreground hover:text-cyan-400"><Plus className="w-3.5 h-3.5" /></button>
              </div>

              {allMessages.length > 0 && (
                <div className="flex items-center justify-between px-3 py-1 bg-card border-b border-border/50 text-[9px] text-muted-foreground">
                  <div className="flex items-center gap-3">
                    <span>{allMessages.filter(m => m.role === "user").length} שאלות</span>
                    <span>{allMessages.filter(m => m.role === "assistant" && !m.isExecution).length} תשובות</span>
                    <span>{allMessages.filter(m => m.isExecution && m.actionResults).reduce((s, m) => s + (m.actionResults?.length || 0), 0)} פעולות</span>
                    <span>{allMessages.filter(m => m.isExecution && m.actionResults).reduce((s, m) => s + (m.actionResults?.filter(r => r.success).length || 0), 0)} הצלחות</span>
                  </div>
                  <button onClick={() => {
                    const data = allMessages.map(m => ({ role: m.role, content: m.content, time: m.timestamp }));
                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a"); a.href = url; a.download = `kimi-chat-${Date.now()}.json`; a.click();
                    URL.revokeObjectURL(url);
                  }} className="text-muted-foreground hover:text-cyan-400 flex items-center gap-0.5">
                    <Copy className="w-2.5 h-2.5" /> ייצוא
                  </button>
                </div>
              )}

              {showChatSearch && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-card border-b border-border">
                  <Search className="w-3.5 h-3.5 text-muted-foreground" />
                  <input value={chatSearch} onChange={e => setChatSearch(e.target.value)} placeholder="חיפוש בשיחה..."
                    className="flex-1 bg-transparent text-sm text-foreground outline-none" autoFocus
                    onKeyDown={e => { if (e.key === "Escape") { setShowChatSearch(false); setChatSearch(""); } }}
                  />
                  {chatSearch && <span className="text-[10px] text-muted-foreground">{allMessages.filter(m => m.content.includes(chatSearch)).length} תוצאות</span>}
                  <button onClick={() => { setShowChatSearch(false); setChatSearch(""); }} className="text-muted-foreground hover:text-gray-300"><X className="w-3.5 h-3.5" /></button>
                </div>
              )}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
                {allMessages.length === 0 && !streaming && (
                  <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
                      <Bot className="w-8 h-8 text-foreground" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
                        Kimi 2 Super AI
                      </h2>
                      <p className="text-sm text-muted-foreground mt-1">
                        60 פעולות אוטונומיות · גרפים ויזואליים · מצב תמציתי/מפורט · שאלות הבהרה · תיקון ממוקד
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">{agentsData?.agents?.length || 189} סוכני AI · {status?.provider || "Moonshot"} · {WORKSPACE_TABS.length} כלי פיתוח · Auto-Resolve עברית</p>
                    </div>
                    {activeTab.agent && (
                      <div className="flex flex-col items-center gap-2 mt-2">
                        <div className="text-3xl">{activeTab.agent.icon || "🤖"}</div>
                        <div className="text-sm text-foreground font-medium">{typeof activeTab.agent.name === "string" ? activeTab.agent.name : String(activeTab.agent.name ?? "")}</div>
                        <div className="text-xs text-muted-foreground max-w-md">{typeof activeTab.agent.description === "string" ? activeTab.agent.description : ""}</div>
                      </div>
                    )}
                    <div className="max-w-3xl w-full mt-4 space-y-4">
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 text-center">פעולות מהירות</div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {[
                            { label: "➕ צור ספק חדש", prompt: "צור ספק חדש בשם 'ספק לדוגמה' עם טלפון 050-1234567", color: "border-green-500/30 text-green-400" },
                            { label: "🏗️ צור ישות חדשה", prompt: "צור ישות חדשה בשם 'הזמנות עבודה' במודול ייצור עם שדות: מספר הזמנה, לקוח, תאריך, סטטוס", color: "border-purple-500/30 text-purple-400" },
                            { label: "📝 הוסף שדה", prompt: "הוסף שדה 'אימייל' מסוג email לישות ספקים", color: "border-cyan-500/30 text-cyan-400" },
                            { label: "🔍 חפש רשומות", prompt: "חפש את כל הספקים במערכת", color: "border-yellow-500/30 text-yellow-400" },
                            { label: "📦 צור מודול", prompt: "צור מודול חדש בשם 'תחזוקה' עם אייקון wrench וצבע כתום", color: "border-amber-500/30 text-amber-400" },
                            { label: "📤 ייצוא CSV", prompt: "ייצא את כל הספקים לקובץ CSV", color: "border-emerald-500/30 text-emerald-400" },
                            { label: "📥 יצירה מרובה", prompt: "צור 3 מוצרים חדשים: ברזל 10 מ\"מ, אלומיניום 5 מ\"מ, זכוכית מחוסמת", color: "border-emerald-500/30 text-emerald-400" },
                            { label: "🗄️ SQL מתקדם", prompt: "כתוב query לחישוב סה\"כ הכנסות לפי חודש", color: "border-orange-500/30 text-orange-400" },
                          ].map((p, i) => (
                            <button key={i} onClick={() => sendMessage(p.prompt)}
                              className={`px-3 py-2 bg-card/5 border ${p.color} rounded-lg text-xs hover:bg-card/10 transition-colors text-right`}>
                              {p.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 text-center">כלי פיתוח</div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {[
                            { label: "📄 סיכום ישות", prompt: "תן סיכום מלא של ישות ספקים כולל שדות ודוגמאות", color: "border-cyan-500/30 text-cyan-400" },
                            { label: "✅ בדוק תקינות", prompt: "בדוק תקינות הנתונים בישות ספקים — שדות חובה, ערכים חסרים", color: "border-green-500/30 text-green-400" },
                            { label: "⚖️ השווה ישויות", prompt: "השווה את המבנה של ישות ספקים לישות לקוחות", color: "border-indigo-500/30 text-indigo-400" },
                            { label: "🖥️ מצב מערכת", prompt: "הצג סטטוס מלא של המערכת — זיכרון, uptime, חיבורי DB, גודל", color: "border-blue-500/30 text-blue-400" },
                            { label: "📑 רשימת טבלאות", prompt: "הצג את כל הטבלאות ב-DB עם גדלים ומספר שורות", color: "border-violet-500/30 text-violet-400" },
                            { label: "📋 רשימת ישויות", prompt: "הצג רשימת כל הישויות במערכת עם ID, שם, וסוג", color: "border-blue-500/30 text-blue-400" },
                            { label: "📋 רשימת מודולים", prompt: "הצג רשימת כל המודולים במערכת עם ID ושם", color: "border-indigo-500/30 text-indigo-400" },
                            { label: "🌐 חיפוש גלובלי", prompt: "חפש את המילה 'ברזל' בכל הישויות במערכת", color: "border-yellow-500/30 text-yellow-400" },
                            { label: "🔗 קשרי ישות", prompt: "הצג את כל הקשרים של ישות ספקים — קשרים נכנסים ויוצאים", color: "border-cyan-500/30 text-cyan-400" },
                            { label: "📋 ייצוא סכמה", prompt: "ייצא את כל סכמת המערכת — מודולים, ישויות ושדות", color: "border-green-500/30 text-green-400" },
                            { label: "⚡ בדיקת ביצועים", prompt: "בצע בדיקת ביצועים מלאה — DB latency, API response, ציון כולל", color: "border-lime-500/30 text-lime-400" },
                            { label: "📋 דוח איכות", prompt: "הפק דוח איכות נתונים — ציון איכות לכל ישות, שדות חובה חסרים", color: "border-teal-500/30 text-teal-400" },
                            { label: "📜 יומן שינויים", prompt: "הצג את 20 השינויים האחרונים במערכת מיומן האודיט", color: "border-amber-500/30 text-amber-400" },
                            { label: "💡 הצעות חכמות", prompt: "תן לי הצעות חכמות — מה כדאי לעשות עכשיו?", color: "border-yellow-500/30 text-yellow-400" },
                            { label: "📊 סטטיסטיקת שדה", prompt: "הצג סטטיסטיקה על שדה שם בישות ספקים — מילוי, ערכים, התפלגות", color: "border-pink-500/30 text-pink-400" },
                          ].map((p, i) => (
                            <button key={i} onClick={() => sendMessage(p.prompt)}
                              className={`px-3 py-2 bg-card/5 border ${p.color} rounded-lg text-xs hover:bg-card/10 transition-colors text-right`}>
                              {p.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {(() => {
                  const filteredMessages = allMessages.filter(msg => !chatSearch || msg.content.toLowerCase().includes(chatSearch.toLowerCase()));
                  const totalFiltered = filteredMessages.length;
                  const hiddenCount = Math.max(0, totalFiltered - visibleMsgCount);
                  const visibleMessages = filteredMessages.slice(-visibleMsgCount);
                  const lastExecutionIdx = filteredMessages.reduce((last, msg, idx) => (msg.isExecution && msg.actionResults ? idx : last), -1);
                  return (
                    <>
                      {hiddenCount > 0 && (
                        <div className="flex justify-center py-2">
                          <button
                            onClick={() => setVisibleMsgCount(c => c + MESSAGES_PAGE_SIZE)}
                            className="text-xs text-muted-foreground bg-card/5 border border-border px-3 py-1.5 rounded-lg hover:bg-card/10 hover:text-foreground transition-colors"
                          >
                            הצג {Math.min(hiddenCount, MESSAGES_PAGE_SIZE)} הודעות קודמות ({hiddenCount} נסתרות)
                          </button>
                        </div>
                      )}
                      {visibleMessages.map((msg, i) => {
                  const globalIdx = totalFiltered - visibleMessages.length + i;
                  const hasActions = msg.role === "assistant" && msg.content.includes("```kimi-action");
                  const displayContent = hasActions
                    ? msg.content.replace(/```kimi-action\s*\n[\s\S]*?```/g, (m) => {
                        try {
                          const parsed = JSON.parse(m.replace(/```kimi-action\s*\n/, "").replace(/```$/, "").trim());
                          const aInfo = ACTION_LABELS[parsed.actionType] || { label: parsed.actionType, icon: "⚙️" };
                          const paramStr = parsed.params?.entityName || parsed.params?.moduleName || parsed.params?.path || "";
                          return `\n> ${aInfo.icon} **${aInfo.label}** ${paramStr ? `(${paramStr})` : ""}\n`;
                        } catch { return m; }
                      })
                    : msg.content;
                  const isLastExecutionMsg = msg.isExecution && msg.actionResults && globalIdx === lastExecutionIdx;
                  return (
                    <div key={globalIdx} className={`group flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        msg.role === "user" ? "bg-blue-600"
                        : msg.isExecution ? "bg-gradient-to-br from-emerald-500 to-green-600 shadow-lg shadow-emerald-500/20"
                        : "bg-gradient-to-br from-cyan-500 to-blue-600"
                      }`}>
                        {msg.role === "user" ? <span className="text-xs">👤</span> : msg.isExecution ? <Zap className="w-4 h-4 text-foreground" /> : <Bot className="w-4 h-4 text-foreground" />}
                      </div>
                      <div className={`relative max-w-[80%] rounded-xl px-4 py-2.5 text-sm ${
                        msg.role === "user" ? "bg-blue-600/20 border border-blue-500/20"
                        : msg.isExecution ? "bg-gradient-to-br from-emerald-500/5 to-green-500/5 border border-emerald-500/30"
                        : "bg-card border border-border"
                      }`}>
                        {msg.isExecution && msg.actionResults ? (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 mb-2">
                              <Zap className="w-4 h-4 text-emerald-400" />
                              <span className="text-xs font-bold text-emerald-400">
                                מנוע ביצוע אוטונומי — {msg.actionResults.filter(r => r.success).length}/{msg.actionResults.length} הצליחו
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {msg.actionResults.reduce((s, r) => s + (r.durationMs || 0), 0)}ms
                              </span>
                            </div>
                            {msg.actionResults.map((r, ri) => <ActionResultCard key={ri} r={r} index={ri} isLast={!!isLastExecutionMsg && ri === msg.actionResults!.length - 1} onSuggestionClick={handleSuggestionClick} />)}
                          </div>
                        ) : msg.isExecution ? (
                          <div className="flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                            <span className="text-xs text-emerald-300">{msg.content}</span>
                          </div>
                        ) : msg.role === "assistant" ? (
                          <div className="prose prose-invert prose-sm max-w-none prose-pre:bg-card prose-pre:border prose-pre:border-border">
                            <RenderContentWithCharts content={displayContent} />
                          </div>
                        ) : (
                          <div>
                            {msg.images && msg.images.length > 0 && (
                              <div className="flex flex-wrap gap-2 mb-2">
                                {msg.images.map((img, ii) => (
                                  <img key={ii} src={img} className="max-h-40 max-w-[200px] rounded-lg border border-blue-500/30 object-cover cursor-pointer hover:opacity-80" onClick={() => window.open(img, "_blank")} />
                                ))}
                              </div>
                            )}
                            <p className="whitespace-pre-wrap">{msg.content}</p>
                          </div>
                        )}
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute top-1 left-1 flex items-center gap-0.5">
                          <span className="text-[8px] text-muted-foreground bg-black/50 px-1 py-0.5 rounded">
                            {msg.timestamp.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          {!msg.isExecution && (
                            <button onClick={() => navigator.clipboard.writeText(msg.content)}
                              className="text-[9px] bg-muted/80 text-gray-300 px-1.5 py-0.5 rounded hover:bg-muted">
                              <Copy className="w-2.5 h-2.5" />
                            </button>
                          )}
                          <button onClick={() => setPinnedMessages(prev => { const n = new Set(prev); n.has(globalIdx) ? n.delete(globalIdx) : n.add(globalIdx); return n; })}
                            className={`text-[9px] px-1 py-0.5 rounded ${pinnedMessages.has(globalIdx) ? "bg-yellow-500/30 text-yellow-400" : "bg-muted/80 text-gray-300 hover:bg-muted"}`}>
                            📌
                          </button>
                        </div>
                        {pinnedMessages.has(globalIdx) && <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-yellow-400" />}
                      </div>
                    </div>
                  );
                })}
                    </>
                  );
                })()}

                {streaming && (
                  <div className="flex gap-3">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center flex-shrink-0">
                      <Bot className="w-4 h-4 text-foreground" />
                    </div>
                    <div className="max-w-[80%] bg-card border border-border rounded-xl px-4 py-2.5 text-sm">
                      <div className="prose prose-invert prose-sm max-w-none">
                        <RenderContentWithCharts content={streaming} />
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <Loader2 className="w-3 h-3 animate-spin text-cyan-400" />
                        {(activeTab.loopCount || 0) > 1 && (
                          <span className="text-[10px] text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded font-mono">
                            🔄 סבב {activeTab.loopCount}/{MAX_AUTO_LOOPS}
                          </span>
                        )}
                        <button onClick={stopStreaming} className="text-[10px] text-red-400 hover:text-red-300 flex items-center gap-0.5">
                          <StopCircle className="w-3 h-3" /> עצור
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              <div className="border-t border-border p-3 bg-card relative">
                {showSlashMenu && (() => {
                  const cmds = [
                    { cmd: "/status", desc: "מצב מערכת מלא", prompt: "הצג סטטוס מלא של המערכת — זיכרון, uptime, חיבורי DB" },
                    { cmd: "/perf", desc: "בדיקת ביצועים", prompt: "בצע בדיקת ביצועים מלאה — DB latency, API response, ציון כולל" },
                    { cmd: "/quality", desc: "דוח איכות נתונים", prompt: "הפק דוח איכות נתונים — ציון איכות לכל ישות" },
                    { cmd: "/suggest", desc: "הצעות חכמות", prompt: "תן לי הצעות חכמות — מה כדאי לעשות עכשיו?" },
                    { cmd: "/schema", desc: "ייצוא סכמה", prompt: "ייצא את כל סכמת המערכת — מודולים, ישויות ושדות" },
                    { cmd: "/tables", desc: "רשימת טבלאות", prompt: "הצג את כל הטבלאות ב-DB עם גדלים ומספר שורות" },
                    { cmd: "/search", desc: "חיפוש גלובלי", prompt: "חפש את המילה '" },
                    { cmd: "/audit", desc: "יומן שינויים", prompt: "הצג את 20 השינויים האחרונים במערכת" },
                    { cmd: "/entities", desc: "רשימת ישויות", prompt: "הצג רשימת כל הישויות במערכת" },
                    { cmd: "/modules", desc: "רשימת מודולים", prompt: "הצג רשימת כל המודולים" },
                    { cmd: "/dbsize", desc: "גודל מסד נתונים", prompt: "הצג את גודל מסד הנתונים המלא" },
                    { cmd: "/clear", desc: "נקה שיחה", prompt: "__clear__" },
                  ].filter(c => !slashFilter || c.cmd.includes(slashFilter) || c.desc.includes(slashFilter));
                  return cmds.length > 0 ? (
                    <div className="absolute bottom-full left-3 right-3 mb-1 bg-card border border-border rounded-lg shadow-2xl max-h-[250px] overflow-y-auto z-50">
                      <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-b border-border">פקודות מהירות — הקלד / לחיפוש</div>
                      {cmds.map((c, ci) => (
                        <button key={ci} onClick={() => {
                          setShowSlashMenu(false); setSlashFilter(""); setInput("");
                          if (c.prompt === "__clear__") {
                            setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, messages: [], conversationId: null } : t));
                          } else { sendMessage(c.prompt); }
                        }} className="w-full flex items-center gap-3 px-3 py-2 hover:bg-card/5 text-right">
                          <span className="text-cyan-400 font-mono text-xs w-20">{c.cmd}</span>
                          <span className="text-muted-foreground text-xs">{c.desc}</span>
                        </button>
                      ))}
                    </div>
                  ) : null;
                })()}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={e => { if (e.target.files) handleImageFiles(e.target.files); e.target.value = ""; }}
                />
                {activeTab.pendingImages.length > 0 && (
                  <div className="flex gap-2 px-2 py-1.5 bg-card rounded-t-xl border border-b-0 border-border overflow-x-auto">
                    {activeTab.pendingImages.map((img, i) => (
                      <div key={i} className="relative group flex-shrink-0">
                        <img src={img} className="h-16 w-16 object-cover rounded-lg border border-border" />
                        <button
                          onClick={() => removePendingImage(i)}
                          className="absolute -top-1.5 -left-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <X className="w-3 h-3 text-foreground" />
                        </button>
                      </div>
                    ))}
                    <span className="text-[10px] text-muted-foreground self-end pb-1">{activeTab.pendingImages.length}/5</span>
                  </div>
                )}
                <div className={`flex items-center gap-2 bg-card ${activeTab.pendingImages.length > 0 ? "rounded-b-xl border-t-0" : "rounded-xl"} border border-border px-3 py-1 focus-within:border-cyan-500/50`}>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="p-1.5 text-muted-foreground hover:text-cyan-400 transition-colors"
                    title="העלה צילום מסך (או הדבק Ctrl+V)">
                    <ImagePlus className="w-4.5 h-4.5" />
                  </button>
                  <textarea ref={textareaRef} value={input} onChange={e => {
                    const val = e.target.value;
                    setInput(val);
                    if (val.startsWith("/")) { setShowSlashMenu(true); setSlashFilter(val); }
                    else { setShowSlashMenu(false); setSlashFilter(""); }
                  }}
                    onKeyDown={e => {
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); setShowSlashMenu(false); sendMessage(); }
                      if (e.key === "Escape") { setShowSlashMenu(false); }
                    }}
                    className="flex-1 bg-transparent text-foreground text-sm outline-none resize-none min-h-[36px] max-h-[120px] py-1.5" placeholder="הקלד הודעה... (/ לפקודות מהירות, Ctrl+V להדבקת תמונה)"
                    rows={1} style={{ height: "auto" }}
                    onInput={e => { const t = e.currentTarget; t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 120) + "px"; }}
                  />
                  {activeTab.isStreaming ? (
                    <button onClick={stopStreaming} className="p-2 text-red-400 hover:text-red-300"><StopCircle className="w-5 h-5" /></button>
                  ) : (
                    <button onClick={() => sendMessage()} disabled={!input.trim() && activeTab.pendingImages.length === 0} className="p-2 text-cyan-400 hover:text-cyan-300 disabled:text-muted-foreground">
                      <Send className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
            </>
          )}

          {activeWorkspace === "editor" && (
            <div className="flex flex-col h-full">
              {editorFile ? (
                <>
                  <div className="flex items-center justify-between px-3 py-2 bg-card border-b border-border flex-shrink-0">
                    <div className="flex items-center gap-2 text-xs">
                      <FileCode className="w-3.5 h-3.5 text-blue-400" />
                      <span className="text-gray-300 font-mono">{editorFile.path}</span>
                      {editorDirty && <span className="text-orange-400 text-[10px] bg-orange-400/10 px-1.5 py-0.5 rounded">שינויים</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={saveFile} disabled={!editorDirty}
                        className="px-3 py-1 bg-green-600 hover:bg-green-500 disabled:opacity-30 text-foreground rounded text-xs flex items-center gap-1">
                        שמור (Ctrl+S)
                      </button>
                      <button onClick={() => { const prompt = `נתח את הקוד הבא מ-${editorFile.path} והצע שיפורים:\n\n\`\`\`${editorFile.language}\n${editorContent.slice(0, 3000)}\n\`\`\``; sendMessage(prompt); }}
                        className="px-3 py-1 bg-purple-600/50 hover:bg-purple-600 text-foreground rounded text-xs flex items-center gap-1">
                        <Sparkles className="w-3 h-3" /> נתח עם AI
                      </button>
                      <button onClick={() => { setEditorFile(null); setEditorDirty(false); }} className="text-muted-foreground hover:text-foreground p-1"><X className="w-4 h-4" /></button>
                    </div>
                  </div>
                  <div className="flex-1">
                    <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin text-cyan-400" /></div>}>
                      <MonacoEditor
                        height="100%"
                        language={editorFile.language}
                        value={editorContent}
                        theme="vs-dark"
                        onChange={v => { setEditorContent(v || ""); setEditorDirty(v !== editorFile.content); }}
                        options={{ fontSize: 13, minimap: { enabled: true }, wordWrap: "on", lineNumbers: "on", scrollBeyondLastLine: false, renderWhitespace: "selection", tabSize: 2, automaticLayout: true }}
                      />
                    </Suspense>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <Code2 className="w-16 h-16 mb-4 opacity-20" />
                  <p className="text-lg font-medium text-muted-foreground">עורך קוד</p>
                  <p className="text-sm mt-1">בחר קובץ מלשונית "קבצים" לעריכה</p>
                  <button onClick={() => setActiveWorkspace("files")} className="mt-4 px-4 py-2 bg-cyan-600/20 text-cyan-400 rounded-lg text-sm hover:bg-cyan-600/30 flex items-center gap-2">
                    <FolderTree className="w-4 h-4" /> פתח סייר קבצים
                  </button>
                </div>
              )}
            </div>
          )}

          {activeWorkspace === "terminal" && <DevTerminalPanel />}

          {activeWorkspace === "files" && (
            <div className="flex h-full">
              <div className="w-72 border-l border-border bg-card">
                <DevFileTree onFileSelect={loadFileContent} />
              </div>
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                {editorFile ? (
                  <div className="flex flex-col h-full w-full">
                    <div className="flex items-center justify-between px-3 py-2 bg-card border-b border-border">
                      <div className="flex items-center gap-2 text-xs">
                        <FileCode className="w-3.5 h-3.5 text-blue-400" />
                        <span className="text-gray-300 font-mono">{editorFile.path}</span>
                      </div>
                      <button onClick={saveFile} disabled={!editorDirty}
                        className="px-3 py-1 bg-green-600 hover:bg-green-500 disabled:opacity-30 text-foreground rounded text-xs">שמור</button>
                    </div>
                    <div className="flex-1">
                      <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin text-cyan-400" /></div>}>
                        <MonacoEditor height="100%" language={editorFile.language} value={editorContent} theme="vs-dark"
                          onChange={v => { setEditorContent(v || ""); setEditorDirty(v !== editorFile.content); }}
                          options={{ fontSize: 13, minimap: { enabled: false }, wordWrap: "on", lineNumbers: "on", scrollBeyondLastLine: false, tabSize: 2, automaticLayout: true }} />
                      </Suspense>
                    </div>
                  </div>
                ) : (
                  <div className="text-center">
                    <FolderTree className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p>בחר קובץ מהסייר</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeWorkspace === "preview" && <DevPreviewPanel />}
          {activeWorkspace === "tests" && <DevQAPanel />}
          {activeWorkspace === "database" && <DevDatabasePanel />}
          {activeWorkspace === "monitor" && <DevSystemHealthPanel />}
          {activeWorkspace === "git" && <DevVersionControlPanel />}
          {activeWorkspace === "dataflow" && <DevDataFlowPanel />}
          {activeWorkspace === "modules" && <DevModuleBuilderPanel onSendToChat={msg => sendMessage(msg)} />}
          {activeWorkspace === "bugs" && <DevBugScannerPanel onSendToChat={msg => sendMessage(msg)} />}
          {activeWorkspace === "docs" && <DevDocsPanel />}

          {activeWorkspace === "swarm" && (
            <div className="flex-1 overflow-auto p-4 space-y-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-pink-400" />
                  <h2 className="text-lg font-bold text-foreground">נחיל סוכנים — Multi-Agent Swarm</h2>
                </div>
                <span className="text-xs text-muted-foreground">סוכנים מקבילים ללא הגבלה · כל סוכן רץ עד 10 סבבים אוטונומיים</span>
              </div>

              {!swarmPolling && (!swarmStatus || swarmStatus.status !== "running") && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">הגדר משימות לסוכנים ({swarmTasks.length})</span>
                    <button
                      onClick={() => { setSwarmTasks([...swarmTasks, { task: "", agentName: `סוכן ${swarmTasks.length + 1}` }]); }}
                      className="text-xs px-2 py-1 bg-pink-500/20 text-pink-300 rounded hover:bg-pink-500/30 disabled:opacity-30">
                      <Plus className="w-3 h-3 inline ml-1" />הוסף סוכן
                    </button>
                  </div>
                  {swarmTasks.map((t, i) => (
                    <div key={i} className="bg-card border border-border rounded-lg p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center text-[10px] font-bold text-foreground flex-shrink-0">{i + 1}</div>
                        <input
                          value={t.agentName}
                          onChange={e => { const u = [...swarmTasks]; u[i] = { ...u[i], agentName: e.target.value }; setSwarmTasks(u); }}
                          className="bg-transparent text-sm text-foreground font-medium border-none outline-none flex-1"
                          placeholder="שם הסוכן..."
                        />
                        {swarmTasks.length > 1 && (
                          <button onClick={() => setSwarmTasks(swarmTasks.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-red-400 p-1">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <textarea
                        value={t.task}
                        onChange={e => { const u = [...swarmTasks]; u[i] = { ...u[i], task: e.target.value }; setSwarmTasks(u); }}
                        placeholder="תאר את המשימה לסוכן הזה... (למשל: 'בצע בדיקת ביצועים מלאה למערכת')"
                        className="w-full bg-card text-sm text-gray-300 rounded px-3 py-2 border border-border resize-none focus:border-pink-500/50 focus:outline-none"
                        rows={2}
                      />
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <button
                      onClick={launchSwarm}
                      disabled={swarmTasks.every(t => !t.task.trim())}
                      className="flex-1 py-2.5 bg-gradient-to-r from-pink-600 to-purple-600 text-foreground rounded-lg font-bold text-sm hover:from-pink-500 hover:to-purple-500 disabled:opacity-30 flex items-center justify-center gap-2 transition-all">
                      <Zap className="w-4 h-4" />
                      שגר {swarmTasks.filter(t => t.task.trim()).length} סוכנים במקביל
                    </button>
                    <button
                      onClick={() => {
                        const templates = [
                          { agentName: "סוכן ביצועים", task: "בצע בדיקת ביצועים מלאה — DB latency, API response time, ציון כולל" },
                          { agentName: "סוכן איכות", task: "הפק דוח איכות נתונים — ציון איכות לכל ישות, שדות חסרים, בעיות" },
                          { agentName: "סוכן סכמה", task: "ייצא את כל סכמת המערכת — מודולים, ישויות, שדות, קשרים" },
                          { agentName: "סוכן מצב", task: "הצג סטטוס מלא — זיכרון, uptime, חיבורי DB, גודל מאגר" },
                          { agentName: "סוכן קוד", task: "סרוק את הקוד — חפש שגיאות, TODO, הערות חשובות בקבצי TypeScript" },
                        ];
                        setSwarmTasks(templates.slice(0, 5));
                      }}
                      className="px-3 py-2 bg-muted text-muted-foreground rounded-lg text-xs hover:bg-muted hover:text-foreground">
                      תבנית מוכנה
                    </button>
                  </div>
                </div>
              )}

              {swarmStatus && swarmStatus.error && !swarmStatus.agents && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-center gap-3">
                  <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-red-300">שגיאה בהפעלת הנחיל</p>
                    <p className="text-xs text-red-400/70 mt-1">{swarmStatus.error}</p>
                  </div>
                  <button onClick={() => setSwarmStatus(null)} className="mr-auto text-xs text-muted-foreground hover:text-foreground px-2 py-1 bg-muted rounded">נסה שוב</button>
                </div>
              )}

              {swarmStatus && swarmStatus.agents && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 bg-card border border-border rounded-lg p-3">
                    <div className={`w-3 h-3 rounded-full ${swarmStatus.status === "running" ? "bg-yellow-400 animate-pulse" : swarmStatus.status === "completed" ? "bg-green-400" : "bg-red-400"}`} />
                    <span className="text-sm font-medium text-foreground">
                      {swarmStatus.status === "running" ? "🔄 נחיל פעיל..." : swarmStatus.status === "completed" ? "✅ כל הסוכנים סיימו!" : "❌ שגיאה"}
                    </span>
                    <span className="text-xs text-muted-foreground mr-auto">
                      {(swarmStatus.agents || []).filter((a: any) => a.status === "completed").length}/{(swarmStatus.agents || []).length} הושלמו
                    </span>
                    {swarmStatus.status !== "running" && (
                      <button onClick={() => { setSwarmStatus(null); setSwarmSessionId(null); setSwarmExpanded(new Set()); }} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 bg-muted rounded">
                        משימה חדשה
                      </button>
                    )}
                  </div>

                  <div className="grid gap-2">
                    {(swarmStatus.agents || []).map((agent: any, idx: number) => (
                      <div key={idx} className="bg-card border border-border rounded-lg overflow-hidden">
                        <div
                          className="flex items-center gap-3 p-3 cursor-pointer hover:bg-card/5"
                          onClick={() => setSwarmExpanded(prev => { const s = new Set(prev); s.has(idx) ? s.delete(idx) : s.add(idx); return s; })}>
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-foreground flex-shrink-0 ${
                            agent.status === "completed" ? "bg-green-600" : agent.status === "running" ? "bg-yellow-600 animate-pulse" : agent.status === "failed" ? "bg-red-600" : "bg-muted"
                          }`}>{idx + 1}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-foreground truncate">{agent.agentName}</span>
                              {agent.status === "running" && <Loader2 className="w-3 h-3 animate-spin text-yellow-400" />}
                              {agent.status === "completed" && <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />}
                              {agent.status === "failed" && <XCircle className="w-3.5 h-3.5 text-red-400" />}
                            </div>
                            <p className="text-[11px] text-muted-foreground truncate">{agent.task}</p>
                          </div>
                          <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-shrink-0">
                            {agent.loops > 0 && <span className="bg-cyan-500/10 text-cyan-400 px-1.5 py-0.5 rounded">🔄 {agent.loops} סבבים</span>}
                            {(agent.actionCount || 0) > 0 && <span className="bg-green-500/10 text-green-400 px-1.5 py-0.5 rounded">⚡ {agent.successCount}/{agent.actionCount} פעולות</span>}
                            <ChevronRight className={`w-3.5 h-3.5 transition-transform ${swarmExpanded.has(idx) ? "rotate-90" : ""}`} />
                          </div>
                        </div>
                        {swarmExpanded.has(idx) && (
                          <div className="border-t border-border p-3 bg-card">
                            {agent.error && <p className="text-xs text-red-400 mb-2">שגיאה: {agent.error}</p>}
                            {agent.finalSummary && (
                              <div className="text-xs text-gray-300 prose prose-invert prose-xs max-w-none">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{agent.finalSummary}</ReactMarkdown>
                              </div>
                            )}
                            {!agent.finalSummary && agent.status === "running" && (
                              <div className="flex items-center gap-2 text-xs text-yellow-400">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                <span>סוכן עובד... סבב {agent.loops}</span>
                              </div>
                            )}
                            {!agent.finalSummary && agent.status === "pending" && (
                              <span className="text-xs text-muted-foreground">ממתין להפעלה...</span>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 space-y-4">
        <div>
          <button
            onClick={() => setShowActivityLog(prev => !prev)}
            className="flex items-center gap-2 px-3 py-2 text-sm rounded-md border border-border bg-muted/40 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          >
            <History className="h-4 w-4" />
            {showActivityLog ? "הסתר היסטוריית פעילות" : "היסטוריית פעילות"}
            <ChevronDown className={`h-4 w-4 transition-transform ${showActivityLog ? "rotate-180" : ""}`} />
          </button>
          {showActivityLog && (
            <div className="mt-2">
              <ActivityLog entityType="kimi-terminal" />
            </div>
          )}
        </div>
        <RelatedRecords entityType="kimi-terminal" />
      </div>
    </div>
  );
}
