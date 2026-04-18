import { Calculator, TrendingUp } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ProfitabilityCalcBlockProps {
  block: Record<string, unknown>;
  leadId: string;
  canEdit: boolean;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ProfitabilityCalcBlock({
  block,
  leadId,
  canEdit,
}: ProfitabilityCalcBlockProps) {
  const calc = {
    revenue: 45000,
    costs: 28000,
    profit: 17000,
    margin: 37.8,
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Calculator className="w-5 h-5 text-purple-600" />
        <span className="font-medium text-slate-900">\u05D7\u05D9\u05E9\u05D5\u05D1 \u05E8\u05D5\u05D5\u05D7\u05D9\u05D5\u05EA</span>
      </div>

      <div className="bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-200 rounded-lg p-4">
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <p className="text-xs text-slate-600 mb-1">\u05D4\u05DB\u05E0\u05E1\u05D4 \u05E6\u05E4\u05D5\u05D9\u05D4</p>
            <p className="text-lg font-bold text-slate-900">\u20AA{calc.revenue.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-slate-600 mb-1">\u05E2\u05DC\u05D5\u05D9\u05D5\u05EA \u05DE\u05E9\u05D5\u05E2\u05E8\u05D5\u05EA</p>
            <p className="text-lg font-bold text-red-600">\u20AA{calc.costs.toLocaleString()}</p>
          </div>
        </div>

        <div className="border-t border-purple-300 pt-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-600 mb-1">\u05E8\u05D5\u05D5\u05D7 \u05E0\u05E7\u05D9 \u05DE\u05E9\u05D5\u05E2\u05E8</p>
              <p className="text-2xl font-bold text-green-600">\u20AA{calc.profit.toLocaleString()}</p>
            </div>
            <div className="text-left">
              <p className="text-xs text-slate-600 mb-1">\u05DE\u05E8\u05D5\u05D5\u05D7</p>
              <div className="flex items-center gap-1">
                <TrendingUp className="w-5 h-5 text-green-600" />
                <p className="text-2xl font-bold text-green-600">{calc.margin}%</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
