import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Download, ChevronRight, ChevronLeft, TrendingUp, TrendingDown, AlertCircle, RefreshCw, BarChart3, X } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

const API = "/api";

interface SupplierScore {
  id: number;
  supplierName: string;
  supplierNumber: string;
  category: string;
  status: string;
  country: string | null;
  city: string | null;
  onTimeDeliveryPct: number;
  qualityRejectPct: number;
  priceCompetitivenessScore: number;
  responsivenessScore: number;
  overallScore: number;
  scoreStatus: "מצוין" | "טוב" | "בינוני" | "חלש";
  rating: number | null;
}

const STATUS_COLORS: Record<string, string> = {
  "מצוין": "bg-green-500/20 text-green-300 border-green-500/30",
  "טוב": "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "בינוני": "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  "חלש": "bg-red-500/20 text-red-300 border-red-500/30",
};

function ScoreBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="w-full bg-muted/50 rounded-full h-2 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${color}`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

function ScoreCell({ value, type }: { value: number; type: "pct" | "score" | "reject" }) {
  const color = type === "reject"
    ? (value <= 3 ? "text-green-400" : value <= 8 ? "text-yellow-400" : "text-red-400")
    : (value >= 80 ? "text-green-400" : value >= 60 ? "text-yellow-400" : "text-red-400");

  const barColor = type === "reject"
    ? (value <= 3 ? "bg-green-500" : value <= 8 ? "bg-yellow-500" : "bg-red-500")
    : (value >= 80 ? "bg-green-500" : value >= 60 ? "bg-yellow-500" : "bg-red-500");

  return (
    <div className="space-y-1 min-w-[70px]">
      <div className={`text-sm font-bold ${color}`}>{value}%</div>
      <ScoreBar value={type === "reject" ? 100 - value : value} color={barColor} />
    </div>
  );
}

interface SupplierDetail {
  supplier: { supplierName: string };
  kpis: {
    onTimeDeliveryPct: number;
    qualityRejectPct: number;
    priceCompetitivenessScore: number;
    responsivenessScore: number;
    overallScore: number;
  };
  evaluationHistory: Array<{
    overall_score: number;
    delivery_score: number;
    quality_score: number;
    pricing_score: number;
    evaluation_date: string;
  }>;
}

export default function SupplierScorecards() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState<keyof SupplierScore>("overallScore");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const perPage = 25;
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data: rawData, isLoading, refetch } = useQuery({
    queryKey: ["supplier-performance-scores"],
    queryFn: async () => {
      const r = await authFetch(`${API}/supplier-performance-scores`);
      return r.json();
    },
  });

  const { data: detailData } = useQuery<SupplierDetail>({
    queryKey: ["supplier-score-detail", selectedId],
    queryFn: async () => {
      const r = await authFetch(`${API}/supplier-performance-scores/${selectedId}`);
      return r.json();
    },
    enabled: !!selectedId,
  });

  const data: SupplierScore[] = Array.isArray(rawData) ? rawData : [];

  const filtered = useMemo(() => {
    let d = data.filter(r => {
      if (statusFilter !== "all" && r.scoreStatus !== statusFilter) return false;
      if (search && !r.supplierName.includes(search) && !r.supplierNumber.includes(search) && !(r.category || "").includes(search)) return false;
      return true;
    });
    d.sort((a, b) => {
      const va = a[sortKey] as number;
      const vb = b[sortKey] as number;
      return sortDir === "desc" ? (vb - va) : (va - vb);
    });
    return d;
  }, [data, search, statusFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageData = filtered.slice((page - 1) * perPage, page * perPage);

  const stats = useMemo(() => ({
    "מצוין": data.filter(r => r.scoreStatus === "מצוין").length,
    "טוב": data.filter(r => r.scoreStatus === "טוב").length,
    "בינוני": data.filter(r => r.scoreStatus === "בינוני").length,
    "חלש": data.filter(r => r.scoreStatus === "חלש").length,
  }), [data]);

  const avgOverall = data.length ? Math.round(data.reduce((s, r) => s + r.overallScore, 0) / data.length) : 0;
  const avgDelivery = data.length ? Math.round(data.reduce((s, r) => s + r.onTimeDeliveryPct, 0) / data.length) : 0;

  function toggleSort(key: keyof SupplierScore) {
    if (sortKey === key) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
    setPage(1);
  }

  function downloadCSV() {
    const header = ["ספק", "מספר ספק", "קטגוריה", "משלוח בזמן %", "דחיות איכות %", "מחיר תחרותי %", "היענות %", "ציון כולל", "סטטוס"];
    const rows = filtered.map(r => [r.supplierName, r.supplierNumber, r.category, r.onTimeDeliveryPct, r.qualityRejectPct, r.priceCompetitivenessScore, r.responsivenessScore, r.overallScore, r.scoreStatus]);
    const csv = [header, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "supplier-scorecards.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">כרטיסי ציון ספקים</h1>
          <p className="text-sm text-muted-foreground mt-1">ניתוח ביצועים אוטומטי • {data.length} ספקים</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 ml-1" />רענן
          </Button>
          <Button variant="outline" size="sm" onClick={downloadCSV}>
            <Download className="w-4 h-4 ml-1" />ייצוא
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        {(["מצוין", "טוב", "בינוני", "חלש"] as const).map(s => (
          <Card key={s} className="bg-card/50 border-border/50 cursor-pointer hover:border-border transition" onClick={() => { setStatusFilter(statusFilter === s ? "all" : s); setPage(1); }}>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-foreground">{stats[s]}</div>
              <Badge className={`${STATUS_COLORS[s]} mt-1 border`}>{s}</Badge>
            </CardContent>
          </Card>
        ))}
        <Card className="bg-card/50 border-border/50 col-span-1">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-400">{avgOverall}%</div>
            <div className="text-xs text-muted-foreground mt-1">ממוצע כולל</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50 col-span-1">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-400">{avgDelivery}%</div>
            <div className="text-xs text-muted-foreground mt-1">ממוצע משלוח</div>
          </CardContent>
        </Card>
      </div>

      {selectedId && detailData && (
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-foreground">{detailData.supplier?.supplierName}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">מגמת ביצועים לאורך זמן</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            {(detailData.evaluationHistory || []).length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                אין נתוני הערכה היסטוריים — ציונים ייאגרו לאחר ביצוע הערכות דוריות
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart
                  data={(detailData.evaluationHistory || []).slice().reverse().map(h => ({
                    date: h.evaluation_date ? new Date(h.evaluation_date).toLocaleDateString("he-IL") : "",
                    "ציון כולל": Number(h.overall_score) || 0,
                    "משלוח": Number(h.delivery_score) || 0,
                    "איכות": Number(h.quality_score) || 0,
                    "מחיר": Number(h.pricing_score) || 0,
                  }))}
                  margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
                    labelStyle={{ color: "#e2e8f0" }}
                    itemStyle={{ color: "#94a3b8" }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: "#94a3b8" }} />
                  <Line type="monotone" dataKey="ציון כולל" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="משלוח" stroke="#22c55e" strokeWidth={1.5} dot={false} />
                  <Line type="monotone" dataKey="איכות" stroke="#f59e0b" strokeWidth={1.5} dot={false} />
                  <Line type="monotone" dataKey="מחיר" stroke="#a855f7" strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-4 border-t border-border/50">
              {[
                { label: "משלוח בזמן", value: detailData.kpis?.onTimeDeliveryPct, color: "text-green-400" },
                { label: "דחיות איכות", value: detailData.kpis?.qualityRejectPct, color: "text-yellow-400" },
                { label: "מחיר תחרותי", value: detailData.kpis?.priceCompetitivenessScore, color: "text-purple-400" },
                { label: "ציון כולל", value: detailData.kpis?.overallScore, color: "text-blue-400" },
              ].map(m => (
                <div key={m.label} className="text-center">
                  <div className={`text-xl font-bold ${m.color}`}>{m.value ?? "—"}%</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{m.label}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="חיפוש ספק..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                className="pr-9 bg-background/50"
              />
            </div>
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
              className="bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground"
            >
              <option value="all">כל הציונים</option>
              {(["מצוין", "טוב", "בינוני", "חלש"] as const).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {isLoading ? (
            <div className="text-center py-16">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-muted-foreground">מחשב ציונים...</p>
            </div>
          ) : pageData.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-lg font-medium">אין נתונים להצגה</p>
              <p className="text-sm mt-1">הוסף ספקים ופעולות רכש כדי לראות ניתוח ביצועים</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-right p-3 text-muted-foreground font-medium">ספק</th>
                    <th className="text-right p-3 text-muted-foreground font-medium cursor-pointer hover:text-foreground" onClick={() => toggleSort("onTimeDeliveryPct")}>
                      <span className="flex items-center gap-1">משלוח בזמן <BarChart3 className="w-3 h-3" /></span>
                    </th>
                    <th className="text-right p-3 text-muted-foreground font-medium cursor-pointer hover:text-foreground" onClick={() => toggleSort("qualityRejectPct")}>
                      <span className="flex items-center gap-1">דחיות איכות <BarChart3 className="w-3 h-3" /></span>
                    </th>
                    <th className="text-right p-3 text-muted-foreground font-medium cursor-pointer hover:text-foreground" onClick={() => toggleSort("priceCompetitivenessScore")}>
                      <span className="flex items-center gap-1">מחיר תחרותי <BarChart3 className="w-3 h-3" /></span>
                    </th>
                    <th className="text-right p-3 text-muted-foreground font-medium cursor-pointer hover:text-foreground" onClick={() => toggleSort("responsivenessScore")}>
                      <span className="flex items-center gap-1">היענות <BarChart3 className="w-3 h-3" /></span>
                    </th>
                    <th className="text-center p-3 text-muted-foreground font-medium cursor-pointer hover:text-foreground" onClick={() => toggleSort("overallScore")}>
                      <span className="flex items-center justify-center gap-1">ציון כולל {sortKey === "overallScore" && (sortDir === "desc" ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />)}</span>
                    </th>
                    <th className="text-center p-3 text-muted-foreground font-medium">סטטוס</th>
                  </tr>
                </thead>
                <tbody>
                  {pageData.map((row) => (
                    <tr
                      key={row.id}
                      className={`border-b border-border/30 hover:bg-card/30 transition-colors cursor-pointer ${selectedId === row.id ? "bg-blue-500/10" : ""}`}
                      onClick={() => setSelectedId(selectedId === row.id ? null : row.id)}
                    >
                      <td className="p-3">
                        <div className="font-medium text-foreground">{row.supplierName}</div>
                        <div className="text-xs text-muted-foreground">{row.supplierNumber} • {row.category}</div>
                        {row.country && <div className="text-xs text-muted-foreground">{row.country}</div>}
                      </td>
                      <td className="p-3"><ScoreCell value={row.onTimeDeliveryPct} type="pct" /></td>
                      <td className="p-3"><ScoreCell value={row.qualityRejectPct} type="reject" /></td>
                      <td className="p-3"><ScoreCell value={row.priceCompetitivenessScore} type="score" /></td>
                      <td className="p-3"><ScoreCell value={row.responsivenessScore} type="score" /></td>
                      <td className="p-3 text-center">
                        <div className={`text-lg font-bold ${row.overallScore >= 80 ? "text-green-400" : row.overallScore >= 60 ? "text-yellow-400" : "text-red-400"}`}>
                          {row.overallScore}
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        <Badge className={`${STATUS_COLORS[row.scoreStatus]} border text-xs`}>{row.scoreStatus}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
            <span>מציג {Math.min(filtered.length, (page-1)*perPage+1)}-{Math.min(filtered.length, page*perPage)} מתוך {filtered.length}</span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page<=1} onClick={() => setPage(p=>p-1)}><ChevronRight className="w-4 h-4" /></Button>
              <span className="px-3 py-1">{page}/{totalPages}</span>
              <Button variant="outline" size="sm" disabled={page>=totalPages} onClick={() => setPage(p=>p+1)}><ChevronLeft className="w-4 h-4" /></Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
