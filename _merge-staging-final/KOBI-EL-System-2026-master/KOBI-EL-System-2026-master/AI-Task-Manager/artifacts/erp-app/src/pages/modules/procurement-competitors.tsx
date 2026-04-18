import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Users, Plus, Trash2, Edit2, TrendingDown, AlertTriangle, Copy } from "lucide-react";
import { duplicateRecord } from "@/lib/duplicate-record";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";

const API = "/api";

interface Competitor {
  id: number;
  name: string;
  domain?: string | null;
  marketShare?: string | null;
  isActive?: boolean | null;
  swotStrengths?: string | null;
  swotWeaknesses?: string | null;
  swotOpportunities?: string | null;
  swotThreats?: string | null;
  notes?: string | null;
}

interface CompetitorPrice {
  id: number;
  competitorId: number;
  productCategory: string;
  productName?: string | null;
  ourPrice?: string | null;
  competitorPrice?: string | null;
  lastUpdated?: string | null;
}

interface ComparisonCategory {
  product_category: string;
  avg_our_price: string;
  avg_competitor_price: string;
  competitor_count: string;
}

interface ComparisonAlert {
  id: number;
  competitor_id: number;
  product_category: string;
  our_price: string;
  competitor_price: string;
  competitor_name: string;
}

interface ComparisonData {
  categories: ComparisonCategory[];
  alerts: ComparisonAlert[];
}

type CompetitorFormState = {
  name: string;
  domain: string;
  marketShare: number;
  isActive: boolean;
  swotStrengths: string;
  swotWeaknesses: string;
  swotOpportunities: string;
  swotThreats: string;
  notes: string;
};

function emptyCompetitor(): CompetitorFormState {
  return { name: "", domain: "", marketShare: 0, isActive: true, swotStrengths: "", swotWeaknesses: "", swotOpportunities: "", swotThreats: "", notes: "" };
}

type PriceFormState = {
  productCategory: string;
  productName: string;
  ourPrice: string;
  competitorPrice: string;
  lastUpdated: string;
};

const SWOT_FIELDS: { key: keyof Competitor; label: string; color: string }[] = [
  { key: "swotStrengths", label: "חוזקות", color: "border-green-500/30 bg-green-500/5" },
  { key: "swotWeaknesses", label: "חולשות", color: "border-red-500/30 bg-red-500/5" },
  { key: "swotOpportunities", label: "הזדמנויות", color: "border-blue-500/30 bg-blue-500/5" },
  { key: "swotThreats", label: "איומים", color: "border-amber-500/30 bg-amber-500/5" },
];


const loadData: any[] = [];
export default function ProcurementCompetitorsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedCompetitorId, setSelectedCompetitorId] = useState<number | null>(null);
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [competitorDialog, setCompetitorDialog] = useState(false);
  const [priceDialog, setPriceDialog] = useState(false);
  const [editingCompetitor, setEditingCompetitor] = useState<Competitor | null>(null);
  const [competitorForm, setCompetitorForm] = useState<CompetitorFormState>(emptyCompetitor());
  const [detailTab, setDetailTab] = useState("details");
  const { selectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();
  const [priceForm, setPriceForm] = useState<PriceFormState>({
    productCategory: "", productName: "", ourPrice: "", competitorPrice: "",
    lastUpdated: new Date().toISOString().split("T")[0],
  });

  const { data: competitors = [] } = useQuery<Competitor[]>({
    queryKey: ["competitors"],
    queryFn: async () => {
      const r = await authFetch(`${API}/competitors`);
      return r.json() as Promise<Competitor[]>;
    },
  });

  const { data: prices = [] } = useQuery<CompetitorPrice[]>({
    queryKey: ["competitor-prices", selectedCompetitorId],
    queryFn: async () => {
      const url = selectedCompetitorId
        ? `${API}/competitor-prices?competitorId=${selectedCompetitorId}`
        : `${API}/competitor-prices`;
      const r = await fetch(url);
      return r.json() as Promise<CompetitorPrice[]>;
    },
  });

  const { data: comparison } = useQuery<ComparisonData>({
    queryKey: ["competitor-comparison"],
    queryFn: async () => {
      const r = await authFetch(`${API}/competitor-comparison`);
      return r.json() as Promise<ComparisonData>;
    },
  });

  const createCompetitorMutation = useMutation({
    mutationFn: async (body: CompetitorFormState) => {
      const r = await authFetch(`${API}/competitors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error("שגיאה ביצירה");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["competitors"] });
      qc.invalidateQueries({ queryKey: ["competitor-comparison"] });
      setCompetitorDialog(false);
      setCompetitorForm(emptyCompetitor());
      toast({ title: "מתחרה נוסף בהצלחה" });
    },
    onError: (err: Error) => toast({ title: "שגיאה", description: err.message, variant: "destructive" }),
  });

  const updateCompetitorMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: CompetitorFormState }) => {
      const r = await authFetch(`${API}/competitors/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("שגיאה בעדכון");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["competitors"] });
      qc.invalidateQueries({ queryKey: ["competitor-comparison"] });
      setCompetitorDialog(false);
      setEditingCompetitor(null);
      toast({ title: "מתחרה עודכן" });
    },
    onError: (err: Error) => toast({ title: "שגיאה", description: err.message, variant: "destructive" }),
  });

  const deleteCompetitorMutation = useMutation({
    mutationFn: async (id: number) => {
      await authFetch(`${API}/competitors/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["competitors"] });
      qc.invalidateQueries({ queryKey: ["competitor-prices", selectedCompetitorId] });
      qc.invalidateQueries({ queryKey: ["competitor-comparison"] });
      if (selectedCompetitorId !== null) setSelectedCompetitorId(null);
      toast({ title: "מתחרה נמחק" });
    },
  });

  const createPriceMutation = useMutation({
    mutationFn: async (body: PriceFormState & { competitorId: number }) => {
      const r = await authFetch(`${API}/competitor-prices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error("שגיאה");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["competitor-prices", selectedCompetitorId] });
      qc.invalidateQueries({ queryKey: ["competitor-comparison"] });
      setPriceDialog(false);
      setPriceForm({ productCategory: "", productName: "", ourPrice: "", competitorPrice: "", lastUpdated: new Date().toISOString().split("T")[0] });
      toast({ title: "מחיר נוסף" });
    },
    onError: (err: Error) => toast({ title: "שגיאה", description: err.message, variant: "destructive" }),
  });

  const deletePriceMutation = useMutation({
    mutationFn: async (id: number) => {
      await authFetch(`${API}/competitor-prices/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["competitor-prices", selectedCompetitorId] });
      qc.invalidateQueries({ queryKey: ["competitor-comparison"] });
    },
  });

  const selectedCompetitor = competitors.find(c => c.id === selectedCompetitorId);

  const chartData = (comparison?.categories ?? []).map(cat => ({
    name: cat.product_category,
    "מחיר שלנו": parseFloat(cat.avg_our_price || "0"),
    "מחיר מתחרים": parseFloat(cat.avg_competitor_price || "0"),
  }));

  const totalPriceComparisons = prices.length;
  const cheaperCount = prices.filter(p => parseFloat(p.ourPrice ?? "0") <= parseFloat(p.competitorPrice ?? "0")).length;
  const competitivenessScore = totalPriceComparisons > 0 ? Math.round((cheaperCount / totalPriceComparisons) * 100) : 0;

  function openEditCompetitor(c: Competitor) {
    setEditingCompetitor(c);
    setCompetitorForm({
      name: c.name,
      domain: c.domain ?? "",
      marketShare: parseFloat(c.marketShare ?? "0") || 0,
      isActive: c.isActive !== false,
      swotStrengths: c.swotStrengths ?? "",
      swotWeaknesses: c.swotWeaknesses ?? "",
      swotOpportunities: c.swotOpportunities ?? "",
      swotThreats: c.swotThreats ?? "",
      notes: c.notes ?? "",
    });
    setCompetitorDialog(true);
  }

  const priceDiff = (p: CompetitorPrice) => {
    const ours = parseFloat(p.ourPrice ?? "0");
    const theirs = parseFloat(p.competitorPrice ?? "0");
    return ours > 0 ? ((ours - theirs) / ours) * 100 : 0;
  };

  return (
    <div className="space-y-4 sm:space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <Users className="w-6 h-6 text-blue-400" /> ניתוח מתחרים
          </h1>
          <p className="text-muted-foreground mt-1">השוואת מחירים, SWOT וציון תחרותיות</p>
        </div>
        <Button onClick={() => { setEditingCompetitor(null); setCompetitorForm(emptyCompetitor()); setCompetitorDialog(true); }} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4 ml-2" />מתחרה חדש
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">מתחרים פעילים</p>
              <p className="text-lg font-bold text-blue-400">{competitors.filter(c => c.isActive !== false).length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <TrendingDown className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">ציון תחרותיות</p>
              <p className="text-lg font-bold text-green-400">{competitivenessScore}%</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">התראות מחיר</p>
              <p className="text-lg font-bold text-amber-400">{comparison?.alerts?.length ?? 0}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="competitors">
        <TabsList className="bg-slate-800 border-slate-700">
          <TabsTrigger value="competitors">מסד מתחרים</TabsTrigger>
          <TabsTrigger value="prices">השוואת מחירים</TabsTrigger>
          <TabsTrigger value="chart">גרף השוואה</TabsTrigger>
          <TabsTrigger value="alerts">התראות מחיר</TabsTrigger>
        </TabsList>

        <TabsContent value="competitors" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {competitors.map(c => (
              <Card
                key={c.id}
                className={`bg-slate-900/50 border-slate-700/50 cursor-pointer transition-colors ${selectedCompetitorId === c.id ? "border-blue-500/50" : "hover:border-slate-600/50"}`}
                onClick={() => setSelectedCompetitorId(c.id === selectedCompetitorId ? null : c.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="text-foreground font-medium">{c.name}</h3>
                      {c.domain && <p className="text-xs text-muted-foreground">{c.domain}</p>}
                    </div>
                    <Badge className={c.isActive !== false ? "bg-green-500/20 text-green-400" : "bg-muted/20 text-muted-foreground"}>
                      {c.isActive !== false ? "פעיל" : "לא פעיל"}
                    </Badge>
                  </div>
                  {c.marketShare && parseFloat(c.marketShare) > 0 && (
                    <div className="mt-2">
                      <p className="text-xs text-muted-foreground mb-1">נתח שוק: {parseFloat(c.marketShare)}%</p>
                      <div className="w-full h-1.5 bg-slate-700 rounded-full">
                        <div className="h-1.5 bg-blue-500 rounded-full" style={{ width: `${Math.min(parseFloat(c.marketShare), 100)}%` }} />
                      </div>
                    </div>
                  )}
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-foreground h-7 px-2" onClick={(e) => { e.stopPropagation(); openEditCompetitor(c); }}>
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" title="שכפול" className="text-muted-foreground hover:text-slate-300 h-7 px-2" onClick={async (e) => { e.stopPropagation(); const res = await duplicateRecord(`${API}/competitors`, c.id); if (res.ok) { loadData(); } else { alert("שגיאה בשכפול: " + res.error); } }}>
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                    {isSuperAdmin && <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300 h-7 px-2" onClick={async (e) => { e.stopPropagation(); const ok = await globalConfirm("למחוק מתחרה זה?", { itemName: c.name || String(c.id), entityType: "מתחרה" }); if (ok) deleteCompetitorMutation.mutate(c.id); }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>}
                  </div>
                </CardContent>
              </Card>
            ))}
            {competitors.length === 0 && (
              <div className="col-span-full text-center py-12 text-muted-foreground">אין מתחרים — הוסף מתחרה ראשון</div>
            )}
          </div>

          {selectedCompetitor && (
            <Card className="bg-slate-900/50 border-slate-700/50 mt-4">
              <CardHeader><CardTitle className="text-sm text-slate-300">SWOT — {selectedCompetitor.name}</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {SWOT_FIELDS.map(({ key, label, color }) => (
                    <div key={key} className={`p-3 rounded-lg border ${color}`}>
                      <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
                      <p className="text-sm text-slate-300">{selectedCompetitor[key] ?? "—"}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="prices" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {selectedCompetitorId ? `מחירים עבור: ${selectedCompetitor?.name}` : "כל המחירים"}
            </p>
            {selectedCompetitorId && (
              <Button size="sm" onClick={() => setPriceDialog(true)} className="bg-blue-600 hover:bg-blue-700">
                <Plus className="w-4 h-4 ml-1" />הוסף מחיר
              </Button>
            )}
          </div>
          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50 text-muted-foreground text-xs">
                    <th className="text-right py-3 px-4">קטגוריה</th>
                    <th className="text-right py-3 px-4">מוצר</th>
                    <th className="text-left py-3 px-4">מחיר שלנו</th>
                    <th className="text-left py-3 px-4">מחיר מתחרה</th>
                    <th className="text-left py-3 px-4">הפרש %</th>
                    <th className="text-right py-3 px-4">עדכון</th>
                    <th className="py-3 px-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {prices.map(p => {
                    const diff = priceDiff(p);
                    return (
                      <tr key={p.id} className="border-b border-slate-700/30 hover:bg-slate-800/30">
                        <td className="py-3 px-4 text-foreground">{p.productCategory}</td>
                        <td className="py-3 px-4 text-slate-300">{p.productName ?? "—"}</td>
                        <td className="py-3 px-4 text-left text-blue-400">₪{parseFloat(p.ourPrice ?? "0").toLocaleString()}</td>
                        <td className="py-3 px-4 text-left text-slate-300">₪{parseFloat(p.competitorPrice ?? "0").toLocaleString()}</td>
                        <td className="py-3 px-4 text-left">
                          <span className={`font-medium ${diff > 0 ? "text-red-400" : "text-green-400"}`}>
                            {diff > 0 ? "+" : ""}{diff.toFixed(1)}%
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right text-muted-foreground text-xs">{p.lastUpdated ?? "—"}</td>
                        <td className="py-3 px-4">
                          <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300 h-7 w-7 p-0" onClick={() => deletePriceMutation.mutate(p.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                  {prices.length === 0 && (
                    <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">{selectedCompetitorId ? "אין מחירים לפרויקט" : "בחר מתחרה לצפייה במחירים"}</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="chart" className="mt-4">
          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardHeader><CardTitle className="text-sm text-slate-300">השוואת מחירים לפי קטגוריה</CardTitle></CardHeader>
            <CardContent>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                    <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
                    <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "8px" }} labelStyle={{ color: "#e2e8f0" }} />
                    <Legend />
                    <Bar dataKey="מחיר שלנו" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="מחיר מתחרים" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center py-12 text-muted-foreground">אין נתוני מחירים להצגה</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alerts" className="mt-4">
          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-sm text-slate-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                התראות מחיר — מוצרים שמתחרה זול ב-10%+ ממחירנו
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50 text-muted-foreground text-xs">
                    <th className="text-right py-3 px-4">מתחרה</th>
                    <th className="text-right py-3 px-4">קטגוריה</th>
                    <th className="text-left py-3 px-4">מחיר שלנו</th>
                    <th className="text-left py-3 px-4">מחיר מתחרה</th>
                    <th className="text-left py-3 px-4">הפרש</th>
                  </tr>
                </thead>
                <tbody>
                  {(comparison?.alerts ?? []).map(a => {
                    const ours = parseFloat(a.our_price || "0");
                    const theirs = parseFloat(a.competitor_price || "0");
                    const diff = ours > 0 ? ((ours - theirs) / ours) * 100 : 0;
                    return (
                      <tr key={a.id} className="border-b border-slate-700/30 hover:bg-amber-500/5">
                        <td className="py-3 px-4 text-foreground">{a.competitor_name}</td>
                        <td className="py-3 px-4 text-slate-300">{a.product_category}</td>
                        <td className="py-3 px-4 text-left text-blue-400">₪{ours.toLocaleString()}</td>
                        <td className="py-3 px-4 text-left text-slate-300">₪{theirs.toLocaleString()}</td>
                        <td className="py-3 px-4 text-left text-red-400 font-medium">-{diff.toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                  {(comparison?.alerts ?? []).length === 0 && (
                    <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">אין התראות מחיר</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={competitorDialog} onOpenChange={setCompetitorDialog}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-2xl" dir="rtl">
          <DialogHeader><DialogTitle>{editingCompetitor ? "עריכת מתחרה" : "מתחרה חדש"}</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>שם מתחרה</Label>
                <Input value={competitorForm.name} onChange={e => setCompetitorForm(f => ({ ...f, name: e.target.value }))} className="bg-slate-800 border-slate-700" />
              </div>
              <div>
                <Label>תחום</Label>
                <Input value={competitorForm.domain} onChange={e => setCompetitorForm(f => ({ ...f, domain: e.target.value }))} className="bg-slate-800 border-slate-700" placeholder="תחום עסקי..." />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>נתח שוק %</Label>
                <Input type="number" value={String(competitorForm.marketShare)} onChange={e => setCompetitorForm(f => ({ ...f, marketShare: parseFloat(e.target.value) || 0 }))} className="bg-slate-800 border-slate-700" />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <input type="checkbox" id="isActive" checked={competitorForm.isActive} onChange={e => setCompetitorForm(f => ({ ...f, isActive: e.target.checked }))} className="w-4 h-4" />
                <Label htmlFor="isActive">פעיל</Label>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>חוזקות</Label>
                <Textarea value={competitorForm.swotStrengths} onChange={e => setCompetitorForm(f => ({ ...f, swotStrengths: e.target.value }))} className="bg-slate-800 border-slate-700 h-20" />
              </div>
              <div>
                <Label>חולשות</Label>
                <Textarea value={competitorForm.swotWeaknesses} onChange={e => setCompetitorForm(f => ({ ...f, swotWeaknesses: e.target.value }))} className="bg-slate-800 border-slate-700 h-20" />
              </div>
              <div>
                <Label>הזדמנויות</Label>
                <Textarea value={competitorForm.swotOpportunities} onChange={e => setCompetitorForm(f => ({ ...f, swotOpportunities: e.target.value }))} className="bg-slate-800 border-slate-700 h-20" />
              </div>
              <div>
                <Label>איומים</Label>
                <Textarea value={competitorForm.swotThreats} onChange={e => setCompetitorForm(f => ({ ...f, swotThreats: e.target.value }))} className="bg-slate-800 border-slate-700 h-20" />
              </div>
            </div>
            <Button
              onClick={() => {
                if (editingCompetitor) {
                  updateCompetitorMutation.mutate({ id: editingCompetitor.id, data: competitorForm });
                } else {
                  createCompetitorMutation.mutate(competitorForm);
                }
              }}
              disabled={!competitorForm.name || createCompetitorMutation.isPending || updateCompetitorMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {createCompetitorMutation.isPending || updateCompetitorMutation.isPending ? "שומר..." : editingCompetitor ? "עדכן" : "הוסף מתחרה"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={priceDialog} onOpenChange={setPriceDialog}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-md" dir="rtl">
          <DialogHeader><DialogTitle>הוסף השוואת מחיר</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div>
              <Label>קטגוריית מוצר</Label>
              <Input value={priceForm.productCategory} onChange={e => setPriceForm(f => ({ ...f, productCategory: e.target.value }))} className="bg-slate-800 border-slate-700" />
            </div>
            <div>
              <Label>שם מוצר</Label>
              <Input value={priceForm.productName} onChange={e => setPriceForm(f => ({ ...f, productName: e.target.value }))} className="bg-slate-800 border-slate-700" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>מחיר שלנו (₪)</Label>
                <Input type="number" value={priceForm.ourPrice} onChange={e => setPriceForm(f => ({ ...f, ourPrice: e.target.value }))} className="bg-slate-800 border-slate-700" />
              </div>
              <div>
                <Label>מחיר מתחרה (₪)</Label>
                <Input type="number" value={priceForm.competitorPrice} onChange={e => setPriceForm(f => ({ ...f, competitorPrice: e.target.value }))} className="bg-slate-800 border-slate-700" />
              </div>
            </div>
            <div>
              <Label>תאריך עדכון</Label>
              <Input type="date" value={priceForm.lastUpdated} onChange={e => setPriceForm(f => ({ ...f, lastUpdated: e.target.value }))} className="bg-slate-800 border-slate-700" />
            </div>
            <Button
              onClick={() => {
                if (!selectedCompetitorId) { toast({ title: "בחר מתחרה", variant: "destructive" }); return; }
                createPriceMutation.mutate({ ...priceForm, competitorId: selectedCompetitorId });
              }}
              disabled={!priceForm.productCategory || createPriceMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {createPriceMutation.isPending ? "שומר..." : "הוסף מחיר"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <BulkActions selectedIds={selectedIds} onClear={clear} entityName="מתחרים" actions={defaultBulkActions(selectedIds, clear, () => qc.invalidateQueries({ queryKey: ["competitors"] }), `${API}/competitors`)} />

      <ActivityLog entityType="competitors" />
    </div>
  );
}
