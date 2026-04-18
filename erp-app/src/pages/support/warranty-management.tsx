import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/utils";
import {
  Shield, Search, Plus, Edit2, Trash2, X, Save, Eye, ArrowUpDown,
  CheckCircle2, Clock, AlertTriangle, FileText, RefreshCw, Users,
  Package, Wrench, Calendar, DollarSign, TrendingUp, ClipboardList
} from "lucide-react";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");
const fmtCur = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const CLAIM_STATUSES = ["open", "in_progress", "approved", "denied", "completed"];
const CLAIM_STATUS_LABELS: Record<string, string> = { open: "פתוח", in_progress: "בטיפול", approved: "מאושר", denied: "נדחה", completed: "הושלם" };
const CLAIM_TYPES = ["repair", "replacement", "refund", "inspection"];
const CLAIM_TYPE_LABELS: Record<string, string> = { repair: "תיקון", replacement: "החלפה", refund: "החזר כספי", inspection: "בדיקה" };
const PRIORITIES = ["low", "normal", "high", "urgent"];
const PRIORITY_LABELS: Record<string, string> = { low: "נמוך", normal: "רגיל", high: "גבוה", urgent: "דחוף" };
const COVERAGE_TYPES = ["standard", "extended", "premium", "limited"];
const COVERAGE_LABELS: Record<string, string> = { standard: "סטנדרטי", extended: "מורחב", premium: "פרימיום", limited: "מוגבל" };

const statusColor = (s: string) => {
  if (["completed", "approved", "active"].includes(s)) return "bg-green-500/20 text-green-400";
  if (["in_progress"].includes(s)) return "bg-blue-500/20 text-blue-400";
  if (["open", "pending"].includes(s)) return "bg-yellow-500/20 text-yellow-400";
  if (["denied", "expired"].includes(s)) return "bg-red-500/20 text-red-400";
  return "bg-muted/20 text-muted-foreground";
};

const priorityColor = (p: string) => {
  if (p === "urgent") return "bg-red-500/20 text-red-400";
  if (p === "high") return "bg-orange-500/20 text-orange-400";
  if (p === "normal") return "bg-blue-500/20 text-blue-400";
  return "bg-muted/20 text-muted-foreground";
};

type TabKey = "dashboard" | "registrations" | "claims" | "policies" | "extensions";

export default function WarrantyManagementPage() {
  const [tab, setTab] = useState<TabKey>("dashboard");
  const [dashboard, setDashboard] = useState<any>({});
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [claims, setClaims] = useState<any[]>([]);
  const [policies, setPolicies] = useState<any[]>([]);
  const [extensions, setExtensions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");

  const load = async () => {
    setLoading(true);
    try {
      const [dRes, rRes, cRes, pRes, eRes] = await Promise.all([
        authFetch(`${API}/warranty/dashboard`),
        authFetch(`${API}/warranty/registrations`),
        authFetch(`${API}/warranty/claims`),
        authFetch(`${API}/warranty/policies`),
        authFetch(`${API}/warranty/extensions`),
      ]);
      if (dRes.ok) setDashboard(await dRes.json());
      if (rRes.ok) setRegistrations(safeArray(await rRes.json()));
      if (cRes.ok) setClaims(safeArray(await cRes.json()));
      if (pRes.ok) setPolicies(safeArray(await pRes.json()));
      if (eRes.ok) setExtensions(safeArray(await eRes.json()));
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setForm({}); setShowForm(true); };
  const openEdit = (item: any) => {
    setEditing(item);
    if (tab === "policies") setForm({ policyName: item.policy_name, durationMonths: item.duration_months, coverageType: item.coverage_type, productCategories: item.product_categories, terms: item.terms, includesParts: item.includes_parts, includesLabor: item.includes_labor, maxClaims: item.max_claims, maxClaimAmount: item.max_claim_amount, deductible: item.deductible, extensionAvailable: item.extension_available, extensionPrice: item.extension_price, extensionMonths: item.extension_months, status: item.status, notes: item.notes });
    else if (tab === "registrations") setForm({ policyId: item.policy_id, policyName: item.policy_name, customerName: item.customer_name, customerEmail: item.customer_email, customerPhone: item.customer_phone, customerAddress: item.customer_address, productName: item.product_name, productCategory: item.product_category, productSku: item.product_sku, serialNumber: item.serial_number, purchaseDate: item.purchase_date?.slice(0, 10), startDate: item.start_date?.slice(0, 10), endDate: item.end_date?.slice(0, 10), invoiceNumber: item.invoice_number, dealerName: item.dealer_name, status: item.status, notes: item.notes });
    else if (tab === "claims") setForm({ registrationId: item.registration_id, registrationNumber: item.registration_number, customerName: item.customer_name, customerPhone: item.customer_phone, productName: item.product_name, serialNumber: item.serial_number, claimType: item.claim_type, issueDescription: item.issue_description, diagnosis: item.diagnosis, resolution: item.resolution, priority: item.priority, status: item.status, assignedTo: item.assigned_to, repairCost: item.repair_cost, partsCost: item.parts_cost, laborCost: item.labor_cost, replacementCost: item.replacement_cost, technicianName: item.technician_name, notes: item.notes });
    setShowForm(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const endpoints: Record<string, string> = { policies: "warranty/policies", registrations: "warranty/registrations", claims: "warranty/claims", extensions: "warranty/extensions" };
      const ep = endpoints[tab];
      if (!ep) { setSaving(false); return; }
      const url = editing ? `${API}/${ep}/${editing.id}` : `${API}/${ep}`;
      const method = editing ? "PUT" : "POST";
      // Add entity names for form
      if (tab === "registrations" && form.policyId) {
        const pol = policies.find(p => String(p.id) === String(form.policyId));
        if (pol) { form.policyName = pol.policy_name; form.durationMonths = pol.duration_months; }
      }
      await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowForm(false); load();
    } catch {}
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    const endpoints: Record<string, string> = { policies: "warranty/policies", registrations: "warranty/registrations", claims: "warranty/claims", extensions: "warranty/extensions" };
    await authFetch(`${API}/${endpoints[tab]}/${id}`, { method: "DELETE" });
    load();
  };

  const processClaim = async (id: number, approved: boolean) => {
    await authFetch(`${API}/warranty/claims/${id}/process`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ approved }) });
    load();
  };

  const tabs: { key: TabKey; label: string; icon: any }[] = [
    { key: "dashboard", label: "דשבורד", icon: TrendingUp },
    { key: "registrations", label: "רישום אחריות", icon: ClipboardList },
    { key: "claims", label: "תביעות", icon: Wrench },
    { key: "policies", label: "מדיניות", icon: FileText },
    { key: "extensions", label: "הרחבות", icon: Calendar },
  ];

  const policyOptions = policies.map(p => ({ v: String(p.id), l: p.policy_name }));
  const regOptions = registrations.map(r => ({ v: String(r.id), l: `${r.registration_number} - ${r.customer_name}` }));

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
      ) : type === "checkbox" ? (
        <input type="checkbox" className="mt-1" checked={!!form[name]} onChange={e => setForm({ ...form, [name]: e.target.checked })} />
      ) : (
        <input type={type} className="w-full bg-[#1e293b] border border-white/10 rounded px-3 py-2 text-sm text-white" value={form[name] || ""} onChange={e => setForm({ ...form, [name]: e.target.value })} />
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0e1a] to-[#1a1040] text-white p-6" dir="rtl">
      <div className="max-w-[1400px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500/20 rounded-lg flex items-center justify-center"><Shield className="text-emerald-400" size={22} /></div>
            <div><h1 className="text-2xl font-bold">ניהול אחריות</h1><p className="text-sm text-muted-foreground">מדיניות, רישום, תביעות והרחבות אחריות</p></div>
          </div>
          <div className="flex gap-2">
            <button onClick={load} className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 text-sm flex items-center gap-2"><RefreshCw size={14} /> רענון</button>
            {tab !== "dashboard" && <button onClick={openNew} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-sm flex items-center gap-2"><Plus size={14} /> חדש</button>}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white/5 rounded-lg p-1">
          {tabs.map(t => (
            <button key={t.key} onClick={() => { setTab(t.key); setShowForm(false); }} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm transition ${tab === t.key ? "bg-emerald-600 text-white" : "text-muted-foreground hover:text-white"}`}>
              <t.icon size={14} />{t.label}
            </button>
          ))}
        </div>

        {loading ? <div className="text-center py-20 text-muted-foreground">טוען...</div> : (
          <>
            {/* DASHBOARD */}
            {tab === "dashboard" && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: "אחריות פעילה", value: fmt(dashboard.active_warranties), icon: Shield, color: "emerald" },
                    { label: "פוקעת בקרוב", value: fmt(dashboard.expiring_soon), icon: AlertTriangle, color: "yellow" },
                    { label: "תביעות פתוחות", value: fmt(dashboard.open_claims), icon: Wrench, color: "orange" },
                    { label: "שיעור סגירה", value: `${dashboard.resolution_rate || 0}%`, icon: TrendingUp, color: "blue" },
                  ].map((c, i) => (
                    <div key={i} className={`bg-${c.color}-500/10 border border-${c.color}-500/20 rounded-xl p-4`}>
                      <div className="flex items-center justify-between mb-2"><span className="text-xs text-muted-foreground">{c.label}</span><c.icon size={16} className={`text-${c.color}-400`} /></div>
                      <div className="text-2xl font-bold">{c.value}</div>
                    </div>
                  ))}
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                    <h3 className="font-semibold mb-3">תביעות לפי סטטוס</h3>
                    {(dashboard.claimsByStatus || []).map((c: any, i: number) => (
                      <div key={i} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                        <Badge className={statusColor(c.status)}>{CLAIM_STATUS_LABELS[c.status] || c.status}</Badge>
                        <span className="font-mono">{fmt(c.count)}</span>
                      </div>
                    ))}
                    {(!dashboard.claimsByStatus || dashboard.claimsByStatus.length === 0) && <div className="text-muted-foreground text-sm">אין נתונים</div>}
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                    <h3 className="font-semibold mb-3">תביעות לפי סוג</h3>
                    {(dashboard.claimsByType || []).map((c: any, i: number) => (
                      <div key={i} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                        <span>{CLAIM_TYPE_LABELS[c.claim_type] || c.claim_type}</span>
                        <div className="flex gap-3"><span className="font-mono">{fmt(c.count)}</span><span className="text-muted-foreground">{fmtCur(c.cost)} \u20AA</span></div>
                      </div>
                    ))}
                    {(!dashboard.claimsByType || dashboard.claimsByType.length === 0) && <div className="text-muted-foreground text-sm">אין נתונים</div>}
                  </div>
                </div>

                {(dashboard.expiringWarranties || []).length > 0 && (
                  <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4">
                    <h3 className="font-semibold mb-3 flex items-center gap-2"><AlertTriangle size={16} className="text-yellow-400" /> אחריות שפוקעת בקרוב</h3>
                    <div className="space-y-2">
                      {dashboard.expiringWarranties.slice(0, 10).map((w: any) => (
                        <div key={w.id} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2 text-sm">
                          <div><span className="font-medium">{w.customer_name}</span> - {w.product_name}</div>
                          <div className="flex gap-3"><span className="text-muted-foreground">{w.serial_number}</span><span className="text-yellow-400">{w.end_date?.slice(0, 10)}</span></div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* REGISTRATIONS */}
            {tab === "registrations" && (
              <div className="space-y-3">
                <div className="relative"><Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} /><input className="w-full bg-white/5 border border-white/10 rounded-lg pr-10 pl-4 py-2 text-sm" placeholder="חיפוש לקוח, מוצר, מספר סידורי..." value={search} onChange={e => setSearch(e.target.value)} /></div>
                <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-white/10 bg-white/5">
                      <th className="text-right px-4 py-3">מספר</th><th className="text-right px-4 py-3">לקוח</th><th className="text-right px-4 py-3">מוצר</th><th className="text-right px-4 py-3">מספר סידורי</th><th className="text-right px-4 py-3">תחילה</th><th className="text-right px-4 py-3">סיום</th><th className="text-right px-4 py-3">סטטוס</th><th className="text-right px-4 py-3">פעולות</th>
                    </tr></thead>
                    <tbody>
                      {registrations.filter(r => !search || r.customer_name?.includes(search) || r.product_name?.includes(search) || r.serial_number?.includes(search) || r.registration_number?.includes(search)).map(r => (
                        <tr key={r.id} className="border-b border-white/5 hover:bg-white/5">
                          <td className="px-4 py-3 font-mono text-xs">{r.registration_number}</td>
                          <td className="px-4 py-3">{r.customer_name}</td>
                          <td className="px-4 py-3">{r.product_name}</td>
                          <td className="px-4 py-3 font-mono text-xs">{r.serial_number}</td>
                          <td className="px-4 py-3">{r.start_date?.slice(0, 10)}</td>
                          <td className="px-4 py-3">{(r.extended_end_date || r.end_date)?.slice(0, 10)}</td>
                          <td className="px-4 py-3"><Badge className={statusColor(r.status)}>{r.status === "active" ? "פעיל" : r.status === "expired" ? "פג תוקף" : r.status}</Badge></td>
                          <td className="px-4 py-3 flex gap-1">
                            <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-white/10 rounded"><Edit2 size={14} /></button>
                            <button onClick={() => handleDelete(r.id)} className="p-1.5 hover:bg-red-500/20 rounded text-red-400"><Trash2 size={14} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {registrations.length === 0 && <div className="text-center py-10 text-muted-foreground">אין רישומי אחריות</div>}
                </div>
              </div>
            )}

            {/* CLAIMS */}
            {tab === "claims" && (
              <div className="space-y-3">
                <div className="flex gap-3">
                  <div className="relative flex-1"><Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} /><input className="w-full bg-white/5 border border-white/10 rounded-lg pr-10 pl-4 py-2 text-sm" placeholder="חיפוש..." value={search} onChange={e => setSearch(e.target.value)} /></div>
                  <select className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                    <option value="all">כל הסטטוסים</option>
                    {CLAIM_STATUSES.map(s => <option key={s} value={s}>{CLAIM_STATUS_LABELS[s]}</option>)}
                  </select>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-white/10 bg-white/5">
                      <th className="text-right px-4 py-3">מספר</th><th className="text-right px-4 py-3">לקוח</th><th className="text-right px-4 py-3">מוצר</th><th className="text-right px-4 py-3">סוג</th><th className="text-right px-4 py-3">עדיפות</th><th className="text-right px-4 py-3">עלות</th><th className="text-right px-4 py-3">סטטוס</th><th className="text-right px-4 py-3">פעולות</th>
                    </tr></thead>
                    <tbody>
                      {claims.filter(c => (filterStatus === "all" || c.status === filterStatus) && (!search || c.claim_number?.includes(search) || c.customer_name?.includes(search) || c.product_name?.includes(search))).map(c => (
                        <tr key={c.id} className="border-b border-white/5 hover:bg-white/5">
                          <td className="px-4 py-3 font-mono text-xs">{c.claim_number}</td>
                          <td className="px-4 py-3">{c.customer_name}</td>
                          <td className="px-4 py-3">{c.product_name}</td>
                          <td className="px-4 py-3">{CLAIM_TYPE_LABELS[c.claim_type] || c.claim_type}</td>
                          <td className="px-4 py-3"><Badge className={priorityColor(c.priority)}>{PRIORITY_LABELS[c.priority] || c.priority}</Badge></td>
                          <td className="px-4 py-3 font-mono">{fmtCur(c.total_cost)}</td>
                          <td className="px-4 py-3"><Badge className={statusColor(c.status)}>{CLAIM_STATUS_LABELS[c.status] || c.status}</Badge></td>
                          <td className="px-4 py-3 flex gap-1">
                            {c.status === "open" && <>
                              <button onClick={() => processClaim(c.id, true)} className="p-1.5 hover:bg-green-500/20 rounded text-green-400" title="אשר"><CheckCircle2 size={14} /></button>
                              <button onClick={() => processClaim(c.id, false)} className="p-1.5 hover:bg-red-500/20 rounded text-red-400" title="דחה"><X size={14} /></button>
                            </>}
                            <button onClick={() => openEdit(c)} className="p-1.5 hover:bg-white/10 rounded"><Edit2 size={14} /></button>
                            <button onClick={() => handleDelete(c.id)} className="p-1.5 hover:bg-red-500/20 rounded text-red-400"><Trash2 size={14} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {claims.length === 0 && <div className="text-center py-10 text-muted-foreground">אין תביעות</div>}
                </div>
              </div>
            )}

            {/* POLICIES */}
            {tab === "policies" && (
              <div className="space-y-3">
                <div className="relative"><Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} /><input className="w-full bg-white/5 border border-white/10 rounded-lg pr-10 pl-4 py-2 text-sm" placeholder="חיפוש מדיניות..." value={search} onChange={e => setSearch(e.target.value)} /></div>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {policies.filter(p => !search || p.policy_name?.includes(search)).map(p => (
                    <div key={p.id} className="bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/10 transition">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold">{p.policy_name}</h3>
                        <Badge className={statusColor(p.status)}>{p.status === "active" ? "פעיל" : "לא פעיל"}</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                        <div><span className="text-muted-foreground">משך: </span>{p.duration_months} חודשים</div>
                        <div><span className="text-muted-foreground">כיסוי: </span>{COVERAGE_LABELS[p.coverage_type] || p.coverage_type}</div>
                        <div><span className="text-muted-foreground">חלקים: </span>{p.includes_parts ? "כלול" : "לא"}</div>
                        <div><span className="text-muted-foreground">עבודה: </span>{p.includes_labor ? "כלול" : "לא"}</div>
                        {p.deductible > 0 && <div><span className="text-muted-foreground">השתתפות: </span>{fmtCur(p.deductible)} \u20AA</div>}
                        {p.extension_available && <div><span className="text-muted-foreground">הרחבה: </span>{p.extension_months} חודשים</div>}
                      </div>
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => openEdit(p)} className="p-1.5 hover:bg-white/10 rounded"><Edit2 size={14} /></button>
                        <button onClick={() => handleDelete(p.id)} className="p-1.5 hover:bg-red-500/20 rounded text-red-400"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  ))}
                  {policies.length === 0 && <div className="col-span-3 text-center py-10 text-muted-foreground">אין מדיניות אחריות</div>}
                </div>
              </div>
            )}

            {/* EXTENSIONS */}
            {tab === "extensions" && (
              <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-white/10 bg-white/5">
                    <th className="text-right px-4 py-3">מספר</th><th className="text-right px-4 py-3">לקוח</th><th className="text-right px-4 py-3">מוצר</th><th className="text-right px-4 py-3">חודשים</th><th className="text-right px-4 py-3">מחיר</th><th className="text-right px-4 py-3">תאריך חדש</th><th className="text-right px-4 py-3">סטטוס</th>
                  </tr></thead>
                  <tbody>
                    {extensions.map(e => (
                      <tr key={e.id} className="border-b border-white/5 hover:bg-white/5">
                        <td className="px-4 py-3 font-mono text-xs">{e.extension_number}</td>
                        <td className="px-4 py-3">{e.customer_name}</td>
                        <td className="px-4 py-3">{e.product_name}</td>
                        <td className="px-4 py-3">{e.extension_months}</td>
                        <td className="px-4 py-3 font-mono">{fmtCur(e.price)} \u20AA</td>
                        <td className="px-4 py-3">{e.new_end_date?.slice(0, 10)}</td>
                        <td className="px-4 py-3"><Badge className={statusColor(e.status)}>{e.status === "approved" ? "מאושר" : e.status === "pending" ? "ממתין" : e.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {extensions.length === 0 && <div className="text-center py-10 text-muted-foreground">אין הרחבות</div>}
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
                  {tab === "policies" && <>
                    <F label="שם מדיניות" name="policyName" />
                    <F label="משך (חודשים)" name="durationMonths" type="number" />
                    <F label="סוג כיסוי" name="coverageType" options={COVERAGE_TYPES.map(v => ({ v, l: COVERAGE_LABELS[v] }))} />
                    <F label="קטגוריות מוצר" name="productCategories" />
                    <F label="כולל חלקים" name="includesParts" type="checkbox" />
                    <F label="כולל עבודה" name="includesLabor" type="checkbox" />
                    <F label="מקסימום תביעות" name="maxClaims" type="number" />
                    <F label="מקסימום סכום" name="maxClaimAmount" type="number" />
                    <F label="השתתפות עצמית" name="deductible" type="number" />
                    <F label="הרחבה זמינה" name="extensionAvailable" type="checkbox" />
                    <F label="מחיר הרחבה" name="extensionPrice" type="number" />
                    <F label="חודשי הרחבה" name="extensionMonths" type="number" />
                    <F label="סטטוס" name="status" options={[{ v: "active", l: "פעיל" }, { v: "inactive", l: "לא פעיל" }]} />
                    <div className="col-span-2"><F label="תנאים" name="terms" type="textarea" /></div>
                    <div className="col-span-2"><F label="הערות" name="notes" type="textarea" /></div>
                  </>}
                  {tab === "registrations" && <>
                    <F label="מדיניות" name="policyId" options={policyOptions} />
                    <F label="שם לקוח" name="customerName" />
                    <F label="אימייל" name="customerEmail" type="email" />
                    <F label="טלפון" name="customerPhone" />
                    <F label="שם מוצר" name="productName" />
                    <F label="קטגוריה" name="productCategory" />
                    <F label="מק״ט" name="productSku" />
                    <F label="מספר סידורי" name="serialNumber" />
                    <F label="תאריך רכישה" name="purchaseDate" type="date" />
                    <F label="תחילת אחריות" name="startDate" type="date" />
                    <F label="סיום אחריות" name="endDate" type="date" />
                    <F label="חשבונית" name="invoiceNumber" />
                    <F label="משווק" name="dealerName" />
                    <F label="סטטוס" name="status" options={[{ v: "active", l: "פעיל" }, { v: "expired", l: "פג תוקף" }, { v: "cancelled", l: "מבוטל" }]} />
                    <div className="col-span-2"><F label="כתובת" name="customerAddress" type="textarea" /></div>
                    <div className="col-span-2"><F label="הערות" name="notes" type="textarea" /></div>
                  </>}
                  {tab === "claims" && <>
                    <F label="רישום אחריות" name="registrationId" options={regOptions} />
                    <F label="שם לקוח" name="customerName" />
                    <F label="טלפון" name="customerPhone" />
                    <F label="מוצר" name="productName" />
                    <F label="מספר סידורי" name="serialNumber" />
                    <F label="סוג תביעה" name="claimType" options={CLAIM_TYPES.map(v => ({ v, l: CLAIM_TYPE_LABELS[v] }))} />
                    <F label="עדיפות" name="priority" options={PRIORITIES.map(v => ({ v, l: PRIORITY_LABELS[v] }))} />
                    <F label="מוקצה ל-" name="assignedTo" />
                    <F label="עלות תיקון" name="repairCost" type="number" />
                    <F label="עלות חלקים" name="partsCost" type="number" />
                    <F label="עלות עבודה" name="laborCost" type="number" />
                    <F label="עלות החלפה" name="replacementCost" type="number" />
                    <F label="טכנאי" name="technicianName" />
                    {editing && <F label="סטטוס" name="status" options={CLAIM_STATUSES.map(v => ({ v, l: CLAIM_STATUS_LABELS[v] }))} />}
                    <div className="col-span-2"><F label="תיאור בעיה" name="issueDescription" type="textarea" /></div>
                    <div className="col-span-2"><F label="אבחון" name="diagnosis" type="textarea" /></div>
                    {editing && <div className="col-span-2"><F label="פתרון" name="resolution" type="textarea" /></div>}
                    <div className="col-span-2"><F label="הערות" name="notes" type="textarea" /></div>
                  </>}
                  {tab === "extensions" && <>
                    <F label="רישום אחריות" name="registrationId" options={regOptions} />
                    <F label="שם לקוח" name="customerName" />
                    <F label="מוצר" name="productName" />
                    <F label="חודשי הרחבה" name="extensionMonths" type="number" />
                    <F label="מחיר" name="price" type="number" />
                    <F label="אמצעי תשלום" name="paymentMethod" />
                    <F label="אסמכתא" name="paymentReference" />
                    <F label="תאריך סיום מקורי" name="originalEndDate" type="date" />
                    <F label="תאריך סיום חדש" name="newEndDate" type="date" />
                    <div className="col-span-2"><F label="הערות" name="notes" type="textarea" /></div>
                  </>}
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm">ביטול</button>
                  <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-sm flex items-center gap-2 disabled:opacity-50"><Save size={14} /> {saving ? "שומר..." : "שמור"}</button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
