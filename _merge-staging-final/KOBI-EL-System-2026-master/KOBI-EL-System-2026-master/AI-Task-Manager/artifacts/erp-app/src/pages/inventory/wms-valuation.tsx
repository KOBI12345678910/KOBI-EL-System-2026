import { useState, useEffect, useCallback } from "react";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Scale, TrendingUp, Settings2, RefreshCw, X, AlertCircle, Loader2, BarChart3, ArrowUpDown } from "lucide-react";

const METHODS: { v: string; label: string; desc: string; color: string }[] = [
  { v: "fifo", label: "FIFO", desc: "First In, First Out — נכנס ראשון יוצא ראשון", color: "text-blue-400" },
  { v: "lifo", label: "LIFO", desc: "Last In, First Out — נכנס אחרון יוצא ראשון", color: "text-purple-400" },
  { v: "weighted_average", label: "ממוצע משוקלל", desc: "Weighted Average Cost", color: "text-cyan-400" },
  { v: "specific_identification", label: "זיהוי ספציפי", desc: "Specific Identification", color: "text-emerald-400" },
];

export default function WmsValuationPage() {
  const [data, setData] = useState<any[]>([]);
  const [totals, setTotals] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedMethod, setSelectedMethod] = useState("weighted_average");
  const [warehouseId, setWarehouseId] = useState("");
  const [itemCode, setItemCode] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<any[]>([]);
  const [newMethod, setNewMethod] = useState("weighted_average");
  const [newItemCode, setNewItemCode] = useState("");
  const [newIsGlobal, setNewIsGlobal] = useState(false);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ method: selectedMethod });
      if (warehouseId) params.set("warehouse_id", warehouseId);
      if (itemCode) params.set("item_code", itemCode);
      const res = await authFetch(`/api/wms/valuation-report?${params}`);
      if (!res.ok) throw new Error("שגיאה בטעינת דוח הערכה");
      const j = await res.json();
      setData(j.data || []);
      setTotals(j.totals);
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }, [selectedMethod, warehouseId, itemCode]);

  const loadSettings = useCallback(async () => {
    try {
      const res = await authFetch("/api/wms/valuation-settings");
      if (res.ok) { const j = await res.json(); setSettings(j.data || []); }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (showSettings) loadSettings(); }, [showSettings, loadSettings]);

  const saveValuationSetting = async () => {
    try {
      await authFetch("/api/wms/valuation-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_code: newItemCode || undefined, valuation_method: newMethod, is_global: newIsGlobal }),
      });
      setNewItemCode(""); setNewIsGlobal(false);
      await loadSettings();
    } catch { /* ignore */ }
  };

  const fmt = (n: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(n);
  const fmtNum = (n: number) => new Intl.NumberFormat("he-IL").format(Math.round(n * 100) / 100);

  const sorted = [...data].sort((a, b) => {
    const av = parseFloat(a.selected_value) || 0;
    const bv = parseFloat(b.selected_value) || 0;
    return sortDir === "desc" ? bv - av : av - bv;
  });

  return (
    <div className="p-6 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Scale className="h-6 w-6 text-emerald-400" />
            הערכת מלאי — Inventory Valuation
          </h1>
          <p className="text-sm text-muted-foreground mt-1">דוח ערך מלאי בשיטות FIFO, LIFO, ממוצע משוקלל וזיהוי ספציפי</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowSettings(!showSettings)} className="border-border text-gray-300 gap-1">
            <Settings2 className="h-4 w-4" />הגדרות שיטה
          </Button>
          <Button variant="outline" size="sm" onClick={load} className="border-border text-gray-300 gap-1">
            <RefreshCw className="h-4 w-4" />רענן
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400">
          <AlertCircle className="h-4 w-4" /><span className="text-sm">{error}</span>
          <button onClick={() => setError("")} className="mr-auto"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {METHODS.map(m => (
          <button
            key={m.v}
            onClick={() => setSelectedMethod(m.v)}
            className={`text-right p-4 rounded-xl border transition-all ${selectedMethod === m.v ? "border-blue-500 bg-blue-500/10" : "border-border bg-card/80 hover:border-border"}`}
          >
            <p className={`text-lg font-bold font-mono ${m.color}`}>{m.label}</p>
            <p className="text-xs text-muted-foreground mt-1">{m.desc}</p>
            {totals && (
              <p className="text-sm font-mono text-foreground mt-2">
                {m.v === "fifo" ? fmt(totals.fifo_total || 0) :
                 m.v === "lifo" ? fmt(totals.lifo_total || 0) :
                 m.v === "weighted_average" ? fmt(totals.weighted_avg_total || 0) :
                 fmt(totals.selected_total || 0)}
              </p>
            )}
          </button>
        ))}
      </div>

      <Card className="bg-card/60 border-border">
        <CardContent className="p-3">
          <div className="flex flex-wrap gap-3 items-center">
            <Input
              value={itemCode}
              onChange={e => setItemCode(e.target.value)}
              placeholder="סינון לפי קוד פריט"
              className="bg-input border-border text-foreground h-9 w-48"
            />
            <Input
              value={warehouseId}
              onChange={e => setWarehouseId(e.target.value)}
              placeholder="מזהה מחסן"
              className="bg-input border-border text-foreground h-9 w-32"
              type="number"
            />
            <Button size="sm" onClick={load} className="bg-emerald-600 hover:bg-emerald-700 gap-1">
              <BarChart3 className="h-3.5 w-3.5" />עדכן דוח
            </Button>
          </div>
        </CardContent>
      </Card>

      {showSettings && (
        <Card className="bg-card/80 border-border">
          <CardContent className="p-4 space-y-4">
            <h3 className="text-sm font-semibold text-blue-400">הגדרות שיטת הערכה לפריטים</h3>
            <div className="flex gap-3 flex-wrap items-end">
              <div>
                <label className="text-xs text-muted-foreground">קוד פריט (ריק = גלובלי)</label>
                <Input value={newItemCode} onChange={e => setNewItemCode(e.target.value)} placeholder="כל הפריטים" className="bg-input border-border text-foreground h-9 mt-1 w-40" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">שיטת הערכה</label>
                <select value={newMethod} onChange={e => setNewMethod(e.target.value)} className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1 h-9">
                  {METHODS.map(m => <option key={m.v} value={m.v}>{m.label}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer mb-1">
                <input type="checkbox" checked={newIsGlobal} onChange={e => setNewIsGlobal(e.target.checked)} />
                גלובלי (לכל הפריטים)
              </label>
              <Button size="sm" onClick={saveValuationSetting} className="bg-blue-600 hover:bg-blue-700">שמור הגדרה</Button>
            </div>
            {settings.length > 0 && (
              <div className="space-y-1">
                {settings.map(s => (
                  <div key={s.id} className="flex items-center gap-3 bg-background/60 rounded p-2 text-sm">
                    <Badge className={`border-0 text-[10px] ${s.is_global ? "bg-purple-500/20 text-purple-300" : "bg-blue-500/20 text-blue-300"}`}>
                      {s.is_global ? "גלובלי" : s.item_code || `#${s.item_id}`}
                    </Badge>
                    <span className="text-muted-foreground">{METHODS.find(m => m.v === s.valuation_method)?.label || s.valuation_method}</span>
                    <span className="text-xs text-muted-foreground mr-auto">{s.warehouse_name || "כל המחסנים"}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="bg-card/80 border-border">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-background/50">
                  <th className="p-3 text-right text-muted-foreground font-medium text-xs">קוד פריט</th>
                  <th className="p-3 text-right text-muted-foreground font-medium text-xs">מחסן</th>
                  <th className="p-3 text-right text-muted-foreground font-medium text-xs">כמות</th>
                  <th className="p-3 text-right text-muted-foreground font-medium text-xs">עלות ממוצעת</th>
                  <th className="p-3 text-right text-muted-foreground font-medium text-xs">FIFO</th>
                  <th className="p-3 text-right text-muted-foreground font-medium text-xs">LIFO</th>
                  <th className="p-3 text-right text-muted-foreground font-medium text-xs">ממוצע משוקלל</th>
                  <th className="p-3 text-right text-muted-foreground font-medium text-xs cursor-pointer" onClick={() => setSortDir(d => d === "asc" ? "desc" : "asc")}>
                    <span className="flex items-center gap-1">שיטה נבחרת<ArrowUpDown className="h-3 w-3" /></span>
                  </th>
                  <th className="p-3 text-right text-muted-foreground font-medium text-xs">עלות מכר (COGS)</th>
                  <th className="p-3 text-right text-muted-foreground font-medium text-xs">שיטה שנבחרה</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={10} className="p-12 text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-emerald-400 mx-auto mb-2" />
                    <span className="text-muted-foreground">מחשב הערכה...</span>
                  </td></tr>
                ) : sorted.length === 0 ? (
                  <tr><td colSpan={10} className="p-16 text-center">
                    <Scale className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                    <p className="text-muted-foreground">אין נתוני מלאי להערכה</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">הוסף עסקאות מלאי לטבלת stock_ledger כדי לראות הערכה</p>
                  </td></tr>
                ) : sorted.map(row => (
                  <tr key={`${row.item_id}-${row.warehouse_id}`} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="p-3 font-mono text-xs text-blue-400">{row.item_code}</td>
                    <td className="p-3 text-xs text-muted-foreground">{row.warehouse_name || "-"}</td>
                    <td className="p-3 font-mono text-foreground text-right">{fmtNum(parseFloat(row.quantity || 0))}</td>
                    <td className="p-3 font-mono text-muted-foreground text-right">{fmt(parseFloat(row.avg_unit_cost || 0))}</td>
                    <td className="p-3 font-mono text-blue-400 text-right">{fmt(parseFloat(row.fifo_value || 0))}</td>
                    <td className="p-3 font-mono text-purple-400 text-right">{fmt(parseFloat(row.lifo_value || 0))}</td>
                    <td className="p-3 font-mono text-cyan-400 text-right">{fmt(parseFloat(row.weighted_avg_value || 0))}</td>
                    <td className="p-3 font-mono text-emerald-400 font-bold text-right">{fmt(parseFloat(row.selected_value || 0))}</td>
                    <td className="p-3 font-mono text-orange-400 text-right">{fmt(parseFloat(row.cogs?.selected || 0))}</td>
                    <td className="p-3">
                      <Badge className="border-0 text-[10px] bg-emerald-500/20 text-emerald-300">
                        {METHODS.find(m => m.v === row.selected_method)?.label || row.selected_method}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
              {totals && sorted.length > 0 && (
                <tfoot>
                  <tr className="border-t border-border bg-background/50 font-bold">
                    <td className="p-3 text-xs text-muted-foreground" colSpan={4}>סה"כ ({totals.item_count} פריטים)</td>
                    <td className="p-3 font-mono text-blue-400 text-right">{fmt(totals.fifo_total || 0)}</td>
                    <td className="p-3 font-mono text-purple-400 text-right">{fmt(totals.lifo_total || 0)}</td>
                    <td className="p-3 font-mono text-cyan-400 text-right">{fmt(totals.weighted_avg_total || 0)}</td>
                    <td className="p-3 font-mono text-emerald-400 text-right">{fmt(totals.selected_total || 0)}</td>
                    <td className="p-3 font-mono text-orange-400 text-right">{fmt(sorted.reduce((s: number, r: any) => s + (parseFloat(r.cogs?.selected) || 0), 0))}</td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
