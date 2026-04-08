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
  ShieldCheck, FileJson, FileText, ListChecks, AlertTriangle, Ban,
  CheckCircle2, XCircle, Clock, Search, RotateCcw, Eye, Trash2,
  Fingerprint, Activity, Timer, Filter,
} from "lucide-react";
/* ── KPI Data ── */
const FALLBACK_KPIS = [
  { label: "סכמות רשומות", value: "47", icon: FileJson, color: "text-blue-600 bg-blue-100", sub: "+3 החודש" },
  { label: "אימותים היום", value: "8,214", icon: ShieldCheck, color: "text-emerald-600 bg-emerald-100", sub: "97.6% עברו" },
  { label: "אימותים שנכשלו", value: "198", icon: XCircle, color: "text-red-600 bg-red-100", sub: "2.4% מהכלל" },
  { label: "מטענים פגומים", value: "34", icon: AlertTriangle, color: "text-amber-600 bg-amber-100", sub: "12 ממתינים" },
  { label: "כשלי חתימה", value: "7", icon: Fingerprint, color: "text-rose-600 bg-rose-100", sub: "3 חסומים" },
  { label: "זמן אימות ממוצע", value: "12ms", icon: Timer, color: "text-violet-600 bg-violet-100", sub: "p99: 45ms" },
];
/* ── Request Schemas ── */
const FALLBACK_REQUEST_SCHEMAS = [
  { name: "הזמנת רכש", version: "3.2.1", endpoint: "/api/v1/purchase-orders", format: "JSON", fields: 28, required: 12, updated: "2026-04-07", rate: 99.1 },
  { name: "יצירת לקוח", version: "2.4.0", endpoint: "/api/v1/customers", format: "JSON", fields: 22, required: 8, updated: "2026-04-06", rate: 98.7 },
  { name: "פקודת ייצור", version: "4.1.0", endpoint: "/api/v1/work-orders", format: "JSON", fields: 35, required: 15, updated: "2026-04-08", rate: 97.3 },
  { name: "חשבונית מס", version: "5.0.2", endpoint: "/api/v1/invoices", format: "XML", fields: 42, required: 20, updated: "2026-04-05", rate: 99.8 },
  { name: "תעודת משלוח", version: "2.1.0", endpoint: "/api/v1/shipments", format: "JSON", fields: 18, required: 9, updated: "2026-04-03", rate: 96.5 },
  { name: "בדיקת איכות", version: "1.8.3", endpoint: "/api/v1/quality-checks", format: "JSON", fields: 24, required: 11, updated: "2026-04-07", rate: 98.2 },
  { name: "עדכון מלאי", version: "3.0.0", endpoint: "/api/v1/inventory/update", format: "JSON", fields: 14, required: 7, updated: "2026-04-08", rate: 99.5 },
  { name: "הצעת מחיר", version: "2.6.1", endpoint: "/api/v1/quotes", format: "JSON", fields: 31, required: 14, updated: "2026-04-04", rate: 97.9 },
  { name: "דיווח נוכחות", version: "1.3.0", endpoint: "/api/v1/attendance", format: "JSON", fields: 10, required: 5, updated: "2026-04-08", rate: 99.9 },
  { name: "פנייה לתמיכה", version: "1.5.2", endpoint: "/api/v1/tickets", format: "JSON", fields: 16, required: 6, updated: "2026-04-06", rate: 98.4 },
];
/* ── Response Schemas ── */
const FALLBACK_RESPONSE_SCHEMAS = [
  { name: "תגובת הזמנה", version: "3.2.1", target: "SAP ERP", format: "JSON", compliance: 99.2, lastValidated: "2026-04-08 10:30" },
  { name: "אישור חשבונית", version: "5.0.2", target: "רשות המסים", format: "XML", compliance: 100, lastValidated: "2026-04-08 09:15" },
  { name: "סטטוס משלוח", version: "2.1.0", target: "DHL API", format: "JSON", compliance: 98.5, lastValidated: "2026-04-08 08:42" },
  { name: "תגובת לקוח", version: "2.4.0", target: "Salesforce CRM", format: "JSON", compliance: 97.8, lastValidated: "2026-04-08 10:12" },
  { name: "דוח ייצור", version: "4.1.0", target: "MES Dashboard", format: "JSON", compliance: 99.6, lastValidated: "2026-04-08 07:55" },
  { name: "אישור תשלום", version: "1.2.0", target: "בנק לאומי", format: "XML", compliance: 100, lastValidated: "2026-04-08 09:48" },
  { name: "תגובת מלאי", version: "3.0.0", target: "WMS מחסנים", format: "JSON", compliance: 96.3, lastValidated: "2026-04-08 10:05" },
  { name: "נתוני שכר", version: "2.8.1", target: "חילן Payroll", format: "XML", compliance: 99.9, lastValidated: "2026-04-07 23:00" },
];
/* ── Validation Rules ── */
const FALLBACK_VALIDATION_RULES = [
  { name: "שדה חובה - מזהה לקוח", type: "required_field", entity: "לקוח", field: "customer_id", condition: "NOT NULL", severity: "error", active: true },
  { name: "בדיקת סוג - כמות", type: "type_check", entity: "הזמנה", field: "quantity", condition: "integer > 0", severity: "error", active: true },
  { name: "טווח - אחוז הנחה", type: "range", entity: "הצעת מחיר", field: "discount_pct", condition: "0 <= x <= 40", severity: "warning", active: true },
  { name: "ביטוי רגולרי - ח.פ.", type: "regex", entity: "ספק", field: "company_id", condition: "^5[0-9]{8}$", severity: "error", active: true },
  { name: "ערכים מותרים - סוג מתכת", type: "enum", entity: "פקודת ייצור", field: "metal_type", condition: "aluminum|steel|glass|iron", severity: "error", active: true },
  { name: "מותאם - תאריך עתידי", type: "custom", entity: "הזמנה", field: "delivery_date", condition: "date > now()", severity: "warning", active: true },
  { name: "שדה חובה - מחיר יחידה", type: "required_field", entity: "שורת הזמנה", field: "unit_price", condition: "NOT NULL & > 0", severity: "error", active: true },
  { name: "בדיקת סוג - אימייל", type: "type_check", entity: "איש קשר", field: "email", condition: "valid email format", severity: "error", active: true },
  { name: "טווח - משקל פרופיל", type: "range", entity: "מוצר", field: "weight_kg", condition: "0.1 <= x <= 500", severity: "warning", active: false },
  { name: "ביטוי רגולרי - טלפון", type: "regex", entity: "לקוח", field: "phone", condition: "^0[2-9][0-9]{7,8}$", severity: "warning", active: true },
  { name: "ערכים מותרים - סטטוס", type: "enum", entity: "הזמנה", field: "status", condition: "draft|pending|approved|shipped|done", severity: "error", active: true },
  { name: "מותאם - תקציב לא חורג", type: "custom", entity: "פרויקט", field: "total_cost", condition: "total_cost <= budget * 1.1", severity: "error", active: true },
];
/* ── Malformed Queue ── */
const FALLBACK_MALFORMED_QUEUE = [
  { ts: "2026-04-08 10:42:18", source: "SAP ERP", endpoint: "/api/v1/purchase-orders", errorType: "missing_field", preview: '{"vendor":"...", "items":[...]}  // חסר purchase_order_id', retry: "ממתין", attempts: 0 },
  { ts: "2026-04-08 10:38:05", source: "Salesforce", endpoint: "/api/v1/customers", errorType: "type_mismatch", preview: '{"customer_id":"ABC", ...}  // customer_id חייב להיות מספר', retry: "נכשל", attempts: 2 },
  { ts: "2026-04-08 10:15:33", source: "WMS מחסנים", endpoint: "/api/v1/inventory/update", errorType: "invalid_json", preview: '{"sku":"AL-6060","qty":50,"lo...  // JSON קטוע', retry: "ממתין", attempts: 0 },
  { ts: "2026-04-08 09:52:11", source: "DHL Webhook", endpoint: "/api/v1/shipments", errorType: "schema_violation", preview: '{"tracking":"DHL123", "weight":-5}  // משקל שלילי', retry: "ממתין", attempts: 1 },
  { ts: "2026-04-08 09:30:47", source: "אפליקציה מובייל", endpoint: "/api/v1/attendance", errorType: "extra_fields", preview: '{"emp_id":1042, "debug":true, ...}  // שדות לא מוכרים', retry: "תוקן", attempts: 0 },
  { ts: "2026-04-08 08:48:22", source: "רשות המסים", endpoint: "/api/v1/invoices", errorType: "invalid_xml", preview: '<Invoice><Amount>NaN</Amount>...  // XML לא תקני', retry: "נכשל", attempts: 3 },
  { ts: "2026-04-08 08:12:09", source: "חילן Payroll", endpoint: "/api/v1/attendance", errorType: "encoding_error", preview: '{"name":"\\xC0\\xC1..."}  // קידוד UTF-8 שגוי', retry: "ממתין", attempts: 0 },
  { ts: "2026-04-08 07:35:41", source: "MES Dashboard", endpoint: "/api/v1/work-orders", errorType: "missing_field", preview: '{"wo_id":"WO-2841", ...}  // חסר metal_type חובה', retry: "תוקן", attempts: 1 },
];
/* ── Invalid Signatures ── */
const FALLBACK_INVALID_SIGNATURES = [
  { ts: "2026-04-08 10:35:22", sourceIp: "185.120.33.44", endpoint: "/webhooks/orders", expected: "sha256=a3f8c1...d92b", actual: "sha256=7e2b0f...11ac", blocked: true },
  { ts: "2026-04-08 09:48:15", sourceIp: "93.172.56.12", endpoint: "/webhooks/invoices", expected: "sha256=d4e7a2...f103", actual: "sha256=000000...0000", blocked: true },
  { ts: "2026-04-08 09:12:03", sourceIp: "212.179.44.10", endpoint: "/webhooks/shipments", expected: "sha256=b1c9d3...8e4f", actual: "sha256=b1c9d3...8e50", blocked: false },
  { ts: "2026-04-08 08:30:41", sourceIp: "45.33.99.102", endpoint: "/webhooks/payments", expected: "sha256=f2a0b7...c5d1", actual: "(חסרה חתימה)", blocked: true },
  { ts: "2026-04-08 07:55:18", sourceIp: "192.168.1.99", endpoint: "/webhooks/quality", expected: "sha256=e8d1c4...a7b2", actual: "md5=9f3a2c...1b8e", blocked: false },
  { ts: "2026-04-08 06:42:09", sourceIp: "10.0.5.201", endpoint: "/webhooks/inventory", expected: "sha256=c3f7e9...d24a", actual: "sha256=c3f7e8...d24a", blocked: false },
];
/* ── Helpers ── */
const formatBadge = (f: string) =>
  f === "JSON"
    ? <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs">JSON</Badge>
    : <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-xs">XML</Badge>;
const rateBadge = (pct: number) => {
  if (pct >= 99) return <Badge className="bg-emerald-100 text-emerald-700">{pct}%</Badge>;
  if (pct >= 97) return <Badge className="bg-blue-100 text-blue-700">{pct}%</Badge>;
  if (pct >= 95) return <Badge className="bg-amber-100 text-amber-700">{pct}%</Badge>;
  return <Badge className="bg-red-100 text-red-700">{pct}%</Badge>;
};
const complianceColor = (pct: number) => {
  if (pct >= 99) return "[&>div]:bg-emerald-500";
  if (pct >= 97) return "[&>div]:bg-blue-500";
  return "[&>div]:bg-amber-500";
};
const severityBadge = (s: string) =>
  s === "error"
    ? <Badge className="bg-red-100 text-red-700 text-xs">שגיאה</Badge>
    : <Badge className="bg-amber-100 text-amber-700 text-xs">אזהרה</Badge>;
const ruleTypeBadge = (t: string) => {
  const map: Record<string, { label: string; cls: string }> = {
    required_field: { label: "שדה חובה", cls: "bg-red-50 text-red-600 border-red-200" },
    type_check: { label: "בדיקת סוג", cls: "bg-blue-50 text-blue-600 border-blue-200" },
    range: { label: "טווח", cls: "bg-violet-50 text-violet-600 border-violet-200" },
    regex: { label: "ביטוי רגולרי", cls: "bg-pink-50 text-pink-600 border-pink-200" },
    enum: { label: "ערכים", cls: "bg-teal-50 text-teal-600 border-teal-200" },
    custom: { label: "מותאם", cls: "bg-indigo-50 text-indigo-600 border-indigo-200" },
  };
  const cfg = map[t] || { label: t, cls: "bg-gray-100 text-gray-600" };
  return <Badge className={`${cfg.cls} text-xs`}>{cfg.label}</Badge>;
};
const retryBadge = (s: string) => {
  if (s === "תוקן") return <Badge className="bg-emerald-100 text-emerald-700 text-xs"><CheckCircle2 className="w-3 h-3 ml-1" />תוקן</Badge>;
  if (s === "ממתין") return <Badge className="bg-amber-100 text-amber-700 text-xs"><Clock className="w-3 h-3 ml-1" />ממתין</Badge>;
  return <Badge className="bg-red-100 text-red-700 text-xs"><XCircle className="w-3 h-3 ml-1" />נכשל</Badge>;
};
const errorTypeBadge = (t: string) => {
  const map: Record<string, { label: string; cls: string }> = {
    missing_field: { label: "שדה חסר", cls: "bg-red-100 text-red-700" },
    type_mismatch: { label: "סוג שגוי", cls: "bg-orange-100 text-orange-700" },
    invalid_json: { label: "JSON פגום", cls: "bg-rose-100 text-rose-700" },
    invalid_xml: { label: "XML פגום", cls: "bg-rose-100 text-rose-700" },
    schema_violation: { label: "הפרת סכמה", cls: "bg-violet-100 text-violet-700" },
    extra_fields: { label: "שדות עודפים", cls: "bg-blue-100 text-blue-700" },
    encoding_error: { label: "שגיאת קידוד", cls: "bg-pink-100 text-pink-700" },
  };
  const cfg = map[t] || { label: t, cls: "bg-gray-100 text-gray-600" };
  return <Badge className={`${cfg.cls} text-xs`}>{cfg.label}</Badge>;
};
/* ══════════════════════════════════════════════════════════ */
export default function PayloadValidationPage() {

  const { data: apiData } = useQuery({
    queryKey: ["payload_validation"],
    queryFn: () => authFetch("/api/integrations/payload-validation").then(r => r.json()),
    staleTime: 60_000,
    retry: 1,
  });
  const kpis = apiData?.kpis ?? FALLBACK_KPIS;
  const requestSchemas = apiData?.requestSchemas ?? FALLBACK_REQUEST_SCHEMAS;
  const responseSchemas = apiData?.responseSchemas ?? FALLBACK_RESPONSE_SCHEMAS;
  const validationRules = apiData?.validationRules ?? FALLBACK_VALIDATION_RULES;
  const malformedQueue = apiData?.malformedQueue ?? FALLBACK_MALFORMED_QUEUE;
  const invalidSignatures = apiData?.invalidSignatures ?? FALLBACK_INVALID_SIGNATURES;
  const [tab, setTab] = useState("request-schemas");
  const [search, setSearch] = useState("");

  return (
    <div className="min-h-screen bg-background p-6 space-y-6" dir="rtl">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center">
            <ShieldCheck className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">אימות מטענים</h1>
            <p className="text-sm text-muted-foreground">ניהול סכמות, כללי אימות וניטור מטענים נכנסים/יוצאים - טכנו-כל עוזי</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="חיפוש סכמה, כלל, או שגיאה..." className="pr-9 w-72" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Button variant="outline" size="sm"><Filter className="w-4 h-4 ml-1" />סינון</Button>
        </div>
      </div>
      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((k) => (
          <Card key={k.label} className="border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground font-medium">{k.label}</span>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${k.color}`}>
                  <k.icon className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-bold">{k.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{k.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      {/* ── Tabs ── */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="request-schemas"><FileJson className="w-4 h-4 ml-1" />סכמות בקשה</TabsTrigger>
          <TabsTrigger value="response-schemas"><FileText className="w-4 h-4 ml-1" />סכמות תגובה</TabsTrigger>
          <TabsTrigger value="rules"><ListChecks className="w-4 h-4 ml-1" />כללי אימות</TabsTrigger>
          <TabsTrigger value="malformed"><AlertTriangle className="w-4 h-4 ml-1" />תורים שגויים</TabsTrigger>
          <TabsTrigger value="signatures"><Ban className="w-4 h-4 ml-1" />חתימות לא תקינות</TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Request Schemas ── */}
        <TabsContent value="request-schemas">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileJson className="w-5 h-5 text-blue-600" />
                מאגר סכמות בקשה ({requestSchemas.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-right py-2 px-3 font-medium">שם סכמה</th>
                      <th className="text-right py-2 px-3 font-medium">גרסה</th>
                      <th className="text-right py-2 px-3 font-medium">נקודת קצה</th>
                      <th className="text-center py-2 px-3 font-medium">פורמט</th>
                      <th className="text-center py-2 px-3 font-medium">שדות</th>
                      <th className="text-center py-2 px-3 font-medium">חובה</th>
                      <th className="text-right py-2 px-3 font-medium">עדכון אחרון</th>
                      <th className="text-center py-2 px-3 font-medium">אחוז אימות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requestSchemas.filter(s => !search || s.name.includes(search) || s.endpoint.includes(search)).map((s, i) => (
                      <tr key={i} className="border-b hover:bg-muted/50 transition-colors">
                        <td className="py-2.5 px-3 font-medium">{s.name}</td>
                        <td className="py-2.5 px-3"><Badge variant="outline" className="text-xs font-mono">v{s.version}</Badge></td>
                        <td className="py-2.5 px-3 font-mono text-xs text-muted-foreground">{s.endpoint}</td>
                        <td className="py-2.5 px-3 text-center">{formatBadge(s.format)}</td>
                        <td className="py-2.5 px-3 text-center">{s.fields}</td>
                        <td className="py-2.5 px-3 text-center font-semibold text-red-600">{s.required}</td>
                        <td className="py-2.5 px-3 text-muted-foreground">{s.updated}</td>
                        <td className="py-2.5 px-3 text-center">{rateBadge(s.rate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        {/* ── Tab 2: Response Schemas ── */}
        <TabsContent value="response-schemas">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="w-5 h-5 text-teal-600" />
                מאגר סכמות תגובה ({responseSchemas.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-right py-2 px-3 font-medium">שם סכמה</th>
                      <th className="text-right py-2 px-3 font-medium">גרסה</th>
                      <th className="text-right py-2 px-3 font-medium">מערכת יעד</th>
                      <th className="text-center py-2 px-3 font-medium">פורמט</th>
                      <th className="text-right py-2 px-3 font-medium">תאימות</th>
                      <th className="text-right py-2 px-3 font-medium">אימות אחרון</th>
                    </tr>
                  </thead>
                  <tbody>
                    {responseSchemas.filter(s => !search || s.name.includes(search) || s.target.includes(search)).map((s, i) => (
                      <tr key={i} className="border-b hover:bg-muted/50 transition-colors">
                        <td className="py-2.5 px-3 font-medium">{s.name}</td>
                        <td className="py-2.5 px-3"><Badge variant="outline" className="text-xs font-mono">v{s.version}</Badge></td>
                        <td className="py-2.5 px-3">{s.target}</td>
                        <td className="py-2.5 px-3 text-center">{formatBadge(s.format)}</td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <Progress value={s.compliance} className={`h-2 flex-1 ${complianceColor(s.compliance)}`} />
                            <span className="text-xs font-semibold w-12 text-left">{s.compliance}%</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-muted-foreground text-xs">{s.lastValidated}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        {/* ── Tab 3: Validation Rules ── */}
        <TabsContent value="rules">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <ListChecks className="w-5 h-5 text-violet-600" />
                  כללי אימות ({validationRules.length})
                </CardTitle>
                <div className="flex gap-2">
                  <Badge className="bg-emerald-100 text-emerald-700">{validationRules.filter(r => r.active).length} פעילים</Badge>
                  <Badge className="bg-zinc-100 text-zinc-600">{validationRules.filter(r => !r.active).length} מושבתים</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-right py-2 px-3 font-medium">שם כלל</th>
                      <th className="text-center py-2 px-3 font-medium">סוג</th>
                      <th className="text-right py-2 px-3 font-medium">ישות</th>
                      <th className="text-right py-2 px-3 font-medium">שדה</th>
                      <th className="text-right py-2 px-3 font-medium">תנאי</th>
                      <th className="text-center py-2 px-3 font-medium">חומרה</th>
                      <th className="text-center py-2 px-3 font-medium">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validationRules.filter(r => !search || r.name.includes(search) || r.entity.includes(search) || r.field.includes(search)).map((r, i) => (
                      <tr key={i} className={`border-b hover:bg-muted/50 transition-colors ${!r.active ? "opacity-50" : ""}`}>
                        <td className="py-2.5 px-3 font-medium">{r.name}</td>
                        <td className="py-2.5 px-3 text-center">{ruleTypeBadge(r.type)}</td>
                        <td className="py-2.5 px-3">{r.entity}</td>
                        <td className="py-2.5 px-3 font-mono text-xs">{r.field}</td>
                        <td className="py-2.5 px-3 font-mono text-xs text-muted-foreground">{r.condition}</td>
                        <td className="py-2.5 px-3 text-center">{severityBadge(r.severity)}</td>
                        <td className="py-2.5 px-3 text-center">
                          {r.active
                            ? <Badge className="bg-emerald-100 text-emerald-700 text-xs"><Activity className="w-3 h-3 ml-1" />פעיל</Badge>
                            : <Badge className="bg-zinc-100 text-zinc-500 text-xs">מושבת</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        {/* ── Tab 4: Malformed Queue ── */}
        <TabsContent value="malformed">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                  תור מטענים שגויים ({malformedQueue.length})
                </CardTitle>
                <Button variant="outline" size="sm"><RotateCcw className="w-4 h-4 ml-1" />נסה שוב הכל</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {malformedQueue.filter(m => !search || m.source.includes(search) || m.endpoint.includes(search)).map((m, i) => (
                  <div key={i} className="border rounded-lg p-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground font-mono">{m.ts}</span>
                        <Badge variant="outline" className="text-xs">{m.source}</Badge>
                        {errorTypeBadge(m.errorType)}
                      </div>
                      <div className="flex items-center gap-2">
                        {retryBadge(m.retry)}
                        {m.retry !== "תוקן" && (
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><RotateCcw className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><Eye className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500"><Trash2 className="w-3.5 h-3.5" /></Button>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs text-muted-foreground">נקודת קצה:</span>
                      <span className="font-mono text-xs">{m.endpoint}</span>
                      {m.attempts > 0 && <span className="text-xs text-muted-foreground">({m.attempts} ניסיונות)</span>}
                    </div>
                    <div className="bg-zinc-950 text-zinc-300 rounded-md px-3 py-2 font-mono text-xs overflow-x-auto">
                      {m.preview}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        {/* ── Tab 5: Invalid Signatures ── */}
        <TabsContent value="signatures">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Fingerprint className="w-5 h-5 text-rose-600" />
                  כשלי אימות חתימה ({invalidSignatures.length})
                </CardTitle>
                <Badge className="bg-red-100 text-red-700">{invalidSignatures.filter(s => s.blocked).length} נחסמו</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-right py-2 px-3 font-medium">זמן</th>
                      <th className="text-right py-2 px-3 font-medium">כתובת IP</th>
                      <th className="text-right py-2 px-3 font-medium">נקודת קצה Webhook</th>
                      <th className="text-right py-2 px-3 font-medium">חתימה צפויה</th>
                      <th className="text-right py-2 px-3 font-medium">חתימה שהתקבלה</th>
                      <th className="text-center py-2 px-3 font-medium">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invalidSignatures.filter(s => !search || s.sourceIp.includes(search) || s.endpoint.includes(search)).map((s, i) => (
                      <tr key={i} className={`border-b hover:bg-muted/50 transition-colors ${s.blocked ? "bg-red-50/50" : ""}`}>
                        <td className="py-2.5 px-3 font-mono text-xs">{s.ts}</td>
                        <td className="py-2.5 px-3 font-mono text-xs">{s.sourceIp}</td>
                        <td className="py-2.5 px-3 font-mono text-xs">{s.endpoint}</td>
                        <td className="py-2.5 px-3 font-mono text-xs text-emerald-600">{s.expected}</td>
                        <td className="py-2.5 px-3 font-mono text-xs text-red-600">{s.actual}</td>
                        <td className="py-2.5 px-3 text-center">
                          {s.blocked
                            ? <Badge className="bg-red-100 text-red-700 text-xs"><Ban className="w-3 h-3 ml-1" />נחסם</Badge>
                            : <Badge className="bg-amber-100 text-amber-700 text-xs"><AlertTriangle className="w-3 h-3 ml-1" />התרעה</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
