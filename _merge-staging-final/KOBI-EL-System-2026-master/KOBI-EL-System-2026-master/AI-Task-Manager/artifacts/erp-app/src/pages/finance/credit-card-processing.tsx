import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CreditCard, Plus, Search, Zap, AlertTriangle, BarChart3, Info, Settings } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { authJson } from "@/lib/utils";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import AttachmentsSection from "@/components/attachments-section";
import { authFetch } from "@/lib/utils";

const API = "/api";
function fmt(n: number) { return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(n); }
function fmtDateTime(d: string) {
  if (!d) return "-";
  const date = new Date(d);
  return `${date.toLocaleDateString("he-IL")} ${date.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}`;
}

const statusColors: Record<string, string> = {
  approved: "bg-green-500/20 text-green-400",
  declined: "bg-red-500/20 text-red-400",
  pending: "bg-yellow-500/20 text-yellow-400",
};
const statusLabels: Record<string, string> = {
  approved: "מאושר",
  declined: "נדחה",
  pending: "ממתין",
};

const TABS = [
  { id: "processing", label: "סליקת אשראי", icon: CreditCard },
  { id: "failed", label: "חיובים שנכשלו", icon: AlertTriangle },
  { id: "reports", label: "דוחות", icon: BarChart3 },
  { id: "info", label: "מרכז המידע", icon: Info },
  { id: "settings", label: "הגדרות", icon: Settings },
];

export default function CreditCardProcessingPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("processing");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const { selectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();
  const [detailTab, setDetailTab] = useState("details");
  const [form, setForm] = useState({
    customer_name: "",
    amount: "",
    card_last4: "",
    products: "",
    description: "",
  });

  const { data } = useQuery({
    queryKey: ["credit-card-transactions", activeTab],
    queryFn: () => {
      const params = new URLSearchParams();
      if (activeTab === "failed") params.set("status", "declined");
      return authJson(`${API}/finance/credit-card-transactions?${params}`);
    },
  });

  const createMutation = useMutation({
    mutationFn: (body: any) => authJson(`${API}/finance/credit-card-transactions`, {
      method: "POST", body: JSON.stringify(body),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["credit-card-transactions"] });
      setDialogOpen(false);
      toast({ title: "סליקה בוצעה בהצלחה" });
    },
  });

  const items = (data?.data || []).filter((item: any) =>
    !search || item.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
    item.card_last4?.includes(search)
  );

  return (
    <div className="space-y-4 sm:space-y-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-blue-400" /> סליקת אשראי
          </h1>
          <p className="text-muted-foreground mt-1">ניהול סליקות וחיובים</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-yellow-500 hover:bg-yellow-600 text-yellow-950 font-medium">
                <CreditCard className="w-4 h-4 ml-2" />סליקת אשראי
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-slate-900 border-slate-700 max-w-lg" dir="rtl">
              <DialogHeader><DialogTitle>סליקת אשראי</DialogTitle></DialogHeader>
              <div className="grid gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><Label>שם לקוח</Label><Input value={form.customer_name} onChange={e => setForm({ ...form, customer_name: e.target.value })} className="bg-slate-800 border-slate-700" /></div>
                  <div><Label>סכום</Label><Input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className="bg-slate-800 border-slate-700" /></div>
                </div>
                <div><Label>4 ספרות אחרונות כרטיס</Label><Input value={form.card_last4} onChange={e => setForm({ ...form, card_last4: e.target.value })} maxLength={4} className="bg-slate-800 border-slate-700" /></div>
                <div><Label>מוצרים / שירותים</Label><Input value={form.products} onChange={e => setForm({ ...form, products: e.target.value })} className="bg-slate-800 border-slate-700" /></div>
                <div><Label>תיאור</Label><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="bg-slate-800 border-slate-700" /></div>
                <Button onClick={() => createMutation.mutate({ ...form, amount: parseFloat(form.amount), status: "approved", source: "manual" })} disabled={!form.customer_name || !form.amount}>
                  בצע סליקה
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Button variant="outline" className="border-slate-600">
            <Zap className="w-4 h-4 ml-2" />סליקת אשראי מהירה
          </Button>
        </div>
      </div>

      <div className="flex gap-1 bg-slate-800/50 rounded-lg p-1">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm transition-colors ${
              activeTab === tab.id
                ? "bg-slate-700 text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-slate-700/50"
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "processing" || activeTab === "failed" ? (
        <>
          <div className="flex gap-3 items-center">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי לקוח..." className="pr-9 bg-slate-800 border-slate-700" />
            </div>
          </div>

          <BulkActions selectedIds={selectedIds} onClear={clear} entityName="items" actions={defaultBulkActions(selectedIds, clear, () => qc.invalidateQueries({ queryKey: ["credit-card-transactions"] }), `${API}/finance/credit-card-transactions`)} />
          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700/50">
                      <th className="p-3 w-10"><BulkCheckbox checked={selectedIds.length === items.length && items.length > 0} onChange={() => toggleAll(items.map((i: any) => i.id))} /></th>
                      <th className="p-3 text-right text-muted-foreground font-medium">מקור תשלום</th>
                      <th className="p-3 text-right text-muted-foreground font-medium">מסמך מקושר</th>
                      <th className="p-3 text-right text-muted-foreground font-medium">סטטוס</th>
                      <th className="p-3 text-right text-muted-foreground font-medium">אישור</th>
                      <th className="p-3 text-right text-muted-foreground font-medium">חיוב הלקוח</th>
                      <th className="p-3 text-right text-muted-foreground font-medium">סכום</th>
                      <th className="p-3 text-right text-muted-foreground font-medium">מוצרים/שירותים</th>
                      <th className="p-3 text-right text-muted-foreground font-medium">לקוח</th>
                      <th className="p-3 text-right text-muted-foreground font-medium">תאריך ושעה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item: any) => (
                      <tr key={item.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                        <td className="p-3 w-10"><BulkCheckbox checked={isSelected(item.id)} onChange={() => toggle(item.id)} /></td>
                        <td className="p-3 text-slate-300">{item.source === "api" ? "API" : "ידני"}</td>
                        <td className="p-3 text-blue-400">{item.linked_document || "-"}</td>
                        <td className="p-3"><Badge className={statusColors[item.status] || "bg-slate-600"}>{statusLabels[item.status] || item.status}</Badge></td>
                        <td className="p-3 text-slate-300">{item.card_last4 ? `כרטיס אשראי ****${item.card_last4}` : "-"}</td>
                        <td className="p-3 text-muted-foreground">{item.installments ? `${item.installments} תשלומים` : "חיוב רגיל"}</td>
                        <td className="p-3 text-foreground font-medium">{fmt(Number(item.amount || 0))}</td>
                        <td className="p-3 text-muted-foreground max-w-[150px] truncate">{item.products || "-"}</td>
                        <td className="p-3 text-slate-300">{item.customer_name || "-"}</td>
                        <td className="p-3 text-slate-300 whitespace-nowrap">{fmtDateTime(item.transaction_date || item.created_at)}</td>
                      </tr>
                    ))}
                    {items.length === 0 && <tr><td colSpan={10} className="p-8 text-center text-muted-foreground">{activeTab === "failed" ? "אין חיובים שנכשלו" : "אין סליקות"}</td></tr>}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : activeTab === "reports" ? (
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardContent className="p-8 text-center text-muted-foreground">
            <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-lg">דוחות סליקה</p>
            <p className="text-sm mt-1">דוחות מפורטים של סליקות יוצגו כאן</p>
          </CardContent>
        </Card>
      ) : activeTab === "info" ? (
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardContent className="p-8 text-center text-muted-foreground">
            <Info className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-lg">מרכז המידע</p>
            <p className="text-sm mt-1">מידע על שירותי סליקה ומסופים</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardContent className="p-8 text-center text-muted-foreground">
            <Settings className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-lg">הגדרות סליקה</p>
            <p className="text-sm mt-1">הגדרות מסופים וחיבורים</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardContent className="p-4">
            <h3 className="text-foreground font-bold mb-3">רשומות קשורות</h3>
            <RelatedRecords entityType="credit-card-transactions" entityId={null} />
          </CardContent>
        </Card>
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardContent className="p-4">
            <h3 className="text-foreground font-bold mb-3">היסטוריית פעולות</h3>
            <ActivityLog entityType="credit-card-transactions" entityId={null} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
