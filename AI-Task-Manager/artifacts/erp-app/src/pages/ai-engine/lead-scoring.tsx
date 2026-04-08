import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Target, Download, Zap, Flame,
  Snowflake, BarChart3, Star,
  DollarSign, Clock, Activity, Globe, MessageSquare, ArrowUpDown
} from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import { authFetch } from "@/lib/utils";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell
} from "recharts";

const API = "/api";
const token = () => localStorage.getItem("erp_token") || document.cookie.match(/token=([^;]+)/)?.[1] || "";
const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token()}` });

const SCORE_PARAMS_RADAR = [
  { param: "מקור", hot: 90, warm: 65, cold: 30 },
  { param: "תקציב", hot: 88, warm: 60, cold: 25 },
  { param: "פעילות", hot: 85, warm: 55, cold: 20 },
  { param: "רשת חברתית", hot: 75, warm: 50, cold: 22 },
  { param: "סטטוס", hot: 92, warm: 62, cold: 28 },
];

const CATEGORY_CONFIG: Record<string, { label: string; color: string; bg: string; icon: typeof Flame }> = {
  hot: { label: "Hot 🔥", color: "text-red-400", bg: "bg-red-500/10 border-red-500/30", icon: Flame },
  warm: { label: "Warm 🌡️", color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/30", icon: Activity },
  cold: { label: "Cold ❄️", color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/30", icon: Snowflake },
};

function ScoreBar({ score }: { score: number }) {
  const color = score >= 80 ? "bg-red-500" : score >= 60 ? "bg-orange-400" : "bg-blue-500";
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-2 bg-muted/30 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-sm font-bold text-foreground w-8">{score}</span>
    </div>
  );
}

export default function LeadScoring() {
  const [leads, setLeads] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [scoreDist, setScoreDist] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState<"all" | "hot" | "warm" | "cold">("all");
  const [sortField, setSortField] = useState<string>("score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    setLoading(true);
    authFetch(`${API}/crm/leads/scored`, { headers: headers() })
      .then(r => r.json())
      .then(d => {
        setLeads(d.leads || []);
        setStats({ hotCount: d.hotCount || 0, warmCount: d.warmCount || 0, coldCount: d.coldCount || 0, avgScore: d.avgScore || 0 });
        setScoreDist(d.scoreDist || []);
      })
      .catch(() => {
        setLeads([]);
        setStats({});
        setScoreDist([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let list = filterCategory === "all" ? leads : leads.filter(l => l.category === filterCategory);
    list = [...list].sort((a: any, b: any) => {
      const v = a[sortField] > b[sortField] ? 1 : -1;
      return sortDir === "asc" ? v : -v;
    });
    return list;
  }, [leads, filterCategory, sortField, sortDir]);

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };

  const exportCSV = () => {
    const csv = ["שם,חברה,מקור,ציון,קטגוריה,תקציב", ...filtered.map(l => `${l.name},${l.company},${l.source},${l.score},${l.category},${l.budget}`)].join("\n");
    const b = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "lead-scoring.csv"; a.click();
  };

  if (loading) return (
    <div className="flex items-center justify-center h-40 text-muted-foreground text-sm" dir="rtl">
      טוען נתוני לידים...
    </div>
  );

  return (
    <div className="space-y-4 sm:space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
            <Target className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Lead Scoring AI</h1>
            <p className="text-xs text-muted-foreground">דירוג אוטומטי של לידים 0-100 לפי מודל ML</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCSV} disabled={leads.length === 0} className="btn btn-outline btn-sm flex items-center gap-1">
            <Download className="w-4 h-4" /> ייצוא
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Hot Leads 🔥", value: stats.hotCount ?? 0, color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
          { label: "Warm Leads 🌡️", value: stats.warmCount ?? 0, color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20" },
          { label: "Cold Leads ❄️", value: stats.coldCount ?? 0, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
          { label: "ציון ממוצע", value: stats.avgScore ?? 0, color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20" },
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
            <BarChart3 className="w-4 h-4 text-violet-400" /> פרמטרי ניקוד לפי קטגוריה
          </h3>
          <ResponsiveContainer width="100%" height={180}>
            <RadarChart data={SCORE_PARAMS_RADAR}>
              <PolarGrid stroke="#333" />
              <PolarAngleAxis dataKey="param" tick={{ fontSize: 10, fill: "#888" }} />
              <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
              <Radar name="Hot" dataKey="hot" stroke="#ef4444" fill="#ef4444" fillOpacity={0.15} />
              <Radar name="Warm" dataKey="warm" stroke="#f97316" fill="#f97316" fillOpacity={0.15} />
              <Radar name="Cold" dataKey="cold" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} />
            </RadarChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-4 mt-2">
            {[{ name: "Hot", color: "#ef4444" }, { name: "Warm", color: "#f97316" }, { name: "Cold", color: "#3b82f6" }].map(l => (
              <div key={l.name} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: l.color }} />
                <span className="text-xs text-muted-foreground">{l.name}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Star className="w-4 h-4 text-amber-400" /> התפלגות ציונים
          </h3>
          {scoreDist.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={scoreDist} barSize={48}>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                <XAxis dataKey="range" tick={{ fontSize: 11, fill: "#888" }} />
                <YAxis tick={{ fontSize: 11, fill: "#888" }} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                  labelStyle={{ color: "#fff" }}
                  itemStyle={{ color: "#aaa" }}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {scoreDist.map((entry: any, i: number) => <Cell key={i} fill={entry.color} fillOpacity={0.8} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[180px] flex items-center justify-center text-muted-foreground text-sm">אין נתונים</div>
          )}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-semibold text-foreground text-sm">טבלת לידים מדורגים</h3>
          <div className="flex gap-2">
            {(["all", "hot", "warm", "cold"] as const).map(cat => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  filterCategory === cat
                    ? "bg-primary border-primary text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {cat === "all" ? "הכל" : cat === "hot" ? "Hot 🔥" : cat === "warm" ? "Warm 🌡️" : "Cold ❄️"}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Target className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">אין לידים להצגה</p>
            <p className="text-xs mt-1">הוסף לידים דרך מודול ניהול הלידים</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/20 text-muted-foreground text-xs">
                  <th className="px-4 py-2 text-right font-medium">שם</th>
                  <th className="px-4 py-2 text-right font-medium">חברה</th>
                  <th className="px-4 py-2 text-right font-medium">מקור</th>
                  <th className="px-4 py-2 text-right font-medium cursor-pointer" onClick={() => toggleSort("budget")}>
                    <span className="flex items-center gap-1">תקציב <ArrowUpDown className="w-3 h-3" /></span>
                  </th>
                  <th className="px-4 py-2 text-right font-medium cursor-pointer" onClick={() => toggleSort("score")}>
                    <span className="flex items-center gap-1">ציון AI <ArrowUpDown className="w-3 h-3" /></span>
                  </th>
                  <th className="px-4 py-2 text-right font-medium">קטגוריה</th>
                  <th className="px-4 py-2 text-right font-medium">פוטנציאל</th>
                  <th className="px-4 py-2 text-right font-medium">קשר אחרון</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((lead, i) => {
                  const cat = CATEGORY_CONFIG[lead.category] || CATEGORY_CONFIG.cold;
                  return (
                    <motion.tr
                      key={lead.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.03 }}
                      className="border-t border-border/30 hover:bg-card/[0.02]"
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold">
                            {(lead.name || "?").charAt(0)}
                          </div>
                          <span className="font-medium text-foreground">{lead.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{lead.company || "—"}</td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs px-2 py-0.5 rounded bg-muted/20 text-muted-foreground">{lead.source || "—"}</span>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {lead.budget ? `₪${lead.budget.toLocaleString()}` : "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <ScoreBar score={lead.score} />
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${cat.bg} ${cat.color}`}>
                          {cat.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs ${lead.potential === "גבוה" ? "text-emerald-400" : lead.potential === "בינוני" ? "text-amber-400" : "text-muted-foreground"}`}>
                          {lead.potential}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground text-xs">{lead.lastContact || "—"}</td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400" /> משקלות מודל הניקוד
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "מקור הליד", weight: "30%", icon: Globe, desc: "הפניה/אתר מול קר" },
            { label: "תקציב מוצהר", weight: "25%", icon: DollarSign, desc: "מעל ₪50K = ניקוד גבוה" },
            { label: "פעילות ועניין", weight: "25%", icon: Activity, desc: "פגישות, שיחות, דוא\"ל" },
            { label: "רשת חברתית", weight: "20%", icon: MessageSquare, desc: "לינקדאין, פייסבוק" },
          ].map((p, i) => (
            <div key={i} className="bg-muted/10 rounded-lg p-3 border border-border">
              <div className="flex items-center justify-between mb-1">
                <p.icon className="w-4 h-4 text-muted-foreground" />
                <span className="text-base font-bold text-foreground">{p.weight}</span>
              </div>
              <p className="text-xs font-medium text-foreground">{p.label}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{p.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="lead-scoring" />
        <RelatedRecords entityType="lead-scoring" />
      </div>
    </div>
  );
}
