import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DataTable from '../common/DataTable';
import StatusBadge from '../common/StatusBadge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Pencil, Trash2 } from 'lucide-react';
import { entityCreate, entityDelete, entityList, entityUpdate } from "@/lib/entity-api";

export default function DefectsTab() {
    const [formOpen, setFormOpen] = useState(false);
    const [selected, setSelected] = useState(null);
    const [formData, setFormData] = useState({
        type: 'other',
        severity: 'major',
        status: 'open',
        description: '',
        station: '',
        root_cause: '',
        corrective_action: ''
    });
    const queryClient = useQueryClient();

    const { data: defects = [], isLoading } = useQuery({
        queryKey: ['defects'],
        queryFn: () => entityList<any>("defects", '-created_date')
    });

    useEffect(() => {
        if (selected) {
            setFormData({
                type: selected.type || 'other',
                severity: selected.severity || 'major',
                status: selected.status || 'open',
                description: selected.description || '',
                station: selected.station || '',
                root_cause: selected.root_cause || '',
                corrective_action: selected.corrective_action || ''
            });
        }
    }, [selected, formOpen]);

    const createMutation = useMutation({
        mutationFn: (data) => entityCreate<any>("defects", {
            ...data,
            defect_number: `DEF-${Date.now()}`,
            detected_date: new Date().toISOString()
        }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['defects'] });
            setFormOpen(false);
            toast.success('פגם נרשם');
        }
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }) => entityUpdate<any>("defects", id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['defects'] });
            setFormOpen(false);
            setSelected(null);
            toast.success('פגם עודכן');
        }
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => entityDelete("defects", id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['defects'] });
            toast.success('פגם נמחק');
        }
    });

    const handleSave = (e) => {
        e.preventDefault();
        if (selected) {
            updateMutation.mutate({ id: selected.id, data: { ...selected, ...formData } });
        } else {
            createMutation.mutate(formData);
        }
    };

    const columns = [
        { key: 'defect_number', label: 'מספר', render: (v) => <span className="font-mono text-red-600">{v}</span> },
        { key: 'type', label: 'סוג', render: (v) => v?.replace(/_/g, ' ') },
        { key: 'severity', label: 'חומרה', render: (v) => <StatusBadge status={v} /> },
        { key: 'status', label: 'סטטוס', render: (v) => <StatusBadge status={v} /> },
        { key: 'station', label: 'תחנה' },
        { key: 'detected_date', label: 'תאריך', render: (v) => v ? format(new Date(v), 'dd/MM/yy') : '-' }
    ];

    const actions = [
        { label: 'עריכה', icon: Pencil, onClick: (d) => { setSelected(d); setFormOpen(true); } },
        { label: 'מחיקה', icon: Trash2, onClick: (d) => deleteMutation.mutate(d.id), destructive: true }
    ];

    return (
        <>
            <div className="mb-4">
                <Button onClick={() => { setSelected(null); setFormOpen(true); }}>
                    רשום פגם חדש
                </Button>
            </div>

            <DataTable
                data={defects}
                columns={columns}
                actions={actions}
                searchPlaceholder="חיפוש פגמים..."
                isLoading={isLoading}
            />

            <Sheet open={formOpen} onOpenChange={setFormOpen}>
                <SheetContent className="w-full sm:max-w-2xl overflow-y-auto" side="left">
                    <SheetHeader className="mb-6">
                        <SheetTitle>{selected ? 'עריכת פגם' : 'רישום פגם חדש'}</SheetTitle>
                    </SheetHeader>
                    <form onSubmit={handleSave} className="space-y-4">
                        <div>
                            <Label>סוג פגם</Label>
                            <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
                                <SelectTrigger className="mt-1">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="dimensional">ממדים</SelectItem>
                                    <SelectItem value="visual">ויזואלי</SelectItem>
                                    <SelectItem value="weld">ריתוך</SelectItem>
                                    <SelectItem value="surface">משטח</SelectItem>
                                    <SelectItem value="material">חומר</SelectItem>
                                    <SelectItem value="assembly">הרכבה</SelectItem>
                                    <SelectItem value="other">אחר</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <Label>חומרה</Label>
                            <Select value={formData.severity} onValueChange={(v) => setFormData({ ...formData, severity: v })}>
                                <SelectTrigger className="mt-1">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="minor">קל</SelectItem>
                                    <SelectItem value="major">בינוני</SelectItem>
                                    <SelectItem value="critical">קריטי</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <Label>תיאור</Label>
                            <Textarea
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                className="mt-1"
                                rows={3}
                            />
                        </div>

                        <div>
                            <Label>תחנה</Label>
                            <Input
                                value={formData.station}
                                onChange={(e) => setFormData({ ...formData, station: e.target.value })}
                                className="mt-1"
                            />
                        </div>

                        <div>
                            <Label>גורם שורש</Label>
                            <Textarea
                                value={formData.root_cause}
                                onChange={(e) => setFormData({ ...formData, root_cause: e.target.value })}
                                className="mt-1"
                            />
                        </div>

                        <div>
                            <Label>פעולה מתקנת</Label>
                            <Textarea
                                value={formData.corrective_action}
                                onChange={(e) => setFormData({ ...formData, corrective_action: e.target.value })}
                                className="mt-1"
                            />
                        </div>

                        <div className="flex gap-3 pt-4 border-t">
                            <Button type="submit" className="flex-1">
                                {selected ? 'עדכן' : 'רשום'}
                            </Button>
                            <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                                ביטול
                            </Button>
                        </div>
                    </form>
                </SheetContent>
            </Sheet>
        </>
    );
}