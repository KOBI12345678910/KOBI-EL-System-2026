import { TrendingUp, TrendingDown, DollarSign, Calendar, Target, LucideIcon } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface KPIBlockProps {
  block: Record<string, unknown>;
  leadId: string;
  canEdit: boolean;
}

interface KPI {
  label: string;
  value: string;
  trend: number;
  icon: LucideIcon;
  color: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function KPIBlock({ block, leadId, canEdit }: KPIBlockProps) {
  const kpis: KPI[] = [
    { label: '\u05E1\u05D4"\u05DB \u05E2\u05E8\u05DA \u05E2\u05E1\u05E7\u05D4', value: "\u20AA45,000", trend: 12, icon: DollarSign, color: "text-green-600" },
    { label: "\u05D9\u05DE\u05D9\u05DD \u05D1\u05EA\u05D4\u05DC\u05D9\u05DA", value: "23", trend: -5, icon: Calendar, color: "text-blue-600" },
    { label: "\u05D4\u05E1\u05EA\u05D1\u05E8\u05D5\u05EA \u05DC\u05E1\u05D2\u05D9\u05E8\u05D4", value: "75%", trend: 8, icon: Target, color: "text-purple-600" },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {kpis.map((kpi, idx) => {
        const Icon = kpi.icon;
        return (
          <div key={idx} className="bg-slate-50 rounded-lg p-4 border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <Icon className={`w-5 h-5 ${kpi.color}`} />
              {kpi.trend !== 0 && (
                <div
                  className={`flex items-center gap-1 text-xs ${
                    kpi.trend > 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {kpi.trend > 0 ? (
                    <TrendingUp className="w-3 h-3" />
                  ) : (
                    <TrendingDown className="w-3 h-3" />
                  )}
                  {Math.abs(kpi.trend)}%
                </div>
              )}
            </div>
            <p className="text-2xl font-bold text-slate-900">{kpi.value}</p>
            <p className="text-xs text-slate-600 mt-1">{kpi.label}</p>
          </div>
        );
      })}
    </div>
  );
}
