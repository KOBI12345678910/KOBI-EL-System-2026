import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Star, Brain, TrendingUp, ChevronRight, Target, ArrowRight, Zap } from "lucide-react";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";

const API = "/api";
const token = () => localStorage.getItem("erp_token") || document.cookie.match(/token=([^;]+)/)?.[1] || "";
const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token()}` });

const STATUS_COLOR: Record<string, string> = {
  hot: "text-red-400 bg-red-500/20 border-red-500/30",
  warm: "text-amber-400 bg-amber-500/20 border-amber-500/30",
  cold: "text-blue-400 bg-blue-500/20 border-blue-500/30",
};

const STATUS_LABEL: Record<string, string> = { hot: "🔥 חם", warm: "🌤️ פושר", cold: "❄️ קר" };

function ScoreBar({ score }: { score: number }) {
  const color = score >= 80 ? "bg-red-500" : score >= 60 ? "bg-amber-500" : "bg-blue-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-sm font-bold w-8 text-right">{score}</span>
    </div>
  );
}

export default function LeadScoringPage() {
  const [leads, setLeads] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any | null>(null);

  useEffect(() => {
    setLoading(true);
    authFetch(`${API}/crm/leads/scored`, { headers: headers() })
      .then(r => r.json())
      .then(d => {
        setLeads(d.leads || []);
        setStats({ hotCount: d.hotCount || 0, avgScore: d.avgScore || 0, totalLeads: (d.leads || []).length });
      })
      .catch(() => { setLeads([]); setStats({}); })
      .finally(() => setLoading(false));
  }, []);

  const totalValue = leads.reduce((s: number, l: any) => s + (l.value || 0), 0);
  const hotCount = stats.hotCount ?? 0;
  const avgScore = stats.avgScore ?? 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-foreground" dir="rtl">
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/crm"><span className="hover:text-amber-400 cursor-pointer">CRM Advanced Pro</span></Link>
          <ChevronRight className="w-4 h-4 rotate-180" />
          <Link href="/crm"><span className="hover:text-amber-400 cursor-pointer">AI Intelligence</span></Link>
          <ChevronRight className="w-4 h-4 rotate-180" />
          <span className="text-foreground">Lead Scoring AI</span>
        </div>

        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/30">
            <Star className="w-7 h-7 text-foreground" />
          </div>
          <div>
            <h1 className="text-lg sm:text-2xl font-bold">Lead Scoring AI</h1>
            <p className="text-muted-foreground text-sm">ציון לידים אוטומטי עם Machine Learning — מזהה הזדמנויות לפני שהם קרות</p>
          </div>
          <div className="mr-auto flex items-center gap-2 px-3 py-1.5 bg-purple-500/20 rounded-lg border border-purple-500/30">
            <Brain className="w-4 h-4 text-purple-400" />
            <span className="text-xs text-purple-300 font-medium">AI פעיל</span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "לידים חמים", value: String(hotCount), icon: Star, color: "text-red-400 bg-red-500/10 border-red-500/20" },
            { label: "ציון ממוצע", value: String(avgScore), icon: Target, color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
            { label: "ערך צנרת", value: totalValue > 0 ? `₪${(totalValue / 1000).toFixed(0)}K` : "—", icon: TrendingUp, color: "text-green-400 bg-green-500/10 border-green-500/20" },
            { label: "ליד ממוצע", value: `${avgScore || "—"}`, icon: Brain, color: "text-purple-400 bg-purple-500/10 border-purple-500/20" },
          ].map((kpi, i) => (
            <div key={i} className={`rounded-xl border p-4 ${kpi.color}`}>
              <kpi.icon className="w-5 h-5 mb-2" />
              <div className="text-lg sm:text-2xl font-bold text-foreground">{kpi.value}</div>
              <div className="text-xs text-muted-foreground">{kpi.label}</div>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="text-muted-foreground text-sm text-center py-10">טוען לידים...</div>
        ) : leads.length === 0 ? (
          <div className="rounded-2xl border border-slate-700/50 bg-slate-800/40 p-12 text-center">
            <Star className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-muted-foreground text-sm">אין לידים להצגה</p>
            <p className="text-muted-foreground text-xs mt-1">הוסף לידים דרך מודול ניהול הלידים</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 rounded-2xl border border-slate-700/50 bg-slate-800/40 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-700/50 flex items-center justify-between">
                <h2 className="font-bold">רשימת לידים — מדורגים לפי ציון AI</h2>
                <span className="text-xs text-muted-foreground">{leads.length} לידים</span>
              </div>
              <div className="divide-y divide-slate-700/30">
                {leads.map((lead, i) => (
                  <div
                    key={i}
                    className="px-6 py-4 hover:bg-slate-700/30 cursor-pointer transition-colors"
                    onClick={() => setSelected(lead === selected ? null : lead)}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center text-foreground font-bold text-sm flex-shrink-0">
                        {(lead.name || "?")[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm">{lead.name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLOR[lead.category] || STATUS_COLOR.cold}`}>{STATUS_LABEL[lead.category] || "—"}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">{lead.company || "—"}</div>
                        <div className="mt-2">
                          <ScoreBar score={lead.score} />
                        </div>
                      </div>
                      <div className="text-left flex-shrink-0">
                        <div className="text-sm font-bold text-green-400">{lead.value > 0 ? `₪${(lead.value / 1000).toFixed(0)}K` : "—"}</div>
                        <div className="text-xs text-muted-foreground">ערך מוערך</div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground rotate-180 flex-shrink-0" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              {selected ? (
                <div className="rounded-2xl border border-purple-500/30 bg-gradient-to-br from-purple-500/10 to-indigo-500/5 p-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-foreground font-bold">
                      {(selected.name || "?")[0]}
                    </div>
                    <div>
                      <h3 className="font-bold">{selected.name}</h3>
                      <p className="text-xs text-muted-foreground">{selected.company || "—"}</p>
                    </div>
                  </div>
                  <div className="rounded-xl bg-slate-900/60 p-4 text-center">
                    <div className="text-4xl font-bold text-amber-400">{selected.score}</div>
                    <div className="text-xs text-muted-foreground">ציון AI</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wider">פרטי ליד</div>
                    <div className="space-y-2 text-sm">
                      {selected.source && <div className="flex items-center gap-2"><Zap className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" /><span>מקור: {selected.source}</span></div>}
                      {selected.status && <div className="flex items-center gap-2"><Zap className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" /><span>סטטוס: {selected.status}</span></div>}
                      {selected.potential && <div className="flex items-center gap-2"><Zap className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" /><span>פוטנציאל: {selected.potential}</span></div>}
                    </div>
                  </div>
                  <div className="rounded-xl bg-green-500/10 border border-green-500/20 p-3">
                    <div className="text-xs text-green-400 font-medium mb-1">המלצת AI</div>
                    <div className="text-sm">
                      {selected.score >= 80 ? "צור קשר מיידי — ליד חם ביותר!" : selected.score >= 60 ? "שלח הצעה מותאמת תוך 48 שעות" : "הוסף לרשימת טיפוח אוטומטי"}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-700/50 bg-slate-800/40 p-8 text-center text-muted-foreground">
                  <Star className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">לחץ על ליד לצפייה בניתוח AI</p>
                </div>
              )}

              <div className="rounded-2xl border border-slate-700/50 bg-slate-800/40 p-5">
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">פקטורים במודל</div>
                <div className="space-y-2">
                  {[
                    { label: "מקור הליד", weight: 30 },
                    { label: "תקציב מוצהר", weight: 25 },
                    { label: "פעילות ועניין", weight: 25 },
                    { label: "רשת חברתית", weight: 20 },
                  ].map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="w-24 text-muted-foreground">{f.label}</span>
                      <div className="flex-1 h-1.5 bg-slate-700 rounded-full">
                        <div className="h-full bg-purple-500 rounded-full" style={{ width: `${f.weight * 3}%` }} />
                      </div>
                      <span className="text-muted-foreground w-8 text-left">{f.weight}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="lead-scoring" entityId="all" />
        <RelatedRecords entityType="lead-scoring" entityId="all" />
      </div>
    </div>
  );
}