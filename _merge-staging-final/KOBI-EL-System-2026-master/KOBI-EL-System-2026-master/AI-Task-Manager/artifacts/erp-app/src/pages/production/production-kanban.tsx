import { useState, useEffect, useMemo } from "react";
import {
  Columns, Plus, Clock, AlertTriangle, CheckCircle2, PlayCircle, RefreshCw, X, Search,
  Eye, Edit2, Trash2, ArrowUpDown, Save, Package, Users, Calendar
} from "lucide-react";
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
import AttachmentsSection from "@/components/attachments-section";
import StatusTransition from "@/components/status-transition";
import { WritePermissionGate } from "@/components/permission-gate";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : d?.data || d?.items || d?.rows || [];
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");

const DetailField = ({ label, value, children }: any) => (
  <div><span className="text-xs text-muted-foreground">{label}</span><div className="text-sm text-foreground mt-0.5">{children || value || "—"}</div></div>
);

const COLUMNS = [
  { id: "draft", label: "משימות פתוחות", dot: "bg-slate-400", badge: "bg-muted/20 text-muted-foreground" },
  { id: "planned", label: "מתוכנן", dot: "bg-blue-400", badge: "bg-blue-500/20 text-blue-400" },
  { id: "in_progress", label: "בביצוע", dot: "bg-amber-400", badge: "bg-amber-500/20 text-amber-400" },
  { id: "quality_check", label: "בקרת איכות", dot: "bg-purple-400", badge: "bg-purple-500/20 text-purple-400" },
  { id: "completed", label: "הושלם", dot: "bg-green-500", badge: "bg-green-500/20 text-green-400" },
];

const priorityMap: Record<string, { label: string; color: string }> = {
  critical: { label: "קריטי", color: "bg-red-500/20 text-red-400" },
  high: { label: "גבוה", color: "bg-orange-500/20 text-orange-400" },
  normal: { label: "רגיל", color: "bg-blue-500/20 text-blue-400" },
  low: { label: "נמוך", color: "bg-muted/20 text-muted-foreground" },
};

const kanbanStatuses = COLUMNS.map(c => ({ key: c.id, label: c.label, color: c.badge }));
const kanbanTransitions = [
  { from: "draft", to: "planned", label: "תכנן" },
  { from: "planned", to: "in_progress", label: "התחל ביצוע" },
  { from: "in_progress", to: "quality_check", label: "שלח לבקרת איכות" },
  { from: "quality_check", to: "completed", label: "סיים", requireConfirm: true },
  { from: "quality_check", to: "in_progress", label: "החזר לביצוע" },
];

export default function ProductionKanbanPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [cards, setCards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPriority, setFilterPriority] = useState("all");
  const [viewDetail, setViewDetail] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ product_name: "", customer_name: "", priority: "normal", assigned_to: "", due_date: "", quantity_ordered: 1, notes: "" });
  const [detailTab, setDetailTab] = useState("details");
  const pagination = useSmartPagination(100);
  const { selectedIds, setSelectedIds, toggle, toggleAll, isSelected } = useBulkSelection();

  const validation = useFormValidation({
    product_name: { required: true, minLength: 2, message: "שם מוצר חובה" },
  });

  const filteredCards = useMemo(() => {
    let data = cards;
    if (searchTerm) data = data.filter(c => [c.product_name, c.customer_name, c.order_number, c.assigned_to].some(f => f?.toLowerCase().includes(searchTerm.toLowerCase())));
    if (filterPriority !== "all") data = data.filter(c => c.priority === filterPriority);
    pagination.setTotalItems(data.length);
    return data;
  }, [cards, searchTerm, filterPriority]);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const r = await authFetch(`${API}/work-orders`);
      if (r.ok) setCards(safeArray(await r.json()));
    } catch (e: any) { setError(e.message || "שגיאה בטעינת נתונים"); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const moveCard = async (cardId: string, newColumn: string) => {
    setCards(prev => prev.map(c => String(c.id) === cardId ? { ...c, status: newColumn } : c));
    try { await authFetch(`${API}/work-orders/${cardId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: newColumn }) }); } catch { load(); }
  };

  const openCreate = () => { setEditing(null); setForm({ product_name: "", customer_name: "", priority: "normal", assigned_to: "", due_date: "", quantity_ordered: 1, notes: "" }); validation.clearErrors(); setShowForm(true); };
  const openEdit = (card: any) => {
    setEditing(card);
    setForm({ product_name: card.product_name || "", customer_name: card.customer_name || "", priority: card.priority || "normal", assigned_to: card.assigned_to || "", due_date: card.due_date?.slice(0, 10) || "", quantity_ordered: card.quantity_ordered || 1, notes: card.notes || "" });
    validation.clearErrors();
    setShowForm(true);
  };

  const save = async () => {
    if (!validation.validate(form)) return;
    setSaving(true);
    try {
      if (editing) {
        await authFetch(`${API}/work-orders/${editing.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productName: form.product_name, customerName: form.customer_name, priority: form.priority, assignedTo: form.assigned_to, dueDate: form.due_date, quantityOrdered: form.quantity_ordered, notes: form.notes }) });
      } else {
        await authFetch(`${API}/work-orders`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: form.product_name, productName: form.product_name, customerName: form.customer_name, priority: form.priority, assignedTo: form.assigned_to, dueDate: form.due_date || new Date().toISOString().split("T")[0], quantityOrdered: form.quantity_ordered, status: "draft", notes: form.notes }) });
      }
      setShowForm(false); load();
    } catch {}
    setSaving(false);
  };

  const remove = async (id: number) => {
    if (await globalConfirm("למחוק הזמנת עבודה זו?")) {
      await authFetch(`${API}/work-orders/${id}`, { method: "DELETE" }); load();
    }
  };

  const handleStatusTransition = async (newStatus: string) => {
    if (!viewDetail) return;
    await authFetch(`${API}/work-orders/${viewDetail.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: newStatus }) });
    load(); setViewDetail({ ...viewDetail, status: newStatus });
  };

  const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString("he-IL") : "—";
  const pct = (c: any) => { const total = Number(c.quantity_ordered || 0); const done = Number(c.quantity_completed || 0); return total > 0 ? Math.round((done / total) * 100) : 0; };

  const draftCount = cards.filter(c => c.status === "draft").length;
  const inProgressCount = cards.filter(c => c.status === "in_progress").length;
  const qcCount = cards.filter(c => c.status === "quality_check").length;
  const completedCount = cards.filter(c => c.status === "completed").length;
  const criticalCount = cards.filter(c => c.priority === "critical" || c.priority === "high").length;

  const kpis = [
    { label: "בביצוע", value: fmt(inProgressCount), icon: PlayCircle, color: "text-amber-400" },
    { label: "מתוכנן", value: fmt(cards.filter(c => c.status === "planned").length), icon: Clock, color: "text-blue-400" },
    { label: "בקרת איכות", value: fmt(qcCount), icon: CheckCircle2, color: "text-purple-400" },
    { label: "הושלמו", value: fmt(completedCount), icon: CheckCircle2, color: "text-green-400" },
    { label: 'סה"כ', value: fmt(cards.length), icon: Columns, color: "text-foreground" },
    { label: "דחופים", value: fmt(criticalCount), icon: AlertTriangle, color: "text-red-400" },
  ];

  const relatedTabs = viewDetail ? [
    { key: "qc", label: "בדיקות איכות", icon: CheckCircle2, endpoint: `${API}/qc-inspections?workOrderId=${viewDetail.id}`, columns: [{ key: "inspection_number", label: "מספר" }, { key: "result", label: "תוצאה" }, { key: "inspector_name", label: "בודק" }], emptyMessage: "אין בדיקות" },
    { key: "materials", label: "חומרים", icon: Package, endpoint: `${API}/bom-lines/${viewDetail.id}`, columns: [{ key: "component_name", label: "רכיב" }, { key: "quantity", label: "כמות" }, { key: "unit_cost", label: "עלות" }], emptyMessage: "אין חומרים" },
  ] : [];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2"><Columns className="text-blue-400 w-6 h-6" /> Kanban Board — ייצור</h1>
          <p className="text-sm text-muted-foreground mt-1">תצוגת לוח קנבן להזמנות עבודה ייצור — {cards.length} הזמנות</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown data={cards} headers={{ order_number: "מספר", product_name: "מוצר", customer_name: "לקוח", status: "סטטוס", priority: "עדיפות", due_date: "תאריך יעד" }} filename="production_kanban" />
          <button onClick={load} className="flex items-center gap-1.5 bg-card border border-border text-muted-foreground px-3 py-2 rounded-xl text-sm hover:bg-muted"><RefreshCw className="w-4 h-4" /> רענן</button>
          <WritePermissionGate module="production">
            <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium"><Plus className="w-4 h-4" /> הזמנה חדשה</button>
          </WritePermissionGate>
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
        <div className="relative flex-1 min-w-0 max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="חיפוש הזמנה..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל העדיפויות</option>
          {Object.entries(priorityMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <span className="text-sm text-muted-foreground">{filteredCards.length} הזמנות</span>
      </div>

      <BulkActions items={filteredCards} selectedIds={selectedIds} onSelectionChange={setSelectedIds} actions={[
        defaultBulkActions.delete(async (ids) => { await Promise.allSettled(ids.map(id => authFetch(`${API}/work-orders/${id}`, { method: "DELETE" }))); load(); }),
        defaultBulkActions.export(async () => {}),
        { label: "העבר לביצוע", icon: PlayCircle, variant: "default" as const, action: async (ids: (string|number)[]) => { await Promise.allSettled(ids.map(id => authFetch(`${API}/work-orders/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "in_progress" }) }))); load(); } },
      ]} />

      {loading ? (
        <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /><span className="mr-3 text-muted-foreground">טוען נתונים...</span></div>
      ) : error ? (
        <div className="text-center py-16 text-red-400"><AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>{error}</p><button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button></div>
      ) : cards.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><Columns className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-medium">אין הזמנות עבודה</p><p className="text-sm mt-1">לחץ על הוספת הזמנה חדשה כדי להתחיל</p></div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLUMNS.map(col => {
            const colCards = filteredCards.filter(c => c.status === col.id);
            return (
              <div key={col.id}
                className={`flex-shrink-0 w-64 rounded-2xl border border-border/50 bg-card/30 p-3 min-h-[500px] ${dragOver === col.id ? "ring-2 ring-primary/50" : ""}`}
                onDragOver={e => { e.preventDefault(); setDragOver(col.id); }}
                onDragLeave={() => setDragOver(null)}
                onDrop={e => { e.preventDefault(); if (dragging) moveCard(dragging, col.id); setDragging(null); setDragOver(null); }}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2"><div className={`w-2.5 h-2.5 rounded-full ${col.dot}`} /><span className="font-semibold text-foreground text-sm">{col.label}</span></div>
                  <Badge className={`text-[10px] ${col.badge}`}>{colCards.length}</Badge>
                </div>
                <div className="space-y-2">
                  {colCards.map(card => {
                    const progress = pct(card);
                    return (
                      <motion.div key={card.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        draggable onDragStart={() => setDragging(String(card.id))} onDragEnd={() => setDragging(null)}
                        className={`bg-card border border-border/50 rounded-xl p-3 cursor-grab hover:border-border transition-colors ${dragging === String(card.id) ? "opacity-50" : ""} ${isSelected(card.id) ? "ring-2 ring-primary/50" : ""}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <BulkCheckbox checked={isSelected(card.id)} onChange={() => toggle(card.id)} />
                          <span className="font-mono text-xs text-muted-foreground">{card.order_number}</span>
                        </div>
                        <div className="font-semibold text-sm text-foreground mb-1">{card.product_name}</div>
                        <div className="text-xs text-muted-foreground mb-2">{card.customer_name || "—"}</div>
                        <div className="flex items-center justify-between mb-2">
                          <Badge className={`text-[10px] ${priorityMap[card.priority]?.color || priorityMap.normal.color}`}>{priorityMap[card.priority]?.label || card.priority || "רגיל"}</Badge>
                          <span className="text-xs text-muted-foreground">{fmtDate(card.due_date)}</span>
                        </div>
                        {card.assigned_to && <div className="text-xs text-muted-foreground mb-1">אחראי: {card.assigned_to}</div>}
                        {progress > 0 && (
                          <div><div className="bg-muted rounded-full h-1.5 mt-1"><div className="bg-primary h-1.5 rounded-full" style={{ width: `${progress}%` }} /></div><div className="text-xs text-muted-foreground text-left mt-0.5">{progress}%</div></div>
                        )}
                        <div className="flex gap-1 mt-2 justify-end">
                          <button onClick={e => { e.stopPropagation(); setDetailTab("details"); setViewDetail(card); }} className="p-1 hover:bg-muted rounded-lg"><Eye className="w-3 h-3 text-muted-foreground" /></button>
                          <WritePermissionGate module="production">
                            <button onClick={e => { e.stopPropagation(); openEdit(card); }} className="p-1 hover:bg-muted rounded-lg"><Edit2 className="w-3 h-3 text-blue-400" /></button>
                            <button onClick={e => { e.stopPropagation(); remove(card.id); }} className="p-1 hover:bg-muted rounded-lg"><Trash2 className="w-3 h-3 text-red-400" /></button>
                          </WritePermissionGate>
                        </div>
                      </motion.div>
                    );
                  })}
                  {colCards.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground text-xs border-2 border-dashed border-border/50 rounded-xl">גרור כרטיסיה לכאן</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="text-xs text-muted-foreground text-center">גרור ושחרר כרטיסיות בין עמודות לעדכון סטטוס</div>

      <AnimatePresence>
        {viewDetail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setViewDetail(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><Package className="w-5 h-5 text-blue-400" />{viewDetail.product_name}</h2>
                <button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex border-b border-border/50">
                {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                  <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                ))}
              </div>
              {detailTab === "details" && (
                <>
                  <div className="p-4"><StatusTransition currentStatus={viewDetail.status} statuses={kanbanStatuses} transitions={kanbanTransitions} onTransition={handleStatusTransition} entityId={viewDetail.id} compact /></div>
                  <div className="p-5 grid grid-cols-2 gap-4">
                    <DetailField label="מספר הזמנה" value={viewDetail.order_number} />
                    <DetailField label="מוצר" value={viewDetail.product_name} />
                    <DetailField label="לקוח" value={viewDetail.customer_name} />
                    <DetailField label="אחראי" value={viewDetail.assigned_to} />
                    <DetailField label="עדיפות"><Badge className={priorityMap[viewDetail.priority]?.color}>{priorityMap[viewDetail.priority]?.label || viewDetail.priority}</Badge></DetailField>
                    <DetailField label="סטטוס"><Badge className={COLUMNS.find(c => c.id === viewDetail.status)?.badge || ""}>{COLUMNS.find(c => c.id === viewDetail.status)?.label || viewDetail.status}</Badge></DetailField>
                    <DetailField label="תאריך יעד" value={fmtDate(viewDetail.due_date)} />
                    <DetailField label="כמות מוזמנת" value={fmt(viewDetail.quantity_ordered)} />
                    <DetailField label="כמות שהושלמה" value={fmt(viewDetail.quantity_completed)} />
                    <DetailField label="התקדמות" value={`${pct(viewDetail)}%`} />
                    <div className="col-span-2"><DetailField label="הערות" value={viewDetail.notes} /></div>
                  </div>
                </>
              )}
              {detailTab === "related" && <div className="p-4"><RelatedRecords tabs={relatedTabs} /></div>}
              {detailTab === "docs" && <div className="p-4"><AttachmentsSection entityType="work-order" entityId={viewDetail.id} /></div>}
              {detailTab === "history" && <div className="p-4"><ActivityLog entityType="work-order" entityId={viewDetail.id} /></div>}
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => { setViewDetail(null); openEdit(viewDetail); }} className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm hover:bg-blue-500/30"><Edit2 className="w-3.5 h-3.5 inline ml-1" /> עריכה</button>
                <button onClick={() => setViewDetail(null)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">סגור</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground">{editing ? "עריכת הזמנה" : "הזמנת עבודה חדשה"}</h2><button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
              <div className="p-5 space-y-4">
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5"><RequiredMark />שם מוצר</label><input className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" value={form.product_name} onChange={e => setForm({ ...form, product_name: e.target.value })} /><FormFieldError error={validation.errors.product_name} /></div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">לקוח</label><input className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" value={form.customer_name} onChange={e => setForm({ ...form, customer_name: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">עדיפות</label>
                    <select className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
                      {Object.entries(priorityMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select></div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">תאריך יעד</label><input type="date" className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">אחראי</label><input className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" value={form.assigned_to} onChange={e => setForm({ ...form, assigned_to: e.target.value })} /></div>
                  <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">כמות</label><input type="number" min={1} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" value={form.quantity_ordered} onChange={e => setForm({ ...form, quantity_ordered: Number(e.target.value) })} /></div>
                </div>
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">הערות</label><textarea className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm h-20 resize-none" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
                <button onClick={save} disabled={saving} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"><Save className="w-4 h-4" />{saving ? "שומר..." : editing ? "עדכון" : "יצירה"}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
