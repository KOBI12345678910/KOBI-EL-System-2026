import { useState, useEffect, useCallback } from "react";
import {
  Ruler, CheckCircle, XCircle, AlertTriangle, Eye, Loader2, RefreshCw,
  ArrowLeftRight, Camera, FileText, BarChart3, Search, ThumbsUp, ThumbsDown,
  AlertCircle, Activity
} from "lucide-react";

const API = "/api";
const getHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("erp_token") || ""}` });
const fmt = (n: number) => new Intl.NumberFormat("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const fmtP = (n: number) => `${Number(n).toFixed(1)}%`;

type MeasurementRecord = {
  id: number; project_id: number; measured_by_type: string; measured_by_id: number;
  measured_by_name: string; measurements: any[]; total_meters: number;
  photos: string[]; submitted_at: string; status: string;
};
type Comparison = {
  id: number; project_id: number; agent_measurement_id: number; engineer_measurement_id: number;
  total_discrepancy_m: number; discrepancy_pct: number; items_matched: number;
  items_mismatched: number; status: string; reviewed_by: string; review_notes: string; created_at: string;
};
type Discrepancy = {
  id: number; comparison_id: number; item_name: string; agent_value: number;
  engineer_value: number; difference: number; difference_pct: number; severity: string;
};
type Dashboard = {
  stats: Record<string, any>; criticalCount: number; recentComparisons: Comparison[];
};

const STATUS_MAP: Record<string, { label: string; color: string; icon: any }> = {
  approved: { label: "מאושר", color: "bg-green-500/20 text-green-400 border-green-500/30", icon: CheckCircle },
  rejected: { label: "נדחה", color: "bg-red-500/20 text-red-400 border-red-500/30", icon: XCircle },
  needs_review: { label: "דורש בדיקה", color: "bg-amber-500/20 text-amber-400 border-amber-500/30", icon: AlertTriangle },
  pending: { label: "ממתין", color: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: Loader2 },
};

const SEV_MAP: Record<string, { label: string; color: string; bg: string }> = {
  ok: { label: "תקין", color: "text-green-400", bg: "bg-green-500/20" },
  warning: { label: "אזהרה", color: "text-amber-400", bg: "bg-amber-500/20" },
  critical: { label: "קריטי", color: "text-red-400", bg: "bg-red-500/20" },
};

export default function MeasurementComparisonPage() {
  const [tab, setTab] = useState<"dashboard" | "detail" | "discrepancies">("dashboard");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedComparison, setSelectedComparison] = useState<number | null>(null);
  const [comparisonDetail, setComparisonDetail] = useState<any>(null);
  const [criticalDiscs, setCriticalDiscs] = useState<Discrepancy[]>([]);
  const [reviewNotes, setReviewNotes] = useState("");

  const fetchDashboard = useCallback(async () => {
    try {
      const r = await fetch(`${API}/measurements/dashboard`, { headers: getHeaders() });
      setDashboard(await r.json());
    } catch {}
  }, []);

  const fetchCritical = useCallback(async () => {
    try {
      const r = await fetch(`${API}/measurements/discrepancies?severity=critical`, { headers: getHeaders() });
      const d = await r.json();
      setCriticalDiscs(d.data || []);
    } catch {}
  }, []);

  const fetchComparisonDetail = useCallback(async (id: number) => {
    try {
      const r = await fetch(`${API}/measurements/comparison/${id}`, { headers: getHeaders() });
      setComparisonDetail(await r.json());
    } catch {}
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([fetchDashboard(), fetchCritical()]);
      setLoading(false);
    })();
  }, [fetchDashboard, fetchCritical]);

  const viewComparison = (id: number) => {
    setSelectedComparison(id);
    fetchComparisonDetail(id);
    setTab("detail");
  };

  const handleApprove = async (id: number) => {
    await fetch(`${API}/measurements/comparison/${id}/approve`, {
      method: "POST", headers: getHeaders(),
      body: JSON.stringify({ reviewed_by: "מנהל", notes: reviewNotes }),
    });
    fetchDashboard();
    fetchComparisonDetail(id);
    setReviewNotes("");
  };

  const handleReject = async (id: number) => {
    await fetch(`${API}/measurements/comparison/${id}/reject`, {
      method: "POST", headers: getHeaders(),
      body: JSON.stringify({ reviewed_by: "מנהל", notes: reviewNotes }),
    });
    fetchDashboard();
    fetchComparisonDetail(id);
    setReviewNotes("");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
        <span className="text-white/60 mr-3">טוען נתוני מדידות...</span>
      </div>
    );
  }

  const stats = dashboard?.stats;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Ruler className="w-7 h-7 text-cyan-400" />
            השוואת מדידות
          </h1>
          <p className="text-white/50 text-sm mt-1">השוואה אוטומטית בין מדידות סוכן למהנדס - בקרת איכות</p>
        </div>
        <button onClick={() => { fetchDashboard(); fetchCritical(); }}
          className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 flex items-center gap-2 text-sm">
          <RefreshCw className="w-4 h-4" /> רענון
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {([
          { key: "dashboard", label: "דשבורד", icon: BarChart3 },
          { key: "detail", label: "פרטי השוואה", icon: ArrowLeftRight },
          { key: "discrepancies", label: `סטיות קריטיות (${criticalDiscs.length})`, icon: AlertCircle },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition-all ${
              tab === t.key ? "bg-cyan-600 text-white" : "bg-white/5 text-white/60 hover:bg-white/10"}`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* ─── DASHBOARD ─── */}
      {tab === "dashboard" && stats && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {[
              { label: "סה\"כ השוואות", value: stats.total_comparisons || 0, icon: ArrowLeftRight, color: "text-cyan-400" },
              { label: "מאושרים", value: stats.approved || 0, icon: CheckCircle, color: "text-green-400" },
              { label: "נדחו", value: stats.rejected || 0, icon: XCircle, color: "text-red-400" },
              { label: "דורשים בדיקה", value: stats.needs_review || 0, icon: AlertTriangle, color: "text-amber-400" },
              { label: "ממתינים", value: stats.pending || 0, icon: Loader2, color: "text-blue-400" },
              { label: "סטיות קריטיות", value: dashboard?.criticalCount || 0, icon: AlertCircle, color: "text-red-400" },
            ].map((c, i) => (
              <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <c.icon className={`w-4 h-4 ${c.color}`} />
                  <span className="text-white/50 text-xs">{c.label}</span>
                </div>
                <div className="text-2xl font-bold">{c.value}</div>
              </div>
            ))}
          </div>

          {/* Average Discrepancy Gauge */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-5">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Activity className="w-5 h-5 text-cyan-400" /> סטייה ממוצעת
            </h3>
            <div className="flex items-center gap-6">
              <div className="relative w-32 h-32">
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                  <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="10" />
                  <circle cx="50" cy="50" r="40" fill="none"
                    stroke={Number(stats.avg_discrepancy) > 5 ? "#ef4444" : Number(stats.avg_discrepancy) > 2 ? "#f59e0b" : "#22c55e"}
                    strokeWidth="10" strokeDasharray={`${Math.min(Number(stats.avg_discrepancy) || 0, 10) * 25.13} 251.3`}
                    strokeLinecap="round" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center flex-col">
                  <span className="text-2xl font-bold">{fmtP(Number(stats.avg_discrepancy) || 0)}</span>
                  <span className="text-[10px] text-white/40">ממוצע</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span className="text-sm text-white/60">מתחת ל-2% = אישור אוטומטי</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-amber-500" />
                  <span className="text-sm text-white/60">2%-5% = דורש בדיקת מנהל</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <span className="text-sm text-white/60">מעל 5% = חסימת ייצור</span>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Comparisons */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-5">
            <h3 className="text-lg font-semibold mb-4">השוואות אחרונות</h3>
            <div className="space-y-2">
              {(dashboard?.recentComparisons || []).map((c: Comparison) => {
                const st = STATUS_MAP[c.status] || STATUS_MAP.pending;
                return (
                  <div key={c.id} className="flex items-center gap-4 p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                    onClick={() => viewComparison(c.id)}>
                    <st.icon className={`w-5 h-5 flex-shrink-0 ${st.color.split(" ")[1]}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">פרויקט #{c.project_id}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${st.color}`}>{st.label}</span>
                      </div>
                      <div className="text-xs text-white/40 mt-1">
                        סטייה: <span className={Number(c.discrepancy_pct) > 5 ? "text-red-400" : Number(c.discrepancy_pct) > 2 ? "text-amber-400" : "text-green-400"}>
                          {fmtP(Number(c.discrepancy_pct))}
                        </span>
                        {" | "}תואמים: {c.items_matched} | לא תואמים: {c.items_mismatched}
                      </div>
                    </div>
                    <div className="text-xs text-white/30">{new Date(c.created_at).toLocaleDateString("he-IL")}</div>
                    <Eye className="w-4 h-4 text-white/30" />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ─── COMPARISON DETAIL ─── */}
      {tab === "detail" && (
        <div className="space-y-6">
          {!comparisonDetail ? (
            <div className="bg-white/5 border border-white/10 rounded-xl p-12 text-center">
              <Search className="w-12 h-12 text-white/20 mx-auto mb-3" />
              <div className="text-white/40">בחר השוואה מהדשבורד לצפייה בפרטים</div>
            </div>
          ) : (
            <>
              {/* Comparison Header */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">פרויקט #{comparisonDetail.comparison?.project_id}</h3>
                  {(() => {
                    const st = STATUS_MAP[comparisonDetail.comparison?.status] || STATUS_MAP.pending;
                    return <span className={`text-sm px-3 py-1 rounded-full border ${st.color}`}>{st.label}</span>;
                  })()}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <div className="text-xs text-white/40">סטייה כוללת (מטרים)</div>
                    <div className="text-lg font-bold">{fmt(Number(comparisonDetail.comparison?.total_discrepancy_m) || 0)} מ'</div>
                  </div>
                  <div>
                    <div className="text-xs text-white/40">סטייה באחוזים</div>
                    <div className={`text-lg font-bold ${
                      Number(comparisonDetail.comparison?.discrepancy_pct) > 5 ? "text-red-400" :
                      Number(comparisonDetail.comparison?.discrepancy_pct) > 2 ? "text-amber-400" : "text-green-400"
                    }`}>{fmtP(Number(comparisonDetail.comparison?.discrepancy_pct) || 0)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-white/40">פריטים תואמים</div>
                    <div className="text-lg font-bold text-green-400">{comparisonDetail.comparison?.items_matched || 0}</div>
                  </div>
                  <div>
                    <div className="text-xs text-white/40">פריטים לא תואמים</div>
                    <div className="text-lg font-bold text-red-400">{comparisonDetail.comparison?.items_mismatched || 0}</div>
                  </div>
                </div>
              </div>

              {/* Side-by-side measurements */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Agent */}
                <div className="bg-white/5 border border-blue-500/30 rounded-xl p-5">
                  <h4 className="text-md font-semibold mb-3 flex items-center gap-2 text-blue-400">
                    <FileText className="w-4 h-4" /> מדידת סוכן
                  </h4>
                  <div className="text-sm text-white/50 mb-3">
                    {comparisonDetail.agentMeasurement?.measured_by_name} |{" "}
                    סה"כ: <span className="text-blue-400 font-bold">{fmt(Number(comparisonDetail.agentMeasurement?.total_meters) || 0)} מ'</span>
                  </div>
                  <div className="space-y-2">
                    {(comparisonDetail.agentMeasurement?.measurements || []).map((m: any, i: number) => (
                      <div key={i} className="bg-white/5 rounded-lg p-3 text-sm">
                        <div className="font-medium">{m.item}</div>
                        <div className="flex gap-4 mt-1 text-xs text-white/50">
                          <span>אורך: {m.length_m} מ'</span>
                          {m.width_m > 0 && <span>רוחב: {m.width_m} מ'</span>}
                          {m.height_m > 0 && <span>גובה: {m.height_m} מ'</span>}
                          <span>כמות: {m.quantity}</span>
                        </div>
                        {m.notes && <div className="text-xs text-white/30 mt-1">{m.notes}</div>}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Engineer */}
                <div className="bg-white/5 border border-green-500/30 rounded-xl p-5">
                  <h4 className="text-md font-semibold mb-3 flex items-center gap-2 text-green-400">
                    <Ruler className="w-4 h-4" /> מדידת מהנדס
                  </h4>
                  <div className="text-sm text-white/50 mb-3">
                    {comparisonDetail.engineerMeasurement?.measured_by_name} |{" "}
                    סה"כ: <span className="text-green-400 font-bold">{fmt(Number(comparisonDetail.engineerMeasurement?.total_meters) || 0)} מ'</span>
                  </div>
                  <div className="space-y-2">
                    {(comparisonDetail.engineerMeasurement?.measurements || []).map((m: any, i: number) => (
                      <div key={i} className="bg-white/5 rounded-lg p-3 text-sm">
                        <div className="font-medium">{m.item}</div>
                        <div className="flex gap-4 mt-1 text-xs text-white/50">
                          <span>אורך: {m.length_m} מ'</span>
                          {m.width_m > 0 && <span>רוחב: {m.width_m} מ'</span>}
                          {m.height_m > 0 && <span>גובה: {m.height_m} מ'</span>}
                          <span>כמות: {m.quantity}</span>
                        </div>
                        {m.notes && <div className="text-xs text-white/30 mt-1">{m.notes}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Discrepancy Table */}
              <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                <div className="p-4 border-b border-white/10">
                  <h4 className="font-semibold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400" /> פירוט סטיות
                  </h4>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-white/5 text-white/60">
                      <th className="px-4 py-3 text-right">פריט</th>
                      <th className="px-4 py-3 text-center">ערך סוכן</th>
                      <th className="px-4 py-3 text-center">ערך מהנדס</th>
                      <th className="px-4 py-3 text-center">הפרש</th>
                      <th className="px-4 py-3 text-center">% סטייה</th>
                      <th className="px-4 py-3 text-center">חומרה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(comparisonDetail.discrepancies || []).map((d: Discrepancy) => {
                      const sev = SEV_MAP[d.severity] || SEV_MAP.ok;
                      return (
                        <tr key={d.id} className="border-t border-white/5 hover:bg-white/5">
                          <td className="px-4 py-3 font-medium">{d.item_name}</td>
                          <td className="px-4 py-3 text-center text-blue-400">{fmt(Number(d.agent_value))} מ'</td>
                          <td className="px-4 py-3 text-center text-green-400">{fmt(Number(d.engineer_value))} מ'</td>
                          <td className="px-4 py-3 text-center">{fmt(Number(d.difference))} מ'</td>
                          <td className={`px-4 py-3 text-center font-bold ${sev.color}`}>{fmtP(Number(d.difference_pct))}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-xs px-2 py-1 rounded-full ${sev.bg} ${sev.color}`}>{sev.label}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Approve / Reject */}
              {(comparisonDetail.comparison?.status === "pending" || comparisonDetail.comparison?.status === "needs_review") && (
                <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                  <h4 className="font-semibold mb-3">החלטת מנהל</h4>
                  <textarea className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm text-white resize-none mb-3"
                    rows={3} placeholder="הערות (אופציונלי)..."
                    value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} />
                  <div className="flex gap-3">
                    <button onClick={() => handleApprove(comparisonDetail.comparison.id)}
                      className="px-6 py-2 bg-green-600 rounded-lg text-sm hover:bg-green-700 flex items-center gap-2">
                      <ThumbsUp className="w-4 h-4" /> אישור
                    </button>
                    <button onClick={() => handleReject(comparisonDetail.comparison.id)}
                      className="px-6 py-2 bg-red-600 rounded-lg text-sm hover:bg-red-700 flex items-center gap-2">
                      <ThumbsDown className="w-4 h-4" /> דחייה
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ─── CRITICAL DISCREPANCIES ─── */}
      {tab === "discrepancies" && (
        <div className="space-y-3">
          {criticalDiscs.length === 0 ? (
            <div className="bg-white/5 border border-white/10 rounded-xl p-12 text-center">
              <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
              <div className="text-lg font-medium">אין סטיות קריטיות</div>
              <div className="text-white/40 text-sm mt-1">כל המדידות בטווח הסביר</div>
            </div>
          ) : (
            <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/5 text-white/60">
                    <th className="px-4 py-3 text-right">פרויקט</th>
                    <th className="px-4 py-3 text-right">פריט</th>
                    <th className="px-4 py-3 text-center">ערך סוכן</th>
                    <th className="px-4 py-3 text-center">ערך מהנדס</th>
                    <th className="px-4 py-3 text-center">הפרש</th>
                    <th className="px-4 py-3 text-center">% סטייה</th>
                    <th className="px-4 py-3 text-center">סטטוס השוואה</th>
                  </tr>
                </thead>
                <tbody>
                  {criticalDiscs.map((d: any) => (
                    <tr key={d.id} className="border-t border-white/5 hover:bg-white/5">
                      <td className="px-4 py-3 font-medium">#{d.project_id}</td>
                      <td className="px-4 py-3">{d.item_name}</td>
                      <td className="px-4 py-3 text-center text-blue-400">{fmt(Number(d.agent_value))} מ'</td>
                      <td className="px-4 py-3 text-center text-green-400">{fmt(Number(d.engineer_value))} מ'</td>
                      <td className="px-4 py-3 text-center text-red-400 font-bold">{fmt(Number(d.difference))} מ'</td>
                      <td className="px-4 py-3 text-center text-red-400 font-bold">{fmtP(Number(d.difference_pct))}</td>
                      <td className="px-4 py-3 text-center">
                        {(() => {
                          const st = STATUS_MAP[d.comparison_status] || STATUS_MAP.pending;
                          return <span className={`text-xs px-2 py-1 rounded-full border ${st.color}`}>{st.label}</span>;
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
