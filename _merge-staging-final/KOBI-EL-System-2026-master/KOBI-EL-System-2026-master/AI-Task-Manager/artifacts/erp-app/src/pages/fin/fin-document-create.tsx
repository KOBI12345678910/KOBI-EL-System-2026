import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Save, Plus, Trash2, ArrowRight } from "lucide-react";
import { useLocation } from "wouter";

interface FinDocumentCreateProps {
  direction: "income" | "expense";
}

interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  taxRate: number;
  lineTotal: number;
}

export default function FinDocumentCreate({ direction }: FinDocumentCreateProps) {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const isIncome = direction === "income";

  const { data: docTypes } = useQuery({ queryKey: ["/api/fin/document-types"] });
  const { data: statuses } = useQuery({ queryKey: ["/api/fin/statuses"] });
  const { data: paymentMethods } = useQuery({ queryKey: ["/api/fin/payment-methods"] });
  const { data: categories } = useQuery({ queryKey: ["/api/fin/categories", { direction }] });

  const filteredDocTypes = (docTypes || []).filter((dt: any) =>
    dt.direction === direction || dt.direction === "both"
  );

  const [form, setForm] = useState({
    documentTypeId: "",
    customerId: "",
    supplierId: "",
    categoryId: "",
    issueDate: new Date().toISOString().split("T")[0],
    dueDate: "",
    title: "",
    description: "",
    paymentMethodId: "",
    statusId: "",
    currency: "ILS",
  });

  const [items, setItems] = useState<LineItem[]>([
    { description: "", quantity: 1, unitPrice: 0, discountPercent: 0, taxRate: 17, lineTotal: 0 },
  ]);

  const updateItem = (index: number, field: keyof LineItem, value: any) => {
    const updated = [...items];
    (updated[index] as any)[field] = value;
    // Recalculate line total
    const item = updated[index];
    item.lineTotal = item.quantity * item.unitPrice * (1 - item.discountPercent / 100);
    setItems(updated);
  };

  const addItem = () => {
    setItems([...items, { description: "", quantity: 1, unitPrice: 0, discountPercent: 0, taxRate: 17, lineTotal: 0 }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const taxTotal = items.reduce((sum, item) => sum + item.lineTotal * (item.taxRate / 100), 0);
  const total = subtotal + taxTotal;

  const createMutation = useMutation({
    mutationFn: (data: any) =>
      fetch("/api/fin/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/fin/documents"] });
      navigate(`/fin/${direction}/${result.id}`);
    },
  });

  const handleSubmit = () => {
    const defaultStatus = (statuses || []).find((s: any) => s.isDefault);
    createMutation.mutate({
      ...form,
      direction,
      documentTypeId: Number(form.documentTypeId),
      customerId: form.customerId ? Number(form.customerId) : null,
      supplierId: form.supplierId ? Number(form.supplierId) : null,
      categoryId: form.categoryId ? Number(form.categoryId) : null,
      paymentMethodId: form.paymentMethodId ? Number(form.paymentMethodId) : null,
      statusId: form.statusId ? Number(form.statusId) : defaultStatus?.id || 1,
      items: items.filter((i) => i.description),
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" onClick={() => navigate(`/fin/${direction}`)}>
          <ArrowRight className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold">
          {isIncome ? "מסמך הכנסה חדש" : "מסמך הוצאה חדש"}
        </h1>
      </div>

      {/* Document Info */}
      <Card>
        <CardHeader>
          <CardTitle>פרטי מסמך</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>סוג מסמך *</Label>
            <Select value={form.documentTypeId} onValueChange={(v) => setForm({ ...form, documentTypeId: v })}>
              <SelectTrigger><SelectValue placeholder="בחר סוג" /></SelectTrigger>
              <SelectContent>
                {filteredDocTypes.map((dt: any) => (
                  <SelectItem key={dt.id} value={String(dt.id)}>{dt.labelHe}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>{isIncome ? "לקוח *" : "ספק *"}</Label>
            <Input
              placeholder={isIncome ? "מספר / שם לקוח" : "מספר / שם ספק"}
              value={isIncome ? form.customerId : form.supplierId}
              onChange={(e) =>
                isIncome
                  ? setForm({ ...form, customerId: e.target.value })
                  : setForm({ ...form, supplierId: e.target.value })
              }
            />
          </div>

          <div>
            <Label>קטגוריה</Label>
            <Select value={form.categoryId} onValueChange={(v) => setForm({ ...form, categoryId: v })}>
              <SelectTrigger><SelectValue placeholder="בחר קטגוריה" /></SelectTrigger>
              <SelectContent>
                {(categories || []).map((c: any) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.nameHe}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>תאריך הפקה *</Label>
            <Input type="date" value={form.issueDate} onChange={(e) => setForm({ ...form, issueDate: e.target.value })} />
          </div>

          <div>
            <Label>תאריך תשלום</Label>
            <Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </div>

          <div>
            <Label>אמצעי תשלום</Label>
            <Select value={form.paymentMethodId} onValueChange={(v) => setForm({ ...form, paymentMethodId: v })}>
              <SelectTrigger><SelectValue placeholder="בחר" /></SelectTrigger>
              <SelectContent>
                {(paymentMethods || []).map((pm: any) => (
                  <SelectItem key={pm.id} value={String(pm.id)}>{pm.labelHe}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="md:col-span-2">
            <Label>כותרת *</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>

          <div>
            <Label>סטטוס</Label>
            <Select value={form.statusId} onValueChange={(v) => setForm({ ...form, statusId: v })}>
              <SelectTrigger><SelectValue placeholder="טיוטה" /></SelectTrigger>
              <SelectContent>
                {(statuses || []).map((s: any) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.labelHe}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="md:col-span-3">
            <Label>הערות</Label>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      {/* Line Items */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>שורות מסמך</CardTitle>
          <Button variant="outline" size="sm" onClick={addItem}>
            <Plus className="h-4 w-4 ml-1" /> שורה
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right w-[300px]">תיאור</TableHead>
                <TableHead className="text-right">כמות</TableHead>
                <TableHead className="text-right">מחיר יחידה</TableHead>
                <TableHead className="text-right">הנחה %</TableHead>
                <TableHead className="text-right">מע"מ %</TableHead>
                <TableHead className="text-right">סה"כ שורה</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, index) => (
                <TableRow key={index}>
                  <TableCell>
                    <Input value={item.description} onChange={(e) => updateItem(index, "description", e.target.value)} />
                  </TableCell>
                  <TableCell>
                    <Input type="number" className="w-20" value={item.quantity} onChange={(e) => updateItem(index, "quantity", Number(e.target.value))} />
                  </TableCell>
                  <TableCell>
                    <Input type="number" className="w-28" value={item.unitPrice} onChange={(e) => updateItem(index, "unitPrice", Number(e.target.value))} />
                  </TableCell>
                  <TableCell>
                    <Input type="number" className="w-20" value={item.discountPercent} onChange={(e) => updateItem(index, "discountPercent", Number(e.target.value))} />
                  </TableCell>
                  <TableCell>
                    <Input type="number" className="w-20" value={item.taxRate} onChange={(e) => updateItem(index, "taxRate", Number(e.target.value))} />
                  </TableCell>
                  <TableCell className="font-medium">₪{item.lineTotal.toLocaleString()}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => removeItem(index)} disabled={items.length === 1}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Totals */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted-foreground">סה"כ לפני מע"מ:</span>
              <span className="font-medium w-28 text-left">₪{subtotal.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted-foreground">מע"מ:</span>
              <span className="font-medium w-28 text-left">₪{taxTotal.toLocaleString()}</span>
            </div>
            <Separator className="w-48" />
            <div className="flex items-center gap-4 text-lg font-bold">
              <span>סה"כ:</span>
              <span className="w-28 text-left">₪{total.toLocaleString()}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3">
        <Button variant="outline" onClick={() => navigate(`/fin/${direction}`)}>
          ביטול
        </Button>
        <Button onClick={handleSubmit} disabled={createMutation.isPending}>
          <Save className="h-4 w-4 ml-2" />
          {createMutation.isPending ? "שומר..." : "שמור מסמך"}
        </Button>
      </div>
    </div>
  );
}
