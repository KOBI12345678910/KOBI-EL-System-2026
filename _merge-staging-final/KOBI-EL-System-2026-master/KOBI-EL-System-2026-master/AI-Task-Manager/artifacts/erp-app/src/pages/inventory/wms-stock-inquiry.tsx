import { useState, useEffect, useCallback, useMemo } from "react";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Filter, X, Download, Package, MapPin, AlertCircle, Loader2, ChevronRight, ChevronLeft, RefreshCw } from "lucide-react";

export default function WmsStockInquiryPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 25;

  const [filters, setFilters] = useState({
    item_code: "",
    location_code: "",
    warehouse_id: "",
    batch_number: "",
    serial_number: "",
    lot_number: "",
    expiry_before: "",
    expiry_after: "",
  });

  const [applied, setApplied] = useState({ ...filters });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      Object.entries(applied).forEach(([k, v]) => { if (v) params.set(k, v); });
      const res = await authFetch(`/api/wms/stock-positions?${params}`);
      if (!res.ok) throw new Error("שגיאה בטעינת מלאי");
      const j = await res.json();
      setData(j.data || []);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
    setPage(1);
  }, [applied]);

  useEffect(() => { load(); }, [load]);

  const summary = useMemo(() => ({
    totalItems: data.length,
    totalQty: data.reduce((s, r) => s + parseFloat(r.quantity || 0), 0),
    totalValue: data.reduce((s, r) => s + parseFloat(r.total_value || 0), 0),
    expiringSoon: data.filter(r => r.expiry_date && new Date(r.expiry_date) < new Date(Date.now() + 30 * 86400000)).length,
  }), [data]);

  const totalPages = Math.ceil(data.length / perPage);
  const pageData = data.slice((page - 1) * perPage, page * perPage);

  const fmtNum = (n: number) => new Intl.NumberFormat("he-IL").format(n);
  const fmtCurrency = (n: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(n);

  const getExpiryBadge = (expiryDate: string) => {
    if (!expiryDate) return null;
    const days = Math.floor((new Date(expiryDate).getTime() - Date.now()) / 86400000);
    if (days < 0) return <Badge className="bg-red-500/20 text-red-300 border-0 text-[10px]">פג תוקף</Badge>;
    if (days <= 7) return <Badge className="bg-red-500/20 text-red-300 border-0 text-[10px]">{days} ימים</Badge>;
    if (days <= 30) return <Badge className="bg-orange-500/20 text-orange-300 border-0 text-[10px]">{days} ימים</Badge>;
    if (days <= 90) return <Badge className="bg-yellow-500/20 text-yellow-300 border-0 text-[10px]">{days} ימים</Badge>;
    return <Badge className="bg-green-500/20 text-green-300 border-0 text-[10px]">{new Date(expiryDate).toLocaleDateString("he-IL")}</Badge>;
  };

  return (
    <div className="p-6 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Search className="h-6 w-6 text-cyan-400" />
            בירור מלאי — Stock Inquiry
          </h1>
          <p className="text-sm text-muted-foreground mt-1">חיפוש מלאי לפי פריט, מיקום, לוט, מנה, מספר סריאלי ותפוגה</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} className="border-border text-gray-300 gap-1">
          <RefreshCw className="h-4 w-4" />רענן
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400">
          <AlertCircle className="h-4 w-4" /><span className="text-sm">{error}</span>
          <button onClick={() => setError("")} className="mr-auto"><X className="h-4 w-4" /></button>
        </div>
      )}

      <Card className="bg-card/80 border-border">
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            {[
              { key: "item_code", placeholder: "קוד פריט", icon: Package },
              { key: "location_code", placeholder: "קוד מיקום", icon: MapPin },
              { key: "batch_number", placeholder: "מספר מנה (batch)" },
              { key: "lot_number", placeholder: "מספר לוט (lot)" },
              { key: "serial_number", placeholder: "מספר סריאלי" },
              { key: "warehouse_id", placeholder: "מזהה מחסן" },
              { key: "expiry_after", placeholder: "תפוגה מ... (YYYY-MM-DD)", type: "date" },
              { key: "expiry_before", placeholder: "תפוגה עד... (YYYY-MM-DD)", type: "date" },
            ].map(({ key, placeholder, type }) => (
              <Input
                key={key}
                type={type || "text"}
                value={filters[key as keyof typeof filters]}
                onChange={e => setFilters(f => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder}
                className="bg-input border-border text-foreground text-sm h-9"
              />
            ))}
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => {
              const empty = { item_code: "", location_code: "", warehouse_id: "", batch_number: "", serial_number: "", lot_number: "", expiry_before: "", expiry_after: "" };
              setFilters(empty);
              setApplied(empty);
            }} className="text-gray-400 gap-1"><X className="h-3 w-3" />נקה</Button>
            <Button size="sm" onClick={() => setApplied({ ...filters })} className="bg-cyan-600 hover:bg-cyan-700 gap-1">
              <Filter className="h-3.5 w-3.5" />חפש
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "רשומות", value: fmtNum(summary.totalItems), color: "text-cyan-400" },
          { label: "כמות כוללת", value: fmtNum(Math.round(summary.totalQty)), color: "text-blue-400" },
          { label: "שווי כולל", value: fmtCurrency(summary.totalValue), color: "text-emerald-400" },
          { label: "פגי תוקף בקרוב", value: summary.expiringSoon.toString(), color: "text-orange-400" },
        ].map((kpi, i) => (
          <Card key={i} className="bg-card/80 border-border">
            <CardContent className="p-3">
              <p className="text-[11px] text-muted-foreground">{kpi.label}</p>
              <p className={`text-lg font-bold font-mono mt-1 ${kpi.color}`}>{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-card/80 border-border">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-background/50">
                  {["קוד פריט", "מחסן", "מיקום", "מנה/לוט", "מספר סריאלי", "כמות", "זמין", "עלות יחידה", "שווי", "תפוגה"].map(h => (
                    <th key={h} className="p-3 text-right text-muted-foreground font-medium text-xs">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={10} className="p-12 text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-cyan-400 mx-auto mb-2" />
                    <span className="text-muted-foreground">טוען...</span>
                  </td></tr>
                ) : pageData.length === 0 ? (
                  <tr><td colSpan={10} className="p-16 text-center">
                    <Package className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                    <p className="text-muted-foreground">אין תוצאות — נסה לשנות את הסינון</p>
                  </td></tr>
                ) : pageData.map(row => (
                  <tr key={row.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="p-3 font-mono text-xs text-blue-400">{row.item_code || row.item_id}</td>
                    <td className="p-3 text-xs text-muted-foreground">{row.warehouse_name || row.warehouse_id}</td>
                    <td className="p-3 font-mono text-xs text-cyan-400">{row.location_code || "-"}</td>
                    <td className="p-3 text-xs text-muted-foreground">{row.batch_number || row.lot_number || "-"}</td>
                    <td className="p-3 text-xs text-muted-foreground">{row.serial_number || "-"}</td>
                    <td className="p-3 font-mono text-foreground text-right">{fmtNum(parseFloat(row.quantity || 0))}</td>
                    <td className="p-3 font-mono text-green-400 text-right">{fmtNum(parseFloat(row.available_quantity || 0))}</td>
                    <td className="p-3 font-mono text-muted-foreground text-right">{row.unit_cost ? fmtCurrency(parseFloat(row.unit_cost)) : "-"}</td>
                    <td className="p-3 font-mono text-emerald-400 text-right">{row.total_value ? fmtCurrency(parseFloat(row.total_value)) : "-"}</td>
                    <td className="p-3">{getExpiryBadge(row.expiry_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-3 border-t border-border">
              <span className="text-sm text-muted-foreground">
                מציג {(page - 1) * perPage + 1}–{Math.min(page * perPage, data.length)} מתוך {data.length}
              </span>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="h-8 w-8 p-0"><ChevronRight className="h-4 w-4" /></Button>
                <span className="px-3 py-1 text-sm text-muted-foreground">{page} / {totalPages}</span>
                <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="h-8 w-8 p-0"><ChevronLeft className="h-4 w-4" /></Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
