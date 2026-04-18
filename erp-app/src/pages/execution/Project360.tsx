// Project360 — /projects/:id — must display phases+milestones+risks+blockers+tasks+work_orders tabs
import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FolderKanban, ArrowRight } from "lucide-react";
import { formatCurrencyILS, formatHebrewDate, STATE_COLORS } from "./_list-helpers";

export default function Project360() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const id = params.id;

  const { data: projectData, isLoading } = useQuery({
    queryKey: ["execution", "project", id],
    queryFn: () => authFetch(`/api/execution/projects/${id}`),
    enabled: !!id,
  });
  const project = projectData?.data as Record<string, unknown> | undefined;

  const phases = useQuery({
    queryKey: ["execution", "project-phases", id],
    queryFn: () => authFetch(`/api/execution/project-phases?project_id=${id}&limit=200`),
    enabled: !!id,
  });
  const milestones = useQuery({
    queryKey: ["execution", "project-milestones", id],
    queryFn: () => authFetch(`/api/execution/project-milestones?project_id=${id}&limit=200`),
    enabled: !!id,
  });
  const risks = useQuery({
    queryKey: ["execution", "project-risks", id],
    queryFn: () => authFetch(`/api/execution/project-risks?project_id=${id}&limit=200`),
    enabled: !!id,
  });
  const blockers = useQuery({
    queryKey: ["execution", "project-blockers", id],
    queryFn: () => authFetch(`/api/execution/project-blockers?project_id=${id}&limit=200`),
    enabled: !!id,
  });
  const tasks = useQuery({
    queryKey: ["execution", "tasks", { project_id: id }],
    queryFn: () => authFetch(`/api/execution/tasks?project_id=${id}&limit=200`),
    enabled: !!id,
  });
  const workOrders = useQuery({
    queryKey: ["execution", "work-orders", { project_id: id }],
    queryFn: () => authFetch(`/api/execution/work-orders?project_id=${id}&limit=200`),
    enabled: !!id,
  });

  if (isLoading) return <div className="p-10 text-center" dir="rtl">טוען פרויקט…</div>;
  if (!project) return <div className="p-10 text-center text-red-600" dir="rtl">פרויקט לא נמצא</div>;

  return (
    <div className="p-6 space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-muted-foreground font-mono">{String(project.project_number)}</div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FolderKanban className="h-7 w-7 text-primary" /> {String(project.project_name)}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={STATE_COLORS[String(project.state)] || "bg-gray-400"}>{String(project.state)}</Badge>
          <Button variant="outline" onClick={() => navigate("/projects")}>
            <ArrowRight className="h-4 w-4 ml-2" /> חזרה לרשימה
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">תקציב</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{formatCurrencyILS(Number(project.budget_amount))}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">עלות בפועל</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{formatCurrencyILS(Number(project.actual_cost))}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">התקדמות</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{Math.round(Number(project.progress_percent) || 0)}%</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">תאריך סיום מתוכנן</CardTitle></CardHeader><CardContent className="text-lg">{formatHebrewDate(project.planned_end_date as string)}</CardContent></Card>
      </div>

      <Tabs defaultValue="phases">
        <TabsList>
          <TabsTrigger value="phases">שלבים ({phases.data?.data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="milestones">אבני דרך ({milestones.data?.data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="risks">סיכונים ({risks.data?.data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="blockers">חסמים ({blockers.data?.data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="tasks">משימות ({tasks.data?.data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="work_orders">הזמנות עבודה ({workOrders.data?.data?.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="phases">
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>סדר</TableHead><TableHead>שם</TableHead><TableHead>סטטוס</TableHead><TableHead>תחילה</TableHead><TableHead>סיום</TableHead><TableHead>התקדמות</TableHead></TableRow></TableHeader>
              <TableBody>
                {(phases.data?.data ?? []).map((r: Record<string, unknown>) => (
                  <TableRow key={String(r.id)}><TableCell>{String(r.phase_order)}</TableCell><TableCell>{String(r.phase_name)}</TableCell><TableCell><Badge>{String(r.state)}</Badge></TableCell><TableCell>{formatHebrewDate(r.planned_start_date as string)}</TableCell><TableCell>{formatHebrewDate(r.planned_end_date as string)}</TableCell><TableCell>{Math.round(Number(r.progress_percent) || 0)}%</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="milestones">
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>שם</TableHead><TableHead>יעד</TableHead><TableHead>סטטוס</TableHead><TableHead>הושג</TableHead></TableRow></TableHeader>
              <TableBody>
                {(milestones.data?.data ?? []).map((r: Record<string, unknown>) => (
                  <TableRow key={String(r.id)}><TableCell>{String(r.milestone_name)}</TableCell><TableCell>{formatHebrewDate(r.due_date as string)}</TableCell><TableCell><Badge>{String(r.state)}</Badge></TableCell><TableCell>{formatHebrewDate(r.achieved_at as string)}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="risks">
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>סיכון</TableHead><TableHead>סבירות</TableHead><TableHead>השפעה</TableHead><TableHead>סטטוס</TableHead></TableRow></TableHeader>
              <TableBody>
                {(risks.data?.data ?? []).map((r: Record<string, unknown>) => (
                  <TableRow key={String(r.id)}><TableCell>{String(r.risk_title)}</TableCell><TableCell>{String(r.likelihood)}</TableCell><TableCell>{String(r.impact)}</TableCell><TableCell><Badge>{String(r.state)}</Badge></TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="blockers">
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>כותרת</TableHead><TableHead>חומרה</TableHead><TableHead>סטטוס</TableHead><TableHead>יעד</TableHead></TableRow></TableHeader>
              <TableBody>
                {(blockers.data?.data ?? []).map((r: Record<string, unknown>) => (
                  <TableRow key={String(r.id)}><TableCell>{String(r.title)}</TableCell><TableCell>{String(r.severity)}</TableCell><TableCell><Badge>{String(r.state)}</Badge></TableCell><TableCell>{formatHebrewDate(r.due_date as string)}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="tasks">
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>מספר</TableHead><TableHead>כותרת</TableHead><TableHead>סטטוס</TableHead><TableHead>עדיפות</TableHead><TableHead>תאריך יעד</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {(tasks.data?.data ?? []).map((r: Record<string, unknown>) => (
                  <TableRow key={String(r.id)} className="cursor-pointer" onClick={() => navigate(`/tasks/${r.id}`)}>
                    <TableCell className="font-mono text-xs">{String(r.task_number)}</TableCell>
                    <TableCell>{String(r.title)}</TableCell>
                    <TableCell><Badge className={STATE_COLORS[String(r.state)] || "bg-gray-400"}>{String(r.state)}</Badge></TableCell>
                    <TableCell>{String(r.priority ?? "—")}</TableCell>
                    <TableCell>{formatHebrewDate(r.due_date as string)}</TableCell>
                    <TableCell><Button size="sm" variant="ghost">פתח</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="work_orders">
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>מספר</TableHead><TableHead>כותרת</TableHead><TableHead>סטטוס</TableHead><TableHead>איכות</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {(workOrders.data?.data ?? []).map((r: Record<string, unknown>) => (
                  <TableRow key={String(r.id)} className="cursor-pointer" onClick={() => navigate(`/work-orders/${r.id}`)}>
                    <TableCell className="font-mono text-xs">{String(r.work_order_number)}</TableCell>
                    <TableCell>{String(r.title)}</TableCell>
                    <TableCell><Badge className={STATE_COLORS[String(r.state)] || "bg-gray-400"}>{String(r.state)}</Badge></TableCell>
                    <TableCell>{String(r.quality_status ?? "—")}</TableCell>
                    <TableCell><Button size="sm" variant="ghost">פתח</Button></TableCell>
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
