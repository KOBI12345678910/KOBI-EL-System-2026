import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Zap, Radio, Users, Clock, AlertTriangle, MailWarning,
  Activity, CheckCircle, XCircle, Play, RefreshCw, Webhook,
  Mail, ArrowRightLeft, Filter, Gauge
} from "lucide-react";

/* ────── KPI Strip ────── */
const kpis = [
  { label: "סוגי אירועים", value: "45", icon: Radio, color: "text-violet-600", bg: "bg-violet-50" },
  { label: "אירועים היום", value: "1,847", icon: Zap, color: "text-blue-600", bg: "bg-blue-50" },
  { label: "מנויים", value: "68", icon: Users, color: "text-emerald-600", bg: "bg-emerald-50" },
  { label: "זמן עיבוד ממוצע", value: "12ms", icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
  { label: "Dead Letters", value: "2", icon: MailWarning, color: "text-red-600", bg: "bg-red-50" },
  { label: "תפוקה", value: "128 events/min", icon: Gauge, color: "text-indigo-600", bg: "bg-indigo-50" },
];

/* ────── Event Registry (15 types) ────── */
const eventTypes = [
  { name: "order.created", publisher: "הזמנות", subscribers: 8, today: 312, lastFired: "10:42:18", schema: "v3.1" },
  { name: "payment.received", publisher: "כספים", subscribers: 6, today: 287, lastFired: "10:41:55", schema: "v2.4" },
  { name: "installation.started", publisher: "התקנות", subscribers: 5, today: 41, lastFired: "10:38:02", schema: "v1.8" },
  { name: "qc.failed", publisher: "בקרת איכות", subscribers: 7, today: 12, lastFired: "10:35:44", schema: "v2.0" },
  { name: "document.approved", publisher: "מסמכים", subscribers: 4, today: 96, lastFired: "10:40:11", schema: "v1.5" },
  { name: "inventory.low_stock", publisher: "מלאי", subscribers: 6, today: 23, lastFired: "10:29:33", schema: "v2.2" },
  { name: "customer.updated", publisher: "CRM", subscribers: 5, today: 178, lastFired: "10:42:01", schema: "v3.0" },
  { name: "shipment.dispatched", publisher: "לוגיסטיקה", subscribers: 4, today: 65, lastFired: "10:37:15", schema: "v1.9" },
  { name: "invoice.generated", publisher: "חשבוניות", subscribers: 5, today: 203, lastFired: "10:41:30", schema: "v2.6" },
  { name: "employee.onboarded", publisher: "משאבי אנוש", subscribers: 3, today: 2, lastFired: "09:15:00", schema: "v1.2" },
  { name: "ticket.escalated", publisher: "שירות לקוחות", subscribers: 4, today: 8, lastFired: "10:22:47", schema: "v1.4" },
  { name: "production.completed", publisher: "ייצור", subscribers: 6, today: 89, lastFired: "10:39:58", schema: "v2.1" },
  { name: "quote.accepted", publisher: "הצעות מחיר", subscribers: 5, today: 34, lastFired: "10:30:22", schema: "v1.7" },
  { name: "workflow.step_done", publisher: "אוטומציה", subscribers: 3, today: 456, lastFired: "10:42:20", schema: "v2.8" },
  { name: "alert.threshold_breach", publisher: "ניטור", subscribers: 7, today: 41, lastFired: "10:36:09", schema: "v1.3" },
];

/* ────── Live Stream (20 recent events) ────── */
const liveEvents = [
  { ts: "10:42:20.341", name: "workflow.step_done", source: "אוטומציה", payload: '{"wf_id":"WF-882","step":4,"status":"ok"}', notified: 3, ms: 4 },
  { ts: "10:42:18.112", name: "order.created", source: "הזמנות", payload: '{"order_id":"ORD-7841","customer":"אלקטרו-טק","total":12400}', notified: 8, ms: 11 },
  { ts: "10:42:01.887", name: "customer.updated", source: "CRM", payload: '{"cust_id":"C-2291","field":"phone","old":"050...","new":"052..."}', notified: 5, ms: 7 },
  { ts: "10:41:55.224", name: "payment.received", source: "כספים", payload: '{"pay_id":"PAY-4412","amount":8750,"method":"credit"}', notified: 6, ms: 9 },
  { ts: "10:41:30.019", name: "invoice.generated", source: "חשבוניות", payload: '{"inv_id":"INV-9923","customer":"מגה-סולר","total":34200}', notified: 5, ms: 14 },
  { ts: "10:40:11.556", name: "document.approved", source: "מסמכים", payload: '{"doc_id":"DOC-1182","type":"contract","approved_by":"דנה"}', notified: 4, ms: 6 },
  { ts: "10:39:58.703", name: "production.completed", source: "ייצור", payload: '{"batch":"B-445","product":"SolarPanel-X3","qty":120}', notified: 6, ms: 18 },
  { ts: "10:38:02.441", name: "installation.started", source: "התקנות", payload: '{"inst_id":"INST-339","site":"נתניה","team":"צוות ב"}', notified: 5, ms: 8 },
  { ts: "10:37:15.990", name: "shipment.dispatched", source: "לוגיסטיקה", payload: '{"ship_id":"SHP-712","dest":"חיפה","items":14}', notified: 4, ms: 10 },
  { ts: "10:36:09.128", name: "alert.threshold_breach", source: "ניטור", payload: '{"metric":"cpu_usage","value":92,"threshold":85}', notified: 7, ms: 5 },
  { ts: "10:35:44.667", name: "qc.failed", source: "בקרת איכות", payload: '{"batch":"B-443","defect":"micro_crack","severity":"high"}', notified: 7, ms: 12 },
  { ts: "10:30:22.315", name: "quote.accepted", source: "הצעות מחיר", payload: '{"quote_id":"Q-2210","customer":"טופ-אנרגיה","value":67000}', notified: 5, ms: 9 },
  { ts: "10:29:33.882", name: "inventory.low_stock", source: "מלאי", payload: '{"sku":"INV-4481","item":"מהפך 5kW","qty":3,"min":10}', notified: 6, ms: 7 },
  { ts: "10:22:47.201", name: "ticket.escalated", source: "שירות לקוחות", payload: '{"ticket":"TK-8831","priority":"urgent","customer":"סאנטק"}', notified: 4, ms: 6 },
  { ts: "10:18:33.445", name: "order.created", source: "הזמנות", payload: '{"order_id":"ORD-7840","customer":"ירוק-פלוס","total":9200}', notified: 8, ms: 13 },
  { ts: "10:15:02.119", name: "payment.received", source: "כספים", payload: '{"pay_id":"PAY-4411","amount":15300,"method":"transfer"}', notified: 6, ms: 8 },
  { ts: "10:12:44.776", name: "workflow.step_done", source: "אוטומציה", payload: '{"wf_id":"WF-881","step":7,"status":"ok"}', notified: 3, ms: 3 },
  { ts: "10:09:11.330", name: "invoice.generated", source: "חשבוניות", payload: '{"inv_id":"INV-9922","customer":"גלובל-טק","total":21800}', notified: 5, ms: 15 },
  { ts: "10:05:28.992", name: "customer.updated", source: "CRM", payload: '{"cust_id":"C-2288","field":"address","old":"ת\"א","new":"ר\"ג"}', notified: 5, ms: 6 },
  { ts: "10:01:03.554", name: "production.completed", source: "ייצור", payload: '{"batch":"B-444","product":"Inverter-7K","qty":60}', notified: 6, ms: 19 },
];

/* ────── Subscribers (10) ────── */
const subscribers = [
  { pattern: "order.*", target: "Webhook", targetType: "webhook", filter: "amount > 5000", active: true, today: 198 },
  { pattern: "payment.*", target: "סנכרון חשבשבת", targetType: "sync", filter: "—", active: true, today: 287 },
  { pattern: "qc.failed", target: "אימייל מנהל איכות", targetType: "email", filter: 'severity = "high"', active: true, today: 9 },
  { pattern: "installation.*", target: "Workflow התקנות", targetType: "workflow", filter: "—", active: true, today: 41 },
  { pattern: "inventory.low_stock", target: "Webhook רכש", targetType: "webhook", filter: "qty < min", active: true, today: 23 },
  { pattern: "document.approved", target: "Workflow חתימות", targetType: "workflow", filter: 'type = "contract"', active: true, today: 48 },
  { pattern: "customer.*", target: "סנכרון CRM", targetType: "sync", filter: "—", active: true, today: 178 },
  { pattern: "alert.*", target: "Webhook Slack", targetType: "webhook", filter: "—", active: true, today: 41 },
  { pattern: "ticket.escalated", target: "אימייל סמנכ״ל", targetType: "email", filter: 'priority = "urgent"', active: false, today: 0 },
  { pattern: "shipment.*", target: "Workflow לוגיסטיקה", targetType: "workflow", filter: "—", active: true, today: 65 },
];

/* ────── Dead Letters (3) ────── */
const deadLetters = [
  {
    name: "payment.received",
    error: "Timeout: חשבשבת API לא הגיב תוך 30 שניות",
    attempts: 3,
    lastAttempt: "09:44:12",
    action: "בדוק חיבור לשרת חשבשבת והפעל מחדש",
  },
  {
    name: "qc.failed",
    error: "Schema mismatch: שדה severity חסר בגרסה v1.9",
    attempts: 2,
    lastAttempt: "08:31:05",
    action: "עדכן Publisher לגרסת Schema v2.0",
  },
  {
    name: "order.created",
    error: "Subscriber webhook returned 502 Bad Gateway",
    attempts: 5,
    lastAttempt: "07:15:33",
    action: "בדוק זמינות endpoint וחדש אישור SSL",
  },
];

/* ────── Helpers ────── */
const targetIcon = (type: string) => {
  switch (type) {
    case "webhook": return <Webhook className="h-3.5 w-3.5" />;
    case "workflow": return <ArrowRightLeft className="h-3.5 w-3.5" />;
    case "email": return <Mail className="h-3.5 w-3.5" />;
    case "sync": return <RefreshCw className="h-3.5 w-3.5" />;
    default: return <Activity className="h-3.5 w-3.5" />;
  }
};

const targetColor = (type: string) => {
  switch (type) {
    case "webhook": return "bg-sky-100 text-sky-700";
    case "workflow": return "bg-violet-100 text-violet-700";
    case "email": return "bg-rose-100 text-rose-700";
    case "sync": return "bg-emerald-100 text-emerald-700";
    default: return "bg-gray-100 text-gray-700";
  }
};

const processingColor = (ms: number) => {
  if (ms <= 5) return "text-emerald-600";
  if (ms <= 12) return "text-blue-600";
  return "text-amber-600";
};

/* ══════════════════════════════════════════════════════════════ */
export default function EventBusPage() {
  const [tab, setTab] = useState("registry");

  return (
    <div dir="rtl" className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-lg bg-amber-100">
          <Zap className="h-6 w-6 text-amber-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Event Bus — אוטובוס אירועים</h1>
          <p className="text-sm text-muted-foreground">טכנו-כל עוזי · ארכיטקטורת אירועים בזמן אמת</p>
        </div>
        <Badge variant="outline" className="mr-auto flex items-center gap-1 text-emerald-600 border-emerald-300">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" /> פעיל
        </Badge>
      </div>

      {/* ── KPI Strip ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{k.label}</p>
                  <p className="text-xl font-bold mt-0.5">{k.value}</p>
                </div>
                <div className={`p-2 rounded-lg ${k.bg}`}>
                  <k.icon className={`h-5 w-5 ${k.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Tabs ── */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="registry" className="flex items-center gap-1.5">
            <Radio className="h-4 w-4" /> Event Registry
          </TabsTrigger>
          <TabsTrigger value="live" className="flex items-center gap-1.5">
            <Activity className="h-4 w-4" /> Live Stream
          </TabsTrigger>
          <TabsTrigger value="subscribers" className="flex items-center gap-1.5">
            <Users className="h-4 w-4" /> Subscribers
          </TabsTrigger>
          <TabsTrigger value="dead" className="flex items-center gap-1.5">
            <MailWarning className="h-4 w-4" /> Dead Letters
          </TabsTrigger>
        </TabsList>

        {/* ──────── Event Registry ──────── */}
        <TabsContent value="registry">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Radio className="h-5 w-5 text-violet-500" />
                רישום אירועים — Event Registry
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">שם אירוע</TableHead>
                    <TableHead className="text-right">מודול מפרסם</TableHead>
                    <TableHead className="text-center">מנויים</TableHead>
                    <TableHead className="text-center">אירועים היום</TableHead>
                    <TableHead className="text-center">שעת שידור אחרון</TableHead>
                    <TableHead className="text-center">גרסת Schema</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {eventTypes.map((e) => (
                    <TableRow key={e.name}>
                      <TableCell>
                        <code className="px-2 py-0.5 rounded bg-slate-100 text-sm font-mono text-slate-800">{e.name}</code>
                      </TableCell>
                      <TableCell className="text-right">{e.publisher}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">{e.subscribers}</Badge>
                      </TableCell>
                      <TableCell className="text-center font-medium">{e.today.toLocaleString()}</TableCell>
                      <TableCell className="text-center font-mono text-sm text-muted-foreground">{e.lastFired}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="font-mono text-xs">{e.schema}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ──────── Live Stream ──────── */}
        <TabsContent value="live">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="h-5 w-5 text-blue-500" />
                  זרם חי — Live Stream
                </CardTitle>
                <Badge variant="outline" className="flex items-center gap-1 text-emerald-600 border-emerald-300 animate-pulse">
                  <Play className="h-3 w-3" /> Streaming
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">Timestamp</TableHead>
                    <TableHead className="text-right">אירוע</TableHead>
                    <TableHead className="text-right">מודול מקור</TableHead>
                    <TableHead className="text-right">Payload (תצוגה מקדימה)</TableHead>
                    <TableHead className="text-center">מנויים קיבלו</TableHead>
                    <TableHead className="text-center">עיבוד (ms)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {liveEvents.map((e, i) => (
                    <TableRow key={i} className={i === 0 ? "bg-blue-50/50" : ""}>
                      <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">{e.ts}</TableCell>
                      <TableCell>
                        <code className="px-2 py-0.5 rounded bg-slate-100 text-xs font-mono text-slate-800">{e.name}</code>
                      </TableCell>
                      <TableCell className="text-sm">{e.source}</TableCell>
                      <TableCell className="max-w-[260px]">
                        <code className="text-[11px] font-mono text-muted-foreground truncate block">{e.payload}</code>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary" className="text-xs">{e.notified}</Badge>
                      </TableCell>
                      <TableCell className={`text-center font-mono font-semibold ${processingColor(e.ms)}`}>
                        {e.ms}ms
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ──────── Subscribers ──────── */}
        <TabsContent value="subscribers">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5 text-emerald-500" />
                מנויים — Subscribers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">Event Pattern</TableHead>
                    <TableHead className="text-right">יעד</TableHead>
                    <TableHead className="text-right">סינון</TableHead>
                    <TableHead className="text-center">סטטוס</TableHead>
                    <TableHead className="text-center">עובד היום</TableHead>
                    <TableHead className="text-center">תפוקה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subscribers.map((s, i) => (
                    <TableRow key={i} className={!s.active ? "opacity-50" : ""}>
                      <TableCell>
                        <code className="px-2 py-0.5 rounded bg-slate-100 text-sm font-mono text-slate-800">{s.pattern}</code>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge className={`${targetColor(s.targetType)} flex items-center gap-1`}>
                            {targetIcon(s.targetType)}
                            {s.targetType}
                          </Badge>
                          <span className="text-sm">{s.target}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {s.filter !== "—" ? (
                          <code className="text-xs font-mono text-muted-foreground">{s.filter}</code>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {s.active ? (
                          <Badge className="bg-emerald-100 text-emerald-700 gap-1"><CheckCircle className="h-3 w-3" /> פעיל</Badge>
                        ) : (
                          <Badge className="bg-gray-100 text-gray-500 gap-1"><XCircle className="h-3 w-3" /> מושבת</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center font-medium">{s.today.toLocaleString()}</TableCell>
                      <TableCell className="text-center">
                        <Progress value={Math.min((s.today / 300) * 100, 100)} className="h-2 w-20 mx-auto" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ──────── Dead Letters ──────── */}
        <TabsContent value="dead">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <MailWarning className="h-5 w-5 text-red-500" />
                  Dead Letters — הודעות שנכשלו
                </CardTitle>
                <Badge variant="destructive">{deadLetters.length} הודעות</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {deadLetters.map((d, i) => (
                <Card key={i} className="border-red-200 bg-red-50/30">
                  <CardContent className="py-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-red-500" />
                        <code className="px-2 py-0.5 rounded bg-red-100 text-sm font-mono text-red-800">{d.name}</code>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <span>ניסיונות: <strong className="text-red-600">{d.attempts}</strong></span>
                        <span>ניסיון אחרון: <span className="font-mono">{d.lastAttempt}</span></span>
                      </div>
                    </div>
                    <div className="bg-white/80 rounded p-3 border border-red-100">
                      <p className="text-sm font-mono text-red-700">{d.error}</p>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle className="h-4 w-4 text-blue-500" />
                      <span className="font-medium text-blue-700">פעולה מומלצת:</span>
                      <span>{d.action}</span>
                    </div>
                    <Progress value={(d.attempts / 5) * 100} className="h-1.5" />
                  </CardContent>
                </Card>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}