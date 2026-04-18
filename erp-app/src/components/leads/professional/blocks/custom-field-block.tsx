import { Settings } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CustomFieldBlockProps {
  block: Record<string, unknown>;
  leadId: string;
  canEdit: boolean;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function CustomFieldBlock({ block, leadId, canEdit }: CustomFieldBlockProps) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Settings className="w-5 h-5 text-indigo-600" />
        <span className="font-medium text-slate-900">\u05E9\u05D3\u05D5\u05EA \u05DE\u05D5\u05EA\u05D0\u05DE\u05D9\u05DD \u05D0\u05D9\u05E9\u05D9\u05EA</span>
      </div>

      <div className="space-y-3">
        <div>
          <Label className="text-xs text-slate-600">\u05DE\u05E1\u05E4\u05E8 \u05D4\u05D6\u05DE\u05E0\u05D4 \u05E4\u05E0\u05D9\u05DE\u05D9</Label>
          <Input defaultValue="PO-2026-0145" disabled={!canEdit} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs text-slate-600">\u05DE\u05E1\u05E4\u05E8 \u05DC\u05E7\u05D5\u05D7 \u05D1\u05DE\u05E2\u05E8\u05DB\u05EA \u05D4\u05D9\u05E9\u05E0\u05D4</Label>
          <Input defaultValue="CUS-98765" disabled={!canEdit} className="mt-1" />
        </div>
      </div>
    </div>
  );
}
