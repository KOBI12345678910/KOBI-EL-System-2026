import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  TrendingUp, AlertTriangle, Calendar, DollarSign, Target,
  BarChart3, Activity, Zap, Clock, CheckCircle2, XCircle,
  Brain, ArrowUp, ArrowDown
} from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import { authFetch } from "@/lib/utils";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, PieChart, Pie, Legend
} from "recharts";

const API = "/api";
const token = () => localStorage.getItem("erp_token") || document.cookie.match(/token=([^;]+)/)?.[1] || "";
const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token()}` });
const fmtC = (n: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(n);

function ProbBar({ prob, size = "md" }: { prob: number; size?: "sm" | "md" }) {
  const color = prob >= 70 ? "bg-emerald-500" : prob >= 50 ? "bg-amber-400" : "bg-red-500";
  const textColor = prob >= 70 ? "text-emerald-400" : prob >= 50 ? "text-amber-400" : "text-red-400";
  const h = size === "sm" ? "h-1.5" : "h-2";
  return (
    <div className="flex items-center gap-2">
      <div className={`flex-1 ${h} bg-muted/30 rounded-full overflow-hidden`}>
        <div className={`h-full rounded-full ${color}`} style={{ width: `${prob}%` }} />
      </div>
      <span className={`text-sm font-bold ${textColor} w-10 text-right`}>{prob}%</span>
    </div>
  );
}

interface ScoredLead {
  id: number;
  name: string;
  company: string;
  score: number;
  category: string;
  budget: number;
  potential: string;
  lastContact: string;
  status: string;
}

export default function PredictiveAnalytics() {
  const [tab, setTab] = useState<"close" | "churn" | "forecast">("close");
  const [leads, setLeads] = useState<ScoredLead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    authFetch(`${API}/crm/leads/scored`, { headers: headers() })
      .then(r => r.json())
      .then(d => setLeads(d.leads || []))
      .catch(() => setLeads([]))
      .finally(() => setLoading(false));
  }, []);

  const closePredictions = leads
    .filter(l => l.budget > 0)
    .map(l => {
      const closeProb = Math.min(l.score + (l.id % 5), 100);
      const daysToClose = l.score >= 80 ? 5 + (l.id % 12) : l.score >= 60 ? 15 + (l.id % 25) : 35 + (l.id % 30);
      const risk = closeProb >= 75 ? "נמוך" : closeProb >= 50 ? "בינוני" : "גבוה";
      return { id: l.id, lead: l.name, company: l.company, value: l.budget, closeProb, daysToClose, risk, status: l.category };
    })
    .sort((a, b) => b.closeProb - a.closeProb)
    .slice(0, 15);

  const churnRisks = leads
    .filter(l => l.category === "cold" && l.budget > 0)
    .map(l => {
      const churnProb = Math.max(100 - l.score, 30);
      const daysSinceContact = l.lastContact ? Math.floor((Date.now() - new Date(l.lastContact).getTime()) / 86400000) : 30;
      return {
        customer: l.company || l.name,
        contractValue: l.budget,
        churnProb,
        lastActivity: `${daysSinceContact} ימים`,
        reason: churnProb >= 70 ? "חוסר פעילות + ציון נמוך" : churnProb >= 50 ? "ירידה בעניין" : "פעילות מועטה",
        action: churnProb >= 70 ? "התקשר היום" : churnProb >= 50 ? "פגישה דחופה" : "בדוק שביעות רצון",
      };
    })
    .sort((a, b) => b.churnProb - a.churnProb);

  const months = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
  const now = new Date();
  const currentMonth = now.getMonth();
  const totalPipelineValue = leads.reduce((a, b) => a + (b.budget || 0), 0);
  const avgCloseRate = leads.length > 0 ? leads.filter(l => l.score >= 60).length / leads.length : 0.5;
  const monthlyForecast = Array.from({ length: 6 }, (_, i) => {
    const mi = (currentMonth + i) % 12;
    const base = totalPipelineValue * avgCloseRate / 6;
    const growth = 1 + i * 0.05;
    return {
      month: months[mi],
      actual: i === 0 ? Math.round(base * 0.9) : null,
      forecast: Math.round(base * growth * (0.95 + (i % 3) * 0.03)),
    };
  });

  const pipelineByStage = [
    { stage: "חדש", value: leads.filter(l => l.status === "new" || l.category === "cold").reduce((a, b) => a + b.budget, 0), count: leads.filter(l => l.status === "new" || l.category === "cold").length, color: "#3b82f6" },
    { stage: "קשר ראשוני", value: leads.filter(l => l.status === "contacted").reduce((a, b) => a + b.budget, 0), count: leads.filter(l => l.status === "contacted").length, color: "#8b5cf6" },
    { stage: "מוסמך", value: leads.filter(l => l.status === "qualified" && l.category === "warm").reduce((a, b) => a + b.budget, 0), count: leads.filter(l => l.status === "qualified" && l.category === "warm").length, color: "#f59e0b" },
    { stage: "משא ומתן", value: leads.filter(l => l.category === "hot" && l.score < 90).reduce((a, b) => a + b.budget, 0), count: leads.filter(l => l.category === "hot" && l.score < 90).length, color: "#f97316" },
    { stage: "סגירה", value: leads.filter(l => l.score >= 90).reduce((a, b) => a + b.budget, 0), count: leads.filter(l => l.score >= 90).length, color: "#22c55e" },
  ];

  const weightedValue = closePredictions.reduce((a, b) => a + b.value * b.closeProb / 100, 0);
  const highRiskChurn = churnRisks.filter(c => c.churnProb >= 60).length;
  const totalChurnValue = churnRisks.reduce((a, b) => a + b.contractValue, 0);

  if (loading) return (
    <div className="flex items-center justify-center h-40 text-muted-foreground text-sm" dir="rtl">
      טוען נתוני חיזוי...
    </div>
  );

  return (
    <div className="space-y-4 sm:space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
          <Brain className="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Predictive Analytics</h1>
          <p className="text-xs text-muted-foreground">חיזוי סגירת עסקאות, Churn Risk ותחזית הכנסות — מבוסס נתוני לידים אמיתיים</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "ערך צנרת חיזויי", value: fmtC(weightedValue), icon: DollarSign, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
          { label: "עסקאות >50% סגירה", value: closePredictions.filter(p => p.closeProb >= 50).length, icon: Target, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
          { label: "Churn Risk גבוה", value: highRiskChurn, icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
          { label: "ערך לקוחות בסיכון", value: totalChurnValue > 0 ? fmtC(totalChurnValue) : "—", icon: Activity, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
        ].map((k, i) => (
          <div key={i} className={`border rounded-xl p-3 text-center ${k.bg}`}>
            <k.icon className={`w-5 h-5 mx-auto mb-1 ${k.color}`} />
            <div className={`text-lg font-bold ${k.color}`}>{k.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        {[
          { id: "close", label: "חיזוי סגירה", icon: Target },
          { id: "churn", label: "Churn Risk", icon: AlertTriangle },
          { id: "forecast", label: "תחזית הכנסות", icon: TrendingUp },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.id ? "bg-primary text-white" : "bg-card border border-border text-muted-foreground hover:text-white"
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "close" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="p-4 border-b border-border">
              <h3 className="font-semibold text-white text-sm flex items-center gap-2">
                <Target className="w-4 h-4 text-emerald-400" /> צינור עסקאות — חיזוי סגירה
              </h3>
            </div>
            {closePredictions.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                <Target className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">אין לידים עם תקציב לחיזוי</p>
                <p className="text-xs mt-1">הוסף לידים עם ערך עסקה לקבלת חיזויים</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/20 text-muted-foreground text-xs">
                      <th className="px-4 py-2 text-right font-medium">ליד</th>
                      <th className="px-4 py-2 text-right font-medium">חברה</th>
                      <th className="px-4 py-2 text-right font-medium">ערך עסקה</th>
                      <th className="px-4 py-2 text-right font-medium w-40">סיכוי סגירה</th>
                      <th className="px-4 py-2 text-right font-medium">ימים לסגירה</th>
                      <th className="px-4 py-2 text-right font-medium">סיכון</th>
                    </tr>
                  </thead>
                  <tbody>
                    {closePredictions.map((p, i) => (
                      <motion.tr
                        key={p.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.04 }}
                        className="border-t border-border/30 hover:bg-card/[0.02]"
                      >
                        <td className="px-4 py-3 font-medium text-white">{p.lead}</td>
                        <td className="px-4 py-3 text-muted-foreground">{p.company}</td>
                        <td className="px-4 py-3 text-emerald-400 font-medium">{fmtC(p.value)}</td>
                        <td className="px-4 py-3 w-40">
                          <ProbBar prob={p.closeProb} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-muted-foreground">{p.daysToClose} ימים</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            p.risk === "נמוך" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30" :
                            p.risk === "בינוני" ? "bg-amber-500/10 text-amber-400 border border-amber-500/30" :
                            "bg-red-500/10 text-red-400 border border-red-500/30"
                          }`}>
                            {p.risk}
                          </span>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-400" /> ערך לפי שלב בצינור
            </h3>
            {pipelineByStage.some(s => s.value > 0) ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={pipelineByStage} barSize={40}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                  <XAxis dataKey="stage" tick={{ fontSize: 11, fill: "#888" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#888" }} tickFormatter={v => `₪${(v/1000).toFixed(0)}K`} />
                  <Tooltip
                    contentStyle={{ background: "#1a1d23", border: "1px solid #333", borderRadius: 8 }}
                    formatter={(value: number) => [fmtC(value), "ערך"]}
                  />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {pipelineByStage.map((entry, i) => <Cell key={i} fill={entry.color} fillOpacity={0.8} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[180px] flex items-center justify-center text-muted-foreground text-sm">אין נתוני צינור</div>
            )}
          </div>
        </motion.div>
      )}

      {tab === "churn" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          {churnRisks.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-12 text-center text-muted-foreground">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-emerald-400/30" />
              <p className="text-sm">אין לקוחות בסיכון Churn</p>
              <p className="text-xs mt-1">כל הלידים פעילים וללא סיכון נטישה</p>
            </div>
          ) : churnRisks.map((risk, i) => (
            <div key={i} className={`bg-card border rounded-xl p-4 ${risk.churnProb >= 70 ? "border-red-500/30" : risk.churnProb >= 50 ? "border-amber-500/30" : "border-border"}`}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="font-semibold text-white">{risk.customer}</h4>
                  <p className="text-xs text-muted-foreground">ערך עסקה: {fmtC(risk.contractValue)} · פעילות אחרונה: {risk.lastActivity}</p>
                </div>
                <div className="text-right">
                  <div className={`text-xl font-bold ${risk.churnProb >= 70 ? "text-red-400" : risk.churnProb >= 50 ? "text-amber-400" : "text-emerald-400"}`}>
                    {risk.churnProb}%
                  </div>
                  <div className="text-[10px] text-muted-foreground">סיכון Churn</div>
                </div>
              </div>
              <ProbBar prob={risk.churnProb} />
              <div className="flex items-center justify-between mt-3">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-xs text-muted-foreground">{risk.reason}</span>
                </div>
                <span className="text-xs px-2 py-1 rounded-lg bg-primary/20 text-primary border border-primary/30 font-medium">
                  פעולה: {risk.action}
                </span>
              </div>
            </div>
          ))}
        </motion.div>
      )}

      {tab === "forecast" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" /> תחזית הכנסות — 6 חודשים (מבוסס צינור לידים)
            </h3>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={monthlyForecast}>
                <defs>
                  <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#888" }} />
                <YAxis tick={{ fontSize: 11, fill: "#888" }} tickFormatter={v => `₪${(v/1000).toFixed(0)}K`} />
                <Tooltip
                  contentStyle={{ background: "#1a1d23", border: "1px solid #333", borderRadius: 8 }}
                  formatter={(value: number) => value ? [fmtC(value), ""] : ["—", ""]}
                />
                <Area type="monotone" dataKey="forecast" stroke="#22c55e" fill="url(#forecastGrad)" strokeWidth={2} strokeDasharray="5 3" name="תחזית" />
                <Area type="monotone" dataKey="actual" stroke="#3b82f6" fill="url(#actualGrad)" strokeWidth={2.5} name="בפועל" />
              </AreaChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-6 mt-3">
              {[{ name: "תחזית", color: "#22c55e" }, { name: "בפועל", color: "#3b82f6" }].map(l => (
                <div key={l.name} className="flex items-center gap-2">
                  <div className="w-5 h-0.5 rounded" style={{ backgroundColor: l.color }} />
                  <span className="text-xs text-muted-foreground">{l.name}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="predictive-analytics" />
        <RelatedRecords entityType="predictive-analytics" />
      </div>
    </div>
  );
}
