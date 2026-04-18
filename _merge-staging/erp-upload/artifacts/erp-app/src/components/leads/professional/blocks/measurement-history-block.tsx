import { Ruler, Calendar, User } from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface MeasurementHistoryBlockProps {
  block: Record<string, unknown>;
  leadId: string;
  canEdit: boolean;
}

interface Measurement {
  date: string;
  measuredBy: string;
  notes: string;
  status: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function MeasurementHistoryBlock({
  block,
  leadId,
  canEdit,
}: MeasurementHistoryBlockProps) {
  const measurements: Measurement[] = [
    { date: "2026-02-05", measuredBy: "\u05D9\u05D5\u05E1\u05D9 \u05DB\u05D4\u05DF", notes: "\u05DE\u05D3\u05D9\u05D3\u05EA \u05DE\u05E2\u05E7\u05D5\u05EA - 15 \u05DE\u05D8\u05E8", status: "completed" },
    { date: "2026-02-08", measuredBy: "\u05D3\u05E0\u05D9 \u05DC\u05D5\u05D9", notes: "\u05DE\u05D3\u05D9\u05D3\u05EA \u05E9\u05E2\u05E8 \u05DB\u05E0\u05D9\u05E1\u05D4", status: "completed" },
  ];

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Ruler className="w-5 h-5 text-indigo-600" />
        <span className="font-medium text-slate-900">\u05D4\u05D9\u05E1\u05D8\u05D5\u05E8\u05D9\u05D9\u05EA \u05DE\u05D3\u05D9\u05D3\u05D5\u05EA</span>
      </div>

      <div className="space-y-3">
        {measurements.map((m, idx) => (
          <div key={idx} className="bg-slate-50 rounded-lg p-3 border border-slate-200">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Calendar className="w-4 h-4" />
                {format(new Date(m.date), "dd/MM/yyyy", { locale: he })}
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <User className="w-4 h-4" />
                {m.measuredBy}
              </div>
            </div>
            <p className="text-sm text-slate-900">{m.notes}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
