import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp } from 'lucide-react';

export default function AnalyticsOverview() {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <TrendingUp className="w-4 h-4" />
                    מדדי ביצוע
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-slate-50 rounded border border-slate-200">
                        <p className="text-sm text-slate-600 mb-1">תפוסה ממוצעת (7 ימים)</p>
                        <p className="text-2xl font-bold text-slate-900">72.3%</p>
                        <p className="text-xs text-green-600 mt-2">↓ 2.1% מהשבוע הקודם</p>
                    </div>

                    <div className="p-4 bg-slate-50 rounded border border-slate-200">
                        <p className="text-sm text-slate-600 mb-1">מהירות סיבוב (ימים)</p>
                        <p className="text-2xl font-bold text-slate-900">18.5</p>
                        <p className="text-xs text-orange-600 mt-2">↑ 1.2 ימים</p>
                    </div>

                    <div className="p-4 bg-slate-50 rounded border border-slate-200">
                        <p className="text-sm text-slate-600 mb-1">דיוק ספירה</p>
                        <p className="text-2xl font-bold text-slate-900">99.4%</p>
                        <p className="text-xs text-green-600 mt-2">✓ תוך סטנדרט</p>
                    </div>

                    <div className="p-4 bg-slate-50 rounded border border-slate-200">
                        <p className="text-sm text-slate-600 mb-1">זמן טיפול ממוצע</p>
                        <p className="text-2xl font-bold text-slate-900">4.2 שעות</p>
                        <p className="text-xs text-green-600 mt-2">↓ 0.8 שעות</p>
                    </div>
                </div>

                <div className="pt-4 border-t border-slate-200">
                    <h4 className="font-semibold text-slate-900 mb-3">אזורים בסיכון</h4>
                    <div className="space-y-2">
                        {[
                            { zone: 'אזור חומרי גלם', level: 85, status: 'קרוב לתפוסה' },
                            { zone: 'אזור מוצרים גמורים', level: 75, status: 'קיבולת טובה' },
                        ].map((item, idx) => {
                            const getCapacityColor = (percentage) => {
                                if (percentage >= 90) return 'bg-red-500';
                                if (percentage >= 75) return 'bg-orange-500';
                                if (percentage >= 50) return 'bg-yellow-500';
                                return 'bg-green-500';
                            };

                            return (
                                <div key={idx} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                                    <span className="text-sm text-slate-700">{item.zone}</span>
                                    <Badge className={getCapacityColor(item.level)}>
                                        {item.level}%
                                    </Badge>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}