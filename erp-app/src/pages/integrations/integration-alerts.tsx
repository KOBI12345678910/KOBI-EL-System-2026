import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Bell, AlertTriangle, AlertOctagon, Activity, Clock, Shield,
  Wifi, WifiOff, RefreshCw, Zap, Lock, BarChart3, TrendingUp,
  ArrowUpRight, CheckCircle2, XCircle, Settings, Send, Globe,
} from "lucide-react";

// ── Alert types ──
const FALLBACK_ALERT_TYPES = [
  { id: "connector_down", label: "מחבר לא זמין", icon: WifiOff, color: "text-red-400" },
  { id: "sync_failed", label: "סנכרון נכשל", icon: XCircle, color: "text-red-400" },
  { id: "dlq_threshold", label: "חריגת DLQ", icon: AlertOctagon, color: "text-orange-400" },
  { id: "rate_limit", label: "חריגת Rate Limit", icon: Zap, color: "text-amber-400" },
  { id: "cert_expiring", label: "תעודה פגת תוקף", icon: Shield, color: "text-yellow-400" },
  { id: "webhook_failed", label: "Webhook נכשל", icon: Send, color: "text-rose-400" },
  { id: "latency_spike", label: "עלייה בזמן תגובה", icon: Activity, color: "text-purple-400" },
  { id: "auth_expiring", label: "טוקן אימות פג", icon: Lock, color: "text-orange-400" },
] as const;

type Severity = "critical" | "high" | "medium" | "low";
interface Alert { id: number; type: string; severity: Severity; description: string; integration: string; timestamp: string; action: string }

const SEVERITY_CONFIG: Record<Severity, { label: string; bg: string; text: string }> = {
  critical: { label: "קריטי", bg: "bg-red-500/20", text: "text-red-400" },
  high: { label: "גבוה", bg: "bg-orange-500/20", text: "text-orange-400" },
  medium: { label: "בינוני", bg: "bg-amber-500/20", text: "text-amber-400" },
  low: { label: "נמוך", bg: "bg-blue-500/20", text: "text-blue-400" },
};

const FALLBACK_ALERTS: Alert[] = [
  { id: 1, type: "connector_down", severity: "critical", description: "מחבר SAP B1 לא מגיב מזה 12 דקות", integration: "SAP Business One", timestamp: "08/04/2026 09:42", action: "הפעל חיבור מחדש" },
  { id: 2, type: "sync_failed", severity: "critical", description: "סנכרון הזמנות חשבשבת נכשל – timeout", integration: "חשבשבת", timestamp: "08/04/2026 09:38", action: "בדוק חיבור DB" },
  { id: 3, type: "dlq_threshold", severity: "high", description: "248 הודעות בתור DLQ של מלאי", integration: "WMS מחסן ראשי", timestamp: "08/04/2026 09:30", action: "שחזר הודעות" },
  { id: 4, type: "rate_limit", severity: "high", description: "חריגה מ-500 קריאות/דקה ב-API לקוחות", integration: "CRM API", timestamp: "08/04/2026 09:25", action: "הפעל throttling" },
  { id: 5, type: "webhook_failed", severity: "high", description: "Webhook הזמנות לא חזר 200 – 3 ניסיונות נכשלו", integration: "Shopify IL", timestamp: "08/04/2026 09:20", action: "שלח ידנית" },
  { id: 6, type: "latency_spike", severity: "medium", description: "זמן תגובה ממוצע 4.2s – חריגה מ-p95", integration: "ERP Gateway", timestamp: "08/04/2026 09:15", action: "בדוק עומסים" },
  { id: 7, type: "cert_expiring", severity: "medium", description: "תעודת SSL פגה בעוד 7 ימים", integration: "API Gateway Prod", timestamp: "08/04/2026 09:10", action: "חדש תעודה" },
  { id: 8, type: "auth_expiring", severity: "medium", description: "OAuth token של Google פג בעוד 48 שעות", integration: "Google Workspace", timestamp: "08/04/2026 09:05", action: "רענן טוקן" },
  { id: 9, type: "sync_failed", severity: "medium", description: "סנכרון אנשי קשר – 14 רשומות עם שגיאה", integration: "HubSpot", timestamp: "08/04/2026 08:55", action: "בדוק מיפוי שדות" },
  { id: 10, type: "rate_limit", severity: "low", description: "קרוב למכסה – 420/500 קריאות/דקה", integration: "Stripe API", timestamp: "08/04/2026 08:50", action: "עקוב" },
  { id: 11, type: "latency_spike", severity: "low", description: "p99 עלה ל-2.8s – עדיין בטווח", integration: "מסלקה בנקאית", timestamp: "08/04/2026 08:40", action: "עקוב" },
  { id: 12, type: "connector_down", severity: "low", description: "מחבר בדיקה לא זמין (sandbox)", integration: "Sandbox ENV", timestamp: "08/04/2026 08:30", action: "התעלם" },
];

const FALLBACK_TRAFFIC_DATA = [
  { name: "SAP B1", calls: 34200 },
  { name: "חשבשבת", calls: 28900 },
  { name: "CRM API", calls: 22400 },
  { name: "Shopify IL", calls: 18700 },
  { name: "WMS מחסן", calls: 15300 },
  { name: "Google WS", calls: 12100 },
  { name: "HubSpot", calls: 9800 },
  { name: "Stripe", calls: 7600 },
  { name: "מסלקה", calls: 5200 },
  { name: "Sandbox", calls: 1400 },
];

const FALLBACK_ERROR_TREND = [
  { day: "02/04", rate: 0.4 },
  { day: "03/04", rate: 0.3 },
  { day: "04/04", rate: 0.5 },
  { day: "05/04", rate: 0.2 },
  { day: "06/04", rate: 0.6 },
  { day: "07/04", rate: 0.3 },
  { day: "08/04", rate: 0.3 },
];

const FALLBACK_LATENCY_DATA = [
  { service: "SAP B1", p50: 120, p95: 380, p99: 820 },
  { service: "חשבשבת", p50: 95, p95: 310, p99: 680 },
  { service: "CRM API", p50: 45, p95: 150, p99: 420 },
  { service: "Shopify IL", p50: 180, p95: 520, p99: 1100 },
  { service: "WMS מחסן", p50: 60, p95: 200, p99: 510 },
  { service: "ERP Gateway", p50: 85, p95: 290, p99: 740 },
];


const TRAFFIC_DATA = FALLBACK_TRAFFIC_DATA;

const DAILY_VOLUME = { events: 48720, apiCalls: 155600, webhooks: 12340 };
const maxCalls = Math.max(...TRAFFIC_DATA.map((d) => d.calls));

export default function IntegrationAlertsPage() {

  const { data: apiData } = useQuery({
    queryKey: ["integration_alerts"],
    queryFn: () => authFetch("/api/integrations/integration-alerts").then(r => r.json()),
    staleTime: 60_000,
    retry: 1,
  });
  const TRAFFIC_DATA = FALLBACK_TRAFFIC_DATA;
  const ALERT_TYPES = apiData?.ALERT_TYPES ?? FALLBACK_ALERT_TYPES;
  const ALERTS = apiData?.ALERTS ?? FALLBACK_ALERTS;
  const ERROR_TREND = apiData?.ERROR_TREND ?? FALLBACK_ERROR_TREND;
  const LATENCY_DATA = apiData?.LATENCY_DATA ?? FALLBACK_LATENCY_DATA;
  const [activeTab, setActiveTab] = useState("alerts");
  const [severityFilter, setSeverityFilter] = useState<Severity | "all">("all");

  const filtered = severityFilter === "all"
    ? ALERTS
    : ALERTS.filter((a) => a.severity === severityFilter);

  const criticalCount = ALERTS.filter((a) => a.severity === "critical").length;

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 space-y-6 text-white">
      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
          <Bell className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">התראות ואנליטיקת אינטגרציות</h1>
          <p className="text-sm text-slate-400">טכנו-כל עוזי &mdash; ניטור בזמן אמת</p>
        </div>
      </div>

      {/* ── KPI Strip ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: "התראות פעילות", value: "8", icon: Bell, color: "text-amber-400", bg: "bg-amber-500/20" },
          { label: "קריטיות", value: String(criticalCount), icon: AlertOctagon, color: "text-red-400", bg: "bg-red-500/20" },
          { label: "Throughput", value: "128 ev/min", icon: Activity, color: "text-emerald-400", bg: "bg-emerald-500/20" },
          { label: "Error Rate", value: "0.3%", icon: TrendingUp, color: "text-sky-400", bg: "bg-sky-500/20" },
          { label: "Uptime", value: "99.7%", icon: CheckCircle2, color: "text-green-400", bg: "bg-green-500/20" },
        ].map((kpi) => (
          <Card key={kpi.label} className="bg-slate-800/60 border-slate-700">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg ${kpi.bg} flex items-center justify-center`}>
                <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
              </div>
              <div>
                <p className="text-xs text-slate-400">{kpi.label}</p>
                <p className={`text-lg font-bold ${kpi.color}`}>{kpi.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Alert Types ── */}
      <Card className="bg-slate-800/60 border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-200">סוגי התראות</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {ALERT_TYPES.map((t) => {
              const count = ALERTS.filter((a) => a.type === t.id).length;
              return (
                <div key={t.id} className="flex items-center gap-2 p-2 rounded-lg bg-slate-700/40 border border-slate-600/40">
                  <t.icon className={`w-4 h-4 ${t.color}`} />
                  <span className="text-sm text-slate-300 flex-1">{t.label}</span>
                  <Badge variant="secondary" className="text-xs">{count}</Badge>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── Tabs ── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-slate-800 border border-slate-700">
          <TabsTrigger value="alerts" className="data-[state=active]:bg-slate-700">
            <Bell className="w-4 h-4 ml-1.5" /> התראות
          </TabsTrigger>
          <TabsTrigger value="analytics" className="data-[state=active]:bg-slate-700">
            <BarChart3 className="w-4 h-4 ml-1.5" /> אנליטיקה
          </TabsTrigger>
          <TabsTrigger value="settings" className="data-[state=active]:bg-slate-700">
            <Settings className="w-4 h-4 ml-1.5" /> הגדרות
          </TabsTrigger>
        </TabsList>

        {/* ── TAB: Alerts ── */}
        <TabsContent value="alerts" className="space-y-4 mt-4">
          {/* Severity filter */}
          <div className="flex gap-2 flex-wrap">
            {(["all", "critical", "high", "medium", "low"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSeverityFilter(s)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                  severityFilter === s
                    ? "bg-slate-600 text-white"
                    : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                }`}
              >
                {s === "all" ? "הכל" : SEVERITY_CONFIG[s].label} ({s === "all" ? ALERTS.length : ALERTS.filter((a) => a.severity === s).length})
              </button>
            ))}
          </div>

          {/* Alerts list */}
          <div className="space-y-3">
            {filtered.map((alert) => {
              const sev = SEVERITY_CONFIG[alert.severity];
              const typeInfo = ALERT_TYPES.find((t) => t.id === alert.type);
              const TypeIcon = typeInfo?.icon || AlertTriangle;
              return (
                <Card key={alert.id} className="bg-slate-800/60 border-slate-700">
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className={`w-9 h-9 rounded-lg ${sev.bg} flex items-center justify-center shrink-0`}>
                        <TypeIcon className={`w-4 h-4 ${sev.text}`} />
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className={`${sev.bg} ${sev.text} border-0 text-xs`}>{sev.label}</Badge>
                          <span className="text-sm font-semibold text-slate-200">{typeInfo?.label}</span>
                          <span className="text-xs text-slate-500">{alert.timestamp}</span>
                        </div>
                        <p className="text-sm text-slate-300">{alert.description}</p>
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <Globe className="w-3 h-3" />
                          <span>{alert.integration}</span>
                        </div>
                      </div>
                      <button className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs text-slate-200 transition whitespace-nowrap">
                        {alert.action}
                      </button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* ── TAB: Analytics ── */}
        <TabsContent value="analytics" className="space-y-6 mt-4">
          {/* Daily volume */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { label: "אירועים יומיים", value: DAILY_VOLUME.events.toLocaleString("he-IL"), icon: Activity, color: "text-emerald-400", bg: "bg-emerald-500/20" },
              { label: "קריאות API", value: DAILY_VOLUME.apiCalls.toLocaleString("he-IL"), icon: ArrowUpRight, color: "text-sky-400", bg: "bg-sky-500/20" },
              { label: "Webhooks", value: DAILY_VOLUME.webhooks.toLocaleString("he-IL"), icon: Send, color: "text-purple-400", bg: "bg-purple-500/20" },
            ].map((v) => (
              <Card key={v.label} className="bg-slate-800/60 border-slate-700">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg ${v.bg} flex items-center justify-center`}>
                    <v.icon className={`w-4 h-4 ${v.color}`} />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">{v.label}</p>
                    <p className={`text-lg font-bold ${v.color}`}>{v.value}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Traffic by integration – horizontal bars */}
          <Card className="bg-slate-800/60 border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-slate-200">תעבורה לפי אינטגרציה (Top 10)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {TRAFFIC_DATA.map((d) => (
                <div key={d.name} className="flex items-center gap-3">
                  <span className="text-sm text-slate-300 w-24 truncate">{d.name}</span>
                  <div className="flex-1">
                    <Progress value={(d.calls / maxCalls) * 100} className="h-3 bg-slate-700" />
                  </div>
                  <span className="text-xs text-slate-400 w-16 text-left">{d.calls.toLocaleString("he-IL")}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Error rate trend – 7 days */}
          <Card className="bg-slate-800/60 border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-slate-200">מגמת Error Rate &mdash; 7 ימים</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-4 h-40">
                {ERROR_TREND.map((d) => (
                  <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs text-slate-400">{d.rate}%</span>
                    <div
                      className="w-full rounded-t bg-gradient-to-t from-rose-500/80 to-rose-400/60 transition-all"
                      style={{ height: `${(d.rate / 0.8) * 100}%` }}
                    />
                    <span className="text-xs text-slate-500">{d.day}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Latency percentiles */}
          <Card className="bg-slate-800/60 border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-slate-200">Latency Percentiles (ms)</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-slate-400 text-right">שירות</TableHead>
                    <TableHead className="text-slate-400 text-center">p50</TableHead>
                    <TableHead className="text-slate-400 text-center">p95</TableHead>
                    <TableHead className="text-slate-400 text-center">p99</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {LATENCY_DATA.map((row) => (
                    <TableRow key={row.service} className="border-slate-700/50">
                      <TableCell className="text-sm text-slate-300 font-medium">{row.service}</TableCell>
                      <TableCell className="text-center text-sm text-emerald-400">{row.p50}</TableCell>
                      <TableCell className="text-center text-sm text-amber-400">{row.p95}</TableCell>
                      <TableCell className="text-center text-sm text-red-400">{row.p99}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB: Settings ── */}
        <TabsContent value="settings" className="space-y-4 mt-4">
          <Card className="bg-slate-800/60 border-slate-700">
            <CardHeader>
              <CardTitle className="text-base text-slate-200">הגדרות התראות</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { label: "ערוץ התראות ברירת מחדל", value: "Slack + Email" },
                { label: "סף DLQ (הודעות)", value: "200" },
                { label: "סף Latency קריטי (ms)", value: "2000" },
                { label: "Rate Limit אזהרה (%)", value: "80%" },
                { label: "התראת תעודה (ימים לפני פקיעה)", value: "14" },
                { label: "ניסיונות Webhook מקסימליים", value: "5" },
                { label: "חלון שקט (דקות)", value: "30" },
                { label: "Escalation אוטומטי", value: "פעיל" },
              ].map((s) => (
                <div key={s.label} className="flex items-center justify-between py-2 border-b border-slate-700/50 last:border-0">
                  <span className="text-sm text-slate-300">{s.label}</span>
                  <span className="text-sm font-medium text-slate-100">{s.value}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
