// Alert360 — /alerts/:id — with acknowledge/resolve actions
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bell, ArrowRight, Eye, CheckCircle } from "lucide-react";
import { formatHebrewDate, STATE_COLORS } from "./_list-helpers";

export default function Alert360() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const id = params.id;

  const { data } = useQuery({
    queryKey: ["execution", "alert", id],
    queryFn: () => authFetch(`/api/execution/alerts/${id}`),
    enabled: !!id,
  });
  const a = data?.data as Record<string, unknown> | undefined;

  const ack = useMutation({
    mutationFn: () => authFetch(`/api/execution/alerts/${id}/acknowledge`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["execution", "alert", id] }),
  });
  const resolve = useMutation({
    mutationFn: () => authFetch(`/api/execution/alerts/${id}/resolve`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["execution", "alert", id] }),
  });

  if (!a) return <div className="p-10 text-center" dir="rtl">טוען התראה…</div>;

  return (
    <div className="p-6 space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-muted-foreground font-mono">{String(a.alert_number)}</div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="h-7 w-7 text-amber-500" /> {String(a.title)}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={STATE_COLORS[String(a.state)] || "bg-gray-400"}>{String(a.state)}</Badge>
          <Button size="sm" onClick={() => ack.mutate()} disabled={ack.isPending || String(a.state) !== "Open"}>
            <Eye className="h-4 w-4 ml-1" /> אישור קריאה
          </Button>
          <Button size="sm" variant="default" onClick={() => resolve.mutate()} disabled={resolve.isPending || String(a.state) === "Resolved"}>
            <CheckCircle className="h-4 w-4 ml-1" /> פתור
          </Button>
          <Button variant="outline" onClick={() => navigate("/alerts")}><ArrowRight className="h-4 w-4 ml-2" /> חזרה</Button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">פרטי התראה</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 text-sm">
          <div><span className="font-semibold">קטגוריה: </span>{String(a.category)}</div>
          <div><span className="font-semibold">חומרה: </span>{String(a.severity)}</div>
          <div><span className="font-semibold">תיאור: </span>{String(a.description ?? "—")}</div>
          <div><span className="font-semibold">ישות קשורה: </span>{String(a.parent_entity_type ?? "—")} / {String(a.parent_entity_id ?? "—")}</div>
          <div><span className="font-semibold">נוצר: </span>{formatHebrewDate(a.created_at as string)}</div>
          <div><span className="font-semibold">אושר: </span>{formatHebrewDate(a.acknowledged_at as string)}</div>
          <div><span className="font-semibold">נפתר: </span>{formatHebrewDate(a.resolved_at as string)}</div>
        </CardContent>
      </Card>
    </div>
  );
}
