import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BarChart3, TrendingUp, DollarSign, CheckCircle, Search, Upload, Calendar } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";

const API = "/api";
function fmt(n: number) { return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(n); }

interface ProjectAnalysis {
  id: number;
  projectCode: string;
  projectName: string;
  customerName?: string;
  managerName?: string;
  status: string;
  startDate?: string;
  endDate?: string;
  totalMaterials?: number;
  productionCosts?: number;
  totalCost?: number;
  totalWithVat?: number;
  grossMargin?: number;
  grossProfit?: number;
  netProfit?: number;
  netMargin?: number;
  computedRiskScore?: number;
  materialsCount?: number;
  proposedSalePrice?: string;
  actualSalePrice?: string;
  created_at?: string;
}

interface PriceQuote {
  id: number;
  quoteNumber?: string;
  customerName?: string;
  totalAmount?: number;
}

interface RawMaterial {
  id: number;
  materialName?: string;
  material_name?: string;
  materialNumber?: string;
  unit?: string;
}

export default function ProcurementProfitabilityPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortField, setSortField] = useState<"grossMargin" | "netMargin" | "grossProfit" | "">("grossMargin");
  const [sortAsc, setSortAsc] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importType, setImportType] = useState<"quote" | "deal" | "products">("quote");
  const [quoteId, setQuoteId] = useState("");
  const [dealId, setDealId] = useState("");
  const [selectedAnalysisId, setSelectedAnalysisId] = useState("");
  const [selectedProductIds, setSelectedProductIds] = useState<number[]>([]);
  const [detailTab, setDetailTab] = useState("details");
  const { selectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();

  const { data: analyses = [] } = useQuery<ProjectAnalysis[]>({
    queryKey: ["project-analyses"],
    queryFn: async () => {
      const r = await authFetch(`${API}/project-analyses`);
      const d = await r.json();
      return Array.isArray(d) ? d : (d.data || d.analyses || []);
    },
  });

  const { data: quotes = [] } = useQuery<PriceQuote[]>({
    queryKey: ["price-quotes-list"],
    queryFn: async () => {
      const r = await authFetch(`${API}/price-quotes`);
      const d = await r.json();
      return Array.isArray(d) ? d : (d.data || []);
    },
  });

  const { data: rawMaterials = [] } = useQuery<RawMaterial[]>({
    queryKey: ["raw-materials-list"],
    queryFn: async () => {
      const r = await authFetch(`${API}/raw-materials`);
      const d = await r.json();
      return Array.isArray(d) ? d : (d.data || []);
    },
    enabled: importType === "products",
  });

  const importFromQuoteMutation = useMutation({
    mutationFn: async (qId: string) => {
      const r = await authFetch(`${API}/project-analyses/import-from-quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId: parseInt(qId) }),
      });
      if (!r.ok) throw new Error("שגיאה בייבוא");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-analyses"] });
      setImportDialogOpen(false);
      toast({ title: "הניתוח נוצר מהצעת מחיר בהצלחה" });
    },
    onError: (e: Error) => toast({ title: "שגיאה", description: e.message, variant: "destructive" }),
  });

  const importFromDealMutation = useMutation({
    mutationFn: async (dId: string) => {
      const r = await authFetch(`${API}/project-analyses/import-from-deal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId: parseInt(dId) }),
      });
      if (!r.ok) throw new Error("שגיאה בייבוא");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-analyses"] });
      setImportDialogOpen(false);
      toast({ title: "הניתוח נוצר מסגירת עסקה בהצלחה" });
    },
    onError: (e: Error) => toast({ title: "שגיאה", description: e.message, variant: "destructive" }),
  });

  const importFromProductsMutation = useMutation({
    mutationFn: async ({ analysisId, productIds }: { analysisId: string; productIds: number[] }) => {
      const r = await authFetch(`${API}/project-analyses/import-from-products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisId: parseInt(analysisId), productIds }),
      });
      if (!r.ok) throw new Error("שגיאה בייבוא מוצרים");
      return r.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["project-analyses"] });
      setImportDialogOpen(false);
      setSelectedProductIds([]);
      toast({ title: `יובאו ${data.count || 0} חומרים בהצלחה` });
    },
    onError: (e: Error) => toast({ title: "שגיאה", description: e.message, variant: "destructive" }),
  });

  const filteredItems = analyses.filter((item) => {
    const matchSearch = !search ||
      item.projectName?.toLowerCase().includes(search.toLowerCase()) ||
      item.projectCode?.toLowerCase().includes(search.toLowerCase()) ||
      item.customerName?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || item.status === statusFilter;
    const itemDate = item.created_at?.split("T")[0] || item.startDate || "";
    const matchDateFrom = !dateFrom || itemDate >= dateFrom;
    const matchDateTo = !dateTo || itemDate <= dateTo;
    return matchSearch && matchStatus && matchDateFrom && matchDateTo;
  });

  type SortableField = "grossMargin" | "netMargin" | "grossProfit";
  function getSortValue(item: ProjectAnalysis, field: SortableField): number {
    return item[field] ?? 0;
  }

  const items = sortField
    ? [...filteredItems].sort((a, b) => {
        const va = getSortValue(a, sortField);
        const vb = getSortValue(b, sortField);
        return sortAsc ? va - vb : vb - va;
      })
    : filteredItems;

  const totalRevenue = items.reduce((s, i) => s + (parseFloat(i.actualSalePrice || i.proposedSalePrice || "0") || 0), 0);
  const avgGrossMargin = items.length > 0 ? items.reduce((s, i) => s + (i.grossMargin || 0), 0) / items.length : 0;
  const avgNetMargin = items.length > 0 ? items.reduce((s, i) => {
    const sale = parseFloat(i.actualSalePrice || i.proposedSalePrice || "0") || 0;
    const net = i.netProfit ?? i.grossProfit ?? 0;
    return s + (sale > 0 ? (net / sale) * 100 : 0);
  }, 0) / items.length : 0;
  const avgRoi = items.length > 0 ? items.reduce((s, i) => {
    const cost = i.totalCost || 0;
    const profit = i.grossProfit || 0;
    return s + (cost > 0 ? (profit / cost) * 100 : 0);
  }, 0) / items.length : 0;
  const profitableCount = items.filter(i => (i.grossMargin || 0) > 0).length;
  const profitableRate = items.length > 0 ? Math.round((profitableCount / items.length) * 100) : 0;
  const trendData = items.slice(0, 12).reverse().map((item, idx) => {
    const sale = parseFloat(item.actualSalePrice || item.proposedSalePrice || "0") || 0;
    const net = item.netProfit ?? item.grossProfit ?? 0;
    return {
      name: item.projectCode || `P${idx + 1}`,
      "מרג'ין גולמי": parseFloat((item.grossMargin || 0).toFixed(1)),
      "מרג'ין נקי": sale > 0 ? parseFloat(((net / sale) * 100).toFixed(1)) : 0,
    };
  });

  const statusColors: Record<string, string> = {
    draft: "bg-muted/20 text-muted-foreground",
    active: "bg-green-500/20 text-green-400",
    completed: "bg-blue-500/20 text-blue-400",
    cancelled: "bg-red-500/20 text-red-400",
  };
  const statusLabels: Record<string, string> = {
    draft: "טיוטה", active: "פעיל", completed: "הושלם", cancelled: "בוטל",
  };

  function toggleSort(field: typeof sortField) {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(false); }
  }

  function handleImport() {
    if (importType === "quote") {
      if (!quoteId) { toast({ title: "בחר הצעת מחיר", variant: "destructive" }); return; }
      importFromQuoteMutation.mutate(quoteId);
    } else if (importType === "deal") {
      if (!dealId) { toast({ title: "הכנס מזהה עסקה", variant: "destructive" }); return; }
      importFromDealMutation.mutate(dealId);
    } else if (importType === "products") {
      if (!selectedAnalysisId || selectedProductIds.length === 0) {
        toast({ title: "בחר ניתוח ומוצרים", variant: "destructive" }); return;
      }
      importFromProductsMutation.mutate({ analysisId: selectedAnalysisId, productIds: selectedProductIds });
    }
  }

  const isPending = importFromQuoteMutation.isPending || importFromDealMutation.isPending || importFromProductsMutation.isPending;

  return (
    <div className="space-y-4 sm:space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-violet-400" /> לוח רווחיות פרויקטים
          </h1>
          <p className="text-muted-foreground mt-1">מרג'ינים גולמי ונקי, ROI וסטטוס כדאיות</p>
        </div>
        <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-violet-600 hover:bg-violet-700">
              <Upload className="w-4 h-4 ml-2" />ייבוא נתונים
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-slate-900 border-slate-700 max-w-md" dir="rtl">
            <DialogHeader><DialogTitle>ייבוא ניתוח פרויקט</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>מקור ייבוא</Label>
                <Select value={importType} onValueChange={(v) => setImportType(v as "quote" | "deal" | "products")}>
                  <SelectTrigger className="bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="quote">ייבוא מהצעת מחיר</SelectItem>
                    <SelectItem value="deal">ייבוא מסגירת עסקה</SelectItem>
                    <SelectItem value="products">ייבוא חומרים לניתוח קיים</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {importType === "quote" && (
                <div>
                  <Label>בחר הצעת מחיר</Label>
                  <Select value={quoteId} onValueChange={setQuoteId}>
                    <SelectTrigger className="bg-slate-800 border-slate-700">
                      <SelectValue placeholder="בחר הצעת מחיר..." />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      {quotes.map(q => (
                        <SelectItem key={q.id} value={String(q.id)}>
                          {q.quoteNumber || `#${q.id}`} — {q.customerName || "לא ידוע"}
                        </SelectItem>
                      ))}
                      {quotes.length === 0 && <SelectItem value="0" disabled>אין הצעות מחיר</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {importType === "deal" && (
                <div>
                  <Label>מזהה עסקה</Label>
                  <Input value={dealId} onChange={e => setDealId(e.target.value)} className="bg-slate-800 border-slate-700" placeholder="מס' עסקה..." />
                </div>
              )}

              {importType === "products" && (
                <>
                  <div>
                    <Label>ניתוח פרויקט יעד</Label>
                    <Select value={selectedAnalysisId} onValueChange={setSelectedAnalysisId}>
                      <SelectTrigger className="bg-slate-800 border-slate-700">
                        <SelectValue placeholder="בחר ניתוח..." />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        {analyses.map(a => (
                          <SelectItem key={a.id} value={String(a.id)}>
                            {a.projectCode} — {a.projectName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>בחר חומרי גלם (מרובה)</Label>
                    <div className="max-h-40 overflow-y-auto border border-slate-700 rounded-md p-2 space-y-1">
                      {rawMaterials.map(m => {
                        const matName = m.materialName || m.material_name || `#${m.id}`;
                        return (
                          <label key={m.id} className="flex items-center gap-2 cursor-pointer text-sm text-slate-300 hover:text-foreground">
                            <input
                              type="checkbox"
                              checked={selectedProductIds.includes(m.id)}
                              onChange={e => {
                                if (e.target.checked) setSelectedProductIds(prev => [...prev, m.id]);
                                else setSelectedProductIds(prev => prev.filter(id => id !== m.id));
                              }}
                              className="w-3.5 h-3.5"
                            />
                            {matName}
                          </label>
                        );
                      })}
                      {rawMaterials.length === 0 && <p className="text-muted-foreground text-xs">טוען...</p>}
                    </div>
                    {selectedProductIds.length > 0 && (
                      <p className="text-xs text-violet-400 mt-1">נבחרו {selectedProductIds.length} חומרים</p>
                    )}
                  </div>
                </>
              )}

              <Button onClick={handleImport} disabled={isPending} className="w-full bg-violet-600 hover:bg-violet-700">
                {isPending ? "מייבא..." : "ייבא ניתוח"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">מרג'ין גולמי ממוצע</p>
              <p className="text-lg font-bold text-green-400">{avgGrossMargin.toFixed(1)}%</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">מרג'ין נקי ממוצע</p>
              <p className="text-lg font-bold text-emerald-400">{avgNetMargin.toFixed(1)}%</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">ROI ממוצע</p>
              <p className="text-lg font-bold text-blue-400">{avgRoi.toFixed(1)}%</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">שיעור פרויקטים רווחיים</p>
              <p className="text-lg font-bold text-violet-400">{profitableRate}%</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {trendData.length > 0 && (
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-300">מגמת מרג'ין גולמי ונקי לפי פרויקטים</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="grossGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="netGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} unit="%" />
                <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "8px" }} labelStyle={{ color: "#e2e8f0" }} />
                <Legend />
                <Area type="monotone" dataKey="מרג'ין גולמי" stroke="#8b5cf6" fill="url(#grossGrad)" strokeWidth={2} />
                <Area type="monotone" dataKey="מרג'ין נקי" stroke="#10b981" fill="url(#netGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs flex-1 min-w-40">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש פרויקט..." className="pr-9 bg-slate-800 border-slate-700" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 bg-slate-800 border-slate-700"><SelectValue placeholder="סטטוס" /></SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            <SelectItem value="all">הכל</SelectItem>
            <SelectItem value="draft">טיוטה</SelectItem>
            <SelectItem value="active">פעיל</SelectItem>
            <SelectItem value="completed">הושלם</SelectItem>
            <SelectItem value="cancelled">בוטל</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-36 bg-slate-800 border-slate-700 text-xs" />
          <span className="text-muted-foreground text-xs">—</span>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-36 bg-slate-800 border-slate-700 text-xs" />
        </div>
      </div>

      <Card className="bg-slate-900/50 border-slate-700/50">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50 text-muted-foreground text-xs">
                  <th className="text-right py-3 px-4">פרויקט</th>
                  <th className="text-right py-3 px-4">לקוח</th>
                  <th className="text-left py-3 px-4">הכנסה</th>
                  <th className="text-left py-3 px-4">עלויות</th>
                  <th className="text-left py-3 px-4 cursor-pointer hover:text-foreground" onClick={() => toggleSort("grossMargin")}>
                    מרג'ין גולמי {sortField === "grossMargin" ? (sortAsc ? "↑" : "↓") : ""}
                  </th>
                  <th className="text-left py-3 px-4 cursor-pointer hover:text-foreground" onClick={() => toggleSort("netMargin")}>
                    מרג'ין נקי {sortField === "netMargin" ? (sortAsc ? "↑" : "↓") : ""}
                  </th>
                  <th className="text-left py-3 px-4 cursor-pointer hover:text-foreground" onClick={() => toggleSort("grossProfit")}>
                    רווח {sortField === "grossProfit" ? (sortAsc ? "↑" : "↓") : ""}
                  </th>
                  <th className="text-center py-3 px-4">סטטוס</th>
                  <th className="text-center py-3 px-4">כדאיות</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const isGo = (item.grossMargin || 0) > 15 && (item.computedRiskScore || 5) < 7;
                  const salePrice = parseFloat(item.actualSalePrice || item.proposedSalePrice || "0") || 0;
                  const netProfitVal = item.netProfit ?? item.grossProfit ?? 0;
                  const netMarginVal = salePrice > 0 ? (netProfitVal / salePrice) * 100 : 0;
                  return (
                    <tr key={item.id} className="border-b border-slate-700/30 hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 px-4">
                        <div>
                          <p className="text-foreground font-medium">{item.projectName}</p>
                          <p className="text-xs text-muted-foreground">#{item.projectCode}</p>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-300">{item.customerName || "—"}</td>
                      <td className="py-3 px-4 text-left text-blue-400">{fmt(salePrice)}</td>
                      <td className="py-3 px-4 text-left text-slate-300">{fmt(item.totalCost || 0)}</td>
                      <td className="py-3 px-4 text-left">
                        <span className={`font-bold ${(item.grossMargin || 0) >= 20 ? "text-green-400" : (item.grossMargin || 0) >= 0 ? "text-amber-400" : "text-red-400"}`}>
                          {(item.grossMargin || 0).toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-3 px-4 text-left">
                        <span className={`font-medium ${netMarginVal >= 10 ? "text-emerald-400" : netMarginVal >= 0 ? "text-amber-400" : "text-red-400"}`}>
                          {netMarginVal.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-3 px-4 text-left">
                        <span className={`font-medium ${netProfitVal >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {fmt(netProfitVal)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Badge className={statusColors[item.status] || "bg-muted/20 text-muted-foreground"}>
                          {statusLabels[item.status] || item.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {isGo ? (
                          <Badge className="bg-emerald-500/20 text-emerald-400">Go ✓</Badge>
                        ) : (
                          <Badge className="bg-red-500/20 text-red-400">No-Go</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-muted-foreground">אין ניתוחי פרויקטים</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <BulkActions selectedIds={selectedIds} onClear={clear} entityName="ניתוחי רווחיות" actions={defaultBulkActions(selectedIds, clear, () => qc.invalidateQueries({ queryKey: ["project-analyses"] }), `${API}/project-analyses`)} />

      <ActivityLog entityType="procurement-profitability" />
    </div>
  );
}
