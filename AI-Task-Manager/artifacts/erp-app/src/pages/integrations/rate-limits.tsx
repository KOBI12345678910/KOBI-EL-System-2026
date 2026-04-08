import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Shield, Activity, Ban, Clock, AlertTriangle, Gauge,
  Search, Settings, Unlock, RefreshCw, Eye, Trash2, Plus,
  Wifi, WifiOff, Zap, Users, Globe, Server,
} from "lucide-react";

const fmt = (n: number) => new Intl.NumberFormat("he-IL").format(n);

/* ── KPI data ── */
const FALLBACK_KPIS = [
  { label: "מדיניות פעילה", value: "18", icon: Shield, color: "text-blue-600 bg-blue-100" },
  { label: "בקשות היום", value: fmt(284520), icon: Activity, color: "text-emerald-600 bg-emerald-100" },
  { label: "בקשות שנחסמו", value: fmt(1843), icon: Ban, color: "text-red-600 bg-red-100" },
  { label: "זמן תגובה ממוצע", value: "92ms", icon: Clock, color: "text-violet-600 bg-violet-100" },
  { label: "APIs קרובים למגבלה", value: "4", icon: AlertTriangle, color: "text-amber-600 bg-amber-100" },
  { label: "IPs חסומים", value: "7", icon: WifiOff, color: "text-orange-600 bg-orange-100" },
];

/* ── Rate Policies ── */
const FALLBACK_POLICIES = [
  { id: 1, name: "API לקוחות — קריאה", target: "API", endpoint: "/api/v1/customers", limitType: "בקשות/דקה", limit: 120, current: 98, status: "warning" },
  { id: 2, name: "API מלאי — סנכרון", target: "API", endpoint: "/api/v1/inventory", limitType: "בקשות/דקה", limit: 200, current: 178, status: "warning" },
  { id: 3, name: "Webhook הזמנות", target: "Webhook", endpoint: "/webhooks/orders", limitType: "בקשות/שעה", limit: 5000, current: 2340, status: "active" },
  { id: 4, name: "API חילן — שכר", target: "מחבר חיצוני", endpoint: "hilan.co.il/api", limitType: "בקשות/שעה", limit: 1000, current: 420, status: "active" },
  { id: 5, name: "API הזמנות רכש", target: "API", endpoint: "/api/v1/purchase-orders", limitType: "בקשות/דקה", limit: 80, current: 74, status: "critical" },
  { id: 6, name: "דוחות BI — ייצוא", target: "API", endpoint: "/api/v1/reports/export", limitType: "רוחב פס MB/שעה", limit: 500, current: 125, status: "active" },
  { id: 7, name: "WhatsApp Business", target: "מחבר חיצוני", endpoint: "graph.facebook.com", limitType: "בקשות/דקה", limit: 60, current: 55, status: "warning" },
  { id: 8, name: "API ייצור — פקודות עבודה", target: "API", endpoint: "/api/v1/work-orders", limitType: "בקשות/דקה", limit: 150, current: 68, status: "active" },
  { id: 9, name: "Webhook שינוי מלאי", target: "Webhook", endpoint: "/webhooks/stock-change", limitType: "בקשות/שעה", limit: 10000, current: 3100, status: "active" },
  { id: 10, name: "API כספים — חשבוניות", target: "API", endpoint: "/api/v1/invoices", limitType: "בקשות/דקה", limit: 100, current: 42, status: "active" },
  { id: 11, name: "DHL Shipping API", target: "מחבר חיצוני", endpoint: "api-eu.dhl.com", limitType: "בקשות/דקה", limit: 30, current: 28, status: "critical" },
  { id: 12, name: "Salesforce Sync", target: "מחבר חיצוני", endpoint: "salesforce.com/api", limitType: "בקשות/שעה", limit: 2000, current: 850, status: "active" },
];

/* ── API Consumers ── */
const FALLBACK_CONSUMERS = [
  { name: "מודול CRM", type: "פנימי", requests: 84200, quota: 100000, avgLatency: "68ms", errors: 12, trend: "up" },
  { name: "מודול ייצור", type: "פנימי", requests: 62500, quota: 80000, avgLatency: "95ms", errors: 8, trend: "up" },
  { name: "מודול מלאי", type: "פנימי", requests: 55000, quota: 60000, avgLatency: "45ms", errors: 3, trend: "stable" },
  { name: "אפליקציית מובייל", type: "חיצוני", requests: 41200, quota: 50000, avgLatency: "120ms", errors: 45, trend: "up" },
  { name: "מערכת שכר חילן", type: "צד שלישי", requests: 12800, quota: 20000, avgLatency: "210ms", errors: 2, trend: "stable" },
  { name: "פורטל לקוחות", type: "חיצוני", requests: 28500, quota: 40000, avgLatency: "88ms", errors: 18, trend: "down" },
  { name: "שירות BI ודוחות", type: "פנימי", requests: 18900, quota: 25000, avgLatency: "340ms", errors: 5, trend: "stable" },
  { name: "Webhook Engine", type: "פנימי", requests: 35000, quota: 50000, avgLatency: "32ms", errors: 1, trend: "up" },
  { name: "ERP Mobile Lite", type: "חיצוני", requests: 9800, quota: 15000, avgLatency: "155ms", errors: 22, trend: "down" },
];

/* ── Blocked IPs ── */
const FALLBACK_BLOCKED_IPS = [
  { ip: "185.220.101.34", reason: "Brute-force על /api/v1/auth/token", blockedAt: "08/04/2026 14:22", autoUnblock: "09/04/2026 14:22", attempts: 2480, country: "רוסיה" },
  { ip: "91.132.147.88", reason: "חריגה חוזרת ממגבלת בקשות", blockedAt: "07/04/2026 09:15", autoUnblock: "10/04/2026 09:15", attempts: 890, country: "אוקראינה" },
  { ip: "45.95.168.220", reason: "סריקת Endpoints לא מורשית", blockedAt: "08/04/2026 03:41", autoUnblock: "11/04/2026 03:41", attempts: 3200, country: "הולנד" },
  { ip: "192.168.50.112", reason: "Rate limit חריג — מודול מלאי", blockedAt: "08/04/2026 11:05", autoUnblock: "08/04/2026 17:05", attempts: 520, country: "רשת פנימית" },
  { ip: "103.152.220.15", reason: "ניסיון SQL Injection ב-API", blockedAt: "06/04/2026 21:30", autoUnblock: "13/04/2026 21:30", attempts: 150, country: "סין" },
  { ip: "77.247.181.162", reason: "DDoS pattern — בקשות מבוזרות", blockedAt: "08/04/2026 06:18", autoUnblock: "15/04/2026 06:18", attempts: 15400, country: "גרמניה" },
  { ip: "23.129.64.210", reason: "Tor exit node — מדיניות חסימה", blockedAt: "05/04/2026 18:00", autoUnblock: "ידני בלבד", attempts: 340, country: "ארה״ב" },
];

/* ── Helpers ── */
const usagePct = (current: number, limit: number) => Math.round((current / limit) * 100);

const progressColor = (pct: number) => {
  if (pct >= 90) return "[&>div]:bg-red-500";
  if (pct >= 70) return "[&>div]:bg-amber-500";
  return "[&>div]:bg-emerald-500";
};

const statusBadge = (s: string) => {
  if (s === "critical") return <Badge className="bg-red-100 text-red-700 border-red-200">קריטי</Badge>;
  if (s === "warning") return <Badge className="bg-amber-100 text-amber-700 border-amber-200">אזהרה</Badge>;
  return <Badge className="bg-green-100 text-green-700 border-green-200">פעיל</Badge>;
};

const targetBadge = (t: string) => {
  if (t === "Webhook") return <Badge variant="outline" className="border-purple-300 text-purple-700"><Zap className="w-3 h-3 ml-1" />{t}</Badge>;
  if (t === "מחבר חיצוני") return <Badge variant="outline" className="border-cyan-300 text-cyan-700"><Globe className="w-3 h-3 ml-1" />{t}</Badge>;
  return <Badge variant="outline" className="border-blue-300 text-blue-700"><Server className="w-3 h-3 ml-1" />{t}</Badge>;
};

const trendIcon = (t: string) => {
  if (t === "up") return <span className="text-red-500 text-xs font-bold">&#9650;</span>;
  if (t === "down") return <span className="text-green-500 text-xs font-bold">&#9660;</span>;
  return <span className="text-gray-400 text-xs">&#9644;</span>;
};

const typeBadge = (t: string) => {
  if (t === "פנימי") return <Badge className="bg-blue-100 text-blue-700">פנימי</Badge>;
  if (t === "חיצוני") return <Badge className="bg-purple-100 text-purple-700">חיצוני</Badge>;
  return <Badge className="bg-cyan-100 text-cyan-700">צד שלישי</Badge>;
};

/* ══════════════════════════════════════════════════════════ */

export default function RateLimitsPage() {

  const { data: apiData } = useQuery({
    queryKey: ["rate_limits"],
    queryFn: () => authFetch("/api/integrations/rate-limits").then(r => r.json()),
    staleTime: 60_000,
    retry: 1,
  });
  const kpis = apiData?.kpis ?? FALLBACK_KPIS;
  const policies = apiData?.policies ?? FALLBACK_POLICIES;
  const consumers = apiData?.consumers ?? FALLBACK_CONSUMERS;
  const blockedIps = apiData?.blockedIps ?? FALLBACK_BLOCKED_IPS;
  const [activeTab, setActiveTab] = useState("policies");
  const [search, setSearch] = useState("");

  const filteredPolicies = policies.filter(
    (p) => p.name.includes(search) || p.endpoint.includes(search)
  );

  return (
    <div dir="rtl" className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Gauge className="w-7 h-7 text-blue-600" />
            ניהול הגבלות קצב (Rate Limits)
          </h1>
          <p className="text-muted-foreground mt-1">ניטור, תצורה וניהול מדיניות הגבלת קצב API עבור כלל האינטגרציות</p>
        </div>
        <Button className="gap-2"><Plus className="w-4 h-4" />מדיניות חדשה</Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${k.color}`}><k.icon className="w-5 h-5" /></div>
              <div>
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <p className="text-lg font-bold">{k.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="policies">מדיניות הגבלה</TabsTrigger>
          <TabsTrigger value="monitoring">ניטור שימוש</TabsTrigger>
          <TabsTrigger value="blocked">IPs חסומים</TabsTrigger>
          <TabsTrigger value="config">תצורה</TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Rate Policies ── */}
        <TabsContent value="policies" className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="חיפוש מדיניות..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-10" />
            </div>
            <Badge variant="secondary">{filteredPolicies.length} מדיניות</Badge>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-3 text-right font-medium">שם מדיניות</th>
                      <th className="p-3 text-right font-medium">יעד</th>
                      <th className="p-3 text-right font-medium">Endpoint</th>
                      <th className="p-3 text-right font-medium">סוג מגבלה</th>
                      <th className="p-3 text-right font-medium">שימוש נוכחי</th>
                      <th className="p-3 text-center font-medium">סטטוס</th>
                      <th className="p-3 text-center font-medium">פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPolicies.map((p) => {
                      const pct = usagePct(p.current, p.limit);
                      return (
                        <tr key={p.id} className="border-b hover:bg-muted/30 transition-colors">
                          <td className="p-3 font-medium">{p.name}</td>
                          <td className="p-3">{targetBadge(p.target)}</td>
                          <td className="p-3"><code className="text-xs bg-muted px-2 py-1 rounded">{p.endpoint}</code></td>
                          <td className="p-3 text-muted-foreground">{p.limitType}</td>
                          <td className="p-3 w-52">
                            <div className="flex items-center gap-2">
                              <Progress value={pct} className={`h-2 flex-1 ${progressColor(pct)}`} />
                              <span className={`text-xs font-bold min-w-[60px] text-left ${pct >= 90 ? "text-red-600" : pct >= 70 ? "text-amber-600" : "text-emerald-600"}`}>
                                {fmt(p.current)}/{fmt(p.limit)}
                              </span>
                            </div>
                          </td>
                          <td className="p-3 text-center">{statusBadge(p.status)}</td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7"><Eye className="w-3.5 h-3.5" /></Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7"><Settings className="w-3.5 h-3.5" /></Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 2: Usage Monitoring ── */}
        <TabsContent value="monitoring" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Quota Alerts */}
            <Card className="lg:col-span-1">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-500" />התראות מכסה</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { api: "API לקוחות", pct: 82, threshold: 80 },
                  { api: "API מלאי", pct: 92, threshold: 80 },
                  { api: "WhatsApp Business", pct: 91, threshold: 85 },
                  { api: "DHL Shipping", pct: 93, threshold: 75 },
                ].map((a) => (
                  <div key={a.api} className="p-3 rounded-lg border bg-muted/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{a.api}</span>
                      <Badge className={a.pct >= 90 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}>{a.pct}%</Badge>
                    </div>
                    <Progress value={a.pct} className={`h-1.5 ${progressColor(a.pct)}`} />
                    <p className="text-xs text-muted-foreground">סף התראה: {a.threshold}%</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Top Consumers */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><Users className="w-4 h-4 text-blue-500" />צרכני API מובילים</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="p-3 text-right font-medium">צרכן</th>
                        <th className="p-3 text-right font-medium">סוג</th>
                        <th className="p-3 text-right font-medium">בקשות / מכסה</th>
                        <th className="p-3 text-right font-medium">Latency</th>
                        <th className="p-3 text-right font-medium">שגיאות</th>
                        <th className="p-3 text-center font-medium">מגמה</th>
                      </tr>
                    </thead>
                    <tbody>
                      {consumers.map((c) => {
                        const pct = usagePct(c.requests, c.quota);
                        return (
                          <tr key={c.name} className="border-b hover:bg-muted/30 transition-colors">
                            <td className="p-3 font-medium">{c.name}</td>
                            <td className="p-3">{typeBadge(c.type)}</td>
                            <td className="p-3 w-48">
                              <div className="flex items-center gap-2">
                                <Progress value={pct} className={`h-2 flex-1 ${progressColor(pct)}`} />
                                <span className="text-xs text-muted-foreground min-w-[40px] text-left">{pct}%</span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">{fmt(c.requests)} / {fmt(c.quota)}</p>
                            </td>
                            <td className="p-3 text-muted-foreground">{c.avgLatency}</td>
                            <td className="p-3">
                              <span className={c.errors > 20 ? "text-red-600 font-semibold" : "text-muted-foreground"}>{fmt(c.errors)}</span>
                            </td>
                            <td className="p-3 text-center">{trendIcon(c.trend)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Simulated Usage Timeline */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Activity className="w-4 h-4 text-emerald-500" />שימוש לפי שעות — היום</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-1 h-32">
                {[18, 12, 8, 5, 4, 6, 22, 48, 72, 85, 91, 78, 65, 58, 70, 82, 88, 74, 55, 38, 25, 20, 15, 10].map((v, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className={`w-full rounded-t transition-all ${v >= 85 ? "bg-red-400" : v >= 65 ? "bg-amber-400" : "bg-emerald-400"}`}
                      style={{ height: `${v}%` }}
                    />
                    {i % 4 === 0 && <span className="text-[10px] text-muted-foreground">{String(i).padStart(2, "0")}:00</span>}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-400" />נורמלי (&lt;65%)</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-400" />גבוה (65-85%)</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-400" />קריטי (&gt;85%)</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 3: Blocked IPs ── */}
        <TabsContent value="blocked" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">סה״כ <span className="font-bold text-foreground">{blockedIps.length}</span> כתובות חסומות כעת</p>
            <Button variant="outline" className="gap-2"><RefreshCw className="w-4 h-4" />רענון</Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-3 text-right font-medium">כתובת IP</th>
                      <th className="p-3 text-right font-medium">מדינה</th>
                      <th className="p-3 text-right font-medium">סיבת חסימה</th>
                      <th className="p-3 text-right font-medium">ניסיונות</th>
                      <th className="p-3 text-right font-medium">זמן חסימה</th>
                      <th className="p-3 text-right font-medium">שחרור אוטומטי</th>
                      <th className="p-3 text-center font-medium">פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {blockedIps.map((b) => (
                      <tr key={b.ip} className="border-b hover:bg-muted/30 transition-colors">
                        <td className="p-3"><code className="bg-red-50 text-red-700 px-2 py-1 rounded font-mono text-xs">{b.ip}</code></td>
                        <td className="p-3 text-muted-foreground">{b.country}</td>
                        <td className="p-3 max-w-xs"><span className="text-sm">{b.reason}</span></td>
                        <td className="p-3">
                          <Badge className={b.attempts > 1000 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}>{fmt(b.attempts)}</Badge>
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">{b.blockedAt}</td>
                        <td className="p-3 text-xs">
                          {b.autoUnblock === "ידני בלבד"
                            ? <Badge variant="outline" className="border-red-300 text-red-600">ידני בלבד</Badge>
                            : <span className="text-muted-foreground">{b.autoUnblock}</span>
                          }
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button variant="ghost" size="sm" className="h-7 gap-1 text-green-600 hover:text-green-700 hover:bg-green-50">
                              <Unlock className="w-3.5 h-3.5" />שחרר
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-red-600">
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 4: Configuration ── */}
        <TabsContent value="config" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Global Defaults */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><Settings className="w-4 h-4 text-blue-500" />ברירות מחדל גלובליות</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { label: "מגבלת בקשות/דקה (ברירת מחדל)", value: "100" },
                  { label: "מגבלת בקשות/שעה (ברירת מחדל)", value: "5,000" },
                  { label: "מגבלת רוחב פס (MB/שעה)", value: "500" },
                  { label: "זמן המתנה מקסימלי (timeout, שניות)", value: "30" },
                ].map((f) => (
                  <div key={f.label} className="flex items-center justify-between gap-4">
                    <label className="text-sm font-medium flex-1">{f.label}</label>
                    <Input className="w-32 text-left" defaultValue={f.value} />
                  </div>
                ))}
                <Button className="w-full mt-2">שמור שינויים</Button>
              </CardContent>
            </Card>

            {/* Burst Settings */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><Zap className="w-4 h-4 text-amber-500" />הגדרות Burst</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { label: "אפשר Burst מעבר למגבלה", value: "כן" },
                  { label: "מכפיל Burst מקסימלי", value: "1.5x" },
                  { label: "משך Burst מקסימלי (שניות)", value: "15" },
                  { label: "תקופת צינון אחרי Burst (שניות)", value: "60" },
                ].map((f) => (
                  <div key={f.label} className="flex items-center justify-between gap-4">
                    <label className="text-sm font-medium flex-1">{f.label}</label>
                    <Input className="w-32 text-left" defaultValue={f.value} />
                  </div>
                ))}
                <Button className="w-full mt-2">שמור שינויים</Button>
              </CardContent>
            </Card>

            {/* Whitelist */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><Wifi className="w-4 h-4 text-green-500" />רשימה לבנה (Whitelist)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { ip: "10.0.0.0/8", desc: "רשת פנימית — ללא הגבלה" },
                  { ip: "172.16.0.0/12", desc: "רשת Docker פנימית" },
                  { ip: "52.29.18.44", desc: "שרת חילן — ללא חסימה" },
                  { ip: "34.120.55.12", desc: "Salesforce Webhook IP" },
                  { ip: "185.60.216.0/24", desc: "WhatsApp Business — Meta" },
                ].map((w) => (
                  <div key={w.ip} className="flex items-center justify-between p-2 rounded border bg-muted/30">
                    <div>
                      <code className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded font-mono">{w.ip}</code>
                      <p className="text-xs text-muted-foreground mt-1">{w.desc}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                ))}
                <Button variant="outline" className="w-full gap-2"><Plus className="w-4 h-4" />הוסף כתובת</Button>
              </CardContent>
            </Card>

            {/* Escalation Rules */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-500" />כללי הסלמה</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { rule: "חריגה ראשונה", action: "אזהרה בלוג + התראת מייל", delay: "מיידי", active: true },
                  { rule: "3 חריגות בשעה", action: "הגבלת קצב ל-50% + התראת SMS", delay: "5 דקות", active: true },
                  { rule: "10 חריגות ביום", action: "חסימה אוטומטית ל-6 שעות", delay: "מיידי", active: true },
                  { rule: "חריגת Burst", action: "צינון 60 שניות + לוג", delay: "מיידי", active: true },
                  { rule: "ניסיון Brute-force", action: "חסימת IP ל-24 שעות + התראה", delay: "מיידי", active: false },
                ].map((r) => (
                  <div key={r.rule} className={`p-3 rounded-lg border space-y-1 ${r.active ? "bg-muted/30" : "bg-muted/10 opacity-60"}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{r.rule}</span>
                      <Badge className={r.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}>
                        {r.active ? "פעיל" : "מושבת"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{r.action}</p>
                    <p className="text-xs text-muted-foreground">עיכוב: {r.delay}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
