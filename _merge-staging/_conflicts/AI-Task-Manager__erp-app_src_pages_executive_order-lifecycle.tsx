import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import {
  Users, FileText, ShoppingCart, Layers, Truck, Factory, CheckCircle,
  Receipt, CreditCard, ArrowLeft, RefreshCw, Activity, ChevronDown, ChevronUp,
  Clock
} from "lucide-react";

interface Stage {
  id: string;
  name: string;
  icon: string;
  color: string;
  total: number;
  byStatus: Record<string, { count: number; total?: number }>;
}

const iconMap: Record<string, any> = {
  Users, FileText, ShoppingCart, Layers, Truck, Factory, CheckCircle, Receipt, CreditCard
};

const colorMap: Record<string, string> = {
  blue: "from-blue-500 to-blue-600",
  purple: "from-purple-500 to-purple-600",
  indigo: "from-indigo-500 to-indigo-600",
  cyan: "from-cyan-500 to-cyan-600",
  orange: "from-orange-500 to-orange-600",
  amber: "from-amber-500 to-amber-600",
  green: "from-green-500 to-green-600",
  emerald: "from-emerald-500 to-emerald-600",
  teal: "from-teal-500 to-teal-600",
};

const borderColorMap: Record<string, string> = {
  blue: "border-blue-500/40",
  purple: "border-purple-500/40",
  indigo: "border-indigo-500/40",
  cyan: "border-cyan-500/40",
  orange: "border-orange-500/40",
  amber: "border-amber-500/40",
  green: "border-green-500/40",
  emerald: "border-emerald-500/40",
  teal: "border-teal-500/40",
};

const textColorMap: Record<string, string> = {
  blue: "text-blue-400",
  purple: "text-purple-400",
  indigo: "text-indigo-400",
  cyan: "text-cyan-400",
  orange: "text-orange-400",
  amber: "text-amber-400",
  green: "text-green-400",
  emerald: "text-emerald-400",
  teal: "text-teal-400",
};

function formatCurrency(v: number) {
  if (!v) return "—";
  if (Math.abs(v) >= 1000000) return `₪${(v / 1000000).toFixed(1)}M`;
  if (Math.abs(v) >= 1000) return `₪${(v / 1000).toFixed(0)}K`;
  return `₪${v.toLocaleString()}`;
}

export default function OrderLifecyclePage() {
  const queryClient = useQueryClient();
  const [expandedStage, setExpandedStage] = useState<string | null>(null);

  const { data, isLoading: loading } = useQuery<{ stages: Stage[]; timestamp: string } | null>({
    queryKey: ["order-lifecycle"],
    queryFn: async () => {
      const res = await authFetch(`${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/executive/order-lifecycle`);
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 60_000,
  });

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]" dir="rtl">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-muted-foreground">טוען מחזור הזמנות...</p>
        </div>
      </div>
    );
  }

  if (!data) return <div className="text-center text-muted-foreground py-20" dir="rtl">שגיאה בטעינת נתונים</div>;

  const maxTotal = Math.max(...data.stages.map(s => s.total), 1);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl">
            <Activity className="w-6 h-6 text-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">מחזור חיי הזמנה — End-to-End</h1>
            <p className="text-muted-foreground text-sm">ליד → הצעת מחיר → הזמנה → BOM → רכש → ייצור → QC → חשבונית → תשלום</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {data.timestamp ? new Date(data.timestamp).toLocaleTimeString("he-IL") : ""}
          </span>
          <button onClick={() => queryClient.invalidateQueries({ queryKey: ["order-lifecycle"] })} className="p-2 bg-slate-800 rounded-lg hover:bg-slate-700 text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <div className="relative">
        <div className="hidden lg:block absolute top-1/2 left-[5%] right-[5%] h-1 bg-gradient-to-l from-teal-500/30 via-indigo-500/30 to-blue-500/30 rounded-full transform -translate-y-1/2 z-0" />

        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-9 gap-3 relative z-10">
          {data.stages.map((stage, idx) => {
            const Icon = iconMap[stage.icon] || Activity;
            const isExpanded = expandedStage === stage.id;
            const barHeight = stage.total > 0 ? Math.max(20, (stage.total / maxTotal) * 100) : 10;

            return (
              <div key={stage.id} className="flex flex-col items-center">
                <button
                  onClick={() => setExpandedStage(isExpanded ? null : stage.id)}
                  className={`w-full bg-slate-800/80 rounded-xl border ${borderColorMap[stage.color] || "border-slate-700/40"} p-4 hover:bg-slate-700/60 transition-all cursor-pointer`}
                >
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${colorMap[stage.color]} flex items-center justify-center mx-auto mb-2`}>
                    <Icon className="w-5 h-5 text-foreground" />
                  </div>
                  <p className="text-sm font-medium text-foreground text-center">{stage.name}</p>
                  <p className={`text-2xl font-bold text-center mt-1 ${textColorMap[stage.color] || "text-foreground"}`}>
                    {stage.total}
                  </p>

                  <div className="mt-2 mx-auto w-8 bg-slate-700 rounded-full overflow-hidden" style={{ height: `${barHeight}px` }}>
                    <div className={`w-full bg-gradient-to-t ${colorMap[stage.color]} rounded-full`} style={{ height: "100%" }} />
                  </div>

                  <div className="flex justify-center mt-2">
                    {isExpanded ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
                  </div>
                </button>

                {isExpanded && Object.keys(stage.byStatus).length > 0 && (
                  <div className="w-full mt-2 bg-slate-900/80 rounded-lg border border-slate-700/40 p-3 space-y-1.5">
                    {Object.entries(stage.byStatus).map(([status, info]) => (
                      <div key={status} className="flex items-center justify-between text-xs">
                        <span className="text-slate-300 capitalize">{status.replace(/_/g, " ")}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-foreground font-medium">{info.count}</span>
                          {info.total !== undefined && info.total > 0 && (
                            <span className="text-muted-foreground">{formatCurrency(info.total)}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {idx < data.stages.length - 1 && (
                  <div className="lg:hidden flex justify-center my-2">
                    <ArrowLeft className="w-4 h-4 text-muted-foreground transform rotate-90" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-800/60 rounded-xl border border-slate-700/40 p-4">
          <h3 className="text-sm font-medium text-slate-300 mb-3">סיכום צינור</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">סה"כ לידים</span>
              <span className="text-sm font-bold text-blue-400">{data.stages[0]?.total || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">הזמנות</span>
              <span className="text-sm font-bold text-indigo-400">{data.stages[2]?.total || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">בייצור</span>
              <span className="text-sm font-bold text-amber-400">{data.stages[5]?.total || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">חשבוניות</span>
              <span className="text-sm font-bold text-emerald-400">{data.stages[7]?.total || 0}</span>
            </div>
          </div>
        </div>
        <div className="bg-slate-800/60 rounded-xl border border-slate-700/40 p-4">
          <h3 className="text-sm font-medium text-slate-300 mb-3">שיעורי המרה</h3>
          <div className="space-y-2">
            {(() => {
              const s = data.stages;
              const rates = [
                { from: "ליד → הצעה", rate: s[0]?.total > 0 ? Math.round((s[1]?.total / s[0].total) * 100) : 0 },
                { from: "הצעה → הזמנה", rate: s[1]?.total > 0 ? Math.round((s[2]?.total / s[1].total) * 100) : 0 },
                { from: "הזמנה → ייצור", rate: s[2]?.total > 0 ? Math.round((s[5]?.total / s[2].total) * 100) : 0 },
                { from: "ייצור → חשבונית", rate: s[5]?.total > 0 ? Math.round((s[7]?.total / s[5].total) * 100) : 0 },
              ];
              return rates.map((r, i) => (
                <div key={i} className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">{r.from}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min(r.rate, 100)}%` }} />
                    </div>
                    <span className="text-xs font-bold text-foreground w-8 text-left">{r.rate}%</span>
                  </div>
                </div>
              ));
            })()}
          </div>
        </div>
        <div className="bg-slate-800/60 rounded-xl border border-slate-700/40 p-4">
          <h3 className="text-sm font-medium text-slate-300 mb-3">צווארי בקבוק</h3>
          <div className="space-y-2">
            {(() => {
              const sorted = [...data.stages].sort((a, b) => b.total - a.total);
              return sorted.slice(0, 4).map((stage, i) => {
                const Icon = iconMap[stage.icon] || Activity;
                return (
                  <div key={i} className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${textColorMap[stage.color]}`} />
                    <span className="text-xs text-slate-300 flex-1">{stage.name}</span>
                    <span className={`text-sm font-bold ${textColorMap[stage.color]}`}>{stage.total}</span>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      </div>

      <RelatedRecords tabs={[
        { key: "orders", label: "הזמנות מכירה", endpoint: "/api/sales/orders?limit=10", columns: [{ key: "order_number", label: "מספר" }, { key: "status", label: "סטטוס" }] },
        { key: "work-orders", label: "הוראות עבודה", endpoint: "/api/work-orders?limit=10", columns: [{ key: "id", label: "מזהה" }, { key: "status", label: "סטטוס" }] },
      ]} />

      <ActivityLog entityType="order-lifecycle" compact />
    </div>
  );
}
