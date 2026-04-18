import { Users } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CompetitorsLogBlockProps {
  block: Record<string, unknown>;
  leadId: string;
  canEdit: boolean;
}

interface Competitor {
  name: string;
  offer: string;
  notes: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function CompetitorsLogBlock({ block, leadId, canEdit }: CompetitorsLogBlockProps) {
  const competitors: Competitor[] = [
    { name: '\u05DE\u05EA\u05DB\u05D5\u05EA \u05D1\u05E8\u05E7 \u05D1\u05E2"\u05DE', offer: "\u20AA42,000", notes: "\u05D6\u05DE\u05DF \u05D0\u05E1\u05E4\u05E7\u05D4 \u05D0\u05E8\u05D5\u05DA" },
    { name: "\u05D1\u05E8\u05D6\u05DC \u05D5\u05D0\u05DC\u05D5\u05DE\u05D9\u05E0\u05D9\u05D5\u05DD \u05D7\u05D9\u05E4\u05D4", offer: "\u20AA38,500", notes: "\u05D0\u05D9\u05DB\u05D5\u05EA \u05E0\u05DE\u05D5\u05DB\u05D4 \u05D9\u05D5\u05EA\u05E8" },
  ];

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Users className="w-5 h-5 text-red-600" />
        <span className="font-medium text-slate-900">\u05E8\u05D9\u05E9\u05D5\u05DD \u05DE\u05EA\u05D7\u05E8\u05D9\u05DD</span>
      </div>

      <div className="space-y-3">
        {competitors.map((comp, idx) => (
          <div key={idx} className="bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="flex items-start justify-between mb-1">
              <p className="font-medium text-sm text-slate-900">{comp.name}</p>
              <p className="text-sm font-bold text-red-700">{comp.offer}</p>
            </div>
            <p className="text-xs text-slate-600">{comp.notes}</p>
          </div>
        ))}
        {competitors.length === 0 && (
          <p className="text-sm text-slate-500 text-center py-4">\u05DC\u05D0 \u05E0\u05E8\u05E9\u05DE\u05D5 \u05DE\u05EA\u05D7\u05E8\u05D9\u05DD</p>
        )}
      </div>
    </div>
  );
}
