import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { usePermissions } from "@/hooks/use-permissions";
import { useLocation } from "wouter";
import { FolderKanban, Plus, Search, TrendingUp, DollarSign, AlertTriangle, CheckCircle, XCircle, Trash2, Copy } from "lucide-react";
import { duplicateRecord } from "@/lib/duplicate-record";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { globalConfirm } from "@/components/confirm-dialog";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";

const API = "/api";
function fmt(n: number) { return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(n); }

interface ProjectAnalysisSummary {
  id: number;
  projectCode: string;
  projectName: string;
  customerName?: string;
  managerName?: string;
  status: string;
  startDate?: string;
  endDate?: string;
  totalMaterials: number;
  productionCosts: number;
  totalCost: number;
  totalWithVat: number;
  grossMargin: number;
  grossProfit: number;
  computedRiskScore: number;
  materialsCount: number;
}

const statusColors: Record<string, string> = {
  draft: "bg-muted/20 text-muted-foreground",
  active: "bg-green-500/20 text-green-400",
  completed: "bg-blue-500/20 text-blue-400",
  cancelled: "bg-red-500/20 text-red-400",
};
const statusLabels: Record<string, string> = {
  draft: "טיוטה",
  active: "פעיל",
  completed: "הושלם",
  cancelled: "בוטל",
};

export default function ProjectAnalysesPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailTab, setDetailTab] = useState("details");
  const { selectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();
  const [form, setForm] = useState({
    projectCode: "",
    projectName: "",
    customerName: "",
    managerName: "",
    startDate: new Date().toISOString().split("T")[0],
    endDate: "",
  });

  const { data: analyses = [] } = useQuery<ProjectAnalysisSummary[]>({
    queryKey: ["project-analyses"],
    queryFn: async () => {
      const r = await authFetch(`${API}/project-analyses`);
      const d = await r.json();
      return Array.isArray(d) ? d : (d.data || d.analyses || []);
    },
  });

  const createMutation = useMutation({
    mutationFn: async (body: { projectCode: string; projectName: string; customerName?: string; managerName?: string; startDate?: string; endDate?: string }) => {
      const r = await authFetch(`${API}/project-analyses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.message);
      }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-analyses"] });
      setDialogOpen(false);
      setForm({ projectCode: "", projectName: "", customerName: "", managerName: "", startDate: new Date().toISOString().split("T")[0], endDate: "" });
      toast({ title: "ניתוח פרויקט נוצר בהצלחה" });
    },
    onError: (err: Error) => toast({ title: "שגיאה", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`${API}/project-analyses/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Failed to delete");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-analyses"] });
      toast({ title: "ניתוח נמחק" });
    },
  });

  const items = analyses.filter((item) => {
    const matchSearch = !search ||
      item.projectName?.toLowerCase().includes(search.toLowerCase()) ||
      item.projectCode?.toLowerCase().includes(search.toLowerCase()) ||
      item.customerName?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || item.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalCosts = items.reduce((s, i) => s + (i.totalCost || 0), 0);
  const avgMargin = items.length > 0 ? items.reduce((s, i) => s + (i.grossMargin || 0), 0) / items.length : 0;
  const avgRisk = items.length > 0 ? items.reduce((s, i) => s + (i.computedRiskScore || 5), 0) / items.length : 0;
  const goCount = items.filter((i) => i.grossMargin > 15 && (i.computedRiskScore || 5) < 7).length;

  return (
    <div className="space-y-4 sm:space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <FolderKanban className="w-6 h-6 text-violet-400" /> ניתוח פרויקטים מתקדם
          </h1>
          <p className="text-muted-foreground mt-1">ניתוח עלויות, רווחיות, סיכון וסימולציות</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-violet-600 hover:bg-violet-700">
              <Plus className="w-4 h-4 ml-2" />ניתוח חדש
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-slate-900 border-slate-700 max-w-lg" dir="rtl">
            <DialogHeader><DialogTitle>ניתוח פרויקט חדש</DialogTitle></DialogHeader>
            <div className="grid gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><Label>קוד פרויקט</Label><Input value={form.projectCode} onChange={e => setForm({ ...form, projectCode: e.target.value })} className="bg-slate-800 border-slate-700" placeholder="PRJ-001" /></div>
                <div><Label>שם פרויקט</Label><Input value={form.projectName} onChange={e => setForm({ ...form, projectName: e.target.value })} className="bg-slate-800 border-slate-700" /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><Label>לקוח</Label><Input value={form.customerName} onChange={e => setForm({ ...form, customerName: e.target.value })} className="bg-slate-800 border-slate-700" /></div>
                <div><Label>מנהל פרויקט</Label><Input value={form.managerName} onChange={e => setForm({ ...form, managerName: e.target.value })} className="bg-slate-800 border-slate-700" /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><Label>תאריך התחלה</Label><Input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} className="bg-slate-800 border-slate-700" /></div>
                <div><Label>תאריך סיום</Label><Input type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} className="bg-slate-800 border-slate-700" /></div>
              </div>
              <Button
                onClick={() => createMutation.mutate(form)}
                disabled={!form.projectCode || !form.projectName || createMutation.isPending}
                className="bg-violet-600 hover:bg-violet-700"
              >
                {createMutation.isPending ? "יוצר..." : "צור ניתוח"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">סה"כ עלויות</p>
              <p className="text-lg font-bold text-blue-400">{fmt(totalCosts)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">מרג'ין ממוצע</p>
              <p className="text-lg font-bold text-green-400">{avgMargin.toFixed(1)}%</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">ציון סיכון ממוצע</p>
              <p className={`text-lg font-bold ${avgRisk <= 3 ? "text-green-400" : avgRisk <= 6 ? "text-amber-400" : "text-red-400"}`}>{avgRisk.toFixed(1)}/10</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">כדאיות (Go)</p>
              <p className="text-lg font-bold text-emerald-400">{goCount}/{items.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש פרויקט..." className="pr-9 bg-slate-800 border-slate-700" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 bg-slate-800 border-slate-700">
            <SelectValue placeholder="סטטוס" />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            <SelectItem value="all">הכל</SelectItem>
            <SelectItem value="draft">טיוטה</SelectItem>
            <SelectItem value="active">פעיל</SelectItem>
            <SelectItem value="completed">הושלם</SelectItem>
            <SelectItem value="cancelled">בוטל</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((item) => {
          const isGo = item.grossMargin > 15 && (item.computedRiskScore || 5) < 7;
          return (
            <Card
              key={item.id}
              className="bg-slate-900/50 border-slate-700/50 hover:border-slate-600/50 transition-colors cursor-pointer"
              onClick={() => navigate(`/project-analysis/${item.id}`)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-foreground font-medium truncate">{item.projectName}</h3>
                  <div className="flex items-center gap-2">
                    <Badge className={statusColors[item.status] || "bg-muted/20 text-muted-foreground"}>
                      {statusLabels[item.status] || item.status}
                    </Badge>
                    {isGo ? (
                      <Badge className="bg-emerald-500/20 text-emerald-400">Go</Badge>
                    ) : (
                      <Badge className="bg-red-500/20 text-red-400">No-Go</Badge>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  #{item.projectCode} | {item.customerName || "ללא לקוח"} | {item.materialsCount || 0} חומרים
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-muted-foreground">עלות כוללת:</span> <span className="text-blue-400">{fmt(item.totalCost || 0)}</span></div>
                  <div><span className="text-muted-foreground">מרג'ין גולמי:</span> <span className={`${(item.grossMargin || 0) >= 20 ? "text-green-400" : (item.grossMargin || 0) >= 0 ? "text-yellow-400" : "text-red-400"}`}>{(item.grossMargin || 0).toFixed(1)}%</span></div>
                  <div><span className="text-muted-foreground">רווח גולמי:</span> <span className="text-green-400">{fmt(item.grossProfit || 0)}</span></div>
                  <div><span className="text-muted-foreground">סיכון:</span> <span className={`${(item.computedRiskScore || 5) <= 3 ? "text-green-400" : (item.computedRiskScore || 5) <= 6 ? "text-amber-400" : "text-red-400"}`}>{(item.computedRiskScore || 5).toFixed(1)}/10</span></div>
                </div>
                <div className="mt-3 pt-3 border-t border-slate-700/50 flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">מנהל: {item.managerName || "—"}</span>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" title="שכפול" className="text-muted-foreground hover:text-slate-300 h-7 w-7 p-0" onClick={async (e) => { e.stopPropagation(); const res = await duplicateRecord(`${API}/project-analyses`, item.id); if (res.ok) { qc.invalidateQueries({ queryKey: ["project-analyses"] }); } else { alert("שגיאה בשכפול: " + res.error); } }}>
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                    {isSuperAdmin && <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-400 hover:text-red-300 h-7 w-7 p-0"
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (await globalConfirm("למחוק ניתוח זה?", { itemName: item.project_name || item.title || String(item.id), entityType: "ניתוח פרויקט" })) deleteMutation.mutate(item.id);
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {items.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground">אין ניתוחי פרויקטים</div>
        )}
      </div>

      <BulkActions selectedIds={selectedIds} onClear={clear} entityName="ניתוחי פרויקט" actions={defaultBulkActions(selectedIds, clear, () => qc.invalidateQueries({ queryKey: ["project-analyses"] }), `${API}/project-analyses`)} />

      <ActivityLog entityType="project-analyses" />
    </div>
  );
}
