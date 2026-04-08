import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeftRight, Layers, ShieldCheck, AlertTriangle, FileJson,
  ArrowRight, CheckCircle, XCircle, Clock, Code2, Replace,
  CalendarClock, Coins, Search, GitBranch, Zap
} from "lucide-react";

/* ────── KPI Data ────── */
const kpis = [
  { label: "mappings מוגדרים", value: 15, icon: ArrowLeftRight, color: "text-blue-600", bg: "bg-blue-50" },
  { label: "transformations היום", value: 890, icon: Zap, color: "text-emerald-600", bg: "bg-emerald-50" },
  { label: "validation errors", value: 4, icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50" },
  { label: "schemas", value: 22, icon: FileJson, color: "text-purple-600", bg: "bg-purple-50" },
];

/* ────── Field Mappings ────── */
const fieldMappings = [
  { id: "MAP-001", source: "vendor_name", target: "supplier_name", rule: "direct", integration: "SAP B1", active: true, lastUsed: "2026-04-08 09:14" },
  { id: "MAP-002", source: "inv_date", target: "invoice_date", rule: "format", integration: "חשבונית ירוקה", active: true, lastUsed: "2026-04-08 08:55" },
  { id: "MAP-003", source: "total_amount", target: "gross_total", rule: "calculate", integration: "Priority", active: true, lastUsed: "2026-04-08 08:30" },
  { id: "MAP-004", source: "emp_id", target: "employee_number", rule: "direct", integration: "Hilan", active: true, lastUsed: "2026-04-08 07:45" },
  { id: "MAP-005", source: "product_code", target: "sku", rule: "lookup", integration: "WooCommerce", active: true, lastUsed: "2026-04-07 22:10" },
  { id: "MAP-006", source: "ship_date", target: "delivery_date", rule: "format", integration: "מכס ישראל", active: true, lastUsed: "2026-04-07 18:30" },
  { id: "MAP-007", source: "currency_code", target: "currency_iso", rule: "lookup", integration: "בנק ישראל", active: true, lastUsed: "2026-04-07 16:00" },
  { id: "MAP-008", source: "tax_pct", target: "vat_rate", rule: "calculate", integration: "חשבשבת", active: false, lastUsed: "2026-04-05 11:20" },
  { id: "MAP-009", source: "cust_email", target: "contact_email", rule: "direct", integration: "CRM", active: true, lastUsed: "2026-04-08 09:02" },
  { id: "MAP-010", source: "po_number", target: "purchase_order_ref", rule: "direct", integration: "EDI X12", active: true, lastUsed: "2026-04-08 08:10" },
];

const ruleColors: Record<string, string> = {
  direct: "bg-gray-100 text-gray-700",
  format: "bg-blue-100 text-blue-700",
  lookup: "bg-amber-100 text-amber-700",
  calculate: "bg-emerald-100 text-emerald-700",
};

/* ────── Payload Schemas ────── */
const schemas = [
  { name: "supplier_invoice", version: "3.2", fields: 34, rules: 18, lastValidated: "2026-04-08 09:15" },
  { name: "hilan_payroll", version: "2.1", fields: 52, rules: 24, lastValidated: "2026-04-08 07:00" },
  { name: "customs_declaration", version: "1.8", fields: 41, rules: 22, lastValidated: "2026-04-07 18:30" },
  { name: "sales_order", version: "4.0", fields: 28, rules: 15, lastValidated: "2026-04-08 08:45" },
  { name: "bank_transaction", version: "2.5", fields: 19, rules: 12, lastValidated: "2026-04-08 09:10" },
  { name: "inventory_movement", version: "3.0", fields: 22, rules: 14, lastValidated: "2026-04-08 06:00" },
  { name: "employee_record", version: "2.3", fields: 48, rules: 20, lastValidated: "2026-04-07 23:00" },
  { name: "purchase_order", version: "3.1", fields: 31, rules: 16, lastValidated: "2026-04-08 08:30" },
];

/* ────── Validation Log ────── */
const validationLog = [
  { payload: "INV-20260408-0091", schema: "supplier_invoice", result: "pass", errors: 0, ts: "2026-04-08 09:15:03" },
  { payload: "PAY-202604-BATCH", schema: "hilan_payroll", result: "pass", errors: 0, ts: "2026-04-08 07:00:22" },
  { payload: "SO-88421", schema: "sales_order", result: "fail", errors: 2, ts: "2026-04-08 08:45:11" },
  { payload: "CUS-IL-04087", schema: "customs_declaration", result: "pass", errors: 0, ts: "2026-04-07 18:30:45" },
  { payload: "BNK-TXN-44210", schema: "bank_transaction", result: "pass", errors: 0, ts: "2026-04-08 09:10:30" },
  { payload: "INV-20260407-0088", schema: "supplier_invoice", result: "fail", errors: 1, ts: "2026-04-07 14:22:18" },
  { payload: "PO-77120", schema: "purchase_order", result: "pass", errors: 0, ts: "2026-04-08 08:30:55" },
  { payload: "EMP-UPD-312", schema: "employee_record", result: "fail", errors: 1, ts: "2026-04-07 23:01:40" },
  { payload: "STK-MOV-6621", schema: "inventory_movement", result: "pass", errors: 0, ts: "2026-04-08 06:00:12" },
  { payload: "SO-88419", schema: "sales_order", result: "pass", errors: 0, ts: "2026-04-07 17:55:08" },
];

/* ────── Transform Rules ────── */
const transformRules = [
  { name: "שינוי שם שדה", type: "field_rename", desc: "vendor_name → supplier_name", example: '"vendor_name" → "supplier_name"', uses: 245, icon: Replace },
  { name: "המרת פורמט תאריך", type: "date_format", desc: "DD/MM/YYYY → ISO 8601", example: '"08/04/2026" → "2026-04-08T00:00:00Z"', uses: 312, icon: CalendarClock },
  { name: "המרת מטבע", type: "currency_convert", desc: "שער בנק ישראל × סכום מקור", example: "USD 100 × 3.62 = ₪362.00", uses: 89, icon: Coins },
  { name: "טבלת Lookup", type: "lookup_table", desc: "קוד חיצוני → מזהה פנימי (מילון)", example: '"WH-01" → warehouse_id: 7', uses: 178, icon: Search },
  { name: "שדה מחושב", type: "calculated_field", desc: "פורמולה על שדות מקור", example: "quantity × unit_price × (1 + vat_rate)", uses: 56, icon: Code2 },
  { name: "מיפוי מותנה", type: "conditional_map", desc: "כלל If/Else לפי ערך שדה", example: 'if country = "IL" → vat 17%, else → 0%', uses: 10, icon: GitBranch },
];

/* ────── Component ────── */
export default function TransformationEngine() {
  const [tab, setTab] = useState("mappings");

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-indigo-50">
          <ArrowLeftRight className="h-6 w-6 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">מנוע טרנספורמציה ומיפוי</h1>
          <p className="text-sm text-muted-foreground">טכנו-כל עוזי &mdash; Payload Validation &amp; Field Mapping Engine</p>
        </div>
      </div>

      {/* ── KPI Strip ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{k.label}</p>
                  <p className="text-2xl font-bold">{k.value.toLocaleString("he-IL")}</p>
                </div>
                <div className={`p-2 rounded-lg ${k.bg}`}>
                  <k.icon className={`h-5 w-5 ${k.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Engine Stats Bar ── */}
      <Card className="border-dashed">
        <CardContent className="py-3">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-6">
              <span className="text-muted-foreground">מנוע:</span>
              <Badge className="bg-green-100 text-green-700 gap-1"><CheckCircle className="h-3 w-3" /> פעיל</Badge>
              <span className="text-muted-foreground">זמן תגובה ממוצע:</span>
              <span className="font-mono font-medium">42ms</span>
              <span className="text-muted-foreground">תהליכים בריצה:</span>
              <span className="font-mono font-medium">3</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span className="text-xs">עדכון אחרון: 2026-04-08 09:15:03</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Tabs ── */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="mappings">מיפוי שדות</TabsTrigger>
          <TabsTrigger value="schemas">סכמות</TabsTrigger>
          <TabsTrigger value="validation">לוג Validation</TabsTrigger>
          <TabsTrigger value="rules">כללי טרנספורמציה</TabsTrigger>
        </TabsList>

        {/* ── Tab: Mappings ── */}
        <TabsContent value="mappings">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Layers className="h-5 w-5 text-blue-600" />
                מיפוי שדות &mdash; Source → Target
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>מזהה</TableHead>
                    <TableHead>שדה מקור</TableHead>
                    <TableHead className="text-center w-10"></TableHead>
                    <TableHead>שדה יעד</TableHead>
                    <TableHead>כלל</TableHead>
                    <TableHead>אינטגרציה</TableHead>
                    <TableHead>סטטוס</TableHead>
                    <TableHead>שימוש אחרון</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fieldMappings.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-mono text-xs">{m.id}</TableCell>
                      <TableCell className="font-mono text-sm text-orange-700 bg-orange-50/50 rounded">{m.source}</TableCell>
                      <TableCell className="text-center"><ArrowRight className="h-4 w-4 text-muted-foreground inline-block" /></TableCell>
                      <TableCell className="font-mono text-sm text-blue-700 bg-blue-50/50 rounded">{m.target}</TableCell>
                      <TableCell><Badge className={ruleColors[m.rule]}>{m.rule}</Badge></TableCell>
                      <TableCell className="text-sm">{m.integration}</TableCell>
                      <TableCell>
                        {m.active
                          ? <Badge className="bg-green-100 text-green-700">פעיל</Badge>
                          : <Badge className="bg-gray-100 text-gray-500">מושבת</Badge>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{m.lastUsed}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Schemas ── */}
        <TabsContent value="schemas">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileJson className="h-5 w-5 text-purple-600" />
                סכמות Payload &mdash; הגדרות ו-Validation Rules
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>שם סכמה</TableHead>
                    <TableHead>גרסה</TableHead>
                    <TableHead>שדות</TableHead>
                    <TableHead>כללי ולידציה</TableHead>
                    <TableHead>כיסוי</TableHead>
                    <TableHead>ולידציה אחרונה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schemas.map((s) => {
                    const coverage = Math.round((s.rules / s.fields) * 100);
                    return (
                      <TableRow key={s.name}>
                        <TableCell className="font-mono text-sm">{s.name}</TableCell>
                        <TableCell><Badge variant="outline">v{s.version}</Badge></TableCell>
                        <TableCell className="font-medium">{s.fields}</TableCell>
                        <TableCell className="font-medium">{s.rules}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 min-w-[120px]">
                            <Progress value={coverage} className="h-2 flex-1" />
                            <span className="text-xs text-muted-foreground w-9 text-left">{coverage}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{s.lastValidated}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Validation Log ── */}
        <TabsContent value="validation">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
                לוג ולידציות אחרונות
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Payload</TableHead>
                    <TableHead>Schema</TableHead>
                    <TableHead>תוצאה</TableHead>
                    <TableHead>שגיאות</TableHead>
                    <TableHead>חותמת זמן</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {validationLog.map((v, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs">{v.payload}</TableCell>
                      <TableCell className="font-mono text-sm">{v.schema}</TableCell>
                      <TableCell>
                        {v.result === "pass" ? (
                          <Badge className="bg-green-100 text-green-700 gap-1">
                            <CheckCircle className="h-3 w-3" /> PASS
                          </Badge>
                        ) : (
                          <Badge className="bg-red-100 text-red-700 gap-1">
                            <XCircle className="h-3 w-3" /> FAIL
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className={v.errors > 0 ? "text-red-600 font-bold" : "text-muted-foreground"}>
                        {v.errors}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap font-mono">{v.ts}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Transform Rules ── */}
        <TabsContent value="rules">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Code2 className="h-5 w-5 text-amber-600" />
                כללי טרנספורמציה
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {transformRules.map((r) => (
                  <Card key={r.type} className="border border-dashed">
                    <CardContent className="py-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <r.icon className="h-5 w-5 text-indigo-600" />
                        <span className="font-semibold text-sm">{r.name}</span>
                        <Badge variant="outline" className="mr-auto text-[10px]">{r.uses} שימושים</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{r.desc}</p>
                      <div className="bg-muted/50 rounded-md px-3 py-2 font-mono text-xs leading-relaxed whitespace-pre-wrap">
                        {r.example}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Pipeline Summary ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="py-4">
            <p className="text-sm font-medium mb-2">כיסוי מיפוי לפי אינטגרציה</p>
            {[["SAP B1", 92], ["Hilan", 85], ["חשבונית ירוקה", 78], ["Priority", 95], ["מכס ישראל", 68]].map(([name, pct]) => (
              <div key={name as string} className="flex items-center gap-2 mb-1.5">
                <span className="text-xs w-24 truncate">{name}</span>
                <Progress value={pct as number} className="h-1.5 flex-1" />
                <span className="text-[10px] text-muted-foreground w-8 text-left">{pct}%</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4">
            <p className="text-sm font-medium mb-2">התפלגות כללי טרנספורמציה</p>
            {transformRules.map((r) => (
              <div key={r.type} className="flex items-center gap-2 mb-1.5">
                <r.icon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs flex-1">{r.name}</span>
                <span className="font-mono text-xs font-medium">{r.uses}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4">
            <p className="text-sm font-medium mb-2">סיכום Validation (7 ימים)</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">סה"כ ולידציות</span><span className="font-bold">6,230</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">PASS</span><span className="font-bold text-green-600">6,188 (99.3%)</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">FAIL</span><span className="font-bold text-red-600">42 (0.7%)</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">סכמות בשימוש</span><span className="font-bold">18 / 22</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">שגיאה נפוצה</span><span className="text-xs">missing required field</span></div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
