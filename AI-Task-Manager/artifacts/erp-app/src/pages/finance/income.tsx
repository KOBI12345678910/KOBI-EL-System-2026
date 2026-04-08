import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import {
  DollarSign, Plus, Search, FileText, Copy, Mail, Download, Printer,
  Phone, Share2, X, Eye, Edit2, Ban, MoreHorizontal, ChevronDown, CreditCard
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
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const API = "/api";
function fmt(n: number) { return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 2 }).format(n); }
function fmtN(n: number) { return new Intl.NumberFormat("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n); }
function fmtDate(d: string) { return d ? new Date(d).toLocaleDateString("he-IL") : "-"; }

const DOC_TYPES = [
  { value: "tax_invoice_receipt", label: "חשבונית מס/קבלה" },
  { value: "payment_request", label: "דרישת תשלום" },
  { value: "receipt", label: "קבלה" },
  { value: "tax_invoice", label: "חשבונית מס" },
  { value: "proforma", label: "חשבונית עסקה" },
  { value: "delivery_note", label: "תעודת משלוח" },
  { value: "price_quote", label: "הצעת מחיר" },
  { value: "credit_note", label: "חשבונית זיכוי" },
];

const PAYMENT_TYPES = [
  { value: "check", label: "שיק מס'" },
  { value: "credit_card", label: "סליקת אשראי" },
  { value: "bank_transfer", label: "העברה בנקאית" },
  { value: "cash", label: "מזומן" },
  { value: "credit_card_external", label: "Charge by credit card" },
];

const statusColors: Record<string, string> = {
  final: "bg-green-500/20 text-green-400 border-green-500/30",
  draft: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  cancelled: "bg-red-500/20 text-red-400 border-red-500/30",
  closed: "bg-blue-500/20 text-blue-400 border-blue-500/30",
};
const statusLabels: Record<string, string> = {
  final: "סופי",
  draft: "טיוטה",
  cancelled: "בוטל",
  closed: "סגור",
};

const COMPANY = {
  name: "טכנו כל עוזי",
  subtitle: "מסגרות ברזל ואלומיניום",
  phone: "0778048340",
  fax: "036872494",
  email: "support@technokoluzi.com",
  website: "technokoluzi.com",
  address: "ריבל 39 תל אביב, ישראל",
  taxId: "054227129",
};

function InvoicePreview({ item, onClose }: { item: any; onClose: () => void }) {
  const printRef = useRef<HTMLDivElement>(null);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const docLabel = DOC_TYPES.find(t => t.value === item.document_type)?.label || item.document_type || "חשבונית מס/קבלה";
  const payLabel = PAYMENT_TYPES.find(t => t.value === item.payment_method)?.label || item.payment_method || "-";
  const amount = Number(item.amount || 0);
  const vatRate = 17;
  const vatAmount = Number(item.vat_amount || 0) || Math.round(amount * (vatRate / 100) * 100) / 100;
  const totalWithVat = Number(item.total_with_vat || 0) || amount + vatAmount;
  const docNumber = item.document_number || item.id;
  const products = item.products || item.description || "";
  const productLines = products ? products.split(",").map((p: string) => p.trim()).filter(Boolean) : ["שירותים"];

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html dir="rtl"><head><title>${docLabel} ${docNumber}</title><style>body{font-family:Arial,sans-serif;padding:40px;direction:rtl}table{width:100%;border-collapse:collapse}th,td{padding:8px 12px;text-align:right;border-bottom:1px solid #e5e7eb}.header{text-align:center;margin-bottom:30px}.company-name{font-size:24px;font-weight:bold}.total{font-size:20px;font-weight:bold}@media print{body{padding:20px}}</style></head><body>${content.innerHTML}</body></html>`);
    win.document.close();
    win.print();
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center overflow-auto pt-4 pb-8">
      <div className="bg-card border border-border text-foreground rounded-xl shadow-2xl w-full max-w-4xl relative" dir="rtl">
        <div className="flex items-center justify-between p-4 border-b bg-muted/30 rounded-t-xl">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => setShowActionsMenu(!showActionsMenu)} className="relative">
              <MoreHorizontal className="w-4 h-4 ml-1" /> פעולות
              {showActionsMenu && (
                <div className="absolute top-full right-0 mt-1 bg-card border rounded-lg shadow-lg z-10 min-w-0 sm:min-w-[200px]">
                  <button className="flex items-center gap-2 w-full px-4 py-2.5 text-right hover:bg-muted/30 text-sm"><Edit2 className="w-4 h-4" /> עריכה</button>
                  <button className="flex items-center gap-2 w-full px-4 py-2.5 text-right hover:bg-muted/30 text-sm"><Copy className="w-4 h-4" /> חזרה אל חשבוניות מס/קבלות</button>
                  <button className="flex items-center gap-2 w-full px-4 py-2.5 text-right hover:bg-muted/30 text-sm"><MoreHorizontal className="w-4 h-4" /> פעולות נוספות</button>
                </div>
              )}
            </Button>
            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-foreground relative" onClick={() => setShowShareMenu(!showShareMenu)}>
              <Share2 className="w-4 h-4 ml-1" /> שיתוף המסמך
              {showShareMenu && (
                <div className="absolute top-full right-0 mt-1 bg-card border rounded-lg shadow-lg z-10 min-w-[220px] text-foreground">
                  <button className="flex items-center gap-2 w-full px-4 py-2.5 text-right hover:bg-muted/30 text-sm"><Mail className="w-4 h-4" /> שליחה במייל</button>
                  <button onClick={handlePrint} className="flex items-center gap-2 w-full px-4 py-2.5 text-right hover:bg-muted/30 text-sm"><Download className="w-4 h-4" /> הורדת העתק נאמן למקור ב-PDF</button>
                  <button className="flex items-center gap-2 w-full px-4 py-2.5 text-right hover:bg-muted/30 text-sm"><Download className="w-4 h-4" /> הורדת העתק ב-PDF</button>
                  <button className="flex items-center gap-2 w-full px-4 py-2.5 text-right hover:bg-muted/30 text-sm"><Phone className="w-4 h-4" /> שליחה ב-WhatsApp</button>
                  <button onClick={handlePrint} className="flex items-center gap-2 w-full px-4 py-2.5 text-right hover:bg-muted/30 text-sm"><Printer className="w-4 h-4" /> הדפסה</button>
                </div>
              )}
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-foreground">{docLabel} / {docNumber}</h2>
            <button onClick={onClose} className="p-1 hover:bg-muted rounded"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="bg-blue-900 text-foreground p-6 flex items-center justify-between">
          <div className="flex gap-8">
            <div className="text-center">
              <div className="text-xs opacity-80">תאריך המסמך</div>
              <div className="font-bold text-lg">{fmtDate(item.invoice_date || item.created_at)}</div>
            </div>
            <div className="text-center">
              <div className="text-xs opacity-80">סכום המסמך</div>
              <div className="font-bold text-lg">₪{fmtN(totalWithVat)}</div>
            </div>
            <div className="text-center">
              <div className="text-xs opacity-80">לקוח/ה</div>
              <div className="font-bold text-lg">{item.customer_name || "-"}</div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 p-4 border-b">
          <button className="px-6 py-2 bg-blue-900 text-foreground rounded-lg font-medium">דיכוי (ביטול/תיקון) המסמך</button>
          <button className="px-6 py-2 border-2 border-border rounded-lg font-medium text-foreground hover:bg-muted/30">שכפול</button>
        </div>

        <div className="p-4 flex gap-3 border-b">
          <div className="flex flex-col items-center gap-1">
            <div className="w-10 h-10 bg-muted/50 rounded-lg flex items-center justify-center"><Mail className="w-5 h-5 text-muted-foreground" /></div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="w-10 h-10 bg-muted/50 rounded-lg flex items-center justify-center"><Download className="w-5 h-5 text-muted-foreground" /></div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="w-10 h-10 bg-muted/50 rounded-lg flex items-center justify-center"><Phone className="w-5 h-5 text-muted-foreground" /></div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="w-10 h-10 bg-muted/50 rounded-lg flex items-center justify-center"><Printer className="w-5 h-5 text-muted-foreground" /></div>
          </div>
          <div className="text-sm text-muted-foreground mr-2 self-center">שיתוף המסמך</div>
        </div>

        <div ref={printRef} className="p-8">
          <div className="border rounded-lg p-6 mb-6">
            <div className="text-center mb-4">
              <h3 className="text-lg sm:text-2xl font-bold">{COMPANY.name}</h3>
              <p className="text-muted-foreground">{COMPANY.subtitle}</p>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground flex-wrap gap-2">
              <div className="flex items-center gap-1">
                <span>עוסק מורשה: {COMPANY.taxId}</span>
              </div>
              <div className="flex items-center gap-1">{COMPANY.email}</div>
              <div className="flex items-center gap-1">{COMPANY.phone}</div>
              <div className="flex items-center gap-1">{COMPANY.fax}</div>
              <div className="flex items-center gap-1">{COMPANY.address}</div>
              <div className="flex items-center gap-1">{COMPANY.website}</div>
            </div>
          </div>

          <div className="flex justify-between items-start mb-6">
            <div className="text-sm text-muted-foreground">
              תצוגה מקדימה | {fmtDate(item.invoice_date || item.created_at)}
            </div>
            <div className="text-left">
              <h2 className="text-lg sm:text-2xl font-bold">{docLabel} {docNumber}</h2>
            </div>
          </div>

          <div className="mb-6">
            <div className="text-sm text-muted-foreground">לכבוד:</div>
            <div className="text-lg font-bold">{item.customer_name || "-"}</div>
            {item.customer_tax_id && <div className="text-sm text-muted-foreground">מספר מזהה: {item.customer_tax_id} | סלפון: 000000000 | כתובת: עיר</div>}
          </div>

          <table className="w-full mb-6">
            <thead>
              <tr className="border-b-2 border-border">
                <th className="py-2 text-right text-sm font-medium text-muted-foreground">סה"כ</th>
                <th className="py-2 text-right text-sm font-medium text-muted-foreground">כמות</th>
                <th className="py-2 text-right text-sm font-medium text-muted-foreground">מוצר/שירות</th>
              </tr>
            </thead>
            <tbody>
              {productLines.map((p: string, i: number) => (
                <tr key={i} className="border-b border-border">
                  <td className="py-3 text-sm">{fmtN(amount / productLines.length)}</td>
                  <td className="py-3 text-sm">1</td>
                  <td className="py-3">
                    <div className="font-medium">{p}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="space-y-2 max-w-xs">
            <div className="flex justify-between text-sm">
              <span>{fmtN(amount)}</span>
              <span className="text-muted-foreground">סה"כ ללא מע"מ</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>{fmtN(vatAmount)}</span>
              <span className="text-muted-foreground">מע"מ {vatRate}%</span>
            </div>
            <div className="flex justify-between text-lg font-bold border-t pt-2 mt-2">
              <span>₪ {fmtN(totalWithVat)}</span>
              <span>סה"כ כולל מע"מ</span>
            </div>
          </div>

          <div className="mt-8 border-t pt-4">
            <table className="w-full mb-4">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-2 text-right text-sm font-medium text-muted-foreground">סכום</th>
                  <th className="py-2 text-right text-sm font-medium text-muted-foreground">אמצעי תשלום</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="py-2 text-sm">₪{fmtN(totalWithVat)}</td>
                  <td className="py-2 text-sm">{payLabel}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-8 border-t pt-6 text-center">
            <div className="text-sm text-muted-foreground">חתימה _______________</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function IncomePage() {
  const [detailTab, setDetailTab] = useState("details");
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const { selectedIds, setSelectedIds, toggle, toggleAll, isSelected } = useBulkSelection();
  const incomeValidation = useFormValidation({ customer_name: { required: true }, amount: { required: true, min: 0 } });
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [docTypeFilter, setDocTypeFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewItem, setViewItem] = useState<any>(null);
  const [form, setForm] = useState({
    document_type: "tax_invoice_receipt",
    customer_name: "",
    description: "",
    amount: "",
    vat_amount: "",
    payment_method: "bank_transfer",
    invoice_date: new Date().toISOString().split("T")[0],
    due_date: "",
    products: "",
    status: "final",
  });

  const { data } = useQuery({
    queryKey: ["income-documents", statusFilter, docTypeFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (docTypeFilter !== "all") params.set("document_type", docTypeFilter);
      return authJson(`${API}/finance/income?${params}`);
    },
  });

  const createMutation = useMutation({
    mutationFn: (body: any) => authJson(`${API}/finance/income`, {
      method: "POST", body: JSON.stringify(body),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["income-documents"] });
      setDialogOpen(false);
      toast({ title: "מסמך הכנסה נוצר בהצלחה" });
    },
  });

  const items = (data?.data || []).filter((item: any) =>
    !search || item.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
    item.document_number?.includes(search) || item.description?.toLowerCase().includes(search.toLowerCase())
  );

  const totalAmount = items.reduce((s: number, i: any) => s + Number(i.amount || 0), 0);

  const autoCalcVat = (amt: string) => {
    const a = Number(amt) || 0;
    return String(Math.round(a * VAT_RATE * 100) / 100);
  };

  return (
    <div className="space-y-4 sm:space-y-6" dir="rtl">
      {viewItem && <InvoicePreview item={viewItem} onClose={() => setViewItem(null)} />}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-yellow-400" /> הכנסות
          </h1>
          <p className="text-muted-foreground mt-1">ניהול מסמכי הכנסות, חשבוניות, קבלות ודרישות תשלום</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-yellow-500 hover:bg-yellow-600 text-yellow-950 font-medium">
                <Plus className="w-4 h-4 ml-2" />יצירת חשבונית מס/קבלה
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-slate-900 border-slate-700 max-w-lg" dir="rtl">
              <DialogHeader><DialogTitle>יצירת מסמך הכנסה</DialogTitle></DialogHeader>
              <div className="grid gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label>סוג מסמך</Label>
                    <Select value={form.document_type} onValueChange={v => setForm({ ...form, document_type: v })}>
                      <SelectTrigger className="bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        {DOC_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>שם לקוח *</Label><Input value={form.customer_name} onChange={e => setForm({ ...form, customer_name: e.target.value })} placeholder="שם הלקוח" className="bg-slate-800 border-slate-700" /></div>
                </div>
                <div><Label>תיאור / מוצרים</Label><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="תיאור המסמך" className="bg-slate-800 border-slate-700" /></div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Label>סכום לפני מע"מ *</Label>
                    <Input type="number" value={form.amount} onChange={e => {
                      const amt = e.target.value;
                      setForm({ ...form, amount: amt, vat_amount: autoCalcVat(amt) });
                    }} placeholder="0.00" className="bg-slate-800 border-slate-700" />
                  </div>
                  <div>
                    <Label>מע"מ 17%</Label>
                    <Input type="number" value={form.vat_amount} onChange={e => setForm({ ...form, vat_amount: e.target.value })} className="bg-slate-800 border-slate-700" />
                  </div>
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
                  <span className="text-yellow-400 font-bold text-lg">{fmt(Number(form.amount || 0) + Number(form.vat_amount || 0))}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><Label>תאריך מסמך</Label><Input type="date" value={form.invoice_date} onChange={e => setForm({ ...form, invoice_date: e.target.value })} className="bg-slate-800 border-slate-700" /></div>
                  <div><Label>תאריך לתשלום</Label><Input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} className="bg-slate-800 border-slate-700" /></div>
                </div>
                <div><Label>מוצרים / שירותים</Label><Input value={form.products} onChange={e => setForm({ ...form, products: e.target.value })} placeholder="דלתות, חלונות, מסגרות..." className="bg-slate-800 border-slate-700" /></div>
                <Button onClick={() => createMutation.mutate(form)} disabled={!form.customer_name || !form.amount} className="bg-yellow-500 hover:bg-yellow-600 text-yellow-950">
                  <Plus className="w-4 h-4 ml-1" />צור מסמך
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Button variant="outline" className="border-slate-600" onClick={() => { setForm({ ...form, document_type: "proforma" }); setDialogOpen(true); }}>
            <FileText className="w-4 h-4 ml-2" />יצירת מסמך אחר
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardContent className="p-4 text-center">
            <div className="text-lg sm:text-2xl font-bold text-yellow-400">{fmt(totalAmount)}</div>
            <div className="text-xs text-muted-foreground mt-1">סה"כ הכנסות</div>
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
            <div className="text-lg sm:text-2xl font-bold text-green-400">{items.filter((i: any) => i.status === "final").length}</div>
            <div className="text-xs text-muted-foreground mt-1">סופיים</div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardContent className="p-4 text-center">
            <div className="text-lg sm:text-2xl font-bold text-yellow-400">{items.filter((i: any) => i.status === "draft").length}</div>
            <div className="text-xs text-muted-foreground mt-1">טיוטות</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-3 items-center flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי לקוח, מספר מסמך..." className="pr-9 bg-slate-800 border-slate-700" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            <SelectItem value="all">כל הסטטוסים</SelectItem>
            <SelectItem value="final">סופי</SelectItem>
            <SelectItem value="draft">טיוטה</SelectItem>
            <SelectItem value="cancelled">בוטל</SelectItem>
          </SelectContent>
        </Select>
        <Select value={docTypeFilter} onValueChange={setDocTypeFilter}>
          <SelectTrigger className="w-44 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            <SelectItem value="all">כל סוגי המסמכים</SelectItem>
            {DOC_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="text-sm text-muted-foreground">
          הצגת פילטרים | סה"כ: <span className="text-foreground font-medium">{fmt(totalAmount)}</span> ({items.length})
        </div>
      </div>

      <BulkActions items={items} selectedIds={selectedIds} onSelectionChange={setSelectedIds} actions={[
        defaultBulkActions.delete(async (ids) => { await Promise.allSettled(ids.map(id => authFetch(`${API}/finance/income/${id}`, { method: "DELETE" }))); qc.invalidateQueries({ queryKey: ["income-documents"] }); }),
        defaultBulkActions.export(async (ids) => { const csv = items.filter((r: any) => ids.includes(String(r.id))).map((r: any) => `${r.document_number},${r.customer_name},${r.amount},${r.status}`).join("\n"); const blob = new Blob([csv], { type: "text/csv" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "income.csv"; a.click(); }),
      ]} />

      <Card className="bg-slate-900/50 border-slate-700/50">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50 bg-slate-800/30">
                  <th className="p-3"><BulkCheckbox items={items} selectedIds={selectedIds} onToggleAll={(ids) => toggleAll(ids)} type="header" /></th>
                  <th className="p-3 text-right text-muted-foreground font-medium">שם הכרטיס</th>
                  <th className="p-3 text-right text-muted-foreground font-medium">תאריך</th>
                  <th className="p-3 text-right text-muted-foreground font-medium">לקוח/ה</th>
                  <th className="p-3 text-right text-muted-foreground font-medium">סכום</th>
                  <th className="p-3 text-right text-muted-foreground font-medium">מוצר/שירותים</th>
                  <th className="p-3 text-right text-muted-foreground font-medium">סוג תשלום</th>
                  <th className="p-3 text-right text-muted-foreground font-medium">סטטוס</th>
                  <th className="p-3 text-right text-muted-foreground font-medium">מסמכים מקושרים</th>
                  <th className="p-3 text-center text-muted-foreground font-medium w-10"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item: any) => {
                  const docLabel = DOC_TYPES.find(t => t.value === item.document_type)?.label || item.document_type;
                  const payLabel = PAYMENT_TYPES.find(t => t.value === item.payment_method)?.label || item.payment_method || "-";
                  return (
                    <tr key={item.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 cursor-pointer" onClick={() => setViewItem(item)}>
                      <td className="p-3" onClick={e => e.stopPropagation()}><BulkCheckbox id={String(item.id)} isSelected={isSelected(String(item.id))} onToggle={() => toggle(String(item.id))} type="row" /></td>
                      <td className="p-3 text-foreground font-medium">{docLabel} / {item.document_number || item.id}</td>
                      <td className="p-3 text-slate-300">{fmtDate(item.invoice_date || item.created_at)}</td>
                      <td className="p-3 text-slate-300">{item.customer_name || "-"}</td>
                      <td className="p-3 text-yellow-400 font-medium">{fmt(Number(item.amount || 0))}</td>
                      <td className="p-3 text-muted-foreground max-w-[150px] truncate">{item.products || item.description || "-"}</td>
                      <td className="p-3 text-slate-300">{payLabel}</td>
                      <td className="p-3"><Badge className={statusColors[item.status] || "bg-slate-600 text-slate-300"}>{statusLabels[item.status] || item.status}</Badge></td>
                      <td className="p-3 text-muted-foreground">{item.linked_document || "-"}</td>
                      <td className="p-3 text-center">
                        <div className="flex gap-1 justify-center">
                          <button onClick={(e) => { e.stopPropagation(); setViewItem(item); }} className="p-1 hover:bg-slate-700 rounded" title="תצוגה מקדימה">
                            <Eye className="w-4 h-4 text-muted-foreground" />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); setSelectedItem(item); setDetailTab("details"); }} className="p-1 hover:bg-slate-700 rounded" title="פרטים מלאים">
                            <FileText className="w-4 h-4 text-muted-foreground" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {items.length === 0 && <tr><td colSpan={10} className="p-8 text-center text-muted-foreground">אין מסמכי הכנסה</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {selectedItem && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setSelectedItem(null)}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-6 border-b border-slate-700">
              <h2 className="text-xl font-bold text-foreground">מסמך הכנסה #{selectedItem.document_number || selectedItem.id}</h2>
              <button onClick={() => setSelectedItem(null)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="flex border-b border-border/50">
              {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
              ))}
            </div>
            <div className="p-6">
              {detailTab === "details" && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div><div className="text-xs text-muted-foreground mb-1">לקוח</div><div className="text-sm text-foreground">{selectedItem.customer_name || "-"}</div></div>
                  <div><div className="text-xs text-muted-foreground mb-1">סכום</div><div className="text-sm text-yellow-400 font-bold">{fmt(Number(selectedItem.amount || 0))}</div></div>
                  <div><div className="text-xs text-muted-foreground mb-1">תאריך</div><div className="text-sm text-foreground">{fmtDate(selectedItem.invoice_date)}</div></div>
                  <div><div className="text-xs text-muted-foreground mb-1">סוג מסמך</div><div className="text-sm text-foreground">{selectedItem.document_type || "-"}</div></div>
                  <div><div className="text-xs text-muted-foreground mb-1">תיאור</div><div className="text-sm text-foreground">{selectedItem.description || "-"}</div></div>
                  <div><div className="text-xs text-muted-foreground mb-1">סטטוס</div><div className="text-sm text-foreground">{statusLabels[selectedItem.status] || selectedItem.status}</div></div>
                </div>
              )}
              {detailTab === "related" && <RelatedRecords entityType="income" entityId={selectedItem.id} tabs={[{ key: "invoices", label: "חשבוניות", endpoint: `${API}/invoices?income_id=${selectedItem.id}` }, { key: "customers", label: "לקוחות", endpoint: `${API}/customers?income_id=${selectedItem.id}` }]} />}
              {detailTab === "docs" && <AttachmentsSection entityType="income" entityId={selectedItem.id} />}
              {detailTab === "history" && <ActivityLog entityType="income" entityId={selectedItem.id} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
