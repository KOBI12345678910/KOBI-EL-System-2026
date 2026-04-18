import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DataTable from '../common/DataTable';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Eye, AlertCircle } from 'lucide-react';
import { cn } from "@/lib/utils";
import { entityList } from "@/lib/entity-api";

export default function JobCostingTable() {
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [selected, setSelected] = useState(null);

    const { data: jobCosts = [], isLoading } = useQuery({
        queryKey: ['job_costs'],
        queryFn: () => entityList<any>("job-costs", '-created_date')
    });

    const columns = [
        { key: 'production_order_id', label: 'פקודה', render: (v) => <span className="font-mono text-indigo-600">{v}</span> },
        { key: 'customer_name', label: 'לקוח' },
        { key: 'product_name', label: 'מוצר' },
        { 
            key: 'total_actual_cost', 
            label: 'עלות בפועל', 
            render: (v) => `₪${(v || 0).toLocaleString()}` 
        },
        { 
            key: 'revenue', 
            label: 'הכנסה', 
            render: (v) => `₪${(v || 0).toLocaleString()}` 
        },
        { 
            key: 'margin_percent', 
            label: 'שולי רווח', 
            render: (v, row) => (
                <div className="flex items-center gap-2">
                    <span className={cn(
                        "font-semibold",
                        v < 15 ? "text-red-600" : v < 25 ? "text-orange-500" : "text-green-600"
                    )}>
                        {v?.toFixed(1)}%
                    </span>
                    {row.margin_alert && <AlertCircle className="w-4 h-4 text-red-500" />}
                </div>
            )
        },
        { 
            key: 'variance_total', 
            label: 'סטייה', 
            render: (v) => (
                <span className={cn("font-medium", v > 0 ? "text-red-600" : "text-green-600")}>
                    {v > 0 ? '+' : ''}{v?.toLocaleString() || 0}
                </span>
            )
        }
    ];

    const actions = [
        { 
            label: 'פרטים', 
            icon: Eye, 
            onClick: (job) => { setSelected(job); setDetailsOpen(true); } 
        }
    ];

    return (
        <>
            <DataTable
                data={jobCosts}
                columns={columns}
                actions={actions}
                searchPlaceholder="חיפוש עבודות..."
                isLoading={isLoading}
            />

            <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
                <SheetContent className="w-full sm:max-w-3xl overflow-y-auto" side="left">
                    <SheetHeader className="mb-6">
                        <SheetTitle>פירוט עלויות - {selected?.product_name}</SheetTitle>
                    </SheetHeader>
                    {selected && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <Card>
                                    <CardHeader className="pb-3">
                                        <CardTitle className="text-sm font-medium">הכנסה</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-bold">₪{selected.revenue?.toLocaleString()}</div>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardHeader className="pb-3">
                                        <CardTitle className="text-sm font-medium">רווח גולמי</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-bold text-green-600">
                                            ₪{selected.gross_profit?.toLocaleString()}
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>

                            <Card>
                                <CardHeader>
                                    <CardTitle>חומרים</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-600">מתוכנן:</span>
                                        <span className="font-semibold">₪{selected.planned_materials_cost?.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-600">בפועל:</span>
                                        <span className="font-semibold">₪{selected.actual_materials_cost?.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-600">סטייה:</span>
                                        <span className={cn(
                                            "font-semibold",
                                            selected.variance_materials > 0 ? "text-red-600" : "text-green-600"
                                        )}>
                                            {selected.variance_materials > 0 ? '+' : ''}₪{selected.variance_materials?.toLocaleString()}
                                        </span>
                                    </div>
                                    <Progress 
                                        value={(selected.actual_materials_cost / selected.planned_materials_cost) * 100} 
                                        className="h-2"
                                    />
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle>עבודה</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-600">שעות מתוכנן:</span>
                                        <span className="font-semibold">{selected.planned_labor_hours}h</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-600">שעות בפועל:</span>
                                        <span className="font-semibold">{selected.actual_labor_hours}h</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-600">עלות מתוכנן:</span>
                                        <span className="font-semibold">₪{selected.planned_labor_cost?.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-600">עלות בפועל:</span>
                                        <span className="font-semibold">₪{selected.actual_labor_cost?.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-600">סטייה:</span>
                                        <span className={cn(
                                            "font-semibold",
                                            selected.variance_labor > 0 ? "text-red-600" : "text-green-600"
                                        )}>
                                            {selected.variance_labor > 0 ? '+' : ''}₪{selected.variance_labor?.toLocaleString()}
                                        </span>
                                    </div>
                                    <Progress 
                                        value={(selected.actual_labor_cost / selected.planned_labor_cost) * 100} 
                                        className="h-2"
                                    />
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle>קבלני משנה</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-600">מתוכנן:</span>
                                        <span className="font-semibold">₪{selected.planned_subcontractor_cost?.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-600">בפועל:</span>
                                        <span className="font-semibold">₪{selected.actual_subcontractor_cost?.toLocaleString()}</span>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle>הקצאת תקורה</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-xl font-semibold">₪{selected.overhead_allocation?.toLocaleString()}</div>
                                </CardContent>
                            </Card>
                        </div>
                    )}
                </SheetContent>
            </Sheet>
        </>
    );
}