import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button, Input, Modal, Label, Card } from "@/components/ui-components";
import { authFetch } from "@/lib/utils";
import { duplicateRecord } from "@/lib/duplicate-record";
import {
  Mail, Plus, Edit2, Trash2, Search, Send, MessageSquare, Phone,
  FileText, Clock, CheckCircle2, AlertCircle, Filter, Eye, Reply,
  Paperclip, Star, ArrowUpDown, ChevronDown, Users, X, Inbox,
  ArrowRight, Tag, Copy
} from "lucide-react";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);

interface Communication {
  id: number;
  supplier_id: number;
  type: string;
  subject: string;
  content: string;
  direction: string;
  status: string;
  priority: string;
  sent_by: string;
  sent_at: string;
  read_at: string | null;
  recipient_email: string;
  recipient_name: string;
  attachments: string | null;
  related_doc_type: string | null;
  related_doc_id: number | null;
  tags: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface Supplier {
  id: number;
  supplierName: string;
  email: string | null;
  contactPerson: string | null;
  phone: string | null;
}

const TYPES = [
  { value: "email", label: "דוא\"ל", icon: Mail },
  { value: "phone", label: "שיחה טלפונית", icon: Phone },
  { value: "meeting", label: "פגישה", icon: Users },
  { value: "message", label: "הודעה", icon: MessageSquare },
  { value: "document", label: "מסמך", icon: FileText },
  { value: "complaint", label: "תלונה", icon: AlertCircle },
  { value: "inquiry", label: "בירור", icon: Search },
  { value: "negotiation", label: "משא ומתן", icon: ArrowUpDown },
];

const DIRECTIONS = [
  { value: "outgoing", label: "יוצא" },
  { value: "incoming", label: "נכנס" },
  { value: "internal", label: "פנימי" },
];

const STATUSES = [
  { value: "draft", label: "טיוטה", color: "bg-muted/20 text-muted-foreground" },
  { value: "sent", label: "נשלח", color: "bg-blue-500/20 text-blue-400" },
  { value: "delivered", label: "נמסר", color: "bg-green-500/20 text-green-400" },
  { value: "read", label: "נקרא", color: "bg-emerald-500/20 text-emerald-400" },
  { value: "replied", label: "נענה", color: "bg-purple-500/20 text-purple-400" },
  { value: "failed", label: "נכשל", color: "bg-red-500/20 text-red-400" },
  { value: "pending", label: "ממתין", color: "bg-yellow-500/20 text-yellow-400" },
];

const PRIORITIES = [
  { value: "low", label: "נמוכה", color: "bg-muted/20 text-muted-foreground" },
  { value: "normal", label: "רגילה", color: "bg-blue-500/20 text-blue-400" },
  { value: "high", label: "גבוהה", color: "bg-orange-500/20 text-orange-400" },
  { value: "urgent", label: "דחופה", color: "bg-red-500/20 text-red-400" },
];

const emptyForm = {
  supplier_id: 0,
  type: "email",
  subject: "",
  content: "",
  direction: "outgoing",
  status: "draft",
  priority: "normal",
  sent_by: "",
  recipient_email: "",
  recipient_name: "",
  attachments: "",
  related_doc_type: "",
  related_doc_id: "",
  tags: "",
  notes: "",
};

export default function SupplierCommunicationsPage() {
  const { token, user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const [search, setSearch] = useState("");
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterDirection, setFilterDirection] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Communication | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [viewItem, setViewItem] = useState<Communication | null>(null);
  const [detailTab, setDetailTab] = useState("details");
  const bulk = useBulkSelection();
  const formValidation = useFormValidation({ subject: { required: true, message: "נושא נדרש" }, supplier_id: { required: true, message: "ספק נדרש" } });
  const [sortField, setSortField] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const { data: comms = [], isLoading } = useQuery<Communication[]>({
    queryKey: ["supplier-communications"],
    queryFn: async () => {
      const res = await authFetch(`${API}/supplier-communications`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return [];
      return safeArray(await res.json());
    },
    enabled: !!token,
  });

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ["suppliers-list-for-comms"],
    queryFn: async () => {
      const res = await authFetch(`${API}/suppliers`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return [];
      return safeArray(await res.json());
    },
    enabled: !!token,
  });

  const saveMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const url = editing ? `${API}/supplier-communications/${editing.id}` : `${API}/supplier-communications`;
      const method = editing ? "PUT" : "POST";
      const body = {
        ...data,
        supplier_id: Number(data.supplier_id),
        related_doc_id: data.related_doc_id ? Number(data.related_doc_id) : null,
        sent_by: data.sent_by || user?.username || "",
        sent_at: new Date().toISOString(),
      };
      const res = await authFetch(url, { method, headers, body: JSON.stringify(body) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "שגיאה"); }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["supplier-communications"] });
      toast({ title: editing ? "תקשורת עודכנה" : "תקשורת נוספה" });
      closeForm();
    },
    onError: (err: Error) => {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await authFetch(`${API}/supplier-communications/${id}`, { method: "DELETE", headers });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "שגיאה"); }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["supplier-communications"] });
      toast({ title: "תקשורת נמחקה" });
    },
    onError: (err: Error) => {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    },
  });

  function openNew() {
    setEditing(null);
    setForm({ ...emptyForm, sent_by: user?.username || "" });
    setShowForm(true);
  }

  function openEdit(item: Communication) {
    setEditing(item);
    setForm({
      supplier_id: item.supplier_id,
      type: item.type || "email",
      subject: item.subject || "",
      content: item.content || "",
      direction: item.direction || "outgoing",
      status: item.status || "draft",
      priority: item.priority || "normal",
      sent_by: item.sent_by || "",
      recipient_email: item.recipient_email || "",
      recipient_name: item.recipient_name || "",
      attachments: item.attachments || "",
      related_doc_type: item.related_doc_type || "",
      related_doc_id: item.related_doc_id ? String(item.related_doc_id) : "",
      tags: item.tags || "",
      notes: item.notes || "",
    });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
    setForm({ ...emptyForm });
  }

  function handleSupplierSelect(supplierId: number) {
    const supplier = suppliers.find(s => s.id === supplierId);
    setForm(p => ({
      ...p,
      supplier_id: supplierId,
      recipient_email: supplier?.email || p.recipient_email,
      recipient_name: supplier?.contactPerson || p.recipient_name,
    }));
  }

  const filtered = useMemo(() => {
    let f = comms.filter(c => {
      if (filterType !== "all" && c.type !== filterType) return false;
      if (filterStatus !== "all" && c.status !== filterStatus) return false;
      if (filterDirection !== "all" && c.direction !== filterDirection) return false;
      if (search) {
        const q = search.toLowerCase();
        return (c.subject?.toLowerCase().includes(q) ||
          c.content?.toLowerCase().includes(q) ||
          c.recipient_name?.toLowerCase().includes(q) ||
          c.recipient_email?.toLowerCase().includes(q));
      }
      return true;
    });
    f.sort((a: any, b: any) => {
      const av = a[sortField], bv = b[sortField];
      const cmp = typeof av === "number" ? av - bv : String(av || "").localeCompare(String(bv || ""));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return f;
  }, [comms, search, filterType, filterStatus, filterDirection, sortField, sortDir]);

  const stats = useMemo(() => ({
    total: comms.length,
    sent: comms.filter(c => c.status === "sent" || c.status === "delivered").length,
    pending: comms.filter(c => c.status === "draft" || c.status === "pending").length,
    incoming: comms.filter(c => c.direction === "incoming").length,
    outgoing: comms.filter(c => c.direction === "outgoing").length,
    urgent: comms.filter(c => c.priority === "urgent" || c.priority === "high").length,
  }), [comms]);

  const getSupplierName = (id: number) => suppliers.find(s => s.id === id)?.supplierName || `ספק #${id}`;
  const getTypeLabel = (type: string) => TYPES.find(t => t.value === type)?.label || type;
  const getStatusInfo = (status: string) => STATUSES.find(s => s.value === status) || STATUSES[0];
  const getPriorityInfo = (priority: string) => PRIORITIES.find(p => p.value === priority) || PRIORITIES[1];
  const getTypeIcon = (type: string) => {
    const T = TYPES.find(t => t.value === type)?.icon || Mail;
    return T;
  };

  return (
    <div className="p-6 max-w-7xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold flex items-center gap-2">
            <Mail className="w-6 h-6 text-primary" />
            תקשורת ספקים
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול כל ההתכתבויות, שיחות ופגישות עם ספקים</p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="w-4 h-4" />
          תקשורת חדשה
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
        <Card className="p-3 text-center">
          <p className="text-lg sm:text-2xl font-bold">{stats.total}</p>
          <p className="text-xs text-muted-foreground">סה"כ</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-lg sm:text-2xl font-bold text-blue-400">{stats.sent}</p>
          <p className="text-xs text-muted-foreground">נשלחו</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-lg sm:text-2xl font-bold text-yellow-400">{stats.pending}</p>
          <p className="text-xs text-muted-foreground">ממתינים</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-lg sm:text-2xl font-bold text-green-400">{stats.incoming}</p>
          <p className="text-xs text-muted-foreground">נכנסים</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-lg sm:text-2xl font-bold text-purple-400">{stats.outgoing}</p>
          <p className="text-xs text-muted-foreground">יוצאים</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-lg sm:text-2xl font-bold text-red-400">{stats.urgent}</p>
          <p className="text-xs text-muted-foreground">דחופים</p>
        </Card>
      </div>

      <Card className="p-4 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-0 sm:min-w-[200px]">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
                placeholder="חיפוש לפי נושא, תוכן, נמען..."
                className="pr-10"
              />
            </div>
          </div>
          <select value={filterType} onChange={e => setFilterType(e.target.value)} className="h-10 rounded-xl border border-border bg-background px-3 text-sm">
            <option value="all">כל הסוגים</option>
            {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="h-10 rounded-xl border border-border bg-background px-3 text-sm">
            <option value="all">כל הסטטוסים</option>
            {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select value={filterDirection} onChange={e => setFilterDirection(e.target.value)} className="h-10 rounded-xl border border-border bg-background px-3 text-sm">
            <option value="all">כל הכיוונים</option>
            {DIRECTIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </div>
      </Card>

      {isLoading ? (
        <Card className="p-12 text-center">
          <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-muted-foreground">טוען תקשורת ספקים...</p>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <Inbox className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-lg font-medium mb-2">אין תקשורת עם ספקים</p>
          <p className="text-sm text-muted-foreground mb-4">התחל ליצור תקשורת חדשה עם הספקים שלך</p>
          <Button onClick={openNew} className="gap-2">
            <Plus className="w-4 h-4" />
            תקשורת חדשה
          </Button>
        </Card>
      ) : (
        <div className="space-y-2">
          <BulkActions bulk={bulk} actions={defaultBulkActions} entityName="תקשורת" />
          {filtered.map(item => {
            const statusInfo = getStatusInfo(item.status);
            const priorityInfo = getPriorityInfo(item.priority);
            const TypeIcon = getTypeIcon(item.type);
            return (
              <Card key={item.id} className={`p-4 hover:bg-muted/20 transition-colors cursor-pointer ${bulk.isSelected(item.id) ? "ring-1 ring-primary/50 bg-primary/5" : ""}`} onClick={() => { setViewItem(item); setDetailTab("details"); }}>
                <div className="flex items-start gap-4">
                  <div onClick={e => e.stopPropagation()}><BulkCheckbox bulk={bulk} id={item.id} /></div>
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <TypeIcon className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-sm truncate">{item.subject || "(ללא נושא)"}</h3>
                      {item.priority === "urgent" && <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />}
                      {item.priority === "high" && <Star className="w-4 h-4 text-orange-400 shrink-0" />}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{getSupplierName(item.supplier_id)}</span>
                      <span>|</span>
                      <span>{item.recipient_name || item.recipient_email || "—"}</span>
                      <span>|</span>
                      <span>{getTypeLabel(item.type)}</span>
                    </div>
                    {item.content && (
                      <p className="text-xs text-muted-foreground mt-1 truncate max-w-[500px]">{item.content}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusInfo.color}`}>{statusInfo.label}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${priorityInfo.color}`}>{priorityInfo.label}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {item.direction === "incoming" ? "נכנס" : item.direction === "outgoing" ? "יוצא" : "פנימי"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {item.created_at ? new Date(item.created_at).toLocaleDateString("he-IL") : "—"}
                    </span>
                    <div className="flex items-center gap-0.5">
                      <button className="p-1 hover:bg-muted rounded" onClick={(e) => { e.stopPropagation(); openEdit(item); }}>
                        <Edit2 className="w-3.5 h-3.5" />
                      </button> <button title="שכפול" onClick={async () => { const res = await duplicateRecord(`${API}/supplier-communications`, r.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
                      {isSuperAdmin && (<button className="p-1 hover:bg-red-500/10 rounded" onClick={async (e) => {
                        e.stopPropagation();
                        const ok = await globalConfirm("למחוק תקשורת זו?", { itemName: item.subject || String(item.id), entityType: "תקשורת" }); if (ok) deleteMutation.mutate(item.id);
                      }}>
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      </button>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {viewItem && (
        <Modal isOpen={!!viewItem} onClose={() => setViewItem(null)} title={viewItem.subject || "תקשורת ספק"} size="lg">
          <div className="flex border-b border-border/50 px-4">
            {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
              <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
            ))}
          </div>
          {detailTab === "details" && (
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">ספק</p>
                <p className="font-medium">{getSupplierName(viewItem.supplier_id)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">נמען</p>
                <p className="font-medium">{viewItem.recipient_name || "—"}</p>
                <p className="text-xs text-muted-foreground">{viewItem.recipient_email || ""}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">סוג</p>
                <p className="font-medium">{getTypeLabel(viewItem.type)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">כיוון</p>
                <p className="font-medium">{DIRECTIONS.find(d => d.value === viewItem.direction)?.label || viewItem.direction}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">סטטוס</p>
                <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusInfo(viewItem.status).color}`}>{getStatusInfo(viewItem.status).label}</span>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">עדיפות</p>
                <span className={`text-xs px-2 py-0.5 rounded-full ${getPriorityInfo(viewItem.priority).color}`}>{getPriorityInfo(viewItem.priority).label}</span>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">נשלח ע"י</p>
                <p className="font-medium">{viewItem.sent_by || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">תאריך</p>
                <p className="font-medium">{viewItem.sent_at ? new Date(viewItem.sent_at).toLocaleString("he-IL") : "—"}</p>
              </div>
            </div>
            <div className="border-t border-border pt-4">
              <p className="text-xs text-muted-foreground mb-2">תוכן</p>
              <div className="bg-muted/20 rounded-xl p-4 text-sm whitespace-pre-wrap min-h-[100px]">
                {viewItem.content || "(אין תוכן)"}
              </div>
            </div>
            {viewItem.tags && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">תגיות</p>
                <div className="flex flex-wrap gap-1">
                  {viewItem.tags.split(",").map((tag, i) => (
                    <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">{tag.trim()}</span>
                  ))}
                </div>
              </div>
            )}
            {viewItem.notes && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">הערות</p>
                <p className="text-sm">{viewItem.notes}</p>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <Button onClick={() => { setViewItem(null); openEdit(viewItem); }} className="gap-1">
                <Edit2 className="w-3.5 h-3.5" />
                ערוך
              </Button>
              <Button variant="outline" onClick={() => setViewItem(null)}>סגור</Button>
            </div>
          </div>
          )}
          {detailTab === "related" && (
            <div className="p-4">
              <RelatedRecords entityType="supplier-communications" entityId={viewItem.id} relations={[
                { key: "suppliers", label: "ספקים", endpoint: "/api/suppliers" },
              ]} />
            </div>
          )}
          {detailTab === "docs" && (
            <div className="p-4">
              <AttachmentsSection entityType="supplier-communications" entityId={viewItem.id} />
            </div>
          )}
          {detailTab === "history" && (
            <div className="p-4">
              <ActivityLog entityType="supplier-communications" entityId={viewItem.id} />
            </div>
          )}
        </Modal>
      )}

      {showForm && (
        <Modal isOpen={showForm} onClose={closeForm} title={editing ? "עריכת תקשורת" : "תקשורת חדשה"} size="lg">
          <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>ספק *</Label>
                <select
                  value={form.supplier_id}
                  onChange={e => handleSupplierSelect(Number(e.target.value))}
                  className="mt-1 flex h-12 w-full rounded-xl border border-border bg-background px-4 py-2 text-sm"
                >
                  <option value={0}>— בחר ספק —</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.supplierName}</option>)}
                </select>
              </div>
              <div>
                <Label>סוג תקשורת *</Label>
                <select
                  value={form.type}
                  onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
                  className="mt-1 flex h-12 w-full rounded-xl border border-border bg-background px-4 py-2 text-sm"
                >
                  {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>
            <div>
              <Label>נושא *</Label>
              <Input value={form.subject} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, subject: e.target.value }))} className="mt-1" placeholder="נושא ההודעה / השיחה" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>שם הנמען</Label>
                <Input value={form.recipient_name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, recipient_name: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label>אימייל הנמען</Label>
                <Input type="email" value={form.recipient_email} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, recipient_email: e.target.value }))} className="mt-1" />
              </div>
            </div>
            <div>
              <Label>תוכן *</Label>
              <textarea
                value={form.content}
                onChange={e => setForm(p => ({ ...p, content: e.target.value }))}
                className="mt-1 flex w-full rounded-xl border border-border bg-background px-4 py-3 text-sm min-h-[120px] resize-y"
                placeholder="תוכן ההודעה..."
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label>כיוון</Label>
                <select
                  value={form.direction}
                  onChange={e => setForm(p => ({ ...p, direction: e.target.value }))}
                  className="mt-1 flex h-12 w-full rounded-xl border border-border bg-background px-4 py-2 text-sm"
                >
                  {DIRECTIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </div>
              <div>
                <Label>סטטוס</Label>
                <select
                  value={form.status}
                  onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
                  className="mt-1 flex h-12 w-full rounded-xl border border-border bg-background px-4 py-2 text-sm"
                >
                  {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <Label>עדיפות</Label>
                <select
                  value={form.priority}
                  onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}
                  className="mt-1 flex h-12 w-full rounded-xl border border-border bg-background px-4 py-2 text-sm"
                >
                  {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>נשלח ע"י</Label>
                <Input value={form.sent_by} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, sent_by: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label>תגיות (מופרדות בפסיק)</Label>
                <Input value={form.tags} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, tags: e.target.value }))} className="mt-1" placeholder="הזמנה, דחוף, בדיקה" />
              </div>
            </div>
            <div>
              <Label>הערות</Label>
              <textarea
                value={form.notes}
                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                className="mt-1 flex w-full rounded-xl border border-border bg-background px-4 py-3 text-sm min-h-[60px] resize-y"
                placeholder="הערות פנימיות..."
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                onClick={() => saveMutation.mutate(form)}
                disabled={!form.supplier_id || !form.subject || saveMutation.isPending}
                className="gap-2"
              >
                {saveMutation.isPending ? "שומר..." : (
                  <>
                    <Send className="w-4 h-4" />
                    {editing ? "עדכן" : "שלח / שמור"}
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={closeForm}>ביטול</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
