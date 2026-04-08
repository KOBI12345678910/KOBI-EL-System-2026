import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, CreditCard, Link2 } from "lucide-react";

export default function FinCreditClearing() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data: transactions, isLoading } = useQuery({
    queryKey: ["/api/fin/credit-transactions"],
    queryFn: () => fetch("/api/fin/credit-transactions").then(r => r.json()),
  });

  const { data: statuses } = useQuery({ queryKey: ["/api/fin/statuses"] });

  const [form, setForm] = useState({
    customerId: "",
    documentId: "",
    transactionDate: new Date().toISOString().split("T")[0],
    amount: "",
    transactionCode: "",
    providerReference: "",
    notes: "",
  });

  const createMutation = useMutation({
    mutationFn: (data: any) =>
      fetch("/api/fin/credit-transactions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fin/credit-transactions"] });
      setShowCreate(false);
    },
  });

  const getStatusBadge = (statusId: number) => {
    const status = (statuses || []).find((s: any) => s.id === statusId);
    if (!status) return null;
    return <Badge style={{ backgroundColor: status.color, color: "white" }}>{status.labelHe}</Badge>;
  };

  return (
    <div className="p-6 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">סליקת אשראי</h1>
          <p className="text-muted-foreground">{(transactions || []).length} עסקאות</p>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 ml-2" /> חיוב חדש</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg" dir="rtl">
            <DialogHeader><DialogTitle>חיוב אשראי חדש</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>לקוח</Label>
                <Input value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })} placeholder="מספר לקוח" />
              </div>
              <div>
                <Label>מסמך קשור</Label>
                <Input value={form.documentId} onChange={(e) => setForm({ ...form, documentId: e.target.value })} placeholder="מספר מסמך" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>סכום *</Label>
                  <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                </div>
                <div>
                  <Label>תאריך עסקה *</Label>
                  <Input type="date" value={form.transactionDate} onChange={(e) => setForm({ ...form, transactionDate: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>קוד עסקה</Label>
                  <Input value={form.transactionCode} onChange={(e) => setForm({ ...form, transactionCode: e.target.value })} />
                </div>
                <div>
                  <Label>אסמכתא ספק</Label>
                  <Input value={form.providerReference} onChange={(e) => setForm({ ...form, providerReference: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>הערות</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <Button className="w-full" onClick={() => {
                const defaultStatus = (statuses || []).find((s: any) => s.name === "pending");
                createMutation.mutate({
                  customerId: form.customerId ? Number(form.customerId) : null,
                  documentId: form.documentId ? Number(form.documentId) : null,
                  transactionDate: form.transactionDate,
                  amount: form.amount,
                  transactionCode: form.transactionCode,
                  providerReference: form.providerReference,
                  statusId: defaultStatus?.id || 2,
                  notes: form.notes,
                });
              }}>
                בצע חיוב
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
                <TableHead className="text-right">תאריך</TableHead>
                <TableHead className="text-right">לקוח</TableHead>
                <TableHead className="text-right">סכום</TableHead>
                <TableHead className="text-right">קוד עסקה</TableHead>
                <TableHead className="text-right">אסמכתא</TableHead>
                <TableHead className="text-right">סטטוס</TableHead>
                <TableHead className="text-right">פעולות</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8">טוען...</TableCell></TableRow>
              ) : (transactions || []).length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">אין עסקאות</TableCell></TableRow>
              ) : (
                (transactions || []).map((tx: any) => (
                  <TableRow key={tx.id}>
                    <TableCell>{tx.transactionDate}</TableCell>
                    <TableCell>{tx.customerId || "—"}</TableCell>
                    <TableCell className="font-medium">₪{Number(tx.amount).toLocaleString()}</TableCell>
                    <TableCell>{tx.transactionCode || "—"}</TableCell>
                    <TableCell>{tx.providerReference || "—"}</TableCell>
                    <TableCell>{getStatusBadge(tx.statusId)}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm"><Link2 className="h-4 w-4 ml-1" /> שייך למסמך</Button>
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
