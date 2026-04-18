import { Brain, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface AIAnalysisBlockProps {
  block: Record<string, unknown>;
  leadId: string;
  canEdit: boolean;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AIAnalysisBlock({ block, leadId, canEdit }: AIAnalysisBlockProps) {
  const analysis = {
    sentiment: { score: 0.7, label: "\u05D7\u05D9\u05D5\u05D1\u05D9", color: "bg-green-100 text-green-800" },
    risk_level: { score: 25, label: "\u05E0\u05DE\u05D5\u05DA", color: "bg-green-100 text-green-800" },
    probability: 78,
    insights: [
      "\u2713 \u05EA\u05E7\u05E9\u05D5\u05E8\u05EA \u05E4\u05E2\u05D9\u05DC\u05D4 \u05D5\u05E2\u05E7\u05D1\u05D9\u05EA",
      "\u26A0\uFE0F \u05DC\u05D0 \u05E0\u05E9\u05DC\u05D7\u05D4 \u05D4\u05E6\u05E2\u05EA \u05DE\u05D7\u05D9\u05E8 \u05EA\u05D5\u05DA 48 \u05E9\u05E2\u05D5\u05EA",
      "\u2713 \u05EA\u05D0\u05E8\u05D9\u05DA \u05E1\u05D2\u05D9\u05E8\u05D4 \u05E6\u05E4\u05D5\u05D9 \u05EA\u05E7\u05D9\u05DF",
    ],
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Brain className="w-5 h-5 text-indigo-600" />
        <span className="font-medium text-slate-900">\u05E0\u05D9\u05EA\u05D5\u05D7 AI</span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-50 rounded-lg p-3 text-center border border-slate-200">
          <p className="text-xs text-slate-600 mb-1">\u05E1\u05E0\u05D8\u05D9\u05DE\u05E0\u05D8</p>
          <Badge className={analysis.sentiment.color}>{analysis.sentiment.label}</Badge>
          <p className="text-lg font-bold text-slate-900 mt-1">
            {(analysis.sentiment.score * 100).toFixed(0)}%
          </p>
        </div>

        <div className="bg-slate-50 rounded-lg p-3 text-center border border-slate-200">
          <p className="text-xs text-slate-600 mb-1">\u05E8\u05DE\u05EA \u05E1\u05D9\u05DB\u05D5\u05DF</p>
          <Badge className={analysis.risk_level.color}>{analysis.risk_level.label}</Badge>
          <p className="text-lg font-bold text-slate-900 mt-1">{analysis.risk_level.score}%</p>
        </div>

        <div className="bg-slate-50 rounded-lg p-3 text-center border border-slate-200">
          <p className="text-xs text-slate-600 mb-1">\u05E1\u05D1\u05D9\u05E8\u05D5\u05EA \u05E1\u05D2\u05D9\u05E8\u05D4</p>
          <TrendingUp className="w-5 h-5 text-green-600 mx-auto mb-1" />
          <p className="text-lg font-bold text-slate-900">{analysis.probability}%</p>
        </div>
      </div>

      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
        <p className="text-sm font-medium text-indigo-900 mb-2">\u05EA\u05D5\u05D1\u05E0\u05D5\u05EA AI:</p>
        <ul className="space-y-1 text-sm text-indigo-800">
          {analysis.insights.map((insight, idx) => (
            <li key={idx}>{insight}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
