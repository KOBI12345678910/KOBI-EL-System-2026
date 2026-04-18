import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, TrendingDown } from 'lucide-react';
import EmptyState from '../common/EmptyState';
import { entityList } from "@/lib/entity-api";

export default function MarginAlerts() {
    const { data: jobCosts = [] } = useQuery({
        queryKey: ['job_costs'],
        queryFn: () => entityList<any>("job-costs", '-created_date')
    });

    const alertJobs = jobCosts.filter(j => j.margin_alert || j.margin_percent < j.margin_threshold);

    if (alertJobs.length === 0) {
        return (
            <EmptyState
                icon={AlertTriangle}
                title="אין התראות על שוליים"
                description="כל העבודות בטווח שולי הרווח הרצוי"
            />
        );
    }

    return (
        <div className="space-y-4">
            {alertJobs.map((job) => (
                <Card key={job.id} className="border-red-200 bg-red-50/50">
                    <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                            <div>
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <AlertTriangle className="w-5 h-5 text-red-500" />
                                    {job.product_name}
                                </CardTitle>
                                <div className="text-sm text-slate-600 mt-1">
                                    לקוח: {job.customer_name} | פקודה: {job.production_order_id}
                                </div>
                            </div>
                            <Badge variant="destructive" className="text-lg font-bold">
                                {job.margin_percent?.toFixed(1)}%
                            </Badge>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                                <div className="text-sm text-slate-600">הכנסה</div>
                                <div className="text-lg font-semibold">₪{job.revenue?.toLocaleString()}</div>
                            </div>
                            <div>
                                <div className="text-sm text-slate-600">עלות בפועל</div>
                                <div className="text-lg font-semibold">₪{job.total_actual_cost?.toLocaleString()}</div>
                            </div>
                            <div>
                                <div className="text-sm text-slate-600">רווח</div>
                                <div className="text-lg font-semibold text-red-600">
                                    ₪{job.gross_profit?.toLocaleString()}
                                </div>
                            </div>
                            <div>
                                <div className="text-sm text-slate-600">סף מינימום</div>
                                <div className="text-lg font-semibold">{job.margin_threshold}%</div>
                            </div>
                        </div>

                        <div className="mt-4 p-3 bg-white rounded-lg border border-red-200">
                            <div className="flex items-start gap-2">
                                <TrendingDown className="w-5 h-5 text-red-500 mt-0.5" />
                                <div>
                                    <div className="font-medium text-red-900">שולי רווח מתחת לסף</div>
                                    <div className="text-sm text-slate-600 mt-1">
                                        שולי הרווח ({job.margin_percent?.toFixed(1)}%) נמוכים מהסף המוגדר ({job.margin_threshold}%).
                                        יש לבדוק סטיות בעלויות חומרים ועבודה.
                                    </div>
                                </div>
                            </div>
                        </div>

                        {(job.variance_total > 0) && (
                            <div className="mt-2 p-3 bg-orange-50 rounded-lg border border-orange-200">
                                <div className="text-sm">
                                    <span className="font-medium text-orange-900">סטייה כוללת: </span>
                                    <span className="text-orange-700">₪{job.variance_total?.toLocaleString()}</span>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}