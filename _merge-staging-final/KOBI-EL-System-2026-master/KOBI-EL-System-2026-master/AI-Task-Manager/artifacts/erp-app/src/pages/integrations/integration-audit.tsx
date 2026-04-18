import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Eye, Activity, ShieldCheck, AlertTriangle, ArrowLeftRight,
  Clock, CheckCircle2, XCircle, Zap, Globe, Server, Link2,
  Lock, RotateCw, FileText, Gauge, ArrowDownRight, ArrowUpRight,
} from "lucide-react";

const FALLBACK_AUDIT_LOG = [
  { ts: "2026-04-08 09:42:11", integration: "SAP B1", action: "API Call", dir: "out", source: "ERP", target: "SAP", status: 200, duration: "120ms", user: "system", traceId: "trc-a1b2c3d4e5f6" },
  { ts: "2026-04-08 09:41:58", integration: "חשבשבת", action: "Sync", dir: "out", source: "ERP", target: "Hashavshevet", status: 200, duration: "340ms", user: "kobi@techno-kol.co.il", traceId: "trc-b2c3d4e5f6a7" },
  { ts: "2026-04-08 09:40:33", integration: "Salesforce", action: "Webhook", dir: "in", source: "Salesforce", target: "ERP", status: 200, duration: "85ms", user: "system", traceId: "trc-c3d4e5f6a7b8" },
  { ts: "2026-04-08 09:39:17", integration: "Priority", action: "API Call", dir: "out", source: "ERP", target: "Priority", status: 201, duration: "210ms", user: "dana@techno-kol.co.il", traceId: "trc-d4e5f6a7b8c9" },
  { ts: "2026-04-08 09:38:44", integration: "WooCommerce", action: "Event", dir: "in", source: "WooCommerce", target: "ERP", status: 200, duration: "62ms", user: "system", traceId: "trc-e5f6a7b8c9d0" },
  { ts: "2026-04-08 09:37:22", integration: "Make.com", action: "Webhook", dir: "in", source: "Make", target: "ERP", status: 200, duration: "145ms", user: "system", traceId: "trc-f6a7b8c9d0e1" },
  { ts: "2026-04-08 09:36:10", integration: "n8n", action: "Sync", dir: "out", source: "ERP", target: "n8n", status: 200, duration: "290ms", user: "system", traceId: "trc-a7b8c9d0e1f2" },
  { ts: "2026-04-08 09:35:01", integration: "Google Sheets", action: "API Call", dir: "out", source: "ERP", target: "GSheets", status: 200, duration: "178ms", user: "miri@techno-kol.co.il", traceId: "trc-b8c9d0e1f2a3" },
  { ts: "2026-04-08 09:33:55", integration: "Stripe", action: "Webhook", dir: "in", source: "Stripe", target: "ERP", status: 200, duration: "53ms", user: "system", traceId: "trc-c9d0e1f2a3b4" },
  { ts: "2026-04-08 09:32:40", integration: "חשבונית ירוקה", action: "API Call", dir: "out", source: "ERP", target: "Green Invoice", status: 200, duration: "410ms", user: "system", traceId: "trc-d0e1f2a3b4c5" },
  { ts: "2026-04-08 09:31:28", integration: "Twilio", action: "Event", dir: "out", source: "ERP", target: "Twilio", status: 200, duration: "98ms", user: "system", traceId: "trc-e1f2a3b4c5d6" },
  { ts: "2026-04-08 09:30:15", integration: "HubSpot", action: "Sync", dir: "in", source: "HubSpot", target: "ERP", status: 200, duration: "320ms", user: "system", traceId: "trc-f2a3b4c5d6e7" },
  { ts: "2026-04-08 09:28:59", integration: "Zapier", action: "Webhook", dir: "in", source: "Zapier", target: "ERP", status: 200, duration: "72ms", user: "system", traceId: "trc-a3b4c5d6e7f8" },
  { ts: "2026-04-08 09:27:44", integration: "SAP B1", action: "API Call", dir: "out", source: "ERP", target: "SAP", status: 500, duration: "1520ms", user: "system", traceId: "trc-b4c5d6e7f8a9" },
  { ts: "2026-04-08 09:26:30", integration: "Priority", action: "Sync", dir: "out", source: "ERP", target: "Priority", status: 200, duration: "195ms", user: "system", traceId: "trc-c5d6e7f8a9b0" },
  { ts: "2026-04-08 09:25:18", integration: "Salesforce", action: "API Call", dir: "out", source: "ERP", target: "Salesforce", status: 200, duration: "230ms", user: "kobi@techno-kol.co.il", traceId: "trc-d6e7f8a9b0c1" },
  { ts: "2026-04-08 09:24:02", integration: "WooCommerce", action: "Webhook", dir: "in", source: "WooCommerce", target: "ERP", status: 200, duration: "88ms", user: "system", traceId: "trc-e7f8a9b0c1d2" },
  { ts: "2026-04-08 09:22:50", integration: "Make.com", action: "Event", dir: "in", source: "Make", target: "ERP", status: 429, duration: "15ms", user: "system", traceId: "trc-f8a9b0c1d2e3" },
  { ts: "2026-04-08 09:21:35", integration: "Google Sheets", action: "Sync", dir: "out", source: "ERP", target: "GSheets", status: 200, duration: "205ms", user: "system", traceId: "trc-a9b0c1d2e3f4" },
  { ts: "2026-04-08 09:20:22", integration: "Stripe", action: "API Call", dir: "in", source: "Stripe", target: "ERP", status: 200, duration: "67ms", user: "system", traceId: "trc-b0c1d2e3f4a5" },
];

const FALLBACK_TRACE_CHAIN = [
  { step: 1, service: "WooCommerce", event: "order.created", ts: "09:38:44.000", duration: "—", status: "trigger" },
  { step: 2, service: "Webhook Gateway", event: "payload validated", ts: "09:38:44.012", duration: "12ms", status: "ok" },
  { step: 3, service: "ERP Router", event: "route to Sales module", ts: "09:38:44.025", duration: "13ms", status: "ok" },
  { step: 4, service: "Sales Module", event: "create sales order #4821", ts: "09:38:44.110", duration: "85ms", status: "ok" },
  { step: 5, service: "Inventory Module", event: "reserve stock (SKU-1190)", ts: "09:38:44.180", duration: "70ms", status: "ok" },
  { step: 6, service: "חשבונית ירוקה", event: "issue invoice #INV-9930", ts: "09:38:44.590", duration: "410ms", status: "ok" },
  { step: 7, service: "Notification Service", event: "email confirmation sent", ts: "09:38:44.640", duration: "50ms", status: "ok" },
  { step: 8, service: "Audit Logger", event: "trace committed", ts: "09:38:44.645", duration: "5ms", status: "complete" },
];

const FALLBACK_ANOMALIES = [
  { id: "ANM-001", type: "תעבורה חריגה", integration: "Make.com", detected: "2026-04-08 08:15", severity: "warning", desc: "עלייה של 340% בקריאות Webhook מ-Make.com בשעה האחרונה לעומת ממוצע יומי. ייתכן לולאה אינסופית בתרחיש." },
  { id: "ANM-002", type: "קפיצת שגיאות", integration: "SAP B1", detected: "2026-04-08 09:27", severity: "critical", desc: "5 שגיאות HTTP 500 ברצף מ-SAP B1 API תוך 10 דקות. חריגה מסף של 2 שגיאות לשעה. יש לבדוק זמינות שרת SAP." },
  { id: "ANM-003", type: "סטיית חביון", integration: "חשבונית ירוקה", detected: "2026-04-08 07:50", severity: "info", desc: "זמן תגובה ממוצע עלה ל-410ms (ממוצע רגיל: 180ms). סטייה של 128%. ייתכן עומס בצד ספק השירות." },
];

const FALLBACK_COMPLIANCE_DATA = [
  { integration: "SAP B1", encryption: true, tokenRotation: true, auditLogs: true, errorHandling: true, rateLimits: true, score: 100 },
  { integration: "חשבשבת", encryption: true, tokenRotation: true, auditLogs: true, errorHandling: true, rateLimits: false, score: 80 },
  { integration: "Salesforce", encryption: true, tokenRotation: true, auditLogs: true, errorHandling: true, rateLimits: true, score: 100 },
  { integration: "Priority", encryption: true, tokenRotation: false, auditLogs: true, errorHandling: true, rateLimits: true, score: 80 },
  { integration: "WooCommerce", encryption: true, tokenRotation: true, auditLogs: true, errorHandling: false, rateLimits: true, score: 80 },
  { integration: "Make.com", encryption: true, tokenRotation: true, auditLogs: true, errorHandling: true, rateLimits: true, score: 100 },
  { integration: "n8n", encryption: true, tokenRotation: false, auditLogs: true, errorHandling: true, rateLimits: false, score: 60 },
  { integration: "Google Sheets", encryption: true, tokenRotation: true, auditLogs: false, errorHandling: true, rateLimits: true, score: 80 },
  { integration: "Stripe", encryption: true, tokenRotation: true, auditLogs: true, errorHandling: true, rateLimits: true, score: 100 },
  { integration: "חשבונית ירוקה", encryption: true, tokenRotation: true, auditLogs: true, errorHandling: true, rateLimits: true, score: 100 },
  { integration: "Twilio", encryption: true, tokenRotation: true, auditLogs: true, errorHandling: true, rateLimits: false, score: 80 },
  { integration: "HubSpot", encryption: true, tokenRotation: true, auditLogs: true, errorHandling: true, rateLimits: true, score: 100 },
];

const statusColor = (code: number) => code >= 200 && code < 300 ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : code === 429 ? "bg-amber-500/15 text-amber-400 border-amber-500/30" : "bg-red-500/15 text-red-400 border-red-500/30";
const dirBadge = (d: string) => d === "in" ? { icon: ArrowDownRight, label: "נכנס", cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" } : { icon: ArrowUpRight, label: "יוצא", cls: "bg-violet-500/15 text-violet-400 border-violet-500/30" };
const sevColor = (s: string) => s === "critical" ? "bg-red-500/15 text-red-400 border-red-500/30" : s === "warning" ? "bg-amber-500/15 text-amber-400 border-amber-500/30" : "bg-sky-500/15 text-sky-400 border-sky-500/30";
const checkIcon = (v: boolean) => v ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <XCircle className="h-4 w-4 text-red-400" />;

export default function IntegrationAuditPage() {

  const { data: apiData } = useQuery({
    queryKey: ["integration_audit"],
    queryFn: () => authFetch("/api/integrations/integration-audit").then(r => r.json()),
    staleTime: 60_000,
    retry: 1,
  });
  const auditLog = apiData?.auditLog ?? FALLBACK_AUDIT_LOG;
  const traceChain = apiData?.traceChain ?? FALLBACK_TRACE_CHAIN;
  const anomalies = apiData?.anomalies ?? FALLBACK_ANOMALIES;
  const complianceData = apiData?.complianceData ?? FALLBACK_COMPLIANCE_DATA;
  const [tab, setTab] = useState("audit");

  return (
    <div dir="rtl" className="min-h-screen bg-background p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-lg bg-indigo-500/15 border border-indigo-500/30">
          <Eye className="h-6 w-6 text-indigo-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">מעקב ובקרת אינטגרציות</h1>
          <p className="text-sm text-muted-foreground">טכנו-כל עוזי &mdash; מערכת ביקורת ומעקב שרשרת אירועים</p>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "אירועים במעקב", value: "12,450", icon: Activity, color: "text-indigo-400", bg: "bg-indigo-500/15" },
          { label: "אינטגרציות פעילות", value: "24", icon: Link2, color: "text-emerald-400", bg: "bg-emerald-500/15" },
          { label: "חריגות שזוהו", value: "2", icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/15" },
          { label: "ציון תאימות", value: "96%", icon: ShieldCheck, color: "text-emerald-400", bg: "bg-emerald-500/15" },
        ].map((kpi) => (
          <Card key={kpi.label} className="border-border/60">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${kpi.bg}`}>
                <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
                <p className="text-xl font-bold">{kpi.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} dir="rtl">
        <TabsList className="w-full justify-start gap-1 bg-muted/50 p-1">
          <TabsTrigger value="audit" className="gap-1.5"><FileText className="h-4 w-4" />יומן ביקורת</TabsTrigger>
          <TabsTrigger value="trace" className="gap-1.5"><ArrowLeftRight className="h-4 w-4" />מעקב שרשרת</TabsTrigger>
          <TabsTrigger value="anomalies" className="gap-1.5"><AlertTriangle className="h-4 w-4" />חריגות</TabsTrigger>
          <TabsTrigger value="compliance" className="gap-1.5"><ShieldCheck className="h-4 w-4" />תאימות</TabsTrigger>
        </TabsList>

        {/* Audit Log Tab */}
        <TabsContent value="audit" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4 text-indigo-400" />יומן ביקורת &mdash; 20 רשומות אחרונות</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead className="text-right">זמן</TableHead>
                    <TableHead className="text-right">אינטגרציה</TableHead>
                    <TableHead className="text-right">פעולה</TableHead>
                    <TableHead className="text-right">כיוון</TableHead>
                    <TableHead className="text-right">מקור</TableHead>
                    <TableHead className="text-right">יעד</TableHead>
                    <TableHead className="text-right">סטטוס</TableHead>
                    <TableHead className="text-right">זמן תגובה</TableHead>
                    <TableHead className="text-right">משתמש/מערכת</TableHead>
                    <TableHead className="text-right">Trace ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditLog.map((row, i) => {
                    const d = dirBadge(row.dir);
                    return (
                      <TableRow key={i} className="text-xs hover:bg-muted/40 transition-colors">
                        <TableCell className="font-mono text-[11px] whitespace-nowrap">{row.ts}</TableCell>
                        <TableCell className="font-medium">{row.integration}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px]">{row.action}</Badge></TableCell>
                        <TableCell><Badge variant="outline" className={`text-[10px] ${d.cls} gap-1`}><d.icon className="h-3 w-3" />{d.label}</Badge></TableCell>
                        <TableCell>{row.source}</TableCell>
                        <TableCell>{row.target}</TableCell>
                        <TableCell><Badge variant="outline" className={`text-[10px] font-mono ${statusColor(row.status)}`}>{row.status}</Badge></TableCell>
                        <TableCell className="font-mono text-[11px]">{row.duration}</TableCell>
                        <TableCell className="text-[11px]">{row.user}</TableCell>
                        <TableCell className="font-mono text-[10px] text-muted-foreground select-all">{row.traceId}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Trace View Tab */}
        <TabsContent value="trace" className="mt-4 space-y-4">
          {/* Trace summary strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "שרשרת נבחרת", value: "trc-e5f6a7b8c9d0", mono: true },
              { label: "מספר צעדים", value: "8" },
              { label: "זמן כולל", value: "645ms" },
              { label: "סטטוס", value: "הושלם", color: "text-emerald-400" },
            ].map((s) => (
              <Card key={s.label} className="border-border/60">
                <CardContent className="p-3">
                  <p className="text-[10px] text-muted-foreground">{s.label}</p>
                  <p className={`text-sm font-bold ${s.mono ? "font-mono text-indigo-400" : ""} ${s.color || ""}`}>{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ArrowLeftRight className="h-4 w-4 text-indigo-400" />
                מעקב שרשרת אירועים &mdash; Trace <span className="font-mono text-indigo-400 text-sm">trc-e5f6a7b8c9d0</span>
              </CardTitle>
              <p className="text-xs text-muted-foreground">WooCommerce order.created &rarr; חשבונית &rarr; אישור &mdash; זמן כולל: 645ms</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-0">
                {traceChain.map((hop, i) => (
                  <div key={i} className="flex items-start gap-3 relative">
                    <div className="flex flex-col items-center">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border ${hop.status === "trigger" ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-400" : hop.status === "complete" ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400" : "bg-muted border-border text-muted-foreground"}`}>
                        {hop.step}
                      </div>
                      {i < traceChain.length - 1 && <div className="w-px h-8 bg-border" />}
                    </div>
                    <div className="flex-1 pb-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{hop.service}</span>
                        <Badge variant="outline" className="text-[10px]">{hop.event}</Badge>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                        <span className="font-mono">{hop.ts}</span>
                        {hop.duration !== "—" && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{hop.duration}</span>}
                        <Badge variant="outline" className={`text-[10px] ${hop.status === "trigger" ? "bg-indigo-500/15 text-indigo-400 border-indigo-500/30" : hop.status === "complete" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-muted/50 text-muted-foreground border-border"}`}>{hop.status}</Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Anomalies Tab */}
        <TabsContent value="anomalies" className="mt-4 space-y-4">
          {/* Severity breakdown */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "קריטי", count: 1, cls: "text-red-400 bg-red-500/15 border-red-500/30" },
              { label: "אזהרה", count: 1, cls: "text-amber-400 bg-amber-500/15 border-amber-500/30" },
              { label: "מידע", count: 1, cls: "text-sky-400 bg-sky-500/15 border-sky-500/30" },
            ].map((s) => (
              <Card key={s.label} className="border-border/60">
                <CardContent className="p-3 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{s.label}</span>
                  <Badge variant="outline" className={`text-sm font-bold ${s.cls}`}>{s.count}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-400" />חריגות שזוהו</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {anomalies.map((a) => (
                <div key={a.id} className="border rounded-lg p-4 space-y-2 bg-muted/20">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{a.id}</span>
                      <Badge variant="outline" className={`text-[10px] ${sevColor(a.severity)}`}>
                        {a.severity === "critical" ? "קריטי" : a.severity === "warning" ? "אזהרה" : "מידע"}
                      </Badge>
                      <span className="font-medium text-sm">{a.type}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Server className="h-3.5 w-3.5" />{a.integration}
                      <span className="mx-1">|</span>
                      <Clock className="h-3.5 w-3.5" />{a.detected}
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{a.desc}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Compliance Tab */}
        <TabsContent value="compliance" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-400" />בדיקת תאימות אינטגרציות</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead className="text-right">אינטגרציה</TableHead>
                    <TableHead className="text-center"><Lock className="h-3.5 w-3.5 mx-auto" />הצפנה</TableHead>
                    <TableHead className="text-center"><RotateCw className="h-3.5 w-3.5 mx-auto" />רענון טוקנים</TableHead>
                    <TableHead className="text-center"><FileText className="h-3.5 w-3.5 mx-auto" />יומן ביקורת</TableHead>
                    <TableHead className="text-center"><Zap className="h-3.5 w-3.5 mx-auto" />טיפול שגיאות</TableHead>
                    <TableHead className="text-center"><Gauge className="h-3.5 w-3.5 mx-auto" />Rate Limits</TableHead>
                    <TableHead className="text-right">ציון</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {complianceData.map((row) => (
                    <TableRow key={row.integration} className="text-sm hover:bg-muted/40 transition-colors">
                      <TableCell className="font-medium">{row.integration}</TableCell>
                      <TableCell className="text-center">{checkIcon(row.encryption)}</TableCell>
                      <TableCell className="text-center">{checkIcon(row.tokenRotation)}</TableCell>
                      <TableCell className="text-center">{checkIcon(row.auditLogs)}</TableCell>
                      <TableCell className="text-center">{checkIcon(row.errorHandling)}</TableCell>
                      <TableCell className="text-center">{checkIcon(row.rateLimits)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 min-w-[100px]">
                          <Progress value={row.score} className="h-2 flex-1" />
                          <span className={`text-xs font-mono font-bold ${row.score === 100 ? "text-emerald-400" : row.score >= 80 ? "text-amber-400" : "text-red-400"}`}>{row.score}%</span>
                        </div>
                      </TableCell>
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