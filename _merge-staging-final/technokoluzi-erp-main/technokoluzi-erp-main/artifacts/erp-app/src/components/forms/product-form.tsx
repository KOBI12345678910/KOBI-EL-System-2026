import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const typeLabels = { product: "מוצר", service: "שירות" };
const unitLabels = { unit: "יחידה", kg: 'ק"ג', liter: "ליטר", meter: "מטר", hour: "שעה", box: "קופסה" };

export default function ProductForm({ open, onClose, onSave, product, suppliers = [] }) {
    const [formData, setFormData] = useState({
        name: '',
        sku: '',
        description: '',
        category: '',
        type: 'product',
        unit_price: 0,
        cost_price: 0,
        quantity_in_stock: 0,
        min_stock_level: 0,
        unit: 'unit',
        tax_rate: 17,
        is_active: true,
        image_url: '',
        supplier_id: ''
    });

    useEffect(() => {
        if (product) {
            setFormData({
                name: product.name || '',
                sku: product.sku || '',
                description: product.description || '',
                category: product.category || '',
                type: product.type || 'product',
                unit_price: product.unit_price || 0,
                cost_price: product.cost_price || 0,
                quantity_in_stock: product.quantity_in_stock || 0,
                min_stock_level: product.min_stock_level || 0,
                unit: product.unit || 'unit',
                tax_rate: product.tax_rate || 17,
                is_active: product.is_active !== false,
                image_url: product.image_url || '',
                supplier_id: product.supplier_id || ''
            });
        } else {
            setFormData({
                name: '',
                sku: '',
                description: '',
                category: '',
                type: 'product',
                unit_price: 0,
                cost_price: 0,
                quantity_in_stock: 0,
                min_stock_level: 0,
                unit: 'unit',
                tax_rate: 17,
                is_active: true,
                image_url: '',
                supplier_id: ''
            });
        }
    }, [product, open]);

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(formData);
    };

    const profit = formData.unit_price - formData.cost_price;
    const profitMargin = formData.unit_price > 0 ? ((profit / formData.unit_price) * 100).toFixed(1) : 0;

    return (
        <Sheet open={open} onOpenChange={onClose}>
            <SheetContent className="w-full sm:max-w-lg overflow-y-auto" side="left">
                <SheetHeader className="mb-6">
                    <SheetTitle className="text-xl">
                        {product ? 'עריכת מוצר' : 'מוצר חדש'}
                    </SheetTitle>
                </SheetHeader>

                <form onSubmit={handleSubmit}>
                    <Tabs defaultValue="general" className="w-full">
                        <TabsList className="grid w-full grid-cols-3 mb-6">
                            <TabsTrigger value="general">כללי</TabsTrigger>
                            <TabsTrigger value="pricing">מחירים</TabsTrigger>
                            <TabsTrigger value="inventory">מלאי</TabsTrigger>
                        </TabsList>

                        <TabsContent value="general" className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2">
                                    <Label>שם מוצר *</Label>
                                    <Input
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        required
                                        className="mt-1"
                                    />
                                </div>

                                <div>
                                    <Label>מק"ט</Label>
                                    <Input
                                        value={formData.sku}
                                        onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                                        className="mt-1"
                                    />
                                </div>

                                <div>
                                    <Label>קטגוריה</Label>
                                    <Input
                                        value={formData.category}
                                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                        className="mt-1"
                                    />
                                </div>

                                <div>
                                    <Label>סוג</Label>
                                    <Select
                                        value={formData.type}
                                        onValueChange={(value) => setFormData({ ...formData, type: value })}
                                    >
                                        <SelectTrigger className="mt-1">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {Object.entries(typeLabels).map(([key, label]) => (
                                                <SelectItem key={key} value={key}>{label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div>
                                    <Label>יחידת מידה</Label>
                                    <Select
                                        value={formData.unit}
                                        onValueChange={(value) => setFormData({ ...formData, unit: value })}
                                    >
                                        <SelectTrigger className="mt-1">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {Object.entries(unitLabels).map(([key, label]) => (
                                                <SelectItem key={key} value={key}>{label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="col-span-2">
                                    <Label>ספק</Label>
                                    <Select
                                        value={formData.supplier_id}
                                        onValueChange={(value) => setFormData({ ...formData, supplier_id: value })}
                                    >
                                        <SelectTrigger className="mt-1">
                                            <SelectValue placeholder="בחר ספק" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {suppliers.map((s) => (
                                                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="col-span-2">
                                    <Label>תיאור</Label>
                                    <Textarea
                                        value={formData.description}
                                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                        className="mt-1 h-20"
                                    />
                                </div>

                                <div className="col-span-2 flex items-center justify-between">
                                    <Label>פעיל</Label>
                                    <Switch
                                        checked={formData.is_active}
                                        onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                                    />
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="pricing" className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label>מחיר מכירה (₪) *</Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        value={formData.unit_price}
                                        onChange={(e) => setFormData({ ...formData, unit_price: parseFloat(e.target.value) || 0 })}
                                        required
                                        className="mt-1"
                                    />
                                </div>

                                <div>
                                    <Label>מחיר עלות (₪)</Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        value={formData.cost_price}
                                        onChange={(e) => setFormData({ ...formData, cost_price: parseFloat(e.target.value) || 0 })}
                                        className="mt-1"
                                    />
                                </div>

                                <div>
                                    <Label>אחוז מע"מ</Label>
                                    <Input
                                        type="number"
                                        value={formData.tax_rate}
                                        onChange={(e) => setFormData({ ...formData, tax_rate: parseFloat(e.target.value) || 0 })}
                                        className="mt-1"
                                    />
                                </div>

                                <div className="col-span-2 p-4 bg-slate-50 rounded-xl">
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-slate-600">רווח גולמי:</span>
                                        <span className="font-semibold text-emerald-600">₪{profit.toFixed(2)} ({profitMargin}%)</span>
                                    </div>
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="inventory" className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label>כמות במלאי</Label>
                                    <Input
                                        type="number"
                                        value={formData.quantity_in_stock}
                                        onChange={(e) => setFormData({ ...formData, quantity_in_stock: parseInt(e.target.value) || 0 })}
                                        className="mt-1"
                                    />
                                </div>

                                <div>
                                    <Label>מלאי מינימום</Label>
                                    <Input
                                        type="number"
                                        value={formData.min_stock_level}
                                        onChange={(e) => setFormData({ ...formData, min_stock_level: parseInt(e.target.value) || 0 })}
                                        className="mt-1"
                                    />
                                </div>

                                {formData.quantity_in_stock <= formData.min_stock_level && formData.type === 'product' && (
                                    <div className="col-span-2 p-4 bg-red-50 border border-red-200 rounded-xl">
                                        <p className="text-sm text-red-700 font-medium">⚠️ המלאי נמוך מהמינימום!</p>
                                    </div>
                                )}
                            </div>
                        </TabsContent>
                    </Tabs>

                    <div className="flex gap-3 pt-6">
                        <Button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700">
                            {product ? 'עדכן' : 'צור מוצר'}
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