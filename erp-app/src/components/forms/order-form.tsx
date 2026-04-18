import { useState, useEffect } from "react";
import { VAT_RATE } from "@/utils/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { Plus, Trash2 } from 'lucide-react';

const statusLabels = {
    pending: "ממתין",
    confirmed: "אושר",
    processing: "בטיפול",
    shipped: "נשלח",
    delivered: "נמסר",
    cancelled: "בוטל"
};

export default function OrderForm({ open, onClose, onSave, order, customers = [], products = [] }) {
    const [formData, setFormData] = useState({
        customer_id: '',
        customer_name: '',
        status: 'pending',
        items: [],
        shipping_address: '',
        shipping_date: '',
        delivery_date: '',
        notes: ''
    });

    useEffect(() => {
        if (order) {
            setFormData({
                customer_id: order.customer_id || '',
                customer_name: order.customer_name || '',
                status: order.status || 'pending',
                items: order.items || [],
                shipping_address: order.shipping_address || '',
                shipping_date: order.shipping_date || '',
                delivery_date: order.delivery_date || '',
                notes: order.notes || ''
            });
        } else {
            setFormData({
                customer_id: '',
                customer_name: '',
                status: 'pending',
                items: [],
                shipping_address: '',
                shipping_date: '',
                delivery_date: '',
                notes: ''
            });
        }
    }, [order, open]);

    const handleCustomerChange = (customerId) => {
        const customer = customers.find(c => c.id === customerId);
        setFormData({
            ...formData,
            customer_id: customerId,
            customer_name: customer?.name || '',
            shipping_address: customer?.address ? `${customer.address}, ${customer.city || ''}` : ''
        });
    };

    const addItem = () => {
        setFormData({
            ...formData,
            items: [...formData.items, { product_id: '', product_name: '', quantity: 1, unit_price: 0, discount: 0, total: 0 }]
        });
    };

    const updateItem = (index, field, value) => {
        const newItems = [...formData.items];
        newItems[index] = { ...newItems[index], [field]: value };

        if (field === 'product_id') {
            const product = products.find(p => p.id === value);
            if (product) {
                newItems[index].product_name = product.name;
                newItems[index].unit_price = product.unit_price;
            }
        }

        // Calculate total
        const qty = newItems[index].quantity || 0;
        const price = newItems[index].unit_price || 0;
        const discount = newItems[index].discount || 0;
        newItems[index].total = qty * price * (1 - discount / 100);

        setFormData({ ...formData, items: newItems });
    };

    const removeItem = (index) => {
        setFormData({
            ...formData,
            items: formData.items.filter((_, i) => i !== index)
        });
    };

    const calculateTotals = () => {
        const subtotal = formData.items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
        const discountTotal = formData.items.reduce((sum, item) => {
            const itemSubtotal = item.quantity * item.unit_price;
            return sum + (itemSubtotal * (item.discount || 0) / 100);
        }, 0);
        const taxTotal = (subtotal - discountTotal) * VAT_RATE;
        const total = subtotal - discountTotal + taxTotal;
        return { subtotal, discountTotal, taxTotal, total };
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const totals = calculateTotals();
        const orderNumber = order?.order_number || `ORD-${Date.now()}`;
        onSave({
            ...formData,
            order_number: orderNumber,
            ...totals
        });
    };

    const totals = calculateTotals();

    return (
        <Sheet open={open} onOpenChange={onClose}>
            <SheetContent className="w-full sm:max-w-2xl overflow-y-auto" side="left">
                <SheetHeader className="mb-6">
                    <SheetTitle className="text-xl">
                        {order ? 'עריכת הזמנה' : 'הזמנה חדשה'}
                    </SheetTitle>
                </SheetHeader>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <Label>לקוח *</Label>
                            <Select
                                value={formData.customer_id}
                                onValueChange={handleCustomerChange}
                            >
                                <SelectTrigger className="mt-1">
                                    <SelectValue placeholder="בחר לקוח" />
                                </SelectTrigger>
                                <SelectContent>
                                    {customers.map((c) => (
                                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <Label>סטטוס</Label>
                            <Select
                                value={formData.status}
                                onValueChange={(value) => setFormData({ ...formData, status: value })}
                            >
                                <SelectTrigger className="mt-1">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.entries(statusLabels).map(([key, label]) => (
                                        <SelectItem key={key} value={key}>{label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <Label>תאריך משלוח</Label>
                            <Input
                                type="date"
                                value={formData.shipping_date}
                                onChange={(e) => setFormData({ ...formData, shipping_date: e.target.value })}
                                className="mt-1"
                            />
                        </div>

                        <div className="col-span-2">
                            <Label>כתובת משלוח</Label>
                            <Input
                                value={formData.shipping_address}
                                onChange={(e) => setFormData({ ...formData, shipping_address: e.target.value })}
                                className="mt-1"
                            />
                        </div>
                    </div>

                    {/* Items */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <Label className="text-base font-semibold">פריטים</Label>
                            <Button type="button" variant="outline" size="sm" onClick={addItem}>
                                <Plus className="w-4 h-4 ml-1" />
                                הוסף פריט
                            </Button>
                        </div>

                        <div className="space-y-3">
                            {formData.items.map((item, index) => (
                                <div key={index} className="p-4 bg-slate-50 rounded-xl space-y-3">
                                    <div className="grid grid-cols-12 gap-3">
                                        <div className="col-span-5">
                                            <Select
                                                value={item.product_id}
                                                onValueChange={(value) => updateItem(index, 'product_id', value)}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="בחר מוצר" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {products.map((p) => (
                                                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="col-span-2">
                                            <Input
                                                type="number"
                                                placeholder="כמות"
                                                value={item.quantity}
                                                onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 0)}
                                            />
                                        </div>
                                        <div className="col-span-2">
                                            <Input
                                                type="number"
                                                placeholder="מחיר"
                                                value={item.unit_price}
                                                onChange={(e) => updateItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                                            />
                                        </div>
                                        <div className="col-span-2">
                                            <Input
                                                type="number"
                                                placeholder="הנחה %"
                                                value={item.discount}
                                                onChange={(e) => updateItem(index, 'discount', parseFloat(e.target.value) || 0)}
                                            />
                                        </div>
                                        <div className="col-span-1 flex items-center justify-center">
                                            <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(index)}>
                                                <Trash2 className="w-4 h-4 text-red-500" />
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="text-left text-sm font-medium text-slate-700">
                                        סה"כ: ₪{item.total?.toFixed(2) || 0}
                                    </div>
                                </div>
                            ))}

                            {formData.items.length === 0 && (
                                <div className="text-center py-8 text-slate-400">
                                    לחץ על "הוסף פריט" להוספת מוצרים להזמנה
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Totals */}
                    <div className="p-4 bg-slate-100 rounded-xl space-y-2">
                        <div className="flex justify-between text-sm">
                            <span>סכום ביניים:</span>
                            <span>₪{totals.subtotal.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm text-emerald-600">
                            <span>הנחות:</span>
                            <span>-₪{totals.discountTotal.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span>מע"מ (18%):</span>
                            <span>₪{totals.taxTotal.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between font-bold text-lg pt-2 border-t border-slate-200">
                            <span>סה"כ לתשלום:</span>
                            <span>₪{totals.total.toFixed(2)}</span>
                        </div>
                    </div>

                    <div>
                        <Label>הערות</Label>
                        <Textarea
                            value={formData.notes}
                            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                            className="mt-1 h-20"
                        />
                    </div>

                    <div className="flex gap-3 pt-4">
                        <Button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700">
                            {order ? 'עדכן' : 'צור הזמנה'}
                        </Button>
                        <Button type="button" variant="outline" onClick={() => onClose(false)}>
                            ביטול
                        </Button>
                    </div>
                </form>
            </SheetContent>
        </Sheet>
    );
}