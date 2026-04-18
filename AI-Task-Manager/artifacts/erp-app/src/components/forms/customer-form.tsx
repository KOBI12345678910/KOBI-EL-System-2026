import { useState, useEffect } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const typeLabels = { individual: "פרטי", business: "עסקי" };
const statusLabels = { active: "פעיל", inactive: "לא פעיל", vip: "VIP" };

export default function CustomerForm({ open, onClose, onSave, customer, users = [] }) {
    const [formData, setFormData] = useState({
        name: '',
        company: '',
        email: '',
        phone: '',
        address: '',
        city: '',
        type: 'business',
        status: 'active',
        tax_id: '',
        payment_terms: 30,
        credit_limit: 0,
        notes: '',
        assigned_to: ''
    });

    useEffect(() => {
        if (customer) {
            setFormData({
                name: customer.name || '',
                company: customer.company || '',
                email: customer.email || '',
                phone: customer.phone || '',
                address: customer.address || '',
                city: customer.city || '',
                type: customer.type || 'business',
                status: customer.status || 'active',
                tax_id: customer.tax_id || '',
                payment_terms: customer.payment_terms || 30,
                credit_limit: customer.credit_limit || 0,
                notes: customer.notes || '',
                assigned_to: customer.assigned_to || ''
            });
        } else {
            setFormData({
                name: '',
                company: '',
                email: '',
                phone: '',
                address: '',
                city: '',
                type: 'business',
                status: 'active',
                tax_id: '',
                payment_terms: 30,
                credit_limit: 0,
                notes: '',
                assigned_to: ''
            });
        }
    }, [customer, open]);

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(formData);
    };

    return (
        <Sheet open={open} onOpenChange={onClose}>
            <SheetContent className="w-full sm:max-w-lg overflow-y-auto" side="left">
                <SheetHeader className="mb-6">
                    <SheetTitle className="text-xl">
                        {customer ? 'עריכת לקוח' : 'לקוח חדש'}
                    </SheetTitle>
                </SheetHeader>

                <form onSubmit={handleSubmit}>
                    <Tabs defaultValue="general" className="w-full">
                        <TabsList className="grid w-full grid-cols-2 mb-6">
                            <TabsTrigger value="general">פרטים כלליים</TabsTrigger>
                            <TabsTrigger value="financial">פרטים פיננסיים</TabsTrigger>
                        </TabsList>

                        <TabsContent value="general" className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2">
                                    <Label>שם לקוח *</Label>
                                    <Input
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        required
                                        className="mt-1"
                                    />
                                </div>

                                <div className="col-span-2">
                                    <Label>חברה</Label>
                                    <Input
                                        value={formData.company}
                                        onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                                        className="mt-1"
                                    />
                                </div>

                                <div>
                                    <Label>אימייל</Label>
                                    <Input
                                        type="email"
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        className="mt-1"
                                    />
                                </div>

                                <div>
                                    <Label>טלפון</Label>
                                    <Input
                                        value={formData.phone}
                                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                        className="mt-1"
                                    />
                                </div>

                                <div className="col-span-2">
                                    <Label>כתובת</Label>
                                    <Input
                                        value={formData.address}
                                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                        className="mt-1"
                                    />
                                </div>

                                <div>
                                    <Label>עיר</Label>
                                    <Input
                                        value={formData.city}
                                        onChange={(e) => setFormData({ ...formData, city: e.target.value })}
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
                                    <Label>אחראי</Label>
                                    <Select
                                        value={formData.assigned_to}
                                        onValueChange={(value) => setFormData({ ...formData, assigned_to: value })}
                                    >
                                        <SelectTrigger className="mt-1">
                                            <SelectValue placeholder="בחר אחראי" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {users.map((user) => (
                                                <SelectItem key={user.email} value={user.email}>
                                                    {user.full_name || user.email}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="col-span-2">
                                    <Label>הערות</Label>
                                    <Textarea
                                        value={formData.notes}
                                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                        className="mt-1 h-20"
                                    />
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="financial" className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2">
                                    <Label>מספר עוסק / ח.פ.</Label>
                                    <Input
                                        value={formData.tax_id}
                                        onChange={(e) => setFormData({ ...formData, tax_id: e.target.value })}
                                        className="mt-1"
                                    />
                                </div>

                                <div>
                                    <Label>ימי אשראי</Label>
                                    <Input
                                        type="number"
                                        value={formData.payment_terms}
                                        onChange={(e) => setFormData({ ...formData, payment_terms: parseInt(e.target.value) || 0 })}
                                        className="mt-1"
                                    />
                                </div>

                                <div>
                                    <Label>מסגרת אשראי (₪)</Label>
                                    <Input
                                        type="number"
                                        value={formData.credit_limit}
                                        onChange={(e) => setFormData({ ...formData, credit_limit: parseFloat(e.target.value) || 0 })}
                                        className="mt-1"
                                    />
                                </div>
                            </div>
                        </TabsContent>
                    </Tabs>

                    <div className="flex gap-3 pt-6">
                        <Button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700">
                            {customer ? 'עדכן' : 'צור לקוח'}
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