/**
 * Quarantine Browser — records that failed validation, with issues and
 * release/discard controls.
 */

import { useQuarantineRecords } from "@/hooks/useDataPlatform";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { authFetch } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, CheckCircle2, XCircle, Trash2, RotateCcw, FileWarning, Shield
} from "lucide-react";

const SEVERITY_COLORS: Record<string, string> = {
  info: "border-blue-500/30 text-blue-300",
  warning: "border-yellow-500/30 text-yellow-300",
  high: "border-orange-500/30 text-orange-300",
  critical: "border-red-500/30 text-red-300",
};

export default function QuarantineBrowser() {
  const { data } = useQuarantineRecords(200);
  const records = data?.records ?? [];
  const count = data?.count ?? 0;
  const byStatus = data?.byStatus ?? {};
  const qc = useQueryClient();

  const release = async (recordId: string) => {
    await authFetch(`/api/platform/quarantine/${recordId}/release`, { method: "POST" });
    qc.invalidateQueries({ queryKey: ["platform", "quarantine"] });
  };
  const discard = async (recordId: string) => {
    await authFetch(`/api/platform/quarantine/${recordId}/discard`, { method: "POST" });
    qc.invalidateQueries({ queryKey: ["platform", "quarantine"] });
  };

  return (
    <div dir="rtl" className="min-h-screen bg-[#0a0e1a] text-white p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
          <FileWarning className="w-7 h-7 text-yellow-400" />
          Quarantine Browser
        </h1>
        <p className="text-white/60 text-sm mt-1">
          רשומות שנכשלו ב-validation — עם פירוט בעיות ואפשרות שחרור/השלכה
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-[#0f1420] border-yellow-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-white/60 mb-2">
              <FileWarning className="w-4 h-4 text-yellow-400" />
              סה״כ quarantined
            </div>
            <div className="text-3xl font-bold text-yellow-400">{count}</div>
          </CardContent>
        </Card>
        <Card className="bg-[#0f1420] border-orange-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-white/60 mb-2">
              <AlertTriangle className="w-4 h-4 text-orange-400" />
              בבדיקה
            </div>
            <div className="text-3xl font-bold text-orange-400">{byStatus.quarantined ?? 0}</div>
          </CardContent>
        </Card>
        <Card className="bg-[#0f1420] border-green-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-white/60 mb-2">
              <CheckCircle2 className="w-4 h-4 text-green-400" />
              שוחררו
            </div>
            <div className="text-3xl font-bold text-green-400">{byStatus.released ?? 0}</div>
          </CardContent>
        </Card>
        <Card className="bg-[#0f1420] border-red-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-white/60 mb-2">
              <Trash2 className="w-4 h-4 text-red-400" />
              הושלכו
            </div>
            <div className="text-3xl font-bold text-red-400">{byStatus.discarded ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Quarantine List */}
      <Card className="bg-[#0f1420] border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-yellow-400" />
            רשומות ב-quarantine
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[calc(100vh-440px)] pr-2">
            {records.length === 0 ? (
              <div className="text-center py-16 text-white/40">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-50 text-green-500" />
                <p>אין רשומות ב-quarantine</p>
                <p className="text-xs mt-1">הכל עבר validation בהצלחה</p>
              </div>
            ) : (
              <div className="space-y-3">
                {records.map((qr) => (
                  <div key={qr.raw.recordId} className={`rounded-lg border p-4 ${
                    qr.status === "released" ? "bg-green-500/5 border-green-500/30 opacity-60" :
                    qr.status === "discarded" ? "bg-red-500/5 border-red-500/30 opacity-60" :
                    "bg-yellow-500/5 border-yellow-500/30"
                  }`}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <FileWarning className="w-4 h-4 text-yellow-400 shrink-0" />
                        <div className="font-mono text-xs truncate">{qr.raw.recordId}</div>
                      </div>
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {qr.status}
                      </Badge>
                    </div>

                    {/* Metadata */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] text-white/60 mb-3">
                      <div>
                        <div className="text-white/40">source</div>
                        <div className="font-mono truncate">{qr.raw.sourceId}</div>
                      </div>
                      <div>
                        <div className="text-white/40">schema</div>
                        <div className="font-mono truncate">{qr.raw.schemaName}:{qr.raw.schemaVersion}</div>
                      </div>
                      <div>
                        <div className="text-white/40">source_record_id</div>
                        <div className="font-mono truncate">{qr.raw.sourceRecordId}</div>
                      </div>
                      <div>
                        <div className="text-white/40">quarantined at</div>
                        <div className="font-mono">{new Date(qr.storedAt).toLocaleTimeString("he-IL")}</div>
                      </div>
                    </div>

                    {/* Issues */}
                    <div className="space-y-1 mb-3">
                      <div className="text-[10px] uppercase text-white/50 font-semibold">בעיות:</div>
                      {qr.issues.map((issue, i) => (
                        <div key={i} className={`text-xs p-2 rounded border ${SEVERITY_COLORS[issue.severity] ?? SEVERITY_COLORS.warning}`}>
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                            <span className="font-mono font-semibold">{issue.ruleName}</span>
                            <Badge variant="outline" className="text-[9px] ml-auto">{issue.severity}</Badge>
                          </div>
                          <div className="mt-1 opacity-80">{issue.message}</div>
                          {issue.field && (
                            <div className="text-[10px] mt-0.5 opacity-60">שדה: {issue.field}</div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Actions */}
                    {qr.status === "quarantined" && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs border-green-500/40 text-green-300 hover:bg-green-500/10"
                          onClick={() => release(qr.raw.recordId)}
                        >
                          <RotateCcw className="w-3 h-3 ml-1" />
                          שחרר
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs border-red-500/40 text-red-300 hover:bg-red-500/10"
                          onClick={() => discard(qr.raw.recordId)}
                        >
                          <Trash2 className="w-3 h-3 ml-1" />
                          השלך
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
