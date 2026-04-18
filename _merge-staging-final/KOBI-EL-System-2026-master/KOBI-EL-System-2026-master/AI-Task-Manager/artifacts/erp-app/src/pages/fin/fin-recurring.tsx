import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Pause, Play, Calendar, RefreshCw } from "lucide-react";

export default function FinRecurring() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data: templates, isLoading } = useQuery({
    queryKey: ["/api/fin/recurring"],
    queryFn: () => fetch("/api/fin/recurring").then(r => r.json()),
  });

  const { data: statuses } = useQuery({ queryKey: ["/api/fin/statuses"] });

  const [form, setForm] = useState({
    templateDocumentId: "",
    frequency: "monthly",
    intervalValue: "1",
    nextRunDate: "",
    endDate: "",
    autoSend: false,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) =>
      fetch("/api/fin/recurring", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fin/recurring"] });
      setShowCreate(false);
    },
  });

  const frequencyLabels: Record<string, string> = {
    daily: "יומי",
    weekly: "שבועי",
    monthly: "חודשי",
    yearly: "שנתי",
  };

  const getStatusBadge = (statusId: number) => {
    const status = (statuses || []).find((s: any) => s.id === statusId);
    if (!status) return null;
    return <Badge style={{ backgroundColor: status.color, color: "white" }}>{status.labelHe}</Badge>;
  };

  return (
    <div className="p-6 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">מסמכים מחזוריים</h1>
          <p className="text-muted-foreground">{(templates || []).length} תבניות</p>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 ml-2" /> תבנית חדשה</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg" dir="rtl">
            <DialogHeader><DialogTitle>תבנית מחזורית חדשה</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>מסמך תבנית *</Label>
                <Input value={form.templateDocumentId} onChange={(e) => setForm({ ...form, templateDocumentId: e.target.value })} placeholder="מספר מסמך מקור" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>תדירות</Label>
                  <Select value={form.frequency} onValueChange={(v) => setForm({ ...form, frequency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">יומי</SelectItem>
                      <SelectItem value="weekly">שבועי</SelectItem>
                      <SelectItem value="monthly">חודשי</SelectItem>
                      <SelectItem value="yearly">שנתי</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>כל X פעמים</Label>
                  <Input type="number" value={form.intervalValue} onChange={(e) => setForm({ ...form, intervalValue: e.target.value })} min="1" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>תאריך הרצה הבא *</Label>
                  <Input type="date" value={form.nextRunDate} onChange={(e) => setForm({ ...form, nextRunDate: e.target.value })} />
                </div>
                <div>
                  <Label>תאריך סיום</Label>
                  <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={form.autoSend} onCheckedChange={(v) => setForm({ ...form, autoSend: v })} />
                <Label>שליחה אוטומטית</Label>
              </div>
              <Button className="w-full" onClick={() => {
                const activeStatus = (statuses || []).find((s: any) => s.name === "recurring_active");
                createMutation.mutate({
                  templateDocumentId: Number(form.templateDocumentId),
                  frequency: form.frequency,
                  intervalValue: Number(form.intervalValue),
                  nextRunDate: form.nextRunDate,
                  endDate: form.endDate || null,
                  autoSend: form.autoSend,
                  statusId: activeStatus?.id || 9,
                });
              }}>
                שמור תבנית
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">מסמך תבנית</TableHead>
                <TableHead className="text-right">תדירות</TableHead>
                <TableHead className="text-right">כל</TableHead>
                <TableHead className="text-right">הרצה הבאה</TableHead>
                <TableHead className="text-right">שליחה אוטו'</TableHead>
                <TableHead className="text-right">נוצרו</TableHead>
                <TableHead className="text-right">סטטוס</TableHead>
                <TableHead className="text-right">פעולות</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8">טוען...</TableCell></TableRow>
              ) : (templates || []).length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">אין תבניות מחזוריות</TableCell></TableRow>
              ) : (
                (templates || []).map((t: any) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">#{t.templateDocumentId}</TableCell>
                    <TableCell>{frequencyLabels[t.frequency] || t.frequency}</TableCell>
                    <TableCell>{t.intervalValue}</TableCell>
                    <TableCell>{t.nextRunDate}</TableCell>
                    <TableCell>{t.autoSend ? <Badge variant="default">כן</Badge> : <Badge variant="secondary">לא</Badge>}</TableCell>
                    <TableCell>{t.totalGenerated || 0}</TableCell>
                    <TableCell>{getStatusBadge(t.statusId)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" title="השהה"><Pause className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" title="הפעל"><Play className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" title="הרץ עכשיו"><RefreshCw className="h-4 w-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
