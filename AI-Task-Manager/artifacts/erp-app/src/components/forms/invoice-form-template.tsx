/**
 * TASK 4: Invoice Form Template
 * Shows all required fields for the enhanced INVOICES table
 * Includes line items editor, auto-calculations, and payment tracking
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2 } from "lucide-react";

interface InvoiceLineItem {
  id: number;
  productCode: string;
  productName: string;
  quantity: number;
  unit: string;
  price: number;
  vatPercent: number;
  total: number;
}

interface InvoiceFormData {
  invoiceNumber: string;
  invoiceType: "AR" | "AP";
  direction: "AR" | "AP";
  customerId?: number;
  customerName: string;
  invoiceDate: string;
  dueDate: string;
  paymentDate?: string;
  paymentMethod?: string;
  status: "draft" | "issued" | "paid" | "overdue" | "cancelled";
  
  lineItems: InvoiceLineItem[];
  
  subtotal: number;
  vatPercent: number;
  vatAmount: number;
  total: number;
  
  paidAmount: number;
  balanceDue: number;
  partialPayments: boolean;
  
  paymentTerms?: string;
  einvoiceStatus?: string;
  
  notes?: string;
}

export function InvoiceFormTemplate() {
  const [formData, setFormData] = useState<InvoiceFormData>({
    invoiceNumber: "",
    invoiceType: "AR",
    direction: "AR",
    customerName: "",
    invoiceDate: new Date().toISOString().split("T")[0],
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    status: "draft",
    lineItems: [],
    subtotal: 0,
    vatPercent: 17,
    vatAmount: 0,
    total: 0,
    paidAmount: 0,
    balanceDue: 0,
    partialPayments: false,
  });

  const [newLineItem, setNewLineItem] = useState<Partial<InvoiceLineItem>>({
    quantity: 1,
    unit: "יחידה",
    vatPercent: 17,
  });

  const addLineItem = () => {
    if (newLineItem.productName && newLineItem.price) {
      const item: InvoiceLineItem = {
        id: Date.now(),
        productCode: newLineItem.productCode || "",
        productName: newLineItem.productName || "",
        quantity: newLineItem.quantity || 1,
        unit: newLineItem.unit || "יחידה",
        price: newLineItem.price || 0,
        vatPercent: newLineItem.vatPercent || 17,
        total: (newLineItem.quantity || 1) * (newLineItem.price || 0),
      };
      
      const newItems = [...formData.lineItems, item];
      updateLineItems(newItems);
      setNewLineItem({ quantity: 1, unit: "יחידה", vatPercent: 17 });
    }
  };

  const updateLineItems = (items: InvoiceLineItem[]) => {
    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const vatAmount = subtotal * (formData.vatPercent / 100);
    const total = subtotal + vatAmount;
    
    setFormData(prev => ({
      ...prev,
      lineItems: items,
      subtotal,
      vatAmount,
      total,
      balanceDue: total - prev.paidAmount,
    }));
  };

  const removeLineItem = (id: number) => {
    const newItems = formData.lineItems.filter(item => item.id !== id);
    updateLineItems(newItems);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>כותרת חשבונית</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-medium">מספר חשבונית *</label>
            <input
              type="text"
              value={formData.invoiceNumber}
              onChange={(e) => setFormData({...formData, invoiceNumber: e.target.value})}
              className="w-full border rounded px-3 py-2"
              placeholder="חש-YYYY-NNNNN"
            />
          </div>
          <div>
            <label className="text-sm font-medium">סוג</label>
            <select
              value={formData.invoiceType}
              onChange={(e) => setFormData({...formData, invoiceType: e.target.value as "AR"|"AP"})}
              className="w-full border rounded px-3 py-2"
            >
              <option value="AR">AR (לקוחות)</option>
              <option value="AP">AP (ספקים)</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">סטטוס</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({...formData, status: e.target.value as any})}
              className="w-full border rounded px-3 py-2"
            >
              <option value="draft">טיוטה</option>
              <option value="issued">הונפקה</option>
              <option value="paid">שולמה</option>
              <option value="overdue">באיחור</option>
              <option value="cancelled">בוטלה</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">לקוח / ספק *</label>
            <input
              type="text"
              value={formData.customerName}
              onChange={(e) => setFormData({...formData, customerName: e.target.value})}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="text-sm font-medium">תאריך חשבונית *</label>
            <input
              type="date"
              dir="ltr"
              value={formData.invoiceDate}
              onChange={(e) => setFormData({...formData, invoiceDate: e.target.value})}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="text-sm font-medium">תאריך פירעון *</label>
            <input
              type="date"
              dir="ltr"
              value={formData.dueDate}
              onChange={(e) => setFormData({...formData, dueDate: e.target.value})}
              className="w-full border rounded px-3 py-2"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>פריטי שורה</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm mb-4">
            <thead>
              <tr className="border-b">
                <th className="text-right p-2">קוד מוצר</th>
                <th className="text-right p-2">שם מוצר</th>
                <th className="text-left p-2">כמות</th>
                <th className="text-right p-2">יחידה</th>
                <th className="text-left p-2">מחיר</th>
                <th className="text-left p-2">מע״מ%</th>
                <th className="text-left p-2">סה״כ</th>
                <th className="p-2">פעולה</th>
              </tr>
            </thead>
            <tbody>
              {formData.lineItems.map(item => (
                <tr key={item.id} className="border-b">
                  <td className="p-2">{item.productCode}</td>
                  <td className="p-2">{item.productName}</td>
                  <td className="text-left p-2" dir="ltr">{item.quantity}</td>
                  <td className="text-right p-2">{item.unit}</td>
                  <td className="text-left p-2" dir="ltr">₪{item.price.toFixed(2)}</td>
                  <td className="text-left p-2" dir="ltr">{item.vatPercent}%</td>
                  <td className="text-left p-2 font-bold" dir="ltr">₪{item.total.toFixed(2)}</td>
                  <td className="p-2">
                    <button
                      onClick={() => removeLineItem(item.id)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              <tr className="bg-muted/30">
                <td className="p-2">
                  <input
                    type="text"
                    value={newLineItem.productCode || ""}
                    onChange={(e) => setNewLineItem({...newLineItem, productCode: e.target.value})}
                    className="border rounded px-2 py-1 w-full text-xs"
                    placeholder="קוד"
                  />
                </td>
                <td className="p-2">
                  <input
                    type="text"
                    value={newLineItem.productName || ""}
                    onChange={(e) => setNewLineItem({...newLineItem, productName: e.target.value})}
                    className="border rounded px-2 py-1 w-full text-xs"
                    placeholder="שם מוצר"
                  />
                </td>
                <td className="p-2">
                  <input
                    type="number"
                    dir="ltr"
                    value={newLineItem.quantity || ""}
                    onChange={(e) => setNewLineItem({...newLineItem, quantity: parseFloat(e.target.value)})}
                    className="border rounded px-2 py-1 w-full text-xs"
                    placeholder="1"
                  />
                </td>
                <td className="p-2">
                  <input
                    type="text"
                    value={newLineItem.unit || "יחידה"}
                    onChange={(e) => setNewLineItem({...newLineItem, unit: e.target.value})}
                    className="border rounded px-2 py-1 w-full text-xs"
                  />
                </td>
                <td className="p-2">
                  <input
                    type="number"
                    dir="ltr"
                    value={newLineItem.price || ""}
                    onChange={(e) => setNewLineItem({...newLineItem, price: parseFloat(e.target.value)})}
                    className="border rounded px-2 py-1 w-full text-xs"
                    placeholder="0.00"
                  />
                </td>
                <td className="p-2">
                  <input
                    type="number"
                    dir="ltr"
                    value={newLineItem.vatPercent || "17"}
                    onChange={(e) => setNewLineItem({...newLineItem, vatPercent: parseFloat(e.target.value)})}
                    className="border rounded px-2 py-1 w-full text-xs"
                  />
                </td>
                <td></td>
                <td className="p-2">
                  <button
                    onClick={addLineItem}
                    className="bg-green-500 text-foreground px-3 py-1 rounded hover:bg-green-600 text-xs flex items-center gap-1"
                  >
                    <Plus size={14} /> הוסף
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>סיכום סכומים</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between text-sm">
            <span>סכום ביניים:</span>
            <span className="font-bold" dir="ltr">₪{formData.subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>מע״מ ({formData.vatPercent}%):</span>
            <span className="font-bold" dir="ltr">₪{formData.vatAmount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-lg border-t pt-2 font-bold">
            <span>סה״כ:</span>
            <span dir="ltr">₪{formData.total.toFixed(2)}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>פרטי תשלום</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">אמצעי תשלום</label>
            <select
              value={formData.paymentMethod || ""}
              onChange={(e) => setFormData({...formData, paymentMethod: e.target.value})}
              className="w-full border rounded px-3 py-2"
            >
              <option value="">בחר...</option>
              <option value="bank_transfer">העברה בנקאית</option>
              <option value="check">המחאה</option>
              <option value="cash">מזומן</option>
              <option value="credit_card">כרטיס אשראי</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">תאריך תשלום</label>
            <input
              type="date"
              dir="ltr"
              value={formData.paymentDate || ""}
              onChange={(e) => setFormData({...formData, paymentDate: e.target.value})}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="text-sm font-medium">סכום ששולם (₪)</label>
            <input
              type="number"
              dir="ltr"
              value={formData.paidAmount}
              onChange={(e) => {
                const paid = parseFloat(e.target.value);
                setFormData({...formData, paidAmount: paid, balanceDue: formData.total - paid});
              }}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="text-sm font-medium">יתרה לתשלום (₪)</label>
            <input
              type="number"
              dir="ltr"
              value={formData.balanceDue.toFixed(2)}
              disabled
              className="w-full border rounded px-3 py-2 bg-muted/30"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-4">
        <button className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">שמור</button>
        <button className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700">שלח</button>
        <button className="px-6 py-2 bg-muted rounded hover:bg-muted">בטל</button>
      </div>
    </div>
  );
}
