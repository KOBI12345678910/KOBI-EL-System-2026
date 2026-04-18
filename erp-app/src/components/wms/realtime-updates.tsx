import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Eye, AlertTriangle, Activity } from 'lucide-react';

export default function RealtimeUpdates({ updates, activeOperations }) {
    return (
        <div className="space-y-4">
            {/* Real-time Updates */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Eye className="w-4 h-4" />
                        עדכונים בזמן אמת
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                        {updates.length > 0 ? (
                            updates.map(update => (
                                <div 
                                    key={update.id} 
                                    className={`p-3 rounded-lg border flex items-start gap-3 ${
                                        update.type === 'warning' 
                                            ? 'bg-yellow-50 border-yellow-200' 
                                            : 'bg-blue-50 border-blue-200'
                                    }`}
                                >
                                    <div className="mt-1">
                                        {update.type === 'warning' ? (
                                            <AlertTriangle className="w-4 h-4 text-yellow-600" />
                                        ) : (
                                            <Activity className="w-4 h-4 text-blue-600" />
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm font-medium text-slate-900">
                                            {update.message}
                                        </p>
                                        <p className="text-xs text-slate-500 mt-1">
                                            {update.timestamp.toLocaleTimeString('he-IL')}
                                        </p>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <p className="text-sm text-slate-600 text-center py-8">אין עדכונים חדשים</p>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Active Operations */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">פעולות פעילות</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-2">
                        {activeOperations.map(op => (
                            <div key={op.id} className="p-3 bg-slate-50 rounded border border-slate-200">
                                <div className="flex justify-between items-center mb-2">
                                    <div>
                                        <p className="text-sm font-medium text-slate-900">{op.operation}</p>
                                        <p className="text-xs text-slate-500">מיקום: {op.bin}</p>
                                    </div>
                                    <Badge variant="outline">{op.progress}%</Badge>
                                </div>
                                <Progress value={op.progress} className="h-1.5" />
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}