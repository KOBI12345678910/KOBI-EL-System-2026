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
          <CardTitle>Invoice Header</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-medium">Invoice Number *</label>
            <input
              type="text"
              value={formData.invoiceNumber}
              onChange={(e) => setFormData({...formData, invoiceNumber: e.target.value})}
              className="w-full border rounded px-3 py-2"
              placeholder="INV-YYYY-NNNNN"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Type</label>
            <select
              value={formData.invoiceType}
              onChange={(e) => setFormData({...formData, invoiceType: e.target.value as "AR"|"AP"})}
              className="w-full border rounded px-3 py-2"
            >
              <option value="AR">AR (Receivable)</option>
              <option value="AP">AP (Payable)</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Status</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({...formData, status: e.target.value as any})}
              className="w-full border rounded px-3 py-2"
            >
              <option value="draft">Draft</option>
              <option value="issued">Issued</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Customer/Supplier *</label>
            <input
              type="text"
              value={formData.customerName}
              onChange={(e) => setFormData({...formData, customerName: e.target.value})}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Invoice Date *</label>
            <input
              type="date"
              value={formData.invoiceDate}
              onChange={(e) => setFormData({...formData, invoiceDate: e.target.value})}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Due Date *</label>
            <input
              type="date"
              value={formData.dueDate}
              onChange={(e) => setFormData({...formData, dueDate: e.target.value})}
              className="w-full border rounded px-3 py-2"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Line Items</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm mb-4">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2">Product Code</th>
                <th className="text-left p-2">Product Name</th>
                <th className="text-right p-2">Qty</th>
                <th className="text-right p-2">Unit</th>
                <th className="text-right p-2">Price</th>
                <th className="text-right p-2">VAT%</th>
                <th className="text-right p-2">Total</th>
                <th className="p-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {formData.lineItems.map(item => (
                <tr key={item.id} className="border-b">
                  <td className="p-2">{item.productCode}</td>
                  <td className="p-2">{item.productName}</td>
                  <td className="text-right p-2">{item.quantity}</td>
                  <td className="text-right p-2">{item.unit}</td>
                  <td className="text-right p-2">₪{item.price.toFixed(2)}</td>
                  <td className="text-right p-2">{item.vatPercent}%</td>
                  <td className="text-right p-2 font-bold">₪{item.total.toFixed(2)}</td>
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
                    placeholder="Code"
                  />
                </td>
                <td className="p-2">
                  <input
                    type="text"
                    value={newLineItem.productName || ""}
                    onChange={(e) => setNewLineItem({...newLineItem, productName: e.target.value})}
                    className="border rounded px-2 py-1 w-full text-xs"
                    placeholder="Product Name"
                  />
                </td>
                <td className="p-2">
                  <input
                    type="number"
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
                    value={newLineItem.price || ""}
                    onChange={(e) => setNewLineItem({...newLineItem, price: parseFloat(e.target.value)})}
                    className="border rounded px-2 py-1 w-full text-xs"
                    placeholder="0.00"
                  />
                </td>
                <td className="p-2">
                  <input
                    type="number"
                    value={newLineItem.vatPercent || "17"}
                    onChange={(e) => setNewLineItem({...newLineItem, vatPercent: parseFloat(e.target.value)})}
                    className="border rounded px-2 py-1 w-full text-xs"
                  />
                </td>
                <td></td>
                <td className="p-2">
                  <button
                    onClick={addLineItem}
                    className="bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600 text-xs flex items-center gap-1"
                  >
                    <Plus size={14} /> Add
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Totals</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between text-sm">
            <span>Subtotal:</span>
            <span className="font-bold">₪{formData.subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>VAT ({formData.vatPercent}%):</span>
            <span className="font-bold">₪{formData.vatAmount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-lg border-t pt-2 font-bold">
            <span>Total:</span>
            <span>₪{formData.total.toFixed(2)}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment Information</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">Payment Method</label>
            <select
              value={formData.paymentMethod || ""}
              onChange={(e) => setFormData({...formData, paymentMethod: e.target.value})}
              className="w-full border rounded px-3 py-2"
            >
              <option value="">Select...</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="check">Check</option>
              <option value="cash">Cash</option>
              <option value="credit_card">Credit Card</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Payment Date</label>
            <input
              type="date"
              value={formData.paymentDate || ""}
              onChange={(e) => setFormData({...formData, paymentDate: e.target.value})}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Paid Amount (₪)</label>
            <input
              type="number"
              value={formData.paidAmount}
              onChange={(e) => {
                const paid = parseFloat(e.target.value);
                setFormData({...formData, paidAmount: paid, balanceDue: formData.total - paid});
              }}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Balance Due (₪)</label>
            <input
              type="number"
              value={formData.balanceDue.toFixed(2)}
              disabled
              className="w-full border rounded px-3 py-2 bg-muted/30"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-4">
        <button className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Save</button>
        <button className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700">Send</button>
        <button className="px-6 py-2 bg-muted rounded hover:bg-muted">Cancel</button>
      </div>
    </div>
  );
}
