import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import ExportDropdown from "@/components/export-dropdown";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { Badge } from "@/components/ui/badge";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { authFetch } from "@/lib/utils";
import { usePlatformModules, PLATFORM_MODULES_QUERY_KEY } from "@/hooks/usePlatformModules";
import {
  Blocks, Package, Database, TextCursorInput, Link2, CircleDot,
  FormInput, Table2, CreditCard, MousePointerClick, Zap,
  ChevronLeft, LayoutGrid, Puzzle, BarChart3, MenuSquare,
  Search, ArrowUpDown, AlertTriangle, CheckCircle2, Settings,
  Eye, X, Edit2, Trash2, Plus, Save
} from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");

const DetailField = ({ label, value, children }: any) => (
  <div><span className="text-xs text-muted-foreground">{label}</span><div className="text-sm text-foreground mt-0.5">{children || value || "—"}</div></div>
);

const CARDS = [
  { href: "/builder", label: "בונה הפלטפורמה", icon: Blocks, description: "דאשבורד הבנייה הראשי", color: "from-blue-500/20 to-indigo-500/20" },
  { href: "/builder/modules", label: "מודולים", icon: Package, description: "יצירה וניהול מודולים", color: "from-violet-500/20 to-purple-500/20" },
  { href: "/builder/entities", label: "ישויות", icon: Database, description: "ניהול טבלאות ומבני נתונים", color: "from-cyan-500/20 to-blue-500/20" },
  { href: "/builder/fields", label: "שדות", icon: TextCursorInput, description: "הגדרת שדות לכל ישות", color: "from-emerald-500/20 to-green-500/20" },
  { href: "/builder/relations", label: "קשרים", icon: Link2, description: "הגדרת קשרים בין ישויות", color: "from-orange-500/20 to-amber-500/20" },
  { href: "/builder/statuses", label: "סטטוסים", icon: CircleDot, description: "הגדרת סטטוסים ומעברים", color: "from-teal-500/20 to-cyan-500/20" },
  { href: "/builder/categories", label: "קטגוריות", icon: Puzzle, description: "ניהול קטגוריות וסיווגים", color: "from-pink-500/20 to-rose-500/20" },
  { href: "/builder/forms", label: "טפסים", icon: FormInput, description: "עריכת טפסי הזנת נתונים", color: "from-blue-500/20 to-indigo-500/20" },
  { href: "/builder/views", label: "תצוגות רשימה", icon: Table2, description: "עיצוב תצוגות טבלה ורשימות", color: "from-green-500/20 to-emerald-500/20" },
  { href: "/builder/details", label: "כרטיסי ישות", icon: CreditCard, description: "עריכת דפי פירוט", color: "from-purple-500/20 to-violet-500/20" },
  { href: "/builder/buttons", label: "כפתורים", icon: MousePointerClick, description: "הגדרת כפתורי פעולה", color: "from-orange-500/20 to-amber-500/20" },
  { href: "/builder/actions", label: "פעולות", icon: Zap, description: "פעולות מותאמות", color: "from-yellow-500/20 to-amber-500/20" },
  { href: "/builder/menus", label: "תפריטים", icon: MenuSquare, description: "ניהול תפריטי ניווט", color: "from-slate-500/20 to-gray-500/20" },
  { href: "/builder/dashboards", label: "דשבורדים", icon: BarChart3, description: "בניית לוחות מחוונים", color: "from-cyan-500/20 to-blue-500/20" },
  { href: "/builder/widgets", label: "ווידג'טים", icon: LayoutGrid, description: "רכיבי תצוגה מותאמים", color: "from-pink-500/20 to-rose-500/20" },
];

export default function ModulesFieldsSection() {
  const queryClient = useQueryClient();
  const { modules, isLoading: loading, isError } = usePlatformModules();
  const error = isError ? "שגיאה בטעינת מודולים" : null;
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("cards");
  const [sortField, setSortField] = useState("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [viewDetail, setViewDetail] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({});
  const pagination = useSmartPagination(25);
  const { selectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();
  const [detailTab, setDetailTab] = useState("details");

  const load = () => queryClient.invalidateQueries({ queryKey: PLATFORM_MODULES_QUERY_KEY });

  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("asc"); } };

  const filteredModules = useMemo(() => {
    let data = modules.filter(m => !search || [m.name, m.description, m.slug].some(f => f?.toLowerCase().includes(search.toLowerCase())));
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? ""; const vb = b[sortField] ?? "";
      const cmp = String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    pagination.setTotalItems(data.length);
    return data;
  }, [modules, search, sortField, sortDir]);

  const filteredCards = useMemo(() => {
    if (!search) return CARDS;
    return CARDS.filter(c => c.label.includes(search) || c.description.includes(search));
  }, [search]);

  const openCreate = () => { setEditing(null); setForm({ name: "", slug: "", description: "", status: "active" }); setShowForm(true); };
  const openEdit = (m: any) => { setEditing(m); setForm({ name: m.name || "", slug: m.slug || "", description: m.description || "", status: m.status || "active" }); setShowForm(true); };

  const save = async () => {
    setSaving(true);
    try {
      const url = editing ? `${API}/platform/modules/${editing.id}` : `${API}/platform/modules`;
      await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowForm(false); load();
    } catch {}
    setSaving(false);
  };

  const remove = async (id: number) => {
    if (await globalConfirm("למחוק מודול זה? פעולה זו אינה ניתנת לביטול.")) {
      await authFetch(`${API}/platform/modules/${id}`, { method: "DELETE" }); load();
    }
  };

  const kpis = [
    { label: "מודולים", value: fmt(modules.length), icon: Package, color: "text-blue-400" },
    { label: "פעילים", value: fmt(modules.filter(m => m.status === "active").length), icon: CheckCircle2, color: "text-green-400" },
    { label: "כלי בנייה", value: fmt(CARDS.length), icon: Blocks, color: "text-violet-400" },
    { label: "ישויות", value: fmt(modules.reduce((s: number, m: any) => s + (m.entities_count || 0), 0)), icon: Database, color: "text-cyan-400" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2"><Blocks className="text-violet-400 w-6 h-6" /> עורך פריסה — מודולים ושדות</h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול מודולים, ישויות, שדות וכלי בנייה</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown data={filteredModules} headers={{ name: "שם", slug: "מזהה", status: "סטטוס", entities_count: "ישויות" }} filename="modules" />
          {activeTab === "modules" && (
            <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium"><Plus className="w-4 h-4" /> מודול חדש</button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-card border border-border/50 rounded-2xl p-4">
            <kpi.icon className={`${kpi.color} w-5 h-5 mb-2`} /><div className="text-xl font-bold text-foreground">{kpi.value}</div><div className="text-xs text-muted-foreground">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <div className="flex gap-1">
          {[{ id: "cards", label: "כלי בנייה" }, { id: "modules", label: "ניהול מודולים" }].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${activeTab === tab.id ? "bg-primary/10 text-primary border border-primary/20" : "text-muted-foreground hover:bg-muted/30"}`}>{tab.label}</button>
          ))}
        </div>
      </div>

      {activeTab === "cards" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCards.map(item => (
            <Link key={item.href} href={item.href}>
              <div className="group relative bg-card border border-border/50 rounded-2xl p-5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 cursor-pointer">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${item.color} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
                  <item.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold text-sm text-foreground mb-1">{item.label}</h3>
                <p className="text-xs text-muted-foreground">{item.description}</p>
                <div className="absolute top-3 left-3 opacity-0 group-hover:opacity-100 transition-opacity"><ChevronLeft className="w-4 h-4 text-primary" /></div>
              </div>
            </Link>
          ))}
          {filteredCards.length === 0 && (
            <div className="col-span-full text-center py-16 text-muted-foreground"><Blocks className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>לא נמצאו כלי בנייה</p></div>
          )}
        </div>
      )}

      {activeTab === "modules" && (<>
        {loading ? (
          <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
        ) : error ? (
          <div className="text-center py-16 text-red-400"><AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>{error}</p><button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button></div>
        ) : filteredModules.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground"><Package className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>אין מודולים</p><p className="text-sm mt-1">לחץ על מודול חדש כדי להתחיל</p></div>
        ) : (<>
          <BulkActions selectedIds={selectedIds} onClear={clear} entityName="מודולים" actions={defaultBulkActions(selectedIds, clear, load, `${API}/platform/modules`)} />
          <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border/50"><tr>
                <th className="px-2 py-3 w-10"><BulkCheckbox allIds={filteredModules.map((r: any) => r.id)} selectedIds={selectedIds} toggleAll={toggleAll} /></th>
                {[{ key: "name", label: "שם" }, { key: "slug", label: "מזהה" }, { key: "description", label: "תיאור" }, { key: "entities_count", label: "ישויות" }, { key: "status", label: "סטטוס" }].map(col => (
                  <th key={col.key} onClick={() => toggleSort(col.key)} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"><div className="flex items-center gap-1">{col.label}<ArrowUpDown className="w-3 h-3" /></div></th>
                ))}
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
              </tr></thead>
              <tbody>{pagination.paginate(filteredModules).map((m: any) => (
                <tr key={m.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                  <td className="px-2 py-3 w-10"><BulkCheckbox id={m.id} selectedIds={selectedIds} toggle={toggle} /></td>
                  <td className="px-4 py-3"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center"><Package className="w-5 h-5 text-primary" /></div><div className="text-foreground font-medium">{m.name}</div></div></td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{m.slug || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs max-w-[200px] truncate">{m.description || `מודול #${m.id}`}</td>
                  <td className="px-4 py-3 text-foreground font-bold">{m.entities_count || 0}</td>
                  <td className="px-4 py-3"><Badge className={`text-[10px] ${m.status === "active" ? "bg-green-500/20 text-green-400" : "bg-muted/20 text-muted-foreground"}`}>{m.status === "active" ? "פעיל" : m.status || "—"}</Badge></td>
                  <td className="px-4 py-3"><div className="flex gap-1">
                    <button onClick={() => setViewDetail(m)} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                    <button onClick={() => openEdit(m)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                    <Link href={`/builder/module/${m.id}`}><button className="p-1.5 hover:bg-muted rounded-lg"><Settings className="w-3.5 h-3.5 text-purple-400" /></button></Link>
                    <button onClick={() => remove(m.id)} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                  </div></td>
                </tr>
              ))}</tbody>
            </table>
          </div></div>
          <SmartPagination pagination={pagination} />
        </>)}
      </>)}

      <AnimatePresence>
        {viewDetail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setViewDetail(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><Package className="w-5 h-5 text-violet-400" />{viewDetail.name}</h2>
                <button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 grid grid-cols-2 gap-4">
                <DetailField label="שם מודול" value={viewDetail.name} />
                <DetailField label="מזהה (Slug)" value={viewDetail.slug} />
                <DetailField label="ישויות" value={String(viewDetail.entities_count || 0)} />
                <DetailField label="סטטוס"><Badge className={viewDetail.status === "active" ? "bg-green-500/20 text-green-400" : "bg-muted/20 text-muted-foreground"}>{viewDetail.status === "active" ? "פעיל" : viewDetail.status}</Badge></DetailField>
                <div className="col-span-2"><DetailField label="תיאור" value={viewDetail.description} /></div>
                <DetailField label="תאריך יצירה" value={viewDetail.created_at?.slice(0, 10)} />
                <DetailField label="עדכון אחרון" value={viewDetail.updated_at?.slice(0, 10)} />
              </div>
              <div className="border-t border-border">
                <div className="flex gap-2 px-5 pt-3">
                  {[{ id: "details", label: "פרטים" }, { id: "related", label: "רשומות קשורות" }, { id: "attachments", label: "קבצים" }, { id: "log", label: "לוג פעילות" }].map(tab => (
                    <button key={tab.id} onClick={() => setDetailTab(tab.id)} className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${detailTab === tab.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/30"}`}>{tab.label}</button>
                  ))}
                </div>
                <div className="p-5">
                  {detailTab === "details" && (
                    <div className="flex justify-end gap-2">
                      <button onClick={() => { setViewDetail(null); openEdit(viewDetail); }} className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm hover:bg-blue-500/30"><Edit2 className="w-3.5 h-3.5 inline ml-1" /> עריכה</button>
                      <button onClick={() => setViewDetail(null)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">סגור</button>
                    </div>
                  )}
                  {detailTab === "related" && <RelatedRecords entityType="modules" entityId={viewDetail.id} />}
                  {detailTab === "attachments" && <AttachmentsSection entityType="modules" entityId={viewDetail.id} />}
                  {detailTab === "log" && <ActivityLog entityType="modules" entityId={viewDetail.id} />}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground">{editing ? "עריכת מודול" : "מודול חדש"}</h2><button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
              <div className="p-5 space-y-4">
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">שם מודול *</label><input value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="שם מודול" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">מזהה (Slug)</label><input value={form.slug || ""} onChange={e => setForm({ ...form, slug: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="module-slug" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">תיאור</label><textarea value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm h-20 resize-none" placeholder="תיאור המודול" /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סטטוס</label>
                  <select value={form.status || "active"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                    <option value="active">פעיל</option><option value="inactive">לא פעיל</option><option value="draft">טיוטא</option>
                  </select>
                </div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
                <button onClick={save} disabled={saving || !form.name} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"><Save className="w-4 h-4" />{saving ? "שומר..." : editing ? "עדכון" : "יצירה"}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="modules" />
        <RelatedRecords entityType="modules" />
      </div>
    </div>
  );
}
