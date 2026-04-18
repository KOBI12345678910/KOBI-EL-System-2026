// WorkOrder360 — /work-orders/:id — includes work_order_tasks editor
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClipboardList, ArrowRight, Play, CheckCircle } from "lucide-react";
import { STATE_COLORS, formatHebrewDate } from "./_list-helpers";

export default function WorkOrder360() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const id = params.id;

  const { data: woData } = useQuery({
    queryKey: ["execution", "work-order", id],
    queryFn: () => authFetch(`/api/execution/work-orders/${id}`),
    enabled: !!id,
  });
  const wo = woData?.data as Record<string, unknown> | undefined;

  const tasks = useQuery({
    queryKey: ["execution", "work-order-tasks", id],
    queryFn: () => authFetch(`/api/execution/work-order-tasks?work_order_id=${id}&limit=200`),
    enabled: !!id,
  });
  const qaChecklists = useQuery({
    queryKey: ["execution", "work-order-qa", id],
    queryFn: () => authFetch(`/api/execution/work-order-qa-checklists?work_order_id=${id}&limit=50`),
    enabled: !!id,
  });

  const start = useMutation({
    mutationFn: () => authFetch(`/api/execution/work-orders/${id}/start`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["execution", "work-order", id] }),
  });
  const completeQa = useMutation({
    mutationFn: (result: "pass" | "fail" | "conditional") =>
      authFetch(`/api/execution/work-orders/${id}/complete-qa`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ quality_status: result }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["execution", "work-order", id] }),
  });

  if (!wo) return <div className="p-10 text-center" dir="rtl">טוען הזמנת עבודה…</div>;

  return (
    <div className="p-6 space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-muted-foreground font-mono">{String(wo.work_order_number)}</div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="h-7 w-7 text-primary" /> {String(wo.title)}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={STATE_COLORS[String(wo.state)] || "bg-gray-400"}>{String(wo.state)}</Badge>
          <Button size="sm" onClick={() => start.mutate()} disabled={start.isPending || !["draft", "approved"].includes(String(wo.state))}>
            <Play className="h-4 w-4 ml-1" /> התחל
          </Button>
          <Button size="sm" variant="outline" onClick={() => completeQa.mutate("pass")} disabled={completeQa.isPending}>
            <CheckCircle className="h-4 w-4 ml-1" /> QA עבר
          </Button>
          <Button variant="outline" onClick={() => navigate("/work-orders")}>
            <ArrowRight className="h-4 w-4 ml-2" /> חזרה
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">פרטים</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 text-sm">
          <div><span className="font-semibold">פרויקט: </span>{String(wo.project_id)}</div>
          <div><span className="font-semibold">מיקום: </span>{String(wo.location_name ?? "—")}</div>
          <div><span className="font-semibold">תחילה נדרשת: </span>{formatHebrewDate(wo.required_start_date as string)}</div>
          <div><span className="font-semibold">סיום נדרש: </span>{formatHebrewDate(wo.required_end_date as string)}</div>
          <div><span className="font-semibold">איכות: </span>{String(wo.quality_status ?? "—")}</div>
          <div><span className="font-semibold">התקדמות: </span>{Math.round(Number(wo.progress_percent) || 0)}%</div>
        </CardContent>
      </Card>

      <Tabs defaultValue="tasks">
        <TabsList>
          <TabsTrigger value="tasks">משימות ({tasks.data?.data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="qa">בקרת איכות ({qaChecklists.data?.data?.length ?? 0})</TabsTrigger>
        </TabsList>
        <TabsContent value="tasks">
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>סדר</TableHead><TableHead>משימה</TableHead><TableHead>אחראי</TableHead><TableHead>יעד</TableHead><TableHead>סטטוס</TableHead></TableRow></TableHeader>
              <TableBody>
                {(tasks.data?.data ?? []).map((t: Record<string, unknown>) => (
                  <TableRow key={String(t.id)}>
                    <TableCell>{String(t.sequence_order ?? "—")}</TableCell>
                    <TableCell>{String(t.task_name)}</TableCell>
                    <TableCell>{String(t.assignee_user_id ?? "—")}</TableCell>
                    <TableCell>{formatHebrewDate(t.due_date as string)}</TableCell>
                    <TableCell><Badge className={STATE_COLORS[String(t.state)] || "bg-gray-400"}>{String(t.state)}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="qa">
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>שם</TableHead><TableHead>תוצאה</TableHead><TableHead>הושלם</TableHead></TableRow></TableHeader>
              <TableBody>
                {(qaChecklists.data?.data ?? []).map((q: Record<string, unknown>) => (
                  <TableRow key={String(q.id)}>
                    <TableCell>{String(q.checklist_name)}</TableCell>
                    <TableCell><Badge>{String(q.overall_result)}</Badge></TableCell>
                    <TableCell>{formatHebrewDate(q.completed_at as string)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
