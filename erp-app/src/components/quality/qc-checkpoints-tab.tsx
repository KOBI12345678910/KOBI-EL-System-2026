import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DataTable from '../common/DataTable';
import StatusBadge from '../common/StatusBadge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Pencil, CheckCircle, XCircle } from 'lucide-react';
import { entityList, entityUpdate } from "@/lib/entity-api";

export default function QCCheckpointsTab() {
    const [formOpen, setFormOpen] = useState(false);
    const [selected, setSelected] = useState(null);
    const queryClient = useQueryClient();

    const { data: checkpoints = [], isLoading } = useQuery({
        queryKey: ['qc_checkpoints'],
        queryFn: () => entityList<any>("qc-checkpoints", '-created_date')
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }) => entityUpdate<any>("qc-checkpoints", id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['qc_checkpoints'] });
            setFormOpen(false);
            toast.success('נקודת בדיקה עודכנה');
        }
    });

    const handlePass = (checkpoint) => {
        updateMutation.mutate({
            id: checkpoint.id,
            data: { 
                ...checkpoint, 
                status: 'passed',
                approved_for_next_stage: true,
                inspection_date: new Date().toISOString()
            }
        });
    };

    const handleFail = (checkpoint) => {
        updateMutation.mutate({
            id: checkpoint.id,
            data: { 
                ...checkpoint, 
                status: 'failed',
                requires_rework: true,
                approved_for_next_stage: false,
                inspection_date: new Date().toISOString()
            }
        });
    };

    const columns = [
        { key: 'checkpoint_number', label: 'מספר', render: (v) => <span className="font-mono">{v}</span> },
        { key: 'production_order_id', label: 'פקודת ייצור' },
        { key: 'station', label: 'תחנה', render: (v) => v?.replace(/_/g, ' ') },
        { key: 'status', label: 'סטטוס', render: (v) => <StatusBadge status={v} /> },
        { key: 'inspector_name', label: 'בודק' },
        { key: 'inspection_date', label: 'תאריך', render: (v) => v ? format(new Date(v), 'dd/MM/yy HH:mm') : '-' },
        { key: 'requires_rework', label: 'דורש תיקון', render: (v) => v ? '✓' : '-' }
    ];

    const actions = [
        { label: 'עריכה', icon: Pencil, onClick: (d) => { setSelected(d); setFormOpen(true); } },
        { label: 'אישור', icon: CheckCircle, onClick: handlePass, show: (d) => d.status !== 'passed' },
        { label: 'דחייה', icon: XCircle, onClick: handleFail, show: (d) => d.status !== 'failed', destructive: true }
    ];

    return (
        <>
            <DataTable
                data={checkpoints}
                columns={columns}
                actions={actions}
                searchPlaceholder="חיפוש נקודות בדיקה..."
                isLoading={isLoading}
            />

            <Sheet open={formOpen} onOpenChange={setFormOpen}>
                <SheetContent className="w-full sm:max-w-2xl overflow-y-auto" side="left">
                    <SheetHeader className="mb-6">
                        <SheetTitle>בדיקת איכות - {selected?.station}</SheetTitle>
                    </SheetHeader>
                    {selected && (
                        <div className="space-y-6">
                            <div>
                                <Label>סטטוס</Label>
                                <div className="mt-2">
                                    <StatusBadge status={selected.status} />
                                </div>
                            </div>

                            <div>
                                <Label>הערות</Label>
                                <Textarea
                                    value={selected.notes || ''}
                                    onChange={(e) => setSelected({ ...selected, notes: e.target.value })}
                                    className="mt-1"
                                    rows={4}
                                />
                            </div>

                            <div className="flex gap-3">
                                <Button 
                                    onClick={() => updateMutation.mutate({ id: selected.id, data: selected })}
                                    className="flex-1"
                                >
                                    שמור
                                </Button>
                                <Button variant="outline" onClick={() => setFormOpen(false)}>
                                    ביטול
                                </Button>
                            </div>
                        </div>
                    )}
                </SheetContent>
            </Sheet>
        </>
    );
}