import { usePermissions } from "@/hooks/use-permissions";
import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { authFetch } from "@/lib/utils";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";
import { duplicateRecord } from "@/lib/duplicate-record";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";
import {
  Search, Plus, Edit2, Trash2, X, Save, ClipboardList, ChevronDown, ChevronUp,
  Eye, CheckCircle2, Clock, AlertTriangle, XCircle, Shield, BarChart3,
  DollarSign, Calendar, ArrowLeft, UserCheck, Building2, Send, FileText,
  Filter, TrendingUp, Package, AlertCircle, Flame, ArrowUpRight, Copy
} from "lucide-react";

const API = "/api";

interface PurchaseRequestItem {
  id: number; requestId: string; materialId: string | null; itemDescription: string;
  quantity: string; unit: string; estimatedPrice: string | null; currency: string;
  preferredSupplierId: string | null; notes: string | null;
}

interface PurchaseApproval {
  id: number; requestId: string; approverName: string; approvalStatus: string;
  approvalLevel: number; comments: string | null; approvedAt: string | null;
}

interface PurchaseRequest {
  id: number; requestNumber: string; title: string; requesterName: string | null;
  department: string | null; priority: string; status: string; totalEstimated: string | null;
  currency: string | null; neededBy: string | null; notes: string | null;
  approvedBy: string | null; approvedAt: string | null; createdAt: string;
  items?: PurchaseRequestItem[];
  approvals?: PurchaseApproval[];
}

interface Supplier { id: number; supplierName: string; supplierNumber: string; }
interface Material { id: number; materialNumber: string; materialName: string; unit: string; category: string; standardPrice: string | null; }

const PRIORITIES = ["נמוך", "רגיל", "גבוה", "דחוף"];
const STATUSES = ["טיוטה", "ממתין לאישור", "מאושר", "נדחה", "בוצע", "בוטל"];
const DEPARTMENTS = ["רכש", "ייצור", "הנדסה", "תחזוקה", "מחסן", "הנהלה", "מנהל פרויקטים", "בקרת איכות", "לוגיסטיקה"];
const UNITS = ["יחידה", 'מ"ר', 'מ"א', "ק״ג", "טון", "ליטר", "קרטון", "חבילה", "פלטה", "צינור", "קורה", "מטר", "סט"];

const STATUS_NORM: Record<string, string> = {
  "draft": "טיוטה", "pending": "ממתין לאישור", "approved": "מאושר",
  "rejected": "נדחה", "completed": "בוצע", "cancelled": "בוטל",
};
const PRIORITY_NORM: Record<string, string> = {
  "low": "נמוך", "normal": "רגיל", "high": "גבוה", "urgent": "דחוף",
};
function normStatus(s: string) { return STATUS_NORM[s] || s; }
function normPriority(p: string) { return PRIORITY_NORM[p] || p; }

const STATUS_COLORS: Record<string, string> = {
  "טיוטה": "bg-muted/20 text-muted-foreground",
  "ממתין לאישור": "bg-amber-500/20 text-amber-400",
  "מאושר": "bg-emerald-500/20 text-emerald-400",
  "נדחה": "bg-red-500/20 text-red-400",
  "בוצע": "bg-blue-500/20 text-blue-400",
  "בוטל": "bg-muted/20 text-muted-foreground",
};
const STATUS_ICONS: Record<string, any> = {
  "טיוטה": FileText, "ממתין לאישור": Clock, "מאושר": CheckCircle2,
  "נדחה": XCircle, "בוצע": Shield, "בוטל": XCircle,
};
const PRIORITY_COLORS: Record<string, string> = {
  "נמוך": "bg-muted/20 text-muted-foreground",
  "רגיל": "bg-blue-500/20 text-blue-400",
  "גבוה": "bg-amber-500/20 text-amber-400",
  "דחוף": "bg-red-500/20 text-red-400",
};
const PRIORITY_ICONS: Record<string, any> = {
  "נמוך": ArrowUpRight, "רגיל": ArrowUpRight, "גבוה": AlertTriangle, "דחוף": Flame,
};
const APPROVAL_STATUS_COLORS: Record<string, string> = {
  "ממתין": "bg-amber-500/20 text-amber-400",
  "מאושר": "bg-emerald-500/20 text-emerald-400",
  "נדחה": "bg-red-500/20 text-red-400",
};

interface ItemForm {
  materialId: string; itemDescription: string; quantity: string; unit: string;
  estimatedPrice: string; preferredSupplierId: string; notes: string;
}
const emptyItem: ItemForm = { materialId: "", itemDescription: "", quantity: "1", unit: "יחידה", estimatedPrice: "", preferredSupplierId: "", notes: "" };

const emptyForm = {
  requestNumber: "", title: "", requesterName: "", department: "", priority: "רגיל",
  status: "טיוטה", totalEstimated: "", currency: "ILS", neededBy: "", notes: "",
  budgetCode: "", approvedBy: "",
};


const load: any[] = [];
export default function PurchaseRequestsPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [items, setItems] = useState<ItemForm[]>([]);

  const validation = useFormValidation<typeof emptyForm>({
    requestNumber: { required: true, message: "מספר דרישה חובה" },
    title: { required: true, message: "כותרת הדרישה חובה" },
  });
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [expandedItems, setExpandedItems] = useState<Record<number, { items: PurchaseRequestItem[]; approvals: PurchaseApproval[] }>>({});
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [selectedRequest, setSelectedRequest] = useState<PurchaseRequest | null>(null);
  const [showApprovalForm, setShowApprovalForm] = useState<number | null>(null);
  const [approvalForm, setApprovalForm] = useState({ approverName: "", approvalStatus: "מאושר", approvalLevel: "1", comments: "" });
  const [detailTab, setDetailTab] = useState("details");
  const { selectedIds, toggle, toggleAll, clear, isSelected, isAllSelected } = useBulkSelection();

  const { data: requests = [], isLoading } = useQuery<PurchaseRequest[]>({
    queryKey: ["purchase-requests"],
    queryFn: async () => { const r = await authFetch(`${API}/purchase-requests`); return r.json(); },
  });

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ["suppliers-list"],
    queryFn: async () => { const r = await authFetch(`${API}/suppliers`); return r.json(); },
  });

  const { data: materials = [] } = useQuery<Material[]>({
    queryKey: ["materials-list"],
    queryFn: async () => { const r = await authFetch(`${API}/raw-materials`); return r.json(); },
  });

  interface BudgetRecord {
    id: number; department: string | null; category: string | null; name: string;
    budgetedAmount: string | null; actualAmount: string | null; committedAmount: string | null;
    fiscalYear: number | null;
  }
  const { data: allBudgets = [] } = useQuery<BudgetRecord[]>({
    queryKey: ["budgets-list"],
    queryFn: async () => { const r = await authFetch(`${API}/budgets`); return r.json(); },
  });
  const currentYear = new Date().getFullYear();
  const deptBudget = allBudgets
    .filter(b => b.department === form.department && (!b.fiscalYear || b.fiscalYear === currentYear))
    .reduce((acc, b) => ({
      budgeted: acc.budgeted + parseFloat(b.budgetedAmount || "0"),
      actual: acc.actual + parseFloat(b.actualAmount || "0"),
      committed: acc.committed + parseFloat(b.committedAmount || "0"),
    }), { budgeted: 0, actual: 0, committed: 0 });
  const deptAvailable = deptBudget.budgeted - deptBudget.actual - deptBudget.committed;
  const hasDeptBudget = form.department && deptBudget.budgeted > 0;

  const filtered = requests.filter(r => {
    const matchSearch = !search ||
      r.title.toLowerCase().includes(search.toLowerCase()) ||
      r.requestNumber.toLowerCase().includes(search.toLowerCase()) ||
      r.requesterName?.toLowerCase().includes(search.toLowerCase()) ||
      r.department?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || normStatus(r.status) === statusFilter;
    const matchPriority = priorityFilter === "all" || normPriority(r.priority) === priorityFilter;
    return matchSearch && matchStatus && matchPriority;
  });

  const pending = requests.filter(r => normStatus(r.status) === "ממתין לאישור");
  const approved = requests.filter(r => normStatus(r.status) === "מאושר");
  const rejected = requests.filter(r => normStatus(r.status) === "נדחה");
  const urgent = requests.filter(r => normPriority(r.priority) === "דחוף" || normPriority(r.priority) === "גבוה");
  const drafts = requests.filter(r => normStatus(r.status) === "טיוטה");
  const completed = requests.filter(r => normStatus(r.status) === "בוצע");
  const totalEstimated = requests.reduce((s, r) => s + parseFloat(r.totalEstimated || "0"), 0);
  const pendingValue = pending.reduce((s, r) => s + parseFloat(r.totalEstimated || "0"), 0);

  const overdue = requests.filter(r => {
    if (!r.neededBy || ["בוצע", "בוטל", "נדחה"].includes(normStatus(r.status))) return false;
    return new Date(r.neededBy) < new Date();
  });

  const statusDistribution = STATUSES.map(s => ({
    status: s,
    count: requests.filter(r => normStatus(r.status) === s).length,
    color: STATUS_COLORS[s],
  })).filter(s => s.count > 0);

  const createMut = useMutation({
    mutationFn: async (data: { form: typeof emptyForm; items: ItemForm[] }) => {
      const payload = { ...data.form };
      const r = await authFetch(`${API}/purchase-requests`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      const created = await r.json();
      const failedItems: string[] = [];
      for (const item of data.items) {
        if (!item.itemDescription) continue;
        const ir = await authFetch(`${API}/purchase-requests/${created.id}/items`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...item, materialId: item.materialId || null, preferredSupplierId: item.preferredSupplierId || null }),
        });
        if (!ir.ok) failedItems.push(item.itemDescription);
      }
      if (failedItems.length > 0) throw new Error(`הדרישה נוצרה אבל ${failedItems.length} פריטים נכשלו`);
      return created;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["purchase-requests"] }); closeForm(); },
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof emptyForm }) => {
      const r = await authFetch(`${API}/purchase-requests/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); } return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["purchase-requests"] }); closeForm(); },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => { await authFetch(`${API}/purchase-requests/${id}`, { method: "DELETE" }); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["purchase-requests"] }); setDeleteConfirm(null); },
  });

  const addApprovalMut = useMutation({
    mutationFn: async ({ requestId, data }: { requestId: number; data: typeof approvalForm }) => {
      const r = await authFetch(`${API}/purchase-requests/${requestId}/approvals`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-requests"] });
      setShowApprovalForm(null);
      setApprovalForm({ approverName: "", approvalStatus: "מאושר", approvalLevel: "1", comments: "" });
      if (selectedRequest) {
        openRequestDetail(selectedRequest);
      }
    },
  });

  function closeForm() { setShowForm(false); setEditingId(null); setForm(emptyForm); setItems([]); validation.clearErrors(); }
  function openEdit(r: PurchaseRequest) {
    setForm({ requestNumber: r.requestNumber, title: r.title, requesterName: r.requesterName || "", department: r.department || "", priority: r.priority, status: r.status, totalEstimated: r.totalEstimated || "", currency: r.currency || "ILS", neededBy: r.neededBy || "", notes: r.notes || "", budgetCode: "", approvedBy: r.approvedBy || "" });
    setEditingId(r.id); setShowForm(true); setItems([]);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validation.validate(form)) return;
    const totalFromItems = items.reduce((sum, item) => sum + (parseFloat(item.quantity || "0") * parseFloat(item.estimatedPrice || "0")), 0);
    const formWithTotal = { ...form, totalEstimated: totalFromItems > 0 ? String(totalFromItems) : form.totalEstimated };
    editingId ? updateMut.mutate({ id: editingId, data: formWithTotal }) : createMut.mutate({ form: formWithTotal, items });
  }

  function addItem() { setItems([...items, { ...emptyItem }]); }
  function removeItem(idx: number) { setItems(items.filter((_, i) => i !== idx)); }
  function updateItem(idx: number, field: keyof ItemForm, value: string) {
    const updated = [...items];
    updated[idx] = { ...updated[idx], [field]: value };
    if (field === "materialId" && value) {
      const mat = materials.find(m => m.id === parseInt(value));
      if (mat) {
        updated[idx].itemDescription = mat.materialName;
        updated[idx].unit = mat.unit;
        if (mat.standardPrice) updated[idx].estimatedPrice = mat.standardPrice;
      }
    }
    setItems(updated);
  }

  async function loadRequestItems(requestId: number) {
    if (expandedRow === requestId) { setExpandedRow(null); return; }
    if (!expandedItems[requestId]) {
      const r = await authFetch(`${API}/purchase-requests/${requestId}`);
      const data = await r.json();
      setExpandedItems(prev => ({ ...prev, [requestId]: { items: data.items || [], approvals: data.approvals || [] } }));
    }
    setExpandedRow(requestId);
  }

  async function openRequestDetail(req: PurchaseRequest) {
    const r = await authFetch(`${API}/purchase-requests/${req.id}`);
    const data = await r.json();
    setSelectedRequest({ ...req, items: data.items || [], approvals: data.approvals || [] });
  }

  async function submitForApproval(req: PurchaseRequest) {
    await authFetch(`${API}/purchase-requests/${req.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ממתין לאישור" }),
    });
    qc.invalidateQueries({ queryKey: ["purchase-requests"] });
  }

  const getSupplierName = (id: string | null) => id ? suppliers.find(s => s.id === parseInt(id))?.supplierName || "" : "";
  const getMaterialName = (id: string | null) => id ? materials.find(m => m.id === parseInt(id))?.materialName || "" : "";
  const itemsTotal = items.reduce((s, i) => s + parseFloat(i.quantity || "0") * parseFloat(i.estimatedPrice || "0"), 0);

  function getDaysUntilNeeded(date: string | null) {
    if (!date) return null;
    return Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  }

  const processSteps = [
    { status: "טיוטה", label: "טיוטה", icon: FileText },
    { status: "ממתין לאישור", label: "ממתין לאישור", icon: Clock },
    { status: "מאושר", label: "מאושר", icon: CheckCircle2 },
    { status: "בוצע", label: "בוצע (הזמנה)", icon: Shield },
  ];

  function getStepIndex(status: string) {
    const s = normStatus(status);
    if (s === "נדחה" || s === "בוטל") return -1;
    return processSteps.findIndex(step => step.status === s);
  }

  return (
    <div className="min-h-screen" dir="rtl">
      <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                <ClipboardList className="w-6 h-6 text-foreground" />
              </div>
              דרישות רכש
            </h1>
            <p className="text-muted-foreground mt-1">ניהול דרישות רכש, תהליכי אישור ומעקב תקציב</p>
          </div>
          <div className="flex items-center gap-2">
            {pending.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span className="text-amber-400 text-sm font-medium">{pending.length} ממתינות לאישור</span>
              </div>
            )}
            <button onClick={() => { setForm(emptyForm); setEditingId(null); setItems([]); setShowForm(true); }}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-foreground rounded-xl font-medium transition-colors">
              <Plus className="w-5 h-5" />דרישה חדשה
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {[
            { label: "סה״כ דרישות", value: requests.length, icon: ClipboardList, color: "text-blue-400", bg: "bg-blue-500/10" },
            { label: "טיוטות", value: drafts.length, icon: FileText, color: "text-muted-foreground", bg: "bg-muted/10" },
            { label: "ממתינות", value: pending.length, icon: Clock, color: "text-amber-400", bg: "bg-amber-500/10" },
            { label: "מאושרות", value: approved.length, icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10" },
            { label: "נדחו", value: rejected.length, icon: XCircle, color: "text-red-400", bg: "bg-red-500/10" },
            { label: "דחופות", value: urgent.length, icon: Flame, color: urgent.length > 0 ? "text-orange-400" : "text-muted-foreground", bg: urgent.length > 0 ? "bg-orange-500/10" : "bg-muted/10" },
            { label: "באיחור", value: overdue.length, icon: AlertCircle, color: overdue.length > 0 ? "text-red-400" : "text-muted-foreground", bg: overdue.length > 0 ? "bg-red-500/10" : "bg-muted/10" },
            { label: "שווי ממתין", value: `₪${Math.round(pendingValue).toLocaleString()}`, icon: DollarSign, color: "text-purple-400", bg: "bg-purple-500/10" },
          ].map(s => (
            <div key={s.label} className="bg-card border border-border rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <div className={`w-7 h-7 rounded-lg ${s.bg} flex items-center justify-center`}>
                  <s.icon className={`w-3.5 h-3.5 ${s.color}`} />
                </div>
              </div>
              <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
              <p className="text-muted-foreground text-[10px] mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-indigo-400" />
              תהליך אישור דרישת רכש
            </h3>
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              {processSteps.map((step, i) => {
                const count = requests.filter(r => normStatus(r.status) === step.status).length;
                return (
                  <div key={i} className="flex items-center gap-2 flex-1 min-w-[100px]">
                    <div className={`flex-1 ${STATUS_COLORS[step.status]?.split(" ")[0] || "bg-muted/10"} border border-border rounded-xl p-3 text-center`}>
                      <step.icon className="w-5 h-5 mx-auto mb-1 text-gray-300" />
                      <p className="text-[11px] font-semibold text-foreground">{step.label}</p>
                      <p className="text-lg font-bold text-gray-300 mt-1">{count}</p>
                    </div>
                    {i < processSteps.length - 1 && <ArrowLeft className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                  </div>
                );
              })}
            </div>
          </div>

          {statusDistribution.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-violet-400" />
                התפלגות סטטוסים
              </h3>
              <div className="flex items-center gap-1 h-8 rounded-full overflow-hidden bg-input">
                {statusDistribution.map((sd, i) => {
                  const pct = (sd.count / requests.length) * 100;
                  return pct > 0 ? (
                    <div key={i} className={`h-full ${sd.color.split(" ")[0]} flex items-center justify-center transition-all cursor-pointer`}
                      style={{ width: `${pct}%`, minWidth: pct > 3 ? "auto" : "4px" }}
                      title={`${sd.status}: ${sd.count}`}
                      onClick={() => setStatusFilter(statusFilter === sd.status ? "all" : sd.status)}>
                      {pct > 10 && <span className="text-[10px] font-bold px-1">{sd.count}</span>}
                    </div>
                  ) : null;
                })}
              </div>
              <div className="flex flex-wrap gap-3 mt-3">
                {statusDistribution.map((sd, i) => (
                  <button key={i} onClick={() => setStatusFilter(statusFilter === sd.status ? "all" : sd.status)}
                    className={`flex items-center gap-1.5 text-xs ${statusFilter === sd.status ? "opacity-100 ring-1 ring-gray-600 rounded-lg px-2 py-0.5" : "opacity-60"} hover:opacity-100 transition-opacity`}>
                    <span className={`w-2 h-2 rounded-full ${sd.color.split(" ")[0]}`} />
                    <span className="text-muted-foreground">{sd.status}: {sd.count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-0 sm:min-w-[200px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input type="text" placeholder="חיפוש לפי מספר, כותרת, מבקש או מחלקה..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-foreground placeholder-gray-500 focus:border-blue-500 focus:outline-none" />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2.5 bg-card border border-border rounded-xl text-foreground focus:border-blue-500 focus:outline-none">
            <option value="all">כל הסטטוסים</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}
            className="px-3 py-2.5 bg-card border border-border rounded-xl text-foreground focus:border-blue-500 focus:outline-none">
            <option value="all">כל העדיפויות</option>
            {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <ClipboardList className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl text-muted-foreground">אין דרישות רכש</h3>
            <p className="text-muted-foreground text-sm mt-2">{search || statusFilter !== "all" || priorityFilter !== "all" ? "נסה לשנות את מסנני החיפוש" : "לחץ \"דרישה חדשה\" כדי להתחיל"}</p>
          </div>
        ) : (
          <>
          <BulkActions selectedIds={selectedIds} onClear={clear} entityName="דרישות רכש" actions={defaultBulkActions(selectedIds, clear, () => qc.invalidateQueries({ queryKey: ["purchase-requests"] }), `${API}/purchase-requests`)} />
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-2 border-b border-border bg-input flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{filtered.length} דרישות {statusFilter !== "all" ? `(${statusFilter})` : ""} {priorityFilter !== "all" ? `· ${priorityFilter}` : ""}</span>
              <span className="text-sm text-muted-foreground">סה״כ שווי: ₪{Math.round(totalEstimated).toLocaleString()}</span>
            </div>
            <table className="w-full text-right">
              <thead><tr className="border-b border-border bg-input">
                <th className="px-4 py-3 w-8"><BulkCheckbox checked={isAllSelected(filtered.map(r => r.id))} onChange={() => toggleAll(filtered.map(r => r.id))} /></th>
                <th className="px-4 py-3 text-muted-foreground font-medium text-sm w-8"></th>
                <th className="px-4 py-3 text-muted-foreground font-medium text-sm">מספר</th>
                <th className="px-4 py-3 text-muted-foreground font-medium text-sm">כותרת</th>
                <th className="px-4 py-3 text-muted-foreground font-medium text-sm">מבקש</th>
                <th className="px-4 py-3 text-muted-foreground font-medium text-sm">מחלקה</th>
                <th className="px-4 py-3 text-muted-foreground font-medium text-sm">עדיפות</th>
                <th className="px-4 py-3 text-muted-foreground font-medium text-sm">נדרש עד</th>
                <th className="px-4 py-3 text-muted-foreground font-medium text-sm">סכום</th>
                <th className="px-4 py-3 text-muted-foreground font-medium text-sm">סטטוס</th>
                <th className="px-4 py-3 text-muted-foreground font-medium text-sm">פעולות</th>
              </tr></thead>
              <tbody>
                {filtered.map(r => {
                  const days = getDaysUntilNeeded(r.neededBy);
                  const isOverdue = days !== null && days < 0 && !["בוצע", "בוטל", "נדחה"].includes(normStatus(r.status));
                  const expanded = expandedItems[r.id];
                  return (
                    <React.Fragment key={r.id}>
                      <tr className={`border-b border-border/50 hover:bg-muted cursor-pointer transition-colors ${isSelected(r.id) ? "bg-blue-500/10" : isOverdue ? "bg-red-500/5" : ""}`}
                        onClick={() => loadRequestItems(r.id)}>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}><BulkCheckbox checked={isSelected(r.id)} onChange={() => toggle(r.id)} /></td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {expandedRow === r.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </td>
                        <td className="px-4 py-3"><span className="text-blue-400 font-mono text-sm">{r.requestNumber}</span></td>
                        <td className="px-4 py-3 text-foreground font-medium max-w-[200px] truncate">{r.title}</td>
                        <td className="px-4 py-3 text-gray-300">{r.requesterName || "—"}</td>
                        <td className="px-4 py-3 text-gray-300">{r.department || "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium ${PRIORITY_COLORS[normPriority(r.priority)] || ""}`}>
                            {PRIORITY_ICONS[normPriority(r.priority)] && (() => { const Icon = PRIORITY_ICONS[normPriority(r.priority)]; return <Icon className="w-3 h-3" />; })()}
                            {normPriority(r.priority)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-sm ${isOverdue ? "text-red-400 font-bold" : "text-gray-300"}`}>
                            {r.neededBy ? new Date(r.neededBy).toLocaleDateString("he-IL") : "—"}
                          </span>
                          {days !== null && !["בוצע", "בוטל", "נדחה"].includes(normStatus(r.status)) && (
                            <span className={`block text-xs ${isOverdue ? "text-red-400" : days <= 3 ? "text-amber-400" : "text-muted-foreground"}`}>
                              {isOverdue ? `באיחור ${Math.abs(days)} ימים` : days === 0 ? "היום" : `עוד ${days} ימים`}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-300 font-mono" dir="ltr">{r.totalEstimated ? `₪${parseFloat(r.totalEstimated).toLocaleString()}` : "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${STATUS_COLORS[normStatus(r.status)] || ""}`}>
                            {STATUS_ICONS[normStatus(r.status)] && (() => { const Icon = STATUS_ICONS[normStatus(r.status)]; return <Icon className="w-3 h-3" />; })()}
                            {normStatus(r.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <button onClick={() => openRequestDetail(r)} className="p-1.5 text-muted-foreground hover:text-blue-400 rounded-md" title="פרטים"><Eye className="w-4 h-4" /></button>
                            {normStatus(r.status) === "טיוטה" && (
                              <button onClick={() => submitForApproval(r)} className="p-1.5 text-muted-foreground hover:text-amber-400 rounded-md" title="שלח לאישור"><Send className="w-4 h-4" /></button>
                            )}
                            <button onClick={() => openEdit(r)} className="p-1.5 text-muted-foreground hover:text-amber-400 rounded-md" title="ערוך"><Edit2 className="w-4 h-4" /></button> <button title="שכפול" onClick={async () => { const res = await duplicateRecord(`${API}/purchase-requests`, r.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
                            {isSuperAdmin && <button onClick={() => setDeleteConfirm(r.id)} className="p-1.5 text-muted-foreground hover:text-red-400 rounded-md" title="מחק"><Trash2 className="w-4 h-4" /></button>}
                          </div>
                        </td>
                      </tr>
                      {expandedRow === r.id && (
                        <tr key={`expanded-${r.id}`}>
                          <td colSpan={10} className="px-4 py-4 bg-input">
                            <div className="space-y-3">
                              <div className="flex items-center gap-1 overflow-x-auto pb-2">
                                {processSteps.map((step, si) => {
                                  const stepIdx = getStepIndex(r.status);
                                  const active = si <= stepIdx;
                                  const current = si === stepIdx;
                                  return (
                                    <div key={si} className="flex items-center gap-1">
                                      <div className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${current ? "bg-blue-600 text-foreground ring-2 ring-blue-400/30" : active ? "bg-emerald-500/20 text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                                        {step.label}
                                      </div>
                                      {si < processSteps.length - 1 && <ArrowLeft className={`w-3 h-3 flex-shrink-0 ${active ? "text-emerald-500" : "text-foreground"}`} />}
                                    </div>
                                  );
                                })}
                                {(normStatus(r.status) === "נדחה" || normStatus(r.status) === "בוטל") && <span className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/20 text-red-400">{normStatus(r.status)}</span>}
                              </div>

                              {expanded && expanded.approvals.length > 0 && (
                                <div>
                                  <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1"><UserCheck className="w-3 h-3" />אישורים:</p>
                                  <div className="flex flex-wrap gap-2">
                                    {expanded.approvals.map(a => (
                                      <div key={a.id} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${APPROVAL_STATUS_COLORS[a.approvalStatus] || "bg-muted/20 text-muted-foreground"}`}>
                                        {a.approverName} · {a.approvalStatus}
                                        {a.comments && <span className="text-muted-foreground mr-1">({a.comments})</span>}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {expanded && expanded.items.length > 0 && (
                                <table className="w-full text-right text-sm">
                                  <thead><tr className="text-muted-foreground border-b border-border">
                                    <th className="pb-2 pr-2">פריט</th><th className="pb-2 pr-2">חומר</th>
                                    <th className="pb-2 pr-2">כמות</th><th className="pb-2 pr-2">יחידה</th>
                                    <th className="pb-2 pr-2">מחיר משוער</th><th className="pb-2 pr-2">סה״כ</th>
                                    <th className="pb-2 pr-2">ספק מועדף</th>
                                  </tr></thead>
                                  <tbody>{expanded.items.map((item: PurchaseRequestItem) => (
                                    <tr key={item.id} className="border-t border-border/30">
                                      <td className="py-2 pr-2 text-gray-300">{item.itemDescription}</td>
                                      <td className="py-2 pr-2 text-muted-foreground">{getMaterialName(item.materialId)}</td>
                                      <td className="py-2 pr-2 text-gray-300">{item.quantity}</td>
                                      <td className="py-2 pr-2 text-muted-foreground">{item.unit}</td>
                                      <td className="py-2 pr-2 text-gray-300" dir="ltr">{item.estimatedPrice ? `₪${parseFloat(item.estimatedPrice).toLocaleString()}` : "—"}</td>
                                      <td className="py-2 pr-2 text-foreground font-medium" dir="ltr">{item.estimatedPrice && item.quantity ? `₪${(parseFloat(item.estimatedPrice) * parseFloat(item.quantity)).toLocaleString()}` : "—"}</td>
                                      <td className="py-2 pr-2 text-muted-foreground">{getSupplierName(item.preferredSupplierId) || "—"}</td>
                                    </tr>
                                  ))}</tbody>
                                </table>
                              )}
                              {expanded && expanded.items.length === 0 && (
                                <p className="text-muted-foreground text-sm text-center py-2">אין פריטים בדרישה זו</p>
                              )}
                              {!expanded && <p className="text-muted-foreground text-sm text-center py-2">טוען...</p>}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      <AnimatePresence>
        {selectedRequest && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-6 overflow-y-auto" onClick={() => { setSelectedRequest(null); setShowApprovalForm(null); }}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl w-full max-w-4xl mx-4 mb-10" onClick={e => e.stopPropagation()} dir="rtl">
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <div>
                  <h2 className="text-xl font-bold text-foreground">דרישת רכש {selectedRequest.requestNumber}</h2>
                  <p className="text-sm text-muted-foreground">{selectedRequest.title}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-3 py-1 rounded-lg text-sm font-medium ${STATUS_COLORS[normStatus(selectedRequest.status)] || ""}`}>{normStatus(selectedRequest.status)}</span>
                  <span className={`px-3 py-1 rounded-lg text-sm font-medium ${PRIORITY_COLORS[normPriority(selectedRequest.priority)] || ""}`}>{normPriority(selectedRequest.priority)}</span>
                  <button onClick={() => { setSelectedRequest(null); setShowApprovalForm(null); }} className="p-1 text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
                </div>
              </div>
              <div className="flex gap-1 px-6 pt-3 border-b border-border overflow-x-auto">
                {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"attachments",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(tab => (
                  <button key={tab.key} onClick={() => setDetailTab(tab.key)} className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${detailTab === tab.key ? "bg-blue-500/20 text-blue-400 border-b-2 border-blue-500" : "text-muted-foreground hover:text-gray-300"}`}>{tab.label}</button>
                ))}
              </div>
              <div className="p-6 space-y-5">
                {detailTab === "details" && (<>
                <div className="flex items-center gap-1 overflow-x-auto pb-2">
                  {processSteps.map((step, si) => {
                    const idx = getStepIndex(selectedRequest.status);
                    const active = si <= idx;
                    const current = si === idx;
                    return (
                      <div key={si} className="flex items-center gap-1">
                        <div className={`px-3 py-2 rounded-lg text-xs font-medium ${current ? "bg-blue-600 text-foreground ring-2 ring-blue-400/30" : active ? "bg-emerald-500/20 text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                          {step.label}
                        </div>
                        {si < processSteps.length - 1 && <ArrowLeft className={`w-3 h-3 flex-shrink-0 ${active ? "text-emerald-500" : "text-foreground"}`} />}
                      </div>
                    );
                  })}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-input rounded-xl p-4"><p className="text-muted-foreground text-xs">מבקש</p><p className="text-foreground font-medium">{selectedRequest.requesterName || "—"}</p></div>
                  <div className="bg-input rounded-xl p-4"><p className="text-muted-foreground text-xs">מחלקה</p><p className="text-foreground font-medium">{selectedRequest.department || "—"}</p></div>
                  <div className="bg-input rounded-xl p-4"><p className="text-muted-foreground text-xs">נדרש עד</p><p className="text-foreground font-medium">{selectedRequest.neededBy ? new Date(selectedRequest.neededBy).toLocaleDateString("he-IL") : "—"}</p></div>
                  <div className="bg-input rounded-xl p-4"><p className="text-muted-foreground text-xs">סכום משוער</p><p className="text-emerald-400 font-bold text-lg" dir="ltr">{selectedRequest.totalEstimated ? `₪${parseFloat(selectedRequest.totalEstimated).toLocaleString()}` : "—"}</p></div>
                </div>

                {selectedRequest.approvals && selectedRequest.approvals.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
                      <UserCheck className="w-5 h-5 text-indigo-400" />
                      היסטוריית אישורים
                    </h3>
                    <div className="space-y-2">
                      {selectedRequest.approvals.map((a: PurchaseApproval) => (
                        <div key={a.id} className={`rounded-xl p-4 border ${a.approvalStatus === "מאושר" ? "border-emerald-500/30 bg-emerald-500/5" : a.approvalStatus === "נדחה" ? "border-red-500/30 bg-red-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${a.approvalStatus === "מאושר" ? "bg-emerald-500/20" : a.approvalStatus === "נדחה" ? "bg-red-500/20" : "bg-amber-500/20"}`}>
                                {a.approvalStatus === "מאושר" ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : a.approvalStatus === "נדחה" ? <XCircle className="w-4 h-4 text-red-400" /> : <Clock className="w-4 h-4 text-amber-400" />}
                              </div>
                              <div>
                                <p className="text-foreground font-medium">{a.approverName}</p>
                                <p className="text-muted-foreground text-xs">רמת אישור {a.approvalLevel}</p>
                              </div>
                            </div>
                            <div className="text-left">
                              <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${APPROVAL_STATUS_COLORS[a.approvalStatus] || ""}`}>{a.approvalStatus}</span>
                              {a.approvedAt && <p className="text-muted-foreground text-xs mt-1">{new Date(a.approvedAt).toLocaleDateString("he-IL")}</p>}
                            </div>
                          </div>
                          {a.comments && <p className="text-muted-foreground text-sm mt-2 pr-11">{a.comments}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(normStatus(selectedRequest.status) === "ממתין לאישור" || normStatus(selectedRequest.status) === "טיוטה") && (
                  <div>
                    {showApprovalForm === selectedRequest.id ? (
                      <div className="bg-input rounded-xl p-4 border border-indigo-500/30">
                        <h4 className="text-sm font-semibold text-foreground mb-3">הוסף החלטת אישור</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <input value={approvalForm.approverName} onChange={e => setApprovalForm({...approvalForm, approverName: e.target.value})} placeholder="שם המאשר" className="px-3 py-2 bg-card border border-border rounded-lg text-foreground text-sm placeholder-gray-500 focus:border-blue-500 focus:outline-none" />
                          <select value={approvalForm.approvalStatus} onChange={e => setApprovalForm({...approvalForm, approvalStatus: e.target.value})} className="px-3 py-2 bg-card border border-border rounded-lg text-foreground text-sm focus:border-blue-500 focus:outline-none">
                            <option value="מאושר">מאושר</option>
                            <option value="נדחה">נדחה</option>
                            <option value="ממתין">ממתין</option>
                          </select>
                          <input value={approvalForm.approvalLevel} onChange={e => setApprovalForm({...approvalForm, approvalLevel: e.target.value})} placeholder="רמת אישור" type="number" className="px-3 py-2 bg-card border border-border rounded-lg text-foreground text-sm placeholder-gray-500 focus:border-blue-500 focus:outline-none" dir="ltr" />
                        </div>
                        <textarea value={approvalForm.comments} onChange={e => setApprovalForm({...approvalForm, comments: e.target.value})} placeholder="הערות" className="w-full mt-2 px-3 py-2 bg-card border border-border rounded-lg text-foreground text-sm placeholder-gray-500 focus:border-blue-500 focus:outline-none" rows={2} />
                        <div className="flex gap-2 mt-3">
                          <button onClick={() => { if (approvalForm.approverName) addApprovalMut.mutate({ requestId: selectedRequest.id, data: approvalForm }); }}
                            disabled={!approvalForm.approverName || addApprovalMut.isPending}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-foreground rounded-lg text-sm font-medium">
                            {addApprovalMut.isPending ? "שומר..." : "שמור אישור"}
                          </button>
                          <button onClick={() => setShowApprovalForm(null)} className="px-4 py-2 text-muted-foreground hover:text-foreground text-sm">ביטול</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setShowApprovalForm(selectedRequest.id)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 rounded-xl text-sm font-medium">
                        <UserCheck className="w-4 h-4" />הוסף החלטת אישור
                      </button>
                    )}
                  </div>
                )}

                {selectedRequest.items && selectedRequest.items.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
                      <Package className="w-5 h-5 text-cyan-400" />
                      פריטים ({selectedRequest.items.length})
                    </h3>
                    <table className="w-full text-right text-sm">
                      <thead><tr className="text-muted-foreground border-b border-border">
                        <th className="pb-2 pr-2">פריט</th><th className="pb-2 pr-2">חומר</th>
                        <th className="pb-2 pr-2">כמות</th><th className="pb-2 pr-2">יחידה</th>
                        <th className="pb-2 pr-2">מחיר</th><th className="pb-2 pr-2">סה״כ</th>
                        <th className="pb-2 pr-2">ספק מועדף</th>
                      </tr></thead>
                      <tbody>{selectedRequest.items.map((item: PurchaseRequestItem) => (
                        <tr key={item.id} className="border-t border-border/30">
                          <td className="py-2 pr-2 text-gray-300">{item.itemDescription}</td>
                          <td className="py-2 pr-2 text-muted-foreground">{getMaterialName(item.materialId)}</td>
                          <td className="py-2 pr-2 text-gray-300">{item.quantity}</td>
                          <td className="py-2 pr-2 text-muted-foreground">{item.unit}</td>
                          <td className="py-2 pr-2 text-gray-300" dir="ltr">{item.estimatedPrice ? `₪${parseFloat(item.estimatedPrice).toLocaleString()}` : "—"}</td>
                          <td className="py-2 pr-2 text-foreground font-medium" dir="ltr">{item.estimatedPrice && item.quantity ? `₪${(parseFloat(item.estimatedPrice) * parseFloat(item.quantity)).toLocaleString()}` : "—"}</td>
                          <td className="py-2 pr-2 text-muted-foreground">{getSupplierName(item.preferredSupplierId) || "—"}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                    <div className="flex justify-end mt-2 text-sm border-t border-border pt-2">
                      <span className="text-muted-foreground">סה״כ משוער:</span>
                      <span className="text-foreground font-bold font-mono mr-2" dir="ltr">₪{selectedRequest.items.reduce((s, i) => s + (parseFloat(i.estimatedPrice || "0") * parseFloat(i.quantity || "0")), 0).toLocaleString()}</span>
                    </div>
                  </div>
                )}
                {selectedRequest.notes && (
                  <div className="bg-input rounded-xl p-4"><p className="text-muted-foreground text-xs mb-1">הערות</p><p className="text-gray-300 text-sm">{selectedRequest.notes}</p></div>
                )}
                </>)}
                {detailTab === "related" && <RelatedRecords entityType="purchase-requests" entityId={selectedRequest.id} />}
                {detailTab === "attachments" && <AttachmentsSection entityType="purchase-requests" entityId={selectedRequest.id} />}
                {detailTab === "history" && <ActivityLog entityType="purchase-requests" entityId={selectedRequest.id} />}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-6 overflow-y-auto" onClick={closeForm}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl w-full max-w-3xl mx-4 mb-10" onClick={e => e.stopPropagation()} dir="rtl">
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <h2 className="text-xl font-bold text-foreground">{editingId ? "עריכת דרישה" : "דרישת רכש חדשה"}</h2>
                <button onClick={closeForm} className="p-1 text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-gray-300 mb-1">מספר דרישה <RequiredMark /></label><input value={form.requestNumber} onChange={e => setForm({...form, requestNumber: e.target.value})} placeholder="REQ-001" className={`w-full px-3 py-2 bg-input border rounded-lg text-foreground placeholder-gray-500 focus:outline-none ${validation.errors.requestNumber ? "border-red-500" : "border-border focus:border-blue-500"}`} /><FormFieldError error={validation.errors.requestNumber} /></div>
                  <div><label className="block text-sm font-medium text-gray-300 mb-1">כותרת <RequiredMark /></label><input value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="כותרת הדרישה" className={`w-full px-3 py-2 bg-input border rounded-lg text-foreground placeholder-gray-500 focus:outline-none ${validation.errors.title ? "border-red-500" : "border-border focus:border-blue-500"}`} /><FormFieldError error={validation.errors.title} /></div>
                  <div><label className="block text-sm font-medium text-gray-300 mb-1">שם מבקש</label><input value={form.requesterName} onChange={e => setForm({...form, requesterName: e.target.value})} placeholder="שם מלא" className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground placeholder-gray-500 focus:border-blue-500 focus:outline-none" /></div>
                  <div><label className="block text-sm font-medium text-gray-300 mb-1">מחלקה</label><select value={form.department} onChange={e => setForm({...form, department: e.target.value})} className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground focus:border-blue-500 focus:outline-none"><option value="">בחר מחלקה</option>{DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}</select></div>
                  <div><label className="block text-sm font-medium text-gray-300 mb-1">עדיפות</label><select value={form.priority} onChange={e => setForm({...form, priority: e.target.value})} className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground focus:border-blue-500 focus:outline-none">{PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}</select></div>
                  <div><label className="block text-sm font-medium text-gray-300 mb-1">סטטוס</label><select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground focus:border-blue-500 focus:outline-none">{STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                  <div><label className="block text-sm font-medium text-gray-300 mb-1">נדרש עד (תאריך אספקה)</label><input type="date" value={form.neededBy} onChange={e => setForm({...form, neededBy: e.target.value})} dir="ltr" className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground focus:border-blue-500 focus:outline-none" /></div>
                  <div><label className="block text-sm font-medium text-gray-300 mb-1">קוד תקציב</label><input value={form.budgetCode} onChange={e => setForm({...form, budgetCode: e.target.value})} placeholder="BUD-2026-XX" className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground placeholder-gray-500 focus:border-blue-500 focus:outline-none" /></div>
                </div>

                {!editingId && (
                  <div className="border border-border rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                        <Package className="w-5 h-5 text-cyan-400" />
                        פריטים נדרשים
                      </h3>
                      <button type="button" onClick={addItem} className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 rounded-lg text-sm font-medium">
                        <Plus className="w-4 h-4" />הוסף פריט
                      </button>
                    </div>
                    {items.length === 0 && (
                      <p className="text-muted-foreground text-sm text-center py-4">לחץ "הוסף פריט" כדי להוסיף חומרים לדרישה</p>
                    )}
                    {items.map((item, idx) => (
                      <div key={idx} className="bg-input border border-border rounded-lg p-3 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">פריט {idx + 1}</span>
                          <button type="button" onClick={() => removeItem(idx)} className="p-1 text-muted-foreground hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs text-muted-foreground mb-1">חומר מקטלוג</label>
                            <select value={item.materialId} onChange={e => updateItem(idx, "materialId", e.target.value)} className="w-full px-2 py-1.5 bg-card border border-border rounded text-foreground text-sm focus:border-blue-500 focus:outline-none">
                              <option value="">בחר חומר (אופציונלי)</option>
                              {materials.map(m => <option key={m.id} value={m.id}>{m.materialName} ({m.materialNumber})</option>)}
                            </select>
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-xs text-muted-foreground mb-1">תיאור פריט *</label>
                            <input value={item.itemDescription} onChange={e => updateItem(idx, "itemDescription", e.target.value)} placeholder="תיאור הפריט" className="w-full px-2 py-1.5 bg-card border border-border rounded text-foreground text-sm placeholder-gray-600 focus:border-blue-500 focus:outline-none" />
                          </div>
                          <div>
                            <label className="block text-xs text-muted-foreground mb-1">כמות</label>
                            <input type="number" value={item.quantity} onChange={e => updateItem(idx, "quantity", e.target.value)} className="w-full px-2 py-1.5 bg-card border border-border rounded text-foreground text-sm focus:border-blue-500 focus:outline-none" dir="ltr" />
                          </div>
                          <div>
                            <label className="block text-xs text-muted-foreground mb-1">יחידה</label>
                            <select value={item.unit} onChange={e => updateItem(idx, "unit", e.target.value)} className="w-full px-2 py-1.5 bg-card border border-border rounded text-foreground text-sm focus:border-blue-500 focus:outline-none">
                              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-muted-foreground mb-1">מחיר משוער ₪</label>
                            <input type="number" step="0.01" value={item.estimatedPrice} onChange={e => updateItem(idx, "estimatedPrice", e.target.value)} className="w-full px-2 py-1.5 bg-card border border-border rounded text-foreground text-sm focus:border-blue-500 focus:outline-none" dir="ltr" />
                          </div>
                          <div className="sm:col-span-3">
                            <label className="block text-xs text-muted-foreground mb-1">ספק מועדף</label>
                            <select value={item.preferredSupplierId} onChange={e => updateItem(idx, "preferredSupplierId", e.target.value)} className="w-full px-2 py-1.5 bg-card border border-border rounded text-foreground text-sm focus:border-blue-500 focus:outline-none">
                              <option value="">בחר ספק (אופציונלי)</option>
                              {suppliers.map(s => <option key={s.id} value={s.id}>{s.supplierName} ({s.supplierNumber})</option>)}
                            </select>
                          </div>
                        </div>
                        <div className="text-left text-sm text-muted-foreground">
                          סה״כ שורה: <span className="text-foreground font-mono">₪{(parseFloat(item.quantity || "0") * parseFloat(item.estimatedPrice || "0")).toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                    {items.length > 0 && (
                      <div className="flex justify-end text-sm pt-1 border-t border-border mt-2 pt-3">
                        <span className="text-muted-foreground">סה״כ דרישה:</span>
                        <span className="text-foreground font-bold font-mono mr-2" dir="ltr">₪{itemsTotal.toLocaleString()}</span>
                      </div>
                    )}
                    {hasDeptBudget && itemsTotal > 0 && (
                      <div className={`flex items-start gap-2 p-3 rounded-xl text-sm border ${
                        itemsTotal > deptAvailable
                          ? "bg-red-500/10 border-red-500/30 text-red-400"
                          : itemsTotal > deptAvailable * 0.8
                          ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                          : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                      }`}>
                        {itemsTotal > deptAvailable
                          ? <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                          : <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
                        <div>
                          <div className="font-medium">
                            {itemsTotal > deptAvailable
                              ? "חריגה מתקציב המחלקה"
                              : itemsTotal > deptAvailable * 0.8
                              ? "ניצול גבוה של תקציב המחלקה"
                              : "תקציב זמין"}
                          </div>
                          <div className="mt-0.5 text-xs opacity-90">
                            תקציב מחלקה: ₪{deptBudget.budgeted.toLocaleString()} | 
                            מנוצל: ₪{deptBudget.actual.toLocaleString()} | 
                            מחויב: ₪{deptBudget.committed.toLocaleString()} | 
                            פנוי: ₪{deptAvailable.toLocaleString()}
                          </div>
                          {itemsTotal > deptAvailable && (
                            <div className="mt-1 text-xs font-medium">
                              חריגה: ₪{(itemsTotal - deptAvailable).toLocaleString()} — נדרש אישור מיוחד
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    {!hasDeptBudget && itemsTotal > 50000 && (
                      <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400 text-sm">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                        <span>
                          סכום גבוה (₪{itemsTotal.toLocaleString()}) — אין נתוני תקציב למחלקה זו. 
                          {itemsTotal > 100000 ? " נדרש אישור הנהלה בכירה." : " מומלץ לאשר עם מנהל המחלקה."}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">הערות</label>
                  <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground focus:border-blue-500 focus:outline-none resize-none" rows={2} />
                </div>
                {(createMut.error || updateMut.error) && <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">{(createMut.error as Error)?.message || (updateMut.error as Error)?.message}</div>}
                <div className="flex items-center gap-3 pt-2">
                  <button type="submit" disabled={createMut.isPending || updateMut.isPending} className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-foreground rounded-lg font-medium"><Save className="w-4 h-4" />{createMut.isPending || updateMut.isPending ? "שומר..." : editingId ? "עדכן" : "שמור"}</button>
                  <button type="button" onClick={closeForm} className="px-4 py-2.5 text-muted-foreground hover:text-foreground">ביטול</button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteConfirm !== null && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
            <div className="bg-card border border-border rounded-xl p-6 max-w-sm mx-4" dir="rtl">
              <h3 className="text-lg font-bold text-foreground mb-2">מחיקת דרישה</h3>
              <p className="text-muted-foreground mb-4">האם למחוק? כל הפריטים והאישורים ימחקו גם כן.</p>
              <div className="flex gap-3">
                <button onClick={() => deleteMut.mutate(deleteConfirm)} className="px-4 py-2 bg-red-600 text-foreground rounded-lg">מחק</button>
                <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-muted-foreground">ביטול</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
