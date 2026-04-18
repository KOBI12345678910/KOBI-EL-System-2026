import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Package, Layers, Droplets, Thermometer } from 'lucide-react';

export default function WarehouseStats({ warehouse }) {
    const getCapacityColor = (percentage) => {
        if (percentage >= 90) return 'bg-red-500';
        if (percentage >= 75) return 'bg-orange-500';
        if (percentage >= 50) return 'bg-yellow-500';
        return 'bg-green-500';
    };

    const capacityPercent = ((warehouse.used / warehouse.capacity) * 100);

    return (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
                <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-slate-600">תפוסה כוללת</p>
                            <p className="text-2xl font-bold text-slate-900 mt-1">
                                {capacityPercent.toFixed(1)}%
                            </p>
                        </div>
                        <div className={`p-3 rounded-lg ${getCapacityColor(capacityPercent)}`}>
                            <Package className="w-6 h-6 text-white" />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-slate-600">יחידות במלאי</p>
                            <p className="text-2xl font-bold text-slate-900 mt-1">
                                {warehouse.zones.reduce((sum, z) => sum + z.items, 0)}
                            </p>
                        </div>
                        <div className="p-3 rounded-lg bg-blue-500">
                            <Layers className="w-6 h-6 text-white" />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-slate-600">תנועות פעילות</p>
                            <p className="text-2xl font-bold text-slate-900 mt-1">
                                {warehouse.activeMovements}
                            </p>
                        </div>
                        <div className="p-3 rounded-lg bg-purple-500">
                            <Activity className="w-6 h-6 text-white animate-pulse" />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-slate-600">תנאים סביבתיים</p>
                            <div className="flex gap-3 mt-2">
                                <div className="flex items-center gap-1">
                                    <Thermometer className="w-3 h-3 text-red-500" />
                                    <span className="text-sm font-semibold">{warehouse.temperature}°C</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Droplets className="w-3 h-3 text-blue-500" />
                                    <span className="text-sm font-semibold">{warehouse.humidity}%</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}