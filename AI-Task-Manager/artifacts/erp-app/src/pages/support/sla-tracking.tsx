import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, CheckCircle, Clock, XCircle } from "lucide-react";

export default function SLATracking() {
  const [filter, setFilter] = useState("all");

  const slaRules = [
    { id: 1, name: "תקלה קריטית", targetHours: 2, category: "תקלה טכנית", priority: "דחוף" },
    { id: 2, name: "תקלה רגילה", targetHours: 8, category: "תקלה טכנית", priority: "רגיל" },
    { id: 3, name: "בקשת שירות", targetHours: 24, category: "בקשת שירות", priority: "רגיל" },
    { id: 4, name: "שאלה כללית", targetHours: 48, category: "שאלה כללית", priority: "נמוך" },
  ];

  const trackedItems = [
    { id: 101, ticket: "TK-0042", subject: "תקלה בהתחברות למערכת", slaRule: "תקלה קריטית", startedAt: "2026-04-08 09:00", targetAt: "2026-04-08 11:00", status: "on_track", elapsed: 65, target: 120 },
    { id: 102, ticket: "TK-0041", subject: "בקשה לשינוי הרשאות", slaRule: "בקשת שירות", startedAt: "2026-04-07 14:00", targetAt: "2026-04-08 14:00", status: "warning", elapsed: 1200, target: 1440 },
    { id: 103, ticket: "TK-0039", subject: "שגיאה בדוח מכירות", slaRule: "תקלה רגילה", startedAt: "2026-04-07 10:00", targetAt: "2026-04-07 18:00", status: "breached", elapsed: 600, target: 480 },
    { id: 104, ticket: "TK-0038", subject: "התקנת תוכנה", slaRule: "בקשת שירות", startedAt: "2026-04-08 08:00", targetAt: "2026-04-09 08:00", status: "completed", elapsed: 180, target: 1440 },
  ];

  const statusIcon = (status: string) => {
    switch (status) {
      case "on_track": return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "warning": return <Clock className="h-4 w-4 text-amber-500" />;
      case "breached": return <XCircle className="h-4 w-4 text-red-500" />;
      case "completed": return <CheckCircle className="h-4 w-4 text-blue-500" />;
      default: return null;
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case "on_track": return <Badge className="bg-green-500/20 text-green-600">בזמן</Badge>;
      case "warning": return <Badge className="bg-amber-500/20 text-amber-600">אזהרה</Badge>;
      case "breached": return <Badge className="bg-red-500/20 text-red-600">חריגה</Badge>;
      case "completed": return <Badge className="bg-blue-500/20 text-blue-600">הושלם</Badge>;
      default: return null;
    }
  };

  const counts = {
    on_track: trackedItems.filter(i => i.status === "on_track").length,
    warning: trackedItems.filter(i => i.status === "warning").length,
    breached: trackedItems.filter(i => i.status === "breached").length,
    completed: trackedItems.filter(i => i.status === "completed").length,
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <h1 className="text-2xl font-bold">מעקב SLA</h1>

      <div className="grid grid-cols-4 gap-4">
        <Card className="bg-green-50 border-green-200">
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-green-700">בזמן</p>
            <p className="text-3xl font-bold text-green-800">{counts.on_track}</p>
          </CardContent>
        </Card>
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-amber-700">אזהרה</p>
            <p className="text-3xl font-bold text-amber-800">{counts.warning}</p>
          </CardContent>
        </Card>
        <Card className="bg-red-50 border-red-200">
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-red-700">חריגה</p>
            <p className="text-3xl font-bold text-red-800">{counts.breached}</p>
          </CardContent>
        </Card>
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-blue-700">הושלם</p>
            <p className="text-3xl font-bold text-blue-800">{counts.completed}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>פריטים במעקב</CardTitle>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="כל הסטטוסים" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">הכל</SelectItem>
              <SelectItem value="on_track">בזמן</SelectItem>
              <SelectItem value="warning">אזהרה</SelectItem>
              <SelectItem value="breached">חריגה</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">טיקט</TableHead>
                <TableHead className="text-right">נושא</TableHead>
                <TableHead className="text-right">כלל SLA</TableHead>
                <TableHead className="text-right">התחלה</TableHead>
                <TableHead className="text-right">יעד</TableHead>
                <TableHead className="text-right">התקדמות</TableHead>
                <TableHead className="text-right">סטטוס</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trackedItems
                .filter(i => filter === "all" || i.status === filter)
                .map(item => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.ticket}</TableCell>
                  <TableCell>{item.subject}</TableCell>
                  <TableCell>{item.slaRule}</TableCell>
                  <TableCell className="text-sm">{item.startedAt}</TableCell>
                  <TableCell className="text-sm">{item.targetAt}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress value={Math.min(100, (item.elapsed / item.target) * 100)} className="h-2 w-20" />
                      <span className="text-xs">{Math.round((item.elapsed / item.target) * 100)}%</span>
                    </div>
                  </TableCell>
                  <TableCell>{statusLabel(item.status)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>כללי SLA מוגדרים</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">שם</TableHead>
                <TableHead className="text-right">קטגוריה</TableHead>
                <TableHead className="text-right">עדיפות</TableHead>
                <TableHead className="text-right">יעד (שעות)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {slaRules.map(rule => (
                <TableRow key={rule.id}>
                  <TableCell className="font-medium">{rule.name}</TableCell>
                  <TableCell>{rule.category}</TableCell>
                  <TableCell>{rule.priority}</TableCell>
                  <TableCell><Badge variant="outline">{rule.targetHours}h</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
