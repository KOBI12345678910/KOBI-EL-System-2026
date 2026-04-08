import { useState, useEffect, useCallback } from "react";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Clock, RefreshCw, X, AlertCircle, Loader2, Package, MapPin, Settings2, Bell, ChevronRight, ChevronLeft } from "lucide-react";

export default function WmsExpiryDashboardPage() {
  const [data, setData] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [daysAhead, setDaysAhead] = useState("90");
  const [warehouseId, setWarehouseId] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [showAlertSettings, setShowAlertSettings] = useState(false);
  const [alertSettings, setAlertSettings] = useState<any[]>([]);
  const [newAlertDays, setNewAlertDays] = useState("30");
  const [newAlertCode, setNewAlertCode] = useState("");
  const [newAlertGlobal, setNewAlertGlobal] = useState(false);
  const perPage = 25;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ days_ahead: daysAhead });
      if (warehouseId) params.set("warehouse_id", warehouseId);
      const res = await authFetch(`/api/wms/expiry-dashboard?${params}`);
      if (!res.ok) throw new Error("שגיאה בטעינת דשבורד תפוגה");
      const j = await res.json();
      setData(j.data || []);
      setSummary(j.summary);
    } catch (e: any) { setError(e.message); }
    setLoading(false);
    setPage(1);
  }, [daysAhead, warehouseId]);

  const loadAlertSettings = useCallback(async () => {
    try {
      const res = await authFetch("/api/wms/expiry-alert-settings");
      if (res.ok) { const j = await res.json(); setAlertSettings(j.data || []); }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (showAlertSettings) loadAlertSettings(); }, [showAlertSettings, loadAlertSettings]);

  const saveAlertSetting = async () => {
    try {
      await authFetch("/api/wms/expiry-alert-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_code: newAlertCode || undefined, alert_days_before: parseInt(newAlertDays), is_global: newAlertGlobal }),
      });
      setNewAlertCode(""); setNewAlertGlobal(false);
      await loadAlertSettings();
    } catch { /* ignore */ }
  };

  const filteredData = data.filter(r => filter === "all" || r.expiry_status === filter);
  const totalPages = Math.ceil(filteredData.length / perPage);
  const pageData = filteredData.slice((page - 1) * perPage, page * perPage);

  const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
    expired: { label: "פג תוקף", color: "text-red-400", bg: "bg-red-500/20" },
    critical: { label: "קריטי (≤7 ימים)", color: "text-red-300", bg: "bg-red-500/10" },
    warning: { label: "אזהרה (≤30 ימים)", color: "text-orange-400", bg: "bg-orange-500/20" },
    approaching: { label: "מתקרב (≤90 ימים)", color: "text-yellow-400", bg: "bg-yellow-500/20" },
    ok: { label: "תקין", color: "text-green-400", bg: "bg-green-500/20" },
  };

  const fmtCurrency = (n: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(n);

  return (
    <div className="p-6 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-orange-400" />
            ניהול תפוגה — Expiry Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">מעקב אחר פריטים הקרובים לתפוגה עם התראות מוגדרות</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowAlertSettings(!showAlertSettings)} className="border-border text-gray-300 gap-1">
            <Bell className="h-4 w-4" />הגדרות התראות
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

      <Card className="bg-card/60 border-border">
        <CardContent className="p-3">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">ימים קדימה:</label>
              <select value={daysAhead} onChange={e => setDaysAhead(e.target.value)} className="bg-input border border-border rounded-md px-3 py-1.5 text-sm text-foreground">
                {[7, 14, 30, 60, 90, 180].map(d => <option key={d} value={d}>{d} ימים</option>)}
              </select>
            </div>
            <Input
              value={warehouseId}
              onChange={e => setWarehouseId(e.target.value)}
              placeholder="מזהה מחסן"
              className="bg-input border-border text-foreground h-8 w-28 text-sm"
              type="number"
            />
            <Button size="sm" onClick={load} className="bg-orange-600 hover:bg-orange-700">עדכן</Button>
          </div>
        </CardContent>
      </Card>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { key: "expired", label: "פג תוקף", color: "text-red-400" },
            { key: "critical", label: "קריטי", color: "text-red-300" },
            { key: "warning", label: "אזהרה", color: "text-orange-400" },
            { key: "approaching", label: "מתקרב", color: "text-yellow-400" },
            { key: "total_value_at_risk", label: "שווי בסיכון", color: "text-purple-400", isCurrency: true },
          ].map(({ key, label, color, isCurrency }) => (
            <Card
              key={key}
              className={`bg-card/80 border-border cursor-pointer hover:border-border transition-colors ${filter === key ? "border-orange-500/50" : ""}`}
              onClick={() => { setFilter(filter === key ? "all" : key); setPage(1); }}
            >
              <CardContent className="p-3">
                <p className="text-[11px] text-muted-foreground">{label}</p>
                <p className={`text-xl font-bold font-mono mt-1 ${color}`}>
                  {isCurrency ? fmtCurrency(summary[key] || 0) : (summary[key] || 0)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showAlertSettings && (
        <Card className="bg-card/80 border-border">
          <CardContent className="p-4 space-y-4">
            <h3 className="text-sm font-semibold text-orange-400 flex items-center gap-2"><Bell className="h-4 w-4" />הגדרות התראות תפוגה</h3>
            <div className="flex gap-3 flex-wrap items-end">
              <div>
                <label className="text-xs text-muted-foreground">קוד פריט (ריק = גלובלי)</label>
                <Input value={newAlertCode} onChange={e => setNewAlertCode(e.target.value)} placeholder="כל הפריטים" className="bg-input border-border text-foreground h-9 mt-1 w-40" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">ימי התראה מראש</label>
                <Input value={newAlertDays} onChange={e => setNewAlertDays(e.target.value)} type="number" className="bg-input border-border text-foreground h-9 mt-1 w-24" />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer mb-1">
                <input type="checkbox" checked={newAlertGlobal} onChange={e => setNewAlertGlobal(e.target.checked)} />
                גלובלי
              </label>
              <Button size="sm" onClick={saveAlertSetting} className="bg-orange-600 hover:bg-orange-700">שמור</Button>
            </div>
            {alertSettings.length > 0 && (
              <div className="space-y-1">
                {alertSettings.map(s => (
                  <div key={s.id} className="flex items-center gap-3 bg-background/60 rounded p-2 text-sm">
                    <Badge className={`border-0 text-[10px] ${s.is_global ? "bg-purple-500/20 text-purple-300" : "bg-orange-500/20 text-orange-300"}`}>
                      {s.is_global ? "גלובלי" : s.item_code || `#${s.item_id}`}
                    </Badge>
                    <span className="text-muted-foreground">{s.alert_days_before} ימים לפני תפוגה</span>
                    <span className="text-xs text-muted-foreground mr-auto">{s.is_active ? "פעיל" : "לא פעיל"}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2 flex-wrap">
        {["all", "expired", "critical", "warning", "approaching"].map(f => (
          <button
            key={f}
            onClick={() => { setFilter(f); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${filter === f ? "border-orange-500 bg-orange-500/10 text-orange-300" : "border-border text-gray-400 hover:border-orange-500/30"}`}
          >
            {f === "all" ? "הכל" : STATUS_CONFIG[f]?.label || f}
            {summary && f !== "all" && <span className="mr-1.5 font-mono">({summary[f] || 0})</span>}
          </button>
        ))}
      </div>

      <Card className="bg-card/80 border-border">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-background/50">
                  {["קוד פריט", "מחסן", "מיקום", "מנה/לוט", "כמות", "עלות יחידה", "שווי", "תאריך תפוגה", "ימים נותרים", "סטטוס"].map(h => (
                    <th key={h} className="p-3 text-right text-muted-foreground font-medium text-xs">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={10} className="p-12 text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-orange-400 mx-auto mb-2" />
                    <span className="text-muted-foreground">טוען...</span>
                  </td></tr>
                ) : pageData.length === 0 ? (
                  <tr><td colSpan={10} className="p-16 text-center">
                    <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                    <p className="text-muted-foreground">
                      {filter !== "all" ? `אין פריטים בסטטוס "${STATUS_CONFIG[filter]?.label}"` : `אין פריטים הפגים בתוך ${daysAhead} הימים הקרובים`}
                    </p>
                  </td></tr>
                ) : pageData.map(row => {
                  const cfg = STATUS_CONFIG[row.expiry_status] || STATUS_CONFIG.ok;
                  return (
                    <tr key={row.id} className={`border-b border-border/50 hover:bg-muted/30 ${row.expiry_status === "expired" ? "opacity-70" : ""}`}>
                      <td className="p-3 font-mono text-xs text-blue-400">{row.item_code || row.item_id}</td>
                      <td className="p-3 text-xs text-muted-foreground">{row.warehouse_name || "-"}</td>
                      <td className="p-3 font-mono text-xs text-cyan-400">{row.location_code || [row.zone, row.aisle, row.shelf, row.bin].filter(Boolean).join("-") || "-"}</td>
                      <td className="p-3 text-xs text-muted-foreground">{row.batch_number || row.lot_number || "-"}</td>
                      <td className="p-3 font-mono text-foreground text-right">{parseFloat(row.quantity || 0)}</td>
                      <td className="p-3 font-mono text-muted-foreground text-right">{row.unit_cost ? new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS" }).format(parseFloat(row.unit_cost)) : "-"}</td>
                      <td className="p-3 font-mono text-emerald-400 text-right">{row.total_value ? fmtCurrency(parseFloat(row.total_value)) : "-"}</td>
                      <td className="p-3 text-xs font-mono">{row.expiry_date ? new Date(row.expiry_date).toLocaleDateString("he-IL") : "-"}</td>
                      <td className="p-3 text-center">
                        <span className={`font-mono text-sm font-bold ${parseInt(row.days_until_expiry) < 0 ? "text-red-400" : parseInt(row.days_until_expiry) <= 7 ? "text-red-300" : parseInt(row.days_until_expiry) <= 30 ? "text-orange-400" : "text-yellow-400"}`}>
                          {row.days_until_expiry}
                        </span>
                      </td>
                      <td className="p-3">
                        <Badge className={`border-0 text-[10px] ${cfg.bg} ${cfg.color}`}>{cfg.label}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-3 border-t border-border">
              <span className="text-sm text-muted-foreground">
                מציג {(page - 1) * perPage + 1}–{Math.min(page * perPage, filteredData.length)} מתוך {filteredData.length}
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
