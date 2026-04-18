import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Plus, Trash2, GitBranch } from 'lucide-react';

export default function AlertConditionBuilder({ conditions, logic, onChange }) {
    const metrics = [
        { value: 'revenue', label: 'הכנסות', type: 'number' },
        { value: 'leads_count', label: 'מספר לידים', type: 'number' },
        { value: 'conversion_rate', label: 'שיעור המרה', type: 'percentage' },
        { value: 'overdue_invoices', label: 'חשבוניות באיחור', type: 'number' },
        { value: 'hot_leads', label: 'לידים חמים', type: 'number' },
        { value: 'production_delays', label: 'איחורי ייצור', type: 'number' },
        { value: 'avg_order_value', label: 'ערך הזמנה ממוצע', type: 'currency' },
        { value: 'task_completion_rate', label: 'שיעור השלמת משימות', type: 'percentage' },
        { value: 'inventory_level', label: 'רמת מלאי', type: 'number' },
        { value: 'customer_satisfaction', label: 'שביעות רצון לקוחות', type: 'percentage' }
    ];

    const operators = [
        { value: 'equals', label: 'שווה ל' },
        { value: 'not_equals', label: 'לא שווה ל' },
        { value: 'greater_than', label: 'גדול מ' },
        { value: 'less_than', label: 'קטן מ' },
        { value: 'greater_or_equal', label: 'גדול או שווה' },
        { value: 'less_or_equal', label: 'קטן או שווה' },
        { value: 'increases_by', label: 'עולה ב (%)' },
        { value: 'decreases_by', label: 'יורד ב (%)' },
        { value: 'changes_by', label: 'משתנה ב (%)' }
    ];

    const timeframes = [
        { value: '1h', label: 'שעה אחרונה' },
        { value: '24h', label: '24 שעות אחרונות' },
        { value: '7d', label: '7 ימים אחרונים' },
        { value: '30d', label: '30 ימים אחרונים' }
    ];

    const addCondition = () => {
        onChange([...conditions, { metric: '', operator: '', value: '', timeframe: '24h' }], logic);
    };

    const removeCondition = (index) => {
        onChange(conditions.filter((_, i) => i !== index), logic);
    };

    const updateCondition = (index, field, value) => {
        const newConditions = [...conditions];
        newConditions[index] = { ...newConditions[index], [field]: value };
        onChange(newConditions, logic);
    };

    return (
        <Card className="p-4 bg-slate-50 border-2 border-slate-200">
            <div className="flex items-center justify-between mb-4">
                <Label className="text-lg font-semibold flex items-center gap-2">
                    <GitBranch className="w-5 h-5" />
                    תנאי ההתראה
                </Label>
                {conditions.length > 1 && (
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-600">לוגיקה:</span>
                        <Button
                            size="sm"
                            variant={logic === 'AND' ? 'default' : 'outline'}
                            onClick={() => onChange(conditions, 'AND')}
                        >
                            AND
                        </Button>
                        <Button
                            size="sm"
                            variant={logic === 'OR' ? 'default' : 'outline'}
                            onClick={() => onChange(conditions, 'OR')}
                        >
                            OR
                        </Button>
                    </div>
                )}
            </div>

            <div className="space-y-3">
                {conditions.map((condition, index) => (
                    <div key={index} className="p-4 bg-white rounded-lg border border-slate-200">
                        <div className="flex items-center gap-2 mb-3">
                            {index > 0 && (
                                <div className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-xs font-semibold">
                                    {logic}
                                </div>
                            )}
                            <div className="flex-1 text-sm font-medium text-slate-700">
                                תנאי {index + 1}
                            </div>
                            {conditions.length > 1 && (
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => removeCondition(index)}
                                    className="text-red-600"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            )}
                        </div>

                        <div className="grid grid-cols-4 gap-3">
                            <div>
                                <Label className="text-xs mb-1">מדד</Label>
                                <Select
                                    value={condition.metric}
                                    onValueChange={(value) => updateCondition(index, 'metric', value)}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="בחר מדד" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {metrics.map(metric => (
                                            <SelectItem key={metric.value} value={metric.value}>
                                                {metric.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div>
                                <Label className="text-xs mb-1">אופרטור</Label>
                                <Select
                                    value={condition.operator}
                                    onValueChange={(value) => updateCondition(index, 'operator', value)}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="בחר אופרטור" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {operators.map(op => (
                                            <SelectItem key={op.value} value={op.value}>
                                                {op.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div>
                                <Label className="text-xs mb-1">ערך</Label>
                                <Input
                                    type="number"
                                    value={condition.value}
                                    onChange={(e) => updateCondition(index, 'value', e.target.value)}
                                    placeholder="0"
                                />
                            </div>

                            <div>
                                <Label className="text-xs mb-1">טווח זמן</Label>
                                <Select
                                    value={condition.timeframe}
                                    onValueChange={(value) => updateCondition(index, 'timeframe', value)}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {timeframes.map(tf => (
                                            <SelectItem key={tf.value} value={tf.value}>
                                                {tf.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <Button
                variant="outline"
                onClick={addCondition}
                className="w-full mt-3 border-dashed"
            >
                <Plus className="w-4 h-4 ml-2" />
                הוסף תנאי
            </Button>
        </Card>
    );
}