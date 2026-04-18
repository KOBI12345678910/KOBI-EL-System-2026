import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  TrendingUp, TrendingDown, Minus, Brain, AlertTriangle, 
  MessageSquare, RefreshCcw, BarChart3, Sparkles, ChevronRight,
  ThumbsUp, ThumbsDown, Activity
} from "lucide-react";
import { authFetch } from "@/lib/utils";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, PieChart, Pie, Legend
} from "recharts";

const API = "/api";
const token = () => localStorage.getItem("erp_token") || document.cookie.match(/token=([^;]+)/)?.[1] || "";
const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token()}` });

const SENTIMENT_COLORS = {
  positive: "#22c55e",
  neutral: "#f59e0b",
  negative: "#ef4444",
};

const SOURCE_TYPE_LABELS: Record<string, string> = {
  crm_note: "הערת CRM",
  support_ticket: "פנייה תמיכה",
  customer_feedback: "משוב לקוח",
  employee_survey: "סקר עובדים",
};

function SentimentBadge({ sentiment }: { sentiment: string }) {
  const config = {
    positive: { bg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", icon: ThumbsUp, label: "חיובי" },
    neutral: { bg: "bg-amber-500/10 text-amber-400 border-amber-500/20", icon: Minus, label: "ניטרלי" },
    negative: { bg: "bg-red-500/10 text-red-400 border-red-500/20", icon: ThumbsDown, label: "שלילי" },
  }[sentiment] || { bg: "bg-muted/10 text-muted-foreground border-border", icon: Minus, label: "לא ידוע" };

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] border ${config.bg}`}>
      <config.icon className="w-3 h-3" />
      {config.label}
    </span>
  );
}

function ScoreBar({ score }: { score: number }) {
  const pct = ((score + 1) / 2) * 100;
  const color = score > 0.2 ? "bg-emerald-500" : score < -0.2 ? "bg-red-500" : "bg-amber-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted/30 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-muted-foreground w-12 text-left">{score > 0 ? "+" : ""}{score.toFixed(2)}</span>
    </div>
  );
}

export default function SentimentAnalysis() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<string>("all");
  const [analyzeText, setAnalyzeText] = useState("");
  const [analyzeResult, setAnalyzeResult] = useState<any>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await authFetch(`${API}/sentiment-analysis/dashboard`, { headers: headers() });
      if (!r.ok) throw new Error("שגיאה בטעינת נתונים");
      const d = await r.json();
      setData(d);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleAnalyzeText = async () => {
    if (!analyzeText.trim()) return;
    setAnalyzing(true);
    setAnalyzeResult(null);
    try {
      const r = await authFetch(`${API}/sentiment-analysis/analyze-text`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ text: analyzeText }),
      });
      const d = await r.json();
      setAnalyzeResult(d.result);
    } catch {}
    setAnalyzing(false);
  };

  const filteredItems = data?.recentItems?.filter((item: any) =>
    selectedSource === "all" || item.sourceType === selectedSource
  ) || [];

  const pieData = data ? [
    { name: "חיובי", value: data.stats.positiveRate, color: SENTIMENT_COLORS.positive },
    { name: "ניטרלי", value: data.stats.neutralRate, color: SENTIMENT_COLORS.neutral },
    { name: "שלילי", value: data.stats.negativeRate, color: SENTIMENT_COLORS.negative },
  ] : [];

  return (
    <div className="space-y-4 sm:space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
            <Brain className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">ניתוח סנטימנט AI</h1>
            <p className="text-xs text-muted-foreground">ניתוח טקסט מ-CRM, תמיכה, משוב לקוחות וסקרי עובדים</p>
          </div>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 bg-card border border-border rounded-xl text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCcw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          רענן
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
          <div className="text-center">
            <Brain className="w-8 h-8 mx-auto mb-2 animate-pulse text-blue-400" />
            <p>טוען וסוקר נתוני סנטימנט...</p>
          </div>
        </div>
      ) : data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "סה\"כ פריטים", value: data.stats.total, color: "text-foreground", bg: "bg-muted/10 border-border" },
              { label: "חיובי", value: `${data.stats.positiveRate}%`, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
              { label: "ניטרלי", value: `${data.stats.neutralRate}%`, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
              { label: "שלילי", value: `${data.stats.negativeRate}%`, color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
            ].map((s, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className={`border rounded-xl p-3 text-center ${s.bg}`}
              >
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
              </motion.div>
            ))}
          </div>

          {data.stats.usedAI && (
            <div className="flex items-center gap-2 px-3 py-2 bg-violet-500/10 border border-violet-500/20 rounded-xl">
              <Sparkles className="w-4 h-4 text-violet-400" />
              <span className="text-violet-300 text-xs">ניתוח AI פעיל — Claude מנתח את הטקסטים ומזהה סנטימנט ונושאים</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 bg-card border border-border rounded-2xl p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-400" /> מגמת סנטימנט חודשית
              </h3>
              {data.monthlyTrend?.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={data.monthlyTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#666" }} />
                    <YAxis tick={{ fontSize: 10, fill: "#666" }} />
                    <Tooltip
                      contentStyle={{ background: "#1a1d23", border: "1px solid #333", borderRadius: 8 }}
                      formatter={(val: any) => `${val}%`}
                    />
                    <Line type="monotone" dataKey="positiveRate" name="חיובי" stroke={SENTIMENT_COLORS.positive} strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="negativeRate" name="שלילי" stroke={SENTIMENT_COLORS.negative} strokeWidth={2} dot={{ r: 3 }} strokeDasharray="4 2" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
                  אין מספיק נתונים לגרף
                </div>
              )}
            </div>

            <div className="bg-card border border-border rounded-2xl p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-violet-400" /> התפלגות
              </h3>
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={75}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}%`}
                      labelLine={false}
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={index} fill={entry.color} fillOpacity={0.85} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(val: any) => `${val}%`} />
                  </PieChart>
                </ResponsiveContainer>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-card border border-border rounded-2xl p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-amber-400" /> נושאים מובילים
              </h3>
              {data.topThemes?.length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={data.topThemes.slice(0, 7)} layout="vertical" margin={{ right: 40 }}>
                    <XAxis type="number" tick={{ fontSize: 10, fill: "#666" }} />
                    <YAxis dataKey="theme" type="category" tick={{ fontSize: 10, fill: "#aaa" }} width={80} />
                    <Tooltip contentStyle={{ background: "#1a1d23", border: "1px solid #333", borderRadius: 8 }} />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                      {(data.topThemes || []).slice(0, 7).map((entry: any, i: number) => (
                        <Cell key={i} fill={SENTIMENT_COLORS[entry.sentiment as keyof typeof SENTIMENT_COLORS] || SENTIMENT_COLORS.neutral} fillOpacity={0.8} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[180px] flex items-center justify-center text-muted-foreground text-sm text-center">
                  <div>
                    <Brain className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p>אין נתוני נושאים עדיין</p>
                    <p className="text-xs mt-1">ניתוח AI יחלץ נושאים מהטקסטים</p>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-card border border-border rounded-2xl p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400" /> התראות סנטימנט שלילי
              </h3>
              {data.negativeAlerts?.length > 0 ? (
                <div className="space-y-2">
                  {data.negativeAlerts.slice(0, 4).map((item: any, i: number) => (
                    <div key={i} className="p-2 bg-red-500/5 border border-red-500/20 rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-foreground">{item.source}</span>
                        <span className="text-[10px] text-muted-foreground">{item.date}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground line-clamp-2">{item.text}</p>
                      <ScoreBar score={item.score || -0.5} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm text-center py-8">
                  <div>
                    <TrendingUp className="w-8 h-8 mx-auto mb-2 text-emerald-400 opacity-50" />
                    <p>אין התראות שלילי חריגות</p>
                    <p className="text-xs mt-1">הסנטימנט הכללי חיובי!</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-blue-400" />
                פריטי משוב אחרונים
              </h3>
              <div className="flex gap-2">
                {["all", "crm_note", "customer_feedback", "employee_survey"].map(type => (
                  <button
                    key={type}
                    onClick={() => setSelectedSource(type)}
                    className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${selectedSource === type ? "bg-primary text-foreground" : "bg-muted/20 text-muted-foreground hover:text-foreground"}`}
                  >
                    {type === "all" ? "הכל" : SOURCE_TYPE_LABELS[type] || type}
                  </button>
                ))}
              </div>
            </div>
            {filteredItems.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">אין פריטים להצגה</p>
              </div>
            ) : (
              <div className="divide-y divide-border/30 max-h-80 overflow-y-auto">
                {filteredItems.map((item: any, i: number) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
                    className="p-4 hover:bg-muted/5"
                  >
                    <div className="flex items-start justify-between gap-3 mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{item.source}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/20 text-muted-foreground">
                          {SOURCE_TYPE_LABELS[item.sourceType] || item.sourceType}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <SentimentBadge sentiment={item.sentiment} />
                        <span className="text-[10px] text-muted-foreground">{item.date}</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-1.5">{item.text}</p>
                    {item.score !== undefined && <ScoreBar score={item.score} />}
                    {item.themes && item.themes.length > 0 && (
                      <div className="flex gap-1 mt-1.5 flex-wrap">
                        {item.themes.map((theme: string, ti: number) => (
                          <span key={ti} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">{theme}</span>
                        ))}
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-card border border-border rounded-2xl p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-400" /> נתח טקסט חדש
            </h3>
            <div className="flex gap-3">
              <textarea
                className="flex-1 bg-muted/10 border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder-muted-foreground resize-none focus:outline-none focus:border-violet-500"
                rows={2}
                placeholder="הכנס טקסט לניתוח סנטימנט..."
                value={analyzeText}
                onChange={e => setAnalyzeText(e.target.value)}
              />
              <button
                onClick={handleAnalyzeText}
                disabled={analyzing || !analyzeText.trim()}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-muted/20 disabled:cursor-not-allowed text-foreground text-sm rounded-xl flex items-center gap-2 self-end"
              >
                {analyzing ? (
                  <><RefreshCcw className="w-4 h-4 animate-spin" /> מנתח...</>
                ) : (
                  <><Brain className="w-4 h-4" /> נתח</>
                )}
              </button>
            </div>
            {analyzeResult && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-3 p-3 bg-muted/10 border border-border rounded-xl"
              >
                <div className="flex items-center gap-3 mb-2">
                  <SentimentBadge sentiment={analyzeResult.sentiment} />
                  <ScoreBar score={analyzeResult.score || 0} />
                </div>
                {analyzeResult.themes?.length > 0 && (
                  <div className="flex gap-1 mb-2 flex-wrap">
                    {analyzeResult.themes.map((t: string, i: number) => (
                      <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">{t}</span>
                    ))}
                  </div>
                )}
                {analyzeResult.summary && (
                  <p className="text-xs text-muted-foreground">{analyzeResult.summary}</p>
                )}
              </motion.div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
