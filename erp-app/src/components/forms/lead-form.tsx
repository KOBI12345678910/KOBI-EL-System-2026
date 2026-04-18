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
import { X } from 'lucide-react';

const sourceLabels = {
    website: "אתר",
    referral: "הפניה",
    social: "רשתות חברתיות",
    advertising: "פרסום",
    cold_call: "שיחה קרה",
    event: "אירוע",
    other: "אחר"
};

const statusLabels = {
    new: "חדש",
    contacted: "נוצר קשר",
    qualified: "מוסמך",
    proposal: "הצעה",
    negotiation: "משא ומתן",
    won: "זכייה",
    lost: "הפסד"
};

export default function LeadForm({ open, onClose, onSave, lead, users = [] }) {
    const [formData, setFormData] = useState({
        name: '',
        company: '',
        email: '',
        phone: '',
        source: 'website',
        status: 'new',
        estimated_value: 0,
        notes: '',
        assigned_to: '',
        next_followup: ''
    });

    useEffect(() => {
        if (lead) {
            setFormData({
                name: lead.name || '',
                company: lead.company || '',
                email: lead.email || '',
                phone: lead.phone || '',
                source: lead.source || 'website',
                status: lead.status || 'new',
                estimated_value: lead.estimated_value || 0,
                notes: lead.notes || '',
                assigned_to: lead.assigned_to || '',
                next_followup: lead.next_followup || ''
            });
        } else {
            setFormData({
                name: '',
                company: '',
                email: '',
                phone: '',
                source: 'website',
                status: 'new',
                estimated_value: 0,
                notes: '',
                assigned_to: '',
                next_followup: ''
            });
        }
    }, [lead, open]);

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(formData);
    };

    return (
        <Sheet open={open} onOpenChange={onClose}>
            <SheetContent className="w-full sm:max-w-lg overflow-y-auto" side="left">
                <SheetHeader className="mb-6">
                    <SheetTitle className="text-xl">
                        {lead ? 'עריכת ליד' : 'ליד חדש'}
                    </SheetTitle>
                </SheetHeader>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <Label>שם *</Label>
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

                        <div>
                            <Label>מקור</Label>
                            <Select
                                value={formData.source}
                                onValueChange={(value) => setFormData({ ...formData, source: value })}
                            >
                                <SelectTrigger className="mt-1">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.entries(sourceLabels).map(([key, label]) => (
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
                            <Label>שווי משוער (₪)</Label>
                            <Input
                                type="number"
                                value={formData.estimated_value}
                                onChange={(e) => setFormData({ ...formData, estimated_value: parseFloat(e.target.value) || 0 })}
                                className="mt-1"
                            />
                        </div>

                        <div>
                            <Label>מעקב הבא</Label>
                            <Input
                                type="date"
                                value={formData.next_followup}
                                onChange={(e) => setFormData({ ...formData, next_followup: e.target.value })}
                                className="mt-1"
                            />
                        </div>

                        <div className="col-span-2">
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
                                className="mt-1 h-24"
                            />
                        </div>
                    </div>

                    <div className="flex gap-3 pt-4">
                        <Button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700">
                            {lead ? 'עדכן' : 'צור ליד'}
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