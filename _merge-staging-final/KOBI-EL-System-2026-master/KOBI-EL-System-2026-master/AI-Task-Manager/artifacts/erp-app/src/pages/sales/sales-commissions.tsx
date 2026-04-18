import { useState, useEffect, useMemo } from "react";
import { authFetch } from "@/lib/utils";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import {
  DollarSign, Plus, Edit, Trash2, X, Save, Search, Users,
  Award, TrendingUp, RefreshCw, ChevronDown, ChevronUp, Settings
} from "lucide-react";

const API = "/api";
const fmtC = (n: any) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(Number(n || 0));
const fmt = (n: any) => Number(n || 0).toLocaleString("he-IL");
const fmtPct = (n: any) => `${Number(n || 0).toFixed(1)}%`;

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  paid: { label: "שולם", color: "bg-green-500/20 text-green-400" },
  pending: { label: "ממתין", color: "bg-amber-500/20 text-amber-400" },
  cancelled: { label: "בוטל", color: "bg-red-500/20 text-red-400" },
};

const RULE_TYPE_LABELS: Record<string, string> = {
  flat_percent: "אחוז קבוע", tiered: "ריבוד (Tiered)", per_deal: "לפי עסקה"
};

type Tab = "summary" | "records" | "rules";

export default function SalesCommissions() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [activeTab, setActiveTab] = useState<Tab>("summary");
  const [summary, setSummary] = useState<any[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [showRecordForm, setShowRecordForm] = useState(false);
  const [editingRule, setEditingRule] = useState<any>(null);
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [ruleForm, setRuleForm] = useState<any>({});
  const [recordForm, setRecordForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [expandedRep, setExpandedRep] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      authFetch(`${API}/sales/commission-records/summary`).then(r => r.json()).then(d => setSummary(Array.isArray(d) ? d : [])).catch(() => setSummary([])),
      authFetch(`${API}/sales/commission-records`).then(r => r.json()).then(d => setRecords(Array.isArray(d) ? d : [])).catch(() => setRecords([])),
      authFetch(`${API}/sales/commission-rules`).then(r => r.json()).then(d => setRules(Array.isArray(d) ? d : [])).catch(() => setRules([])),
    ]).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const filteredSummary = useMemo(() => summary.filter(r => !search || r.rep_name?.toLowerCase().includes(search.toLowerCase())), [summary, search]);
  const filteredRecords = useMemo(() => records.filter(r => !search || `${r.rep_name} ${r.opportunity_name}`.toLowerCase().includes(search.toLowerCase())), [records, search]);

  const totals = useMemo(() => summary.reduce((acc, r) => ({
    total_commission: acc.total_commission + Number(r.total_commission || 0),
    paid_amount: acc.paid_amount + Number(r.paid_amount || 0),
    pending_amount: acc.pending_amount + Number(r.pending_amount || 0),
    deals: acc.deals + Number(r.deals || 0),
  }), { total_commission: 0, paid_amount: 0, pending_amount: 0, deals: 0 }), [summary]);

  const openRuleCreate = () => { setEditingRule(null); setRuleForm({ status: "active", ruleType: "flat_percent", rate: 5, minDealValue: 0 }); setShowRuleForm(true); };
  const openRuleEdit = (r: any) => { setEditingRule(r); setRuleForm({ name: r.name, description: r.description, ruleType: r.rule_type, rate: r.rate, appliesTo: r.applies_to, minDealValue: r.min_deal_value, status: r.status, notes: r.notes }); setShowRuleForm(true); };
  const saveRule = async () => {
    if (!ruleForm.name) return;
    setSaving(true);
    try {
      const url = editingRule ? `${API}/sales/commission-rules/${editingRule.id}` : `${API}/sales/commission-rules`;
      await authFetch(url, { method: editingRule ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ruleForm) });
      setShowRuleForm(false); load();
    } finally { setSaving(false); }
  };
  const deleteRule = async (id: number, name: string) => {
    if (await globalConfirm(`למחוק כלל עמלה '${name}'?`)) { await authFetch(`${API}/sales/commission-rules/${id}`, { method: "DELETE" }); load(); }
  };

  const openRecordCreate = () => { setEditingRecord(null); setRecordForm({ status: "pending", commissionRate: 5, dealValue: 0, commissionAmount: 0 }); setShowRecordForm(true); };
  const openRecordEdit = (r: any) => { setEditingRecord(r); setRecordForm({ repName: r.rep_name, opportunityName: r.opportunity_name, dealValue: r.deal_value, commissionRate: r.commission_rate, commissionAmount: r.commission_amount, ruleName: r.rule_name, status: r.status, closedDate: r.closed_date?.slice(0,10), notes: r.notes }); setShowRecordForm(true); };
  const saveRecord = async () => {
    if (!recordForm.repName) return;
    setSaving(true);
    try {
      const url = editingRecord ? `${API}/sales/commission-records/${editingRecord.id}` : `${API}/sales/commission-records`;
      await authFetch(url, { method: editingRecord ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(recordForm) });
      setShowRecordForm(false); load();
    } finally { setSaving(false); }
  };
  const deleteRecord = async (id: number) => {
    if (await globalConfirm("למחוק רשומת עמלה?")) { await authFetch(`${API}/sales/commission-records/${id}`, { method: "DELETE" }); load(); }
  };

  const calcCommission = () => {
    const rate = Number(recordForm.commissionRate || 0);
    const val = Number(recordForm.dealValue || 0);
    const comm = (val * rate / 100);
    setRecordForm({ ...recordForm, commissionAmount: Math.round(comm) });
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-green-400" />
            מנוע עמלות מכירה
          </h1>
          <p className="text-sm text-muted-foreground mt-1">הגדרת כללי עמלה, מעקב חישובים וסיכום לנציגים</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="flex items-center gap-1.5 bg-card border border-border px-3 py-2.5 rounded-xl text-sm hover:bg-muted">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          {activeTab === "rules" && (
            <button onClick={openRuleCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 text-sm font-medium">
              <Plus className="w-4 h-4" /> כלל חדש
            </button>
          )}
          {activeTab === "records" && (
            <button onClick={openRecordCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 text-sm font-medium">
              <Plus className="w-4 h-4" /> רשומת עמלה
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "סה\"כ עמלות", value: fmtC(totals.total_commission), icon: Award, color: "text-blue-400" },
          { label: "שולם", value: fmtC(totals.paid_amount), icon: DollarSign, color: "text-green-400" },
          { label: "ממתין", value: fmtC(totals.pending_amount), icon: TrendingUp, color: "text-amber-400" },
          { label: "סה\"כ עסקאות", value: fmt(totals.deals), icon: Users, color: "text-purple-400" },
        ].map((k, i) => (
          <div key={i} className="bg-card border border-border/50 rounded-2xl p-4">
            <k.icon className={`${k.color} w-5 h-5 mb-2`} />
            <div className="text-xl font-bold">{k.value}</div>
            <div className="text-xs text-muted-foreground">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="flex border-b border-border/50 gap-1">
        {([["summary", "סיכום לנציגים"], ["records", "רשומות עמלה"], ["rules", "כללי עמלה"]] as [Tab, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)} className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{label}</button>
        ))}
      </div>

      <div className="flex gap-3 items-center">
        <div className="relative flex-1 min-w-0 max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
      </div>

      {activeTab === "summary" && (
        <div className="space-y-3">
          {filteredSummary.length === 0 && !loading ? (
            <div className="text-center py-12 text-muted-foreground">אין נתוני עמלות — הוסף רשומות עמלה בלשונית "רשומות עמלה"</div>
          ) : filteredSummary.map((rep, i) => (
            <div key={i} className="bg-card border border-border/50 rounded-2xl overflow-hidden">
              <div className="p-4 flex items-center justify-between cursor-pointer hover:bg-muted/20" onClick={() => setExpandedRep(expandedRep === rep.rep_name ? null : rep.rep_name)}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                    <Users className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <div className="font-medium text-foreground">{rep.rep_name}</div>
                    <div className="text-xs text-muted-foreground">{rep.deals} עסקאות</div>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <div className="font-bold text-foreground">{fmtC(rep.total_commission)}</div>
                    <div className="text-xs text-muted-foreground">סה"כ עמלה</div>
                  </div>
                  <div className="text-right">
                    <div className="text-green-400 font-bold">{fmtC(rep.paid_amount)}</div>
                    <div className="text-xs text-muted-foreground">שולם</div>
                  </div>
                  <div className="text-right">
                    <div className="text-amber-400 font-bold">{fmtC(rep.pending_amount)}</div>
                    <div className="text-xs text-muted-foreground">ממתין</div>
                  </div>
                  <div className="text-right hidden md:block">
                    <div className="text-muted-foreground font-medium">{fmtPct(rep.avg_rate)}</div>
                    <div className="text-xs text-muted-foreground">אחוז ממוצע</div>
                  </div>
                  {expandedRep === rep.rep_name ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </div>
              </div>
              {expandedRep === rep.rep_name && (
                <div className="border-t border-border/30 px-4 pb-4">
                  <table className="w-full text-sm mt-3">
                    <thead><tr className="text-muted-foreground text-xs">
                      <th className="py-1.5 text-right">הזדמנות</th>
                      <th className="py-1.5 text-right">ערך עסקה</th>
                      <th className="py-1.5 text-right">עמלה</th>
                      <th className="py-1.5 text-right">סטטוס</th>
                      <th className="py-1.5 text-right">תאריך</th>
                    </tr></thead>
                    <tbody>
                      {records.filter(r => r.rep_name === rep.rep_name).map((rec, j) => (
                        <tr key={j} className="border-t border-border/10">
                          <td className="py-2">{rec.opportunity_name || "—"}</td>
                          <td className="py-2">{fmtC(rec.deal_value)}</td>
                          <td className="py-2 font-bold">{fmtC(rec.commission_amount)}</td>
                          <td className="py-2"><span className={`px-1.5 py-0.5 rounded text-xs ${STATUS_MAP[rec.status]?.color || ""}`}>{STATUS_MAP[rec.status]?.label || rec.status}</span></td>
                          <td className="py-2 text-muted-foreground">{rec.closed_date?.slice(0, 10) || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {activeTab === "records" && (
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b border-border/50"><tr>
              {["נציג", "הזדמנות", "ערך עסקה", "אחוז", "עמלה", "כלל", "סטטוס", "תאריך", ""].map((h, i) => (
                <th key={i} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {filteredRecords.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-10 text-muted-foreground">אין רשומות עמלה</td></tr>
              ) : filteredRecords.map(r => (
                <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium">{r.rep_name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.opportunity_name || "—"}</td>
                  <td className="px-4 py-3 font-bold">{fmtC(r.deal_value)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{fmtPct(r.commission_rate)}</td>
                  <td className="px-4 py-3 font-bold text-green-400">{fmtC(r.commission_amount)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.rule_name || "—"}</td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs ${STATUS_MAP[r.status]?.color || ""}`}>{STATUS_MAP[r.status]?.label || r.status}</span></td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{r.closed_date?.slice(0, 10) || "—"}</td>
                  <td className="px-4 py-3"><div className="flex gap-1">
                    <button onClick={() => openRecordEdit(r)} className="p-1.5 hover:bg-muted rounded-lg"><Edit className="w-3.5 h-3.5 text-blue-400" /></button>
                    <button onClick={() => deleteRecord(r.id)} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "rules" && (
        <div className="space-y-3">
          {rules.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Settings className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>אין כללי עמלה — לחץ "כלל חדש"</p>
            </div>
          ) : rules.map(r => (
            <div key={r.id} className="bg-card border border-border/50 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <div className="font-medium text-foreground flex items-center gap-2">
                  {r.name}
                  <span className={`text-xs px-1.5 py-0.5 rounded ${r.status === "active" ? "bg-green-500/20 text-green-400" : "bg-muted/20 text-muted-foreground"}`}>{r.status === "active" ? "פעיל" : "לא פעיל"}</span>
                </div>
                <div className="text-sm text-muted-foreground mt-0.5">{RULE_TYPE_LABELS[r.rule_type] || r.rule_type} • {fmtPct(r.rate)} • מינימום: {fmtC(r.min_deal_value)}</div>
                {r.description && <div className="text-xs text-muted-foreground mt-1">{r.description}</div>}
              </div>
              <div className="flex gap-2">
                <button onClick={() => openRuleEdit(r)} className="p-2 hover:bg-muted rounded-lg"><Edit className="w-4 h-4 text-blue-400" /></button>
                <button onClick={() => deleteRule(r.id, r.name)} className="p-2 hover:bg-muted rounded-lg"><Trash2 className="w-4 h-4 text-red-400" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showRuleForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowRuleForm(false)}>
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-border flex justify-between items-center">
              <h2 className="text-lg font-bold">{editingRule ? "עריכת כלל עמלה" : "כלל עמלה חדש"}</h2>
              <button onClick={() => setShowRuleForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">שם הכלל *</label><input value={ruleForm.name || ""} onChange={e => setRuleForm({ ...ruleForm, name: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סוג חישוב</label>
                  <select value={ruleForm.ruleType || "flat_percent"} onChange={e => setRuleForm({ ...ruleForm, ruleType: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                    {Object.entries(RULE_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">אחוז עמלה (%)</label><input type="number" value={ruleForm.rate || 0} onChange={e => setRuleForm({ ...ruleForm, rate: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" step="0.1" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">ערך עסקה מינימלי (₪)</label><input type="number" value={ruleForm.minDealValue || 0} onChange={e => setRuleForm({ ...ruleForm, minDealValue: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סטטוס</label>
                  <select value={ruleForm.status || "active"} onChange={e => setRuleForm({ ...ruleForm, status: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                    <option value="active">פעיל</option><option value="inactive">לא פעיל</option>
                  </select>
                </div>
              </div>
              <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">תיאור</label><textarea value={ruleForm.description || ""} onChange={e => setRuleForm({ ...ruleForm, description: e.target.value })} rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
            </div>
            <div className="p-5 border-t border-border flex justify-end gap-2">
              <button onClick={() => setShowRuleForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
              <button onClick={saveRule} disabled={saving || !ruleForm.name} className="px-6 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 disabled:opacity-50"><Save className="w-3.5 h-3.5 inline ml-1" />{editingRule ? "עדכון" : "שמירה"}</button>
            </div>
          </div>
        </div>
      )}

      {showRecordForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowRecordForm(false)}>
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-border flex justify-between items-center">
              <h2 className="text-lg font-bold">{editingRecord ? "עריכת רשומת עמלה" : "רשומת עמלה חדשה"}</h2>
              <button onClick={() => setShowRecordForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">נציג *</label><input value={recordForm.repName || ""} onChange={e => setRecordForm({ ...recordForm, repName: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">שם הזדמנות</label><input value={recordForm.opportunityName || ""} onChange={e => setRecordForm({ ...recordForm, opportunityName: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">ערך עסקה (₪)</label><input type="number" value={recordForm.dealValue || 0} onChange={e => { setRecordForm({ ...recordForm, dealValue: Number(e.target.value) }); }} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">אחוז עמלה (%)</label><input type="number" value={recordForm.commissionRate || 0} onChange={e => setRecordForm({ ...recordForm, commissionRate: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" step="0.1" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סכום עמלה (₪)</label>
                  <div className="flex gap-2">
                    <input type="number" value={recordForm.commissionAmount || 0} onChange={e => setRecordForm({ ...recordForm, commissionAmount: Number(e.target.value) })} className="flex-1 bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                    <button onClick={calcCommission} className="px-3 py-2 bg-muted rounded-xl text-xs hover:bg-muted/80">חשב</button>
                  </div>
                </div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סטטוס</label>
                  <select value={recordForm.status || "pending"} onChange={e => setRecordForm({ ...recordForm, status: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                    <option value="pending">ממתין</option><option value="paid">שולם</option><option value="cancelled">בוטל</option>
                  </select>
                </div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">תאריך סגירה</label><input type="date" value={recordForm.closedDate || ""} onChange={e => setRecordForm({ ...recordForm, closedDate: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">כלל עמלה</label>
                  <select value={recordForm.ruleName || ""} onChange={e => { const r = rules.find(x => x.name === e.target.value); setRecordForm({ ...recordForm, ruleName: e.target.value, ruleId: r?.id, commissionRate: r?.rate || recordForm.commissionRate }); }} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                    <option value="">ללא כלל</option>{rules.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="p-5 border-t border-border flex justify-end gap-2">
              <button onClick={() => setShowRecordForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
              <button onClick={saveRecord} disabled={saving || !recordForm.repName} className="px-6 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 disabled:opacity-50"><Save className="w-3.5 h-3.5 inline ml-1" />{editingRecord ? "עדכון" : "שמירה"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
