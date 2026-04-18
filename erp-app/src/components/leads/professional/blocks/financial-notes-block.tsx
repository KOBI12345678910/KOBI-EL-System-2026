import { DollarSign, AlertCircle } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface FinancialNotesBlockProps {
  block: Record<string, unknown>;
  leadId: string;
  canEdit: boolean;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function FinancialNotesBlock({ block, leadId, canEdit }: FinancialNotesBlockProps) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <DollarSign className="w-5 h-5 text-green-600" />
        <span className="font-medium text-slate-900">\u05D4\u05E2\u05E8\u05D5\u05EA \u05DB\u05E1\u05E4\u05D9\u05D5\u05EA</span>
        <AlertCircle className="w-4 h-4 text-orange-500" title="\u05E9\u05D3\u05D4 \u05E8\u05D2\u05D9\u05E9 - \u05DE\u05E0\u05D4\u05DC\u05D9\u05DD \u05D1\u05DC\u05D1\u05D3" />
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
        <p className="text-xs text-amber-800">
          \u26A0\uFE0F \u05E9\u05D3\u05D4 \u05D6\u05D4 \u05D2\u05DC\u05D5\u05D9 \u05E8\u05E7 \u05DC\u05DE\u05E0\u05D4\u05DC\u05D9\u05DD \u05D5\u05DE\u05DB\u05D9\u05DC \u05DE\u05D9\u05D3\u05E2 \u05E8\u05D2\u05D9\u05E9 \u05DB\u05D2\u05D5\u05DF \u05DE\u05E8\u05D5\u05D5\u05D7\u05D9\u05DD, \u05D4\u05E0\u05D7\u05D5\u05EA \u05D5\u05EA\u05E0\u05D0\u05D9\u05DD \u05DE\u05D9\u05D5\u05D7\u05D3\u05D9\u05DD
        </p>
      </div>

      <Textarea
        defaultValue={"\u05DE\u05E8\u05D5\u05D5\u05D7: 35%\n\u05D4\u05E0\u05D7\u05D4 \u05DE\u05E7\u05E1\u05D9\u05DE\u05DC\u05D9\u05EA: 10%\n\u05EA\u05E0\u05D0\u05D9 \u05EA\u05E9\u05DC\u05D5\u05DD: 30+60 \u05D9\u05D5\u05DD"}
        rows={4}
        disabled={!canEdit}
        className="font-mono text-sm"
      />
    </div>
  );
}
