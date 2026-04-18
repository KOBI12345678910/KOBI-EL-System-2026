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
import { Slider } from "@/components/ui/slider";

const statusLabels = {
    planning: "תכנון",
    active: "פעיל",
    on_hold: "מושהה",
    completed: "הושלם",
    cancelled: "בוטל"
};

const priorityLabels = {
    low: "נמוכה",
    medium: "בינונית",
    high: "גבוהה",
    urgent: "דחוף"
};

export default function ProjectForm({ open, onClose, onSave, project, customers = [], users = [] }) {
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        customer_id: '',
        customer_name: '',
        status: 'planning',
        priority: 'medium',
        start_date: '',
        end_date: '',
        budget: 0,
        progress: 0,
        manager: ''
    });

    useEffect(() => {
        if (project) {
            setFormData({
                name: project.name || '',
                description: project.description || '',
                customer_id: project.customer_id || '',
                customer_name: project.customer_name || '',
                status: project.status || 'planning',
                priority: project.priority || 'medium',
                start_date: project.start_date || '',
                end_date: project.end_date || '',
                budget: project.budget || 0,
                progress: project.progress || 0,
                manager: project.manager || ''
            });
        } else {
            setFormData({
                name: '',
                description: '',
                customer_id: '',
                customer_name: '',
                status: 'planning',
                priority: 'medium',
                start_date: new Date().toISOString().split('T')[0],
                end_date: '',
                budget: 0,
                progress: 0,
                manager: ''
            });
        }
    }, [project, open]);

    const handleCustomerChange = (customerId) => {
        const customer = customers.find(c => c.id === customerId);
        setFormData({
            ...formData,
            customer_id: customerId,
            customer_name: customer?.name || ''
        });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(formData);
    };

    return (
        <Sheet open={open} onOpenChange={onClose}>
            <SheetContent className="w-full sm:max-w-lg overflow-y-auto" side="left">
                <SheetHeader className="mb-6">
                    <SheetTitle className="text-xl">
                        {project ? 'עריכת פרויקט' : 'פרויקט חדש'}
                    </SheetTitle>
                </SheetHeader>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <Label>שם פרויקט *</Label>
                            <Input
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                required
                                className="mt-1"
                            />
                        </div>

                        <div className="col-span-2">
                            <Label>לקוח</Label>
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
                            <Label>עדיפות</Label>
                            <Select
                                value={formData.priority}
                                onValueChange={(value) => setFormData({ ...formData, priority: value })}
                            >
                                <SelectTrigger className="mt-1">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.entries(priorityLabels).map(([key, label]) => (
                                        <SelectItem key={key} value={key}>{label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <Label>תאריך התחלה</Label>
                            <Input
                                type="date"
                                value={formData.start_date}
                                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                                className="mt-1"
                            />
                        </div>

                        <div>
                            <Label>תאריך סיום</Label>
                            <Input
                                type="date"
                                value={formData.end_date}
                                onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                                className="mt-1"
                            />
                        </div>

                        <div>
                            <Label>תקציב (₪)</Label>
                            <Input
                                type="number"
                                value={formData.budget}
                                onChange={(e) => setFormData({ ...formData, budget: parseFloat(e.target.value) || 0 })}
                                className="mt-1"
                            />
                        </div>

                        <div>
                            <Label>מנהל פרויקט</Label>
                            <Select
                                value={formData.manager}
                                onValueChange={(value) => setFormData({ ...formData, manager: value })}
                            >
                                <SelectTrigger className="mt-1">
                                    <SelectValue placeholder="בחר מנהל" />
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
                            <Label>התקדמות ({formData.progress}%)</Label>
                            <Slider
                                value={[formData.progress]}
                                onValueChange={([value]) => setFormData({ ...formData, progress: value })}
                                max={100}
                                step={5}
                                className="mt-3"
                            />
                        </div>

                        <div className="col-span-2">
                            <Label>תיאור</Label>
                            <Textarea
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                className="mt-1 h-24"
                            />
                        </div>
                    </div>

                    <div className="flex gap-3 pt-4">
                        <Button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700">
                            {project ? 'עדכן' : 'צור פרויקט'}
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