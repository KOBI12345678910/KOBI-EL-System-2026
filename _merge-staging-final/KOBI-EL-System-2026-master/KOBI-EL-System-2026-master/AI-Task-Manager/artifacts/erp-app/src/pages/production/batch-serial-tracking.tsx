import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Search, Package, Hash, Calendar, MapPin, ShieldCheck, User, Link2,
  X, Download, RefreshCw, Eye, ChevronLeft, ChevronRight, Layers,
  ChevronsUpDown, AlertTriangle, CheckCircle, Clock, Tag, BoxesIcon,
  ArrowDownUp
} from "lucide-react";
import { authFetch } from "@/lib/utils";

const API = "/api/production-sap";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);

const qualityStatusMap: Record<string, { label: string; color: string }> = {
  passed: { label: "עבר", color: "bg-green-500/20 text-green-400" },
  pending: { label: "ממתין", color: "bg-yellow-500/20 text-yellow-400" },
  failed: { label: "נכשל", color: "bg-red-500/20 text-red-400" },
  quarantine: { label: "הסגר", color: "bg-orange-500/20 text-orange-400" },
  released: { label: "שוחרר", color: "bg-blue-500/20 text-blue-400" },
};

const serialStatusMap: Record<string, { label: string; color: string }> = {
  active: { label: "פעיל", color: "bg-green-500/20 text-green-400" },
  in_stock: { label: "במלאי", color: "bg-blue-500/20 text-blue-400" },
  sold: { label: "נמכר", color: "bg-purple-500/20 text-purple-400" },
  returned: { label: "הוחזר", color: "bg-orange-500/20 text-orange-400" },
  warranty: { label: "באחריות", color: "bg-cyan-500/20 text-cyan-400" },
  defective: { label: "פגום", color: "bg-red-500/20 text-red-400" },
  scrapped: { label: "גרוטאה", color: "bg-gray-500/20 text-gray-400" },
};

export default function BatchSerialTrackingPage() {
  const [activeTab, setActiveTab] = useState<"batches" | "serials">("batches");
  const [batches, setBatches] = useState<any[]>([]);
  const [serials, setSerials] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortField, setSortField] = useState("production_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [viewDetail, setViewDetail] = useState<any>(null);
  const [viewTrace, setViewTrace] = useState<any>(null);
  const perPage = 25;

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [bRes, sRes, stRes] = await Promise.all([
        authFetch(`${API}/batches`),
        authFetch(`${API}/serial-numbers`),
        authFetch(`${API}/batch-serial-stats`),
      ]);
      if (bRes.ok) setBatches(safeArray(await bRes.json()));
      if (sRes.ok) setSerials(safeArray(await sRes.json()));
      if (stRes.ok) setStats((await stRes.json()) || {});
    } catch (e: any) {
      setError(e.message || "שגיאה בטעינת נתונים");
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const currentData = activeTab === "batches" ? batches : serials;
  const currentStatusMap = activeTab === "batches" ? qualityStatusMap : serialStatusMap;
  const statusField = activeTab === "batches" ? "quality_status" : "status";

  const filtered = useMemo(() => {
    let data = currentData.filter(r =>
      (filterStatus === "all" || r[statusField] === filterStatus) &&
      (!search || [
        r.batch_number, r.serial_number, r.product_name, r.product_code,
        r.customer_name, r.location
      ].some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? "";
      const vb = b[sortField] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return data;
  }, [currentData, search, filterStatus, sortField, sortDir, activeTab]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paged = filtered.slice((page - 1) * perPage, page * perPage);
  const SI = () => <ChevronsUpDown className="h-3 w-3 opacity-40" />;

  const loadTrace = async (type: string, number: string) => {
    try {
      const res = await authFetch(`${API}/traceability?type=${type}&number=${encodeURIComponent(number)}`);
      if (res.ok) {
        const data = await res.json();
        setViewTrace({ type, number, chain: safeArray(data) });
      }
    } catch {}
  };

  const kpis = [
    { label: "אצוות פעילות", value: stats.active_batches || batches.length, color: "text-blue-400", icon: Layers },
    { label: "מספרים סידוריים", value: stats.total_serials || serials.length, color: "text-cyan-400", icon: Hash },
    { label: "בהסגר", value: stats.quarantine_count || 0, color: "text-orange-400", icon: AlertTriangle },
    { label: "שיעור תקינות", value: stats.pass_rate ? `${Number(stats.pass_rate).toFixed(1)}%` : "—", color: "text-green-400", icon: CheckCircle },
  ];

  return (
    <div className="p-6 space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Tag className="h-6 w-6 text-cyan-400" />
            מעקב אצוות ומספרים סידוריים
          </h1>
          <p className="text-sm text-muted-foreground mt-1">מעקב אצוות ייצור, מספרים סידוריים ושרשרת עקיבות</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="border-border text-gray-300 gap-1">
            <Download className="h-4 w-4" />ייצוא
          </Button>
          <Button variant="outline" size="sm" onClick={load} className="border-border text-gray-300 gap-1">
            <RefreshCw className="h-4 w-4" />רענן
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />{error}
          <Button variant="ghost" size="sm" onClick={() => setError(null)} className="mr-auto text-red-400"><X className="h-3 w-3" /></Button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((k, i) => (
          <Card key={i} className="bg-card/80 border-border hover:border-border transition-colors">
            <CardContent className="p-4">
              {loading ? (
                <div className="space-y-2 animate-pulse">
                  <div className="h-3 w-16 bg-muted rounded" />
                  <div className="h-6 w-20 bg-muted rounded" />
                </div>
              ) : (
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[11px] text-muted-foreground">{k.label}</p>
                    <p className={`text-lg font-bold font-mono mt-1 ${k.color}`}>
                      {typeof k.value === "number" ? k.value.toLocaleString("he-IL") : k.value}
                    </p>
                  </div>
                  <k.icon className={`h-5 w-5 ${k.color} opacity-50`} />
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-input p-1 rounded-lg w-fit">
        <Button
          variant={activeTab === "batches" ? "default" : "ghost"}
          size="sm"
          onClick={() => { setActiveTab("batches"); setPage(1); setFilterStatus("all"); setSearch(""); }}
          className={activeTab === "batches" ? "bg-blue-600" : "text-gray-400"}
        >
          <Layers className="h-4 w-4 ml-1" />
          אצוות ({batches.length})
        </Button>
        <Button
          variant={activeTab === "serials" ? "default" : "ghost"}
          size="sm"
          onClick={() => { setActiveTab("serials"); setPage(1); setFilterStatus("all"); setSearch(""); }}
          className={activeTab === "serials" ? "bg-blue-600" : "text-gray-400"}
        >
          <Hash className="h-4 w-4 ml-1" />
          מספרים סידוריים ({serials.length})
        </Button>
      </div>

      {/* Filters */}
      <Card className="bg-card/60 border-border">
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder={activeTab === "batches" ? "חיפוש מספר אצווה, מוצר..." : "חיפוש מספר סידורי, מוצר, לקוח..."}
                className="pr-9 bg-input border-border text-foreground"
              />
            </div>
            <select
              value={filterStatus}
              onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
              className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground"
            >
              <option value="all">כל הסטטוסים</option>
              {Object.entries(currentStatusMap).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            {(filterStatus !== "all" || search) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setFilterStatus("all"); setSearch(""); }}
                className="text-red-400 hover:text-red-300 gap-1"
              >
                <X className="h-3 w-3" />נקה
              </Button>
            )}
            <span className="text-xs text-muted-foreground mr-auto">{filtered.length} תוצאות</span>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="bg-card/80 border-border">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-background/50">
                  {activeTab === "batches" ? (
                    <>
                      <th className="p-3 text-right text-muted-foreground font-medium"><button className="flex items-center gap-1" onClick={() => toggleSort("batch_number")}>מספר אצווה<SI /></button></th>
                      <th className="p-3 text-right text-muted-foreground font-medium"><button className="flex items-center gap-1" onClick={() => toggleSort("product_name")}>מוצר<SI /></button></th>
                      <th className="p-3 text-right text-muted-foreground font-medium"><button className="flex items-center gap-1" onClick={() => toggleSort("quantity")}>כמות<SI /></button></th>
                      <th className="p-3 text-right text-muted-foreground font-medium"><button className="flex items-center gap-1" onClick={() => toggleSort("production_date")}>תאריך ייצור<SI /></button></th>
                      <th className="p-3 text-right text-muted-foreground font-medium"><button className="flex items-center gap-1" onClick={() => toggleSort("expiry_date")}>תפוגה<SI /></button></th>
                      <th className="p-3 text-right text-muted-foreground font-medium">סטטוס איכות</th>
                      <th className="p-3 text-right text-muted-foreground font-medium">מיקום</th>
                      <th className="p-3 text-right text-muted-foreground font-medium">פעולות</th>
                    </>
                  ) : (
                    <>
                      <th className="p-3 text-right text-muted-foreground font-medium"><button className="flex items-center gap-1" onClick={() => toggleSort("serial_number")}>מספר סידורי<SI /></button></th>
                      <th className="p-3 text-right text-muted-foreground font-medium"><button className="flex items-center gap-1" onClick={() => toggleSort("product_name")}>מוצר<SI /></button></th>
                      <th className="p-3 text-right text-muted-foreground font-medium"><button className="flex items-center gap-1" onClick={() => toggleSort("batch_number")}>אצווה<SI /></button></th>
                      <th className="p-3 text-right text-muted-foreground font-medium"><button className="flex items-center gap-1" onClick={() => toggleSort("production_date")}>תאריך ייצור<SI /></button></th>
                      <th className="p-3 text-right text-muted-foreground font-medium"><button className="flex items-center gap-1" onClick={() => toggleSort("warranty_end")}>אחריות עד<SI /></button></th>
                      <th className="p-3 text-right text-muted-foreground font-medium">לקוח</th>
                      <th className="p-3 text-right text-muted-foreground font-medium">סטטוס</th>
                      <th className="p-3 text-right text-muted-foreground font-medium">פעולות</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/50">
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="p-3"><div className="h-4 bg-muted rounded animate-pulse" /></td>
                      ))}
                    </tr>
                  ))
                ) : paged.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-muted-foreground">
                      <Package className="h-10 w-10 mx-auto mb-2 opacity-30" />
                      <p>אין נתונים להצגה</p>
                    </td>
                  </tr>
                ) : activeTab === "batches" ? paged.map((r: any, i: number) => {
                  const qs = qualityStatusMap[r.quality_status] || { label: r.quality_status, color: "bg-gray-500/20 text-gray-400" };
                  const isExpired = r.expiry_date && new Date(r.expiry_date) < new Date();
                  return (
                    <tr key={r.id || i} className="border-b border-border/50 hover:bg-card/40 transition-colors">
                      <td className="p-3">
                        <span className="text-foreground font-mono font-medium">{r.batch_number || "—"}</span>
                      </td>
                      <td className="p-3">
                        <div>
                          <span className="text-foreground">{r.product_name || "—"}</span>
                          {r.product_code && <span className="text-xs text-muted-foreground block">{r.product_code}</span>}
                        </div>
                      </td>
                      <td className="p-3 font-mono text-gray-300">{Number(r.quantity || 0).toLocaleString("he-IL")}</td>
                      <td className="p-3 text-gray-300">{r.production_date || "—"}</td>
                      <td className="p-3">
                        <span className={isExpired ? "text-red-400 font-bold" : "text-gray-300"}>{r.expiry_date || "—"}</span>
                        {isExpired && <span className="text-[10px] text-red-400 block">פג תוקף</span>}
                      </td>
                      <td className="p-3"><Badge className={qs.color}>{qs.label}</Badge></td>
                      <td className="p-3 text-gray-300">{r.location || "—"}</td>
                      <td className="p-3">
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setViewDetail(r)} className="text-gray-400 hover:text-foreground" title="פרטים"><Eye className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="sm" onClick={() => loadTrace("batch", r.batch_number)} className="text-gray-400 hover:text-cyan-400" title="עקיבות"><Link2 className="h-4 w-4" /></Button>
                        </div>
                      </td>
                    </tr>
                  );
                }) : paged.map((r: any, i: number) => {
                  const ss = serialStatusMap[r.status] || { label: r.status, color: "bg-gray-500/20 text-gray-400" };
                  return (
                    <tr key={r.id || i} className="border-b border-border/50 hover:bg-card/40 transition-colors">
                      <td className="p-3">
                        <span className="text-foreground font-mono font-medium">{r.serial_number || "—"}</span>
                      </td>
                      <td className="p-3">
                        <div>
                          <span className="text-foreground">{r.product_name || "—"}</span>
                          {r.product_code && <span className="text-xs text-muted-foreground block">{r.product_code}</span>}
                        </div>
                      </td>
                      <td className="p-3 font-mono text-gray-300">{r.batch_number || "—"}</td>
                      <td className="p-3 text-gray-300">{r.production_date || "—"}</td>
                      <td className="p-3 text-gray-300">{r.warranty_end || "—"}</td>
                      <td className="p-3 text-gray-300">{r.customer_name || "—"}</td>
                      <td className="p-3"><Badge className={ss.color}>{ss.label}</Badge></td>
                      <td className="p-3">
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setViewDetail(r)} className="text-gray-400 hover:text-foreground" title="פרטים"><Eye className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="sm" onClick={() => loadTrace("serial", r.serial_number)} className="text-gray-400 hover:text-cyan-400" title="עקיבות"><Link2 className="h-4 w-4" /></Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between p-3 border-t border-border">
              <span className="text-xs text-muted-foreground">
                מציג {(page - 1) * perPage + 1}-{Math.min(page * perPage, filtered.length)} מתוך {filtered.length}
              </span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)} className="border-border text-gray-300">הקודם</Button>
                <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)} className="border-border text-gray-300">הבא</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Modal */}
      {viewDetail && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setViewDetail(null)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-lg p-6 space-y-4" dir="rtl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground">
                {activeTab === "batches" ? `אצווה ${viewDetail.batch_number}` : `סידורי ${viewDetail.serial_number}`}
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setViewDetail(null)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(viewDetail).filter(([k]) => !["id", "__v"].includes(k)).map(([key, val]: [string, any], i) => (
                <div key={i}>
                  <p className="text-xs text-muted-foreground">{key.replace(/_/g, " ")}</p>
                  <p className="text-sm text-foreground mt-1">{typeof val === "object" ? JSON.stringify(val) : String(val ?? "—")}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Traceability Modal */}
      {viewTrace && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setViewTrace(null)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-2xl p-6 space-y-4" dir="rtl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Link2 className="h-5 w-5 text-cyan-400" />
                שרשרת עקיבות - {viewTrace.number}
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setViewTrace(null)}><X className="h-4 w-4" /></Button>
            </div>

            {viewTrace.chain.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">אין נתוני עקיבות</p>
            ) : (
              <div className="space-y-0 relative">
                <div className="absolute right-4 top-0 bottom-0 w-0.5 bg-muted" />
                {viewTrace.chain.map((step: any, i: number) => (
                  <div key={i} className="relative pr-10 py-3">
                    <div className={`absolute right-[11px] top-4 w-3 h-3 rounded-full border-2 ${
                      i === 0 ? "bg-green-500 border-green-400" :
                      i === viewTrace.chain.length - 1 ? "bg-blue-500 border-blue-400" :
                      "bg-muted border-border"
                    }`} />
                    <Card className="bg-input border-border">
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-foreground">{step.action || step.event || "—"}</p>
                            <p className="text-xs text-muted-foreground mt-1">{step.description || ""}</p>
                          </div>
                          <div className="text-left">
                            <p className="text-xs text-muted-foreground">{step.date || step.timestamp || "—"}</p>
                            {step.user && <p className="text-xs text-gray-400">{step.user}</p>}
                            {step.location && <p className="text-xs text-gray-500">{step.location}</p>}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
