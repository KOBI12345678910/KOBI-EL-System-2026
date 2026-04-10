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
  Shield, Plus, Pencil, Trash2, Search, ArrowUpDown, Eye, X, AlertTriangle,
  Users, Lock, CheckCircle, Database, Key, Layers
} from "lucide-react";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  active: { label: "פעיל", color: "bg-green-500/20 text-green-400" },
  inactive: { label: "לא פעיל", color: "bg-muted/20 text-muted-foreground" },
  testing: { label: "בבדיקה", color: "bg-blue-500/20 text-blue-400" },
};

const PERMISSION_MAP: Record<string, { label: string; color: string }> = {
  full: { label: "מלא", color: "bg-green-500/20 text-green-400" },
  read: { label: "קריאה", color: "bg-blue-500/20 text-blue-400" },
  write: { label: "כתיבה", color: "bg-amber-500/20 text-amber-400" },
  none: { label: "ללא", color: "bg-red-500/20 text-red-400" },
  own: { label: "עצמי בלבד", color: "bg-purple-500/20 text-purple-400" },
};

const ROLES = ["מנהל מערכת", "מנהל מכירות", "סוכן מכירות", "מנהל כספים", "חשבונאי", "תמיכה", "צופה"];
const TABLES = ["leads", "customers", "deals", "invoices", "payments", "contacts", "reports", "settings"];



function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (<div><div className="text-xs text-muted-foreground mb-1">{label}</div>{children || <div className="text-sm text-foreground font-medium">{value || "—"}</div>}</div>);
}

const emptyForm: any = { role: ROLES[0], table: TABLES[0], permission: "read", status: "active", conditions: "" };


const MOCK_POLICIES: any[] = [];
export default function RowSecurityPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({});
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [sortField, setSortField] = useState("role");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [viewDetail, setViewDetail] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [detailTab, setDetailTab] = useState("details");
  const pagination = useSmartPagination(25);
  const { selectedIds, setSelectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();

  const load = async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${API}/crm/security/row-security`);
      if (res.ok) { const d = safeArray(await res.json()); setItems(d.length > 0 ? d : MOCK_POLICIES); }
      else setItems(MOCK_POLICIES);
    } catch { setItems(MOCK_POLICIES); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    try { await authFetch(`${API}/crm/security/row-security${editItem ? `/${editItem.id}` : ""}`, { method: editItem ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); } catch {}
    if (editItem) setItems(prev => prev.map(it => it.id === editItem.id ? { ...it, ...form } : it));
    else setItems(prev => [...prev, { id: Date.now(), ...form, affected_users: 0 }]);
    setShowForm(false); setEditItem(null); setForm(emptyForm);
  };

  const handleDelete = async (id: number) => {
    const ok = await globalConfirm({ title: "מחיקת מדיניות", message: "למחוק מדיניות RLS?", confirmText: "מחק", variant: "destructive" });
    if (!ok) return;
    setItems(prev => prev.filter(it => it.id !== id));
  };

  const openEdit = (r: any) => { setEditItem(r); setForm({ role: r.role, table: r.table, permission: r.permission, status: r.status, conditions: r.conditions }); setShowForm(true); };
  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("asc"); } };

  const filtered = useMemo(() => {
    let data = items.filter(r => (!search || `${r.role} ${r.table} ${r.conditions}`.toLowerCase().includes(search.toLowerCase())) && (filterRole === "all" || r.role === filterRole));
    data.sort((a: any, b: any) => { const va = a[sortField] ?? ""; const vb = b[sortField] ?? ""; const c = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb)); return sortDir === "asc" ? c : -c; });
    pagination.setTotalItems(data.length);
    return data;
  }, [items, search, filterRole, sortField, sortDir]);

  const totalAffected = items.reduce((s, r) => s + (r.affected_users || 0), 0);
  const kpis = [
    { label: "סה\"כ מדיניות", value: fmt(items.length), icon: Shield, color: "text-blue-400" },
    { label: "פעילות", value: fmt(items.filter(r => r.status === "active").length), icon: CheckCircle, color: "text-green-400" },
    { label: "תפקידים", value: fmt(new Set(items.map(r => r.role)).size), icon: Users, color: "text-cyan-400" },
    { label: "טבלאות", value: fmt(new Set(items.map(r => r.table)).size), icon: Database, color: "text-purple-400" },
    { label: "בבדיקה", value: fmt(items.filter(r => r.status === "testing").length), icon: Key, color: "text-amber-400" },
    { label: "משתמשים מושפעים", value: fmt(totalAffected), icon: Layers, color: "text-orange-400" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2"><Shield className="text-purple-400 w-6 h-6" />אבטחת שורות (RLS)</h1>
          <p className="text-sm text-muted-foreground mt-1">Row-Level Security — הגדרת הרשאות לפי תפקיד וטבלה</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setEditItem(null); setForm(emptyForm); setShowForm(true); }} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm"><Plus className="w-4 h-4" /> מדיניות חדשה</button>
          <ExportDropdown data={filtered} headers={{ role: "תפקיד", table: "טבלה", permission: "הרשאה", conditions: "תנאים", status: "סטטוס" }} filename="row_security" />
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
        <div className="relative flex-1 min-w-0 max-w-md"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" /></div>
        <select value={filterRole} onChange={e => setFilterRole(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm"><option value="all">כל התפקידים</option>{ROLES.map(r=><option key={r} value={r}>{r}</option>)}</select>
        <span className="text-sm text-muted-foreground">{filtered.length} מדיניות</span>
      </div>

      <BulkActions selectedIds={selectedIds} onClear={() => setSelectedIds([])} entityName="row-security" actions={defaultBulkActions(selectedIds, () => setSelectedIds([]), load, `${API}/crm/security/row-security`)} />

      {loading ? (
        <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><Shield className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-medium">אין מדיניות</p></div>
      ) : (<>
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><div className="overflow-x-auto">
          <table className="w-full text-sm"><thead className="bg-muted/30 border-b border-border/50"><tr>
            {[["role","תפקיד"],["table","טבלה"],["permission","הרשאה"],["conditions","תנאים"],["affected_users","מושפעים"],["status","סטטוס"]].map(([f,l])=>(
              <th key={f} onClick={()=>toggleSort(f)} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"><div className="flex items-center gap-1">{l}<ArrowUpDown className="w-3 h-3" /></div></th>
            ))}
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
          </tr></thead><tbody>
            {pagination.paginate(filtered).map(r=>(
              <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3 font-medium text-foreground flex items-center gap-2"><Users className="w-3.5 h-3.5 text-muted-foreground" />{r.role}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.table}</td>
                <td className="px-4 py-3"><Badge className={`text-[10px] ${PERMISSION_MAP[r.permission]?.color||""}`}>{PERMISSION_MAP[r.permission]?.label||r.permission}</Badge></td>
                <td className="px-4 py-3 text-muted-foreground text-xs max-w-[200px] truncate">{r.conditions||"—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.affected_users||0}</td>
                <td className="px-4 py-3"><Badge className={`text-[10px] ${STATUS_MAP[r.status]?.color||""}`}>{STATUS_MAP[r.status]?.label||r.status}</Badge></td>
                <td className="px-4 py-3"><div className="flex gap-1">
                  <button onClick={()=>setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                  <button onClick={()=>openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg"><Pencil className="w-3.5 h-3.5 text-blue-400" /></button>
                  {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.conditions || r.id}'? פעולה זו אינה ניתנת לביטול.`))handleDelete(r.id)}} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
                </div></td>
              </tr>
            ))}
          </tbody></table>
        </div></div>
        <SmartPagination pagination={pagination} />
      </>)}

      <AnimatePresence>
        {viewDetail && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={()=>setViewDetail(null)}>
            <motion.div initial={{scale:0.95}} animate={{scale:1}} exit={{scale:0.95}} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-auto" onClick={e=>e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground">{viewDetail.role} — {viewDetail.table}</h2><button onClick={()=>setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
              <div className="p-5 grid grid-cols-2 gap-4">
                <DetailField label="תפקיד" value={viewDetail.role} />
                <DetailField label="טבלה" value={viewDetail.table} />
                <DetailField label="הרשאה"><Badge className={PERMISSION_MAP[viewDetail.permission]?.color}>{PERMISSION_MAP[viewDetail.permission]?.label}</Badge></DetailField>
                <DetailField label="סטטוס"><Badge className={STATUS_MAP[viewDetail.status]?.color}>{STATUS_MAP[viewDetail.status]?.label}</Badge></DetailField>
                <DetailField label="מושפעים" value={String(viewDetail.affected_users||0)} />
                <div className="col-span-2"><DetailField label="תנאים" value={viewDetail.conditions} /></div>
              </div>
              <div className="p-5 border-t border-border flex justify-end"><button onClick={()=>setViewDetail(null)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">סגור</button></div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={()=>{setShowForm(false);setEditItem(null);}}>
            <motion.div initial={{scale:0.95}} animate={{scale:1}} exit={{scale:0.95}} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-auto" onClick={e=>e.stopPropagation()}>
              <div className="p-5 border-b border-border"><h2 className="text-lg font-bold text-foreground">{editItem?"עריכת מדיניות":"מדיניות חדשה"}</h2></div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-xs text-muted-foreground">תפקיד</label><select className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm mt-1" value={form.role} onChange={e=>setForm({...form,role:e.target.value})}>{ROLES.map(r=><option key={r} value={r}>{r}</option>)}</select></div>
                  <div><label className="text-xs text-muted-foreground">טבלה</label><select className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm mt-1" value={form.table} onChange={e=>setForm({...form,table:e.target.value})}>{TABLES.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-xs text-muted-foreground">הרשאה</label><select className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm mt-1" value={form.permission} onChange={e=>setForm({...form,permission:e.target.value})}>{Object.entries(PERMISSION_MAP).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></div>
                  <div><label className="text-xs text-muted-foreground">סטטוס</label><select className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm mt-1" value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>{Object.entries(STATUS_MAP).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></div>
                </div>
                <div><label className="text-xs text-muted-foreground">תנאים</label><textarea rows={2} className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm mt-1" value={form.conditions||""} onChange={e=>setForm({...form,conditions:e.target.value})} /></div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={()=>{setShowForm(false);setEditItem(null);}} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
                <button onClick={handleSave} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm">שמירה</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ActivityLog entityType="row-security" entityId="all" />
        <RelatedRecords entityType="row-security" entityId="all" />
      </div>
    </div>
  );
}
