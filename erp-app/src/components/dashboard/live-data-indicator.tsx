import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Activity, RefreshCw } from "lucide-react";

export default function LiveDataIndicator() {
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [updateCount, setUpdateCount] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setLastUpdate(new Date());
      setUpdateCount((prev) => prev + 1);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const getTimeSinceUpdate = () => {
    const diff = Math.floor((Date.now() - lastUpdate.getTime()) / 1000);
    if (diff < 2) return "עכשיו";
    if (diff < 60) return `${diff}s`;
    return "עודכן";
  };

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border border-green-200">
      <div className="flex items-center gap-2">
        <Activity className="w-5 h-5 text-green-600 animate-pulse" />
        <Badge className="bg-green-600 text-white animate-pulse">LIVE</Badge>
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium text-slate-900">נתונים בזמן אמת</p>
        <p className="text-xs text-slate-500">עדכן אחרון: {getTimeSinceUpdate()} • עדכונים: {updateCount}</p>
      </div>
      <div className="flex items-center gap-1 text-xs text-slate-500">
        <RefreshCw className="w-4 h-4" />
        כל 5 שניות
      </div>
    </div>
  );
}
