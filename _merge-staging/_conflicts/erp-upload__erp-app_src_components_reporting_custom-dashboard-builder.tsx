import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Plus, Save, BarChart3, PieChart, LineChart, Target, Grid3x3, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { entityCreate, entityList } from "@/lib/entity-api";

export default function CustomDashboardBuilder() {
    const [dashboardName, setDashboardName] = useState('');
    const [selectedWidgets, setSelectedWidgets] = useState([]);
    const queryClient = useQueryClient();

    const { data: dashboards = [] } = useQuery({
        queryKey: ['custom-dashboards'],
        queryFn: () => entityList<any>("dashboards")
    });

    const createDashboardMutation = useMutation({
        mutationFn: async (data) => entityCreate<any>("dashboards", data),
        onSuccess: () => {
            queryClient.invalidateQueries(['custom-dashboards']);
            toast.success('דשבורד נוצר בהצלחה');
            setDashboardName('');
            setSelectedWidgets([]);
        }
    });

    const availableWidgets = [
        { id: 'leads_funnel', name: 'משפך לידים', icon: Target, category: 'CRM', type: 'chart' },
        { id: 'revenue_trend', name: 'מגמת הכנסות', icon: BarChart3, category: 'Finance', type: 'chart' },
        { id: 'sales_pipeline', name: 'צנרת מכירות', icon: PieChart, category: 'Sales', type: 'chart' },
        { id: 'production_status', name: 'סטטוס ייצור', icon: BarChart3, category: 'Production', type: 'chart' },
        { id: 'task_completion', name: 'השלמת משימות', icon: LineChart, category: 'Tasks', type: 'chart' },
        { id: 'team_performance', name: 'ביצועי צוות', icon: BarChart3, category: 'HR', type: 'metric' },
        { id: 'inventory_levels', name: 'רמות מלאי', icon: Grid3x3, category: 'Inventory', type: 'table' },
        { id: 'financial_summary', name: 'סיכום כספי', icon: Target, category: 'Finance', type: 'metric' }
    ];

    const toggleWidget = (widgetId) => {
        setSelectedWidgets(prev => {
            if (prev.includes(widgetId)) {
                // Remove widget
                return prev.filter(id => id !== widgetId);
            } else {
                // Add widget - maintain order by adding to end
                return [...prev, widgetId];
            }
        });
    };

    const moveWidget = (widgetId, direction) => {
        const currentIndex = selectedWidgets.indexOf(widgetId);
        if (currentIndex === -1) return;
        
        const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
        if (newIndex < 0 || newIndex >= selectedWidgets.length) return;
        
        const newOrder = [...selectedWidgets];
        [newOrder[currentIndex], newOrder[newIndex]] = [newOrder[newIndex], newOrder[currentIndex]];
        setSelectedWidgets(newOrder);
    };

    const saveDashboard = () => {
        if (!dashboardName.trim()) {
            toast.error('הזן שם לדשבורד');
            return;
        }

        createDashboardMutation.mutate({
            name: dashboardName,
            widgets: selectedWidgets,
            layout: 'grid',
            is_active: true
        });
    };

    return (
        <div className="space-y-6">
            {/* Builder Dialog */}
            <Dialog>
                <DialogTrigger asChild>
                    <Button className="bg-gradient-to-r from-indigo-600 to-purple-600">
                        <Plus className="w-4 h-4 ml-2" />
                        צור דשבורד מותאם
                    </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-2xl flex items-center gap-2">
                            <Grid3x3 className="w-6 h-6 text-indigo-600" />
                            בונה דשבורד מותאם אישית
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-6 p-6">
                        <div>
                            <label className="text-sm font-medium text-slate-700 mb-2 block">שם הדשבורד</label>
                            <Input
                                value={dashboardName}
                                onChange={(e) => setDashboardName(e.target.value)}
                                placeholder="למשל: דשבורד מכירות יומי"
                                className="text-lg"
                            />
                        </div>

                        <div>
                            <h3 className="text-lg font-semibold text-slate-900 mb-4">בחר ווידג'טים</h3>
                            <div className="grid grid-cols-2 gap-4">
                                {availableWidgets.map(widget => {
                                    const Icon = widget.icon;
                                    return (
                                        <div
                                            key={widget.id}
                                            onClick={() => toggleWidget(widget.id)}
                                            className={`p-4 border-2 rounded-xl cursor-pointer transition-all ${
                                                selectedWidgets.includes(widget.id)
                                                    ? 'border-indigo-500 bg-indigo-50'
                                                    : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
                                            }`}
                                        >
                                            <div className="flex items-start gap-3">
                                                <Checkbox
                                                    checked={selectedWidgets.includes(widget.id)}
                                                    className="mt-1"
                                                />
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <Icon className="w-5 h-5 text-indigo-600" />
                                                        <h4 className="font-semibold text-slate-900">{widget.name}</h4>
                                                    </div>
                                                    <div className="flex gap-2 items-center flex-wrap">
                                                        <Badge variant="outline" className="text-xs">
                                                            {widget.category}
                                                        </Badge>
                                                        <Badge variant="outline" className="text-xs">
                                                            {widget.type}
                                                        </Badge>
                                                        {selectedWidgets.includes(widget.id) && (
                                                            <>
                                                                <Badge className="bg-indigo-600 text-white text-xs">
                                                                    #{selectedWidgets.indexOf(widget.id) + 1}
                                                                </Badge>
                                                                <div className="flex gap-1">
                                                                    <Button
                                                                        size="sm"
                                                                        variant="ghost"
                                                                        className="h-5 w-5 p-0"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            moveWidget(widget.id, 'up');
                                                                        }}
                                                                        disabled={selectedWidgets.indexOf(widget.id) === 0}
                                                                    >
                                                                        <ChevronUp className="w-3 h-3" />
                                                                    </Button>
                                                                    <Button
                                                                        size="sm"
                                                                        variant="ghost"
                                                                        className="h-5 w-5 p-0"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            moveWidget(widget.id, 'down');
                                                                        }}
                                                                        disabled={selectedWidgets.indexOf(widget.id) === selectedWidgets.length - 1}
                                                                    >
                                                                        <ChevronDown className="w-3 h-3" />
                                                                    </Button>
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="flex justify-between items-center pt-4 border-t">
                            <p className="text-sm text-slate-600">נבחרו {selectedWidgets.length} ווידג'טים</p>
                            <Button onClick={saveDashboard} className="bg-indigo-600" disabled={!dashboardName.trim() || selectedWidgets.length === 0}>
                                <Save className="w-4 h-4 ml-2" />
                                שמור דשבורד
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Saved Dashboards List */}
            <Card className="border-0 shadow-lg">
                <CardHeader>
                    <CardTitle>הדשבורדים שלי</CardTitle>
                </CardHeader>
                <CardContent>
                    {dashboards.length === 0 ? (
                        <div className="text-center py-8 text-slate-400">
                            <Grid3x3 className="w-12 h-12 mx-auto mb-2 opacity-30" />
                            <p className="text-sm">עדיין לא יצרת דשבורדים מותאמים</p>
                        </div>
                    ) : (
                        <div className="grid gap-3">
                            {dashboards.map(dashboard => (
                                <div key={dashboard.id} className="p-4 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between">
                                    <div>
                                        <h4 className="font-semibold text-slate-900">{dashboard.name}</h4>
                                        <p className="text-xs text-slate-600 mt-1">
                                            {dashboard.widgets?.length || 0} ווידג'טים
                                        </p>
                                        {dashboard.widgets && dashboard.widgets.length > 0 && (
                                            <div className="flex gap-1 mt-2 flex-wrap">
                                                {dashboard.widgets.slice(0, 3).map((widgetId, idx) => {
                                                    const widget = availableWidgets.find(w => w.id === widgetId);
                                                    return widget ? (
                                                        <Badge key={idx} variant="outline" className="text-xs">
                                                            {widget.name}
                                                        </Badge>
                                                    ) : null;
                                                })}
                                                {dashboard.widgets.length > 3 && (
                                                    <Badge variant="outline" className="text-xs">
                                                        +{dashboard.widgets.length - 3}
                                                    </Badge>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex gap-2">
                                        <Button size="sm" variant="outline">
                                            צפה
                                        </Button>
                                        <Button size="sm" variant="ghost" className="text-red-600">
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}