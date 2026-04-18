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

export default function NCRTab() {
    const [formOpen, setFormOpen] = useState(false);
    const [selected, setSelected] = useState(null);
    const [formData, setFormData] = useState({
        title: '',
        type: 'product',
        status: 'open',
        priority: 'medium',
        description: '',
        disposition: 'pending',
        root_cause_analysis: '',
        corrective_action: ''
    });
    const queryClient = useQueryClient();

    const { data: ncrs = [], isLoading } = useQuery({
        queryKey: ['ncrs'],
        queryFn: () => entityList<any>("ncrs", '-created_date')
    });

    useEffect(() => {
        if (selected) {
            setFormData({
                title: selected.title || '',
                type: selected.type || 'product',
                status: selected.status || 'open',
                priority: selected.priority || 'medium',
                description: selected.description || '',
                disposition: selected.disposition || 'pending',
                root_cause_analysis: selected.root_cause_analysis || '',
                corrective_action: selected.corrective_action || ''
            });
        } else {
            setFormData({
                title: '',
                type: 'product',
                status: 'open',
                priority: 'medium',
                description: '',
                disposition: 'pending',
                root_cause_analysis: '',
                corrective_action: ''
            });
        }
    }, [selected, formOpen]);

    const createMutation = useMutation({
        mutationFn: (data) => entityCreate<any>("ncrs", {
            ...data,
            ncr_number: `NCR-${Date.now()}`,
            detected_date: new Date().toISOString()
        }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['ncrs'] });
            setFormOpen(false);
            toast.success('NCR נוצר');
        }
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }) => entityUpdate<any>("ncrs", id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['ncrs'] });
            setFormOpen(false);
            setSelected(null);
            toast.success('NCR עודכן');
        }
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => entityDelete("ncrs", id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['ncrs'] });
            toast.success('NCR נמחק');
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
        { key: 'ncr_number', label: 'מספר NCR', render: (v) => <span className="font-mono text-orange-600">{v}</span> },
        { key: 'title', label: 'כותרת' },
        { key: 'type', label: 'סוג' },
        { key: 'status', label: 'סטטוס', render: (v) => <StatusBadge status={v} /> },
        { key: 'priority', label: 'עדיפות', render: (v) => <StatusBadge status={v} /> },
        { key: 'disposition', label: 'החלטה', render: (v) => v?.replace(/_/g, ' ') },
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
                    פתח NCR חדש
                </Button>
            </div>

            <DataTable
                data={ncrs}
                columns={columns}
                actions={actions}
                searchPlaceholder="חיפוש NCR..."
                isLoading={isLoading}
            />

            <Sheet open={formOpen} onOpenChange={setFormOpen}>
                <SheetContent className="w-full sm:max-w-2xl overflow-y-auto" side="left">
                    <SheetHeader className="mb-6">
                        <SheetTitle>{selected ? 'עריכת NCR' : 'NCR חדש'}</SheetTitle>
                    </SheetHeader>
                    <form onSubmit={handleSave} className="space-y-4">
                        <div>
                            <Label>כותרת *</Label>
                            <Input
                                value={formData.title}
                                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                required
                                className="mt-1"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label>סוג</Label>
                                <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
                                    <SelectTrigger className="mt-1">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="product">מוצר</SelectItem>
                                        <SelectItem value="process">תהליך</SelectItem>
                                        <SelectItem value="supplier">ספק</SelectItem>
                                        <SelectItem value="customer">לקוח</SelectItem>
                                        <SelectItem value="system">מערכת</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div>
                                <Label>עדיפות</Label>
                                <Select value={formData.priority} onValueChange={(v) => setFormData({ ...formData, priority: v })}>
                                    <SelectTrigger className="mt-1">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="low">נמוכה</SelectItem>
                                        <SelectItem value="medium">בינונית</SelectItem>
                                        <SelectItem value="high">גבוהה</SelectItem>
                                        <SelectItem value="critical">קריטית</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
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
                            <Label>החלטה</Label>
                            <Select value={formData.disposition} onValueChange={(v) => setFormData({ ...formData, disposition: v })}>
                                <SelectTrigger className="mt-1">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="pending">ממתין</SelectItem>
                                    <SelectItem value="rework">תיקון</SelectItem>
                                    <SelectItem value="use_as_is">שימוש כמו שהוא</SelectItem>
                                    <SelectItem value="scrap">גריטה</SelectItem>
                                    <SelectItem value="return_to_supplier">החזרה לספק</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <Label>ניתוח גורם שורש</Label>
                            <Textarea
                                value={formData.root_cause_analysis}
                                onChange={(e) => setFormData({ ...formData, root_cause_analysis: e.target.value })}
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
                                {selected ? 'עדכן' : 'צור'}
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