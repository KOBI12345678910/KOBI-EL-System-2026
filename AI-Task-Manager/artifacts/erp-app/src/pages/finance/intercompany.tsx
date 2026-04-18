import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/utils";
import {
  Building2, Search, Plus, Edit2, Trash2, X, Save, Eye, ArrowUpDown,
  ArrowLeftRight, FileText, CheckCircle2, Clock, DollarSign, Scale,
  RefreshCw, AlertTriangle, Landmark, Users, Globe
} from "lucide-react";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");
const fmtCur = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ENTITY_TYPES = ["subsidiary", "parent", "branch", "joint_venture", "associate"];
const ENTITY_LABELS: Record<string, string> = { subsidiary: "חברה בת", parent: "חברת אם", branch: "סניף", joint_venture: "מיזם משותף", associate: "חברה כלולה" };
const TX_TYPES = ["sale", "purchase", "service", "loan", "dividend", "royalty", "management_fee"];
const TX_LABELS: Record<string, string> = { sale: "מכירה", purchase: "רכישה", service: "שירות", loan: "הלוואה", dividend: "דיבידנד", royalty: "תמלוגים", management_fee: "דמי ניהול" };
const TX_STATUSES = ["draft", "approved", "settled", "cancelled"];
const STATUS_LABELS: Record<string, string> = { draft: "טיוטה", approved: "מאושר", settled: "סולק", cancelled: "מבוטל", pending: "ממתין", completed: "הושלם", active: "פעיל", inactive: "לא פעיל" };
const PRICING_METHODS = ["cost_plus", "resale_minus", "comparable_uncontrolled", "profit_split", "tnmm"];
const PRICING_LABELS: Record<string, string> = { cost_plus: "עלות פלוס", resale_minus: "מחיר מכירה חזרה פחות", comparable_uncontrolled: "מחיר בלתי נשלט דומה", profit_split: "חלוקת רווח", tnmm: "שיטת רווחיות עסקה" };

const statusColor = (s: string) => {
  if (["settled", "completed", "active"].includes(s)) return "bg-green-500/20 text-green-400";
  if (["approved"].includes(s)) return "bg-blue-500/20 text-blue-400";
  if (["draft", "pending"].includes(s)) return "bg-yellow-500/20 text-yellow-400";
  return "bg-red-500/20 text-red-400";
};

type TabKey = "entities" | "transactions" | "settlements" | "pricing" | "consolidation";

export default function IntercompanyPage() {
  const [tab, setTab] = useState<TabKey>("entities");
  const [entities, setEntities] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [settlements, setSettlements] = useState<any[]>([]);
  const [pricingRules, setPricingRules] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [consolidation, setConsolidation] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [sortField, setSortField] = useState("id");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const load = async () => {
    setLoading(true);
    try {
      const [eRes, tRes, sRes, pRes, stRes] = await Promise.all([
        authFetch(`${API}/intercompany/entities`),
        authFetch(`${API}/intercompany/transactions`),
        authFetch(`${API}/intercompany/settlements`),
        authFetch(`${API}/intercompany/pricing-rules`),
        authFetch(`${API}/intercompany/transactions/stats`).catch(() => null),
      ]);
      if (eRes.ok) setEntities(safeArray(await eRes.json()));
      if (tRes.ok) setTransactions(safeArray(await tRes.json()));
      if (sRes.ok) setSettlements(safeArray(await sRes.json()));
      if (pRes.ok) setPricingRules(safeArray(await pRes.json()));
      if (stRes?.ok) setStats(await stRes.json());
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const loadConsolidation = async () => {
    try {
      const r = await authFetch(`${API}/intercompany/consolidation-report`);
      if (r.ok) setConsolidation(await r.json());
    } catch {}
  };
  useEffect(() => { if (tab === "consolidation") loadConsolidation(); }, [tab]);

  const openNew = () => { setEditing(null); setForm({}); setShowForm(true); };
  const openEdit = (item: any) => {
    setEditing(item);
    if (tab === "entities") setForm({ entityCode: item.entity_code, entityName: item.entity_name, entityType: item.entity_type, country: item.country, currency: item.currency, taxId: item.tax_id, address: item.address, contactPerson: item.contact_person, contactEmail: item.contact_email, contactPhone: item.contact_phone, parentEntityId: item.parent_entity_id, ownershipPct: item.ownership_pct, status: item.status, notes: item.notes });
    else if (tab === "transactions") setForm({ transactionType: item.transaction_type, fromEntityId: item.from_entity_id, toEntityId: item.to_entity_id, fromEntityName: item.from_entity_name, toEntityName: item.to_entity_name, description: item.description, amount: item.amount, currency: item.currency, exchangeRate: item.exchange_rate, vatAmount: item.vat_amount, transactionDate: item.transaction_date?.slice(0, 10), dueDate: item.due_date?.slice(0, 10), referenceDoc: item.reference_doc, costCenter: item.cost_center, status: item.status, notes: item.notes });
    else if (tab === "settlements") setForm({ entityAId: item.entity_a_id, entityBId: item.entity_b_id, entityAName: item.entity_a_name, entityBName: item.entity_b_name, netAmount: item.net_amount, currency: item.currency, settlementDate: item.settlement_date?.slice(0, 10), paymentMethod: item.payment_method, paymentReference: item.payment_reference, status: item.status, periodFrom: item.period_from?.slice(0, 10), periodTo: item.period_to?.slice(0, 10), notes: item.notes });
    else if (tab === "pricing") setForm({ ruleName: item.rule_name, fromEntityId: item.from_entity_id, toEntityId: item.to_entity_id, fromEntityName: item.from_entity_name, toEntityName: item.to_entity_name, pricingMethod: item.pricing_method, markupPct: item.markup_pct, productCategory: item.product_category, serviceType: item.service_type, effectiveFrom: item.effective_from?.slice(0, 10), effectiveTo: item.effective_to?.slice(0, 10), status: item.status, notes: item.notes });
    setShowForm(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const endpoints: Record<string, string> = { entities: "intercompany/entities", transactions: "intercompany/transactions", settlements: "intercompany/settlements", pricing: "intercompany/pricing-rules" };
      const ep = endpoints[tab];
      const url = editing ? `${API}/${ep}/${editing.id}` : `${API}/${ep}`;
      const method = editing ? "PUT" : "POST";
      await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowForm(false); load();
    } catch {}
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    const endpoints: Record<string, string> = { entities: "intercompany/entities", transactions: "intercompany/transactions", settlements: "intercompany/settlements", pricing: "intercompany/pricing-rules" };
    await authFetch(`${API}/${endpoints[tab]}/${id}`, { method: "DELETE" });
    load();
  };

  const processSettlement = async (id: number) => {
    await authFetch(`${API}/intercompany/settlements/${id}/process`, { method: "POST" });
    load();
  };

  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("desc"); } };

  const tabs: { key: TabKey; label: string; icon: any }[] = [
    { key: "entities", label: "ישויות", icon: Building2 },
    { key: "transactions", label: "עסקאות", icon: ArrowLeftRight },
    { key: "settlements", label: "סילוקים", icon: CheckCircle2 },
    { key: "pricing", label: "תמחור העברה", icon: Scale },
    { key: "consolidation", label: "איחוד", icon: Globe },
  ];

  const F = ({ label, name, type = "text", options }: { label: string; name: string; type?: string; options?: { v: string; l: string }[] }) => (
    <div>
      <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
      {options ? (
        <select className="w-full bg-[#1e293b] border border-white/10 rounded px-3 py-2 text-sm text-white" value={form[name] || ""} onChange={e => setForm({ ...form, [name]: e.target.value })}>
          <option value="">-- בחר --</option>
          {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
        </select>
      ) : type === "textarea" ? (
        <textarea className="w-full bg-[#1e293b] border border-white/10 rounded px-3 py-2 text-sm text-white min-h-[60px]" value={form[name] || ""} onChange={e => setForm({ ...form, [name]: e.target.value })} />
      ) : (
        <input type={type} className="w-full bg-[#1e293b] border border-white/10 rounded px-3 py-2 text-sm text-white" value={form[name] || ""} onChange={e => setForm({ ...form, [name]: e.target.value })} />
      )}
    </div>
  );

  const entityOptions = entities.map(e => ({ v: String(e.id), l: e.entity_name }));

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0e1a] to-[#1a1040] text-white p-6" dir="rtl">
      <div className="max-w-[1400px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center"><Building2 className="text-purple-400" size={22} /></div>
            <div><h1 className="text-2xl font-bold">עסקאות בין-חברתיות</h1><p className="text-sm text-muted-foreground">ניהול ישויות, עסקאות, סילוקים ותמחור העברה</p></div>
          </div>
          <div className="flex gap-2">
            <button onClick={load} className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 text-sm flex items-center gap-2"><RefreshCw size={14} /> רענון</button>
            {tab !== "consolidation" && <button onClick={openNew} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm flex items-center gap-2"><Plus size={14} /> חדש</button>}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "סה״כ עסקאות", value: fmt(stats.total), icon: ArrowLeftRight, color: "purple" },
            { label: "נפח עסקאות", value: `${fmtCur(stats.total_volume)} \u20AA`, icon: DollarSign, color: "blue" },
            { label: "ממתין לסילוק", value: `${fmtCur(stats.pending_settlement)} \u20AA`, icon: Clock, color: "yellow" },
            { label: "ממתין לאלימינציה", value: fmt(stats.pending_elimination), icon: AlertTriangle, color: "orange" },
          ].map((c, i) => (
            <div key={i} className={`bg-${c.color}-500/10 border border-${c.color}-500/20 rounded-xl p-4`}>
              <div className="flex items-center justify-between mb-2"><span className="text-xs text-muted-foreground">{c.label}</span><c.icon size={16} className={`text-${c.color}-400`} /></div>
              <div className="text-xl font-bold">{c.value}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white/5 rounded-lg p-1">
          {tabs.map(t => (
            <button key={t.key} onClick={() => { setTab(t.key); setShowForm(false); }} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm transition ${tab === t.key ? "bg-purple-600 text-white" : "text-muted-foreground hover:text-white"}`}>
              <t.icon size={14} />{t.label}
            </button>
          ))}
        </div>

        {/* Search */}
        {tab !== "consolidation" && (
          <div className="relative"><Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <input className="w-full bg-white/5 border border-white/10 rounded-lg pr-10 pl-4 py-2 text-sm" placeholder="חיפוש..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        )}

        {loading ? <div className="text-center py-20 text-muted-foreground">טוען...</div> : (
          <>
            {/* ENTITIES TAB */}
            {tab === "entities" && (
              <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-white/10 bg-white/5">
                    <th className="text-right px-4 py-3 cursor-pointer" onClick={() => toggleSort("entity_code")}><span className="flex items-center gap-1">קוד <ArrowUpDown size={12} /></span></th>
                    <th className="text-right px-4 py-3">שם ישות</th>
                    <th className="text-right px-4 py-3">סוג</th>
                    <th className="text-right px-4 py-3">מדינה</th>
                    <th className="text-right px-4 py-3">מטבע</th>
                    <th className="text-right px-4 py-3">בעלות %</th>
                    <th className="text-right px-4 py-3">סטטוס</th>
                    <th className="text-right px-4 py-3">פעולות</th>
                  </tr></thead>
                  <tbody>
                    {entities.filter(e => !search || e.entity_name?.includes(search) || e.entity_code?.includes(search)).map(e => (
                      <tr key={e.id} className="border-b border-white/5 hover:bg-white/5">
                        <td className="px-4 py-3 font-mono text-xs">{e.entity_code}</td>
                        <td className="px-4 py-3 font-medium">{e.entity_name}</td>
                        <td className="px-4 py-3">{ENTITY_LABELS[e.entity_type] || e.entity_type}</td>
                        <td className="px-4 py-3">{e.country}</td>
                        <td className="px-4 py-3">{e.currency}</td>
                        <td className="px-4 py-3">{e.ownership_pct}%</td>
                        <td className="px-4 py-3"><Badge className={statusColor(e.status)}>{STATUS_LABELS[e.status] || e.status}</Badge></td>
                        <td className="px-4 py-3 flex gap-1">
                          <button onClick={() => openEdit(e)} className="p-1.5 hover:bg-white/10 rounded"><Edit2 size={14} /></button>
                          <button onClick={() => handleDelete(e.id)} className="p-1.5 hover:bg-red-500/20 rounded text-red-400"><Trash2 size={14} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {entities.length === 0 && <div className="text-center py-10 text-muted-foreground">אין ישויות עדיין</div>}
              </div>
            )}

            {/* TRANSACTIONS TAB */}
            {tab === "transactions" && (
              <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-white/10 bg-white/5">
                    <th className="text-right px-4 py-3">מספר</th>
                    <th className="text-right px-4 py-3">סוג</th>
                    <th className="text-right px-4 py-3">מישות</th>
                    <th className="text-right px-4 py-3">לישות</th>
                    <th className="text-right px-4 py-3">סכום</th>
                    <th className="text-right px-4 py-3">תאריך</th>
                    <th className="text-right px-4 py-3">סטטוס</th>
                    <th className="text-right px-4 py-3">אלימינציה</th>
                    <th className="text-right px-4 py-3">פעולות</th>
                  </tr></thead>
                  <tbody>
                    {transactions.filter(t => !search || t.transaction_number?.includes(search) || t.from_entity_name?.includes(search) || t.to_entity_name?.includes(search)).map(t => (
                      <tr key={t.id} className="border-b border-white/5 hover:bg-white/5">
                        <td className="px-4 py-3 font-mono text-xs">{t.transaction_number}</td>
                        <td className="px-4 py-3">{TX_LABELS[t.transaction_type] || t.transaction_type}</td>
                        <td className="px-4 py-3">{t.from_entity_name || t.from_name}</td>
                        <td className="px-4 py-3">{t.to_entity_name || t.to_name}</td>
                        <td className="px-4 py-3 font-mono">{fmtCur(t.total_amount)} {t.currency}</td>
                        <td className="px-4 py-3">{t.transaction_date?.slice(0, 10)}</td>
                        <td className="px-4 py-3"><Badge className={statusColor(t.status)}>{STATUS_LABELS[t.status] || t.status}</Badge></td>
                        <td className="px-4 py-3"><Badge className={t.elimination_status === "eliminated" ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"}>{t.elimination_status === "eliminated" ? "בוצע" : "ממתין"}</Badge></td>
                        <td className="px-4 py-3 flex gap-1">
                          <button onClick={() => openEdit(t)} className="p-1.5 hover:bg-white/10 rounded"><Edit2 size={14} /></button>
                          <button onClick={() => handleDelete(t.id)} className="p-1.5 hover:bg-red-500/20 rounded text-red-400"><Trash2 size={14} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {transactions.length === 0 && <div className="text-center py-10 text-muted-foreground">אין עסקאות עדיין</div>}
              </div>
            )}

            {/* SETTLEMENTS TAB */}
            {tab === "settlements" && (
              <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-white/10 bg-white/5">
                    <th className="text-right px-4 py-3">מספר</th>
                    <th className="text-right px-4 py-3">ישות א'</th>
                    <th className="text-right px-4 py-3">ישות ב'</th>
                    <th className="text-right px-4 py-3">סכום נטו</th>
                    <th className="text-right px-4 py-3">תאריך</th>
                    <th className="text-right px-4 py-3">סטטוס</th>
                    <th className="text-right px-4 py-3">פעולות</th>
                  </tr></thead>
                  <tbody>
                    {settlements.filter(st => !search || st.settlement_number?.includes(search) || st.entity_a_name?.includes(search)).map(st => (
                      <tr key={st.id} className="border-b border-white/5 hover:bg-white/5">
                        <td className="px-4 py-3 font-mono text-xs">{st.settlement_number}</td>
                        <td className="px-4 py-3">{st.entity_a_name}</td>
                        <td className="px-4 py-3">{st.entity_b_name}</td>
                        <td className="px-4 py-3 font-mono">{fmtCur(st.net_amount)} {st.currency}</td>
                        <td className="px-4 py-3">{st.settlement_date?.slice(0, 10)}</td>
                        <td className="px-4 py-3"><Badge className={statusColor(st.status)}>{STATUS_LABELS[st.status] || st.status}</Badge></td>
                        <td className="px-4 py-3 flex gap-1">
                          {st.status === "pending" && <button onClick={() => processSettlement(st.id)} className="p-1.5 hover:bg-green-500/20 rounded text-green-400" title="עבד סילוק"><CheckCircle2 size={14} /></button>}
                          <button onClick={() => openEdit(st)} className="p-1.5 hover:bg-white/10 rounded"><Edit2 size={14} /></button>
                          <button onClick={() => handleDelete(st.id)} className="p-1.5 hover:bg-red-500/20 rounded text-red-400"><Trash2 size={14} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {settlements.length === 0 && <div className="text-center py-10 text-muted-foreground">אין סילוקים עדיין</div>}
              </div>
            )}

            {/* PRICING RULES TAB */}
            {tab === "pricing" && (
              <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-white/10 bg-white/5">
                    <th className="text-right px-4 py-3">שם כלל</th>
                    <th className="text-right px-4 py-3">מישות</th>
                    <th className="text-right px-4 py-3">לישות</th>
                    <th className="text-right px-4 py-3">שיטת תמחור</th>
                    <th className="text-right px-4 py-3">מרווח %</th>
                    <th className="text-right px-4 py-3">סטטוס</th>
                    <th className="text-right px-4 py-3">פעולות</th>
                  </tr></thead>
                  <tbody>
                    {pricingRules.filter(r => !search || r.rule_name?.includes(search)).map(r => (
                      <tr key={r.id} className="border-b border-white/5 hover:bg-white/5">
                        <td className="px-4 py-3 font-medium">{r.rule_name}</td>
                        <td className="px-4 py-3">{r.from_entity_name}</td>
                        <td className="px-4 py-3">{r.to_entity_name}</td>
                        <td className="px-4 py-3">{PRICING_LABELS[r.pricing_method] || r.pricing_method}</td>
                        <td className="px-4 py-3">{r.markup_pct}%</td>
                        <td className="px-4 py-3"><Badge className={statusColor(r.status)}>{STATUS_LABELS[r.status] || r.status}</Badge></td>
                        <td className="px-4 py-3 flex gap-1">
                          <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-white/10 rounded"><Edit2 size={14} /></button>
                          <button onClick={() => handleDelete(r.id)} className="p-1.5 hover:bg-red-500/20 rounded text-red-400"><Trash2 size={14} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {pricingRules.length === 0 && <div className="text-center py-10 text-muted-foreground">אין כללי תמחור עדיין</div>}
              </div>
            )}

            {/* CONSOLIDATION TAB */}
            {tab === "consolidation" && consolidation && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {[
                    { label: "סה״כ עסקאות", value: fmt(consolidation.summary?.total_transactions) },
                    { label: "נפח כולל", value: `${fmtCur(consolidation.summary?.total_volume)} \u20AA` },
                    { label: "בוצע אלימינציה", value: `${fmtCur(consolidation.summary?.eliminated_amount)} \u20AA` },
                    { label: "ממתין לאלימינציה", value: `${fmtCur(consolidation.summary?.pending_amount)} \u20AA` },
                    { label: "עסקאות שאוחדו", value: fmt(consolidation.summary?.eliminated) },
                    { label: "ממתינים", value: fmt(consolidation.summary?.pending_elimination) },
                  ].map((c, i) => (
                    <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-4">
                      <div className="text-xs text-muted-foreground mb-1">{c.label}</div>
                      <div className="text-lg font-bold">{c.value}</div>
                    </div>
                  ))}
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <h3 className="font-semibold mb-3">מיקום נטו לפי ישות</h3>
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-white/10"><th className="text-right px-4 py-2">ישות</th><th className="text-right px-4 py-2">יוצא</th><th className="text-right px-4 py-2">נכנס</th><th className="text-right px-4 py-2">נטו</th></tr></thead>
                    <tbody>
                      {(consolidation.byEntity || []).map((e: any, i: number) => (
                        <tr key={i} className="border-b border-white/5">
                          <td className="px-4 py-2 font-medium">{e.entity_name}</td>
                          <td className="px-4 py-2 text-red-400">{fmtCur(e.total_outgoing)}</td>
                          <td className="px-4 py-2 text-green-400">{fmtCur(e.total_incoming)}</td>
                          <td className="px-4 py-2 font-bold">{fmtCur(e.net_position)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* FORM MODAL */}
        <AnimatePresence>
          {showForm && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
              <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-[#1a1e2e] border border-white/10 rounded-2xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold">{editing ? "עריכה" : "חדש"} - {tabs.find(t => t.key === tab)?.label}</h2>
                  <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-white/10 rounded"><X size={18} /></button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {tab === "entities" && <>
                    <F label="קוד ישות" name="entityCode" />
                    <F label="שם ישות" name="entityName" />
                    <F label="סוג" name="entityType" options={ENTITY_TYPES.map(v => ({ v, l: ENTITY_LABELS[v] }))} />
                    <F label="מדינה" name="country" />
                    <F label="מטבע" name="currency" />
                    <F label="ח.פ. / מס'" name="taxId" />
                    <F label="איש קשר" name="contactPerson" />
                    <F label="אימייל" name="contactEmail" type="email" />
                    <F label="טלפון" name="contactPhone" />
                    <F label="בעלות %" name="ownershipPct" type="number" />
                    <F label="סטטוס" name="status" options={[{ v: "active", l: "פעיל" }, { v: "inactive", l: "לא פעיל" }]} />
                    <div className="col-span-2"><F label="כתובת" name="address" type="textarea" /></div>
                    <div className="col-span-2"><F label="הערות" name="notes" type="textarea" /></div>
                  </>}
                  {tab === "transactions" && <>
                    <F label="סוג עסקה" name="transactionType" options={TX_TYPES.map(v => ({ v, l: TX_LABELS[v] }))} />
                    <F label="מישות" name="fromEntityId" options={entityOptions} />
                    <F label="לישות" name="toEntityId" options={entityOptions} />
                    <F label="סכום" name="amount" type="number" />
                    <F label="מטבע" name="currency" />
                    <F label="שער חליפין" name="exchangeRate" type="number" />
                    <F label="מע״מ" name="vatAmount" type="number" />
                    <F label="תאריך" name="transactionDate" type="date" />
                    <F label="תאריך פירעון" name="dueDate" type="date" />
                    <F label="מסמך הפניה" name="referenceDoc" />
                    <F label="מרכז עלות" name="costCenter" />
                    <F label="סטטוס" name="status" options={TX_STATUSES.map(v => ({ v, l: STATUS_LABELS[v] }))} />
                    <div className="col-span-2"><F label="תיאור" name="description" type="textarea" /></div>
                    <div className="col-span-2"><F label="הערות" name="notes" type="textarea" /></div>
                  </>}
                  {tab === "settlements" && <>
                    <F label="ישות א'" name="entityAId" options={entityOptions} />
                    <F label="ישות ב'" name="entityBId" options={entityOptions} />
                    <F label="סכום נטו" name="netAmount" type="number" />
                    <F label="מטבע" name="currency" />
                    <F label="תאריך סילוק" name="settlementDate" type="date" />
                    <F label="אמצעי תשלום" name="paymentMethod" />
                    <F label="אסמכתא" name="paymentReference" />
                    <F label="תקופה מ-" name="periodFrom" type="date" />
                    <F label="תקופה עד" name="periodTo" type="date" />
                    <F label="סטטוס" name="status" options={[{ v: "pending", l: "ממתין" }, { v: "completed", l: "הושלם" }]} />
                    <div className="col-span-2"><F label="הערות" name="notes" type="textarea" /></div>
                  </>}
                  {tab === "pricing" && <>
                    <F label="שם כלל" name="ruleName" />
                    <F label="מישות" name="fromEntityId" options={entityOptions} />
                    <F label="לישות" name="toEntityId" options={entityOptions} />
                    <F label="שיטת תמחור" name="pricingMethod" options={PRICING_METHODS.map(v => ({ v, l: PRICING_LABELS[v] }))} />
                    <F label="מרווח %" name="markupPct" type="number" />
                    <F label="קטגוריית מוצר" name="productCategory" />
                    <F label="סוג שירות" name="serviceType" />
                    <F label="תחילת תוקף" name="effectiveFrom" type="date" />
                    <F label="סיום תוקף" name="effectiveTo" type="date" />
                    <F label="סטטוס" name="status" options={[{ v: "active", l: "פעיל" }, { v: "inactive", l: "לא פעיל" }]} />
                    <div className="col-span-2"><F label="הערות" name="notes" type="textarea" /></div>
                  </>}
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm">ביטול</button>
                  <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm flex items-center gap-2 disabled:opacity-50"><Save size={14} /> {saving ? "שומר..." : "שמור"}</button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
