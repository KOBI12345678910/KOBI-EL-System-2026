import { useState, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send, Loader2, BarChart3, TableIcon, MessageCircle, Sparkles,
  Clock, ChevronDown, X, Brain, TrendingUp, Database, HelpCircle
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { authFetch } from "@/lib/utils";

const API = "/api";
const token = () => localStorage.getItem("erp_token") || document.cookie.match(/token=([^;]+)/)?.[1] || "";
const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token()}` });

const COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];

interface QueryResult {
  question: string;
  description: string;
  sql: string;
  rows: Record<string, unknown>[];
  columns: { key: string; label: string; type: string }[];
  rowCount: number;
  chart_type: "bar" | "line" | "pie" | "table" | "number";
  ai_summary: string;
  elapsed_ms: number;
}

interface HistoryItem {
  id: string;
  question: string;
  timestamp: Date;
  rowCount: number;
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  const num = Number(v);
  if (!isNaN(num) && typeof v !== "boolean") {
    if (num >= 1000000) return `₪${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) return `₪${(num / 1000).toFixed(0)}K`;
    if (num !== Math.floor(num)) return num.toFixed(2);
    return num.toLocaleString("he-IL");
  }
  return String(v);
}

function ChartView({ result }: { result: QueryResult }) {
  const { rows, chart_type, columns } = result;

  const numCols = useMemo(() => columns.filter(c => c.type === "number"), [columns]);
  const strCols = useMemo(() => columns.filter(c => c.type !== "number"), [columns]);
  const labelKey = strCols[0]?.key || columns[0]?.key;
  const valueKey = numCols[0]?.key || columns[1]?.key;

  const pieData = useMemo(() => chart_type !== "pie" ? [] : rows.slice(0, 8).map(r => ({
    name: String(r[labelKey] ?? ""),
    value: Number(r[valueKey] ?? 0),
  })), [chart_type, rows, labelKey, valueKey]);

  const pieTotal = useMemo(() => pieData.reduce((s, d) => s + d.value, 0), [pieData]);

  const lineChartData = useMemo(() => chart_type !== "line" ? [] : rows.map(r => {
    const entry: Record<string, unknown> = { name: String(r[labelKey] ?? "") };
    numCols.forEach(col => { entry[col.label] = Number(r[col.key] ?? 0); });
    return entry;
  }), [chart_type, rows, labelKey, numCols]);

  const barChartData = useMemo(() => (chart_type === "pie" || chart_type === "line" || chart_type === "number") ? [] : rows.slice(0, 15).map(r => {
    const entry: Record<string, unknown> = { name: String(r[labelKey] ?? "").substring(0, 20) };
    numCols.forEach(col => { entry[col.label] = Number(r[col.key] ?? 0); });
    return entry;
  }), [chart_type, rows, labelKey, numCols]);

  if (!rows || rows.length === 0) return null;

  if (chart_type === "number" && numCols.length > 0) {
    return (
      <div className="grid grid-cols-2 gap-3 mt-3">
        {numCols.map((col, i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-foreground">{formatValue(rows[0]?.[col.key])}</div>
            <div className="text-xs text-muted-foreground mt-1">{col.label}</div>
          </div>
        ))}
      </div>
    );
  }

  if (chart_type === "pie" && rows.length > 0) {
    const total = pieTotal;
    return (
      <div className="mt-3 bg-card border border-border rounded-xl p-4">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={3} dataKey="value">
              {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
              formatter={(v: number) => [formatValue(v), ""]}
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
        <div className="grid grid-cols-2 gap-1 mt-2">
          {pieData.map((d, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
              <span className="text-muted-foreground truncate">{d.name}</span>
              <span className="text-foreground font-medium ml-auto">{total > 0 ? Math.round((d.value / total) * 100) : 0}%</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (chart_type === "line" && rows.length > 0) {
    return (
      <div className="mt-3 bg-card border border-border rounded-xl p-4">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={lineChartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#222" />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#888" }} />
            <YAxis tick={{ fontSize: 10, fill: "#888" }} tickFormatter={v => formatValue(v)} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
              formatter={(v: number) => [formatValue(v), ""]}
            />
            {numCols.map((col, i) => (
              <Line key={i} type="monotone" dataKey={col.label} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 3 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (rows.length > 0) {
    return (
      <div className="mt-3 bg-card border border-border rounded-xl p-4">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={barChartData} barSize={30}>
            <CartesianGrid strokeDasharray="3 3" stroke="#222" />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#888" }} />
            <YAxis tick={{ fontSize: 10, fill: "#888" }} tickFormatter={v => formatValue(v)} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
              formatter={(v: number) => [formatValue(v), ""]}
            />
            {numCols.map((col, i) => (
              <Bar key={i} dataKey={col.label} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return null;
}

function TableView({ result }: { result: QueryResult }) {
  const { rows, columns } = result;
  if (!rows || rows.length === 0) return (
    <div className="text-center py-8 text-muted-foreground text-sm">אין תוצאות</div>
  );

  return (
    <div className="mt-3 overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/20">
            {columns.map(col => (
              <th key={col.key} className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 50).map((row, i) => (
            <tr key={i} className="border-t border-border/30 hover:bg-card/50">
              {columns.map(col => (
                <td key={col.key} className={`px-3 py-2 ${col.type === "number" ? "text-emerald-400 font-mono" : "text-foreground"}`}>
                  {formatValue(row[col.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 50 && (
        <div className="text-center text-xs text-muted-foreground p-2 bg-muted/10">
          מציג 50 מתוך {rows.length} תוצאות
        </div>
      )}
    </div>
  );
}

export default function NLQueryPage() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<"chart" | "table" | "both">("both");
  const [showSQL, setShowSQL] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    authFetch(`${API}/analytics/nl-query/suggestions`, { headers: headers() })
      .then(r => r.json())
      .then(d => setSuggestions(d.suggestions || []))
      .catch(() => {});
  }, []);

  async function handleSubmit(q?: string) {
    const query = (q || question).trim();
    if (!query || loading) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setShowSQL(false);

    try {
      const r = await authFetch(`${API}/analytics/nl-query`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ question: query }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error || "שגיאה לא ידועה");
      } else {
        setResult(data);
        const newItem: HistoryItem = {
          id: `${Date.now()}`,
          question: query,
          timestamp: new Date(),
          rowCount: data.rowCount,
        };
        setHistory(prev => [newItem, ...prev.slice(0, 9)]);
      }
    } catch (err: any) {
      setError("שגיאת רשת — נסה שוב");
    } finally {
      setLoading(false);
    }
  }

  function handleSuggestion(s: string) {
    setQuestion(s);
    handleSubmit(s);
  }

  return (
    <div className="space-y-4 sm:space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
          <Brain className="w-5 h-5 text-blue-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">שאילתות בעברית — NL Query</h1>
          <p className="text-xs text-muted-foreground">שאל שאלות עסקיות בעברית וקבל תשובות מיידיות עם גרפים</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-1 space-y-3">
          <div className="bg-card border border-border rounded-xl p-3">
            <div className="flex items-center gap-2 mb-3">
              <HelpCircle className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-medium text-foreground">שאלות מומלצות</span>
            </div>
            <div className="space-y-1.5">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => handleSuggestion(s)}
                  className="w-full text-right text-xs px-2 py-1.5 rounded-lg bg-muted/20 hover:bg-blue-500/10 hover:text-blue-400 text-muted-foreground transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {history.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-3">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">היסטוריה</span>
              </div>
              <div className="space-y-1.5">
                {history.map(item => (
                  <button
                    key={item.id}
                    onClick={() => handleSuggestion(item.question)}
                    className="w-full text-right text-xs px-2 py-1.5 rounded-lg bg-muted/20 hover:bg-muted/40 text-muted-foreground transition-colors"
                  >
                    <div className="truncate">{item.question}</div>
                    <div className="text-[10px] text-muted-foreground/60 mt-0.5">{item.rowCount} תוצאות</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-3 space-y-4">
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={question}
                onChange={e => setQuestion(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSubmit()}
                placeholder="שאל שאלה עסקית בעברית... (לדוגמה: מה המכירות של חודש שעבר?)"
                className="flex-1 bg-background/50 border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
                dir="rtl"
              />
              <button
                onClick={() => handleSubmit()}
                disabled={loading || !question.trim()}
                className="px-4 py-2.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-foreground rounded-lg transition-colors flex items-center gap-2 text-sm font-medium"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {loading ? "מעבד..." : "שאל"}
              </button>
            </div>

            {!loading && !result && !error && (
              <div className="mt-4 flex flex-wrap gap-2">
                {["מה המכירות של החודש?", "כמה מלאי יש?", "לקוחות מובילים?"].map(s => (
                  <button
                    key={s}
                    onClick={() => handleSuggestion(s)}
                    className="text-xs px-3 py-1.5 rounded-full bg-muted/30 hover:bg-blue-500/10 hover:text-blue-400 text-muted-foreground border border-border hover:border-blue-500/30 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          <AnimatePresence mode="wait">
            {loading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="bg-card border border-border rounded-xl p-8 text-center"
              >
                <Loader2 className="w-8 h-8 text-blue-400 animate-spin mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">מעבד את השאלה...</p>
                <p className="text-xs text-muted-foreground/60 mt-1">ממיר לשאילתת SQL ומריץ על בסיס הנתונים</p>
              </motion.div>
            )}

            {error && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="bg-card border border-red-500/30 rounded-xl p-4"
              >
                <div className="flex items-center gap-2 text-red-400 mb-2">
                  <X className="w-4 h-4" />
                  <span className="text-sm font-medium">שגיאה</span>
                </div>
                <p className="text-sm text-muted-foreground">{error}</p>
              </motion.div>
            )}

            {result && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="space-y-3"
              >
                <div className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <MessageCircle className="w-4 h-4 text-blue-400 flex-shrink-0" />
                        <span className="text-sm font-medium text-foreground">{result.description}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{result.rowCount} שורות</span>
                        <span>·</span>
                        <span>{result.elapsed_ms}ms</span>
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      {(["chart", "table", "both"] as const).map(mode => (
                        <button
                          key={mode}
                          onClick={() => setViewMode(mode)}
                          className={`p-1.5 rounded-lg transition-colors ${viewMode === mode ? "bg-blue-500/20 text-blue-400" : "text-muted-foreground hover:text-foreground"}`}
                          title={mode === "chart" ? "גרף" : mode === "table" ? "טבלה" : "שניהם"}
                        >
                          {mode === "chart" ? <BarChart3 className="w-4 h-4" /> : mode === "table" ? <TableIcon className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  {result.ai_summary && (
                    <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3 mb-3">
                      <div className="flex items-start gap-2">
                        <Brain className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-blue-300/90 leading-relaxed">{result.ai_summary}</p>
                      </div>
                    </div>
                  )}

                  {(viewMode === "chart" || viewMode === "both") && <ChartView result={result} />}
                  {(viewMode === "table" || viewMode === "both") && <TableView result={result} />}

                  <button
                    onClick={() => setShowSQL(!showSQL)}
                    className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Database className="w-3.5 h-3.5" />
                    {showSQL ? "הסתר SQL" : "הצג SQL שהופק"}
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showSQL ? "rotate-180" : ""}`} />
                  </button>
                  {showSQL && (
                    <div className="mt-2 bg-background/50 rounded-lg p-3 border border-border">
                      <pre className="text-xs text-muted-foreground font-mono whitespace-pre-wrap">{result.sql}</pre>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {!loading && !result && !error && (
            <div className="bg-card border border-border/50 rounded-xl p-8 text-center">
              <TrendingUp className="w-12 h-12 text-blue-400/30 mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground">שאל שאלה עסקית בעברית</p>
              <p className="text-xs text-muted-foreground mt-1">המערכת תמיר את השאלה ל-SQL ותחזיר נתונים אמיתיים עם גרפים</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
