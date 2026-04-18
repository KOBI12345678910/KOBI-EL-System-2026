import { useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authJson } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { OrchStatusBadge, formatHe } from "./_OrchestrationTable";
import { ArrowRight, Pause, Play, XCircle } from "lucide-react";

interface RunRow { id: number; workflow_code: string; workflow_name: string; status: string; priority: number; started_at: string | null; finished_at: string | null; created_at: string; correlation_id: string | null; parent_entity_type: string | null; parent_entity_id: number | null; error_message: string | null; context: Record<string, unknown> | null; }
interface StepRow { id: number; step_code: string; step_name: string; step_type: string; sequence_order: number; status: string; started_at: string | null; finished_at: string | null; attempt: number; error_message: string | null; output_payload: Record<string, unknown> | null; }
interface JobRow { id: number; queue_name: string; job_type: string; status: string; attempts_count: number; max_attempts: number; scheduled_at: string; started_at: string | null; finished_at: string | null; last_error: string | null; }

export default function WorkflowRunDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: [`/api/orchestration/workflow-runs/${id}`],
    queryFn: () => authJson(`/api/orchestration/workflow-runs/${id}`),
    enabled: Number.isInteger(id) && id > 0,
  });

  const run: RunRow | undefined = data?.run;
  const steps: StepRow[] = (data?.steps ?? []) as StepRow[];
  const jobs: JobRow[] = (data?.jobs ?? []) as JobRow[];

  const invalidate = () => qc.invalidateQueries({ queryKey: [`/api/orchestration/workflow-runs/${id}`] });

  const pauseMut = useMutation({
    mutationFn: () => authJson(`/api/orchestration/workflow-runs/${id}/pause`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: invalidate,
  });
  const resumeMut = useMutation({
    mutationFn: () => authJson(`/api/orchestration/workflow-runs/${id}/resume`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: invalidate,
  });
  const cancelMut = useMutation({
    mutationFn: () => authJson(`/api/orchestration/workflow-runs/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason: "cancelled from detail view" }) }),
    onSuccess: invalidate,
  });

  if (!Number.isInteger(id) || id <= 0) {
    return <div className="p-4" dir="rtl">מזהה לא תקין</div>;
  }
  if (isLoading) return <div className="p-4" dir="rtl">טוען…</div>;
  if (!run) return <div className="p-4" dir="rtl">הריצה לא נמצאה</div>;

  return (
    <div className="space-y-4 p-4" dir="rtl">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>ריצה #{run.id} — {run.workflow_name}</CardTitle>
            <div className="text-sm text-muted-foreground mt-1">
              קוד: {run.workflow_code} · <OrchStatusBadge status={run.status} /> · עדיפות {run.priority}
            </div>
          </div>
          <div className="flex gap-2">
            <Link href="/workflow-runs">
              <Button variant="outline" size="sm"><ArrowRight className="h-4 w-4 mr-1" /> חזרה</Button>
            </Link>
            {(run.status === "running" || run.status === "pending") && (
              <Button size="sm" variant="outline" disabled={pauseMut.isPending} onClick={() => pauseMut.mutate()}>
                <Pause className="h-4 w-4 mr-1" /> השהה
              </Button>
            )}
            {run.status === "paused" && (
              <Button size="sm" variant="outline" disabled={resumeMut.isPending} onClick={() => resumeMut.mutate()}>
                <Play className="h-4 w-4 mr-1" /> המשך
              </Button>
            )}
            {["pending", "running", "paused"].includes(run.status) && (
              <Button size="sm" variant="outline" disabled={cancelMut.isPending} onClick={() => cancelMut.mutate()}>
                <XCircle className="h-4 w-4 mr-1" /> בטל
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><div className="text-muted-foreground">נוצר</div><div>{formatHe(run.created_at)}</div></div>
            <div><div className="text-muted-foreground">התחלה</div><div>{formatHe(run.started_at)}</div></div>
            <div><div className="text-muted-foreground">סיום</div><div>{formatHe(run.finished_at)}</div></div>
            <div><div className="text-muted-foreground">ישות</div><div>{run.parent_entity_type ? `${run.parent_entity_type}#${run.parent_entity_id ?? ""}` : "—"}</div></div>
          </div>
          {run.error_message && (
            <div className="mt-4 p-2 rounded bg-red-50 text-red-800 text-sm">
              שגיאה: {run.error_message}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>שלבים ({steps.length})</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>סדר</TableHead>
                <TableHead>קוד</TableHead>
                <TableHead>שם</TableHead>
                <TableHead>סוג</TableHead>
                <TableHead>סטטוס</TableHead>
                <TableHead>ניסיון</TableHead>
                <TableHead>התחלה</TableHead>
                <TableHead>סיום</TableHead>
                <TableHead>שגיאה</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {steps.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-4 text-muted-foreground">אין שלבים</TableCell></TableRow>
              ) : steps.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{s.sequence_order}</TableCell>
                  <TableCell>{s.step_code}</TableCell>
                  <TableCell>{s.step_name}</TableCell>
                  <TableCell>{s.step_type}</TableCell>
                  <TableCell><OrchStatusBadge status={s.status} /></TableCell>
                  <TableCell>{s.attempt}</TableCell>
                  <TableCell>{formatHe(s.started_at)}</TableCell>
                  <TableCell>{formatHe(s.finished_at)}</TableCell>
                  <TableCell className="text-red-700 text-xs">{s.error_message ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>משימות רקע ({jobs.length})</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>תור</TableHead>
                <TableHead>סוג</TableHead>
                <TableHead>סטטוס</TableHead>
                <TableHead>ניסיונות</TableHead>
                <TableHead>מתוזמן</TableHead>
                <TableHead>סיום</TableHead>
                <TableHead>שגיאה</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-4 text-muted-foreground">אין משימות רקע</TableCell></TableRow>
              ) : jobs.map((j) => (
                <TableRow key={j.id}>
                  <TableCell>{j.id}</TableCell>
                  <TableCell>{j.queue_name}</TableCell>
                  <TableCell>{j.job_type}</TableCell>
                  <TableCell><OrchStatusBadge status={j.status} /></TableCell>
                  <TableCell>{j.attempts_count}/{j.max_attempts}</TableCell>
                  <TableCell>{formatHe(j.scheduled_at)}</TableCell>
                  <TableCell>{formatHe(j.finished_at)}</TableCell>
                  <TableCell className="text-red-700 text-xs">{j.last_error ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
