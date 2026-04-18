import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Pause, Play, XCircle, RefreshCw } from "lucide-react";
import { useLocation } from "wouter";

export default function FinStandingOrders() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data: orders, isLoading } = useQuery({
    queryKey: ["/api/fin/standing-orders"],
    queryFn: () => fetch("/api/fin/standing-orders").then(r => r.json()),
  });

  const { data: statuses } = useQuery({ queryKey: ["/api/fin/statuses"] });

  const [form, setForm] = useState({
    customerId: "",
    amount: "",
    frequency: "monthly",
    startDate: new Date().toISOString().split("T")[0],
    endDate: "",
    statusId: "",
    notes: "",
  });

  const createMutation = useMutation({
    mutationFn: (data: any) =>
      fetch("/api/fin/standing-orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fin/standing-orders"] });
      setShowCreate(false);
    },
  });

  const frequencyLabels: Record<string, string> = {
    monthly: "חודשי",
    bi_monthly: "דו-חודשי",
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
          <h1 className="text-2xl font-bold">הוראות קבע</h1>
          <p className="text-muted-foreground">{(orders || []).length} הוראות</p>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 ml-2" /> הוראת קבע חדשה</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg" dir="rtl">
            <DialogHeader><DialogTitle>הוראת קבע חדשה</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>לקוח *</Label>
                <Input value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })} placeholder="מספר לקוח" />
              </div>
              <div>
                <Label>סכום *</Label>
                <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </div>
              <div>
                <Label>תדירות</Label>
                <Select value={form.frequency} onValueChange={(v) => setForm({ ...form, frequency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">חודשי</SelectItem>
                    <SelectItem value="bi_monthly">דו-חודשי</SelectItem>
                    <SelectItem value="yearly">שנתי</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>תאריך התחלה *</Label>
                  <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
                </div>
                <div>
                  <Label>תאריך סיום</Label>
                  <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>הערות</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <Button className="w-full" onClick={() => {
                const defaultStatus = (statuses || []).find((s: any) => s.name === "recurring_active");
                createMutation.mutate({
                  customerId: Number(form.customerId),
                  amount: form.amount,
                  frequency: form.frequency,
                  startDate: form.startDate,
                  endDate: form.endDate || null,
                  statusId: defaultStatus?.id || 1,
                  notes: form.notes,
                });
              }}>
                שמור
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
                <TableHead className="text-right">לקוח</TableHead>
                <TableHead className="text-right">סכום</TableHead>
                <TableHead className="text-right">תדירות</TableHead>
                <TableHead className="text-right">תאריך התחלה</TableHead>
                <TableHead className="text-right">תאריך סיום</TableHead>
                <TableHead className="text-right">סטטוס</TableHead>
                <TableHead className="text-right">פעולות</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8">טוען...</TableCell></TableRow>
              ) : (orders || []).length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">אין הוראות קבע</TableCell></TableRow>
              ) : (
                (orders || []).map((order: any) => (
                  <TableRow key={order.id}>
                    <TableCell>{order.customerId}</TableCell>
                    <TableCell className="font-medium">₪{Number(order.amount).toLocaleString()}</TableCell>
                    <TableCell>{frequencyLabels[order.frequency] || order.frequency}</TableCell>
                    <TableCell>{order.startDate}</TableCell>
                    <TableCell>{order.endDate || "ללא הגבלה"}</TableCell>
                    <TableCell>{getStatusBadge(order.statusId)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" title="השהה"><Pause className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" title="הפעל"><Play className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" title="בטל"><XCircle className="h-4 w-4 text-destructive" /></Button>
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
