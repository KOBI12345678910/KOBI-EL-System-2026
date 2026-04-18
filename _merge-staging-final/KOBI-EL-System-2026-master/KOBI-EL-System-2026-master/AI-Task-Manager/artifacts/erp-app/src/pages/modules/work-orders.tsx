import { useState, useEffect, useMemo } from "react";
import { usePermissions } from "@/hooks/use-permissions";
import { ClipboardList, Search, Plus, Edit2, Trash2, X, Save, CheckCircle2, Clock, AlertTriangle, ArrowUpDown, Factory, DollarSign, Play, Pause, CheckSquare, Loader2, Eye , Copy } from "lucide-react";
import { SkeletonPage } from "@/components/ui/skeleton-card";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Printer, Send } from "lucide-react";
import ExportDropdown from "@/components/export-dropdown";
import { globalConfirm } from "@/components/confirm-dialog";
import { printPage, sendByEmail, generateEmailBody } from "@/lib/print-utils";
import { generatePDF } from "@/lib/pdf-utils";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { useApiAction, ActionButton } from "@/hooks/use-api-action";
import { authFetch } from "@/lib/utils";
import { NullSafe } from "@/lib/null-safety";
import { useToast } from "@/hooks/use-toast";
import { duplicateRecord } from "@/lib/duplicate-record";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";
import QRCodeDisplay from "@/components/qr-code-display";
import PhotoGallery from "@/components/photo-gallery";
import WorkOrderTemplateSelector from "@/components/work-order-template-selector";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
// J-03: Null Safety - all display values use fallbacks
const fmt = (v: any) => NullSafe.number(v, 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

interface WorkOrder { id: number; order_number: string; order_type: string; title: string; description: string; priority: string; status: string; department: string; material_type: string; assigned_to: string; assigned_team: string; customer_name: string; project_name: string; product_name: string; product_code: string; quantity_ordered: number; quantity_completed: number; quantity_rejected: number; completion_percentage: number; unit_of_measure: string; start_date: string; due_date: string; actual_start_date: string; actual_end_date: string; estimated_hours: number; actual_hours: number; material_cost: number; labor_cost: number; overhead_cost: number; total_cost: number; machine_name: string; work_center: string; notes: string; created_by_name: string; }

const typeMap: Record<string, string> = {
  cutting: "חיתוך", welding: "ריתוך", bending: "כיפוף", drilling: "קידוח",
  grinding: "השחזה", assembly: "הרכבה", glass_cutting: "חיתוך זכוכית",
  glass_fitting: "התקנת זכוכית", painting: "צביעה", powder_coating: "צביעה אבקתית",
  galvanizing: "גלווניזציה", installation: "התקנה בשטח",
  measurement: "מדידה", production: "ייצור כללי", maintenance: "תחזוקה",
  repair: "תיקון", rework: "תיקון חוזר", prototype: "אב-טיפוס", quality_check: "בדיקת איכות"
};
const departmentMap: Record<string, string> = {
  cutting: "מחלקת חיתוך", welding: "מחלקת ריתוך", assembly: "מחלקת הרכבה",
  painting: "מחלקת צביעה", glass: "מחלקת זכוכית", installation: "צוות התקנה",
  cnc: "מחלקת CNC", bending: "מחלקת כיפוף", warehouse: "מחסן",
  quality: "בקרת איכות", management: "הנהלה"
};
const materialTypeMap: Record<string, string> = {
  iron: "ברזל", aluminum: "אלומיניום", stainless_steel: "נירוסטה",
  glass: "זכוכית", combined: "משולב"
};
const priorityMap: Record<string, { label: string; color: string }> = {
  critical: { label: "קריטי", color: "bg-red-100 text-red-700" },
  high: { label: "גבוה", color: "bg-orange-100 text-orange-700" },
  medium: { label: "רגיל", color: "bg-blue-100 text-blue-700" },
  low: { label: "נמוך", color: "bg-muted/50 text-muted-foreground" }
};
const statusMap: Record<string, { label: string; color: string }> = {
  draft: { label: "טיוטה", color: "bg-muted/50 text-foreground" },
  planned: { label: "מתוכנן", color: "bg-blue-100 text-blue-700" },
  in_progress: { label: "בביצוע", color: "bg-yellow-100 text-yellow-700" },
  on_hold: { label: "מושהה", color: "bg-orange-100 text-orange-700" },
  completed: { label: "הושלם", color: "bg-green-100 text-green-700" },
  cancelled: { label: "בוטל", color: "bg-muted/50 text-muted-foreground" },
  quality_check: { label: "בדיקת איכות", color: "bg-purple-100 text-purple-700" }
};

// State machine transitions (mirrored from server)
const STATUS_TRANSITIONS: Record<string, string[]> = {
  draft:         ["planned", "cancelled"],
  planned:       ["in_progress", "on_hold", "cancelled"],
  in_progress:   ["quality_check", "on_hold", "completed", "cancelled"],
  quality_check: ["completed", "in_progress", "cancelled"],
  on_hold:       ["planned", "in_progress", "cancelled"],
  completed:     [],
  cancelled:     [],
};

// Quick action buttons per status
const QUICK_ACTIONS: Record<string, Array<{ label: string; status: string; icon: any; color: string }>> = {
  draft:         [{ label: "תכנן", status: "planned", icon: Clock, color: "bg-blue-100 text-blue-700 hover:bg-blue-200" }],
  planned:       [{ label: "התחל", status: "in_progress", icon: Play, color: "bg-yellow-100 text-yellow-700 hover:bg-yellow-200" }, { label: "השהה", status: "on_hold", icon: Pause, color: "bg-orange-100 text-orange-700 hover:bg-orange-200" }],
  in_progress:   [{ label: "לבדיקה", status: "quality_check", icon: CheckSquare, color: "bg-purple-100 text-purple-700 hover:bg-purple-200" }, { label: "השהה", status: "on_hold", icon: Pause, color: "bg-orange-100 text-orange-700 hover:bg-orange-200" }, { label: "סיים", status: "completed", icon: CheckCircle2, color: "bg-green-100 text-green-700 hover:bg-green-200" }],
  quality_check: [{ label: "אשר", status: "completed", icon: CheckCircle2, color: "bg-green-100 text-green-700 hover:bg-green-200" }, { label: "החזר", status: "in_progress", icon: Play, color: "bg-yellow-100 text-yellow-700 hover:bg-yellow-200" }],
  on_hold:       [{ label: "חדש", status: "in_progress", icon: Play, color: "bg-yellow-100 text-yellow-700 hover:bg-yellow-200" }],
};

export default function WorkOrdersPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const { toast } = useToast();
  const [items, setItems] = useState<WorkOrder[]>([]);
  const [stats, setStats] = useState<any>({});
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterDepartment, setFilterDepartment] = useState("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [sortField, setSortField] = useState("due_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<WorkOrder | null>(null);
  const [form, setForm] = useState<any>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [tableLoading, setTableLoading] = useState(true);
  const pagination = useSmartPagination(25);
  const { executeSave, executeDelete, execute, loading: actionLoading } = useApiAction();
  const token = localStorage.getItem("token") || "";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const { selectedIds, toggle, toggleAll, clear, isSelected, isAllSelected } = useBulkSelection();
  const [detailTab, setDetailTab] = useState("details");
  const [viewingItem, setViewingItem] = useState<WorkOrder | null>(null);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [showAssignEmployeeModal, setShowAssignEmployeeModal] = useState(false);
  const [availableEmployees, setAvailableEmployees] = useState<any[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);

  const load = () => {
    setTableLoading(true);
    Promise.all([
      authFetch(`${API}/work-orders`, { headers }).then(r => r.json()).then(d => setItems(safeArray(d))),
      authFetch(`${API}/work-orders/stats`, { headers }).then(r => r.json()).then(d => setStats(d || {})),
    ]).finally(() => setTableLoading(false));
  };
  useEffect(load, []);

  const filtered = useMemo(() => {
    let f = items.filter(i => {
      if (filterStatus !== "all" && i.status !== filterStatus) return false;
      if (filterType !== "all" && i.order_type !== filterType) return false;
      if (filterPriority !== "all" && i.priority !== filterPriority) return false;
      if (filterDepartment !== "all" && i.department !== filterDepartment) return false;
      if (filterDateFrom && i.due_date && i.due_date.slice(0, 10) < filterDateFrom) return false;
      if (filterDateTo && i.due_date && i.due_date.slice(0, 10) > filterDateTo) return false;
      if (search) {
        const s = search.toLowerCase();
        return (
          i.order_number?.toLowerCase().includes(s) ||
          i.title?.toLowerCase().includes(s) ||
          i.assigned_to?.toLowerCase().includes(s) ||
          i.product_name?.toLowerCase().includes(s) ||
          i.customer_name?.toLowerCase().includes(s) ||
          i.project_name?.toLowerCase().includes(s)
        );
      }
      return true;
    });
    f.sort((a: any, b: any) => {
      const av = a[sortField], bv = b[sortField];
      const cmp = typeof av === "number" ? av - bv : String(av || "").localeCompare(String(bv || ""));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return f;
  }, [items, search, filterStatus, filterType, filterPriority, filterDepartment, filterDateFrom, filterDateTo, sortField, sortDir]);

  const openCreate = () => {
    setEditing(null);
    setErrors({});
    setForm({ orderType: "cutting", priority: "medium", status: "draft", startDate: new Date().toISOString().slice(0, 10), unitOfMeasure: "יחידה", materialType: "", department: "" });
    setShowForm(true);
  };
  const openEdit = (r: WorkOrder) => {
    setEditing(r);
    setErrors({});
    setForm({
      orderType: r.order_type, title: r.title, description: r.description,
      priority: r.priority, status: r.status, department: r.department,
      materialType: r.material_type, assignedTo: r.assigned_to, assignedTeam: r.assigned_team,
      customerName: r.customer_name, projectName: r.project_name,
      productName: r.product_name, productCode: r.product_code,
      quantityOrdered: r.quantity_ordered, quantityCompleted: r.quantity_completed,
      quantityRejected: r.quantity_rejected, unitOfMeasure: r.unit_of_measure,
      startDate: r.start_date?.slice(0, 10), dueDate: r.due_date?.slice(0, 10),
      estimatedHours: r.estimated_hours, actualHours: r.actual_hours,
      materialCost: r.material_cost, laborCost: r.labor_cost, overheadCost: r.overhead_cost,
      machineName: r.machine_name, workCenter: r.work_center, notes: r.notes
    });
    setShowForm(true);
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.title?.trim()) errs.title = "כותרת היא שדה חובה";
    if (!form.dueDate) errs.dueDate = "תאריך יעד הוא שדה חובה";
    const qty = parseFloat(form.quantityOrdered);
    if (isNaN(qty) || qty <= 0) errs.quantityOrdered = "כמות מוזמנת חייבת להיות מספר חיובי";
    if (form.startDate && form.dueDate && form.dueDate < form.startDate) errs.dueDate = "תאריך יעד חייב להיות אחרי תאריך התחלה";
    if (form.materialCost && parseFloat(form.materialCost) < 0) errs.materialCost = "עלות לא יכולה להיות שלילית";
    if (form.laborCost && parseFloat(form.laborCost) < 0) errs.laborCost = "עלות לא יכולה להיות שלילית";
    if (form.overheadCost && parseFloat(form.overheadCost) < 0) errs.overheadCost = "עלות לא יכולה להיות שלילית";
    if (form.estimatedHours && parseFloat(form.estimatedHours) < 0) errs.estimatedHours = "שעות לא יכולות להיות שליליות";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    const url = editing ? `${API}/work-orders/${editing.id}` : `${API}/work-orders`;
    await executeSave(() => authFetch(url, { method: editing ? "PUT" : "POST", headers, body: JSON.stringify(form) }), !!editing, { successMessage: editing ? "הוראת עבודה עודכנה" : "הוראת עבודה נוצרה", onSuccess: () => { setShowForm(false); load(); } });
  };

  const remove = async (id: number) => {
    await executeDelete(() => authFetch(`${API}/work-orders/${id}`, { method: "DELETE", headers }), { confirm: "למחוק הוראת עבודה? ניתן למחוק רק הוראות בסטטוס טיוטה.", successMessage: "הוראת עבודה נמחקה", onSuccess: load });
  };

  const quickStatusChange = async (id: number, newStatus: string) => {
    await execute(() => authFetch(`${API}/work-orders/${id}`, { method: "PUT", headers, body: JSON.stringify({ status: newStatus }) }), { successMessage: "סטטוס שונה בהצלחה", onSuccess: load });
  };

  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("desc"); } };

  const kpis = [
    { label: "סה\"כ הוראות", value: fmt(stats.total || 0), icon: ClipboardList, color: "text-blue-600" },
    { label: "טיוטות", value: fmt(stats.drafts || 0), icon: Clock, color: "text-muted-foreground" },
    { label: "מתוכננות", value: fmt(stats.planned || 0), icon: Clock, color: "text-blue-600" },
    { label: "בביצוע", value: fmt(stats.in_progress || 0), icon: Factory, color: "text-yellow-600" },
    { label: "הושלמו", value: fmt(stats.completed || 0), icon: CheckCircle2, color: "text-green-600" },
    { label: "מושהות", value: fmt(stats.on_hold || 0), icon: AlertTriangle, color: "text-orange-600" },
    { label: "קריטיות", value: fmt(stats.critical || 0), icon: AlertTriangle, color: "text-red-600" },
    { label: "עלות כוללת", value: `₪${fmt(stats.total_cost || 0)}`, icon: DollarSign, color: "text-purple-600" },
  ];

  if (tableLoading && items.length === 0) return <SkeletonPage />;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold flex items-center gap-2"><Factory className="text-amber-600" /> הוראות עבודה - מפעל מסגרות</h1>
          <p className="text-muted-foreground mt-1">ניהול הוראות חיתוך, ריתוך, כיפוף, הרכבה, צביעה, זכוכית והתקנה</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown data={items} headers={{ order_number: "מספר", order_type: "סוג", title: "כותרת", customer_name: "לקוח", project_name: "פרויקט", department: "מחלקה", priority: "עדיפות", status: "סטטוס", assigned_to: "אחראי", product_name: "מוצר", quantity_ordered: "כמות", completion_percentage: "% השלמה", due_date: "תאריך יעד", total_cost: "עלות" }} filename={"work_orders"} />
          <button onClick={() => printPage("הוראות עבודה")} className="flex items-center gap-1.5 bg-muted text-foreground px-3 py-2 rounded-lg hover:bg-slate-600 text-sm"><Printer size={16} /> הדפסה</button>
          <button onClick={() => sendByEmail("הוראות עבודה - טכנו-כל עוזי", generateEmailBody("הוראות עבודה", items, { order_number: "מספר", title: "כותרת", priority: "עדיפות", status: "סטטוס", due_date: "יעד" }))} className="flex items-center gap-1.5 bg-muted text-foreground px-3 py-2 rounded-lg hover:bg-slate-600 text-sm"><Send size={16} /> שליחה</button>
          <button onClick={openCreate} className="flex items-center gap-2 bg-amber-600 text-foreground px-3 py-2 rounded-lg hover:bg-amber-700 shadow-lg text-sm"><Plus size={16} /> הוראה חדשה</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {kpis.map((kpi, i) => (
          <motion.div key={`wo-kpi-${i}`} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-card rounded-xl shadow-sm border p-3">
            <kpi.icon className={`${kpi.color} mb-1`} size={20} />
            <div className="text-lg font-bold">{kpi.value}</div>
            <div className="text-xs text-muted-foreground">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px]">
          <Search className="absolute right-3 top-2.5 text-muted-foreground" size={18} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש (מספר, כותרת, לקוח, פרויקט, אחראי, מוצר)..." className="w-full pr-10 pl-4 py-2 border rounded-lg" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="border rounded-lg px-3 py-2">
          <option value="all">כל הסטטוסים</option>
          {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="border rounded-lg px-3 py-2">
          <option value="all">כל הסוגים</option>
          {Object.entries(typeMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className="border rounded-lg px-3 py-2">
          <option value="all">כל העדיפויות</option>
          {Object.entries(priorityMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterDepartment} onChange={e => setFilterDepartment(e.target.value)} className="border rounded-lg px-3 py-2">
          <option value="all">כל המחלקות</option>
          {Object.entries(departmentMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" title="מתאריך יעד" placeholder="מתאריך" />
        <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" title="עד תאריך יעד" placeholder="עד תאריך" />
        {(filterDateFrom || filterDateTo || filterPriority !== "all" || filterDepartment !== "all") && (
          <button onClick={() => { setFilterDateFrom(""); setFilterDateTo(""); setFilterPriority("all"); setFilterDepartment("all"); }} className="px-3 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50">נקה סינון</button>
        )}
      </div>

      <BulkActions selectedIds={selectedIds} onClear={clear} entityName="הוראות עבודה" actions={defaultBulkActions(selectedIds, clear, load, `${API}/work-orders`)} />

      <div className="bg-card rounded-xl shadow-sm border overflow-x-auto relative">
        {tableLoading && (
          <div className="absolute inset-0 bg-card/60 backdrop-blur-[1px] flex items-center justify-center z-10">
            <div className="flex items-center gap-2 bg-card border rounded-lg px-4 py-2 shadow-lg"><Loader2 className="w-4 h-4 animate-spin text-amber-600" /><span className="text-sm">טוען נתונים...</span></div>
          </div>
        )}
        <table className="w-full text-sm">
          <thead className="bg-muted/30 border-b">
            <tr>
              <th className="px-3 py-3 text-right w-10">
                <BulkCheckbox checked={isAllSelected(filtered.map(r => r.id))} onChange={() => toggleAll(filtered.map(r => r.id))} />
              </th>
              {[
                { key: "order_number", label: "מספר" },
                { key: "order_type", label: "סוג" },
                { key: "title", label: "כותרת" },
                { key: "customer_name", label: "לקוח" },
                { key: "project_name", label: "פרויקט" },
                { key: "department", label: "מחלקה" },
                { key: "priority", label: "עדיפות" },
                { key: "assigned_to", label: "אחראי" },
                { key: "quantity_ordered", label: "כמות" },
                { key: "completion_percentage", label: "% השלמה" },
                { key: "due_date", label: "יעד" },
                { key: "status", label: "סטטוס" },
              ].map(col => (
                <th key={col.key} className="px-3 py-3 text-right cursor-pointer hover:bg-muted/50" onClick={() => toggleSort(col.key)}>
                  <div className="flex items-center gap-1">{col.label} <ArrowUpDown size={12} /></div>
                </th>
              ))}
              <th className="px-3 py-3 text-right">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={14} className="text-center py-8 text-muted-foreground">אין הוראות עבודה</td></tr>
            ) : pagination.paginate(filtered).map(r => (
              <tr key={r.id} className={`border-b hover:bg-amber-50/30 ${isSelected(r.id) ? "bg-amber-50/50" : ""}`}>
                <td className="px-3 py-2"><BulkCheckbox checked={isSelected(r.id)} onChange={() => toggle(r.id)} /></td>
                <td className="px-3 py-2 font-mono text-amber-600 font-bold">{r.order_number}</td>
                <td className="px-3 py-2">{typeMap[r.order_type] || r.order_type}</td>
                <td className="px-3 py-2 font-medium max-w-[160px] truncate" title={r.title}>{r.title}</td>
                <td className="px-3 py-2 max-w-[120px] truncate text-muted-foreground" title={r.customer_name}>{r.customer_name || "-"}</td>
                <td className="px-3 py-2 max-w-[120px] truncate text-muted-foreground" title={r.project_name}>{r.project_name || "-"}</td>
                <td className="px-3 py-2 text-muted-foreground">{departmentMap[r.department] || r.department || "-"}</td>
                <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full text-xs ${priorityMap[r.priority]?.color || "bg-muted/50"}`}>{priorityMap[r.priority]?.label || r.priority}</span></td>
                <td className="px-3 py-2">{r.assigned_to || "-"}</td>
                <td className="px-3 py-2">{r.quantity_completed}/{r.quantity_ordered} {r.unit_of_measure}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="w-16 bg-muted rounded-full h-2"><div className="bg-amber-500 h-2 rounded-full" style={{ width: `${Math.min(Number(r.completion_percentage || 0), 100)}%` }} /></div>
                    <span className="text-xs font-bold">{Number(r.completion_percentage || 0).toFixed(0)}%</span>
                  </div>
                </td>
                <td className="px-3 py-2">{r.due_date?.slice(0, 10) || "-"}</td>
                <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full text-xs ${statusMap[r.status]?.color || "bg-muted/50"}`}>{statusMap[r.status]?.label || r.status}</span></td>
                <td className="px-3 py-2">
                  <div className="flex gap-1 flex-wrap">
                    {(QUICK_ACTIONS[r.status] || []).map(action => (
                      <button key={action.status} onClick={() => quickStatusChange(r.id, action.status)} title={action.label} className={`p-1 rounded text-xs flex items-center gap-0.5 ${action.color}`}>
                        <action.icon size={12} />
                      </button>
                    ))}
                    <button onClick={() => { setViewingItem(r); setDetailTab("details"); }} className="p-1 hover:bg-green-100 rounded text-green-600" title="צפייה"><Eye size={14} /></button>
                    <button onClick={() => openEdit(r)} className="p-1 hover:bg-blue-500/10 rounded" title="עריכה"><Edit2 size={14} /></button> <button title="שכפול" onClick={async () => { const res = await duplicateRecord(`${API}/work-orders`, r.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
                    {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.title || r.id}'? פעולה זו אינה ניתנת לביטול.`))remove(r.id)}} className="p-1 hover:bg-red-500/10 rounded text-red-500" title="מחיקה"><Trash2 size={14} /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <SmartPagination pagination={pagination} />

      <AnimatePresence>
        {viewingItem && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 overflow-y-auto p-4" onClick={() => setViewingItem(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border text-foreground rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto my-8" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 border-b border-slate-100 sticky top-0 bg-card rounded-t-2xl z-10">
                <div>
                  <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><Factory size={20} className="text-amber-600" /> {viewingItem.order_number}</h2>
                  <div className="flex gap-2 mt-1">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusMap[viewingItem.status]?.color || "bg-muted/50"}`}>{statusMap[viewingItem.status]?.label || viewingItem.status}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs ${priorityMap[viewingItem.priority]?.color || "bg-muted/50"}`}>{priorityMap[viewingItem.priority]?.label || viewingItem.priority}</span>
                  </div>
                </div>
                <button onClick={() => setViewingItem(null)} className="p-1 hover:bg-muted/50 rounded-lg"><X size={20} /></button>
              </div>
              <div className="flex gap-1 px-4 pt-3 border-b border-slate-100 overflow-x-auto">
                {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"attachments",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(tab => (
                  <button key={tab.key} onClick={() => setDetailTab(tab.key)} className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${detailTab === tab.key ? "bg-amber-50 text-amber-700 border-b-2 border-amber-500" : "text-muted-foreground hover:text-foreground"}`}>{tab.label}</button>
                ))}
              </div>
              <div className="p-5 space-y-4">
                {detailTab === "details" && (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {[
                        { label: "כותרת", value: viewingItem.title },
                        { label: "סוג", value: typeMap[viewingItem.order_type] || viewingItem.order_type },
                        { label: "מחלקה", value: departmentMap[viewingItem.department] || viewingItem.department },
                        { label: "חומר", value: materialTypeMap[viewingItem.material_type] || viewingItem.material_type },
                        { label: "אחראי", value: viewingItem.assigned_to },
                        { label: "צוות", value: viewingItem.assigned_team },
                        { label: "לקוח", value: viewingItem.customer_name },
                        { label: "פרויקט", value: viewingItem.project_name },
                        { label: "מוצר", value: viewingItem.product_name },
                        { label: "קוד מוצר", value: viewingItem.product_code },
                        { label: "מכונה", value: viewingItem.machine_name },
                        { label: "עמדת עבודה", value: viewingItem.work_center },
                      ].filter(f => f.value).map((f, i) => (
                        <div key={i} className="bg-muted/30 rounded-lg p-2">
                          <div className="text-xs text-muted-foreground">{f.label}</div>
                          <div className="font-medium text-sm text-foreground">{f.value}</div>
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="bg-blue-50 rounded-lg p-3 text-center border border-blue-200">
                        <div className="text-xs text-blue-600">כמות</div>
                        <div className="font-bold text-foreground">{viewingItem.quantity_completed}/{viewingItem.quantity_ordered} {viewingItem.unit_of_measure}</div>
                      </div>
                      <div className="bg-amber-50 rounded-lg p-3 text-center border border-amber-200">
                        <div className="text-xs text-amber-600">השלמה</div>
                        <div className="font-bold text-foreground">{Number(viewingItem.completion_percentage || 0).toFixed(0)}%</div>
                      </div>
                      <div className="bg-green-50 rounded-lg p-3 text-center border border-green-200">
                        <div className="text-xs text-green-600">עלות כוללת</div>
                        <div className="font-bold text-foreground">{fmt(viewingItem.total_cost)} ₪</div>
                      </div>
                      <div className="bg-purple-50 rounded-lg p-3 text-center border border-purple-200">
                        <div className="text-xs text-purple-600">שעות</div>
                        <div className="font-bold text-foreground">{viewingItem.actual_hours || 0}/{viewingItem.estimated_hours || 0}</div>
                      </div>
                    </div>
                    {viewingItem.description && (
                      <div className="bg-muted/30 rounded-xl p-4 border border-border">
                        <h4 className="font-bold text-sm text-foreground mb-1">תיאור</h4>
                        <p className="text-sm text-muted-foreground">{viewingItem.description}</p>
                      </div>
                    )}
                    {viewingItem.notes && (
                      <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-200">
                        <h4 className="font-bold text-sm text-yellow-700 mb-1">הערות</h4>
                        <p className="text-sm text-foreground">{viewingItem.notes}</p>
                      </div>
                    )}
                    <QRCodeDisplay 
                      value={`${window.location.origin}/work-orders/${viewingItem.id}`}
                      title="QR Code - הוראת עבודה"
                      size={256}
                    />
                    <PhotoGallery 
                      photos={[]}
                      readOnly={true}
                    />
                  </>
                )}
                {detailTab === "related" && <RelatedRecords entityType="work-orders" entityId={viewingItem.id} />}
                {detailTab === "attachments" && <AttachmentsSection entityType="work-orders" entityId={viewingItem.id} />}
                {detailTab === "history" && <ActivityLog entityType="work-orders" entityId={viewingItem.id} />}
              </div>
              <div className="flex items-center gap-2 p-4 border-t border-slate-200 justify-end">
                <button onClick={async () => {
                  const employees = await authFetch(`${API}/employees`, { headers }).then(r => r.json()).then(d => safeArray(d));
                  setAvailableEmployees(employees);
                  setShowAssignEmployeeModal(true);
                }} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-foreground rounded-lg text-sm font-medium">
                  שייך עובד
                </button>
                <button onClick={() => generatePDF({
                  type: "work-order",
                  number: viewingItem.order_number,
                  date: viewingItem.start_date ? new Date(viewingItem.start_date).toLocaleDateString("he-IL") : new Date().toISOString().slice(0, 10),
                  customer: {
                    name: viewingItem.customer_name || "",
                    phone: "",
                    email: "",
                    address: ""
                  },
                  items: [{ description: viewingItem.product_name || viewingItem.title || "", quantity: viewingItem.quantity_ordered || 1, unit_price: Math.round((viewingItem.material_cost || 0) * 100), total: Math.round((viewingItem.total_cost || 0) * 100) }],
                  subtotal: Math.round((viewingItem.material_cost || 0) * 100),
                  vat_amount: 0,
                  total: Math.round((viewingItem.total_cost || 0) * 100)
                })} className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-foreground rounded-lg text-sm font-medium">
                  <Download className="w-4 h-4" />PDF
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAssignEmployeeModal && viewingItem && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowAssignEmployeeModal(false)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center p-4 border-b border-border">
                <h2 className="text-lg font-bold">שייך עובד להזמנה {viewingItem.order_number}</h2>
                <button onClick={() => setShowAssignEmployeeModal(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-4 space-y-3">
                <div className="text-sm text-muted-foreground mb-3">בחר עובד מהרשימה להשמת לסטטוס:</div>
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {availableEmployees.length === 0 ? (
                    <div className="text-sm text-muted-foreground py-4 text-center">אין עובדים זמינים</div>
                  ) : (
                    availableEmployees.map((emp) => (
                      <button key={emp.id} onClick={() => setSelectedEmployeeId(String(emp.id))} className={`w-full text-left p-3 rounded-lg border-2 transition-colors ${selectedEmployeeId === String(emp.id) ? "border-blue-500 bg-blue-500/10" : "border-border hover:border-muted-foreground"}`}>
                        <div className="font-medium">{emp.full_name || emp.name}</div>
                        <div className="text-sm text-muted-foreground">{emp.position || "—"}</div>
                      </button>
                    ))
                  )}
                </div>
              </div>
              <div className="flex gap-2 p-4 border-t border-border justify-end">
                <button onClick={() => setShowAssignEmployeeModal(false)} className="btn btn-outline btn-sm">ביטול</button>
                <button onClick={async () => {
                  if (!selectedEmployeeId || !availableEmployees.length) return;
                  const selectedEmp = availableEmployees.find(e => String(e.id) === selectedEmployeeId);
                  if (!selectedEmp) return;
                  try {
                    await authFetch(`${API}/work-orders/${viewingItem.id}`, {
                      method: "PUT",
                      headers,
                      body: JSON.stringify({ assigned_to: selectedEmp.full_name || selectedEmp.name })
                    });
                    toast({
                      title: "עובד שובץ בהצלחה",
                      description: `${selectedEmp.full_name || selectedEmp.name} שובץ להזמנה ${viewingItem.order_number}`,
                      variant: "default"
                    });
                    load();
                    setShowAssignEmployeeModal(false);
                    setViewingItem(null);
                  } catch (error) {
                    toast({
                      title: "שגיאה בשיוך עובד",
                      description: "אנא נסה שנית",
                      variant: "destructive"
                    });
                  }
                }} disabled={!selectedEmployeeId} className="btn btn-primary btn-sm">שייך עובד</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-card border border-border text-foreground rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">{editing ? "עריכת הוראה" : "הוראת עבודה חדשה"}</h2>
                <div className="flex gap-2">
                  {!editing && (
                    <button
                      onClick={() => setShowTemplateSelector(true)}
                      className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200 text-sm font-medium"
                    >
                      ⚡ תבנית
                    </button>
                  )}
                  <button onClick={() => setShowForm(false)}><X size={20} /></button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1">כותרת <span className="text-red-500">*</span></label>
                  <input value={form.title || ""} onChange={e => setForm({ ...form, title: e.target.value })} className={`w-full border rounded-lg px-3 py-2 ${errors.title ? "border-red-400" : ""}`} />
                  {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title}</p>}
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1">תיאור</label>
                  <textarea value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} className="w-full border rounded-lg px-3 py-2" placeholder="תיאור מפורט של העבודה..." />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">סוג עבודה</label>
                  <select value={form.orderType || "production"} onChange={e => setForm({ ...form, orderType: e.target.value })} className="w-full border rounded-lg px-3 py-2">
                    {Object.entries(typeMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">עדיפות</label>
                  <select value={form.priority || "medium"} onChange={e => setForm({ ...form, priority: e.target.value })} className="w-full border rounded-lg px-3 py-2">
                    {Object.entries(priorityMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">סטטוס</label>
                  <select value={form.status || "draft"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full border rounded-lg px-3 py-2">
                    {editing ? (
                      // When editing, only show valid transitions from current status
                      [form.status, ...(STATUS_TRANSITIONS[form.status] || [])].map(s => (
                        <option key={s} value={s}>{statusMap[s]?.label || s}</option>
                      ))
                    ) : (
                      Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">מחלקה</label>
                  <select value={form.department || ""} onChange={e => setForm({ ...form, department: e.target.value })} className="w-full border rounded-lg px-3 py-2">
                    <option value="">בחר מחלקה...</option>
                    {Object.entries(departmentMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">סוג חומר</label>
                  <select value={form.materialType || ""} onChange={e => setForm({ ...form, materialType: e.target.value })} className="w-full border rounded-lg px-3 py-2">
                    <option value="">בחר חומר...</option>
                    {Object.entries(materialTypeMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">אחראי</label>
                  <input value={form.assignedTo ?? ""} onChange={e => setForm({ ...form, assignedTo: e.target.value })} className="w-full border rounded-lg px-3 py-2" placeholder="שם העובד האחראי" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">צוות</label>
                  <input value={form.assignedTeam ?? ""} onChange={e => setForm({ ...form, assignedTeam: e.target.value })} className="w-full border rounded-lg px-3 py-2" placeholder="צוות חיתוך / ריתוך / הרכבה" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">שם לקוח</label>
                  <input value={form.customerName ?? ""} onChange={e => setForm({ ...form, customerName: e.target.value })} className="w-full border rounded-lg px-3 py-2" placeholder="שם הלקוח" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">פרויקט</label>
                  <input value={form.projectName ?? ""} onChange={e => setForm({ ...form, projectName: e.target.value })} className="w-full border rounded-lg px-3 py-2" placeholder="שם הפרויקט" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">מוצר</label>
                  <input value={form.productName ?? ""} onChange={e => setForm({ ...form, productName: e.target.value })} className="w-full border rounded-lg px-3 py-2" placeholder="שער / מעקה / גדר / סורג" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">קוד מוצר</label>
                  <input value={form.productCode ?? ""} onChange={e => setForm({ ...form, productCode: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">כמות מוזמנת <span className="text-red-500">*</span></label>
                  <input type="number" step="0.01" min="0.01" value={form.quantityOrdered ?? ""} onChange={e => setForm({ ...form, quantityOrdered: e.target.value })} className={`w-full border rounded-lg px-3 py-2 ${errors.quantityOrdered ? "border-red-400" : ""}`} />
                  {errors.quantityOrdered && <p className="text-red-500 text-xs mt-1">{errors.quantityOrdered}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">כמות שהושלמה</label>
                  <input type="number" step="0.01" min="0" value={form.quantityCompleted ?? ""} onChange={e => setForm({ ...form, quantityCompleted: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">כמות שנפסלה</label>
                  <input type="number" step="0.01" min="0" value={form.quantityRejected ?? ""} onChange={e => setForm({ ...form, quantityRejected: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">יח׳ מידה</label>
                  <select value={form.unitOfMeasure || "יחידה"} onChange={e => setForm({ ...form, unitOfMeasure: e.target.value })} className="w-full border rounded-lg px-3 py-2">
                    <option value="יחידה">יחידה</option>
                    <option value="מ״ר">מ״ר</option>
                    <option value="מטר">מטר</option>
                    <option value="ק״ג">ק״ג</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">תאריך התחלה</label>
                  <input type="date" value={form.startDate || ""} onChange={e => setForm({ ...form, startDate: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">תאריך יעד <span className="text-red-500">*</span></label>
                  <input type="date" value={form.dueDate || ""} onChange={e => setForm({ ...form, dueDate: e.target.value })} className={`w-full border rounded-lg px-3 py-2 ${errors.dueDate ? "border-red-400" : ""}`} />
                  {errors.dueDate && <p className="text-red-500 text-xs mt-1">{errors.dueDate}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">שעות מוערכות</label>
                  <input type="number" step="0.5" min="0" value={form.estimatedHours ?? ""} onChange={e => setForm({ ...form, estimatedHours: e.target.value })} className={`w-full border rounded-lg px-3 py-2 ${errors.estimatedHours ? "border-red-400" : ""}`} />
                  {errors.estimatedHours && <p className="text-red-500 text-xs mt-1">{errors.estimatedHours}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">שעות בפועל</label>
                  <input type="number" step="0.5" min="0" value={form.actualHours ?? ""} onChange={e => setForm({ ...form, actualHours: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">עלות חומרים ₪</label>
                  <input type="number" step="0.01" min="0" value={form.materialCost ?? ""} onChange={e => setForm({ ...form, materialCost: e.target.value })} className={`w-full border rounded-lg px-3 py-2 ${errors.materialCost ? "border-red-400" : ""}`} />
                  {errors.materialCost && <p className="text-red-500 text-xs mt-1">{errors.materialCost}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">עלות עבודה ₪</label>
                  <input type="number" step="0.01" min="0" value={form.laborCost ?? ""} onChange={e => setForm({ ...form, laborCost: e.target.value })} className={`w-full border rounded-lg px-3 py-2 ${errors.laborCost ? "border-red-400" : ""}`} />
                  {errors.laborCost && <p className="text-red-500 text-xs mt-1">{errors.laborCost}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">עלות תקורה ₪</label>
                  <input type="number" step="0.01" min="0" value={form.overheadCost ?? ""} onChange={e => setForm({ ...form, overheadCost: e.target.value })} className={`w-full border rounded-lg px-3 py-2 ${errors.overheadCost ? "border-red-400" : ""}`} />
                  {errors.overheadCost && <p className="text-red-500 text-xs mt-1">{errors.overheadCost}</p>}
                </div>
                <div className="col-span-2 bg-muted/30 rounded-lg p-3 text-sm">
                  <span className="font-medium">עלות כוללת מחושבת: </span>
                  <span className="text-amber-700 font-bold">
                    ₪{fmt((parseFloat(form.materialCost) || 0) + (parseFloat(form.laborCost) || 0) + (parseFloat(form.overheadCost) || 0))}
                  </span>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">מכונה</label>
                  <input value={form.machineName ?? ""} onChange={e => setForm({ ...form, machineName: e.target.value })} className="w-full border rounded-lg px-3 py-2" placeholder="מסור / מכופף / מכונת ריתוך" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">עמדת עבודה</label>
                  <input value={form.workCenter ?? ""} onChange={e => setForm({ ...form, workCenter: e.target.value })} className="w-full border rounded-lg px-3 py-2" placeholder="עמדה 1 / עמדה 2" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1">הערות</label>
                  <textarea value={form.notes ?? ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full border rounded-lg px-3 py-2" placeholder="הערות מיוחדות, מידות, גימור נדרש..." />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={save} className="flex items-center gap-2 bg-amber-600 text-foreground px-6 py-2 rounded-lg hover:bg-amber-700"><Save size={16} /> {editing ? "עדכון" : "שמירה"}</button>
                <button onClick={() => setShowForm(false)} className="px-6 py-2 border rounded-lg hover:bg-muted/30">ביטול</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showTemplateSelector && (
          <WorkOrderTemplateSelector
            onSelect={(templateData) => {
              setForm({ ...form, ...templateData });
            }}
            onClose={() => setShowTemplateSelector(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
