import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Activity, Play, Pause, RotateCcw, CheckCircle, XCircle, Clock, Zap } from "lucide-react";

export default function WorkflowMonitor() {
  const workflows = [
    { id: 1, name: "אישור הזמנת רכש", trigger: "purchase_order.created", steps: 3, active: true, executions: 156, successRate: 94 },
    { id: 2, name: "עדכון סטטוס תשלום", trigger: "payment.recorded", steps: 2, active: true, executions: 892, successRate: 99 },
    { id: 3, name: "התראת מלאי נמוך", trigger: "stock.below_reorder", steps: 2, active: true, executions: 45, successRate: 100 },
    { id: 4, name: "שליחת חשבונית ללקוח", trigger: "invoice.approved", steps: 4, active: false, executions: 234, successRate: 87 },
    { id: 5, name: "סגירת טיקט אוטומטית", trigger: "ticket.no_response_7d", steps: 2, active: true, executions: 67, successRate: 100 },
  ];

  const recentExecutions = [
    { id: 1001, workflow: "אישור הזמנת רכש", entity: "PO-00234", startedAt: "2026-04-08 10:30", status: "completed", duration: "2 דק'" },
    { id: 1002, workflow: "עדכון סטטוס תשלום", entity: "PMT-01234", startedAt: "2026-04-08 10:15", status: "completed", duration: "< 1 דק'" },
    { id: 1003, workflow: "התראת מלאי נמוך", entity: "SKU-A100", startedAt: "2026-04-08 09:00", status: "running", duration: "—" },
    { id: 1004, workflow: "שליחת חשבונית ללקוח", entity: "INV-05678", startedAt: "2026-04-08 08:45", status: "failed", duration: "5 דק'" },
  ];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Activity className="h-7 w-7" /> ניטור תהליכי עבודה
        </h1>
        <Button><Zap className="h-4 w-4 ml-2" /> תהליך חדש</Button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">תהליכים פעילים</p>
            <p className="text-3xl font-bold text-green-600">{workflows.filter(w => w.active).length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">הרצות היום</p>
            <p className="text-3xl font-bold">4</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">הצלחה ממוצעת</p>
            <p className="text-3xl font-bold text-blue-600">96%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">כשלונות</p>
            <p className="text-3xl font-bold text-red-600">1</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>תהליכים מוגדרים</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">שם</TableHead>
                <TableHead className="text-right">טריגר</TableHead>
                <TableHead className="text-right">שלבים</TableHead>
                <TableHead className="text-right">הרצות</TableHead>
                <TableHead className="text-right">הצלחה</TableHead>
                <TableHead className="text-right">סטטוס</TableHead>
                <TableHead className="text-right">פעולות</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workflows.map(wf => (
                <TableRow key={wf.id}>
                  <TableCell className="font-medium">{wf.name}</TableCell>
                  <TableCell><Badge variant="outline" className="font-mono text-xs">{wf.trigger}</Badge></TableCell>
                  <TableCell>{wf.steps}</TableCell>
                  <TableCell>{wf.executions}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress value={wf.successRate} className="h-2 w-16" />
                      <span className="text-xs">{wf.successRate}%</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {wf.active
                      ? <Badge className="bg-green-500/20 text-green-600">פעיל</Badge>
                      : <Badge className="bg-gray-500/20 text-gray-600">מושבת</Badge>
                    }
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {wf.active
                        ? <Button variant="ghost" size="icon"><Pause className="h-4 w-4" /></Button>
                        : <Button variant="ghost" size="icon"><Play className="h-4 w-4" /></Button>
                      }
                      <Button variant="ghost" size="icon"><RotateCcw className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>הרצות אחרונות</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">תהליך</TableHead>
                <TableHead className="text-right">ישות</TableHead>
                <TableHead className="text-right">התחלה</TableHead>
                <TableHead className="text-right">משך</TableHead>
                <TableHead className="text-right">סטטוס</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentExecutions.map(ex => (
                <TableRow key={ex.id}>
                  <TableCell className="font-medium">{ex.workflow}</TableCell>
                  <TableCell><Badge variant="outline" className="font-mono">{ex.entity}</Badge></TableCell>
                  <TableCell className="text-sm">{ex.startedAt}</TableCell>
                  <TableCell>{ex.duration}</TableCell>
                  <TableCell>
                    {ex.status === "completed" && <Badge className="bg-green-500/20 text-green-600"><CheckCircle className="h-3 w-3 ml-1" />הושלם</Badge>}
                    {ex.status === "running" && <Badge className="bg-blue-500/20 text-blue-600"><Clock className="h-3 w-3 ml-1" />רץ</Badge>}
                    {ex.status === "failed" && <Badge className="bg-red-500/20 text-red-600"><XCircle className="h-3 w-3 ml-1" />נכשל</Badge>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
