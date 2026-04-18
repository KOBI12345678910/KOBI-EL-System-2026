import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/utils";
import {
  MapPin, Search, Plus, Edit2, Trash2, X, Save, Eye, ArrowUpDown,
  CheckCircle2, Clock, AlertTriangle, RefreshCw, Building2, Warehouse,
  Factory, Truck, ArrowLeftRight, Settings, BarChart3, Globe,
  Users, Package, Send, ReceiptText
} from "lucide-react";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");
const fmtCur = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const SITE_TYPES = ["headquarters", "branch", "warehouse", "factory"];
const SITE_TYPE_LABELS: Record<string, string> = { headquarters: "מטה", branch: "סניף", warehouse: "מחסן", factory: "מפעל" };
const SITE_TYPE_ICONS: Record<string, any> = { headquarters: Building2, branch: MapPin, warehouse: Warehouse, factory: Factory };
const TRANSFER_TYPES = ["inventory", "equipment", "documents", "personnel"];
const TRANSFER_TYPE_LABELS: Record<string, string> = { inventory: "מלאי", equipment: "ציוד", documents: "מסמכים", personnel: "כוח אדם" };
const TRANSFER_STATUSES = ["draft", "approved", "in_transit", "received", "cancelled"];
const STATUS_LABELS: Record<string, string> = { draft: "טיוטה", approved: "מאושר", in_transit: "בדרך", received: "התקבל", cancelled: "מבוטל", active: "פעיל", inactive: "לא פעיל", pending: "ממתין" };
const PRIORITIES = ["low", "normal", "high", "urgent"];
const PRIORITY_LABELS: Record<string, string> = { low: "נמוך", normal: "רגיל", high: "גבוה", urgent: "דחוף" };

const statusColor = (s: string) => {
  if (["received", "active", "completed"].includes(s)) return "bg-green-500/20 text-green-400";
  if (["approved", "in_transit"].includes(s)) return "bg-blue-500/20 text-blue-400";
  if (["draft", "pending"].includes(s)) return "bg-yellow-500/20 text-yellow-400";
  return "bg-red-500/20 text-red-400";
};

type TabKey = "sites" | "transfers" | "config" | "consolidated";

export default function MultiSitePage() {
  const [tab, setTab] = useState<TabKey>("sites");
  const [sites, setSites] = useState<any[]>([]);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [siteStats, setSiteStats] = useState<any>({});
  const [transferStats, setTransferStats] = useState<any>({});
  const [consolidatedReport, setConsolidatedReport] = useState<any>(null);
  const [configs, setConfigs] = useState<any[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null);
  const [consolidationRules, setConsolidationRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [filterType, setFilterType] = useState("all");
  const [viewDetail, setViewDetail] = useState<any>(null);
  const [sitePnl, setSitePnl] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [sRes, tRes, ssRes, tsRes, crRes] = await Promise.all([
        authFetch(`${API}/sites`),
        authFetch(`${API}/inter-site-transfers`),
        authFetch(`${API}/sites/stats`),
        authFetch(`${API}/inter-site-transfers/stats`),
        authFetch(`${API}/site-consolidation-rules`),
      ]);
      if (sRes.ok) setSites(safeArray(await sRes.json()));
      if (tRes.ok) setTransfers(safeArray(await tRes.json()));
      if (ssRes.ok) setSiteStats(await ssRes.json());
      if (tsRes.ok) setTransferStats(await tsRes.json());
      if (crRes.ok) setConsolidationRules(safeArray(await crRes.json()));
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const loadConsolidated = async () => {
    try {
      const r = await authFetch(`${API}/sites/consolidated-report`);
      if (r.ok) setConsolidatedReport(await r.json());
    } catch {}
  };
  useEffect(() => { if (tab === "consolidated") loadConsolidated(); }, [tab]);

  const loadSiteConfig = async (siteId: number) => {
    setSelectedSiteId(siteId);
    try {
      const r = await authFetch(`${API}/sites/${siteId}/config`);
      if (r.ok) setConfigs(safeArray(await r.json()));
    } catch {}
  };

  const loadSitePnl = async (siteId: number) => {
    try {
      const r = await authFetch(`${API}/sites/${siteId}/pnl`);
      if (r.ok) setSitePnl(await r.json());
    } catch {}
  };

  const openNew = () => { setEditing(null); setForm({}); setShowForm(true); };
  const openEdit = (item: any) => {
    setEditing(item);
    if (tab === "sites") setForm({ siteCode: item.site_code, siteName: item.site_name, siteType: item.site_type, address: item.address, city: item.city, country: item.country, phone: item.phone, email: item.email, manager: item.manager, defaultWarehouse: item.default_warehouse, defaultCurrency: item.default_currency, workingHours: item.working_hours, parentSiteId: item.parent_site_id, employeeCount: item.employee_count, status: item.status, notes: item.notes });
    else if (tab === "transfers") setForm({ fromSiteId: item.from_site_id, toSiteId: item.to_site_id, fromSiteName: item.from_site_name, toSiteName: item.to_site_name, transferType: item.transfer_type, itemDescription: item.item_description, itemSku: item.item_sku, quantity: item.quantity, unit: item.unit, unitCost: item.unit_cost, currency: item.currency, requestDate: item.request_date?.slice(0, 10), shipDate: item.ship_date?.slice(0, 10), shippingMethod: item.shipping_method, trackingNumber: item.tracking_number, reason: item.reason, priority: item.priority, status: item.status, notes: item.notes });
    setShowForm(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      let ep = "", method = editing ? "PUT" : "POST", url = "";
      if (tab === "sites") { ep = "sites"; }
      else if (tab === "transfers") {
        ep = "inter-site-transfers";
        // Enrich names
        if (form.fromSiteId) { const s = sites.find(x => String(x.id) === String(form.fromSiteId)); if (s) form.fromSiteName = s.site_name; }
        if (form.toSiteId) { const s = sites.find(x => String(x.id) === String(form.toSiteId)); if (s) form.toSiteName = s.site_name; }
      }
      else if (tab === "config") { ep = `sites/${selectedSiteId}/config`; method = "POST"; }
      url = editing ? `${API}/${ep}/${editing.id}` : `${API}/${ep}`;
      await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowForm(false);
      if (tab === "config" && selectedSiteId) loadSiteConfig(selectedSiteId);
      else load();
    } catch {}
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    let ep = tab === "sites" ? "sites" : tab === "transfers" ? "inter-site-transfers" : `sites/${selectedSiteId}/config`;
    await authFetch(`${API}/${ep}/${id}`, { method: "DELETE" });
    if (tab === "config" && selectedSiteId) loadSiteConfig(selectedSiteId);
    else load();
  };

  const handleTransferAction = async (id: number, action: string) => {
    await authFetch(`${API}/inter-site-transfers/${id}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    load();
  };

  const siteOptions = sites.map(s => ({ v: String(s.id), l: s.site_name }));

  const tabs: { key: TabKey; label: string; icon: any }[] = [
    { key: "sites", label: "אתרים", icon: MapPin },
    { key: "transfers", label: "העברות", icon: Truck },
    { key: "config", label: "הגדרות אתר", icon: Settings },
    { key: "consolidated", label: "דוח מאוחד", icon: BarChart3 },
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0e1a] to-[#1a1040] text-white p-6" dir="rtl">
      <div className="max-w-[1400px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-cyan-500/20 rounded-lg flex items-center justify-center"><Globe className="text-cyan-400" size={22} /></div>
            <div><h1 className="text-2xl font-bold">ניהול רב-אתרי</h1><p className="text-sm text-muted-foreground">אתרים, העברות בין-אתריות ודוחות מאוחדים</p></div>
          </div>
          <div className="flex gap-2">
            <button onClick={load} className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 text-sm flex items-center gap-2"><RefreshCw size={14} /> רענון</button>
            {(tab === "sites" || tab === "transfers") && <button onClick={openNew} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg text-sm flex items-center gap-2"><Plus size={14} /> חדש</button>}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "אתרים פעילים", value: fmt(siteStats.active_sites), icon: MapPin, color: "cyan" },
            { label: "עובדים", value: fmt(siteStats.total_employees), icon: Users, color: "blue" },
            { label: "העברות בדרך", value: fmt(transferStats.in_transit), icon: Truck, color: "yellow" },
            { label: "שווי העברות", value: `${fmtCur(transferStats.total_value)} \u20AA`, icon: Package, color: "green" },
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
            <button key={t.key} onClick={() => { setTab(t.key); setShowForm(false); }} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm transition ${tab === t.key ? "bg-cyan-600 text-white" : "text-muted-foreground hover:text-white"}`}>
              <t.icon size={14} />{t.label}
            </button>
          ))}
        </div>

        {loading ? <div className="text-center py-20 text-muted-foreground">טוען...</div> : (
          <>
            {/* SITES TAB */}
            {tab === "sites" && (
              <div className="space-y-3">
                <div className="flex gap-3">
                  <div className="relative flex-1"><Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} /><input className="w-full bg-white/5 border border-white/10 rounded-lg pr-10 pl-4 py-2 text-sm" placeholder="חיפוש אתר..." value={search} onChange={e => setSearch(e.target.value)} /></div>
                  <select className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm" value={filterType} onChange={e => setFilterType(e.target.value)}>
                    <option value="all">כל הסוגים</option>
                    {SITE_TYPES.map(t => <option key={t} value={t}>{SITE_TYPE_LABELS[t]}</option>)}
                  </select>
                </div>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {sites.filter(s => (filterType === "all" || s.site_type === filterType) && (!search || s.site_name?.includes(search) || s.site_code?.includes(search) || s.city?.includes(search))).map(site => {
                    const Icon = SITE_TYPE_ICONS[site.site_type] || MapPin;
                    return (
                      <div key={site.id} className="bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/10 transition">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-cyan-500/20 rounded-lg flex items-center justify-center"><Icon size={16} className="text-cyan-400" /></div>
                            <div><div className="font-semibold">{site.site_name}</div><div className="text-xs text-muted-foreground font-mono">{site.site_code}</div></div>
                          </div>
                          <Badge className={statusColor(site.status)}>{STATUS_LABELS[site.status] || site.status}</Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                          <div><span className="text-muted-foreground">סוג: </span>{SITE_TYPE_LABELS[site.site_type] || site.site_type}</div>
                          <div><span className="text-muted-foreground">עיר: </span>{site.city || "—"}</div>
                          <div><span className="text-muted-foreground">מנהל: </span>{site.manager || "—"}</div>
                          <div><span className="text-muted-foreground">עובדים: </span>{fmt(site.employee_count)}</div>
                          <div><span className="text-muted-foreground">מטבע: </span>{site.default_currency}</div>
                          <div><span className="text-muted-foreground">מחסן: </span>{site.default_warehouse || "—"}</div>
                        </div>
                        {site.address && <div className="text-xs text-muted-foreground mb-3">{site.address}</div>}
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => { loadSitePnl(site.id); setViewDetail(site); }} className="p-1.5 hover:bg-white/10 rounded text-cyan-400" title="רווח והפסד"><BarChart3 size={14} /></button>
                          <button onClick={() => { setTab("config"); loadSiteConfig(site.id); }} className="p-1.5 hover:bg-white/10 rounded" title="הגדרות"><Settings size={14} /></button>
                          <button onClick={() => openEdit(site)} className="p-1.5 hover:bg-white/10 rounded"><Edit2 size={14} /></button>
                          <button onClick={() => handleDelete(site.id)} className="p-1.5 hover:bg-red-500/20 rounded text-red-400"><Trash2 size={14} /></button>
                        </div>
                      </div>
                    );
                  })}
                  {sites.length === 0 && <div className="col-span-3 text-center py-10 text-muted-foreground">אין אתרים עדיין</div>}
                </div>
              </div>
            )}

            {/* TRANSFERS TAB */}
            {tab === "transfers" && (
              <div className="space-y-3">
                <div className="relative"><Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} /><input className="w-full bg-white/5 border border-white/10 rounded-lg pr-10 pl-4 py-2 text-sm" placeholder="חיפוש העברה..." value={search} onChange={e => setSearch(e.target.value)} /></div>
                <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-white/10 bg-white/5">
                      <th className="text-right px-4 py-3">מספר</th><th className="text-right px-4 py-3">מאתר</th><th className="text-right px-4 py-3">לאתר</th><th className="text-right px-4 py-3">סוג</th><th className="text-right px-4 py-3">פריט</th><th className="text-right px-4 py-3">כמות</th><th className="text-right px-4 py-3">שווי</th><th className="text-right px-4 py-3">סטטוס</th><th className="text-right px-4 py-3">פעולות</th>
                    </tr></thead>
                    <tbody>
                      {transfers.filter(t => !search || t.transfer_number?.includes(search) || t.from_site_name?.includes(search) || t.to_site_name?.includes(search) || t.item_description?.includes(search)).map(t => (
                        <tr key={t.id} className="border-b border-white/5 hover:bg-white/5">
                          <td className="px-4 py-3 font-mono text-xs">{t.transfer_number}</td>
                          <td className="px-4 py-3">{t.from_site_name || t.from_name}</td>
                          <td className="px-4 py-3">{t.to_site_name || t.to_name}</td>
                          <td className="px-4 py-3">{TRANSFER_TYPE_LABELS[t.transfer_type] || t.transfer_type}</td>
                          <td className="px-4 py-3">{t.item_description}</td>
                          <td className="px-4 py-3 font-mono">{fmt(t.quantity)} {t.unit}</td>
                          <td className="px-4 py-3 font-mono">{fmtCur(t.total_cost)} {t.currency}</td>
                          <td className="px-4 py-3"><Badge className={statusColor(t.status)}>{STATUS_LABELS[t.status] || t.status}</Badge></td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1">
                              {t.status === "draft" && <button onClick={() => handleTransferAction(t.id, "approve")} className="p-1.5 hover:bg-green-500/20 rounded text-green-400" title="אשר"><CheckCircle2 size={14} /></button>}
                              {t.status === "approved" && <button onClick={() => handleTransferAction(t.id, "ship")} className="p-1.5 hover:bg-blue-500/20 rounded text-blue-400" title="שלח"><Send size={14} /></button>}
                              {t.status === "in_transit" && <button onClick={() => handleTransferAction(t.id, "receive")} className="p-1.5 hover:bg-green-500/20 rounded text-green-400" title="קבל"><ReceiptText size={14} /></button>}
                              <button onClick={() => openEdit(t)} className="p-1.5 hover:bg-white/10 rounded"><Edit2 size={14} /></button>
                              <button onClick={() => handleDelete(t.id)} className="p-1.5 hover:bg-red-500/20 rounded text-red-400"><Trash2 size={14} /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {transfers.length === 0 && <div className="text-center py-10 text-muted-foreground">אין העברות</div>}
                </div>
              </div>
            )}

            {/* CONFIG TAB */}
            {tab === "config" && (
              <div className="space-y-4">
                <div className="flex gap-3 items-center">
                  <select className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm flex-1" value={selectedSiteId || ""} onChange={e => { const v = parseInt(e.target.value); if (v) loadSiteConfig(v); }}>
                    <option value="">-- בחר אתר --</option>
                    {sites.map(s => <option key={s.id} value={s.id}>{s.site_name} ({s.site_code})</option>)}
                  </select>
                  {selectedSiteId && <button onClick={() => { setForm({}); setEditing(null); setShowForm(true); }} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg text-sm flex items-center gap-2"><Plus size={14} /> הוסף הגדרה</button>}
                </div>
                {selectedSiteId ? (
                  <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-white/10 bg-white/5">
                        <th className="text-right px-4 py-3">מפתח</th><th className="text-right px-4 py-3">ערך</th><th className="text-right px-4 py-3">סוג</th><th className="text-right px-4 py-3">קטגוריה</th><th className="text-right px-4 py-3">תיאור</th><th className="text-right px-4 py-3">פעולות</th>
                      </tr></thead>
                      <tbody>
                        {configs.map((c: any) => (
                          <tr key={c.id} className="border-b border-white/5 hover:bg-white/5">
                            <td className="px-4 py-3 font-mono text-xs">{c.config_key}</td>
                            <td className="px-4 py-3">{c.config_value}</td>
                            <td className="px-4 py-3">{c.config_type}</td>
                            <td className="px-4 py-3">{c.category}</td>
                            <td className="px-4 py-3 text-muted-foreground">{c.description}</td>
                            <td className="px-4 py-3"><button onClick={() => handleDelete(c.id)} className="p-1.5 hover:bg-red-500/20 rounded text-red-400"><Trash2 size={14} /></button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {configs.length === 0 && <div className="text-center py-10 text-muted-foreground">אין הגדרות לאתר זה</div>}
                  </div>
                ) : <div className="text-center py-10 text-muted-foreground">בחר אתר לצפייה בהגדרות</div>}
              </div>
            )}

            {/* CONSOLIDATED TAB */}
            {tab === "consolidated" && consolidatedReport && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: "שווי העברות כולל", value: `${fmtCur(consolidatedReport.transferVolume?.total_transfer_value)} \u20AA` },
                    { label: "סה\"כ העברות", value: fmt(consolidatedReport.transferVolume?.total_transfers) },
                    { label: "בדרך", value: fmt(consolidatedReport.transferVolume?.in_transit) },
                    { label: "הושלמו", value: fmt(consolidatedReport.transferVolume?.completed) },
                  ].map((c, i) => (
                    <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-4">
                      <div className="text-xs text-muted-foreground mb-1">{c.label}</div>
                      <div className="text-lg font-bold">{c.value}</div>
                    </div>
                  ))}
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                    <h3 className="font-semibold mb-3">לפי סוג אתר</h3>
                    {(consolidatedReport.byType || []).map((t: any, i: number) => (
                      <div key={i} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                        <span>{SITE_TYPE_LABELS[t.site_type] || t.site_type}</span>
                        <div className="flex gap-4"><span>{fmt(t.count)} אתרים</span><span className="text-muted-foreground">{fmt(t.employees)} עובדים</span></div>
                      </div>
                    ))}
                  </div>

                  <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                    <h3 className="font-semibold mb-3">נתוני אתרים</h3>
                    <div className="max-h-[300px] overflow-y-auto">
                      {(consolidatedReport.sites || []).map((s: any, i: number) => (
                        <div key={i} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0 text-sm">
                          <div>
                            <span className="font-medium">{s.site_name}</span>
                            <Badge className={`mr-2 text-xs ${statusColor(s.status)}`}>{SITE_TYPE_LABELS[s.site_type]}</Badge>
                          </div>
                          <div className="flex gap-3 text-xs">
                            <span className="text-red-400">יוצא: {fmtCur(s.outgoing_value)}</span>
                            <span className="text-green-400">נכנס: {fmtCur(s.incoming_value)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* SITE P&L MODAL */}
        <AnimatePresence>
          {viewDetail && sitePnl && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => { setViewDetail(null); setSitePnl(null); }}>
              <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-[#1a1e2e] border border-white/10 rounded-2xl p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold">רווח והפסד - {viewDetail.site_name}</h2>
                  <button onClick={() => { setViewDetail(null); setSitePnl(null); }} className="p-1.5 hover:bg-white/10 rounded"><X size={18} /></button>
                </div>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-center"><div className="text-xs text-muted-foreground">יוצא</div><div className="text-lg font-bold text-red-400">{fmtCur(sitePnl.totalOutgoing)}</div></div>
                  <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-center"><div className="text-xs text-muted-foreground">נכנס</div><div className="text-lg font-bold text-green-400">{fmtCur(sitePnl.totalIncoming)}</div></div>
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-center"><div className="text-xs text-muted-foreground">נטו</div><div className="text-lg font-bold">{fmtCur(sitePnl.netPosition)}</div></div>
                </div>
                {(sitePnl.transfersByMonth || []).length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold mb-2">לפי חודש</h3>
                    {sitePnl.transfersByMonth.map((m: any, i: number) => (
                      <div key={i} className="flex items-center justify-between py-1 border-b border-white/5 text-sm">
                        <span className="font-mono">{m.month}</span>
                        <div className="flex gap-4"><span className="text-red-400">{fmtCur(m.outgoing)}</span><span className="text-green-400">{fmtCur(m.incoming)}</span></div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

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
                  {tab === "sites" && <>
                    <F label="קוד אתר" name="siteCode" />
                    <F label="שם אתר" name="siteName" />
                    <F label="סוג" name="siteType" options={SITE_TYPES.map(v => ({ v, l: SITE_TYPE_LABELS[v] }))} />
                    <F label="עיר" name="city" />
                    <F label="מדינה" name="country" />
                    <F label="טלפון" name="phone" />
                    <F label="אימייל" name="email" type="email" />
                    <F label="מנהל" name="manager" />
                    <F label="מחסן ברירת מחדל" name="defaultWarehouse" />
                    <F label="מטבע" name="defaultCurrency" />
                    <F label="מספר עובדים" name="employeeCount" type="number" />
                    <F label="אתר אב" name="parentSiteId" options={siteOptions} />
                    <F label="שעות פעילות" name="workingHours" />
                    <F label="סטטוס" name="status" options={[{ v: "active", l: "פעיל" }, { v: "inactive", l: "לא פעיל" }]} />
                    <div className="col-span-2"><F label="כתובת" name="address" type="textarea" /></div>
                    <div className="col-span-2"><F label="הערות" name="notes" type="textarea" /></div>
                  </>}
                  {tab === "transfers" && <>
                    <F label="מאתר" name="fromSiteId" options={siteOptions} />
                    <F label="לאתר" name="toSiteId" options={siteOptions} />
                    <F label="סוג העברה" name="transferType" options={TRANSFER_TYPES.map(v => ({ v, l: TRANSFER_TYPE_LABELS[v] }))} />
                    <F label="מק״ט" name="itemSku" />
                    <F label="כמות" name="quantity" type="number" />
                    <F label="יחידה" name="unit" />
                    <F label="עלות ליחידה" name="unitCost" type="number" />
                    <F label="מטבע" name="currency" />
                    <F label="תאריך בקשה" name="requestDate" type="date" />
                    <F label="תאריך משלוח" name="shipDate" type="date" />
                    <F label="שיטת משלוח" name="shippingMethod" />
                    <F label="מספר מעקב" name="trackingNumber" />
                    <F label="עדיפות" name="priority" options={PRIORITIES.map(v => ({ v, l: PRIORITY_LABELS[v] }))} />
                    {editing && <F label="סטטוס" name="status" options={TRANSFER_STATUSES.map(v => ({ v, l: STATUS_LABELS[v] }))} />}
                    <div className="col-span-2"><F label="תיאור פריט" name="itemDescription" type="textarea" /></div>
                    <div className="col-span-2"><F label="סיבה" name="reason" type="textarea" /></div>
                    <div className="col-span-2"><F label="הערות" name="notes" type="textarea" /></div>
                  </>}
                  {tab === "config" && <>
                    <F label="מפתח הגדרה" name="configKey" />
                    <F label="ערך" name="configValue" />
                    <F label="סוג" name="configType" options={[{ v: "string", l: "טקסט" }, { v: "number", l: "מספר" }, { v: "boolean", l: "בוליאני" }, { v: "json", l: "JSON" }]} />
                    <F label="קטגוריה" name="category" options={[{ v: "general", l: "כללי" }, { v: "finance", l: "כספים" }, { v: "inventory", l: "מלאי" }, { v: "hr", l: "משאבי אנוש" }, { v: "operations", l: "תפעול" }]} />
                    <div className="col-span-2"><F label="תיאור" name="description" type="textarea" /></div>
                  </>}
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm">ביטול</button>
                  <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg text-sm flex items-center gap-2 disabled:opacity-50"><Save size={14} /> {saving ? "שומר..." : "שמור"}</button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
