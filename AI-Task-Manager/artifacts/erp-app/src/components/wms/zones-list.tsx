import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

export default function ZonesList({ zones }) {
    const getZoneIcon = (type) => {
        switch (type) {
            case 'raw_materials': return '🔧';
            case 'finished_goods': return '📦';
            case 'returns': return '↩️';
            case 'damaged': return '⚠️';
            default: return '📍';
        }
    };

    const getZoneColor = (type) => {
        switch (type) {
            case 'raw_materials': return 'bg-blue-50 border-blue-200';
            case 'finished_goods': return 'bg-green-50 border-green-200';
            case 'returns': return 'bg-yellow-50 border-yellow-200';
            case 'damaged': return 'bg-red-50 border-red-200';
            default: return 'bg-slate-50 border-slate-200';
        }
    };

    const getCapacityColor = (percentage) => {
        if (percentage >= 90) return 'bg-red-500';
        if (percentage >= 75) return 'bg-orange-500';
        if (percentage >= 50) return 'bg-yellow-500';
        return 'bg-green-500';
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {zones.map(zone => {
                const capacityPercent = (zone.used / zone.capacity) * 100;
                return (
                    <Card key={zone.id} className={`border ${getZoneColor(zone.type)}`}>
                        <CardContent className="p-5">
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-2xl">{getZoneIcon(zone.type)}</span>
                                        <h3 className="font-semibold text-slate-900">{zone.name}</h3>
                                    </div>
                                    <p className="text-xs text-slate-600">{zone.items} פריטים</p>
                                </div>
                                <Badge className={getCapacityColor(capacityPercent)}>
                                    {capacityPercent.toFixed(0)}%
                                </Badge>
                            </div>

                            <div className="space-y-3">
                                <div>
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-xs text-slate-600">
                                            {zone.used} / {zone.capacity}
                                        </span>
                                    </div>
                                    <Progress value={capacityPercent} className="h-2" />
                                </div>

                                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200">
                                    <div>
                                        <p className="text-xs text-slate-500">יחידות פנויות</p>
                                        <p className="text-sm font-semibold text-slate-900">
                                            {zone.capacity - zone.used}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-500">תפוסה</p>
                                        <p className="text-sm font-semibold text-slate-900">
                                            {capacityPercent.toFixed(1)}%
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
}