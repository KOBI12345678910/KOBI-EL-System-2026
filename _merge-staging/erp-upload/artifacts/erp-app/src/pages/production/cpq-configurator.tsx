import { useState, useEffect } from "react";
import {
  Settings2, DollarSign, CheckCircle2, XCircle, AlertTriangle,
  Package, Plus, RefreshCw, ShoppingCart, ClipboardList, FileText,
  ChevronDown, ChevronUp, BarChart3, Layers
} from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import { authFetch } from "@/lib/utils";

const API = "/api";
const token = () => localStorage.getItem("erp_token") || document.cookie.match(/token=([^;]+)/)?.[1] || "";
const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token()}` });
const fmtC = (n: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(n);

interface Template {
  id: number;
  name: string;
  product_family: string;
  status: string;
  base_price: number;
  description: string;
  group_count: number;
  session_count: number;
}

interface OptionGroup {
  id: number;
  name: string;
  display_order: number;
  is_required: boolean;
  min_selections: number;
  max_selections: number;
  options: { id: number; name: string; code: string; price_impact: number; is_default: boolean }[];
}

interface ConstraintRule {
  id: number;
  rule_type: string;
  source_option_id: number;
  target_option_id: number;
  message: string;
}

interface Session {
  id: number;
  template_id: number;
  template_name?: string;
  customer_name: string;
  selected_options: number[];
  calculated_price: number;
  generated_bom: any[];
  status: string;
  updated_at: string;
}

interface DashboardData {
  active_templates: number;
  total_sessions: number;
  average_price: number;
  sessions_by_status: { status: string; count: number }[];
  recent_sessions: Session[];
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: "טיוטה", color: "bg-muted/30 text-muted-foreground" },
  validated: { label: "מאומת", color: "bg-blue-500/20 text-blue-400" },
  approved: { label: "מאושר", color: "bg-emerald-500/20 text-emerald-400" },
  rejected: { label: "נדחה", color: "bg-red-500/20 text-red-400" },
};

export default function CPQConfiguratorPage() {
  const [tab, setTab] = useState<"dashboard" | "configure" | "sessions">("dashboard");
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  // Configuration state
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [templateDetail, setTemplateDetail] = useState<any>(null);
  const [selectedOptions, setSelectedOptions] = useState<number[]>([]);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [violations, setViolations] = useState<{ rule_id: number; rule_type: string; message: string }[]>([]);
  const [priceBreakdown, setPriceBreakdown] = useState<any>(null);
  const [bomData, setBomData] = useState<any[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [configLoading, setConfigLoading] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState<number | null>(null);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [dashR, tmplR, sessR] = await Promise.all([
        authFetch(`${API}/cpq/dashboard`, { headers: headers() }).then(r => r.json()),
        authFetch(`${API}/cpq/templates`, { headers: headers() }).then(r => r.json()),
        authFetch(`${API}/cpq/sessions`, { headers: headers() }).then(r => r.json()),
      ]);
      setDashboard(dashR);
      setTemplates(tmplR.templates || []);
      setSessions(sessR.sessions || []);
    } catch { setDashboard(null); setTemplates([]); setSessions([]); }
    setLoading(false);
  }

  async function loadTemplate(id: number) {
    setConfigLoading(true);
    try {
      const r = await authFetch(`${API}/cpq/templates/${id}`, { headers: headers() });
      const d = await r.json();
      setTemplateDetail(d);
      // Set defaults
      const defaults: number[] = [];
      (d.option_groups || []).forEach((g: OptionGroup) => {
        (g.options || []).forEach(o => {
          if (o.is_default && o.id) defaults.push(o.id);
        });
      });
      setSelectedOptions(defaults);
      setViolations([]);
      setPriceBreakdown(null);
      setBomData([]);
    } catch { setTemplateDetail(null); }
    setConfigLoading(false);
  }

  async function startSession() {
    if (!selectedTemplateId) return;
    setConfigLoading(true);
    try {
      const r = await authFetch(`${API}/cpq/sessions`, {
        method: "POST", headers: headers(),
        body: JSON.stringify({ template_id: selectedTemplateId, customer_name: customerName || "לקוח חדש" }),
      });
      const d = await r.json();
      setActiveSession(d);
    } catch {}
    setConfigLoading(false);
  }

  function toggleOption(optionId: number) {
    setSelectedOptions(prev =>
      prev.includes(optionId) ? prev.filter(id => id !== optionId) : [...prev, optionId]
    );
    setViolations([]);
    setPriceBreakdown(null);
    setBomData([]);
  }

  async function validateConfig() {
    if (!activeSession) return;
    setConfigLoading(true);
    try {
      // Update options first
      await authFetch(`${API}/cpq/sessions/${activeSession.id}/options`, {
        method: "PUT", headers: headers(),
        body: JSON.stringify({ selected_options: selectedOptions }),
      });
      const r = await authFetch(`${API}/cpq/sessions/${activeSession.id}/validate`, {
        method: "POST", headers: headers(),
      });
      const d = await r.json();
      setViolations(d.violations || []);
    } catch {}
    setConfigLoading(false);
  }

  async function calculatePrice() {
    if (!activeSession) return;
    setConfigLoading(true);
    try {
      await authFetch(`${API}/cpq/sessions/${activeSession.id}/options`, {
        method: "PUT", headers: headers(),
        body: JSON.stringify({ selected_options: selectedOptions }),
      });
      const r = await authFetch(`${API}/cpq/sessions/${activeSession.id}/calculate-price`, {
        method: "POST", headers: headers(),
      });
      const d = await r.json();
      setPriceBreakdown(d);
    } catch {}
    setConfigLoading(false);
  }

  async function generateBom() {
    if (!activeSession) return;
    setConfigLoading(true);
    try {
      const r = await authFetch(`${API}/cpq/sessions/${activeSession.id}/generate-bom`, {
        method: "POST", headers: headers(),
      });
      const d = await r.json();
      setBomData(d.bom || []);
    } catch {}
    setConfigLoading(false);
  }

  const TABS = [
    { key: "dashboard", label: "לוח בקרה", icon: BarChart3 },
    { key: "configure", label: "קונפיגורציה", icon: Settings2 },
    { key: "sessions", label: "סשנים", icon: ClipboardList },
  ] as const;

  return (
    <div className="min-h-screen bg-background text-foreground p-6" dir="rtl">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Settings2 className="w-7 h-7 text-primary" />
              קונפיגורטור מוצרים (CPQ)
            </h1>
            <p className="text-muted-foreground text-sm mt-1">הגדרה, תמחור ויצירת BOM למוצרים מורכבים</p>
          </div>
          <button onClick={loadAll} className="p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition">
            <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-border/50 pb-2">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium transition
                ${tab === t.key ? "bg-primary/10 text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/20"}`}>
              <t.icon className="w-4 h-4" />{t.label}
            </button>
          ))}
        </div>

        {/* Dashboard Tab */}
        {tab === "dashboard" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[
                { label: "תבניות פעילות", value: dashboard?.active_templates || 0, icon: Layers, color: "text-blue-400", fmt: false },
                { label: "סה״כ סשנים", value: dashboard?.total_sessions || 0, icon: ClipboardList, color: "text-emerald-400", fmt: false },
                { label: "מחיר ממוצע", value: dashboard?.average_price || 0, icon: DollarSign, color: "text-purple-400", fmt: true },
                { label: "סשנים מאושרים", value: (dashboard?.sessions_by_status || []).find(s => s.status === "approved")?.count || 0, icon: CheckCircle2, color: "text-amber-400", fmt: false },
              ].map((kpi, i) => (
                <div key={i} className="bg-card/60 backdrop-blur border border-border/30 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-muted-foreground text-sm">{kpi.label}</span>
                    <kpi.icon className={`w-5 h-5 ${kpi.color}`} />
                  </div>
                  <div className="text-3xl font-bold">{kpi.fmt ? fmtC(Number(kpi.value)) : Number(kpi.value).toLocaleString()}</div>
                </div>
              ))}
            </div>

            {/* Templates Grid */}
            <div className="bg-card/60 backdrop-blur border border-border/30 rounded-xl p-5">
              <h3 className="font-semibold mb-3 flex items-center gap-2"><Package className="w-4 h-4 text-primary" /> תבניות מוצרים</h3>
              {templates.length === 0 ? (
                <p className="text-muted-foreground text-sm">אין תבניות עדיין</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {templates.map(t => (
                    <div key={t.id} className="p-4 rounded-lg bg-muted/20 hover:bg-muted/30 transition cursor-pointer"
                      onClick={() => { setSelectedTemplateId(t.id); loadTemplate(t.id); setTab("configure"); }}>
                      <div className="font-medium">{t.name}</div>
                      <div className="text-xs text-muted-foreground mt-1">{t.product_family || "כללי"}</div>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-sm font-bold text-primary">{fmtC(Number(t.base_price))}</span>
                        <span className="text-xs text-muted-foreground">{t.group_count} קבוצות | {t.session_count} סשנים</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Configure Tab */}
        {tab === "configure" && (
          <div className="space-y-4">
            {/* Template selector + session start */}
            <div className="bg-card/60 backdrop-blur border border-border/30 rounded-xl p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">תבנית מוצר</label>
                  <select value={selectedTemplateId || ""} onChange={e => { setSelectedTemplateId(Number(e.target.value)); loadTemplate(Number(e.target.value)); }}
                    className="w-full px-4 py-2.5 rounded-xl bg-muted/20 border border-border/30 text-sm focus:outline-none">
                    <option value="">בחר תבנית...</option>
                    {templates.map(t => <option key={t.id} value={t.id}>{t.name} - {fmtC(Number(t.base_price))}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">שם לקוח</label>
                  <input value={customerName} onChange={e => setCustomerName(e.target.value)}
                    placeholder="שם הלקוח..." className="w-full px-4 py-2.5 rounded-xl bg-muted/20 border border-border/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div className="flex items-end">
                  <button onClick={startSession} disabled={!selectedTemplateId || configLoading}
                    className="w-full px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition disabled:opacity-50">
                    <ShoppingCart className="w-4 h-4 inline ml-2" /> התחל קונפיגורציה
                  </button>
                </div>
              </div>
            </div>

            {/* Option Groups */}
            {templateDetail && (
              <div className="space-y-3">
                {(templateDetail.option_groups || []).map((group: OptionGroup) => (
                  <div key={group.id} className="bg-card/60 backdrop-blur border border-border/30 rounded-xl overflow-hidden">
                    <button className="w-full flex items-center justify-between p-4 hover:bg-muted/10 transition"
                      onClick={() => setExpandedGroup(expandedGroup === group.id ? null : group.id)}>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{group.name}</span>
                        {group.is_required && <span className="text-xs px-2 py-0.5 rounded bg-red-500/20 text-red-400">חובה</span>}
                        <span className="text-xs text-muted-foreground">
                          ({(group.options || []).filter(o => o.id && selectedOptions.includes(o.id)).length} נבחרו)
                        </span>
                      </div>
                      {expandedGroup === group.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    {expandedGroup === group.id && (
                      <div className="px-4 pb-4 space-y-2">
                        {(group.options || []).filter(o => o.id).map(opt => {
                          const selected = selectedOptions.includes(opt.id);
                          return (
                            <div key={opt.id}
                              className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition ${selected ? "bg-primary/10 border border-primary/30" : "bg-muted/20 hover:bg-muted/30"}`}
                              onClick={() => toggleOption(opt.id)}>
                              <div className="flex items-center gap-3">
                                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition ${selected ? "bg-primary border-primary" : "border-muted-foreground/30"}`}>
                                  {selected && <CheckCircle2 className="w-3 h-3 text-primary-foreground" />}
                                </div>
                                <span className={`text-sm ${selected ? "font-medium" : ""}`}>{opt.name}</span>
                                {opt.code && <span className="text-xs text-muted-foreground font-mono">{opt.code}</span>}
                              </div>
                              <span className={`text-sm font-bold ${Number(opt.price_impact) > 0 ? "text-amber-400" : Number(opt.price_impact) < 0 ? "text-emerald-400" : "text-muted-foreground"}`}>
                                {Number(opt.price_impact) > 0 ? "+" : ""}{fmtC(Number(opt.price_impact))}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Violations */}
            {violations.length > 0 && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 space-y-2">
                <h4 className="font-semibold text-red-400 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> שגיאות אימות</h4>
                {violations.map((v, i) => (
                  <div key={i} className="text-sm text-red-300 flex items-center gap-2">
                    <XCircle className="w-3 h-3 shrink-0" /> {v.message}
                  </div>
                ))}
              </div>
            )}

            {/* Action buttons */}
            {activeSession && (
              <div className="flex gap-3">
                <button onClick={validateConfig} disabled={configLoading}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 transition disabled:opacity-50">
                  <CheckCircle2 className="w-4 h-4" /> אמת קונפיגורציה
                </button>
                <button onClick={calculatePrice} disabled={configLoading}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-medium hover:bg-purple-500 transition disabled:opacity-50">
                  <DollarSign className="w-4 h-4" /> חשב מחיר
                </button>
                <button onClick={generateBom} disabled={configLoading}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-500 transition disabled:opacity-50">
                  <FileText className="w-4 h-4" /> צור BOM
                </button>
              </div>
            )}

            {/* Price Breakdown */}
            {priceBreakdown && (
              <div className="bg-card/60 backdrop-blur border border-border/30 rounded-xl p-5 space-y-3">
                <h3 className="font-semibold flex items-center gap-2"><DollarSign className="w-4 h-4 text-purple-400" /> פירוט מחיר</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between p-2 bg-muted/20 rounded"><span>מחיר בסיס</span><span className="font-bold">{fmtC(priceBreakdown.base_price)}</span></div>
                  <div className="flex justify-between p-2 bg-muted/20 rounded"><span>תוספות אופציות ({priceBreakdown.selected_count})</span><span className="font-bold">{fmtC(priceBreakdown.options_total)}</span></div>
                  {(priceBreakdown.applied_rules || []).map((r: any, i: number) => (
                    <div key={i} className="flex justify-between p-2 bg-muted/20 rounded">
                      <span>{r.rule_name} ({r.type})</span>
                      <span className={`font-bold ${r.adjustment < 0 ? "text-emerald-400" : "text-amber-400"}`}>{fmtC(r.adjustment)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between p-3 bg-primary/10 rounded-lg border border-primary/30">
                    <span className="font-bold">מחיר סופי</span>
                    <span className="text-xl font-bold text-primary">{fmtC(priceBreakdown.final_price)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* BOM Preview */}
            {bomData.length > 0 && (
              <div className="bg-card/60 backdrop-blur border border-border/30 rounded-xl p-5">
                <h3 className="font-semibold mb-3 flex items-center gap-2"><FileText className="w-4 h-4 text-emerald-400" /> רשימת חומרים (BOM)</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-muted-foreground border-b border-border/30">
                      <th className="text-right p-2">#</th>
                      <th className="text-right p-2">קוד פריט</th>
                      <th className="text-right p-2">תיאור</th>
                      <th className="text-right p-2">כמות</th>
                      <th className="text-right p-2">מחיר</th>
                    </tr></thead>
                    <tbody>
                      {bomData.map((item, i) => (
                        <tr key={i} className={`border-b border-border/10 ${item.type === "total" ? "font-bold bg-muted/20" : "hover:bg-muted/10"}`}>
                          <td className="p-2">{item.line}</td>
                          <td className="p-2 font-mono text-xs">{item.item_code}</td>
                          <td className="p-2">{item.description}</td>
                          <td className="p-2">{item.quantity}</td>
                          <td className="p-2">{fmtC(item.unit_price)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Sessions Tab */}
        {tab === "sessions" && (
          <div className="bg-card/60 backdrop-blur border border-border/30 rounded-xl p-5">
            <h3 className="font-semibold mb-3 flex items-center gap-2"><ClipboardList className="w-4 h-4 text-primary" /> סשנים אחרונים</h3>
            {sessions.length === 0 ? (
              <p className="text-muted-foreground text-sm">אין סשנים עדיין</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-muted-foreground border-b border-border/30">
                    <th className="text-right p-2">#</th>
                    <th className="text-right p-2">תבנית</th>
                    <th className="text-right p-2">לקוח</th>
                    <th className="text-right p-2">מחיר</th>
                    <th className="text-right p-2">סטטוס</th>
                    <th className="text-right p-2">עדכון אחרון</th>
                  </tr></thead>
                  <tbody>
                    {sessions.map(s => {
                      const st = STATUS_MAP[s.status] || STATUS_MAP.draft;
                      return (
                        <tr key={s.id} className="border-b border-border/10 hover:bg-muted/10">
                          <td className="p-2">{s.id}</td>
                          <td className="p-2">{s.template_name || `תבנית #${s.template_id}`}</td>
                          <td className="p-2">{s.customer_name || "-"}</td>
                          <td className="p-2 font-bold">{fmtC(Number(s.calculated_price))}</td>
                          <td className="p-2"><span className={`px-2 py-0.5 rounded text-xs ${st.color}`}>{st.label}</span></td>
                          <td className="p-2 text-muted-foreground">{new Date(s.updated_at).toLocaleDateString("he-IL")}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
