import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Settings,
  Globe,
  Webhook,
  Radio,
  ShieldCheck,
  Database,
  Lock,
  Network,
  ScrollText,
  Cpu,
  CheckCircle2,
  Info,
  AlertTriangle,
  Clock,
} from "lucide-react";

interface SettingRow {
  label: string;
  value: string;
  status?: "active" | "info" | "warning";
}

interface TabDef {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  data: SettingRow[];
}

function SettingsTable({ rows }: { rows: SettingRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="text-right w-[40%]">הגדרה</TableHead>
          <TableHead className="text-right w-[40%]">ערך</TableHead>
          <TableHead className="text-right w-[20%]">סטטוס</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => (
          <TableRow key={i}>
            <TableCell className="font-medium text-right">{r.label}</TableCell>
            <TableCell className="text-right font-mono text-sm">{r.value}</TableCell>
            <TableCell className="text-right">
              {r.status === "active" && <Badge className="bg-green-100 text-green-800">פעיל</Badge>}
              {r.status === "info" && <Badge variant="secondary">מוגדר</Badge>}
              {r.status === "warning" && <Badge className="bg-amber-100 text-amber-800">דורש בדיקה</Badge>}
              {!r.status && <Badge variant="outline">ברירת מחדל</Badge>}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

const FALLBACK_GENERAL_SETTINGS: SettingRow[] = [
  { label: "Timeout ברירת מחדל", value: "30 שניות", status: "active" },
  { label: "מספר ניסיונות חוזרים מקסימלי", value: "3", status: "info" },
  { label: "שמירת לוגים", value: "90 יום" },
  { label: "סביבה", value: "Production", status: "active" },
  { label: "כתובת בסיס (Base URL)", value: "https://api.techno-kol-uzi.co.il/v2" },
  { label: "סביבת Staging", value: "https://staging-api.techno-kol-uzi.co.il/v2", status: "info" },
  { label: "פורמט תגובה", value: "JSON (UTF-8)" },
  { label: "שפת ברירת מחדל", value: "he-IL" },
  { label: "Connection Pool Size", value: "50" },
  { label: "Health Check Interval", value: "30 שניות", status: "active" },
];

const FALLBACK_API_GATEWAY_SETTINGS: SettingRow[] = [
  { label: "Rate Limit - ברירת מחדל", value: "1,000 בקשות / דקה", status: "active" },
  { label: "Rate Limit - פרימיום", value: "5,000 בקשות / דקה", status: "active" },
  { label: "CORS - Origins מורשים", value: "*.techno-kol-uzi.co.il", status: "info" },
  { label: "CORS - Methods", value: "GET, POST, PUT, DELETE, PATCH" },
  { label: "אימות - Bearer Token", value: "מופעל", status: "active" },
  { label: "אימות - API Key", value: "מופעל", status: "active" },
  { label: "אימות - OAuth 2.0", value: "מופעל", status: "active" },
  { label: "אסטרטגיית גרסאות API", value: "Header-based (X-API-Version)", status: "info" },
  { label: "גרסה נוכחית", value: "v2.4.1" },
  { label: "Request Body Limit", value: "10 MB" },
  { label: "Compression", value: "gzip, br", status: "active" },
];

const FALLBACK_WEBHOOK_SETTINGS: SettingRow[] = [
  { label: "אלגוריתם חתימה", value: "HMAC-SHA256", status: "active" },
  { label: "Timeout משלוח", value: "10 שניות" },
  { label: "ניסיונות חוזרים מקסימלי", value: "3" },
  { label: "מרווח בין ניסיונות", value: "Exponential Backoff (2s, 8s, 32s)" },
  { label: "Dead Letter Queue", value: "מופעל", status: "active" },
  { label: "DLQ - שמירת הודעות", value: "14 יום" },
  { label: "IP Allowlist", value: "52.28.0.0/16, 10.0.0.0/8", status: "info" },
  { label: "Content-Type", value: "application/json" },
  { label: "Payload Size מקסימלי", value: "256 KB" },
];

const FALLBACK_EVENT_SETTINGS: SettingRow[] = [
  { label: "מנויים מקסימלי לאירוע", value: "25", status: "info" },
  { label: "סף Dead Letter", value: "5 כשלונות רצופים", status: "warning" },
  { label: "Timeout עיבוד", value: "30 שניות" },
  { label: "גודל Batch", value: "100 אירועים" },
  { label: "Batch Interval", value: "5 שניות" },
  { label: "סוג Event Bus", value: "Redis Streams", status: "active" },
  { label: "שמירת היסטוריה", value: "30 יום" },
  { label: "Partitions", value: "12" },
  { label: "Consumer Group", value: "techno-kol-main", status: "info" },
  { label: "Replay מאירועים ישנים", value: "מופעל", status: "active" },
];

const FALLBACK_MCP_SETTINGS: SettingRow[] = [
  { label: "MCP Server Timeout", value: "60 שניות", status: "active" },
  { label: "קריאות מקבילות מקסימלי", value: "10", status: "info" },
  { label: "אישור כלים (Tool Approval)", value: "נדרש", status: "active" },
  { label: "מצב Sandbox", value: "מופעל", status: "active" },
  { label: "Sandbox - Memory Limit", value: "512 MB" },
  { label: "Sandbox - CPU Limit", value: "2 vCPU" },
  { label: "לוג קריאות MCP", value: "מופעל", status: "info" },
  { label: "גרסת פרוטוקול MCP", value: "2025-03-26" },
  { label: "Tool Cache TTL", value: "300 שניות" },
  { label: "Transport", value: "Streamable HTTP", status: "active" },
];

const FALLBACK_SECURITY_SETTINGS: SettingRow[] = [
  { label: "גרסת TLS", value: "1.3", status: "active" },
  { label: "חידוש תעודות (Certificate Rotation)", value: "כל 90 יום", status: "info" },
  { label: "תעודה נוכחית - תוקף", value: "2026-07-15", status: "active" },
  { label: "Token Expiry - Access", value: "15 דקות" },
  { label: "Token Expiry - Refresh", value: "7 ימים" },
  { label: "הגבלות IP", value: "Allowlist מופעל (3 טווחים)", status: "active" },
  { label: "רמת Audit Log", value: "VERBOSE", status: "info" },
  { label: "Cipher Suites", value: "TLS_AES_256_GCM_SHA384, TLS_CHACHA20_POLY1305" },
  { label: "HSTS", value: "max-age=63072000; includeSubDomains", status: "active" },
  { label: "CSP Header", value: "default-src 'self'", status: "info" },
  { label: "Secret Rotation", value: "כל 30 יום (אוטומטי)", status: "active" },
];

const FALLBACK_TAB_CONFIG: TabDef[] = [
  { id: "general", label: "כללי", icon: Globe, data: generalSettings,
    description: "הגדרות גלובליות של מערכת האינטגרציות, כולל timeouts, ניסיונות חוזרים ושמירת לוגים." },
  { id: "api-gateway", label: "API Gateway", icon: Network, data: apiGatewaySettings,
    description: "ניהול rate limits, CORS, שיטות אימות ואסטרטגיית גרסאות API." },
  { id: "webhooks", label: "Webhooks", icon: Webhook, data: webhookSettings,
    description: "תצורת חתימות, משלוחים, Dead Letter Queue ו-IP Allowlist." },
  { id: "events", label: "Events", icon: Radio, data: eventSettings,
    description: "הגדרות Event Bus: מנויים, עיבוד batch וניהול כשלונות." },
  { id: "mcp", label: "MCP", icon: Cpu, data: mcpSettings,
    description: "הגדרות MCP Server: timeouts, sandbox, אישור כלים ופרוטוקול." },
  { id: "security", label: "אבטחה", icon: ShieldCheck, data: securitySettings,
    description: "TLS, תעודות, tokens, הגבלות IP ורמת audit log." },
];

const FALLBACK_HEALTH_METRICS = [
  { label: "API Gateway Uptime", value: 99.97 },
  { label: "Webhook Delivery Rate", value: 98.4 },
  { label: "Event Processing", value: 99.8 },
  { label: "MCP Availability", value: 100 },
];


const apiGatewaySettings = FALLBACK_API_GATEWAY_SETTINGS;
const eventSettings = FALLBACK_EVENT_SETTINGS;
const generalSettings = FALLBACK_GENERAL_SETTINGS;
const mcpSettings = FALLBACK_MCP_SETTINGS;
const securitySettings = FALLBACK_SECURITY_SETTINGS;
const webhookSettings = FALLBACK_WEBHOOK_SETTINGS;

export default function IntegrationSettings() {

  const { data: apiData } = useQuery({
    queryKey: ["integration_settings"],
    queryFn: () => authFetch("/api/integrations/integration-settings").then(r => r.json()),
    staleTime: 60_000,
    retry: 1,
  });
  const apiGatewaySettings = FALLBACK_API_GATEWAY_SETTINGS;
  const eventSettings = FALLBACK_EVENT_SETTINGS;
  const generalSettings = FALLBACK_GENERAL_SETTINGS;
  const mcpSettings = FALLBACK_MCP_SETTINGS;
  const securitySettings = FALLBACK_SECURITY_SETTINGS;
  const webhookSettings = FALLBACK_WEBHOOK_SETTINGS;
  const tabConfig = apiData?.tabConfig ?? FALLBACK_TAB_CONFIG;
  const healthMetrics = apiData?.healthMetrics ?? FALLBACK_HEALTH_METRICS;
  const [activeTab, setActiveTab] = useState("general");

  return (
    <div dir="rtl" className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-slate-100">
            <Settings className="h-6 w-6 text-slate-700" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">הגדרות אינטגרציות</h1>
            <p className="text-sm text-slate-500">טכנו-כל עוזי — ניהול תצורת אינטגרציות מערכת</p>
          </div>
        </div>
        <Badge className="bg-green-100 text-green-800 text-sm px-3 py-1">
          <CheckCircle2 className="h-3.5 w-3.5 ml-1" />
          Production
        </Badge>
      </div>

      {/* Health overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {healthMetrics.map((m) => (
          <Card key={m.label}>
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs text-slate-500 mb-1">{m.label}</p>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold">{m.value}%</span>
                <Progress value={m.value} className="h-2 flex-1" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-6 w-full">
          {tabConfig.map((t) => {
            const Icon = t.icon;
            return (
              <TabsTrigger key={t.id} value={t.id} className="flex items-center gap-1.5 text-xs">
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {tabConfig.map((t) => (
          <TabsContent key={t.id} value={t.id}>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <t.icon className="h-5 w-5 text-slate-600" />
                  הגדרות {t.label}
                </CardTitle>
                <p className="text-sm text-slate-500 mt-1 flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5 shrink-0" />
                  {t.description}
                </p>
              </CardHeader>
              <CardContent>
                <SettingsTable rows={t.data} />
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* Environment summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-slate-500" />
              <span className="text-sm font-medium">זמן פעילות מצטבר</span>
            </div>
            <p className="text-2xl font-bold text-slate-900">142 ימים</p>
            <p className="text-xs text-slate-500 mt-1">מאז הפריסה האחרונה (2025-11-17)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-medium">הגדרות דורשות בדיקה</span>
            </div>
            <p className="text-2xl font-bold text-amber-600">1</p>
            <p className="text-xs text-slate-500 mt-1">סף Dead Letter באירועים (Events tab)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-2">
              <Database className="h-4 w-4 text-slate-500" />
              <span className="text-sm font-medium">סה"כ הגדרות פעילות</span>
            </div>
            <p className="text-2xl font-bold text-slate-900">64</p>
            <p className="text-xs text-slate-500 mt-1">ב-6 קטגוריות תצורה</p>
          </CardContent>
        </Card>
      </div>

      {/* Footer info */}
      <Card>
        <CardContent className="py-4 flex items-center justify-between text-sm text-slate-500">
          <div className="flex items-center gap-2">
            <ScrollText className="h-4 w-4" />
            <span>עדכון אחרון: 2026-04-07 14:32 UTC</span>
          </div>
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4" />
            <span>שינויים דורשים הרשאת מנהל מערכת</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
