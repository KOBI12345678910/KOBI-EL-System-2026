import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Globe, Activity, AlertTriangle, Clock, Shield, Zap,
  ArrowUpDown, ExternalLink, CheckCircle2, XCircle, Timer,
} from "lucide-react";

/* ── KPI data ── */
const FALLBACK_KPIS = [
  { label: "Endpoints רשומים", value: "48", icon: Globe, color: "text-blue-600 bg-blue-100" },
  { label: "קריאות היום", value: "12,450", icon: Activity, color: "text-emerald-600 bg-emerald-100" },
  { label: "שגיאות", value: "0.3%", icon: AlertTriangle, color: "text-red-600 bg-red-100" },
  { label: "Latency p50", value: "85ms", icon: Clock, color: "text-violet-600 bg-violet-100" },
  { label: "Latency p99", value: "320ms", icon: Timer, color: "text-amber-600 bg-amber-100" },
  { label: "Rate Limited", value: "12", icon: Shield, color: "text-orange-600 bg-orange-100" },
];

/* ── Internal APIs ── */
const FALLBACK_INTERNAL_APIS = [
  { path: "/api/v1/customers", method: "GET", module: "CRM", auth: "JWT", calls: 2340, avg: "62ms", status: "active" },
  { path: "/api/v1/customers", method: "POST", module: "CRM", auth: "JWT", calls: 185, avg: "110ms", status: "active" },
  { path: "/api/v1/leads", method: "GET", module: "CRM", auth: "JWT", calls: 1870, avg: "58ms", status: "active" },
  { path: "/api/v1/employees", method: "GET", module: "HR", auth: "JWT", calls: 980, avg: "75ms", status: "active" },
  { path: "/api/v1/employees", method: "PUT", module: "HR", auth: "API Key", calls: 124, avg: "95ms", status: "active" },
  { path: "/api/v1/payroll/run", method: "POST", module: "HR", auth: "JWT", calls: 45, avg: "340ms", status: "active" },
  { path: "/api/v1/work-orders", method: "GET", module: "Production", auth: "API Key", calls: 2100, avg: "88ms", status: "active" },
  { path: "/api/v1/work-orders", method: "POST", module: "Production", auth: "JWT", calls: 310, avg: "125ms", status: "active" },
  { path: "/api/v1/inventory/stock", method: "GET", module: "Inventory", auth: "API Key", calls: 3200, avg: "45ms", status: "active" },
  { path: "/api/v1/invoices", method: "GET", module: "Finance", auth: "JWT", calls: 890, avg: "72ms", status: "active" },
  { path: "/api/v1/invoices", method: "POST", module: "Finance", auth: "JWT", calls: 220, avg: "155ms", status: "active" },
  { path: "/api/v1/reports/legacy", method: "GET", module: "BI", auth: "API Key", calls: 186, avg: "420ms", status: "deprecated" },
];

/* ── External APIs ── */
const FALLBACK_EXTERNAL_APIS = [
  { service: "חילן — שכר", baseUrl: "https://api.hilan.co.il/v2", auth: "OAuth 2.0", calls: 320, errorRate: "0.0%", lastCall: "08:42", health: "healthy" },
  { service: "Google Workspace", baseUrl: "https://www.googleapis.com", auth: "OAuth 2.0", calls: 1840, errorRate: "0.1%", lastCall: "08:44", health: "healthy" },
  { service: "WhatsApp Business", baseUrl: "https://graph.facebook.com/v18.0", auth: "Bearer Token", calls: 2650, errorRate: "0.2%", lastCall: "08:45", health: "healthy" },
  { service: "מכס — רשות המסים", baseUrl: "https://openapi.taxes.gov.il", auth: "Certificate + API Key", calls: 85, errorRate: "1.2%", lastCall: "07:30", health: "degraded" },
  { service: "בנק לאומי", baseUrl: "https://openbanking.bankleumi.co.il", auth: "mTLS + OAuth", calls: 210, errorRate: "0.0%", lastCall: "08:40", health: "healthy" },
  { service: "Salesforce CRM", baseUrl: "https://techno-col.my.salesforce.com/api", auth: "OAuth 2.0", calls: 760, errorRate: "0.0%", lastCall: "08:43", health: "healthy" },
  { service: "DHL Shipping", baseUrl: "https://api-eu.dhl.com/track/v2", auth: "API Key", calls: 430, errorRate: "0.5%", lastCall: "08:38", health: "healthy" },
  { service: "Twilio SMS", baseUrl: "https://api.twilio.com/2010-04-01", auth: "Basic Auth", calls: 1150, errorRate: "0.0%", lastCall: "08:44", health: "healthy" },
];

/* ── Rate Limits ── */
const FALLBACK_RATE_LIMITS = [
  { pattern: "/api/v1/customers/*", limit: "100/min", usage: 72, breaches: 3 },
  { pattern: "/api/v1/inventory/*", limit: "200/min", usage: 88, breaches: 5 },
  { pattern: "/api/v1/invoices/*", limit: "60/min", usage: 35, breaches: 0 },
  { pattern: "/api/v1/work-orders/*", limit: "150/min", usage: 61, breaches: 2 },
  { pattern: "/api/v1/employees/*", limit: "80/min", usage: 44, breaches: 0 },
  { pattern: "/api/v1/reports/*", limit: "30/min", usage: 93, breaches: 2 },
];

/* ── Recent Logs ── */
const FALLBACK_RECENT_LOGS = [
  { ts: "08:45:12", method: "GET", path: "/api/v1/customers?page=2", status: 200, duration: 58, ip: "10.0.1.15" },
  { ts: "08:45:10", method: "POST", path: "/api/v1/work-orders", status: 201, duration: 132, ip: "10.0.1.22" },
  { ts: "08:45:08", method: "GET", path: "/api/v1/inventory/stock", status: 200, duration: 41, ip: "10.0.2.5" },
  { ts: "08:44:59", method: "PUT", path: "/api/v1/employees/1042", status: 200, duration: 97, ip: "10.0.1.15" },
  { ts: "08:44:55", method: "DELETE", path: "/api/v1/leads/8832", status: 200, duration: 64, ip: "10.0.1.30" },
  { ts: "08:44:50", method: "POST", path: "/api/v1/invoices", status: 201, duration: 148, ip: "10.0.3.8" },
  { ts: "08:44:42", method: "GET", path: "/api/v1/customers/5521", status: 200, duration: 52, ip: "10.0.1.15" },
  { ts: "08:44:38", method: "POST", path: "/api/v1/auth/token", status: 401, duration: 12, ip: "192.168.1.99" },
  { ts: "08:44:30", method: "GET", path: "/api/v1/reports/legacy", status: 200, duration: 410, ip: "10.0.4.2" },
  { ts: "08:44:22", method: "POST", path: "/api/v1/customers", status: 400, duration: 18, ip: "10.0.1.22" },
  { ts: "08:44:15", method: "GET", path: "/api/v1/work-orders?status=open", status: 200, duration: 85, ip: "10.0.2.5" },
  { ts: "08:44:10", method: "GET", path: "/api/v1/employees", status: 200, duration: 73, ip: "10.0.1.15" },
  { ts: "08:44:02", method: "PUT", path: "/api/v1/inventory/stock/4410", status: 200, duration: 91, ip: "10.0.3.8" },
  { ts: "08:43:55", method: "POST", path: "/api/v1/payroll/run", status: 500, duration: 340, ip: "10.0.1.10" },
  { ts: "08:43:48", method: "GET", path: "/api/v1/invoices?month=04", status: 200, duration: 68, ip: "10.0.4.2" },
];

/* ── Helpers ── */
const METHOD_COLORS: Record<string, string> = {
  GET: "bg-blue-100 text-blue-700 border-blue-200",
  POST: "bg-green-100 text-green-700 border-green-200",
  PUT: "bg-amber-100 text-amber-700 border-amber-200",
  DELETE: "bg-red-100 text-red-700 border-red-200",
};

const statusCodeColor = (code: number) => {
  if (code >= 500) return "bg-red-100 text-red-700";
  if (code >= 400) return "bg-amber-100 text-amber-700";
  if (code >= 200 && code < 300) return "bg-green-100 text-green-700";
  return "bg-gray-100 text-gray-700";
};

const STATUS_LABELS: Record<number, string> = {
  200: "OK", 201: "Created", 400: "Bad Request", 401: "Unauthorized", 500: "Server Error",
};

const healthBadge = (h: string) => {
  if (h === "healthy")
    return <Badge className="bg-green-100 text-green-700 border-green-200"><CheckCircle2 className="w-3 h-3 ml-1" />תקין</Badge>;
  if (h === "degraded")
    return <Badge className="bg-amber-100 text-amber-700 border-amber-200"><AlertTriangle className="w-3 h-3 ml-1" />מושפל</Badge>;
  return <Badge className="bg-red-100 text-red-700 border-red-200"><XCircle className="w-3 h-3 ml-1" />מנותק</Badge>;
};

const usageColor = (pct: number) => {
  if (pct >= 90) return "text-red-600";
  if (pct >= 70) return "text-amber-600";
  return "text-emerald-600";
};

const progressColor = (pct: number) => {
  if (pct >= 90) return "[&>div]:bg-red-500";
  if (pct >= 70) return "[&>div]:bg-amber-500";
  return "[&>div]:bg-emerald-500";
};

const durationColor = (ms: number) => {
  if (ms >= 300) return "text-red-600 font-semibold";
  if (ms >= 150) return "text-amber-600 font-medium";
  return "text-muted-foreground";
};

/* ══════════════════════════════════════════════════════════ */

export default function ApiGatewayPage() {

  const { data: apiData } = useQuery({
    queryKey: ["api_gateway"],
    queryFn: () => authFetch("/api/integrations/api-gateway").then(r => r.json()),
    staleTime: 60_000,
    retry: 1,
  });
  const kpis = apiData?.kpis ?? FALLBACK_KPIS;
  const internalApis = apiData?.internalApis ?? FALLBACK_INTERNAL_APIS;
  const externalApis = apiData?.externalApis ?? FALLBACK_EXTERNAL_APIS;
  const rateLimits = apiData?.rateLimits ?? FALLBACK_RATE_LIMITS;
  const recentLogs = apiData?.recentLogs ?? FALLBACK_RECENT_LOGS;
  const [activeTab, setActiveTab] = useState("internal");

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto" dir="rtl">
      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500/20 to-blue-500/20 flex items-center justify-center">
          <Globe className="w-6 h-6 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">API Gateway</h1>
          <p className="text-sm text-muted-foreground">ניהול נקודות קצה פנימיות וחיצוניות — טכנו-כל עוזי</p>
        </div>
      </div>

      {/* ── KPI Strip ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="py-4 px-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{k.label}</p>
                  <p className="text-xl font-bold mt-1">{k.value}</p>
                </div>
                <div className={`p-2 rounded-lg ${k.color}`}>
                  <k.icon className="w-4 h-4" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Tabs ── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="internal"><Zap className="w-4 h-4 ml-1" />APIs פנימיים</TabsTrigger>
          <TabsTrigger value="external"><ExternalLink className="w-4 h-4 ml-1" />APIs חיצוניים</TabsTrigger>
          <TabsTrigger value="rate"><Shield className="w-4 h-4 ml-1" />Rate Limits</TabsTrigger>
          <TabsTrigger value="logs"><ArrowUpDown className="w-4 h-4 ml-1" />לוגים</TabsTrigger>
        </TabsList>

        {/* ── Internal APIs ── */}
        <TabsContent value="internal">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">נקודות קצה פנימיות — 12 endpoints</CardTitle>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline" className={METHOD_COLORS["GET"]}>GET</Badge>
                  <Badge variant="outline" className={METHOD_COLORS["POST"]}>POST</Badge>
                  <Badge variant="outline" className={METHOD_COLORS["PUT"]}>PUT</Badge>
                  <Badge variant="outline" className={METHOD_COLORS["DELETE"]}>DELETE</Badge>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                כל ה-endpoints מוגנים באמצעות JWT או API Key, נגישים רק מתוך הרשת הפנימית
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">נתיב</TableHead>
                    <TableHead className="text-right">Method</TableHead>
                    <TableHead className="text-right">מודול</TableHead>
                    <TableHead className="text-right">אימות</TableHead>
                    <TableHead className="text-right">קריאות היום</TableHead>
                    <TableHead className="text-right">תגובה ממוצעת</TableHead>
                    <TableHead className="text-right">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {internalApis.map((ep, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs">{ep.path}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={METHOD_COLORS[ep.method]}>{ep.method}</Badge>
                      </TableCell>
                      <TableCell>{ep.module}</TableCell>
                      <TableCell><Badge variant="secondary">{ep.auth}</Badge></TableCell>
                      <TableCell className="font-medium">{ep.calls.toLocaleString()}</TableCell>
                      <TableCell>{ep.avg}</TableCell>
                      <TableCell>
                        {ep.status === "active"
                          ? <Badge className="bg-green-100 text-green-700">פעיל</Badge>
                          : <Badge className="bg-gray-100 text-gray-500">deprecated</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── External APIs ── */}
        <TabsContent value="external">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">חיבורים חיצוניים — 8 שירותים</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                חיבורים ליצרנים, בנקים, שירותי ענן וצד שלישי. ניטור בריאות אוטומטי כל 60 שניות
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">שירות</TableHead>
                    <TableHead className="text-right">Base URL</TableHead>
                    <TableHead className="text-right">אימות</TableHead>
                    <TableHead className="text-right">קריאות היום</TableHead>
                    <TableHead className="text-right">שגיאות</TableHead>
                    <TableHead className="text-right">קריאה אחרונה</TableHead>
                    <TableHead className="text-right">בריאות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {externalApis.map((svc, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{svc.service}</TableCell>
                      <TableCell className="font-mono text-xs max-w-[220px] truncate">{svc.baseUrl}</TableCell>
                      <TableCell><Badge variant="secondary">{svc.auth}</Badge></TableCell>
                      <TableCell>{svc.calls.toLocaleString()}</TableCell>
                      <TableCell>{svc.errorRate}</TableCell>
                      <TableCell>{svc.lastCall}</TableCell>
                      <TableCell>{healthBadge(svc.health)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Rate Limits ── */}
        <TabsContent value="rate">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">כללי Rate Limit — 6 חוקים</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                הגבלות קצב מוגדרות לפי endpoint pattern. חריגות נחסמות עם HTTP 429
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-5">
                {rateLimits.map((rl, i) => (
                  <div key={i} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm bg-muted px-2 py-1 rounded">
                          {rl.pattern}
                        </span>
                        <Badge variant="outline">{rl.limit}</Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        {rl.breaches > 0 ? (
                          <Badge className="bg-red-100 text-red-700">
                            <AlertTriangle className="w-3 h-3 ml-1" />
                            {rl.breaches} חריגות היום
                          </Badge>
                        ) : (
                          <Badge className="bg-green-100 text-green-700">
                            <CheckCircle2 className="w-3 h-3 ml-1" />
                            ללא חריגות
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Progress
                        value={rl.usage}
                        className={`flex-1 h-3 ${progressColor(rl.usage)}`}
                      />
                      <span className={`text-sm font-bold min-w-[48px] text-left ${usageColor(rl.usage)}`}>
                        {rl.usage}%
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {rl.usage >= 90
                        ? "שימוש קריטי — שקול הגדלת מגבלה או אופטימיזציה"
                        : rl.usage >= 70
                          ? "שימוש גבוה — יש לעקוב"
                          : "שימוש תקין"}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Logs ── */}
        <TabsContent value="logs">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">קריאות אחרונות — 15 רשומות</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                לוג בזמן-אמת של כל הקריאות הנכנסות ל-API Gateway. מסודר לפי שעה יורדת
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">שעה</TableHead>
                    <TableHead className="text-right">Method</TableHead>
                    <TableHead className="text-right">נתיב</TableHead>
                    <TableHead className="text-right">קוד</TableHead>
                    <TableHead className="text-right">משך (ms)</TableHead>
                    <TableHead className="text-right">IP מקור</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentLogs.map((log, i) => (
                    <TableRow
                      key={i}
                      className={
                        log.status >= 500
                          ? "bg-red-50/50"
                          : log.status >= 400
                            ? "bg-amber-50/50"
                            : ""
                      }
                    >
                      <TableCell className="font-mono text-xs">{log.ts}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={METHOD_COLORS[log.method]}>
                          {log.method}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs max-w-[280px] truncate">
                        {log.path}
                      </TableCell>
                      <TableCell>
                        <Badge className={statusCodeColor(log.status)}>
                          {log.status} {STATUS_LABELS[log.status] ?? ""}
                        </Badge>
                      </TableCell>
                      <TableCell className={`font-mono ${durationColor(log.duration)}`}>
                        {log.duration}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{log.ip}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
