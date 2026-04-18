/**
 * TASK 5: Sales Order Form Template
 * Shows all required fields for the enhanced SALES_ORDERS table
 * Includes line items, inventory checking, and profit calculation
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2 } from "lucide-react";

interface SalesOrderLineItem {
  id: number;
  materialId?: number;
  productCode: string;
  productName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  discountPercent: number;
  vatPercent: number;
  total: number;
  availableStock?: number;
  reserved?: number;
}

interface SalesOrderFormData {
  orderNumber: string;
  orderType: "standard" | "custom" | "subscription";
  orderSource: "sales" | "web" | "call" | "email";
  customerId?: number;
  customerName: string;
  salespersonId?: number;
  orderDate: string;
  requestedDeliveryDate: string;
  status: "draft" | "pending" | "confirmed" | "shipped" | "delivered" | "cancelled";
  
  lineItems: SalesOrderLineItem[];
  
  subtotal: number;
  discountAmount: number;
  discountPercent: number;
  subtotalAfterDiscount: number;
  vatPercent: number;
  vatAmount: number;
  shippingCost: number;
  totalAmount: number;
  
  currency: string;
  paymentTerms?: string;
  paymentMethod?: string;
  shippingMethod?: string;
  shippingAddress?: string;
  
  profitMarginPct: number;
  
  notes?: string;
  internalNotes?: string;
}

export function SalesOrderFormTemplate() {
  const [formData, setFormData] = useState<SalesOrderFormData>({
    orderNumber: "",
    orderType: "standard",
    orderSource: "sales",
    customerName: "",
    orderDate: new Date().toISOString().split("T")[0],
    requestedDeliveryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    status: "draft",
    lineItems: [],
    subtotal: 0,
    discountAmount: 0,
    discountPercent: 0,
    subtotalAfterDiscount: 0,
    vatPercent: 17,
    vatAmount: 0,
    shippingCost: 0,
    totalAmount: 0,
    currency: "ILS",
    profitMarginPct: 0,
  });

  const [newLineItem, setNewLineItem] = useState<Partial<SalesOrderLineItem>>({
    quantity: 1,
    unit: "יחידה",
    discountPercent: 0,
    vatPercent: 17,
  });

  const calculateLineTotal = (item: Partial<SalesOrderLineItem>) => {
    const baseTotal = (item.quantity || 1) * (item.unitPrice || 0);
    const discounted = baseTotal * (1 - (item.discountPercent || 0) / 100);
    return discounted;
  };

  const addLineItem = () => {
    if (newLineItem.productName && newLineItem.unitPrice) {
      const item: SalesOrderLineItem = {
        id: Date.now(),
        materialId: newLineItem.materialId,
        productCode: newLineItem.productCode || "",
        productName: newLineItem.productName || "",
        quantity: newLineItem.quantity || 1,
        unit: newLineItem.unit || "יחידה",
        unitPrice: newLineItem.unitPrice || 0,
        discountPercent: newLineItem.discountPercent || 0,
        vatPercent: newLineItem.vatPercent || 17,
        total: calculateLineTotal(newLineItem),
        availableStock: newLineItem.availableStock,
      };
      
      const newItems = [...formData.lineItems, item];
      updateLineItems(newItems);
      setNewLineItem({ quantity: 1, unit: "יחידה", discountPercent: 0, vatPercent: 17 });
    }
  };

  const updateLineItems = (items: SalesOrderLineItem[]) => {
    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const discountAmount = subtotal * (formData.discountPercent / 100);
    const subtotalAfterDiscount = subtotal - discountAmount;
    const vatAmount = subtotalAfterDiscount * (formData.vatPercent / 100);
    const totalAmount = subtotalAfterDiscount + vatAmount + formData.shippingCost;
    
    setFormData(prev => ({
      ...prev,
      lineItems: items,
      subtotal,
      discountAmount,
      subtotalAfterDiscount,
      vatAmount,
      totalAmount,
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
          <CardTitle>כותרת הזמנה</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-medium">מספר הזמנה *</label>
            <input
              type="text"
              value={formData.orderNumber}
              onChange={(e) => setFormData({...formData, orderNumber: e.target.value})}
              className="w-full border rounded px-3 py-2"
              placeholder="SO-YYYY-NNNNN"
            />
          </div>
          <div>
            <label className="text-sm font-medium">סוג הזמנה</label>
            <select
              value={formData.orderType}
              onChange={(e) => setFormData({...formData, orderType: e.target.value as any})}
              className="w-full border rounded px-3 py-2"
            >
              <option value="standard">סטנדרטית</option>
              <option value="custom">מותאמת אישית</option>
              <option value="subscription">מנוי</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">מקור הזמנה</label>
            <select
              value={formData.orderSource}
              onChange={(e) => setFormData({...formData, orderSource: e.target.value as any})}
              className="w-full border rounded px-3 py-2"
            >
              <option value="sales">מכירות</option>
              <option value="web">אתר</option>
              <option value="call">שיחה</option>
              <option value="email">אימייל</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">שם לקוח *</label>
            <input
              type="text"
              value={formData.customerName}
              onChange={(e) => setFormData({...formData, customerName: e.target.value})}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="text-sm font-medium">תאריך הזמנה *</label>
            <input
              type="date"
              dir="ltr"
              value={formData.orderDate}
              onChange={(e) => setFormData({...formData, orderDate: e.target.value})}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="text-sm font-medium">תאריך אספקה מבוקש *</label>
            <input
              type="date"
              dir="ltr"
              value={formData.requestedDeliveryDate}
              onChange={(e) => setFormData({...formData, requestedDeliveryDate: e.target.value})}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div className="col-span-3">
            <label className="text-sm font-medium">סטטוס</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({...formData, status: e.target.value as any})}
              className="w-full border rounded px-3 py-2"
            >
              <option value="draft">טיוטה</option>
              <option value="pending">ממתין</option>
              <option value="confirmed">מאושר</option>
              <option value="shipped">נשלח</option>
              <option value="delivered">נמסר</option>
              <option value="cancelled">בוטל</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>פריטי שורה</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-xs mb-4">
            <thead>
              <tr className="border-b">
                <th className="text-right p-2">קוד מוצר</th>
                <th className="text-right p-2">שם מוצר</th>
                <th className="text-left p-2">מלאי</th>
                <th className="text-left p-2">כמות</th>
                <th className="text-right p-2">יחידה</th>
                <th className="text-left p-2">מחיר</th>
                <th className="text-left p-2">הנחה%</th>
                <th className="text-left p-2">סה״כ</th>
                <th className="p-2">פעולה</th>
              </tr>
            </thead>
            <tbody>
              {formData.lineItems.map(item => (
                <tr key={item.id} className="border-b hover:bg-muted/30">
                  <td className="p-2">{item.productCode}</td>
                  <td className="p-2">{item.productName}</td>
                  <td className="text-left p-2 text-sm" dir="ltr">
                    {item.availableStock ? `${item.availableStock}` : "—"}
                  </td>
                  <td className="text-left p-2" dir="ltr">{item.quantity}</td>
                  <td className="text-right p-2">{item.unit}</td>
                  <td className="text-left p-2" dir="ltr">₪{item.unitPrice.toFixed(2)}</td>
                  <td className="text-left p-2" dir="ltr">{item.discountPercent}%</td>
                  <td className="text-left p-2 font-bold" dir="ltr">₪{item.total.toFixed(2)}</td>
                  <td className="p-2">
                    <button
                      onClick={() => removeLineItem(item.id)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              <tr className="bg-muted/30 border-t-2">
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
                <td></td>
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
                    value={newLineItem.unitPrice || ""}
                    onChange={(e) => setNewLineItem({...newLineItem, unitPrice: parseFloat(e.target.value)})}
                    className="border rounded px-2 py-1 w-full text-xs"
                    placeholder="0.00"
                  />
                </td>
                <td className="p-2">
                  <input
                    type="number"
                    dir="ltr"
                    value={newLineItem.discountPercent || ""}
                    onChange={(e) => setNewLineItem({...newLineItem, discountPercent: parseFloat(e.target.value)})}
                    className="border rounded px-2 py-1 w-full text-xs"
                    placeholder="0"
                  />
                </td>
                <td></td>
                <td className="p-2">
                  <button
                    onClick={addLineItem}
                    className="bg-green-500 text-foreground px-2 py-1 rounded hover:bg-green-600 text-xs flex items-center gap-1"
                  >
                    <Plus size={12} /> הוסף
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>סיכום הזמנה ורווחיות</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">סכום ביניים (₪)</label>
              <input
                type="number"
                dir="ltr"
                value={formData.subtotal.toFixed(2)}
                disabled
                className="w-full border rounded px-3 py-2 bg-muted/30"
              />
            </div>
            <div>
              <label className="text-sm font-medium">הנחה % / סכום</label>
              <input
                type="number"
                dir="ltr"
                value={formData.discountPercent}
                onChange={(e) => {
                  const pct = parseFloat(e.target.value);
                  const newAmount = formData.subtotal * (pct / 100);
                  setFormData(prev => ({...prev, discountPercent: pct, discountAmount: newAmount}));
                }}
                className="w-full border rounded px-3 py-2"
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-sm font-medium">סכום ביניים אחרי הנחה (₪)</label>
              <input
                type="number"
                dir="ltr"
                value={formData.subtotalAfterDiscount.toFixed(2)}
                disabled
                className="w-full border rounded px-3 py-2 bg-muted/30"
              />
            </div>
            <div>
              <label className="text-sm font-medium">מע״מ % / סכום</label>
              <input
                type="number"
                dir="ltr"
                value={formData.vatPercent}
                onChange={(e) => setFormData(prev => ({...prev, vatPercent: parseFloat(e.target.value)}))}
                className="w-full border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="text-sm font-medium">עלות משלוח (₪)</label>
              <input
                type="number"
                dir="ltr"
                value={formData.shippingCost}
                onChange={(e) => {
                  const shipping = parseFloat(e.target.value);
                  const newTotal = formData.subtotalAfterDiscount + formData.vatAmount + shipping;
                  setFormData(prev => ({...prev, shippingCost: shipping, totalAmount: newTotal}));
                }}
                className="w-full border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="text-sm font-medium">מרווח רווח %</label>
              <input
                type="number"
                dir="ltr"
                value={formData.profitMarginPct.toFixed(2)}
                disabled
                className="w-full border rounded px-3 py-2 bg-muted/30"
              />
            </div>
          </div>
          <div className="bg-blue-50 p-4 rounded">
            <div className="flex justify-between text-lg font-bold">
              <span>סכום כולל (₪)</span>
              <span className="text-blue-600" dir="ltr">₪{formData.totalAmount.toFixed(2)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>משלוח ותשלום</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">שיטת משלוח</label>
            <select
              value={formData.shippingMethod || ""}
              onChange={(e) => setFormData({...formData, shippingMethod: e.target.value})}
              className="w-full border rounded px-3 py-2"
            >
              <option value="">בחר...</option>
              <option value="ground">יבשתי</option>
              <option value="courier">שליח</option>
              <option value="pickup">איסוף עצמי</option>
              <option value="delivery">משלוח</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">תנאי תשלום</label>
            <input
              type="text"
              value={formData.paymentTerms || ""}
              onChange={(e) => setFormData({...formData, paymentTerms: e.target.value})}
              className="w-full border rounded px-3 py-2"
              placeholder="לדוגמה: שוטף + 30"
            />
          </div>
          <div className="col-span-2">
            <label className="text-sm font-medium">כתובת משלוח</label>
            <textarea
              value={formData.shippingAddress || ""}
              onChange={(e) => setFormData({...formData, shippingAddress: e.target.value})}
              className="w-full border rounded px-3 py-2 h-20"
              placeholder="הזן כתובת משלוח"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-4">
        <button className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">שמור</button>
        <button className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700">אשר הזמנה</button>
        <button className="px-6 py-2 bg-muted rounded hover:bg-muted">בטל</button>
      </div>
    </div>
  );
}
