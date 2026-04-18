import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  FileText, ChevronLeft, ChevronRight, Save, MoreHorizontal, AlertCircle,
  CheckCircle, ZoomIn, ZoomOut, RotateCw, Download, Info
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { authJson } from "@/lib/utils";
import { VAT_RATE } from "@/utils/money";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";

const API = "/api";

const DOC_TYPES = [
  { value: "supplier_invoice_payment", label: "חשבונית ותשלום לספק/ית" },
  { value: "supplier_invoice", label: "חשבונית ספקים" },
  { value: "payment_record", label: "תיעודי תשלומים לספקים" },
  { value: "payment_request", label: "בקשות תשלום מספקים" },
];

const EXPENSE_ITEMS = [
  "מימון משכנתא", "דלק", "חשמל ומים", "שכירות", "ביטוח", "תחזוקה", "חומרי גלם",
  "שכר עבודה", "הובלה", "שיווק", "ציוד", "מיסים", "הנהלת חשבונות", "תקשורת",
  "ארנונה", "ביגוד", "גז", "אחר",
];

const CURRENCIES = [
  { value: "ILS", label: 'ש"ח' },
  { value: "USD", label: "$" },
  { value: "EUR", label: "€" },
];

const PAYMENT_METHODS = [
  { value: "bank_transfer", label: "העברה בנקאית" },
  { value: "credit_card", label: "כרטיס אשראי" },
  { value: "cash", label: "מזומן" },
  { value: "check", label: "שיק מס'" },
  { value: "other", label: "תשלום אחר" },
];

export default function ExpenseFilingPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [docTypeDialogOpen, setDocTypeDialogOpen] = useState(false);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [zoom, setZoom] = useState(46);

  const [form, setForm] = useState({
    document_type: "supplier_invoice_payment",
    supplier_name: "",
    supplier_id: "",
    supplier_id2: "",
    document_date: new Date().toISOString().split("T")[0],
    document_number: "",
    reference_number: "",
    expense_item: "",
    amount: "",
    currency: "ILS",
    vat_amount: "",
    payment_method: "other",
    payment_date: new Date().toISOString().split("T")[0],
    free_text: "",
  });

  const { data } = useQuery({
    queryKey: ["expense-files-for-filing"],
    queryFn: () => authJson(`${API}/finance/expenses?limit=50`).catch(() => ({ data: [] })),
  });

  const filesData = Array.isArray(data?.data) ? data.data : [];
  const currentFile = filesData[currentFileIndex];

  const saveMutation = useMutation({
    mutationFn: (body: any) => {
      if (currentFile?.id) {
        return authJson(`${API}/finance/expenses/${currentFile.id}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
      }
      return authJson(`${API}/finance/expenses`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expense-files-for-filing"] });
      toast({ title: "נשמר בהצלחה" });
    },
  });

  const handleSave = (asFinal: boolean) => {
    const body = {
      ...form,
      expense_date: form.document_date || null,
      category: form.expense_item,
      description: form.free_text,
      amount: form.amount || "0",
      vat_amount: form.vat_amount || "0",
      vendor_name: form.supplier_name,
      receipt_number: form.document_number,
      status: asFinal ? "approved" : "pending",
    };
    saveMutation.mutate(body);
  };

  const selectedDocTypeLabel = DOC_TYPES.find(t => t.value === form.document_type)?.label || "";

  return (
    <div className="space-y-4 sm:space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <FileText className="w-6 h-6 text-blue-400" /> תיוק קבצי הוצאות
          </h1>
          <p className="text-muted-foreground mt-1">מילוי פרטים ותיוק מסמכי הוצאות</p>
        </div>
      </div>

      <Card className="bg-blue-900/20 border-blue-500/30">
        <CardContent className="p-4 flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-200">
            כאן אפשר למלא את כל הפרטים הדרושים על הוצאות טיוטה שנקלטו במערכת.
            חלק מהפרטים כבר נסרקו והוזנו אוטומטית על ידי המערכת
            שלנו אבל יש לעבור עליהם ולוודא שהם נכונים. תוכלו להיעזר גם בחלופות שמופיעות מתחת לכל שדה בנועות אפורות. בהצלחה!
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm text-muted-foreground">
                {currentFile ? `#${currentFileIndex + 1}` : "אין מסמכים"}
              </CardTitle>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {currentFile?.file_name ? `המסמך הועלה ע"י ${currentFile.vendor_name || "משתמש"}` : ""}
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="bg-slate-800 rounded-lg overflow-hidden" style={{ minHeight: 400 }}>
              {currentFile?.file_url && currentFile.file_url.startsWith("data:image") ? (
                <img
                  src={currentFile.file_url}
                  alt="מסמך הוצאה"
                  className="w-full h-auto"
                  style={{ transform: `scale(${zoom / 100})`, transformOrigin: "top center" }}
                />
              ) : (
                <div className="flex items-center justify-center h-96 text-muted-foreground">
                  <div className="text-center">
                    <FileText className="w-16 h-16 mx-auto mb-3 text-muted-foreground" />
                    <div>אין קובץ מצורף</div>
                    <div className="text-xs mt-1">גררו קובץ או העלו דרך עמוד ההעלאות</div>
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between mt-3">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="border-slate-600" onClick={() => setZoom(z => Math.max(20, z - 10))}>
                  <ZoomOut className="w-4 h-4" />
                </Button>
                <span className="text-xs text-muted-foreground">{zoom}%</span>
                <Button variant="outline" size="sm" className="border-slate-600" onClick={() => setZoom(z => Math.min(200, z + 10))}>
                  <ZoomIn className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{currentFileIndex + 1} / {Math.max(filesData.length, 1)}</span>
                <Button variant="outline" size="sm" className="border-slate-600" disabled={currentFileIndex <= 0} onClick={() => setCurrentFileIndex(i => i - 1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" className="border-slate-600" disabled={currentFileIndex >= filesData.length - 1} onClick={() => setCurrentFileIndex(i => i + 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardContent className="p-4 space-y-4">
              <div>
                <Label className="text-slate-300">סוג מסמך *</Label>
                <button
                  className="w-full mt-1 flex items-center justify-between p-3 rounded-lg border border-slate-700 bg-slate-800 hover:border-slate-500 transition-colors"
                  onClick={() => setDocTypeDialogOpen(true)}
                >
                  <span className="text-foreground">{selectedDocTypeLabel}</span>
                  <ChevronLeft className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>

              <div>
                <Label className="text-slate-300">ספק/ית *</Label>
                <div className="flex gap-2 mt-1">
                  <Select value="" onValueChange={() => {}}>
                    <SelectTrigger className="bg-slate-800 border-slate-700 flex-1"><SelectValue placeholder="בחירת ספק/ית" /></SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      <SelectItem value="none">בחירת ספק/ית</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={form.supplier_name}
                    onChange={e => setForm({ ...form, supplier_name: e.target.value })}
                    placeholder="שם ספק"
                    className="bg-slate-800 border-slate-700 flex-1"
                  />
                </div>
                {form.supplier_id && (
                  <div className="flex gap-2 mt-1">
                    <Badge variant="outline" className="text-xs border-slate-600">{form.supplier_id}</Badge>
                    {form.supplier_id2 && <Badge variant="outline" className="text-xs border-slate-600">{form.supplier_id2}</Badge>}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-slate-300">ת. מסמך/אסמכתא *</Label>
                  <Input
                    type="date"
                    value={form.document_date}
                    onChange={e => setForm({ ...form, document_date: e.target.value })}
                    className="bg-slate-800 border-slate-700 mt-1"
                  />
                </div>
                <div>
                  <Label className="text-slate-300">מס' מסמך/אסמכתא *</Label>
                  <Input
                    value={form.document_number}
                    onChange={e => setForm({ ...form, document_number: e.target.value })}
                    placeholder=""
                    className="bg-slate-800 border-slate-700 mt-1"
                  />
                  {form.reference_number && (
                    <div className="flex gap-1 mt-1">
                      <Badge variant="outline" className="text-xs border-slate-600">{form.reference_number}</Badge>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <Label className="text-slate-300">פריט הוצאה *</Label>
                <Select value={form.expense_item} onValueChange={v => setForm({ ...form, expense_item: v })}>
                  <SelectTrigger className="bg-slate-800 border-slate-700 mt-1"><SelectValue placeholder="בחירת פריט הוצאה" /></SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {EXPENSE_ITEMS.map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-slate-300">סכום כולל בש"ח *</Label>
                  <Input
                    type="number"
                    value={form.amount}
                    onChange={e => {
                      const amt = e.target.value;
                      const vat = String(Math.round(Number(amt || 0) * VAT_RATE * 100) / 100);
                      setForm({ ...form, amount: amt, vat_amount: vat });
                    }}
                    className="bg-slate-800 border-slate-700 mt-1"
                  />
                </div>
                <div>
                  <Label className="text-slate-300">מטבע *</Label>
                  <Select value={form.currency} onValueChange={v => setForm({ ...form, currency: v })}>
                    <SelectTrigger className="bg-slate-800 border-slate-700 mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      {CURRENCIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {form.amount && (
                <div className="bg-slate-800 rounded-lg p-3 text-sm text-slate-300 space-y-1">
                  <div className="flex justify-between">
                    <span>סה"כ ללא מע"מ</span>
                    <span className="text-foreground font-medium">{(Number(form.amount || 0) / (1 + VAT_RATE)).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>מע"מ 17%</span>
                    <span className="text-foreground font-medium">{form.vat_amount}</span>
                  </div>
                </div>
              )}

              <div>
                <Label className="text-slate-300">אמצעי תשלום *</Label>
                <Select value={form.payment_method} onValueChange={v => setForm({ ...form, payment_method: v })}>
                  <SelectTrigger className="bg-slate-800 border-slate-700 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {PAYMENT_METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-slate-300">תאריך תשלום בפועל *</Label>
                <Input
                  type="date"
                  value={form.payment_date}
                  onChange={e => setForm({ ...form, payment_date: e.target.value })}
                  className="bg-slate-800 border-slate-700 mt-1"
                />
              </div>

              <div>
                <Label className="text-slate-300">טקסט חופשי *</Label>
                <Input
                  value={form.free_text}
                  onChange={e => setForm({ ...form, free_text: e.target.value })}
                  placeholder=""
                  className="bg-slate-800 border-slate-700 mt-1"
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button variant="outline" className="border-slate-600 flex-1" onClick={() => {
              const menuItems = ["מעבר לעריכה מלאה (ללא שמירה)", "שמירה כטיוטה", "מחיקה לארכיון", "פיצול סריקה מרובת הוצאות", "פיצול קובץ לפי עמודים"];
              toast({ title: "פעולות נוספות", description: menuItems.join(" | ") });
            }}>
              <MoreHorizontal className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              className="border-slate-600 flex-1"
              onClick={() => handleSave(false)}
            >
              שמירה כטיוטה
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-foreground flex-[2]"
              onClick={() => handleSave(true)}
            >
              <Save className="w-4 h-4 ml-2" />שמירה כמסמך סופי
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={docTypeDialogOpen} onOpenChange={setDocTypeDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-md" dir="rtl">
          <DialogHeader><DialogTitle>פירוט מסמכים לפי סוג</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {DOC_TYPES.map(dt => (
              <button
                key={dt.value}
                className={`w-full text-right p-4 rounded-lg border transition-all ${
                  form.document_type === dt.value
                    ? "border-blue-500 bg-blue-500/10 text-blue-300"
                    : "border-slate-700 hover:border-slate-500 hover:bg-slate-800/50 text-foreground"
                } font-medium`}
                onClick={() => {
                  setForm({ ...form, document_type: dt.value });
                  setDocTypeDialogOpen(false);
                }}
              >
                {dt.label}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <div className="mt-8 space-y-6">
        <RelatedRecords
          tabs={[
            {
              key: "expense_documents",
              label: "מסמכי הוצאות",
              icon: "documents",
              endpoint: `${API}/expense-files?limit=5`,
              columns: [
                { key: "file_name", label: "שם קובץ" },
                { key: "vendor_name", label: "ספק" },
                { key: "amount", label: "סכום" },
                { key: "status", label: "סטטוס" },
              ],
            },
            {
              key: "payment_records",
              label: "רשומות תשלום",
              icon: "payments",
              endpoint: `${API}/ap?limit=5`,
              columns: [
                { key: "invoice_number", label: "חשבונית" },
                { key: "supplier_name", label: "ספק" },
                { key: "amount", label: "סכום" },
                { key: "status", label: "סטטוס" },
              ],
            },
          ]}
        />
        <ActivityLog entityType="expense-filing" />
      </div>
    </div>
  );
}
