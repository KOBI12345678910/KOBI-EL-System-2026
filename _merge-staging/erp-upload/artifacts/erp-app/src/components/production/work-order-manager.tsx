import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Play, Pause, CheckCircle, Upload, AlertCircle, Clock, Users } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { entityCreate, entityFilter, entityList, entityUpdate } from "@/lib/entity-api";

const stationLabels = {
    survey: 'סקר ומדידה',
    engineering: 'הנדסה',
    cutting: 'חיתוך CNC',
    welding: 'ריתוך',
    finishing: 'גימור',
    painting: 'צביעה',
    galvanizing: 'גלוון',
    qc: 'בקרת איכות',
    packaging: 'אריזה',
    delivery: 'משלוח/התקנה'
};

const stationOrder = ['survey', 'engineering', 'cutting', 'welding', 'finishing', 'painting', 'galvanizing', 'qc', 'packaging', 'delivery'];

export default function WorkOrderManager({ productionOrder }) {
    const [dialogOpen, setDialogOpen] = useState(false);
    const [selectedWO, setSelectedWO] = useState(null);
    const queryClient = useQueryClient();

    const { data: workOrders = [] } = useQuery({
        queryKey: ['workOrders', productionOrder.id],
        queryFn: () => entityFilter<any>("work-orders", { production_order_id: productionOrder.id })
    });

    const { data: workCenters = [] } = useQuery({
        queryKey: ['workCenters'],
        queryFn: () => entityList<any>("work-centers")
    });

    const { data: employees = [] } = useQuery({
        queryKey: ['employees'],
        queryFn: () => entityList<any>("employees")
    });

    const createWorkOrders = async () => {
        const promises = stationOrder.map((station, index) => {
            return entityCreate<any>("work-orders", {
                work_order_number: `WO-${productionOrder.order_number}-${station.toUpperCase()}`,
                production_order_id: productionOrder.id,
                production_order_number: productionOrder.order_number,
                station,
                sequence: index + 1,
                status: 'pending',
                qc_required: ['welding', 'painting', 'qc'].includes(station)
            });
        });
        await Promise.all(promises);
        queryClient.invalidateQueries({ queryKey: ['workOrders'] });
        toast.success('פקודות עבודה נוצרו');
    };

    const startWorkOrder = async (wo) => {
        await entityUpdate<any>("work-orders", wo.id, {
            ...wo,
            status: 'in_progress',
            actual_start: new Date().toISOString()
        });
        queryClient.invalidateQueries({ queryKey: ['workOrders'] });
        toast.success('פקודה החלה');
    };

    const completeWorkOrder = async (wo) => {
        if (wo.qc_required && !wo.qc_passed) {
            toast.error('יש לעבור בקרת איכות לפני השלמה');
            return;
        }
        await entityUpdate<any>("work-orders", wo.id, {
            ...wo,
            status: 'completed',
            actual_end: new Date().toISOString()
        });
        queryClient.invalidateQueries({ queryKey: ['workOrders'] });
        toast.success('פקודה הושלמה');
    };

    const openDetails = (wo) => {
        setSelectedWO(wo);
        setDialogOpen(true);
    };

    const updateWO = async (data) => {
        await entityUpdate<any>("work-orders", selectedWO.id, { ...selectedWO, ...data });
        queryClient.invalidateQueries({ queryKey: ['workOrders'] });
        setDialogOpen(false);
        toast.success('פקודה עודכנה');
    };

    const sortedWorkOrders = [...workOrders].sort((a, b) => a.sequence - b.sequence);

    return (
        <div className="space-y-4">
            {workOrders.length === 0 && (
                <Card>
                    <CardContent className="py-8 text-center">
                        <p className="text-slate-600 mb-4">לא נוצרו פקודות עבודה עדיין</p>
                        <Button onClick={createWorkOrders}>
                            צור פקודות עבודה לכל השלבים
                        </Button>
                    </CardContent>
                </Card>
            )}

            {sortedWorkOrders.map((wo) => (
                <Card key={wo.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => openDetails(wo)}>
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                                    wo.status === 'completed' ? 'bg-emerald-100' :
                                    wo.status === 'in_progress' ? 'bg-blue-100' :
                                    wo.status === 'failed' ? 'bg-red-100' : 'bg-slate-100'
                                }`}>
                                    {wo.status === 'completed' ? <CheckCircle className="w-5 h-5 text-emerald-600" /> :
                                     wo.status === 'in_progress' ? <Clock className="w-5 h-5 text-blue-600" /> :
                                     wo.status === 'failed' ? <AlertCircle className="w-5 h-5 text-red-600" /> :
                                     <span className="text-sm font-bold text-slate-600">{wo.sequence}</span>}
                                </div>
                                <div>
                                    <CardTitle className="text-base">{stationLabels[wo.station]}</CardTitle>
                                    <p className="text-xs text-slate-500 mt-0.5">{wo.work_order_number}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {wo.qc_required && (
                                    <Badge variant="outline" className="text-xs">
                                        {wo.qc_passed ? '✓ QC' : 'QC נדרש'}
                                    </Badge>
                                )}
                                <Badge className={
                                    wo.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                                    wo.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                                    wo.status === 'on_hold' ? 'bg-amber-100 text-amber-700' :
                                    wo.status === 'failed' ? 'bg-red-100 text-red-700' :
                                    'bg-slate-100 text-slate-700'
                                }>
                                    {wo.status === 'pending' ? 'ממתין' :
                                     wo.status === 'in_progress' ? 'בתהליך' :
                                     wo.status === 'completed' ? 'הושלם' :
                                     wo.status === 'on_hold' ? 'מושהה' : 'נכשל'}
                                </Badge>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-3 gap-4 text-sm">
                            <div>
                                <p className="text-slate-500 text-xs">תחנת עבודה</p>
                                <p className="font-medium">{wo.work_center_name || '-'}</p>
                            </div>
                            <div>
                                <p className="text-slate-500 text-xs">משוייך ל</p>
                                <div className="flex items-center gap-1 mt-1">
                                    <Users className="w-3 h-3 text-slate-400" />
                                    <p className="font-medium">{wo.assigned_to?.length || 0}</p>
                                </div>
                            </div>
                            <div>
                                <p className="text-slate-500 text-xs">זמן</p>
                                <p className="font-medium">{wo.actual_hours || 0}h / {wo.estimated_hours || 0}h</p>
                            </div>
                        </div>
                        {wo.notes && (
                            <p className="text-xs text-slate-600 mt-3 line-clamp-2">{wo.notes}</p>
                        )}
                        <div className="flex gap-2 mt-4" onClick={(e) => e.stopPropagation()}>
                            {wo.status === 'pending' && (
                                <Button size="sm" variant="outline" onClick={() => startWorkOrder(wo)}>
                                    <Play className="w-3 h-3 ml-1" />
                                    התחל
                                </Button>
                            )}
                            {wo.status === 'in_progress' && (
                                <Button size="sm" onClick={() => completeWorkOrder(wo)} className="bg-emerald-600 hover:bg-emerald-700">
                                    <CheckCircle className="w-3 h-3 ml-1" />
                                    השלם
                                </Button>
                            )}
                        </div>
                    </CardContent>
                </Card>
            ))}

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{selectedWO && stationLabels[selectedWO.station]}</DialogTitle>
                    </DialogHeader>
                    {selectedWO && <WorkOrderForm workOrder={selectedWO} workCenters={workCenters} employees={employees} onSave={updateWO} />}
                </DialogContent>
            </Dialog>
        </div>
    );
}

function WorkOrderForm({ workOrder, workCenters, employees, onSave }) {
    const [formData, setFormData] = useState({
        work_center_id: workOrder.work_center_id || '',
        assigned_to: workOrder.assigned_to || [],
        estimated_hours: workOrder.estimated_hours || 0,
        actual_hours: workOrder.actual_hours || 0,
        qc_passed: workOrder.qc_passed || false,
        qc_notes: workOrder.qc_notes || '',
        qc_inspector: workOrder.qc_inspector || '',
        notes: workOrder.notes || ''
    });

    const handleSave = (e) => {
        e.preventDefault();
        const wcName = workCenters.find(wc => wc.id === formData.work_center_id)?.name;
        onSave({ ...formData, work_center_name: wcName });
    };

    return (
        <form onSubmit={handleSave} className="space-y-4">
            <div>
                <Label>תחנת עבודה</Label>
                <Select value={formData.work_center_id} onValueChange={(v) => setFormData({ ...formData, work_center_id: v })}>
                    <SelectTrigger className="mt-1">
                        <SelectValue placeholder="בחר תחנה" />
                    </SelectTrigger>
                    <SelectContent>
                        {workCenters.map(wc => (
                            <SelectItem key={wc.id} value={wc.id}>{wc.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <Label>שעות משוערות</Label>
                    <Input type="number" value={formData.estimated_hours} onChange={(e) => setFormData({ ...formData, estimated_hours: parseFloat(e.target.value) || 0 })} className="mt-1" />
                </div>
                <div>
                    <Label>שעות בפועל</Label>
                    <Input type="number" value={formData.actual_hours} onChange={(e) => setFormData({ ...formData, actual_hours: parseFloat(e.target.value) || 0 })} className="mt-1" />
                </div>
            </div>

            <div>
                <Label>הערות</Label>
                <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className="mt-1 h-20" />
            </div>

            {workOrder.qc_required && (
                <>
                    <Separator />
                    <div className="space-y-4">
                        <h3 className="font-semibold text-sm">בקרת איכות</h3>
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={formData.qc_passed}
                                onChange={(e) => setFormData({ ...formData, qc_passed: e.target.checked })}
                                className="w-4 h-4"
                            />
                            <Label>עבר בקרת איכות</Label>
                        </div>
                        <div>
                            <Label>בודק</Label>
                            <Select value={formData.qc_inspector} onValueChange={(v) => setFormData({ ...formData, qc_inspector: v })}>
                                <SelectTrigger className="mt-1">
                                    <SelectValue placeholder="בחר בודק" />
                                </SelectTrigger>
                                <SelectContent>
                                    {employees.filter(e => e.department === 'qc').map(e => (
                                        <SelectItem key={e.email} value={e.email}>{e.full_name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>הערות QC</Label>
                            <Textarea value={formData.qc_notes} onChange={(e) => setFormData({ ...formData, qc_notes: e.target.value })} className="mt-1 h-20" />
                        </div>
                    </div>
                </>
            )}

            <div className="flex gap-3 pt-4 border-t">
                <Button type="submit" className="flex-1">עדכן</Button>
            </div>
        </form>
    );
}