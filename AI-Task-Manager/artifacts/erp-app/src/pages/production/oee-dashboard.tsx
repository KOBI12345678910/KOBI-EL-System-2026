import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Activity, Gauge, Zap, CheckCircle, Clock, Search, Filter, X, Download,
  RefreshCw, Calendar, TrendingUp, TrendingDown, BarChart3, Settings, Factory
} from "lucide-react";
import { authFetch } from "@/lib/utils";

const API = "/api/production-sap";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const pct = (v: any) => `${Number(v || 0).toFixed(1)}%`;

function getOeeColor(value: number): string {
  if (value >= 85) return "text-green-400";
  if (value >= 60) return "text-yellow-400";
  return "text-red-400";
}

function getOeeBgColor(value: number): string {
  if (value >= 85) return "bg-green-500";
  if (value >= 60) return "bg-yellow-500";
  return "bg-red-500";
}

function getOeeBadge(value: number): { label: string; color: string } {
  if (value >= 85) return { label: "מצוין", color: "bg-green-500/20 text-green-400" };
  if (value >= 60) return { label: "סביר", color: "bg-yellow-500/20 text-yellow-400" };
  return { label: "נמוך", color: "bg-red-500/20 text-red-400" };
}

export default function OeeDashboardPage() {
  const [machines, setMachines] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterDepartment, setFilterDepartment] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortField, setSortField] = useState("oee");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [viewDetail, setViewDetail] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      const qs = params.toString() ? `?${params.toString()}` : "";
      const [mRes, sRes] = await Promise.all([
        authFetch(`${API}/oee-machines${qs}`),
        authFetch(`${API}/oee-stats${qs}`),
      ]);
      if (mRes.ok) setMachines(safeArray(await mRes.json()));
      if (sRes.ok) setStats((await sRes.json()) || {});
    } catch (e: any) {
      setError(e.message || "שגיאה בטעינת נתונים");
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [dateFrom, dateTo]);

  const departments = useMemo(() => {
    const deps = new Set(machines.map(m => m.department).filter(Boolean));
    return Array.from(deps).sort();
  }, [machines]);

  const filtered = useMemo(() => {
    let data = machines.filter(m =>
      (filterDepartment === "all" || m.department === filterDepartment) &&
      (!search || [m.machine_name, m.machine_code, m.department]
        .some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? 0;
      const vb = b[sortField] ?? 0;
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return data;
  }, [machines, search, filterDepartment, sortField, sortDir]);

  const activeFilters = [filterDepartment !== "all", !!dateFrom, !!dateTo].filter(Boolean).length;

  const kpis = [
    { label: "OEE ממוצע", value: pct(stats.avg_oee), color: getOeeColor(stats.avg_oee || 0), icon: Gauge, sub: stats.oee_trend },
    { label: "זמינות", value: pct(stats.avg_availability), color: "text-blue-400", icon: Clock, sub: stats.availability_trend },
    { label: "ביצועים", value: pct(stats.avg_performance), color: "text-cyan-400", icon: Zap, sub: stats.performance_trend },
    { label: "איכות", value: pct(stats.avg_quality), color: "text-emerald-400", icon: CheckCircle, sub: stats.quality_trend },
  ];

  return (
    <div className="p-6 space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-emerald-400" />
            דשבורד OEE
          </h1>
          <p className="text-sm text-muted-foreground mt-1">יעילות כוללת של ציוד - זמינות, ביצועים ואיכות</p>
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
          <Activity className="h-4 w-4" />{error}
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
                  <div className="h-8 w-20 bg-muted rounded" />
                </div>
              ) : (
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[11px] text-muted-foreground">{k.label}</p>
                    <p className={`text-2xl font-bold font-mono mt-1 ${k.color}`}>{k.value}</p>
                    {k.sub !== undefined && (
                      <div className="flex items-center gap-1 mt-1">
                        {k.sub >= 0 ? <TrendingUp className="h-3 w-3 text-green-400" /> : <TrendingDown className="h-3 w-3 text-red-400" />}
                        <span className={`text-[10px] ${k.sub >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {k.sub >= 0 ? "+" : ""}{Number(k.sub || 0).toFixed(1)}%
                        </span>
                      </div>
                    )}
                  </div>
                  <k.icon className={`h-5 w-5 ${k.color} opacity-50`} />
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card className="bg-card/60 border-border">
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="חיפוש מכונה..."
                className="pr-9 bg-input border-border text-foreground"
              />
            </div>
            <select
              value={filterDepartment}
              onChange={e => setFilterDepartment(e.target.value)}
              className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground"
            >
              <option value="all">כל המחלקות</option>
              {departments.map((d: string) => <option key={d} value={d}>{d}</option>)}
            </select>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="bg-input border-border text-foreground w-36"
                placeholder="מתאריך"
              />
              <span className="text-muted-foreground">—</span>
              <Input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="bg-input border-border text-foreground w-36"
                placeholder="עד תאריך"
              />
            </div>
            {activeFilters > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setFilterDepartment("all"); setDateFrom(""); setDateTo(""); setSearch(""); }}
                className="text-red-400 hover:text-red-300 gap-1"
              >
                <X className="h-3 w-3" />נקה ({activeFilters})
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* OEE Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500" /> מצוין ({">"}85%)</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-500" /> סביר (60-85%)</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500" /> נמוך ({"<"}60%)</span>
      </div>

      {/* Machine OEE Bars */}
      <div className="space-y-2">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="bg-card/80 border-border">
              <CardContent className="p-4">
                <div className="h-12 bg-muted rounded animate-pulse" />
              </CardContent>
            </Card>
          ))
        ) : filtered.length === 0 ? (
          <Card className="bg-card/80 border-border">
            <CardContent className="p-8 text-center text-muted-foreground">
              <Factory className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>אין נתוני OEE זמינים</p>
            </CardContent>
          </Card>
        ) : filtered.map((m: any, idx: number) => {
          const oee = Number(m.oee || 0);
          const avail = Number(m.availability || 0);
          const perf = Number(m.performance || 0);
          const qual = Number(m.quality || 0);
          const badge = getOeeBadge(oee);
          return (
            <Card
              key={m.id || idx}
              className="bg-card/80 border-border hover:border-border transition-colors cursor-pointer"
              onClick={() => setViewDetail(m)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  {/* Machine Info */}
                  <div className="w-48 shrink-0">
                    <div className="flex items-center gap-2">
                      <Settings className="h-4 w-4 text-muted-foreground" />
                      <span className="text-foreground font-medium text-sm">{m.machine_name || "—"}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {m.machine_code && <span className="text-[10px] text-muted-foreground">{m.machine_code}</span>}
                      {m.department && <Badge variant="outline" className="text-[10px] border-border text-gray-400">{m.department}</Badge>}
                    </div>
                  </div>

                  {/* OEE Bar */}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <span className={`text-lg font-bold font-mono ${getOeeColor(oee)}`}>{pct(oee)}</span>
                      <Badge className={badge.color}>{badge.label}</Badge>
                    </div>
                    <div className="w-full h-4 bg-input rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${getOeeBgColor(oee)}`}
                        style={{ width: `${Math.min(oee, 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Sub-metrics */}
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-center">
                      <p className="text-[10px] text-muted-foreground">זמינות</p>
                      <p className={`text-sm font-mono font-bold ${getOeeColor(avail)}`}>{pct(avail)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-muted-foreground">ביצועים</p>
                      <p className={`text-sm font-mono font-bold ${getOeeColor(perf)}`}>{pct(perf)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-muted-foreground">איכות</p>
                      <p className={`text-sm font-mono font-bold ${getOeeColor(qual)}`}>{pct(qual)}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Detail Modal */}
      {viewDetail && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setViewDetail(null)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-lg p-6 space-y-4" dir="rtl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Settings className="h-5 w-5 text-muted-foreground" />
                {viewDetail.machine_name}
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setViewDetail(null)}><X className="h-4 w-4" /></Button>
            </div>

            {/* OEE Breakdown */}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 text-center p-4 bg-input rounded-lg">
                <p className="text-xs text-muted-foreground">OEE כולל</p>
                <p className={`text-4xl font-bold font-mono mt-1 ${getOeeColor(viewDetail.oee)}`}>{pct(viewDetail.oee)}</p>
              </div>
              {[
                { label: "זמינות", value: viewDetail.availability, icon: Clock },
                { label: "ביצועים", value: viewDetail.performance, icon: Zap },
                { label: "איכות", value: viewDetail.quality, icon: CheckCircle },
                { label: "השבתה (שעות)", value: viewDetail.downtime_hours, isHours: true },
              ].map((item, i) => (
                <div key={i} className="p-3 bg-input rounded-lg text-center">
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className={`text-xl font-bold font-mono mt-1 ${item.isHours ? "text-gray-300" : getOeeColor(item.value)}`}>
                    {item.isHours ? Number(item.value || 0).toFixed(1) : pct(item.value)}
                  </p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              {[
                { label: "קוד מכונה", value: viewDetail.machine_code },
                { label: "מחלקה", value: viewDetail.department },
                { label: "פריטים שיוצרו", value: viewDetail.items_produced?.toLocaleString("he-IL") },
                { label: "פריטים תקינים", value: viewDetail.good_items?.toLocaleString("he-IL") },
                { label: "פגומים", value: viewDetail.defective_items?.toLocaleString("he-IL") },
                { label: "עדכון אחרון", value: viewDetail.last_updated },
              ].map((f, i) => (
                <div key={i}>
                  <p className="text-xs text-muted-foreground">{f.label}</p>
                  <p className="text-foreground mt-1">{f.value || "—"}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
