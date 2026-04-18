import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

export default function CapacityBar({ warehouse }) {
    const capacityPercent = ((warehouse.used / warehouse.capacity) * 100);

    const getCapacityColor = (percentage) => {
        if (percentage >= 90) return 'bg-red-500';
        if (percentage >= 75) return 'bg-orange-500';
        if (percentage >= 50) return 'bg-yellow-500';
        return 'bg-green-500';
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">קיבולת כוללת</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <div>
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium text-slate-700">
                            {warehouse.used} / {warehouse.capacity} יחידות
                        </span>
                        <Badge className={`${getCapacityColor(capacityPercent)}`}>
                            {capacityPercent.toFixed(1)}%
                        </Badge>
                    </div>
                    <Progress 
                        value={capacityPercent} 
                        className="h-3"
                    />
                </div>
                <p className="text-xs text-slate-600 mt-3">
                    יחידות פנויות: {warehouse.capacity - warehouse.used}
                </p>
            </CardContent>
        </Card>
    );
}