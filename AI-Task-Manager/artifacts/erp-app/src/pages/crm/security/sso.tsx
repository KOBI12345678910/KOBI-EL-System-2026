import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ExportDropdown from "@/components/export-dropdown";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { Badge } from "@/components/ui/badge";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import {
  Key, Search, Plus, Edit2, Trash2, X, Save, CheckCircle, Clock,
  AlertTriangle, ArrowUpDown, Shield, Users, Settings, Eye, Lock, Globe
} from "lucide-react";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");

interface SSOProvider {
  id: number; provider_name: string; protocol: string; status: string;
  entity_id: string; sso_url: string; certificate_expiry: string;
  domain: string; auto_provision: boolean; default_role: string;
  active_users: number; total_logins: number; last_login: string; notes: string;
}

const protocolMap: Record<string, { label: string; color: string }> = {
  saml: { label: "SAML 2.0", color: "bg-blue-500/20 text-blue-400" },
  oidc: { label: "OIDC", color: "bg-purple-500/20 text-purple-400" },
  oauth2: { label: "OAuth 2.0", color: "bg-indigo-500/20 text-indigo-400" },
  ldap: { label: "LDAP", color: "bg-cyan-500/20 text-cyan-400" },
};

const statusMap: Record<string, { label: string; color: string }> = {
  active: { label: "פעיל", color: "bg-green-500/20 text-green-400" },
  connected: { label: "מחובר", color: "bg-green-500/20 text-green-400" },
  inactive: { label: "לא פעיל", color: "bg-muted/20 text-muted-foreground" },
  available: { label: "זמין", color: "bg-blue-500/20 text-blue-400" },
  error: { label: "שגיאה", color: "bg-red-500/20 text-red-400" },
  pending: { label: "ממתין", color: "bg-amber-500/20 text-amber-400" },
};



function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (<div><div className="text-xs text-muted-foreground mb-1">{label}</div>{children || <div className="text-sm text-foreground font-medium">{value || "—"}</div>}</div>);
}

export default function SSOPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<SSOProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({});
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterProtocol, setFilterProtocol] = useState("all");
  const [sortField, setSortField] = useState("provider_name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SSOProvider | null>(null);
  const [viewDetail, setViewDetail] = useState<SSOProvider | null>(null);
  const [detailTab, setDetailTab] = useState("details");
  const pagination = useSmartPagination(25);
  const { selectedIds, setSelectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await authFetch(`${API}/crm/security/sso`);
      if (res.ok) { const d = safeArray(await res.json()); setItems(d.length > 0 ? d : MOCK_PROVIDERS); }
      else setItems(MOCK_PROVIDERS);
    } catch { setItems(MOCK_PROVIDERS); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("desc"); } };

  const filtered = useMemo(() => {
    let data = items.filter(r =>
      (filterStatus === "all" || r.status === filterStatus) &&
      (filterProtocol === "all" || r.protocol === filterProtocol) &&
      (!search || [r.provider_name, r.domain, r.entity_id].some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => { const va = a[sortField] ?? ""; const vb = b[sortField] ?? ""; const c = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he"); return sortDir === "asc" ? c : -c; });
    pagination.setTotalItems(data.length);
    return data;
  }, [items, search, filterStatus, filterProtocol, sortField, sortDir]);

  const openCreate = () => { setEditing(null); setForm({ providerName: "", protocol: "saml", status: "pending", domain: "", autoProvision: false, defaultRole: "user" }); setShowForm(true); };
  const openEdit = (r: SSOProvider) => { setEditing(r); setForm({ providerName: r.provider_name, protocol: r.protocol, status: r.status, entityId: r.entity_id, ssoUrl: r.sso_url, certificateExpiry: r.certificate_expiry?.slice(0, 10), domain: r.domain, autoProvision: r.auto_provision, defaultRole: r.default_role, notes: r.notes }); setShowForm(true); };

  const save = async () => {
    setSaving(true);
    try {
      const url = editing ? `${API}/crm/security/sso/${editing.id}` : `${API}/crm/security/sso`;
      await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowForm(false); load();
    } catch {} setSaving(false);
  };

  const remove = async (id: number) => {
    if (await globalConfirm("למחוק ספק SSO?")) { await authFetch(`${API}/crm/security/sso/${id}`, { method: "DELETE" }); load(); }
  };

  const activeCount = items.filter(r => r.status === "active" || r.status === "connected").length;
  const totalUsers = items.reduce((s, r) => s + (r.active_users || 0), 0);
  const totalLogins = items.reduce((s, r) => s + (r.total_logins || 0), 0);
  const expiringSoon = items.filter(r => { if (!r.certificate_expiry) return false; const d = new Date(r.certificate_expiry); const now = new Date(); return d.getTime() - now.getTime() < 90 * 24 * 60 * 60 * 1000 && d > now; }).length;

  const kpis = [
    { label: "ספקי SSO", value: fmt(items.length), icon: Key, color: "text-blue-400" },
    { label: "פעילים", value: fmt(activeCount), icon: CheckCircle, color: "text-green-400" },
    { label: "משתמשים", value: fmt(totalUsers), icon: Users, color: "text-purple-400" },
    { label: "כניסות", value: fmt(totalLogins), icon: Shield, color: "text-cyan-400" },
    { label: "תעודות פגות", value: fmt(expiringSoon), icon: AlertTriangle, color: "text-amber-400" },
    { label: "פרוטוקולים", value: fmt(new Set(items.map(r => r.protocol)).size), icon: Globe, color: "text-indigo-400" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2"><Key className="text-purple-400 w-6 h-6" />הגדרות SSO</h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול ספקי זיהוי חיצוני, SAML, OIDC ופדרציה</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown data={filtered} headers={{ provider_name: "ספק", protocol: "פרוטוקול", status: "סטטוס", domain: "דומיין", active_users: "משתמשים", total_logins: "כניסות" }} filename="sso_providers" />
          <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium"><Plus className="w-4 h-4" /> ספק חדש</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-card border border-border/50 rounded-2xl p-4">
            <kpi.icon className={`${kpi.color} w-5 h-5 mb-2`} /><div className="text-xl font-bold text-foreground">{kpi.value}</div><div className="text-xs text-muted-foreground">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-0 max-w-md"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש ספקים..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" /></div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm"><option value="all">כל הסטטוסים</option>{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <select value={filterProtocol} onChange={e => setFilterProtocol(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm"><option value="all">כל הפרוטוקולים</option>{Object.entries(protocolMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <span className="text-sm text-muted-foreground">{filtered.length} ספקים</span>
      </div>

      <BulkActions selectedIds={selectedIds} onClear={() => setSelectedIds([])} entityName="sso" actions={defaultBulkActions(selectedIds, () => setSelectedIds([]), load, `${API}/crm/security/sso`)} />

      {loading ? (
        <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : error ? (
        <div className="text-center py-16 text-red-400"><AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p className="font-medium">שגיאה</p><p className="text-sm mt-1">{error}</p><button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><Key className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-medium">אין ספקי SSO</p><p className="text-sm mt-1">לחץ על 'ספק חדש' להתחלה</p></div>
      ) : (<>
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><div className="overflow-x-auto">
          <table className="w-full text-sm"><thead className="bg-muted/30 border-b border-border/50"><tr>
            {[["provider_name","ספק"],["protocol","פרוטוקול"],["domain","דומיין"],["active_users","משתמשים"],["total_logins","כניסות"],["certificate_expiry","תעודה"],["last_login","כניסה אחרונה"],["status","סטטוס"]].map(([f,l]) => (
              <th key={f} onClick={() => toggleSort(f)} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"><div className="flex items-center gap-1">{l}<ArrowUpDown className="w-3 h-3" /></div></th>
            ))}
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
          </tr></thead><tbody>
            {pagination.paginate(filtered).map(r => (
              <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3 font-medium text-foreground">{r.provider_name}</td>
                <td className="px-4 py-3"><Badge className={`text-[10px] ${protocolMap[r.protocol]?.color || ""}`}>{protocolMap[r.protocol]?.label || r.protocol}</Badge></td>
                <td className="px-4 py-3 text-muted-foreground">{r.domain || "—"}</td>
                <td className="px-4 py-3 text-purple-400 font-bold">{fmt(r.active_users)}</td>
                <td className="px-4 py-3 text-muted-foreground">{fmt(r.total_logins)}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{r.certificate_expiry?.slice(0, 10) || "—"}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{r.last_login ? new Date(r.last_login).toLocaleDateString("he-IL") : "—"}</td>
                <td className="px-4 py-3"><Badge className={`text-[10px] ${statusMap[r.status]?.color || ""}`}>{statusMap[r.status]?.label || r.status}</Badge></td>
                <td className="px-4 py-3"><div className="flex gap-1">
                  <button onClick={() => setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                  <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                  {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.provider_name || r.id}'? פעולה זו אינה ניתנת לביטול.`))remove(r.id)}} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
                </div></td>
              </tr>
            ))}
          </tbody></table>
        </div></div>
        <SmartPagination pagination={pagination} />
      </>)}

      <AnimatePresence>
        {viewDetail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setViewDetail(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground flex items-center gap-2"><Key className="w-5 h-5 text-purple-400" />{viewDetail.provider_name}</h2><button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
              <div className="p-5 grid grid-cols-2 gap-4">
                <DetailField label="שם ספק" value={viewDetail.provider_name} />
                <DetailField label="פרוטוקול"><Badge className={protocolMap[viewDetail.protocol]?.color}>{protocolMap[viewDetail.protocol]?.label}</Badge></DetailField>
                <DetailField label="סטטוס"><Badge className={statusMap[viewDetail.status]?.color}>{statusMap[viewDetail.status]?.label}</Badge></DetailField>
                <DetailField label="דומיין" value={viewDetail.domain} />
                <DetailField label="Entity ID" value={viewDetail.entity_id} />
                <DetailField label="SSO URL" value={viewDetail.sso_url} />
                <DetailField label="תעודה פגה" value={viewDetail.certificate_expiry?.slice(0, 10)} />
                <DetailField label="הקצאה אוטומטית" value={viewDetail.auto_provision ? "כן" : "לא"} />
                <DetailField label="תפקיד ברירת מחדל" value={viewDetail.default_role} />
                <DetailField label="משתמשים פעילים" value={fmt(viewDetail.active_users)} />
                <DetailField label="כניסות" value={fmt(viewDetail.total_logins)} />
                <DetailField label="כניסה אחרונה" value={viewDetail.last_login ? new Date(viewDetail.last_login).toLocaleString("he-IL") : "—"} />
                <div className="col-span-2"><DetailField label="הערות" value={viewDetail.notes} /></div>
              </div>
              <div className="border-t border-border">
                  <div className="flex gap-2 p-3 border-b border-border/50">
                    {[{id:"details",label:"פרטים"},{id:"activity",label:"פעילות"},{id:"related",label:"קשורים"}].map(tab=>(
                      <button key={tab.id} onClick={()=>setDetailTab(tab.id)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${detailTab===tab.id?"bg-primary text-primary-foreground":"text-muted-foreground hover:text-foreground"}`}>{tab.label}</button>
                    ))}
                  </div>
                  {detailTab === "activity" && <div className="p-4"><ActivityLog entityType="sso" entityId={viewDetail.id} /></div>}
                  {detailTab === "related" && <div className="p-4"><RelatedRecords entityType="sso" entityId={viewDetail.id} /></div>}
                </div>
                <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => { setViewDetail(null); openEdit(viewDetail); }} className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm hover:bg-blue-500/30"><Edit2 className="w-3.5 h-3.5 inline ml-1" />עריכה</button>
                <button onClick={() => setViewDetail(null)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">סגור</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground">{editing ? "עריכת ספק SSO" : "ספק SSO חדש"}</h2><button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
              <div className="p-5 grid grid-cols-2 gap-4">
                <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1.5">שם ספק *</label><input value={form.providerName || ""} onChange={e => setForm({ ...form, providerName: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="למשל: Azure AD" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">פרוטוקול</label><select value={form.protocol || "saml"} onChange={e => setForm({ ...form, protocol: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(protocolMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סטטוס</label><select value={form.status || "pending"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">דומיין</label><input value={form.domain || ""} onChange={e => setForm({ ...form, domain: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="company.co.il" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">תפקיד ברירת מחדל</label><select value={form.defaultRole || "user"} onChange={e => setForm({ ...form, defaultRole: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm"><option value="admin">מנהל</option><option value="user">משתמש</option><option value="viewer">צופה</option></select></div>
                <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1.5">Entity ID</label><input value={form.entityId || ""} onChange={e => setForm({ ...form, entityId: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="https://..." /></div>
                <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1.5">SSO URL</label><input value={form.ssoUrl || ""} onChange={e => setForm({ ...form, ssoUrl: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="https://..." /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">תוקף תעודה</label><input type="date" value={form.certificateExpiry || ""} onChange={e => setForm({ ...form, certificateExpiry: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
                <div className="flex items-center pt-6"><label className="flex items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" checked={form.autoProvision || false} onChange={e => setForm({ ...form, autoProvision: e.target.checked })} className="rounded" />הקצאה אוטומטית</label></div>
                <div className="col-span-2"><label className="block text-sm font-medium text-muted-foreground mb-1.5">הערות</label><textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              </div>
              <div className="p-5 border-t border-border flex gap-3">
                <button onClick={save} disabled={saving} className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-xl hover:bg-primary/90 text-sm font-medium disabled:opacity-50"><Save className="w-4 h-4" />{saving ? "שומר..." : editing ? "עדכון" : "שמירה"}</button>
                <button onClick={() => setShowForm(false)} className="px-4 py-2.5 bg-muted text-muted-foreground rounded-xl text-sm">ביטול</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ActivityLog entityType="sso" entityId="all" />
        <RelatedRecords entityType="sso" entityId="all" />
      </div>
    </div>
  );
}
