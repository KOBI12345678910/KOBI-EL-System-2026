import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock } from "lucide-react";
import AITimeline from "./ai-timeline";
import type { LeadPermissions } from "./use-lead-permissions";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface RightPanelProps {
  lead: Record<string, unknown>;
  leadId: string;
  permissions: LeadPermissions;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function RightPanel({ lead, leadId, permissions }: RightPanelProps) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-indigo-600" />
          \u05E6\u05D9\u05E8 \u05D6\u05DE\u05DF \u05D7\u05DB\u05DD
        </CardTitle>
      </CardHeader>

      <CardContent>
        <AITimeline leadId={leadId} />
      </CardContent>
    </Card>
  );
}
