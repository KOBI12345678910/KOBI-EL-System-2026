// Task360 — /tasks/:id — with status transitions, comments, attachments
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { useState } from "react";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ListTodo, ArrowRight } from "lucide-react";
import { STATE_COLORS, formatHebrewDate } from "./_list-helpers";

const TASK_STATES = ["backlog", "in_progress", "review", "done", "blocked", "cancelled"];

export default function Task360() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const id = params.id;
  const [newComment, setNewComment] = useState("");

  const { data: taskData } = useQuery({
    queryKey: ["execution", "task", id],
    queryFn: () => authFetch(`/api/execution/tasks/${id}`),
    enabled: !!id,
  });
  const task = taskData?.data as Record<string, unknown> | undefined;

  const comments = useQuery({
    queryKey: ["execution", "task-comments", id],
    queryFn: () => authFetch(`/api/execution/task-comments?task_id=${id}&limit=200`),
    enabled: !!id,
  });
  const attachments = useQuery({
    queryKey: ["execution", "task-attachments", id],
    queryFn: () => authFetch(`/api/execution/task-attachments?task_id=${id}&limit=200`),
    enabled: !!id,
  });
  const deps = useQuery({
    queryKey: ["execution", "task-dependencies", id],
    queryFn: () => authFetch(`/api/execution/task-dependencies?task_id=${id}&limit=200`),
    enabled: !!id,
  });

  const transition = useMutation({
    mutationFn: (to_state: string) =>
      authFetch(`/api/execution/tasks/${id}/transition-status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to_state }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["execution", "task", id] }),
  });

  const addComment = useMutation({
    mutationFn: () =>
      authFetch(`/api/execution/task-comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task_id: Number(id), comment_body: newComment }),
      }),
    onSuccess: () => {
      setNewComment("");
      qc.invalidateQueries({ queryKey: ["execution", "task-comments", id] });
    },
  });

  if (!task) return <div className="p-10 text-center" dir="rtl">טוען משימה…</div>;

  return (
    <div className="p-6 space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-muted-foreground font-mono">{String(task.task_number)}</div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ListTodo className="h-7 w-7 text-primary" /> {String(task.title)}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={STATE_COLORS[String(task.state)] || "bg-gray-400"}>{String(task.state)}</Badge>
          <Button variant="outline" onClick={() => navigate("/tasks")}>
            <ArrowRight className="h-4 w-4 ml-2" /> חזרה לרשימה
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">שינוי סטטוס</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {TASK_STATES.map((s) => (
              <Button
                key={s}
                variant={s === String(task.state) ? "default" : "outline"}
                size="sm"
                disabled={transition.isPending || s === String(task.state)}
                onClick={() => transition.mutate(s)}
              >
                {s}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">פרטים</TabsTrigger>
          <TabsTrigger value="comments">תגובות ({comments.data?.data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="attachments">קבצים מצורפים ({attachments.data?.data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="deps">תלויות ({deps.data?.data?.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          <Card><CardContent className="grid grid-cols-2 gap-3 p-4 text-sm">
            <div><span className="font-semibold">תיאור: </span>{String(task.description ?? "—")}</div>
            <div><span className="font-semibold">עדיפות: </span>{String(task.priority ?? "—")}</div>
            <div><span className="font-semibold">תאריך יעד: </span>{formatHebrewDate(task.due_date as string)}</div>
            <div><span className="font-semibold">פרויקט: </span>{String(task.project_id ?? "—")}</div>
            <div><span className="font-semibold">הזמנת עבודה: </span>{String(task.work_order_id ?? "—")}</div>
            <div><span className="font-semibold">אחראי: </span>{String(task.assignee_user_id ?? "—")}</div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="comments">
          <Card><CardContent className="space-y-3 p-4">
            <div className="flex gap-2">
              <Textarea value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="הוסף תגובה…" rows={2} />
              <Button disabled={!newComment || addComment.isPending} onClick={() => addComment.mutate()}>שלח</Button>
            </div>
            <div className="space-y-2">
              {(comments.data?.data ?? []).map((c: Record<string, unknown>) => (
                <div key={String(c.id)} className="p-3 border rounded">
                  <div className="text-xs text-muted-foreground">{formatHebrewDate(c.created_at as string)}</div>
                  <div>{String(c.comment_body)}</div>
                </div>
              ))}
            </div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="attachments">
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>שם קובץ</TableHead><TableHead>סוג</TableHead><TableHead>הועלה</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {(attachments.data?.data ?? []).map((a: Record<string, unknown>) => (
                  <TableRow key={String(a.id)}>
                    <TableCell>{String(a.file_name)}</TableCell>
                    <TableCell>{String(a.file_mime_type ?? "—")}</TableCell>
                    <TableCell>{formatHebrewDate(a.created_at as string)}</TableCell>
                    <TableCell><a href={String(a.file_url)} target="_blank" rel="noreferrer"><Button size="sm" variant="outline">פתח</Button></a></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="deps">
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>קודם</TableHead><TableHead>עוקב</TableHead><TableHead>סוג</TableHead></TableRow></TableHeader>
              <TableBody>
                {(deps.data?.data ?? []).map((d: Record<string, unknown>) => (
                  <TableRow key={String(d.id)}>
                    <TableCell>{String(d.predecessor_task_id)}</TableCell>
                    <TableCell>{String(d.successor_task_id)}</TableCell>
                    <TableCell>{String(d.dependency_type)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      <Input type="hidden" />
    </div>
  );
}
