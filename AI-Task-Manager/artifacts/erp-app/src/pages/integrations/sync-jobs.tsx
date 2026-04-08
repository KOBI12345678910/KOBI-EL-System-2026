import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  RefreshCw, Play, Pause, RotateCcw, AlertTriangle, CheckCircle,
  Clock, ArrowDownCircle, ArrowUpCircle, ArrowLeftRight, ListOrdered,
  History, XCircle, Zap, Timer, Activity, Database
} from "lucide-react";

/* ────── KPI Data ────── */
const kpiCards = [
  { label: "Jobs פעילים", value: "12", icon: Activity, color: "text-blue-600", bg: "bg-blue-50" },
  { label: "בריצה כרגע", value: "3", icon: Zap, color: "text-emerald-600", bg: "bg-emerald-50" },
  { label: "הושלמו היום", value: "45", icon: CheckCircle, color: "text-green-600", bg: "bg-green-50" },
  { label: "נכשלו", value: "2", icon: XCircle, color: "text-red-600", bg: "bg-red-50" },
  { label: "בתור", value: "5", icon: ListOrdered, color: "text-amber-600", bg: "bg-amber-50" },
  { label: "ממוצע זמן ריצה", value: "4.2s", icon: Timer, color: "text-purple-600", bg: "bg-purple-50" },
];

/* ────── Sync Jobs (12 configured) ────── */
const syncJobs = [
  { id: "JOB-001", name: "sync_payroll_hilan", cron: "0 6 * * *", cronHeb: "כל יום ב-06:00", connector: "Hilan API", direction: "inbound" as const, lastRun: "08/04/2026 06:00", nextRun: "09/04/2026 06:00", status: "active" as const, records: 312 },
  { id: "JOB-002", name: "sync_attendance", cron: "*/30 * * * *", cronHeb: "כל 30 דקות", connector: "Synel BioTime", direction: "inbound" as const, lastRun: "08/04/2026 14:30", nextRun: "08/04/2026 15:00", status: "active" as const, records: 1480 },
  { id: "JOB-003", name: "import_bank_transactions", cron: "0 8,14 * * 1-5", cronHeb: "ימים א׳-ה׳ ב-08:00 ו-14:00", connector: "Bank Hapoalim API", direction: "inbound" as const, lastRun: "08/04/2026 14:00", nextRun: "09/04/2026 08:00", status: "active" as const, records: 87 },
  { id: "JOB-004", name: "sync_inventory_levels", cron: "0 */2 * * *", cronHeb: "כל שעתיים", connector: "WMS Priority", direction: "bidirectional" as const, lastRun: "08/04/2026 14:00", nextRun: "08/04/2026 16:00", status: "active" as const, records: 2150 },
  { id: "JOB-005", name: "export_invoices_hashavshevet", cron: "0 22 * * *", cronHeb: "כל יום ב-22:00", connector: "Hashavshevet", direction: "outbound" as const, lastRun: "07/04/2026 22:00", nextRun: "08/04/2026 22:00", status: "active" as const, records: 34 },
  { id: "JOB-006", name: "sync_crm_contacts", cron: "0 */4 * * *", cronHeb: "כל 4 שעות", connector: "CRM Internal", direction: "bidirectional" as const, lastRun: "08/04/2026 12:00", nextRun: "08/04/2026 16:00", status: "active" as const, records: 560 },
  { id: "JOB-007", name: "import_supplier_prices", cron: "0 5 * * 0", cronHeb: "כל יום ראשון ב-05:00", connector: "Supplier Portal", direction: "inbound" as const, lastRun: "05/04/2026 05:00", nextRun: "12/04/2026 05:00", status: "active" as const, records: 1230 },
  { id: "JOB-008", name: "export_production_reports", cron: "0 23 * * 1-5", cronHeb: "ימים א׳-ה׳ ב-23:00", connector: "MES System", direction: "outbound" as const, lastRun: "07/04/2026 23:00", nextRun: "08/04/2026 23:00", status: "paused" as const, records: 0 },
  { id: "JOB-009", name: "sync_ecommerce_orders", cron: "*/15 * * * *", cronHeb: "כל 15 דקות", connector: "WooCommerce", direction: "inbound" as const, lastRun: "08/04/2026 14:45", nextRun: "08/04/2026 15:00", status: "active" as const, records: 95 },
  { id: "JOB-010", name: "sync_tax_authority", cron: "0 3 1 * *", cronHeb: "ראשון לכל חודש ב-03:00", connector: "רשות המסים", direction: "outbound" as const, lastRun: "01/04/2026 03:00", nextRun: "01/05/2026 03:00", status: "active" as const, records: 18 },
  { id: "JOB-011", name: "import_shipping_tracking", cron: "0 */3 * * *", cronHeb: "כל 3 שעות", connector: "Israel Post API", direction: "inbound" as const, lastRun: "08/04/2026 12:00", nextRun: "08/04/2026 15:00", status: "error" as const, records: 0 },
  { id: "JOB-012", name: "sync_google_calendar", cron: "*/10 * * * *", cronHeb: "כל 10 דקות", connector: "Google Workspace", direction: "bidirectional" as const, lastRun: "08/04/2026 14:50", nextRun: "08/04/2026 15:00", status: "active" as const, records: 42 },
];

/* ────── Queue Monitor (8 items) ────── */
const queueItems = [
  { position: 1, jobName: "sync_attendance", priority: "גבוהה", queuedAt: "14:52:10", estimatedStart: "14:52:30", status: "processing" as const },
  { position: 2, jobName: "sync_ecommerce_orders", priority: "גבוהה", queuedAt: "14:52:15", estimatedStart: "14:53:00", status: "processing" as const },
  { position: 3, jobName: "sync_google_calendar", priority: "רגילה", queuedAt: "14:52:20", estimatedStart: "14:53:30", status: "processing" as const },
  { position: 4, jobName: "sync_inventory_levels", priority: "גבוהה", queuedAt: "14:53:00", estimatedStart: "14:54:00", status: "waiting" as const },
  { position: 5, jobName: "sync_crm_contacts", priority: "רגילה", queuedAt: "14:53:10", estimatedStart: "14:55:00", status: "waiting" as const },
  { position: 6, jobName: "import_bank_transactions", priority: "רגילה", queuedAt: "14:53:15", estimatedStart: "14:56:00", status: "waiting" as const },
  { position: 7, jobName: "export_invoices_hashavshevet", priority: "נמוכה", queuedAt: "14:53:20", estimatedStart: "14:57:30", status: "completed" as const },
  { position: 8, jobName: "import_supplier_prices", priority: "נמוכה", queuedAt: "14:53:25", estimatedStart: "14:58:00", status: "completed" as const },
];

/* ────── Run History (15 recent) ────── */
const runHistory = [
  { job: "sync_attendance", startTime: "08/04 14:30:00", duration: "3.8s", processed: 48, created: 2, updated: 46, errored: 0, status: "success" as const },
  { job: "sync_ecommerce_orders", startTime: "08/04 14:45:02", duration: "2.1s", processed: 12, created: 5, updated: 7, errored: 0, status: "success" as const },
  { job: "sync_google_calendar", startTime: "08/04 14:50:01", duration: "1.4s", processed: 8, created: 1, updated: 7, errored: 0, status: "success" as const },
  { job: "sync_inventory_levels", startTime: "08/04 14:00:00", duration: "6.2s", processed: 215, created: 12, updated: 198, errored: 5, status: "warning" as const },
  { job: "import_bank_transactions", startTime: "08/04 14:00:01", duration: "4.5s", processed: 23, created: 23, updated: 0, errored: 0, status: "success" as const },
  { job: "sync_crm_contacts", startTime: "08/04 12:00:00", duration: "5.8s", processed: 56, created: 3, updated: 51, errored: 2, status: "warning" as const },
  { job: "sync_payroll_hilan", startTime: "08/04 06:00:00", duration: "8.3s", processed: 312, created: 0, updated: 312, errored: 0, status: "success" as const },
  { job: "export_invoices_hashavshevet", startTime: "07/04 22:00:00", duration: "3.2s", processed: 34, created: 34, updated: 0, errored: 0, status: "success" as const },
  { job: "import_shipping_tracking", startTime: "08/04 12:00:05", duration: "0.4s", processed: 0, created: 0, updated: 0, errored: 0, status: "failed" as const },
  { job: "sync_attendance", startTime: "08/04 14:00:00", duration: "3.5s", processed: 46, created: 1, updated: 45, errored: 0, status: "success" as const },
  { job: "sync_ecommerce_orders", startTime: "08/04 14:30:01", duration: "1.9s", processed: 9, created: 4, updated: 5, errored: 0, status: "success" as const },
  { job: "export_production_reports", startTime: "07/04 23:00:00", duration: "4.1s", processed: 18, created: 18, updated: 0, errored: 0, status: "success" as const },
  { job: "sync_tax_authority", startTime: "01/04 03:00:00", duration: "12.4s", processed: 18, created: 0, updated: 18, errored: 0, status: "success" as const },
  { job: "sync_google_calendar", startTime: "08/04 14:40:00", duration: "1.2s", processed: 6, created: 0, updated: 6, errored: 0, status: "success" as const },
  { job: "import_supplier_prices", startTime: "05/04 05:00:00", duration: "9.7s", processed: 1230, created: 45, updated: 1180, errored: 5, status: "warning" as const },
];

/* ────── Failed Jobs (3 failures) ────── */
const failedJobs = [
  {
    id: "FAIL-001", job: "import_shipping_tracking", failedAt: "08/04/2026 12:00:05", retryCount: 3,
    error: "ConnectionRefusedError: Israel Post API endpoint returned HTTP 503 Service Unavailable",
    stackTrace: "at HttpClient.request (node_modules/axios/lib/core/dispatchRequest.js:52)\n  at async SyncEngine.pullRecords (src/sync/engine.ts:148)\n  at async JobRunner.execute (src/jobs/runner.ts:67)",
  },
  {
    id: "FAIL-002", job: "sync_inventory_levels", failedAt: "08/04/2026 10:00:03", retryCount: 1,
    error: "ValidationError: SKU 'TK-44892' has negative quantity (-3) after sync delta applied",
    stackTrace: "at InventoryValidator.validate (src/validators/inventory.ts:89)\n  at async SyncEngine.applyDelta (src/sync/engine.ts:203)\n  at async JobRunner.execute (src/jobs/runner.ts:67)",
  },
  {
    id: "FAIL-003", job: "sync_crm_contacts", failedAt: "08/04/2026 08:00:12", retryCount: 2,
    error: "DuplicateKeyError: Contact email 'david@example.co.il' already exists with different entity_id",
    stackTrace: "at ContactMerger.upsert (src/crm/merger.ts:44)\n  at async SyncEngine.pushRecords (src/sync/engine.ts:175)\n  at async JobRunner.execute (src/jobs/runner.ts:67)",
  },
];

/* ────── Helpers ────── */
const directionConfig = {
  inbound: { label: "נכנס", icon: ArrowDownCircle, color: "text-blue-600" },
  outbound: { label: "יוצא", icon: ArrowUpCircle, color: "text-orange-600" },
  bidirectional: { label: "דו-כיווני", icon: ArrowLeftRight, color: "text-purple-600" },
};

const jobStatusBadge = (status: string) => {
  switch (status) {
    case "active": return <Badge className="bg-green-100 text-green-700">פעיל</Badge>;
    case "paused": return <Badge className="bg-amber-100 text-amber-700">מושהה</Badge>;
    case "error": return <Badge className="bg-red-100 text-red-700">שגיאה</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
};

const queueStatusBadge = (status: string) => {
  switch (status) {
    case "waiting": return <Badge className="bg-amber-100 text-amber-700">ממתין</Badge>;
    case "processing": return <Badge className="bg-blue-100 text-blue-700">בעיבוד</Badge>;
    case "completed": return <Badge className="bg-green-100 text-green-700">הושלם</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
};

const runStatusBadge = (status: string) => {
  switch (status) {
    case "success": return <Badge className="bg-green-100 text-green-700">הצלחה</Badge>;
    case "warning": return <Badge className="bg-amber-100 text-amber-700">הצלחה חלקית</Badge>;
    case "failed": return <Badge className="bg-red-100 text-red-700">נכשל</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
};

/* ═══════════════════════════════════════════════════════════ */
export default function SyncJobsPage() {
  const [activeTab, setActiveTab] = useState("sync-jobs");
  const [expandedFail, setExpandedFail] = useState<string | null>(null);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-50">
            <RefreshCw className="h-6 w-6 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">מנוע סנכרון ותורי עבודה</h1>
            <p className="text-sm text-muted-foreground">טכנו-כל עוזי &mdash; ניהול Jobs, תורים, והיסטוריית ריצות</p>
          </div>
        </div>
        <Badge variant="outline" className="text-xs gap-1">
          <span className="h-2 w-2 rounded-full bg-green-500 inline-block animate-pulse" />
          מנוע פעיל
        </Badge>
      </div>

      {/* ── KPI Strip ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpiCards.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.label}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">{kpi.label}</p>
                    <p className="text-2xl font-bold">{kpi.value}</p>
                  </div>
                  <div className={`p-2 rounded-lg ${kpi.bg}`}>
                    <Icon className={`h-5 w-5 ${kpi.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── Tabs ── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="sync-jobs" className="gap-1"><Database className="h-4 w-4" /> Sync Jobs</TabsTrigger>
          <TabsTrigger value="queue" className="gap-1"><ListOrdered className="h-4 w-4" /> Queue Monitor</TabsTrigger>
          <TabsTrigger value="history" className="gap-1"><History className="h-4 w-4" /> Run History</TabsTrigger>
          <TabsTrigger value="failed" className="gap-1"><AlertTriangle className="h-4 w-4" /> Failed Jobs</TabsTrigger>
        </TabsList>

        {/* ═══ Tab 1 — Sync Jobs ═══ */}
        <TabsContent value="sync-jobs">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Jobs מוגדרים ({syncJobs.length})</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">מזהה</TableHead>
                    <TableHead className="text-right">שם Job</TableHead>
                    <TableHead className="text-right">תזמון</TableHead>
                    <TableHead className="text-right">מחבר</TableHead>
                    <TableHead className="text-right">כיוון</TableHead>
                    <TableHead className="text-right">ריצה אחרונה</TableHead>
                    <TableHead className="text-right">ריצה הבאה</TableHead>
                    <TableHead className="text-right">סטטוס</TableHead>
                    <TableHead className="text-right">רשומות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {syncJobs.map((job) => {
                    const dir = directionConfig[job.direction];
                    const DirIcon = dir.icon;
                    return (
                      <TableRow key={job.id}>
                        <TableCell className="font-mono text-xs">{job.id}</TableCell>
                        <TableCell className="font-mono text-sm">{job.name}</TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-xs font-mono text-muted-foreground" title={`Cron: ${job.cron}`}>{job.cron}</span>
                            <span className="text-xs">{job.cronHeb}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{job.connector}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center gap-1 text-xs ${dir.color}`}>
                            <DirIcon className="h-3.5 w-3.5" /> {dir.label}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs">{job.lastRun}</TableCell>
                        <TableCell className="text-xs">{job.nextRun}</TableCell>
                        <TableCell>{jobStatusBadge(job.status)}</TableCell>
                        <TableCell className="font-medium">{job.records.toLocaleString()}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ Tab 2 — Queue Monitor ═══ */}
        <TabsContent value="queue">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">תור ריצות בזמן אמת</CardTitle>
                <Badge variant="outline" className="gap-1 text-xs">
                  <span className="h-2 w-2 rounded-full bg-blue-500 inline-block animate-pulse" />
                  8 פריטים בתור
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right w-16">#</TableHead>
                    <TableHead className="text-right">שם Job</TableHead>
                    <TableHead className="text-right">עדיפות</TableHead>
                    <TableHead className="text-right">נכנס לתור</TableHead>
                    <TableHead className="text-right">התחלה משוערת</TableHead>
                    <TableHead className="text-right">סטטוס</TableHead>
                    <TableHead className="text-right">התקדמות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queueItems.map((item) => (
                    <TableRow key={item.position}>
                      <TableCell className="font-bold text-center">{item.position}</TableCell>
                      <TableCell className="font-mono text-sm">{item.jobName}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={
                          item.priority === "גבוהה" ? "border-red-300 text-red-700" :
                          item.priority === "נמוכה" ? "border-gray-300 text-gray-500" :
                          "border-blue-300 text-blue-700"
                        }>
                          {item.priority}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{item.queuedAt}</TableCell>
                      <TableCell className="font-mono text-xs">{item.estimatedStart}</TableCell>
                      <TableCell>{queueStatusBadge(item.status)}</TableCell>
                      <TableCell className="w-32">
                        <Progress
                          value={item.status === "completed" ? 100 : item.status === "processing" ? 65 : 0}
                          className="h-2"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ Tab 3 — Run History ═══ */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">היסטוריית ריצות אחרונות ({runHistory.length})</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">Job</TableHead>
                    <TableHead className="text-right">זמן התחלה</TableHead>
                    <TableHead className="text-right">משך</TableHead>
                    <TableHead className="text-right">עובדו</TableHead>
                    <TableHead className="text-right">נוצרו</TableHead>
                    <TableHead className="text-right">עודכנו</TableHead>
                    <TableHead className="text-right">שגיאות</TableHead>
                    <TableHead className="text-right">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runHistory.map((run, i) => (
                    <TableRow key={`${run.job}-${i}`}>
                      <TableCell className="font-mono text-sm">{run.job}</TableCell>
                      <TableCell className="font-mono text-xs">{run.startTime}</TableCell>
                      <TableCell className="text-sm">{run.duration}</TableCell>
                      <TableCell className="font-medium">{run.processed}</TableCell>
                      <TableCell className="text-green-600">{run.created}</TableCell>
                      <TableCell className="text-blue-600">{run.updated}</TableCell>
                      <TableCell className={run.errored > 0 ? "text-red-600 font-medium" : "text-muted-foreground"}>{run.errored}</TableCell>
                      <TableCell>{runStatusBadge(run.status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ Tab 4 — Failed Jobs ═══ */}
        <TabsContent value="failed">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                  <CardTitle className="text-lg">כשלונות אחרונים ({failedJobs.length})</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {failedJobs.map((fail) => (
                  <div key={fail.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Badge className="bg-red-100 text-red-700">{fail.id}</Badge>
                        <span className="font-mono text-sm font-medium">{fail.job}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs gap-1">
                          <RotateCcw className="h-3 w-3" /> ניסיון {fail.retryCount}/5
                        </Badge>
                        <span className="text-xs text-muted-foreground">{fail.failedAt}</span>
                      </div>
                    </div>

                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <p className="text-sm text-red-700 font-medium">{fail.error}</p>
                    </div>

                    <div>
                      <button
                        className="text-xs text-muted-foreground hover:text-foreground underline"
                        onClick={() => setExpandedFail(expandedFail === fail.id ? null : fail.id)}
                      >
                        {expandedFail === fail.id ? "הסתר Stack Trace" : "הצג Stack Trace"}
                      </button>
                      {expandedFail === fail.id && (
                        <pre className="mt-2 bg-gray-900 text-gray-200 rounded-lg p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                          {fail.stackTrace}
                        </pre>
                      )}
                    </div>

                    <div className="flex gap-2 pt-1">
                      <button className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700">
                        <Play className="h-3 w-3" /> הרץ שוב
                      </button>
                      <button className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md border hover:bg-gray-50">
                        <Pause className="h-3 w-3" /> השהה Job
                      </button>
                      <button className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md border hover:bg-gray-50">
                        <XCircle className="h-3 w-3" /> סמן כטופל
                      </button>
                    </div>
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
