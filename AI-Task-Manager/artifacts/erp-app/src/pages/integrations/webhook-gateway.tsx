import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Radio, CheckCircle, XCircle, RotateCcw, AlertTriangle,
  Globe, Key, Eye, EyeOff, RefreshCw, Trash2, Send,
  Activity, Zap, Archive, ShieldCheck
} from "lucide-react";

const subscriptions = [
  { id: "WHK-001", event: "order.created", url: "https://erp.techno-kol.co.il/hooks/orders", method: "POST", secret: "whsec_Kx9•••••••mZ4", active: true, lastTriggered: "2026-04-08 09:42", deliveries: 87 },
  { id: "WHK-002", event: "invoice.paid", url: "https://accounting.techno-kol.co.il/incoming", method: "POST", secret: "whsec_Pp3•••••••rT1", active: true, lastTriggered: "2026-04-08 10:15", deliveries: 64 },
  { id: "WHK-003", event: "installation.completed", url: "https://field.techno-kol.co.il/api/done", method: "POST", secret: "whsec_Qm7•••••••bN8", active: true, lastTriggered: "2026-04-08 08:30", deliveries: 42 },
  { id: "WHK-004", event: "quote.approved", url: "https://crm.techno-kol.co.il/webhooks", method: "POST", secret: "whsec_Jd5•••••••wL2", active: true, lastTriggered: "2026-04-07 17:55", deliveries: 31 },
  { id: "WHK-005", event: "inventory.low_stock", url: "https://warehouse.techno-kol.co.il/alerts", method: "POST", secret: "whsec_Tn2•••••••xR9", active: true, lastTriggered: "2026-04-08 07:12", deliveries: 28 },
  { id: "WHK-006", event: "payment.failed", url: "https://finance.techno-kol.co.il/hooks/pay", method: "POST", secret: "whsec_Wv8•••••••cF3", active: true, lastTriggered: "2026-04-08 11:03", deliveries: 19 },
  { id: "WHK-007", event: "ticket.created", url: "https://support.techno-kol.co.il/intake", method: "POST", secret: "whsec_Hb6•••••••pK5", active: true, lastTriggered: "2026-04-08 10:48", deliveries: 53 },
  { id: "WHK-008", event: "shipment.dispatched", url: "https://logistics.techno-kol.co.il/track", method: "POST", secret: "whsec_Rg4•••••••eY7", active: true, lastTriggered: "2026-04-08 06:20", deliveries: 36 },
  { id: "WHK-009", event: "customer.updated", url: "https://crm.techno-kol.co.il/sync", method: "POST", secret: "whsec_Ls1•••••••aW6", active: false, lastTriggered: "2026-04-05 14:30", deliveries: 22 },
  { id: "WHK-010", event: "production.stage_changed", url: "https://mes.techno-kol.co.il/events", method: "POST", secret: "whsec_Dz9•••••••hM4", active: true, lastTriggered: "2026-04-08 09:58", deliveries: 41 },
  { id: "WHK-011", event: "employee.onboarded", url: "https://hr.techno-kol.co.il/hooks", method: "POST", secret: "whsec_Fy3•••••••oJ8", active: true, lastTriggered: "2026-04-07 11:45", deliveries: 12 },
  { id: "WHK-012", event: "quality.inspection_failed", url: "https://qa.techno-kol.co.il/notify", method: "POST", secret: "whsec_Ck7•••••••uB2", active: false, lastTriggered: "2026-04-06 15:10", deliveries: 21 },
];
const deliveryLog = [
  { id: 1, ts: "2026-04-08 11:03:22", whId: "WHK-006", event: "payment.failed", url: "https://finance.techno-kol.co.il/hooks/pay", status: 200, durationMs: 142, payloadKB: 1.3, retries: 0, state: "delivered" },
  { id: 2, ts: "2026-04-08 10:48:11", whId: "WHK-007", event: "ticket.created", url: "https://support.techno-kol.co.il/intake", status: 201, durationMs: 98, payloadKB: 2.1, retries: 0, state: "delivered" },
  { id: 3, ts: "2026-04-08 10:15:45", whId: "WHK-002", event: "invoice.paid", url: "https://accounting.techno-kol.co.il/incoming", status: 200, durationMs: 203, payloadKB: 3.4, retries: 0, state: "delivered" },
  { id: 4, ts: "2026-04-08 09:58:30", whId: "WHK-010", event: "production.stage_changed", url: "https://mes.techno-kol.co.il/events", status: 200, durationMs: 167, payloadKB: 1.8, retries: 0, state: "delivered" },
  { id: 5, ts: "2026-04-08 09:42:18", whId: "WHK-001", event: "order.created", url: "https://erp.techno-kol.co.il/hooks/orders", status: 200, durationMs: 312, payloadKB: 5.2, retries: 0, state: "delivered" },
  { id: 6, ts: "2026-04-08 09:35:02", whId: "WHK-005", event: "inventory.low_stock", url: "https://warehouse.techno-kol.co.il/alerts", status: 500, durationMs: 2015, payloadKB: 0.9, retries: 3, state: "failed" },
  { id: 7, ts: "2026-04-08 09:30:44", whId: "WHK-003", event: "installation.completed", url: "https://field.techno-kol.co.il/api/done", status: 200, durationMs: 189, payloadKB: 2.7, retries: 0, state: "delivered" },
  { id: 8, ts: "2026-04-08 09:12:57", whId: "WHK-008", event: "shipment.dispatched", url: "https://logistics.techno-kol.co.il/track", status: 201, durationMs: 134, payloadKB: 1.6, retries: 0, state: "delivered" },
  { id: 9, ts: "2026-04-08 08:55:33", whId: "WHK-004", event: "quote.approved", url: "https://crm.techno-kol.co.il/webhooks", status: 200, durationMs: 221, payloadKB: 4.1, retries: 0, state: "delivered" },
  { id: 10, ts: "2026-04-08 08:30:10", whId: "WHK-003", event: "installation.completed", url: "https://field.techno-kol.co.il/api/done", status: 200, durationMs: 175, payloadKB: 2.4, retries: 0, state: "delivered" },
  { id: 11, ts: "2026-04-08 08:15:41", whId: "WHK-001", event: "order.created", url: "https://erp.techno-kol.co.il/hooks/orders", status: 0, durationMs: 30000, payloadKB: 4.8, retries: 3, state: "retrying" },
  { id: 12, ts: "2026-04-08 07:50:28", whId: "WHK-002", event: "invoice.paid", url: "https://accounting.techno-kol.co.il/incoming", status: 200, durationMs: 188, payloadKB: 3.0, retries: 0, state: "delivered" },
  { id: 13, ts: "2026-04-08 07:12:05", whId: "WHK-005", event: "inventory.low_stock", url: "https://warehouse.techno-kol.co.il/alerts", status: 200, durationMs: 110, payloadKB: 0.8, retries: 0, state: "delivered" },
  { id: 14, ts: "2026-04-08 06:42:33", whId: "WHK-008", event: "shipment.dispatched", url: "https://logistics.techno-kol.co.il/track", status: 502, durationMs: 5200, payloadKB: 1.4, retries: 2, state: "retrying" },
  { id: 15, ts: "2026-04-08 06:20:11", whId: "WHK-008", event: "shipment.dispatched", url: "https://logistics.techno-kol.co.il/track", status: 201, durationMs: 127, payloadKB: 1.7, retries: 0, state: "delivered" },
  { id: 16, ts: "2026-04-08 05:55:08", whId: "WHK-001", event: "order.created", url: "https://erp.techno-kol.co.il/hooks/orders", status: 200, durationMs: 298, payloadKB: 4.5, retries: 0, state: "delivered" },
  { id: 17, ts: "2026-04-07 23:10:39", whId: "WHK-009", event: "customer.updated", url: "https://crm.techno-kol.co.il/sync", status: 404, durationMs: 89, payloadKB: 2.0, retries: 3, state: "dead" },
];
const dlqItems = [
  { id: 1, whId: "WHK-005", event: "inventory.low_stock", error: "Connection refused: upstream server not responding (ECONNREFUSED 10.0.2.15:443)", attempts: 5, lastAttempt: "2026-04-08 09:35:02", payload: '{"sku":"AL-PROF-60","qty":3,"min":10}' },
  { id: 2, whId: "WHK-009", event: "customer.updated", error: "HTTP 404 - Endpoint /sync was removed in API v3 migration", attempts: 5, lastAttempt: "2026-04-08 05:10:39", payload: '{"customerId":1042,"field":"phone"}' },
  { id: 3, whId: "WHK-001", event: "order.created", error: "Timeout after 30000ms - no response from target", attempts: 4, lastAttempt: "2026-04-08 08:15:41", payload: '{"orderId":"ORD-2026-1847","total":12450}' },
];
const securitySettings = {
  signing: { algorithm: "HMAC-SHA256", headerName: "X-TechnoKol-Signature", timestampTolerance: 300 },
  ipAllowlist: ["185.120.33.0/24", "212.179.44.10", "93.172.56.0/28", "10.0.0.0/8"],
  tls: { minVersion: "TLS 1.2", verifyPeer: true, certPinning: false, cipherSuites: ["TLS_AES_256_GCM_SHA384", "TLS_CHACHA20_POLY1305_SHA256"] },
};
function httpBadge(code: number) {
  if (code === 0) return <Badge className="bg-zinc-500/20 text-zinc-400">timeout</Badge>;
  if (code >= 200 && code < 300) return <Badge className="bg-emerald-500/20 text-emerald-400">{code}</Badge>;
  if (code >= 400 && code < 500) return <Badge className="bg-amber-500/20 text-amber-400">{code}</Badge>;
  return <Badge className="bg-red-500/20 text-red-400">{code}</Badge>;
}
const stateCfg: Record<string, { label: string; cls: string; icon: typeof CheckCircle }> = {
  delivered: { label: "נמסר", cls: "bg-emerald-500/20 text-emerald-400", icon: CheckCircle },
  failed:    { label: "נכשל", cls: "bg-red-500/20 text-red-400", icon: XCircle },
  retrying:  { label: "ניסיון חוזר", cls: "bg-amber-500/20 text-amber-400", icon: RotateCcw },
  dead:      { label: "DLQ", cls: "bg-zinc-500/20 text-zinc-400", icon: Archive },
};
export default function WebhookGatewayPage() {
  const [tab, setTab] = useState("subscriptions");
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  const toggleSecret = (id: string) =>
    setShowSecrets((p) => ({ ...p, [id]: !p[id] }));

  return (
    <div className="min-h-screen bg-background p-6 space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-indigo-500/20">
          <Radio className="h-6 w-6 text-indigo-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Webhook Gateway</h1>
          <p className="text-sm text-muted-foreground">טכנו-כל עוזי &mdash; ניהול webhooks, מנויים ויומן משלוחים</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: "webhooks רשומים", value: "18", icon: Radio, color: "text-indigo-400", bg: "bg-indigo-500/20" },
          { label: "deliveries היום", value: "456", icon: Send, color: "text-sky-400", bg: "bg-sky-500/20" },
          { label: "הצלחות", value: "98.7%", icon: CheckCircle, color: "text-emerald-400", bg: "bg-emerald-500/20" },
          { label: "כשלים", value: "6", icon: XCircle, color: "text-red-400", bg: "bg-red-500/20" },
          { label: "retries", value: "4", icon: RotateCcw, color: "text-amber-400", bg: "bg-amber-500/20" },
          { label: "DLQ", value: "2", icon: Archive, color: "text-zinc-400", bg: "bg-zinc-500/20" },
        ].map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{kpi.label}</p>
                  <p className="text-xl font-bold mt-1">{kpi.value}</p>
                </div>
                <div className={`p-2 rounded-lg ${kpi.bg}`}>
                  <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="subscriptions">מנויים</TabsTrigger>
          <TabsTrigger value="delivery-log">יומן משלוחים</TabsTrigger>
          <TabsTrigger value="dlq">DLQ</TabsTrigger>
          <TabsTrigger value="security">אבטחה</TabsTrigger>
        </TabsList>
        <TabsContent value="subscriptions">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Zap className="h-5 w-5 text-indigo-400" />
                Webhook Subscriptions ({subscriptions.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>אירוע</TableHead>
                    <TableHead>Target URL</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Secret</TableHead>
                    <TableHead>סטטוס</TableHead>
                    <TableHead>הפעלה אחרונה</TableHead>
                    <TableHead>משלוחים</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subscriptions.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs">{s.id}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs">{s.event}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs max-w-[220px] truncate">{s.url}</TableCell>
                      <TableCell>
                        <Badge className="bg-blue-500/20 text-blue-400">{s.method}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-xs">
                            {showSecrets[s.id] ? s.secret.replace(/•/g, "a") : s.secret}
                          </span>
                          <button onClick={() => toggleSecret(s.id)} className="text-muted-foreground hover:text-foreground">
                            {showSecrets[s.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={s.active ? "bg-emerald-500/20 text-emerald-400" : "bg-zinc-500/20 text-zinc-400"}>
                          {s.active ? "פעיל" : "מושהה"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{s.lastTriggered}</TableCell>
                      <TableCell className="font-medium">{s.deliveries}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="delivery-log">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Activity className="h-5 w-5 text-sky-400" />
                Delivery Log &mdash; {deliveryLog.length} אחרונים
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>זמן</TableHead>
                    <TableHead>Webhook</TableHead>
                    <TableHead>אירוע</TableHead>
                    <TableHead>Target URL</TableHead>
                    <TableHead>HTTP</TableHead>
                    <TableHead>משך (ms)</TableHead>
                    <TableHead>Payload</TableHead>
                    <TableHead>Retries</TableHead>
                    <TableHead>סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveryLog.map((d) => {
                    const sc = stateCfg[d.state] || stateCfg.delivered;
                    const Ic = sc.icon;
                    return (
                      <TableRow key={d.id}>
                        <TableCell className="font-mono text-xs whitespace-nowrap">{d.ts}</TableCell>
                        <TableCell className="font-mono text-xs">{d.whId}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-xs">{d.event}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs max-w-[180px] truncate">{d.url}</TableCell>
                        <TableCell>{httpBadge(d.status)}</TableCell>
                        <TableCell className={`font-mono text-xs ${d.durationMs > 5000 ? "text-red-400" : d.durationMs > 1000 ? "text-amber-400" : "text-emerald-400"}`}>
                          {d.durationMs.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-xs">{d.payloadKB} KB</TableCell>
                        <TableCell>
                          {d.retries > 0 ? (
                            <Badge className="bg-amber-500/20 text-amber-400">{d.retries}</Badge>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className={sc.cls}>
                            <Ic className="h-3 w-3 ml-1" />
                            {sc.label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="dlq">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <AlertTriangle className="h-5 w-5 text-red-400" />
                Dead Letter Queue ({dlqItems.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {dlqItems.map((item) => (
                <div key={item.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium">{item.whId}</span>
                        <Badge variant="outline" className="font-mono text-xs">{item.event}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">ניסיון אחרון: {item.lastAttempt}</p>
                    </div>
                    <Badge className="bg-red-500/20 text-red-400">ניסיונות: {item.attempts}/5</Badge>
                  </div>

                  <div className="bg-red-500/10 border border-red-500/20 rounded p-3">
                    <p className="text-sm text-red-400 font-mono">{item.error}</p>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="bg-muted rounded p-2">
                      <code className="text-xs">{item.payload}</code>
                    </div>
                    <div className="flex gap-2">
                      <button className="flex items-center gap-1 px-3 py-1.5 rounded text-xs bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors">
                        <RefreshCw className="h-3.5 w-3.5" /> שלח שוב
                      </button>
                      <button className="flex items-center gap-1 px-3 py-1.5 rounded text-xs bg-zinc-500/20 text-zinc-400 hover:bg-zinc-500/30 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" /> מחק
                      </button>
                    </div>
                  </div>

                  <Progress value={(item.attempts / 5) * 100} className="h-1.5" />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="security">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Key className="h-5 w-5 text-amber-400" />
                  Webhook Signing
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">אלגוריתם</p>
                    <Badge className="bg-emerald-500/20 text-emerald-400">{securitySettings.signing.algorithm}</Badge>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Header</p>
                    <code className="text-sm font-mono">{securitySettings.signing.headerName}</code>
                  </div>
                  <div className="space-y-1 col-span-2">
                    <p className="text-xs text-muted-foreground">סבילות Timestamp</p>
                    <p className="text-sm font-medium">{securitySettings.signing.timestampTolerance} שניות (5 דקות)</p>
                  </div>
                </div>
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">דוגמת אימות חתימה:</p>
                  <code className="text-xs font-mono block leading-relaxed">
                    const sig = crypto.createHmac('sha256', secret).update(timestamp + '.' + body).digest('hex');
                  </code>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Globe className="h-5 w-5 text-blue-400" />
                  IP Allowlist
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">רק כתובות IP מורשות יכולות לקבל webhooks</p>
                <div className="space-y-2">
                  {securitySettings.ipAllowlist.map((ip) => (
                    <div key={ip} className="flex items-center justify-between p-2 bg-muted rounded">
                      <code className="font-mono text-sm">{ip}</code>
                      <Badge className="bg-emerald-500/20 text-emerald-400">
                        <CheckCircle className="h-3 w-3 ml-1" />
                        מאושר
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ShieldCheck className="h-5 w-5 text-emerald-400" />
                  TLS Verification
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">גרסת TLS מינימלית</p>
                    <Badge className="bg-emerald-500/20 text-emerald-400">{securitySettings.tls.minVersion}</Badge>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">אימות Peer</p>
                    <Badge className={securitySettings.tls.verifyPeer ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}>
                      {securitySettings.tls.verifyPeer ? "מופעל" : "כבוי"}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Certificate Pinning</p>
                    <Badge className={securitySettings.tls.certPinning ? "bg-emerald-500/20 text-emerald-400" : "bg-zinc-500/20 text-zinc-400"}>
                      {securitySettings.tls.certPinning ? "מופעל" : "כבוי"}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Cipher Suites</p>
                    <div className="flex flex-col gap-1">
                      {securitySettings.tls.cipherSuites.map((c) => (
                        <code key={c} className="text-xs font-mono text-muted-foreground">{c}</code>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
