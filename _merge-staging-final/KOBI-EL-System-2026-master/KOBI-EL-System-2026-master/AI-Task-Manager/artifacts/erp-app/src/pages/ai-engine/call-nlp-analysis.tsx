import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Phone, TrendingUp, TrendingDown, Minus, MessageSquare,
  Search, FileText, Zap, Activity,
  ChevronDown, ChevronUp, BarChart3, User
} from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import { authFetch } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from "recharts";

const API = "/api";
const token = () => localStorage.getItem("erp_token") || document.cookie.match(/token=([^;]+)/)?.[1] || "";
const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token()}` });

function SentimentIcon({ score }: { score: number | null }) {
  if (score === null) return <Minus className="w-4 h-4 text-muted-foreground" />;
  if (score >= 70) return <TrendingUp className="w-4 h-4 text-emerald-400" />;
  if (score >= 50) return <Minus className="w-4 h-4 text-amber-400" />;
  return <TrendingDown className="w-4 h-4 text-red-400" />;
}

function SentimentBar({ score, label }: { score: number | null; label: string }) {
  const pct = score ?? 0;
  const color = pct >= 70 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-400" : "bg-red-500";
  const textColor = pct >= 70 ? "text-emerald-400" : pct >= 50 ? "text-amber-400" : "text-red-400";
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className={`font-bold ${textColor}`}>{score !== null ? `${score}%` : "—"}</span>
      </div>
      <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function CallNLPAnalysis() {
  const [calls, setCalls] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [selectedCall, setSelectedCall] = useState<any | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    authFetch(`${API}/crm/calls`, { headers: headers() })
      .then(r => r.json())
      .then(d => {
        setCalls(d.calls || []);
        setStats({
          total: d.total || 0,
          avgSentiment: d.avgSentiment || 0,
          avgIntent: d.avgIntent || 0,
          highIntentCount: d.highIntentCount || 0,
        });
      })
      .catch(() => { setCalls([]); setStats({}); })
      .finally(() => setLoading(false));
  }, []);

  const filtered = calls.filter(c =>
    !search ||
    (c.lead || "").includes(search) ||
    (c.keywords || []).some((k: string) => k.includes(search)) ||
    (c.source || "").includes(search)
  );

  const intentDist = [
    { label: "גבוהה (>75)", count: calls.filter(c => c.buyIntent !== null && c.buyIntent >= 75).length, color: "#22c55e" },
    { label: "בינונית (50-75)", count: calls.filter(c => c.buyIntent !== null && c.buyIntent >= 50 && c.buyIntent < 75).length, color: "#f97316" },
    { label: "נמוכה (<50)", count: calls.filter(c => c.buyIntent !== null && c.buyIntent < 50).length, color: "#ef4444" },
  ];

  if (loading) return (
    <div className="flex items-center justify-center h-40 text-muted-foreground text-sm" dir="rtl">
      טוען נתוני שיחות...
    </div>
  );

  return (
    <div className="space-y-4 sm:space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
          <Phone className="w-5 h-5 text-violet-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Call NLP Analysis</h1>
          <p className="text-xs text-muted-foreground">ניתוח אוטומטי של שיחות ואינטראקציות — סנטימנט, כוונת קנייה ומילות מפתח</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "שיחות שנותחו", value: stats.total || 0, color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20" },
          { label: "ממוצע סנטימנט", value: stats.avgSentiment ? `${stats.avgSentiment}%` : "—", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
          { label: "ממוצע כוונת קנייה", value: stats.avgIntent ? `${stats.avgIntent}%` : "—", color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
          { label: "כוונה גבוהה (>75%)", value: stats.highIntentCount || 0, color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
        ].map((k, i) => (
          <div key={i} className={`border rounded-xl p-3 text-center ${k.bg}`}>
            <div className={`text-lg sm:text-2xl font-bold ${k.color}`}>{k.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" /> התפלגות כוונת קנייה
          </h3>
          {calls.some(c => c.buyIntent !== null) ? (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={intentDist} barSize={50}>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#666" }} />
                <YAxis tick={{ fontSize: 11, fill: "#666" }} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {intentDist.map((entry, i) => <Cell key={i} fill={entry.color} fillOpacity={0.85} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[160px] flex items-center justify-center text-muted-foreground text-sm">
              <div className="text-center">
                <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p>אין נתוני כוונת קנייה</p>
                <p className="text-xs">הוסף שדות sentiment/intent לרשומות שיחות</p>
              </div>
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-violet-400" /> ממוצעי ניתוח
          </h3>
          <div className="space-y-4 pt-4">
            {[
              { label: "ממוצע סנטימנט", value: stats.avgSentiment || null },
              { label: "ממוצע כוונת קנייה", value: stats.avgIntent || null },
            ].map((row, i) => (
              <SentimentBar key={i} score={row.value} label={row.label} />
            ))}
            <div className="text-xs text-muted-foreground mt-2">
              {calls.length} רשומות שיחות/אינטראקציות
            </div>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-semibold text-foreground text-sm">שיחות ואינטראקציות</h3>
          <div className="relative">
            <Search className="absolute right-3 top-2 w-4 h-4 text-muted-foreground" />
            <input
              className="input input-bordered h-8 text-sm pr-9 w-48"
              placeholder="חיפוש..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Phone className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">אין שיחות מנותחות</p>
            <p className="text-xs mt-1">הנתונים יופיעו כאשר יתווספו רשומות שיחות/אינטראקציות למערכת</p>
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {filtered.map((call, i) => (
              <motion.div key={call.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}>
                <div
                  className="p-4 hover:bg-card/[0.02] cursor-pointer"
                  onClick={() => setSelectedCall(selectedCall?.id === call.id ? null : call)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center">
                        <User className="w-4 h-4 text-violet-400" />
                      </div>
                      <div>
                        <div className="font-medium text-foreground text-sm">{call.lead}</div>
                        <div className="text-xs text-muted-foreground">{call.date || "—"} · {call.source || "—"}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {call.sentiment !== null && (
                        <div className="flex items-center gap-1.5">
                          <SentimentIcon score={call.sentiment} />
                          <span className="text-xs text-muted-foreground">סנטימנט: <span className="font-bold text-foreground">{call.sentiment}%</span></span>
                        </div>
                      )}
                      {call.buyIntent !== null && (
                        <div className="text-xs text-muted-foreground">כוונה: <span className="font-bold text-blue-400">{call.buyIntent}%</span></div>
                      )}
                      {call.direction && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${call.direction === "נכנסת" ? "bg-blue-500/10 text-blue-400" : "bg-violet-500/10 text-violet-400"}`}>
                          {call.direction}
                        </span>
                      )}
                      {selectedCall?.id === call.id ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </div>
                  {call.keywords && (Array.isArray(call.keywords) ? call.keywords : typeof call.keywords === "string" ? call.keywords.split(",").map((s: string) => s.trim()).filter(Boolean) : []).length > 0 && (
                    <div className="flex gap-1.5 mt-2 flex-wrap">
                      {(Array.isArray(call.keywords) ? call.keywords : typeof call.keywords === "string" ? call.keywords.split(",").map((s: string) => s.trim()).filter(Boolean) : []).map((kw: string, ki: number) => (
                        <span key={ki} className="text-[10px] px-1.5 py-0.5 rounded bg-muted/20 text-muted-foreground border border-border">
                          {kw}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <AnimatePresence>
                  {selectedCall?.id === call.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 bg-muted/5 border-t border-border/30">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                          <div className="space-y-3">
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">ניתוח</h4>
                            <SentimentBar score={call.sentiment} label="סנטימנט" />
                            <SentimentBar score={call.buyIntent} label="כוונת קנייה" />
                          </div>
                          <div>
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">פרטי שיחה</h4>
                            <div className="bg-muted/10 rounded-lg p-3 border border-border space-y-1 text-sm text-gray-300">
                              {call.phone && <div>טלפון: {call.phone}</div>}
                              {call.duration && <div>משך: {call.duration}</div>}
                              {call.result && <div>תוצאה: {call.result}</div>}
                              {call.agent && <div>נציג: {call.agent}</div>}
                              {call.summary && (
                                <div className="mt-2">
                                  <div className="text-xs text-muted-foreground mb-1">תקציר:</div>
                                  <div className="text-xs leading-relaxed">{call.summary}</div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="call-nlp" />
        <RelatedRecords entityType="call-nlp" />
      </div>
    </div>
  );
}
