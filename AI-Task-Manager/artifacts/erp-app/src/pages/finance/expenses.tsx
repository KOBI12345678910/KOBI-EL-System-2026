import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useCallback } from "react";
import {
  Receipt, Plus, Search, Upload, FileImage, Eye, Paperclip, X, FileText,
  CreditCard, DollarSign, Phone, Mail, Smartphone, ChevronDown
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { authJson, authFetch } from "@/lib/utils";
import { VAT_RATE } from "@/utils/money";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";
import StatusTransition from "@/components/status-transition";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const API = "/api";
function fmt(n: number) { return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(n); }
function fmtDate(d: string) { return d ? new Date(d).toLocaleDateString("he-IL") : "-"; }

const statusColors: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-400",
  approved: "bg-blue-500/20 text-blue-400",
  paid: "bg-green-500/20 text-green-400",
  rejected: "bg-red-500/20 text-red-400",
  cancelled: "bg-muted/20 text-muted-foreground",
};
const statusLabels: Record<string, string> = {
  pending: "ממתין",
  approved: "מאושר",
  paid: "שולם",
  rejected: "נדחה",
  cancelled: "בוטל",
};

const CATEGORIES = ["מימון משכנתא", "דלק", "חשמל ומים", "שכירות", "ביטוח", "תחזוקה", "חומרי גלם", "שכר עבודה", "הובלה", "שיווק", "ציוד", "מיסים", "אחר"];

const PAYMENT_TYPES = [
  { value: "bank_transfer", label: "העברה בנקאית" },
  { value: "credit_card_external", label: "סליקת אשראי חיצונית" },
  { value: "cash", label: "מזומן" },
  { value: "check", label: "שיק" },
  { value: "credit_card", label: "כרטיס אשראי" },
];

const EXPENSE_DOC_TYPES = [
  { value: "supplier_invoice_payment", label: "חשבונית ותשלום לספק/ית", desc: "חשבונית ספק עם תיעוד התשלום", icon: FileText, color: "bg-blue-500" },
  { value: "supplier_invoice", label: "חשבונית ספק/ית", desc: "תיעוד חשבונית מספק ללא תשלום", icon: Receipt, color: "bg-green-500" },
  { value: "payment_record", label: "תיעוד תשלום לספק/ית", desc: "רישום תשלום עבור חשבונית קיימת", icon: DollarSign, color: "bg-purple-500" },
  { value: "payment_request", label: "בקשת תשלום מספק/ית", desc: "בקשה לתשלום מספק", icon: CreditCard, color: "bg-orange-500" },
  { value: "credit_note", label: "מסמך זיכוי", desc: "זיכוי/החזר מספק", icon: FileText, color: "bg-red-500" },
];

function UploadZone({ onFileDrop }: { onFileDrop: (file: File) => void }) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragIn = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragOut = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFileDrop(file);
  }, [onFileDrop]);

  return (
    <div
      className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${isDragging ? "border-green-400 bg-green-950/30" : "border-slate-600 hover:border-slate-400 bg-slate-800/30"}`}
      onDragEnter={handleDragIn}
      onDragLeave={handleDragOut}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <Upload className={`w-10 h-10 mx-auto mb-3 ${isDragging ? "text-green-400" : "text-muted-foreground"}`} />
      <div className="text-foreground font-medium mb-1">גררו קובץ לכאן</div>
      <div className="text-muted-foreground text-sm mb-4">או לחצו לבחירת קובץ</div>
      <div className="flex justify-center gap-6 text-xs text-muted-foreground">
        <div className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> מייל</div>
        <div className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> WhatsApp</div>
        <div className="flex items-center gap-1"><Smartphone className="w-3.5 h-3.5" /> נייד</div>
      </div>
      <input ref={inputRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={e => { const f = e.target.files?.[0]; if (f) onFileDrop(f); e.target.value = ""; }} />
    </div>
  );
}

export default function ExpensesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailTab, setDetailTab] = useState("details");
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const { selectedIds, setSelectedIds, toggle, toggleAll, isSelected } = useBulkSelection();
  const expenseValidation = useFormValidation({ amount: { required: true, min: 0 }, description: { required: true } });
  const [docTypeDialogOpen, setDocTypeDialogOpen] = useState(false);
  const [selectedDocType, setSelectedDocType] = useState("");
  const [showUploadZone, setShowUploadZone] = useState(false);
  const [attachExpenseId, setAttachExpenseId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    expense_date: new Date().toISOString().split("T")[0],
    category: "",
    description: "",
    amount: "",
    vat_amount: "",
    payment_method: "bank_transfer",
    vendor_name: "",
    receipt_number: "",
    department: "",
    notes: "",
    file_url: "",
    file_name: "",
    document_type: "",
  });
  const createFileRef = useRef<HTMLInputElement>(null);

  const { data } = useQuery({
    queryKey: ["expenses", statusFilter, categoryFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (categoryFilter !== "all") params.set("category", categoryFilter);
      return authJson(`${API}/finance/expenses?${params}`);
    },
  });

  const createMutation = useMutation({
    mutationFn: (body: any) => authJson(`${API}/finance/expenses`, {
      method: "POST", body: JSON.stringify(body),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      setDialogOpen(false);
      setForm({
        expense_date: new Date().toISOString().split("T")[0],
        category: "", description: "", amount: "", vat_amount: "",
        payment_method: "bank_transfer", vendor_name: "", receipt_number: "",
        department: "", notes: "", file_url: "", file_name: "", document_type: "",
      });
      toast({ title: "הוצאה נוצרה בהצלחה" });
    },
  });

  const attachFileMutation = useMutation({
    mutationFn: ({ id, file_url, file_name }: { id: number; file_url: string; file_name: string }) =>
      authJson(`${API}/finance/expenses/${id}/file`, {
        method: "PUT",
        body: JSON.stringify({ file_url, file_name }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      setAttachExpenseId(null);
      toast({ title: "קובץ צורף בהצלחה" });
    },
  });

  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });

  const handleFileSelect = async (file: File, expenseId: number) => {
    const dataUrl = await fileToDataUrl(file);
    attachFileMutation.mutate({ id: expenseId, file_url: dataUrl, file_name: file.name });
  };

  const handleCreateFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const dataUrl = await fileToDataUrl(file);
      setForm(prev => ({ ...prev, file_name: file.name, file_url: dataUrl }));
    }
  };

  const handleUploadZoneDrop = async (file: File) => {
    const dataUrl = await fileToDataUrl(file);
    setForm(prev => ({ ...prev, file_name: file.name, file_url: dataUrl }));
    setShowUploadZone(false);
    setDialogOpen(true);
    toast({ title: `קובץ "${file.name}" נטען`, description: "מלאו את פרטי ההוצאה" });
  };

  const handleDocTypeSelect = (docType: string) => {
    setSelectedDocType(docType);
    setDocTypeDialogOpen(false);
    setForm(prev => ({ ...prev, document_type: docType }));
    setDialogOpen(true);
  };

  const items = (data?.data || []).filter((item: any) =>
    !search || item.description?.toLowerCase().includes(search.toLowerCase()) || item.vendor_name?.toLowerCase().includes(search.toLowerCase())
  );

  const totalAmount = items.reduce((s: number, i: any) => s + Number(i.amount || 0), 0);
  const pendingCount = items.filter((i: any) => i.status === "pending").length;
  const paidCount = items.filter((i: any) => i.status === "paid").length;

  return (
    <div className="space-y-4 sm:space-y-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <Receipt className="w-6 h-6 text-red-400" /> הוצאות
          </h1>
          <p className="text-muted-foreground mt-1">ניהול הוצאות, חשבוניות ספקים ותשלומים</p>
        </div>
        <div className="flex gap-2">
          <Button
            className="bg-green-600 hover:bg-green-700 text-foreground font-medium"
            onClick={() => setShowUploadZone(!showUploadZone)}
          >
            <Upload className="w-4 h-4 ml-2" />העלאת הוצאות
          </Button>
          <Button
            className="bg-blue-600 hover:bg-blue-700 text-foreground font-medium"
            onClick={() => setDocTypeDialogOpen(true)}
          >
            <Plus className="w-4 h-4 ml-2" />יצירת מסמך הוצאה
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="border-slate-600">
                <Plus className="w-4 h-4 ml-2" />הוצאה מהירה
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-slate-900 border-slate-700 max-w-lg" dir="rtl">
              <DialogHeader>
                <DialogTitle>
                  {selectedDocType ? (EXPENSE_DOC_TYPES.find(t => t.value === selectedDocType)?.label || "הוצאה חדשה") : "הוצאה חדשה"}
                </DialogTitle>
              </DialogHeader>
              <div className="grid gap-4">
                {selectedDocType && (
                  <div className="bg-slate-800 rounded-lg p-3 text-sm text-slate-300 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-400" />
                    {EXPENSE_DOC_TYPES.find(t => t.value === selectedDocType)?.desc}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><Label>תאריך</Label><Input type="date" value={form.expense_date} onChange={e => setForm({ ...form, expense_date: e.target.value })} className="bg-slate-800 border-slate-700" /></div>
                  <div>
                    <Label>קטגוריה (פריט הוצאה)</Label>
                    <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                      <SelectTrigger className="bg-slate-800 border-slate-700"><SelectValue placeholder="בחר" /></SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label>תיאור / טקסט חופשי</Label><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="bg-slate-800 border-slate-700" /></div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div><Label>סכום</Label><Input type="number" value={form.amount} onChange={e => {
                    const amt = e.target.value;
                    const vat = String(Math.round(Number(amt || 0) * VAT_RATE * 100) / 100);
                    setForm({ ...form, amount: amt, vat_amount: vat });
                  }} className="bg-slate-800 border-slate-700" /></div>
                  <div><Label>מע"מ 17%</Label><Input type="number" value={form.vat_amount} onChange={e => setForm({ ...form, vat_amount: e.target.value })} className="bg-slate-800 border-slate-700" /></div>
                  <div>
                    <Label>אמצעי תשלום</Label>
                    <Select value={form.payment_method} onValueChange={v => setForm({ ...form, payment_method: v })}>
                      <SelectTrigger className="bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        {PAYMENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="bg-slate-800 rounded-lg p-3 text-center">
                  <span className="text-muted-foreground text-sm">סה"כ כולל מע"מ: </span>
                  <span className="text-red-400 font-bold text-lg">{fmt(Number(form.amount || 0) + Number(form.vat_amount || 0))}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><Label>שם ספק</Label><Input value={form.vendor_name} onChange={e => setForm({ ...form, vendor_name: e.target.value })} className="bg-slate-800 border-slate-700" /></div>
                  <div><Label>מס׳ קבלה</Label><Input value={form.receipt_number} onChange={e => setForm({ ...form, receipt_number: e.target.value })} className="bg-slate-800 border-slate-700" /></div>
                </div>
                <div>
                  <Label>צירוף קובץ</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Button type="button" variant="outline" size="sm" className="border-slate-600" onClick={() => createFileRef.current?.click()}>
                      <Upload className="w-4 h-4 ml-1" />בחר קובץ
                    </Button>
                    {form.file_name && (
                      <div className="flex items-center gap-1 text-sm text-green-400">
                        <Paperclip className="w-3 h-3" />
                        <span>{form.file_name}</span>
                        <button onClick={() => setForm(prev => ({ ...prev, file_name: "", file_url: "" }))} className="text-muted-foreground hover:text-red-400">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                    <input ref={createFileRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={handleCreateFileSelect} />
                  </div>
                </div>
                <div><Label>הערות</Label><Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="bg-slate-800 border-slate-700" /></div>
                <Button onClick={() => createMutation.mutate(form)} disabled={!form.category || !form.description || !form.amount} className="bg-red-600 hover:bg-red-700 text-foreground">
                  <Plus className="w-4 h-4 ml-1" />צור הוצאה
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Dialog open={docTypeDialogOpen} onOpenChange={setDocTypeDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-md" dir="rtl">
          <DialogHeader><DialogTitle>בחירת סוג מסמך הוצאה</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {EXPENSE_DOC_TYPES.map(dt => (
              <button
                key={dt.value}
                className="w-full flex items-center gap-3 p-4 rounded-lg border border-slate-700 hover:border-slate-500 hover:bg-slate-800/50 transition-all text-right"
                onClick={() => handleDocTypeSelect(dt.value)}
              >
                <div className={`w-10 h-10 rounded-lg ${dt.color} flex items-center justify-center flex-shrink-0`}>
                  <dt.icon className="w-5 h-5 text-foreground" />
                </div>
                <div>
                  <div className="text-foreground font-medium">{dt.label}</div>
                  <div className="text-muted-foreground text-xs mt-0.5">{dt.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {showUploadZone && (
        <UploadZone onFileDrop={handleUploadZoneDrop} />
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardContent className="p-4 text-center">
            <div className="text-lg sm:text-2xl font-bold text-red-400">{fmt(totalAmount)}</div>
            <div className="text-xs text-muted-foreground mt-1">סה"כ הוצאות</div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardContent className="p-4 text-center">
            <div className="text-lg sm:text-2xl font-bold text-foreground">{items.length}</div>
            <div className="text-xs text-muted-foreground mt-1">מסמכים</div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardContent className="p-4 text-center">
            <div className="text-lg sm:text-2xl font-bold text-yellow-400">{pendingCount}</div>
            <div className="text-xs text-muted-foreground mt-1">ממתינים</div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardContent className="p-4 text-center">
            <div className="text-lg sm:text-2xl font-bold text-green-400">{paidCount}</div>
            <div className="text-xs text-muted-foreground mt-1">שולמו</div>
          </CardContent>
        </Card>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".pdf,.jpg,.jpeg,.png"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && attachExpenseId) {
            handleFileSelect(file, attachExpenseId);
          }
          e.target.value = "";
        }}
      />

      <div className="flex gap-3 items-center flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי ספק, תיאור..." className="pr-9 bg-slate-800 border-slate-700" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            <SelectItem value="all">כל הסטטוסים</SelectItem>
            <SelectItem value="pending">ממתין</SelectItem>
            <SelectItem value="approved">מאושר</SelectItem>
            <SelectItem value="paid">שולם</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-40 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            <SelectItem value="all">כל הקטגוריות</SelectItem>
            {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="text-sm text-muted-foreground">סה"כ: <span className="text-foreground font-medium">{fmt(totalAmount)}</span> ({items.length} רשומות)</div>
      </div>

      <Card className="bg-slate-900/50 border-slate-700/50">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50 bg-slate-800/30">
                  <th className="p-3 text-right text-muted-foreground font-medium w-[60px]">קובץ</th>
                  <th className="p-3 text-right text-muted-foreground font-medium">שם הכרטיס</th>
                  <th className="p-3 text-right text-muted-foreground font-medium">תאריך</th>
                  <th className="p-3 text-right text-muted-foreground font-medium">ספק</th>
                  <th className="p-3 text-right text-muted-foreground font-medium">סכום</th>
                  <th className="p-3 text-right text-muted-foreground font-medium">פריט הוצאה</th>
                  <th className="p-3 text-right text-muted-foreground font-medium">סוג תשלום</th>
                  <th className="p-3 text-right text-muted-foreground font-medium">סטטוס</th>
                  <th className="p-3 text-right text-muted-foreground font-medium">מסמכים מקושרים</th>
                  <th className="p-3 text-right text-muted-foreground font-medium">טקסט חופשי</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item: any) => {
                  const payLabel = PAYMENT_TYPES.find(t => t.value === item.payment_method)?.label || item.payment_method || "-";
                  const docTypeLabel = EXPENSE_DOC_TYPES.find(t => t.value === item.document_type)?.label || "";
                  return (
                    <tr key={item.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 cursor-pointer" onClick={() => { setSelectedItem(item); setDetailTab("details"); }}>
                      <td className="p-3">
                        {item.file_url && item.file_url.startsWith("data:image") ? (
                          <img
                            src={item.file_url}
                            alt={item.file_name || "תמונת הוצאה"}
                            className="w-10 h-10 rounded object-cover border border-green-700/50 cursor-pointer hover:opacity-80"
                            title={item.file_name || "קובץ מצורף"}
                            onClick={() => window.open(item.file_url, "_blank")}
                          />
                        ) : item.file_url || item.file_name ? (
                          <div
                            className="w-10 h-10 rounded bg-green-900/30 border border-green-700/50 flex items-center justify-center cursor-pointer hover:bg-green-800/30"
                            title={item.file_name || "קובץ מצורף"}
                            onClick={() => item.file_url && window.open(item.file_url, "_blank")}
                          >
                            <FileImage className="w-5 h-5 text-green-400" />
                          </div>
                        ) : (
                          <button
                            className="w-10 h-10 rounded bg-slate-800 flex items-center justify-center hover:bg-slate-700 transition-colors"
                            title="צרף קובץ"
                            onClick={() => {
                              setAttachExpenseId(item.id);
                              fileInputRef.current?.click();
                            }}
                          >
                            <Paperclip className="w-4 h-4 text-muted-foreground" />
                          </button>
                        )}
                      </td>
                      <td className="p-3 text-foreground font-medium">
                        {docTypeLabel ? `${docTypeLabel} ` : ""}
                        {item.receipt_number ? `#${item.receipt_number}` : `#${item.id}`}
                      </td>
                      <td className="p-3 text-slate-300">{fmtDate(item.expense_date)}</td>
                      <td className="p-3 text-slate-300">{item.vendor_name || "-"}</td>
                      <td className="p-3 text-red-400 font-medium">{fmt(-Math.abs(Number(item.amount || 0)))}</td>
                      <td className="p-3 text-slate-300">{item.category || "-"}</td>
                      <td className="p-3 text-slate-300">{payLabel}</td>
                      <td className="p-3"><Badge className={statusColors[item.status] || ""}>{statusLabels[item.status] || item.status}</Badge></td>
                      <td className="p-3 text-muted-foreground">{item.linked_document || "-"}</td>
                      <td className="p-3 text-foreground">{item.description || "-"}</td>
                    </tr>
                  );
                })}
                {items.length === 0 && <tr><td colSpan={10} className="p-8 text-center text-muted-foreground">אין הוצאות</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {selectedItem && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setSelectedItem(null)}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-6 border-b border-slate-700">
              <h2 className="text-xl font-bold text-foreground">הוצאה #{selectedItem.receipt_number || selectedItem.id}</h2>
              <button onClick={() => setSelectedItem(null)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="flex border-b border-border/50">
              {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
              ))}
            </div>
            <div className="p-6">
              {detailTab === "details" && (
                <div className="space-y-4">
                  <StatusTransition currentStatus={selectedItem.status} statuses={[{key:"pending",label:"ממתין",color:"bg-yellow-500"},{key:"approved",label:"מאושר",color:"bg-blue-500"},{key:"paid",label:"שולם",color:"bg-green-500"},{key:"rejected",label:"נדחה",color:"bg-red-500"}]} onTransition={async (s) => { await authFetch(`${API}/finance/expenses/${selectedItem.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: s }) }); qc.invalidateQueries({ queryKey: ["expenses"] }); setSelectedItem({ ...selectedItem, status: s }); }} />
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <div><div className="text-xs text-muted-foreground mb-1">תאריך</div><div className="text-sm text-foreground">{fmtDate(selectedItem.expense_date)}</div></div>
                    <div><div className="text-xs text-muted-foreground mb-1">ספק</div><div className="text-sm text-foreground">{selectedItem.vendor_name || "-"}</div></div>
                    <div><div className="text-xs text-muted-foreground mb-1">סכום</div><div className="text-sm text-red-400 font-bold">{fmt(-Math.abs(Number(selectedItem.amount || 0)))}</div></div>
                    <div><div className="text-xs text-muted-foreground mb-1">קטגוריה</div><div className="text-sm text-foreground">{selectedItem.category || "-"}</div></div>
                    <div><div className="text-xs text-muted-foreground mb-1">תיאור</div><div className="text-sm text-foreground">{selectedItem.description || "-"}</div></div>
                    <div><div className="text-xs text-muted-foreground mb-1">הערות</div><div className="text-sm text-foreground">{selectedItem.notes || "-"}</div></div>
                  </div>
                </div>
              )}
              {detailTab === "related" && <RelatedRecords entityType="expenses" entityId={selectedItem.id} tabs={[{ key: "claims", label: "תביעות", endpoint: `${API}/expense-claims?expense_id=${selectedItem.id}` }, { key: "approvals", label: "אישורים", endpoint: `${API}/approvals?expense_id=${selectedItem.id}` }]} />}
              {detailTab === "docs" && <AttachmentsSection entityType="expenses" entityId={selectedItem.id} />}
              {detailTab === "history" && <ActivityLog entityType="expenses" entityId={selectedItem.id} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
