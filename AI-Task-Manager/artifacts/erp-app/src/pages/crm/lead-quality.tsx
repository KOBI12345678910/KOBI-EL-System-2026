import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Shield, ChevronRight, Target, BarChart2, TrendingUp, AlertTriangle, CheckCircle, Info } from "lucide-react";
import { authFetch } from "@/lib/utils";
import RelatedRecords from "@/components/related-records";
import ActivityLog from "@/components/activity-log";
import AttachmentsSection from "@/components/attachments-section";

const API = "/api";
const token = () => localStorage.getItem("erp_token") || document.cookie.match(/token=([^;]+)/)?.[1] || "";
const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token()}` });

const QUALITY_DIMS = [
  { id: "completeness", label: "שלמות נתונים", desc: "% שדות שמולאו" },
  { id: "recency", label: "עדכניות", desc: "מתי עודכן לאחרונה" },
  { id: "engagement", label: "מעורבות", desc: "רמת עניין הליד" },
  { id: "fit", label: "כשירות", desc: "האם מתאים לפרופיל ICP" },
];

function computeQuality(lead: any): Record<string, number> {
  const completeness = [lead.name, lead.phone, lead.email, lead.company, lead.source, lead.budget].filter(Boolean).length;
  const completenessScore = Math.round((completeness / 6) * 100);
  const engagementScore = Math.min(100, Math.max(0, lead.score || 0));
  const fitScore = lead.category === "hot" ? 90 : lead.category === "warm" ? 65 : 35;
  const recencyScore = lead.lastContact ? 80 : 40;
  const overall = Math.round((completenessScore + engagementScore + fitScore + recencyScore) / 4);
  return { completeness: completenessScore, engagement: engagementScore, fit: fitScore, recency: recencyScore, overall };
}

function QualityBadge({ score }: { score: number }) {
  if (score >= 80) return <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/20 font-medium">גבוהה</span>;
  if (score >= 60) return <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/20 font-medium">בינונית</span>;
  return <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/20 font-medium">נמוכה</span>;
}

function QualityBar({ value, label }: { value: number; label: string }) {
  const color = value >= 80 ? "bg-green-500" : value >= 60 ? "bg-amber-500" : "bg-red-500";
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-bold text-foreground">{value}%</span>
      </div>
      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export default function LeadQualityPage() {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any | null>(null);
  const [filterQuality, setFilterQuality] = useState<"all" | "high" | "medium" | "low">("all");
  const [detailTab, setDetailTab] = useState("details");

  useEffect(() => {
    authFetch(`${API}/crm/leads/scored`, { headers: headers() })
      .then(r => r.json())
      .then(d => {
        const leadsWithQuality = (d.leads || []).map((lead: any) => ({
          ...lead,
          quality: computeQuality(lead),
        }));
        setLeads(leadsWithQuality);
      })
      .catch(() => setLeads([]))
      .finally(() => setLoading(false));
  }, []);

  const avgQuality = leads.length > 0 ? Math.round(leads.reduce((s, l) => s + l.quality.overall, 0) / leads.length) : 0;
  const highQuality = leads.filter(l => l.quality.overall >= 80).length;
  const medQuality = leads.filter(l => l.quality.overall >= 60 && l.quality.overall < 80).length;
  const lowQuality = leads.filter(l => l.quality.overall < 60).length;

  const filteredLeads = leads.filter(l => {
    if (filterQuality === "high") return l.quality.overall >= 80;
    if (filterQuality === "medium") return l.quality.overall >= 60 && l.quality.overall < 80;
    if (filterQuality === "low") return l.quality.overall < 60;
    return true;
  });

  const missingFields = leads.flatMap(l =>
    [
      !l.phone && { lead: l.name, field: "טלפון" },
      !l.email && { lead: l.name, field: "אימייל" },
      !l.company && { lead: l.name, field: "חברה" },
      !l.budget && { lead: l.name, field: "תקציב" },
    ].filter(Boolean)
  ).slice(0, 5) as Array<{ lead: string; field: string }>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-foreground" dir="rtl">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/crm"><span className="hover:text-amber-400 cursor-pointer">CRM Advanced Pro</span></Link>
          <ChevronRight className="w-4 h-4 rotate-180" />
          <span className="text-foreground">Lead Quality</span>
        </div>

        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-green-500/30">
            <Shield className="w-7 h-7 text-foreground" />
          </div>
          <div>
            <h1 className="text-lg sm:text-2xl font-bold">Lead Quality</h1>
            <p className="text-muted-foreground text-sm">ציון איכות לידים — שלמות נתונים, עדכניות, מעורבות וכשירות</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "ציון ממוצע", value: avgQuality ? `${avgQuality}%` : "—", icon: Target, color: "text-green-400 bg-green-500/10 border-green-500/20" },
            { label: "איכות גבוהה (>80%)", value: String(highQuality), icon: CheckCircle, color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
            { label: "איכות בינונית", value: String(medQuality), icon: BarChart2, color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
            { label: "איכות נמוכה (<60%)", value: String(lowQuality), icon: AlertTriangle, color: "text-red-400 bg-red-500/10 border-red-500/20" },
          ].map((kpi, i) => (
            <div key={i} className={`rounded-xl border p-4 ${kpi.color}`}>
              <kpi.icon className="w-5 h-5 mb-2" />
              <div className="text-lg sm:text-2xl font-bold text-foreground">{kpi.value}</div>
              <div className="text-xs text-muted-foreground">{kpi.label}</div>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="text-muted-foreground text-sm text-center py-10">טוען נתונים...</div>
        ) : leads.length === 0 ? (
          <div className="rounded-2xl border border-slate-700/50 bg-slate-800/40 p-12 text-center text-muted-foreground">
            <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">אין לידים להצגה</p>
            <p className="text-xs mt-1">הוסף לידים דרך מודול ניהול הלידים</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center gap-2">
                {(["all", "high", "medium", "low"] as const).map(q => (
                  <button
                    key={q}
                    onClick={() => setFilterQuality(q)}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${filterQuality === q ? "bg-primary border-primary text-foreground" : "border-slate-700 text-muted-foreground hover:text-foreground"}`}
                  >
                    {q === "all" ? "הכל" : q === "high" ? "גבוהה" : q === "medium" ? "בינונית" : "נמוכה"}
                  </button>
                ))}
              </div>

              <div className="rounded-2xl border border-slate-700/50 bg-slate-800/40 overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-700/50 flex items-center justify-between">
                  <h2 className="font-bold text-sm">איכות לידים ({filteredLeads.length})</h2>
                </div>
                <div className="divide-y divide-slate-700/30 max-h-[400px] overflow-y-auto">
                  {filteredLeads.map((lead, i) => (
                    <div
                      key={i}
                      onClick={() => setSelected(lead === selected ? null : lead)}
                      className="px-5 py-3.5 hover:bg-slate-700/30 cursor-pointer transition-colors flex items-center gap-4"
                    >
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center text-foreground font-bold text-sm flex-shrink-0">
                        {(lead.name || "?")[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{lead.name}</span>
                          <QualityBadge score={lead.quality.overall} />
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">{lead.company || "—"} • {lead.source || "—"}</div>
                        <div className="h-1.5 bg-slate-700 rounded-full mt-1.5 overflow-hidden">
                          <div className={`h-full rounded-full ${lead.quality.overall >= 80 ? "bg-green-500" : lead.quality.overall >= 60 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${lead.quality.overall}%` }} />
                        </div>
                      </div>
                      <div className="text-xl font-bold text-foreground flex-shrink-0">{lead.quality.overall}%</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {selected ? (
                <div className="rounded-2xl border border-green-500/20 bg-gradient-to-br from-green-500/5 to-slate-800/40 overflow-hidden">
                  <div className="p-5 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-foreground font-bold">
                      {(selected.name || "?")[0]}
                    </div>
                    <div>
                      <h3 className="font-bold text-sm">{selected.name}</h3>
                      <p className="text-xs text-muted-foreground">{selected.company || "—"}</p>
                    </div>
                  </div>
                  <div className="flex border-b border-slate-700/50">
                    {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                      <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-3 py-2 text-xs font-medium border-b-2 ${detailTab === t.key ? "border-green-400 text-green-400" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                    ))}
                  </div>
                  {detailTab === "details" && (
                    <div className="p-5 space-y-4">
                      <div className="rounded-xl bg-slate-900/60 p-3 text-center">
                        <div className={`text-xl sm:text-3xl font-bold ${selected.quality.overall >= 80 ? "text-green-400" : selected.quality.overall >= 60 ? "text-amber-400" : "text-red-400"}`}>{selected.quality.overall}%</div>
                        <div className="text-xs text-muted-foreground">איכות כוללת</div>
                      </div>
                      <div className="space-y-2">
                        {QUALITY_DIMS.map(dim => (
                          <QualityBar key={dim.id} value={selected.quality[dim.id] || 0} label={dim.label} />
                        ))}
                      </div>
                      {missingFields.filter(f => f.lead === selected.name).length > 0 && (
                        <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3">
                          <div className="text-xs text-amber-400 font-medium mb-1 flex items-center gap-1"><Info className="w-3 h-3" /> שדות חסרים</div>
                          {missingFields.filter(f => f.lead === selected.name).map((f, i) => (
                            <div key={i} className="text-xs text-muted-foreground">• {f.field}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {detailTab === "related" && (
                    <div className="p-5"><RelatedRecords tabs={[{key:"leads",label:"לידים קשורים",endpoint:`${API}/crm/leads/scored/${selected.id}/related`,columns:[{key:"name",label:"שם"},{key:"score",label:"ציון"},{key:"source",label:"מקור"}]},{key:"scoring-rules",label:"כללי ניקוד",endpoint:`${API}/crm/leads/scored/${selected.id}/scoring-rules`,columns:[{key:"rule_name",label:"כלל"},{key:"weight",label:"משקל"},{key:"score",label:"ציון"}]}]} /></div>
                  )}
                  {detailTab === "docs" && (
                    <div className="p-5"><AttachmentsSection entityType="lead-quality" entityId={selected.id} /></div>
                  )}
                  {detailTab === "history" && (
                    <div className="p-5"><ActivityLog entityType="lead-quality" entityId={selected.id} /></div>
                  )}
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-700/50 bg-slate-800/40 p-8 text-center text-muted-foreground">
                  <Shield className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">לחץ על ליד לניתוח מפורט</p>
                </div>
              )}

              {missingFields.length > 0 && (
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
                  <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400" /> שדות חסרים לשיפור איכות
                  </h3>
                  <div className="space-y-1.5">
                    {missingFields.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="text-amber-400">•</span>
                        <span className="text-slate-300">{f.lead}</span>
                        <span className="text-muted-foreground">—</span>
                        <span className="text-muted-foreground">{f.field}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-2xl border border-slate-700/50 bg-slate-800/40 p-4">
                <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-green-400" /> מדדי איכות ממוצעים
                </h3>
                <div className="space-y-2">
                  {QUALITY_DIMS.map(dim => {
                    const avg = leads.length > 0 ? Math.round(leads.reduce((s, l) => s + (l.quality[dim.id] || 0), 0) / leads.length) : 0;
                    return <QualityBar key={dim.id} value={avg} label={dim.label} />;
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
