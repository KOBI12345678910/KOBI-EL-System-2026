import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  RotateCcw, Skull, Settings2, Gauge, History,
  RefreshCw, Trash2, Search, AlertTriangle, Timer,
  CheckCircle2, XCircle, Zap, ShieldAlert, ArrowDownUp
} from "lucide-react";

const dlqItems = [
  { id: "DLQ-001", event: "webhook/order.created", error: "Timeout: endpoint unreachable after 30s", attempts: "3/3", firstFailure: "2026-04-08 08:12:33", lastAttempt: "2026-04-08 09:45:10", payloadSize: "2.4 KB" },
  { id: "DLQ-002", event: "webhook/invoice.paid", error: "HTTP 502 Bad Gateway from target", attempts: "3/3", firstFailure: "2026-04-07 22:05:11", lastAttempt: "2026-04-08 01:30:44", payloadSize: "1.8 KB" },
  { id: "DLQ-003", event: "event/stock.updated", error: "JSON parse error: unexpected token at pos 0", attempts: "3/3", firstFailure: "2026-04-08 06:33:21", lastAttempt: "2026-04-08 07:55:09", payloadSize: "4.1 KB" },
  { id: "DLQ-004", event: "webhook/customer.deleted", error: "TLS handshake failed: certificate expired", attempts: "3/3", firstFailure: "2026-04-08 03:17:45", lastAttempt: "2026-04-08 05:22:18", payloadSize: "0.9 KB" },
  { id: "DLQ-005", event: "event/payment.refunded", error: "Rate limit exceeded: 429 Too Many Requests", attempts: "3/3", firstFailure: "2026-04-08 10:01:02", lastAttempt: "2026-04-08 11:15:30", payloadSize: "3.2 KB" },
];

const retryPolicies = [
  { integration: "Webhooks יוצאים", maxAttempts: 3, backoff: "exponential", initialDelay: "10s", maxDelay: "5m", timeout: "30s" },
  { integration: "API חשבשבת", maxAttempts: 5, backoff: "exponential", initialDelay: "5s", maxDelay: "10m", timeout: "60s" },
  { integration: "Sync מלאי", maxAttempts: 4, backoff: "linear", initialDelay: "15s", maxDelay: "2m", timeout: "45s" },
  { integration: "CRM Events", maxAttempts: 3, backoff: "fixed", initialDelay: "30s", maxDelay: "30s", timeout: "20s" },
  { integration: "שליחת מיילים", maxAttempts: 5, backoff: "exponential", initialDelay: "3s", maxDelay: "15m", timeout: "120s" },
  { integration: "Payment Gateway", maxAttempts: 2, backoff: "exponential", initialDelay: "20s", maxDelay: "3m", timeout: "90s" },
];

const rateLimits = [
  { service: "API חשבשבת", limit: "60/min", usage: 45, burst: 80, breaches: 3, throttled: 12 },
  { service: "Webhook Delivery", limit: "120/min", usage: 88, burst: 150, breaches: 2, throttled: 8 },
  { service: "CRM Sync", limit: "30/min", usage: 22, burst: 50, breaches: 0, throttled: 0 },
  { service: "מערכת מיילים", limit: "100/min", usage: 67, burst: 120, breaches: 1, throttled: 3 },
  { service: "Payment API", limit: "40/min", usage: 38, burst: 60, breaches: 2, throttled: 6 },
  { service: "Stock Service", limit: "200/min", usage: 155, burst: 250, breaches: 1, throttled: 4 },
  { service: "SMS Gateway", limit: "20/min", usage: 18, burst: 30, breaches: 2, throttled: 9 },
  { service: "Analytics Push", limit: "150/min", usage: 42, burst: 200, breaches: 1, throttled: 2 },
];

const retryHistory = [
  { item: "DLQ-001", attempt: 2, delay: "20s", result: "fail" as const, duration: "31.2s" },
  { item: "DLQ-003", attempt: 1, delay: "10s", result: "fail" as const, duration: "5.1s" },
  { item: "INV-2281", attempt: 1, delay: "5s", result: "success" as const, duration: "1.3s" },
  { item: "DLQ-005", attempt: 3, delay: "5m", result: "fail" as const, duration: "30.0s" },
  { item: "WH-4410", attempt: 2, delay: "20s", result: "success" as const, duration: "2.8s" },
  { item: "DLQ-002", attempt: 3, delay: "5m", result: "fail" as const, duration: "30.0s" },
  { item: "SYNC-881", attempt: 1, delay: "15s", result: "success" as const, duration: "3.5s" },
  { item: "PAY-339", attempt: 1, delay: "20s", result: "success" as const, duration: "4.2s" },
  { item: "DLQ-004", attempt: 2, delay: "40s", result: "fail" as const, duration: "10.5s" },
  { item: "EMAIL-772", attempt: 1, delay: "3s", result: "success" as const, duration: "0.9s" },
];

const kpis = [
  { label: "פריטים ב-DLQ", value: "5", icon: Skull, color: "text-red-400", bg: "bg-red-500/10" },
  { label: "Retries היום", value: "23", icon: RotateCcw, color: "text-blue-400", bg: "bg-blue-500/10" },
  { label: "הצלחה אחרי Retry", value: "87%", icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { label: "Rate Limit Breaches", value: "12", icon: ShieldAlert, color: "text-amber-400", bg: "bg-amber-500/10" },
  { label: "Avg Retry Delay", value: "30s", icon: Timer, color: "text-purple-400", bg: "bg-purple-500/10" },
];

function BackoffVisual({ strategy, initial }: { strategy: string; initial: string }) {
  const base = parseInt(initial);
  let steps: number[];
  if (strategy === "exponential") {
    steps = [base, base * 2, base * 4, base * 8];
  } else if (strategy === "linear") {
    steps = [base, base * 2, base * 3, base * 4];
  } else {
    steps = [base, base, base, base];
  }
  const max = Math.max(...steps);
  return (
    <div className="flex items-end gap-1 h-6">
      {steps.map((s, i) => (
        <div
          key={i}
          className="bg-blue-500/70 rounded-sm min-w-[4px]"
          style={{ height: `${Math.max(20, (s / max) * 100)}%`, width: 6 }}
          title={`ניסיון ${i + 1}: ${s}s`}
        />
      ))}
    </div>
  );
}

export default function RetriesDLQPage() {
  const [activeTab, setActiveTab] = useState("dlq");

  return (
    <div dir="rtl" className="min-h-screen bg-background p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-lg bg-red-500/10">
          <RotateCcw className="h-6 w-6 text-red-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">ניסיונות חוזרים ותור מתים</h1>
          <p className="text-sm text-muted-foreground">טכנו-כל עוזי &mdash; ניהול retries, DLQ ו-rate limits</p>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {kpis.map((k) => (
          <Card key={k.label} className="border-border/50">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${k.bg}`}>
                <k.icon className={`h-5 w-5 ${k.color}`} />
              </div>
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
        <TabsList className="w-full justify-start">
          <TabsTrigger value="dlq" className="gap-1.5"><Skull className="h-4 w-4" />DLQ</TabsTrigger>
          <TabsTrigger value="policies" className="gap-1.5"><Settings2 className="h-4 w-4" />מדיניות Retry</TabsTrigger>
          <TabsTrigger value="rates" className="gap-1.5"><Gauge className="h-4 w-4" />Rate Limits</TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5"><History className="h-4 w-4" />היסטוריית Retries</TabsTrigger>
        </TabsList>

        {/* DLQ Tab */}
        <TabsContent value="dlq">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Skull className="h-5 w-5 text-red-400" />
                תור מתים (Dead Letter Queue) &mdash; {dlqItems.length} פריטים
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>מזהה</TableHead>
                    <TableHead>אירוע מקורי</TableHead>
                    <TableHead>שגיאה</TableHead>
                    <TableHead>ניסיונות</TableHead>
                    <TableHead>כשלון ראשון</TableHead>
                    <TableHead>ניסיון אחרון</TableHead>
                    <TableHead>גודל</TableHead>
                    <TableHead>פעולות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dlqItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-xs">{item.id}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs">{item.event}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate text-xs text-red-400" title={item.error}>
                        {item.error}
                      </TableCell>
                      <TableCell>
                        <Badge variant="destructive" className="text-xs">{item.attempts}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">{item.firstFailure}</TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">{item.lastAttempt}</TableCell>
                      <TableCell className="text-xs">{item.payloadSize}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <button className="p-1.5 rounded hover:bg-blue-500/10 transition" title="שלח שוב">
                            <RefreshCw className="h-3.5 w-3.5 text-blue-400" />
                          </button>
                          <button className="p-1.5 rounded hover:bg-red-500/10 transition" title="מחק">
                            <Trash2 className="h-3.5 w-3.5 text-red-400" />
                          </button>
                          <button className="p-1.5 rounded hover:bg-amber-500/10 transition" title="חקור">
                            <Search className="h-3.5 w-3.5 text-amber-400" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Retry Policies Tab */}
        <TabsContent value="policies">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Settings2 className="h-5 w-5 text-blue-400" />
                מדיניות Retry לפי סוג אינטגרציה
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>אינטגרציה</TableHead>
                    <TableHead>מקסימום ניסיונות</TableHead>
                    <TableHead>אסטרטגיית Backoff</TableHead>
                    <TableHead>השהייה ראשונית</TableHead>
                    <TableHead>השהייה מקסימלית</TableHead>
                    <TableHead>Timeout</TableHead>
                    <TableHead>ויזואליזציה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {retryPolicies.map((p) => (
                    <TableRow key={p.integration}>
                      <TableCell className="font-medium">{p.integration}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{p.maxAttempts}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            p.backoff === "exponential"
                              ? "border-blue-500/50 text-blue-400"
                              : p.backoff === "linear"
                              ? "border-emerald-500/50 text-emerald-400"
                              : "border-amber-500/50 text-amber-400"
                          }
                        >
                          {p.backoff === "exponential" && <Zap className="h-3 w-3 ml-1" />}
                          {p.backoff === "linear" && <ArrowDownUp className="h-3 w-3 ml-1" />}
                          {p.backoff === "fixed" && <Timer className="h-3 w-3 ml-1" />}
                          {p.backoff}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{p.initialDelay}</TableCell>
                      <TableCell className="font-mono text-sm">{p.maxDelay}</TableCell>
                      <TableCell className="font-mono text-sm">{p.timeout}</TableCell>
                      <TableCell>
                        <BackoffVisual strategy={p.backoff} initial={p.initialDelay} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Rate Limits Tab */}
        <TabsContent value="rates">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Gauge className="h-5 w-5 text-amber-400" />
                הגבלות קצב (Rate Limits) &mdash; {rateLimits.length} כללים
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>שירות</TableHead>
                    <TableHead>מגבלה</TableHead>
                    <TableHead className="w-[200px]">שימוש נוכחי</TableHead>
                    <TableHead>Burst Limit</TableHead>
                    <TableHead>חריגות היום</TableHead>
                    <TableHead>בקשות שנחסמו</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rateLimits.map((r) => {
                    const usagePct = (r.usage / parseInt(r.limit)) * 100;
                    const isHigh = usagePct > 80;
                    const isCritical = usagePct > 90;
                    return (
                      <TableRow key={r.service}>
                        <TableCell className="font-medium">{r.service}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono">{r.limit}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span>{r.usage}/{parseInt(r.limit)}</span>
                              <span className={isCritical ? "text-red-400" : isHigh ? "text-amber-400" : "text-muted-foreground"}>
                                {Math.round(usagePct)}%
                              </span>
                            </div>
                            <Progress
                              value={Math.min(usagePct, 100)}
                              className={`h-2 ${isCritical ? "[&>div]:bg-red-500" : isHigh ? "[&>div]:bg-amber-500" : ""}`}
                            />
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{r.burst}</TableCell>
                        <TableCell>
                          {r.breaches > 0 ? (
                            <Badge variant="destructive" className="text-xs">
                              <AlertTriangle className="h-3 w-3 ml-1" />
                              {r.breaches}
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">0</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {r.throttled > 0 ? (
                            <span className="text-red-400 font-mono text-sm">{r.throttled}</span>
                          ) : (
                            <span className="text-muted-foreground text-sm">0</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Retry History Tab */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="h-5 w-5 text-purple-400" />
                היסטוריית Retries אחרונים
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>פריט</TableHead>
                    <TableHead>ניסיון #</TableHead>
                    <TableHead>השהייה</TableHead>
                    <TableHead>תוצאה</TableHead>
                    <TableHead>משך זמן</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {retryHistory.map((h, i) => (
                    <TableRow key={`${h.item}-${i}`}>
                      <TableCell className="font-mono text-xs">{h.item}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">#{h.attempt}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{h.delay}</TableCell>
                      <TableCell>
                        {h.result === "success" ? (
                          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">
                            <CheckCircle2 className="h-3 w-3 ml-1" />
                            הצלחה
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-xs">
                            <XCircle className="h-3 w-3 ml-1" />
                            נכשל
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{h.duration}</TableCell>
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
