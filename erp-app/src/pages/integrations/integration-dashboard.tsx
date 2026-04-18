import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Plug, Activity, Webhook, Server, RefreshCw, Zap, AlertTriangle,
  HeartPulse, Clock, CheckCircle2, XCircle, ArrowUpRight, ArrowDownRight,
  Radio, Database, Shield, Gauge, TrendingUp, Globe, Send, BarChart3,
  Bell, FileWarning, Cpu, Link2, Timer, Hash
} from "lucide-react";

// ────────────────────────────── KPI Data ──────────────────────────────

const FALLBACK_KPI_CARDS = [
  { label: "APIs פעילים", value: "24", icon: Globe, color: "text-blue-400", bg: "bg-blue-500/15", trend: "+2" },
  { label: "Webhooks", value: "18", icon: Webhook, color: "text-violet-400", bg: "bg-violet-500/15", trend: "+1" },
  { label: "MCP Servers", value: "6", icon: Server, color: "text-cyan-400", bg: "bg-cyan-500/15", trend: "0" },
  { label: "Sync Jobs", value: "12", icon: RefreshCw, color: "text-emerald-400", bg: "bg-emerald-500/15", trend: "+3" },
  { label: "Events היום", value: "1,847", icon: Zap, color: "text-amber-400", bg: "bg-amber-500/15", trend: "+12%" },
  { label: "שגיאות", value: "3", icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/15", trend: "-2" },
  { label: "Health Score", value: "97.2%", icon: HeartPulse, color: "text-green-400", bg: "bg-green-500/15", trend: "+0.4%" },
  { label: "Latency ממוצע", value: "145ms", icon: Gauge, color: "text-orange-400", bg: "bg-orange-500/15", trend: "-12ms" },
];

// ────────────────────────────── System Health ──────────────────────────────

type HealthStatus = "operational" | "degraded" | "down";

interface SystemModule {
  name: string;
  nameHe: string;
  status: HealthStatus;
  uptime: string;
  latency: string;
  icon: React.ComponentType<{ className?: string }>;
  detail: string;
}

const FALLBACK_SYSTEM_MODULES: SystemModule[] = [
  { name: "API Gateway", nameHe: "שער API", status: "operational", uptime: "99.98%", latency: "42ms", icon: Globe, detail: "24 endpoints פעילים, 0 שגיאות 5xx" },
  { name: "Webhook Gateway", nameHe: "שער Webhooks", status: "operational", uptime: "99.95%", latency: "78ms", icon: Webhook, detail: "18 webhooks רשומים, delivery rate 99.7%" },
  { name: "Event Bus", nameHe: "אפיק אירועים", status: "operational", uptime: "99.99%", latency: "12ms", icon: Radio, detail: "Kafka cluster 3 nodes, 1,847 events היום" },
  { name: "MCP Hub", nameHe: "רכזת MCP", status: "operational", uptime: "99.97%", latency: "95ms", icon: Cpu, detail: "6 servers מחוברים, כולם responsive" },
  { name: "Sync Engine", nameHe: "מנוע סנכרון", status: "degraded", uptime: "98.50%", latency: "320ms", icon: RefreshCw, detail: "2 jobs בעיכוב, avg sync time עלה ב-15%" },
  { name: "DLQ", nameHe: "תור הודעות כושלות", status: "down", uptime: "N/A", latency: "N/A", icon: FileWarning, detail: "3 הודעות ב-Dead Letter Queue דורשות טיפול" },
];

const statusConfig: Record<HealthStatus, { label: string; color: string; badgeClass: string }> = {
  operational: { label: "תקין", color: "text-green-400", badgeClass: "bg-green-500/15 text-green-400 border-green-500/30" },
  degraded: { label: "מופחת", color: "text-amber-400", badgeClass: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  down: { label: "תקלה", color: "text-red-400", badgeClass: "bg-red-500/15 text-red-400 border-red-500/30" },
};

// ────────────────────────────── Live Activity Feed ──────────────────────────────

interface ActivityEvent {
  id: number;
  timestamp: string;
  type: string;
  typeBadge: string;
  source: string;
  target: string;
  status: "success" | "error" | "warning" | "pending";
  duration: string;
  detail: string;
}

const FALLBACK_ACTIVITY_FEED: ActivityEvent[] = [
  { id: 1, timestamp: "14:32:08", type: "API Call", typeBadge: "bg-blue-500/15 text-blue-400", source: "CRM Module", target: "GET /api/customers", status: "success", duration: "45ms", detail: "HTTP 200 — 142 records" },
  { id: 2, timestamp: "14:31:55", type: "Webhook", typeBadge: "bg-violet-500/15 text-violet-400", source: "Stripe", target: "payment.completed", status: "success", duration: "120ms", detail: "HTTP 200 — invoice #INV-2847" },
  { id: 3, timestamp: "14:31:42", type: "Sync", typeBadge: "bg-emerald-500/15 text-emerald-400", source: "SAP B1", target: "Inventory Sync", status: "success", duration: "2.3s", detail: "847 פריטים סונכרנו בהצלחה" },
  { id: 4, timestamp: "14:31:30", type: "Event", typeBadge: "bg-amber-500/15 text-amber-400", source: "Production", target: "order.status.changed", status: "success", duration: "8ms", detail: "WO-2024-0156 → status: completed" },
  { id: 5, timestamp: "14:31:18", type: "API Call", typeBadge: "bg-blue-500/15 text-blue-400", source: "Mobile App", target: "POST /api/orders", status: "success", duration: "230ms", detail: "HTTP 201 — order #ORD-9921" },
  { id: 6, timestamp: "14:30:58", type: "MCP", typeBadge: "bg-cyan-500/15 text-cyan-400", source: "Claude AI", target: "tools/inventory-check", status: "success", duration: "340ms", detail: "Query: 5 SKUs availability check" },
  { id: 7, timestamp: "14:30:44", type: "Webhook", typeBadge: "bg-violet-500/15 text-violet-400", source: "SendGrid", target: "email.delivered", status: "success", duration: "95ms", detail: "Campaign #MC-447 delivery confirmation" },
  { id: 8, timestamp: "14:30:31", type: "API Call", typeBadge: "bg-blue-500/15 text-blue-400", source: "ERP Core", target: "GET /api/reports/daily", status: "error", duration: "5.2s", detail: "HTTP 504 — Gateway Timeout" },
  { id: 9, timestamp: "14:30:15", type: "Sync", typeBadge: "bg-emerald-500/15 text-emerald-400", source: "Priority ERP", target: "GL Accounts Sync", status: "warning", duration: "4.8s", detail: "סונכרנו 95/100 חשבונות, 5 דורשים בדיקה" },
  { id: 10, timestamp: "14:29:58", type: "Event", typeBadge: "bg-amber-500/15 text-amber-400", source: "HR Module", target: "employee.onboarded", status: "success", duration: "5ms", detail: "EMP-2024-089 — שיבוץ מחלקת ייצור" },
  { id: 11, timestamp: "14:29:42", type: "API Call", typeBadge: "bg-blue-500/15 text-blue-400", source: "Dashboard", target: "GET /api/kpi/production", status: "success", duration: "180ms", detail: "HTTP 200 — OEE data refreshed" },
  { id: 12, timestamp: "14:29:30", type: "Webhook", typeBadge: "bg-violet-500/15 text-violet-400", source: "GitHub", target: "push", status: "success", duration: "65ms", detail: "Repo: erp-core, branch: main, 3 commits" },
  { id: 13, timestamp: "14:29:15", type: "MCP", typeBadge: "bg-cyan-500/15 text-cyan-400", source: "Claude AI", target: "tools/create-quote", status: "success", duration: "890ms", detail: "Quote #QT-2024-1122 generated" },
  { id: 14, timestamp: "14:28:58", type: "API Call", typeBadge: "bg-blue-500/15 text-blue-400", source: "Quality Module", target: "POST /api/inspections", status: "error", duration: "1.2s", detail: "HTTP 422 — validation failed on lot_number" },
  { id: 15, timestamp: "14:28:40", type: "Sync", typeBadge: "bg-emerald-500/15 text-emerald-400", source: "WooCommerce", target: "Products Sync", status: "success", duration: "3.1s", detail: "124 מוצרים עודכנו, 3 חדשים נוספו" },
];

const eventStatusConfig: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string }> = {
  success: { icon: CheckCircle2, color: "text-green-400" },
  error: { icon: XCircle, color: "text-red-400" },
  warning: { icon: AlertTriangle, color: "text-amber-400" },
  pending: { icon: Clock, color: "text-blue-400" },
};

// ────────────────────────────── Tab Data ──────────────────────────────

const FALLBACK_TOP_APIS = [
  { name: "GET /api/customers", calls: 4_820, avgLatency: "38ms", status: "200", errorRate: "0.1%" },
  { name: "POST /api/orders", calls: 2_340, avgLatency: "220ms", status: "201", errorRate: "0.3%" },
  { name: "GET /api/inventory", calls: 1_980, avgLatency: "55ms", status: "200", errorRate: "0.0%" },
  { name: "PUT /api/production/wo", calls: 1_450, avgLatency: "180ms", status: "200", errorRate: "0.2%" },
  { name: "GET /api/reports/daily", calls: 890, avgLatency: "1.2s", status: "200", errorRate: "2.1%" },
];

const FALLBACK_TOP_WEBHOOKS = [
  { name: "Stripe — payment.completed", deliveries: 1_240, successRate: "99.8%", avgLatency: "120ms", lastDelivery: "14:31:55" },
  { name: "SendGrid — email.delivered", deliveries: 980, successRate: "99.5%", avgLatency: "95ms", lastDelivery: "14:30:44" },
  { name: "GitHub — push", deliveries: 450, successRate: "100%", avgLatency: "65ms", lastDelivery: "14:29:30" },
  { name: "Twilio — sms.status", deliveries: 320, successRate: "99.1%", avgLatency: "140ms", lastDelivery: "14:25:12" },
  { name: "Slack — message.posted", deliveries: 280, successRate: "99.6%", avgLatency: "88ms", lastDelivery: "14:22:08" },
];

const FALLBACK_TOP_EVENTS = [
  { name: "order.status.changed", count: 420, producers: "Production, Sales", consumers: 4, avgProcessTime: "8ms" },
  { name: "inventory.updated", count: 380, producers: "Warehouse, Sync", consumers: 6, avgProcessTime: "12ms" },
  { name: "payment.received", count: 245, producers: "Finance, Stripe", consumers: 3, avgProcessTime: "15ms" },
  { name: "employee.clocked_in", count: 189, producers: "HR Module", consumers: 2, avgProcessTime: "5ms" },
  { name: "quality.inspection.done", count: 156, producers: "Quality Module", consumers: 3, avgProcessTime: "22ms" },
];

const FALLBACK_TOP_MCP = [
  { name: "tools/inventory-check", calls: 340, avgLatency: "340ms", server: "Warehouse MCP", model: "Claude 3.5" },
  { name: "tools/create-quote", calls: 280, avgLatency: "890ms", server: "Sales MCP", model: "Claude 3.5" },
  { name: "tools/customer-lookup", calls: 220, avgLatency: "210ms", server: "CRM MCP", model: "Claude 3.5" },
  { name: "tools/production-status", calls: 180, avgLatency: "450ms", server: "Production MCP", model: "Claude 3.5" },
  { name: "tools/financial-report", calls: 95, avgLatency: "1.2s", server: "Finance MCP", model: "Claude 3.5" },
];

const FALLBACK_TOP_SYNC_JOBS = [
  { name: "SAP B1 — Inventory", runs: 48, lastRun: "14:31:42", avgDuration: "2.3s", records: "847", status: "success" as const },
  { name: "Priority — GL Accounts", runs: 24, lastRun: "14:30:15", avgDuration: "4.8s", records: "95/100", status: "warning" as const },
  { name: "WooCommerce — Products", runs: 12, lastRun: "14:28:40", avgDuration: "3.1s", records: "127", status: "success" as const },
  { name: "Salesforce — Contacts", runs: 8, lastRun: "13:45:22", avgDuration: "5.6s", records: "2,340", status: "success" as const },
  { name: "HubSpot — Deals", runs: 6, lastRun: "13:00:01", avgDuration: "8.2s", records: "456", status: "success" as const },
];

const FALLBACK_ALERTS = [
  { id: 1, severity: "critical", message: "DLQ: 3 הודעות כושלות מחכות לטיפול", timestamp: "14:28:00", source: "Event Bus" },
  { id: 2, severity: "warning", message: "Sync Engine latency עלה ב-15% — מעל סף 300ms", timestamp: "14:25:12", source: "Sync Engine" },
  { id: 3, severity: "warning", message: "API /api/reports/daily — error rate 2.1% (סף: 1%)", timestamp: "14:20:08", source: "API Gateway" },
  { id: 4, severity: "info", message: "MCP Server 'Finance' — response time ממוצע 1.2s", timestamp: "14:15:00", source: "MCP Hub" },
  { id: 5, severity: "info", message: "Webhook Stripe retry count עלה ל-3 ב-24 שעות אחרונות", timestamp: "13:58:30", source: "Webhook Gateway" },
];

const alertSeverityConfig: Record<string, { label: string; badgeClass: string }> = {
  critical: { label: "קריטי", badgeClass: "bg-red-500/15 text-red-400 border-red-500/30" },
  warning: { label: "אזהרה", badgeClass: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  info: { label: "מידע", badgeClass: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
};

// ────────────────────────────── Uptime Data ──────────────────────────────

const FALLBACK_UPTIME_DATA = [
  { service: "API Gateway", days: [99.99, 100, 99.98, 100, 99.97, 100, 99.98] },
  { service: "Webhook Gateway", days: [99.95, 99.90, 100, 99.95, 99.88, 100, 99.95] },
  { service: "Event Bus", days: [100, 100, 99.99, 100, 100, 99.99, 99.99] },
  { service: "MCP Hub", days: [99.97, 100, 99.95, 99.99, 100, 99.97, 99.97] },
  { service: "Sync Engine", days: [99.80, 98.50, 99.20, 99.90, 97.80, 99.60, 98.50] },
  { service: "DLQ Monitor", days: [100, 100, 100, 99.50, 100, 100, 95.00] },
];

const FALLBACK_DAY_LABELS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

function getUptimeColor(val: number): string {
  if (val >= 99.9) return "bg-green-500";
  if (val >= 99.0) return "bg-emerald-400";
  if (val >= 98.0) return "bg-amber-400";
  if (val >= 95.0) return "bg-orange-400";
  return "bg-red-500";
}

function getUptimeTextColor(val: number): string {
  if (val >= 99.9) return "text-green-400";
  if (val >= 99.0) return "text-emerald-400";
  if (val >= 98.0) return "text-amber-400";
  if (val >= 95.0) return "text-orange-400";
  return "text-red-400";
}

// ────────────────────────────── Component ──────────────────────────────

export default function IntegrationDashboard() {

  const { data: apiData } = useQuery({
    queryKey: ["integration_dashboard"],
    queryFn: () => authFetch("/api/integrations/integration-dashboard").then(r => r.json()),
    staleTime: 60_000,
    retry: 1,
  });
  const kpiCards = apiData?.kpiCards ?? FALLBACK_KPI_CARDS;
  const systemModules = apiData?.systemModules ?? FALLBACK_SYSTEM_MODULES;
  const activityFeed = apiData?.activityFeed ?? FALLBACK_ACTIVITY_FEED;
  const topApis = apiData?.topApis ?? FALLBACK_TOP_APIS;
  const topWebhooks = apiData?.topWebhooks ?? FALLBACK_TOP_WEBHOOKS;
  const topEvents = apiData?.topEvents ?? FALLBACK_TOP_EVENTS;
  const topMcp = apiData?.topMcp ?? FALLBACK_TOP_MCP;
  const topSyncJobs = apiData?.topSyncJobs ?? FALLBACK_TOP_SYNC_JOBS;
  const alerts = apiData?.alerts ?? FALLBACK_ALERTS;
  const uptimeData = apiData?.uptimeData ?? FALLBACK_UPTIME_DATA;
  const dayLabels = apiData?.dayLabels ?? FALLBACK_DAY_LABELS;
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div dir="rtl" className="min-h-screen bg-background p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30">
            <Plug className="h-6 w-6 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">מרכז פיקוד אינטגרציות</h1>
            <p className="text-sm text-muted-foreground">טכנו-כל עוזי — Enterprise Integration Hub</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Activity className="h-3.5 w-3.5 text-green-400 animate-pulse" />
          <span>Live — עדכון אחרון 14:32:08</span>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {kpiCards.map((kpi) => {
          const Icon = kpi.icon;
          const isPositive = kpi.trend.startsWith("+") || kpi.trend.startsWith("-");
          const trendPositive = kpi.label === "שגיאות" || kpi.label === "Latency ממוצע"
            ? kpi.trend.startsWith("-")
            : kpi.trend.startsWith("+");
          return (
            <Card key={kpi.label} className="relative overflow-hidden">
              <CardContent className="p-3">
                <div className={`absolute top-2 left-2 p-1.5 rounded-lg ${kpi.bg}`}>
                  <Icon className={`h-3.5 w-3.5 ${kpi.color}`} />
                </div>
                <p className="text-[11px] text-muted-foreground mb-1">{kpi.label}</p>
                <p className="text-lg font-bold">{kpi.value}</p>
                {isPositive && (
                  <div className={`flex items-center gap-0.5 text-[10px] mt-0.5 ${trendPositive ? "text-green-400" : "text-red-400"}`}>
                    {trendPositive ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownRight className="h-2.5 w-2.5" />}
                    {kpi.trend}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* System Health Overview */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4 text-indigo-400" />
            סקירת תקינות מערכות
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {systemModules.map((mod) => {
              const cfg = statusConfig[mod.status];
              const ModIcon = mod.icon;
              return (
                <div
                  key={mod.name}
                  className="rounded-lg border p-3 flex flex-col gap-2 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ModIcon className={`h-4 w-4 ${cfg.color}`} />
                      <div>
                        <span className="text-sm font-medium">{mod.nameHe}</span>
                        <span className="text-[10px] text-muted-foreground mr-1.5">({mod.name})</span>
                      </div>
                    </div>
                    <Badge variant="outline" className={`text-[10px] ${cfg.badgeClass}`}>
                      {cfg.label}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{mod.detail}</p>
                  <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <TrendingUp className="h-2.5 w-2.5" /> Uptime: {mod.uptime}
                    </span>
                    <span className="flex items-center gap-1">
                      <Timer className="h-2.5 w-2.5" /> Latency: {mod.latency}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Live Activity Feed */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4 text-green-400" />
            פיד פעילות חי
            <Badge variant="outline" className="mr-2 text-[10px] bg-green-500/10 text-green-400 border-green-500/30">
              {activityFeed.length} אירועים אחרונים
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right w-[80px]">שעה</TableHead>
                <TableHead className="text-right w-[90px]">סוג</TableHead>
                <TableHead className="text-right">מקור</TableHead>
                <TableHead className="text-right">יעד / Endpoint</TableHead>
                <TableHead className="text-center w-[70px]">סטטוס</TableHead>
                <TableHead className="text-center w-[70px]">זמן</TableHead>
                <TableHead className="text-right">פרטים</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activityFeed.map((evt) => {
                const sCfg = eventStatusConfig[evt.status];
                const StatusIcon = sCfg.icon;
                return (
                  <TableRow key={evt.id} className="text-xs">
                    <TableCell className="font-mono text-muted-foreground">{evt.timestamp}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] ${evt.typeBadge}`}>{evt.type}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{evt.source}</TableCell>
                    <TableCell className="font-mono text-[11px]">{evt.target}</TableCell>
                    <TableCell className="text-center">
                      <StatusIcon className={`h-3.5 w-3.5 inline ${sCfg.color}`} />
                    </TableCell>
                    <TableCell className="text-center font-mono">{evt.duration}</TableCell>
                    <TableCell className="text-muted-foreground">{evt.detail}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Tabs Section */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="overview">סקירה</TabsTrigger>
          <TabsTrigger value="apis">APIs</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
          <TabsTrigger value="events">Events</TabsTrigger>
          <TabsTrigger value="mcp">MCP</TabsTrigger>
          <TabsTrigger value="sync">Sync Jobs</TabsTrigger>
          <TabsTrigger value="alerts">התראות</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Globe className="h-4 w-4 text-blue-400" />
                  Top 5 APIs — לפי קריאות
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {topApis.map((api) => (
                  <div key={api.name} className="flex items-center justify-between text-xs">
                    <span className="font-mono truncate max-w-[200px]">{api.name}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground">{api.calls.toLocaleString()} calls</span>
                      <span className="font-mono">{api.avgLatency}</span>
                      <Badge variant="outline" className="text-[9px] bg-green-500/10 text-green-400 border-green-500/30">{api.status}</Badge>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Webhook className="h-4 w-4 text-violet-400" />
                  Top 5 Webhooks — לפי משלוחים
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {topWebhooks.map((wh) => (
                  <div key={wh.name} className="flex items-center justify-between text-xs">
                    <span className="truncate max-w-[200px]">{wh.name}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground">{wh.deliveries.toLocaleString()}</span>
                      <span className="font-mono">{wh.successRate}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* APIs Tab */}
        <TabsContent value="apis" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Globe className="h-4 w-4 text-blue-400" />
                APIs פעילים ביותר — Top 5
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">Endpoint</TableHead>
                    <TableHead className="text-center">קריאות</TableHead>
                    <TableHead className="text-center">Latency ממוצע</TableHead>
                    <TableHead className="text-center">Status Code</TableHead>
                    <TableHead className="text-center">Error Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topApis.map((api) => (
                    <TableRow key={api.name} className="text-xs">
                      <TableCell className="font-mono">{api.name}</TableCell>
                      <TableCell className="text-center font-bold">{api.calls.toLocaleString()}</TableCell>
                      <TableCell className="text-center font-mono">{api.avgLatency}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-400 border-green-500/30">{api.status}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={parseFloat(api.errorRate) > 1 ? "text-red-400 font-medium" : "text-muted-foreground"}>
                          {api.errorRate}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Webhooks Tab */}
        <TabsContent value="webhooks" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Webhook className="h-4 w-4 text-violet-400" />
                Webhooks פעילים ביותר — Top 5
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">Webhook</TableHead>
                    <TableHead className="text-center">משלוחים</TableHead>
                    <TableHead className="text-center">Success Rate</TableHead>
                    <TableHead className="text-center">Latency ממוצע</TableHead>
                    <TableHead className="text-center">משלוח אחרון</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topWebhooks.map((wh) => (
                    <TableRow key={wh.name} className="text-xs">
                      <TableCell className="font-medium">{wh.name}</TableCell>
                      <TableCell className="text-center font-bold">{wh.deliveries.toLocaleString()}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-400 border-green-500/30">{wh.successRate}</Badge>
                      </TableCell>
                      <TableCell className="text-center font-mono">{wh.avgLatency}</TableCell>
                      <TableCell className="text-center font-mono text-muted-foreground">{wh.lastDelivery}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Events Tab */}
        <TabsContent value="events" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-400" />
                Events פעילים ביותר — Top 5
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">Event Name</TableHead>
                    <TableHead className="text-center">כמות היום</TableHead>
                    <TableHead className="text-right">Producers</TableHead>
                    <TableHead className="text-center">Consumers</TableHead>
                    <TableHead className="text-center">Process Time ממוצע</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topEvents.map((ev) => (
                    <TableRow key={ev.name} className="text-xs">
                      <TableCell className="font-mono">{ev.name}</TableCell>
                      <TableCell className="text-center font-bold">{ev.count}</TableCell>
                      <TableCell className="text-muted-foreground">{ev.producers}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="text-[10px]">{ev.consumers}</Badge>
                      </TableCell>
                      <TableCell className="text-center font-mono">{ev.avgProcessTime}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* MCP Tab */}
        <TabsContent value="mcp" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Cpu className="h-4 w-4 text-cyan-400" />
                MCP Tools פעילים ביותר — Top 5
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">Tool</TableHead>
                    <TableHead className="text-center">קריאות</TableHead>
                    <TableHead className="text-center">Latency ממוצע</TableHead>
                    <TableHead className="text-right">MCP Server</TableHead>
                    <TableHead className="text-right">Model</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topMcp.map((tool) => (
                    <TableRow key={tool.name} className="text-xs">
                      <TableCell className="font-mono">{tool.name}</TableCell>
                      <TableCell className="text-center font-bold">{tool.calls}</TableCell>
                      <TableCell className="text-center font-mono">{tool.avgLatency}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] bg-cyan-500/10 text-cyan-400 border-cyan-500/30">{tool.server}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{tool.model}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sync Jobs Tab */}
        <TabsContent value="sync" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-emerald-400" />
                Sync Jobs פעילים ביותר — Top 5
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">Job</TableHead>
                    <TableHead className="text-center">הרצות היום</TableHead>
                    <TableHead className="text-center">הרצה אחרונה</TableHead>
                    <TableHead className="text-center">משך ממוצע</TableHead>
                    <TableHead className="text-center">רשומות</TableHead>
                    <TableHead className="text-center">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topSyncJobs.map((job) => {
                    const jobStatus = job.status === "success"
                      ? { label: "תקין", cls: "bg-green-500/15 text-green-400 border-green-500/30" }
                      : { label: "אזהרה", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" };
                    return (
                      <TableRow key={job.name} className="text-xs">
                        <TableCell className="font-medium">{job.name}</TableCell>
                        <TableCell className="text-center font-bold">{job.runs}</TableCell>
                        <TableCell className="text-center font-mono text-muted-foreground">{job.lastRun}</TableCell>
                        <TableCell className="text-center font-mono">{job.avgDuration}</TableCell>
                        <TableCell className="text-center">{job.records}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={`text-[10px] ${jobStatus.cls}`}>{jobStatus.label}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Alerts Tab */}
        <TabsContent value="alerts" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Bell className="h-4 w-4 text-red-400" />
                התראות פעילות
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {alerts.map((alert) => {
                const aCfg = alertSeverityConfig[alert.severity];
                return (
                  <div
                    key={alert.id}
                    className="flex items-start gap-3 rounded-lg border p-3 hover:bg-muted/30 transition-colors"
                  >
                    <Badge variant="outline" className={`text-[10px] shrink-0 mt-0.5 ${aCfg.badgeClass}`}>
                      {aCfg.label}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs">{alert.message}</p>
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-1">
                        <span className="flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5" /> {alert.timestamp}
                        </span>
                        <span className="flex items-center gap-1">
                          <Link2 className="h-2.5 w-2.5" /> {alert.source}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Uptime Chart — 7-Day Grid */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-indigo-400" />
            Uptime — 7 ימים אחרונים
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {/* Day labels header */}
            <div className="grid gap-2" style={{ gridTemplateColumns: "140px repeat(7, 1fr) 80px" }}>
              <div className="text-[10px] text-muted-foreground">שירות</div>
              {dayLabels.map((d) => (
                <div key={d} className="text-[10px] text-muted-foreground text-center">{d}</div>
              ))}
              <div className="text-[10px] text-muted-foreground text-center">ממוצע</div>
            </div>
            {/* Rows */}
            {uptimeData.map((row) => {
              const avg = row.days.reduce((s, v) => s + v, 0) / row.days.length;
              return (
                <div key={row.service} className="grid gap-2 items-center" style={{ gridTemplateColumns: "140px repeat(7, 1fr) 80px" }}>
                  <div className="text-xs font-medium truncate">{row.service}</div>
                  {row.days.map((val, i) => (
                    <div key={i} className="flex flex-col items-center gap-1">
                      <div className={`h-6 w-full rounded ${getUptimeColor(val)}`} style={{ opacity: Math.max(0.3, val / 100) }} />
                      <span className={`text-[9px] font-mono ${getUptimeTextColor(val)}`}>{val.toFixed(1)}%</span>
                    </div>
                  ))}
                  <div className="text-center">
                    <span className={`text-xs font-bold font-mono ${getUptimeTextColor(avg)}`}>
                      {avg.toFixed(2)}%
                    </span>
                  </div>
                </div>
              );
            })}
            {/* Legend */}
            <div className="flex items-center gap-4 pt-2 border-t text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500" /> 99.9%+</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400" /> 99.0-99.9%</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" /> 98.0-99.0%</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-orange-400" /> 95.0-98.0%</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" /> &lt;95%</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
