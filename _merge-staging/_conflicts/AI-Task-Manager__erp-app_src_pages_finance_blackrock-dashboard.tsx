import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { authFetch } from "@/lib/utils";
import {
  TrendingUp, TrendingDown, AlertTriangle, Shield, Activity, BarChart3,
  DollarSign, RefreshCw, Layers, PieChart as PieChartIcon,
  ArrowUpRight, ArrowDownRight, Briefcase, Globe, Target, Gauge
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart as RechartsPie, Pie, Cell, Legend, Line, ComposedChart,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Area, AreaChart
} from "recharts";

const API = "/api";

function fmt(val: number) {
  if (Math.abs(val) >= 1000000) return `₪${(val / 1000000).toFixed(2)}M`;
  if (Math.abs(val) >= 1000) return `₪${(val / 1000).toFixed(1)}K`;
  return `₪${val.toFixed(0)}`;
}

function pctFmt(val: number) { return `${val >= 0 ? '+' : ''}${val.toFixed(2)}%`; }

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

const ASSET_CLASS_LABELS: Record<string, string> = {
  stock: "מניות", bond: "אגרות חוב", etf: "תעודות סל", reit: "קרנות ריט", commodity: "סחורות"
};
const ASSET_CLASS_COLORS: Record<string, string> = {
  stock: "#3b82f6", bond: "#10b981", etf: "#f59e0b", reit: "#8b5cf6", commodity: "#ec4899"
};

function authHeaders() {
  const t = localStorage.getItem("erp_token") || localStorage.getItem("token") || "";
  return { Authorization: `Bearer ${t}`, "Content-Type": "application/json" };
}

export default function BlackRockDashboard() {
  const [, navigate] = useLocation();
  const [summary, setSummary] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [benchmarks, setBenchmarks] = useState<any[]>([]);
  const [riskAnalysis, setRiskAnalysis] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");

  const load = async () => {
    setLoading(true);
    const h = authHeaders();
    const safeFetch = async (url: string) => {
      try { const r = await authFetch(url, { headers: h }); if (!r.ok) return null; return await r.json(); } catch { return null; }
    };
    try {
      const [sumRes, txRes, bmRes, riskRes] = await Promise.allSettled([
        safeFetch(`${API}/investment/portfolio/summary`),
        safeFetch(`${API}/investment/transactions`),
        safeFetch(`${API}/investment/benchmarks`),
        safeFetch(`${API}/investment/risk-analysis`),
      ]);
      if (sumRes.status === 'fulfilled' && sumRes.value) setSummary(sumRes.value);
      if (txRes.status === 'fulfilled') setTransactions(Array.isArray(txRes.value) ? txRes.value : []);
      if (bmRes.status === 'fulfilled') setBenchmarks(Array.isArray(bmRes.value) ? bmRes.value : []);
      if (riskRes.status === 'fulfilled' && riskRes.value) setRiskAnalysis(riskRes.value);
    } catch { }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const positions = useMemo(() => summary?.positions || [], [summary]);

  const performanceVsBenchmark = useMemo(() => {
    if (!summary || !benchmarks.length) return [];
    const ytdReturn = summary.totalPnlPct || 0;
    const ytdBenchmarks = benchmarks.filter((b: any) => b.period === 'YTD');
    return [
      { name: "התיק שלך", return: Number(ytdReturn.toFixed(2)) },
      ...ytdBenchmarks.map((b: any) => ({ name: b.benchmark_name, return: Number(Number(b.return_pct).toFixed(2)) }))
    ];
  }, [summary, benchmarks]);

  const radarData = useMemo(() => {
    if (!riskAnalysis) return [];
    return [
      { metric: "תשואה", value: Math.min(100, Math.max(0, (summary?.totalPnlPct || 0) * 5)) },
      { metric: "שארפ", value: Math.min(100, (riskAnalysis.sharpeRatio || 0) * 40) },
      { metric: "בטא", value: Math.min(100, (2 - (riskAnalysis.portfolioBeta || 1)) * 50) },
      { metric: "פיזור", value: Math.min(100, positions.length * 7) },
      { metric: "דיבידנד", value: Math.min(100, (summary?.weightedDividend || 0) * 25) },
      { metric: "יציבות", value: Math.min(100, 100 - Math.abs(riskAnalysis.maxDrawdown || 0) * 5) },
    ];
  }, [riskAnalysis, summary, positions]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
        <span className="mr-3 text-muted-foreground">טוען נתוני תיק השקעות...</span>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Briefcase className="w-8 h-8 text-blue-500" />
            BlackRock Investment Module
          </h1>
          <p className="text-muted-foreground mt-1">ניהול תיק השקעות מקצועי - טכנו-כל עוזי</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={load}>
            <RefreshCw className="w-4 h-4 ml-1" /> רענון
          </Button>
          <Button size="sm" onClick={() => navigate("/finance/blackrock-risk-matrix")}>
            <Shield className="w-4 h-4 ml-1" /> מטריצת סיכונים
          </Button>
          <Button size="sm" onClick={() => navigate("/finance/blackrock-monte-carlo")}>
            <Activity className="w-4 h-4 ml-1" /> מונטה קרלו
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card className="bg-gradient-to-br from-blue-900/40 to-blue-800/20 border-blue-700/30">
          <CardContent className="p-4 text-center">
            <DollarSign className="w-5 h-5 mx-auto mb-1 text-blue-400" />
            <p className="text-xs text-muted-foreground">שווי תיק</p>
            <p className="text-xl font-bold text-blue-300">{fmt(summary?.totalValue || 0)}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-emerald-900/40 to-emerald-800/20 border-emerald-700/30">
          <CardContent className="p-4 text-center">
            <TrendingUp className="w-5 h-5 mx-auto mb-1 text-emerald-400" />
            <p className="text-xs text-muted-foreground">רווח/הפסד</p>
            <p className={`text-xl font-bold ${(summary?.totalPnl || 0) >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
              {fmt(summary?.totalPnl || 0)}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-900/40 to-purple-800/20 border-purple-700/30">
          <CardContent className="p-4 text-center">
            <Target className="w-5 h-5 mx-auto mb-1 text-purple-400" />
            <p className="text-xs text-muted-foreground">תשואה כוללת</p>
            <p className={`text-xl font-bold ${(summary?.totalPnlPct || 0) >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
              {pctFmt(summary?.totalPnlPct || 0)}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-900/40 to-amber-800/20 border-amber-700/30">
          <CardContent className="p-4 text-center">
            <Layers className="w-5 h-5 mx-auto mb-1 text-amber-400" />
            <p className="text-xs text-muted-foreground">פוזיציות</p>
            <p className="text-xl font-bold text-amber-300">{summary?.positionCount || 0}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-cyan-900/40 to-cyan-800/20 border-cyan-700/30">
          <CardContent className="p-4 text-center">
            <Gauge className="w-5 h-5 mx-auto mb-1 text-cyan-400" />
            <p className="text-xs text-muted-foreground">בטא תיק</p>
            <p className="text-xl font-bold text-cyan-300">{(riskAnalysis?.portfolioBeta || 0).toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-pink-900/40 to-pink-800/20 border-pink-700/30">
          <CardContent className="p-4 text-center">
            <PieChartIcon className="w-5 h-5 mx-auto mb-1 text-pink-400" />
            <p className="text-xs text-muted-foreground">דיבידנד ממוצע</p>
            <p className="text-xl font-bold text-pink-300">{(summary?.weightedDividend || 0).toFixed(2)}%</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-5 w-full max-w-2xl">
          <TabsTrigger value="overview">סקירה כללית</TabsTrigger>
          <TabsTrigger value="positions">פוזיציות</TabsTrigger>
          <TabsTrigger value="allocation">הקצאת נכסים</TabsTrigger>
          <TabsTrigger value="transactions">היסטוריית עסקאות</TabsTrigger>
          <TabsTrigger value="risk">ניתוח סיכונים</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="w-4 h-4" />ביצועים מול מדדי ייחוס (YTD)</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={performanceVsBenchmark} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis type="number" tickFormatter={v => `${v}%`} stroke="#94a3b8" />
                    <YAxis type="category" dataKey="name" width={120} stroke="#94a3b8" />
                    <Tooltip formatter={(v: number) => `${v.toFixed(2)}%`} contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }} />
                    <Bar dataKey="return" fill="#3b82f6" radius={[0, 4, 4, 0]}>
                      {performanceVsBenchmark.map((_: any, i: number) => (
                        <Cell key={i} fill={i === 0 ? '#3b82f6' : COLORS[(i + 1) % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Target className="w-4 h-4" />פרופיל סיכון-תשואה</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#334155" />
                    <PolarAngleAxis dataKey="metric" stroke="#94a3b8" fontSize={12} />
                    <PolarRadiusAxis domain={[0, 100]} tick={false} />
                    <Radar dataKey="value" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-sm text-emerald-400">🔝 מובילי עלייה</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {(summary?.topGainers || []).slice(0, 5).map((p: any) => (
                  <div key={p.ticker} className="flex justify-between items-center text-sm">
                    <div>
                      <span className="font-medium">{p.ticker}</span>
                      <span className="text-muted-foreground text-xs mr-2">{p.name_he || p.name}</span>
                    </div>
                    <Badge variant="outline" className="text-emerald-400 border-emerald-500/30">
                      <ArrowUpRight className="w-3 h-3 ml-1" />{pctFmt(Number(p.unrealized_pnl_pct))}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">📊 מדדי ביצוע</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Sharpe Ratio</span>
                  <span className="font-medium">{riskAnalysis?.sharpeRatio || 'N/A'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Max Drawdown</span>
                  <span className="font-medium text-red-400">{riskAnalysis?.maxDrawdown || 0}%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Volatility</span>
                  <span className="font-medium">{riskAnalysis?.volatility || 0}%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">VaR יומי (95%)</span>
                  <span className="font-medium text-amber-400">{fmt(riskAnalysis?.varDaily || 0)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">VaR שנתי (95%)</span>
                  <span className="font-medium text-red-400">{fmt(riskAnalysis?.varAnnual || 0)}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">💱 חשיפה מטבעית</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={180}>
                  <RechartsPie>
                    <Pie data={summary?.currencyExposure || []} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={70} label={({ name, pct }: any) => `${name} ${pct?.toFixed(1)}%`} labelLine={false} fontSize={11}>
                      {(summary?.currencyExposure || []).map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }} />
                  </RechartsPie>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="positions" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Layers className="w-4 h-4" />פוזיציות פתוחות ({positions.length})</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-muted-foreground">
                      <th className="text-right p-2">סימול</th>
                      <th className="text-right p-2">שם</th>
                      <th className="text-right p-2">סוג</th>
                      <th className="text-left p-2">יח'</th>
                      <th className="text-left p-2">עלות ממוצעת</th>
                      <th className="text-left p-2">מחיר נוכחי</th>
                      <th className="text-left p-2">שווי שוק</th>
                      <th className="text-left p-2">רווח/הפסד</th>
                      <th className="text-left p-2">% תשואה</th>
                      <th className="text-left p-2">% יומי</th>
                      <th className="text-left p-2">משקל</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((p: any) => {
                      const pnl = Number(p.unrealized_pnl || 0);
                      const pnlPct = Number(p.unrealized_pnl_pct || 0);
                      const dayChg = Number(p.day_change_pct || 0);
                      return (
                        <tr key={p.id} className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors">
                          <td className="p-2 font-mono font-bold text-blue-400">{p.ticker}</td>
                          <td className="p-2">{p.name_he || p.name}</td>
                          <td className="p-2">
                            <Badge variant="outline" className="text-xs" style={{ borderColor: ASSET_CLASS_COLORS[p.asset_class] || '#666', color: ASSET_CLASS_COLORS[p.asset_class] || '#999' }}>
                              {ASSET_CLASS_LABELS[p.asset_class] || p.asset_class}
                            </Badge>
                          </td>
                          <td className="p-2 text-left font-mono">{Number(p.shares).toLocaleString()}</td>
                          <td className="p-2 text-left font-mono">{Number(p.avg_cost_per_share).toFixed(2)}</td>
                          <td className="p-2 text-left font-mono">{Number(p.current_price).toFixed(2)}</td>
                          <td className="p-2 text-left font-mono font-medium">{fmt(Number(p.market_value))}</td>
                          <td className={`p-2 text-left font-mono font-medium ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {pnl >= 0 ? <ArrowUpRight className="w-3 h-3 inline ml-1" /> : <ArrowDownRight className="w-3 h-3 inline ml-1" />}
                            {fmt(Math.abs(pnl))}
                          </td>
                          <td className={`p-2 text-left font-mono ${pnlPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {pctFmt(pnlPct)}
                          </td>
                          <td className={`p-2 text-left font-mono text-xs ${dayChg >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {pctFmt(dayChg)}
                          </td>
                          <td className="p-2 text-left font-mono text-muted-foreground">{Number(p.weight_pct).toFixed(1)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-600 font-bold text-sm">
                      <td colSpan={6} className="p-2 text-right">סה"כ</td>
                      <td className="p-2 text-left font-mono">{fmt(summary?.totalValue || 0)}</td>
                      <td className={`p-2 text-left font-mono ${(summary?.totalPnl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {fmt(summary?.totalPnl || 0)}
                      </td>
                      <td className={`p-2 text-left font-mono ${(summary?.totalPnlPct || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {pctFmt(summary?.totalPnlPct || 0)}
                      </td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="allocation" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-sm">הקצאת נכסים לפי סוג</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <RechartsPie>
                    <Pie data={(summary?.assetAllocation || []).map((a: any) => ({ ...a, displayName: ASSET_CLASS_LABELS[a.name] || a.name }))} dataKey="value" nameKey="displayName" cx="50%" cy="50%" outerRadius={100} label={({ displayName, pct }: any) => `${displayName} ${pct?.toFixed(1)}%`} labelLine fontSize={11}>
                      {(summary?.assetAllocation || []).map((a: any, i: number) => <Cell key={i} fill={ASSET_CLASS_COLORS[a.name] || COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }} />
                    <Legend />
                  </RechartsPie>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">הקצאת נכסים לפי סקטור</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={summary?.sectorAllocation || []} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis type="number" tickFormatter={v => fmt(v)} stroke="#94a3b8" />
                    <YAxis type="category" dataKey="name" width={100} stroke="#94a3b8" fontSize={11} />
                    <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {(summary?.sectorAllocation || []).map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-sm">משקל פוזיציות בתיק</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={positions.map((p: any) => ({ name: p.ticker, weight: Number(p.weight_pct), value: Number(p.market_value) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
                  <YAxis tickFormatter={v => `${v}%`} stroke="#94a3b8" />
                  <Tooltip formatter={(v: number, name: string) => name === 'weight' ? `${v.toFixed(1)}%` : fmt(v)} contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }} />
                  <Bar dataKey="weight" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transactions" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Activity className="w-4 h-4" />היסטוריית עסקאות ({transactions.length})</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-muted-foreground">
                      <th className="text-right p-2">תאריך</th>
                      <th className="text-right p-2">סימול</th>
                      <th className="text-right p-2">פעולה</th>
                      <th className="text-left p-2">יח'</th>
                      <th className="text-left p-2">מחיר</th>
                      <th className="text-left p-2">סכום</th>
                      <th className="text-left p-2">עמלה</th>
                      <th className="text-right p-2">הערות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx: any) => (
                      <tr key={tx.id} className="border-b border-slate-800 hover:bg-slate-800/50">
                        <td className="p-2 font-mono text-xs">{tx.transaction_date?.split('T')[0]}</td>
                        <td className="p-2 font-mono font-bold text-blue-400">{tx.ticker}</td>
                        <td className="p-2">
                          <Badge variant={tx.transaction_type === 'buy' ? 'default' : 'destructive'} className="text-xs">
                            {tx.transaction_type === 'buy' ? 'קנייה' : 'מכירה'}
                          </Badge>
                        </td>
                        <td className="p-2 text-left font-mono">{Number(tx.shares).toLocaleString()}</td>
                        <td className="p-2 text-left font-mono">{Number(tx.price_per_share).toFixed(2)}</td>
                        <td className="p-2 text-left font-mono font-medium">{fmt(Number(tx.total_amount))}</td>
                        <td className="p-2 text-left font-mono text-muted-foreground">{fmt(Number(tx.commission))}</td>
                        <td className="p-2 text-xs text-muted-foreground">{tx.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="risk" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className={`border-2 ${riskAnalysis?.riskLevel === 'high' ? 'border-red-500/30 bg-red-900/10' : riskAnalysis?.riskLevel === 'medium' ? 'border-amber-500/30 bg-amber-900/10' : 'border-emerald-500/30 bg-emerald-900/10'}`}>
              <CardContent className="p-6 text-center">
                <Shield className={`w-10 h-10 mx-auto mb-2 ${riskAnalysis?.riskLevel === 'high' ? 'text-red-400' : riskAnalysis?.riskLevel === 'medium' ? 'text-amber-400' : 'text-emerald-400'}`} />
                <p className="text-sm text-muted-foreground">ציון סיכון כולל</p>
                <p className="text-4xl font-bold mt-1">{riskAnalysis?.riskScore || 0}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {riskAnalysis?.riskLevel === 'high' ? 'סיכון גבוה' : riskAnalysis?.riskLevel === 'medium' ? 'סיכון בינוני' : 'סיכון נמוך'}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 text-center">
                <AlertTriangle className="w-10 h-10 mx-auto mb-2 text-amber-400" />
                <p className="text-sm text-muted-foreground">Value at Risk יומי</p>
                <p className="text-2xl font-bold text-amber-300">{fmt(riskAnalysis?.varDaily || 0)}</p>
                <p className="text-xs text-muted-foreground mt-1">ברמת ביטחון 95%</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 text-center">
                <Globe className="w-10 h-10 mx-auto mb-2 text-blue-400" />
                <p className="text-sm text-muted-foreground">בטא תיק</p>
                <p className="text-2xl font-bold">{(riskAnalysis?.portfolioBeta || 0).toFixed(3)}</p>
                <p className="text-xs text-muted-foreground mt-1">יחסית למדד השוק</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-sm">ריכוזיות סקטוריאלית</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={riskAnalysis?.sectorConcentration || []} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis type="number" tickFormatter={v => `${v.toFixed(0)}%`} stroke="#94a3b8" />
                    <YAxis type="category" dataKey="sector" width={100} stroke="#94a3b8" fontSize={11} />
                    <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }} />
                    <Bar dataKey="weight" radius={[0, 4, 4, 0]}>
                      {(riskAnalysis?.sectorConcentration || []).map((_: any, i: number) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">אזהרות ריכוזיות</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {(riskAnalysis?.topConcentration || []).length === 0 ? (
                  <p className="text-emerald-400 text-sm flex items-center gap-2">
                    <Shield className="w-4 h-4" /> אין ריכוזיות חריגה - התיק מפוזר היטב
                  </p>
                ) : (
                  (riskAnalysis?.topConcentration || []).map((c: any) => (
                    <div key={c.ticker} className="flex items-center justify-between p-2 bg-amber-900/20 rounded border border-amber-500/20">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                        <span className="text-sm font-medium">{c.ticker}</span>
                        <span className="text-xs text-muted-foreground">{c.name}</span>
                      </div>
                      <Badge variant="outline" className="text-amber-400 border-amber-500/30">
                        {c.weight.toFixed(1)}% מהתיק
                      </Badge>
                    </div>
                  ))
                )}
                <div className="mt-4 pt-3 border-t border-slate-700 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Sharpe Ratio</span>
                    <span className={`font-medium ${(riskAnalysis?.sharpeRatio || 0) > 1 ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {riskAnalysis?.sharpeRatio || 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">VaR חודשי</span>
                    <span className="font-medium text-amber-400">{fmt(riskAnalysis?.varMonthly || 0)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">ירידה מקסימלית</span>
                    <span className="font-medium text-red-400">{riskAnalysis?.maxDrawdown || 0}%</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <div className="bg-card border border-border/50 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-foreground mb-4">רשומות קשורות</h3>
          <RelatedRecords entityType="blackrock-dashboard" entityId="dashboard" />
        </div>
        <div className="bg-card border border-border/50 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-foreground mb-4">היסטוריית פעילות</h3>
          <ActivityLog entityType="blackrock-dashboard" entityId="dashboard" />
        </div>
      </div>
    </div>
  );
}
