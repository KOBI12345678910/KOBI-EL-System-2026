import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import {
  ShieldCheck, Award, AlertTriangle, XCircle, Clock, DollarSign,
  Search, Calendar, CheckCircle2, FileText, Building2, FlaskConical,
  RefreshCw, ChevronDown, ChevronUp, ArrowUpDown, Filter
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";

const fmt = (v: number) => v.toLocaleString("he-IL");

const statusMap: Record<string, { label: string; color: string }> = {
  valid: { label: "בתוקף", color: "bg-green-500/20 text-green-400 border-green-500/30" },
  expiring: { label: "פג בקרוב", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  expired: { label: "פג תוקף", color: "bg-red-500/20 text-red-400 border-red-500/30" },
  inProcess: { label: "בתהליך", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
};

const FALLBACK_CERTIFICATIONS = [
  { id: 1, name: "סימון CE", certNumber: "CE-2024-TK-001", product: "חלונות אלומיניום", standard: "EU 305/2011", lab: "מכון התקנים הישראלי", issueDate: "2024-03-15", expiryDate: "2027-03-15", status: "valid", cost: 18500 },
  { id: 2, name: "תקן ישראלי ת\"י 1281", certNumber: "SI-1281-2024-042", product: "דלתות אלומיניום", standard: "ת\"י 1281", lab: "מכון התקנים הישראלי", issueDate: "2024-01-10", expiryDate: "2027-01-10", status: "valid", cost: 12000 },
  { id: 3, name: "EN 14351-1 חלונות ודלתות", certNumber: "EN14351-TK-088", product: "חלונות ודלתות", standard: "EN 14351-1:2006+A2", lab: "IFT Rosenheim", issueDate: "2023-06-20", expiryDate: "2026-06-20", status: "expiring", cost: 32000 },
  { id: 4, name: "EN 13830 קירות מסך", certNumber: "EN13830-TK-033", product: "קירות מסך", standard: "EN 13830:2015", lab: "CSTB France", issueDate: "2023-09-01", expiryDate: "2026-09-01", status: "valid", cost: 45000 },
  { id: 5, name: "EN 12150 זכוכית מחוסמת", certNumber: "EN12150-TK-112", product: "זכוכית מחוסמת", standard: "EN 12150-1:2015", lab: "TUV Rheinland", issueDate: "2024-02-28", expiryDate: "2027-02-28", status: "valid", cost: 22000 },
  { id: 6, name: "EN 14449 זכוכית שכבתית", certNumber: "EN14449-TK-077", product: "זכוכית למינציה", standard: "EN 14449:2005", lab: "TUV Rheinland", issueDate: "2023-11-15", expiryDate: "2026-11-15", status: "valid", cost: 19500 },
  { id: 7, name: "EN 1090 פלדה", certNumber: "EN1090-TK-056", product: "רכיבי פלדה", standard: "EN 1090-1:2009+A1", lab: "Bureau Veritas", issueDate: "2023-04-01", expiryDate: "2026-04-01", status: "expired", cost: 28000 },
  { id: 8, name: "עמידות אש", certNumber: "FR-TK-2024-019", product: "דלתות אש", standard: "EN 1634-1", lab: "Efectis France", issueDate: "2024-05-20", expiryDate: "2027-05-20", status: "valid", cost: 38000 },
  { id: 9, name: "דירוג אקוסטי", certNumber: "AC-TK-2024-044", product: "חלונות אקוסטיים", standard: "EN ISO 10140", lab: "מכון התקנים הישראלי", issueDate: "2024-07-10", expiryDate: "2027-07-10", status: "valid", cost: 15000 },
  { id: 10, name: "דירוג תרמי", certNumber: "TH-TK-2023-091", product: "חלונות תרמיים", standard: "EN ISO 10077", lab: "IFT Rosenheim", issueDate: "2023-08-15", expiryDate: "2026-08-15", status: "valid", cost: 21000 },
  { id: 11, name: "עמידות הוריקן", certNumber: "HC-TK-2024-007", product: "חלונות עמידי סערה", standard: "ASTM E1886/E1996", lab: "Miami-Dade Lab", issueDate: "2024-04-01", expiryDate: "2027-04-01", status: "valid", cost: 52000 },
  { id: 12, name: "עמידות בליסטית", certNumber: "BR-TK-2023-015", product: "זכוכית בליסטית", standard: "EN 1063", lab: "H.P. White Lab", issueDate: "2023-12-10", expiryDate: "2026-05-10", status: "expiring", cost: 67000 },
  { id: 13, name: "עמידות לפריצה", certNumber: "FE-TK-2024-028", product: "דלתות ביטחון", standard: "EN 1627-1630", lab: "ift Rosenheim", issueDate: "2024-06-15", expiryDate: "2027-06-15", status: "valid", cost: 35000 },
  { id: 14, name: "תקן סביבתי", certNumber: "ENV-TK-2024-003", product: "כל המוצרים", standard: "ISO 14001:2015", lab: "SGS International", issueDate: "2024-08-01", expiryDate: "2027-08-01", status: "valid", cost: 24000 },
  { id: 15, name: "בידוד תרמי מתקדם", certNumber: "TH2-TK-2025-001", product: "מערכות חזית", standard: "EN 13947", lab: "CSTB France", issueDate: "2025-01-15", expiryDate: "2025-07-15", status: "inProcess", cost: 41000 },
];

const FALLBACK_TESTING_SCHEDULE = [
  { id: 1, cert: "EN 14351-1 חלונות ודלתות", lab: "IFT Rosenheim", testDate: "2026-05-10", product: "חלונות סדרה חדשה", type: "חידוש", status: "מתוכנן" },
  { id: 2, cert: "EN 1090 פלדה", lab: "Bureau Veritas", testDate: "2026-04-20", product: "רכיבי פלדה", type: "חידוש דחוף", status: "בהכנה" },
  { id: 3, cert: "עמידות בליסטית", lab: "H.P. White Lab", testDate: "2026-06-01", product: "זכוכית בליסטית BR7", type: "חידוש", status: "מתוכנן" },
  { id: 4, cert: "בידוד תרמי מתקדם", lab: "CSTB France", testDate: "2026-04-28", product: "מערכות חזית", type: "הסמכה ראשונית", status: "דגימות נשלחו" },
  { id: 5, cert: "סימון CE", lab: "מכון התקנים הישראלי", testDate: "2026-07-15", product: "דלתות הזזה חדשות", type: "הרחבת היקף", status: "מתוכנן" },
  { id: 6, cert: "עמידות אש", lab: "Efectis France", testDate: "2026-08-20", product: "מחיצות אש EI60", type: "הסמכה ראשונית", status: "ממתין לאישור" },
  { id: 7, cert: "דירוג אקוסטי", lab: "מכון התקנים הישראלי", testDate: "2026-05-25", product: "חלונות אקוסטיים 45dB", type: "שדרוג", status: "מתוכנן" },
];

const FALLBACK_COMPLIANCE_MATRIX = [
  { product: "חלונות אלומיניום", certs: [true, true, true, false, true, false, false, false, true, true, false, false, false, true, false] },
  { product: "דלתות אלומיניום", certs: [true, true, true, false, false, false, false, false, false, true, false, false, true, true, false] },
  { product: "קירות מסך", certs: [true, false, false, true, true, true, true, false, true, true, false, false, false, true, true] },
  { product: "דלתות אש", certs: [true, true, false, false, false, false, false, true, false, false, false, false, true, true, false] },
  { product: "חלונות עמידי סערה", certs: [true, false, true, false, true, true, false, false, false, true, true, false, false, true, false] },
  { product: "זכוכית בליסטית", certs: [false, false, false, false, true, true, false, false, false, false, false, true, true, true, false] },
  { product: "מערכות חזית", certs: [true, false, false, true, true, true, true, true, true, true, false, false, false, true, true] },
];

const certShortNames = ["CE", "ת\"י 1281", "EN 14351", "EN 13830", "EN 12150", "EN 14449", "EN 1090", "אש", "אקוסטי", "תרמי", "הוריקן", "בליסטי", "פריצה", "סביבתי", "EN 13947"];

const FALLBACK_COST_DATA = [
  { product: "חלונות אלומיניום", annual: 66500, nextRenewal: "2026-06", pendingCost: 0, certCount: 7 },
  { product: "דלתות אלומיניום", annual: 47000, nextRenewal: "2026-08", pendingCost: 0, certCount: 5 },
  { product: "קירות מסך", annual: 89500, nextRenewal: "2026-06", pendingCost: 41000, certCount: 8 },
  { product: "דלתות אש", annual: 73000, nextRenewal: "2027-01", pendingCost: 0, certCount: 4 },
  { product: "חלונות עמידי סערה", annual: 88000, nextRenewal: "2027-03", pendingCost: 0, certCount: 6 },
  { product: "זכוכית בליסטית", annual: 108000, nextRenewal: "2026-05", pendingCost: 67000, certCount: 4 },
  { product: "מערכות חזית", annual: 95000, nextRenewal: "2026-04", pendingCost: 41000, certCount: 9 },
];

export default function ProductCertificationsPage() {
  const { data: productcertificationsData } = useQuery({
    queryKey: ["product-certifications"],
    queryFn: () => authFetch("/api/product-dev/product_certifications"),
    staleTime: 5 * 60 * 1000,
  });

  const certifications = productcertificationsData ?? FALLBACK_CERTIFICATIONS;
  const complianceMatrix = FALLBACK_COMPLIANCE_MATRIX;
  const costData = FALLBACK_COST_DATA;
  const testingSchedule = FALLBACK_TESTING_SCHEDULE;

  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("certifications");
  const [sortField, setSortField] = useState<string>("expiryDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const totalCerts = certifications.length;
  const validCount = certifications.filter(c => c.status === "valid").length;
  const expiringCount = certifications.filter(c => c.status === "expiring").length;
  const expiredCount = certifications.filter(c => c.status === "expired").length;
  const inProcessCount = certifications.filter(c => c.status === "inProcess").length;
  const totalCost = certifications.reduce((s, c) => s + c.cost, 0);

  const kpis = [
    { label: "סה\"כ הסמכות", value: totalCerts, icon: ShieldCheck, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "בתוקף", value: validCount, icon: CheckCircle2, color: "text-green-400", bg: "bg-green-500/10" },
    { label: "פג בקרוב (90 יום)", value: expiringCount, icon: AlertTriangle, color: "text-yellow-400", bg: "bg-yellow-500/10" },
    { label: "פג תוקף", value: expiredCount, icon: XCircle, color: "text-red-400", bg: "bg-red-500/10" },
    { label: "בתהליך", value: inProcessCount, icon: Clock, color: "text-purple-400", bg: "bg-purple-500/10" },
    { label: "עלות הסמכות ₪", value: fmt(totalCost), icon: DollarSign, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  ];

  const filtered = certifications
    .filter(c => statusFilter === "all" || c.status === statusFilter)
    .filter(c => !search || c.name.includes(search) || c.product.includes(search) || c.standard.includes(search) || c.certNumber.includes(search))
    .sort((a: any, b: any) => {
      const av = a[sortField], bv = b[sortField];
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const SortIcon = ({ field }: { field: string }) => (
    sortField === field
      ? (sortDir === "asc" ? <ChevronUp className="w-3 h-3 inline mr-1" /> : <ChevronDown className="w-3 h-3 inline mr-1" />)
      : <ArrowUpDown className="w-3 h-3 inline mr-1 opacity-40" />
  );

  const totalAnnualCost = costData.reduce((s, c) => s + c.annual, 0);

  return (
    <div dir="rtl" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ShieldCheck className="w-7 h-7 text-blue-400" />
            ניהול הסמכות מוצר
          </h1>
          <p className="text-sm text-muted-foreground mt-1">טכנו-כל עוזי - מעקב הסמכות, תקנים ובדיקות מעבדה</p>
        </div>
        <Button size="sm" className="gap-1.5"><RefreshCw className="w-4 h-4" />רענון נתונים</Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map(k => (
          <Card key={k.label} className={`p-4 ${k.bg} border-0`}>
            <div className="flex items-center gap-2 mb-2">
              <k.icon className={`w-5 h-5 ${k.color}`} />
              <span className="text-xs text-muted-foreground">{k.label}</span>
            </div>
            <div className={`text-2xl font-bold ${k.color}`}>{k.value}</div>
          </Card>
        ))}
      </div>

      {/* Certification Health Bar */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium">מצב בריאות הסמכות</span>
          <span className="text-xs text-muted-foreground">{validCount} מתוך {totalCerts} בתוקף ({Math.round(validCount / totalCerts * 100)}%)</span>
        </div>
        <div className="flex h-3 rounded-full overflow-hidden bg-muted/30">
          <div className="bg-green-500 transition-all" style={{ width: `${(validCount / totalCerts) * 100}%` }} />
          <div className="bg-yellow-500 transition-all" style={{ width: `${(expiringCount / totalCerts) * 100}%` }} />
          <div className="bg-red-500 transition-all" style={{ width: `${(expiredCount / totalCerts) * 100}%` }} />
          <div className="bg-blue-500 transition-all" style={{ width: `${(inProcessCount / totalCerts) * 100}%` }} />
        </div>
        <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" />בתוקף</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500" />פג בקרוב</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" />פג תוקף</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" />בתהליך</span>
        </div>
      </Card>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="certifications" className="gap-1.5"><Award className="w-4 h-4" />הסמכות</TabsTrigger>
          <TabsTrigger value="testing" className="gap-1.5"><FlaskConical className="w-4 h-4" />לוח בדיקות</TabsTrigger>
          <TabsTrigger value="compliance" className="gap-1.5"><FileText className="w-4 h-4" />מטריצת תאימות</TabsTrigger>
          <TabsTrigger value="costs" className="gap-1.5"><DollarSign className="w-4 h-4" />עלויות</TabsTrigger>
        </TabsList>

        {/* Tab 1 - Certifications */}
        <TabsContent value="certifications" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="חיפוש הסמכה, מוצר, תקן..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
            </div>
            <div className="flex items-center gap-1.5">
              <Filter className="w-4 h-4 text-muted-foreground" />
              {["all", "valid", "expiring", "expired", "inProcess"].map(s => (
                <Button key={s} size="sm" variant={statusFilter === s ? "default" : "outline"} onClick={() => setStatusFilter(s)} className="text-xs h-8">
                  {s === "all" ? "הכל" : statusMap[s].label}
                </Button>
              ))}
            </div>
          </div>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-muted-foreground">
                    <th className="p-3 text-right cursor-pointer" onClick={() => toggleSort("name")}><SortIcon field="name" />הסמכה</th>
                    <th className="p-3 text-right">מס׳ תעודה</th>
                    <th className="p-3 text-right cursor-pointer" onClick={() => toggleSort("product")}><SortIcon field="product" />מוצר</th>
                    <th className="p-3 text-right">תקן</th>
                    <th className="p-3 text-right">מעבדה</th>
                    <th className="p-3 text-right cursor-pointer" onClick={() => toggleSort("expiryDate")}><SortIcon field="expiryDate" />תוקף</th>
                    <th className="p-3 text-right cursor-pointer" onClick={() => toggleSort("status")}><SortIcon field="status" />סטטוס</th>
                    <th className="p-3 text-right cursor-pointer" onClick={() => toggleSort("cost")}><SortIcon field="cost" />עלות ₪</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(c => (
                    <tr key={c.id} className="border-b border-border/50 hover:bg-muted/20 cursor-pointer transition-colors" onClick={() => setExpandedRow(expandedRow === c.id ? null : c.id)}>
                      <td className="p-3 font-medium">{c.name}</td>
                      <td className="p-3 text-xs font-mono text-muted-foreground">{c.certNumber}</td>
                      <td className="p-3">{c.product}</td>
                      <td className="p-3 text-xs">{c.standard}</td>
                      <td className="p-3 text-xs"><span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{c.lab}</span></td>
                      <td className="p-3 text-xs">
                        <div>{c.issueDate} -</div>
                        <div className="font-medium">{c.expiryDate}</div>
                      </td>
                      <td className="p-3"><Badge className={`${statusMap[c.status].color} text-xs`}>{statusMap[c.status].label}</Badge></td>
                      <td className="p-3 font-medium">{fmt(c.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filtered.length === 0 && <div className="p-8 text-center text-muted-foreground">לא נמצאו הסמכות</div>}
          </Card>
        </TabsContent>

        {/* Tab 2 - Testing Schedule */}
        <TabsContent value="testing" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2"><Calendar className="w-5 h-5 text-blue-400" />לוח בדיקות הסמכה קרובות</h2>
            <Badge variant="outline" className="text-xs">{testingSchedule.length} בדיקות מתוכננות</Badge>
          </div>
          <div className="grid gap-3">
            {testingSchedule.map(t => {
              const isUrgent = t.type.includes("דחוף") || t.status === "בהכנה";
              return (
                <Card key={t.id} className={`p-4 ${isUrgent ? "border-yellow-500/40 bg-yellow-500/5" : ""}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex-1 min-w-[200px]">
                      <div className="font-medium flex items-center gap-2">
                        <FlaskConical className="w-4 h-4 text-blue-400" />
                        {t.cert}
                        {isUrgent && <AlertTriangle className="w-4 h-4 text-yellow-400" />}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">{t.product}</div>
                    </div>
                    <div className="text-sm">
                      <span className="text-xs text-muted-foreground">מעבדה: </span>
                      <span className="font-medium">{t.lab}</span>
                    </div>
                    <div className="text-sm">
                      <span className="text-xs text-muted-foreground">תאריך: </span>
                      <span className="font-medium">{t.testDate}</span>
                    </div>
                    <Badge variant="outline" className="text-xs">{t.type}</Badge>
                    <Badge className={`text-xs ${t.status === "דגימות נשלחו" ? "bg-green-500/20 text-green-400" : t.status === "בהכנה" ? "bg-yellow-500/20 text-yellow-400" : "bg-blue-500/20 text-blue-400"}`}>
                      {t.status}
                    </Badge>
                  </div>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* Tab 3 - Compliance Matrix */}
        <TabsContent value="compliance" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2"><FileText className="w-5 h-5 text-purple-400" />מטריצת תאימות - מוצרים מול הסמכות</h2>
          </div>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/30 text-muted-foreground">
                    <th className="p-2 text-right sticky right-0 bg-muted/30 min-w-[140px]">מוצר</th>
                    {certShortNames.map((n, i) => (
                      <th key={i} className="p-2 text-center whitespace-nowrap" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", minWidth: 36 }}>{n}</th>
                    ))}
                    <th className="p-2 text-center">כיסוי</th>
                  </tr>
                </thead>
                <tbody>
                  {complianceMatrix.map((row, ri) => {
                    const total = row.certs.filter(Boolean).length;
                    const pct = Math.round((total / row.certs.length) * 100);
                    return (
                      <tr key={ri} className="border-b border-border/50 hover:bg-muted/20">
                        <td className="p-2 font-medium sticky right-0 bg-background">{row.product}</td>
                        {row.certs.map((has, ci) => (
                          <td key={ci} className="p-2 text-center">
                            {has
                              ? <CheckCircle2 className="w-4 h-4 text-green-400 mx-auto" />
                              : <span className="text-muted-foreground/30">-</span>}
                          </td>
                        ))}
                        <td className="p-2 text-center">
                          <div className="flex items-center gap-1.5 justify-center">
                            <Progress value={pct} className="w-16 h-1.5" />
                            <span className="text-xs font-medium">{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-400" />הסמכה קיימת</span>
            <span className="flex items-center gap-1"><span className="text-muted-foreground/30">-</span> לא נדרש / חסר</span>
          </div>
        </TabsContent>

        {/* Tab 4 - Costs */}
        <TabsContent value="costs" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2"><DollarSign className="w-5 h-5 text-emerald-400" />עלויות הסמכה לפי מוצר</h2>
            <div className="text-sm text-muted-foreground">
              סה"כ עלות שנתית: <span className="font-bold text-emerald-400">₪{fmt(totalAnnualCost)}</span>
            </div>
          </div>
          <div className="grid gap-3">
            {costData.map((cd, i) => {
              const pctOfTotal = Math.round((cd.annual / totalAnnualCost) * 100);
              return (
                <Card key={i} className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                    <div className="font-medium">{cd.product}</div>
                    <div className="flex items-center gap-4 text-sm">
                      <span>
                        <span className="text-xs text-muted-foreground">הסמכות: </span>
                        <span className="font-medium">{cd.certCount}</span>
                      </span>
                      <span>
                        <span className="text-xs text-muted-foreground">חידוש הבא: </span>
                        <span className="font-medium">{cd.nextRenewal}</span>
                      </span>
                      {cd.pendingCost > 0 && (
                        <Badge className="bg-yellow-500/20 text-yellow-400 text-xs">ממתין: ₪{fmt(cd.pendingCost)}</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Progress value={pctOfTotal} className="flex-1 h-2" />
                    <span className="text-sm font-bold text-emerald-400 min-w-[90px] text-left">₪{fmt(cd.annual)}</span>
                    <span className="text-xs text-muted-foreground min-w-[40px] text-left">{pctOfTotal}%</span>
                  </div>
                </Card>
              );
            })}
          </div>
          {/* Cost Summary */}
          <Card className="p-4 bg-muted/20">
            <h3 className="text-sm font-semibold mb-3">סיכום עלויות</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">עלות שנתית כוללת</div>
                <div className="text-lg font-bold text-emerald-400">₪{fmt(totalAnnualCost)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">עלות ממוצעת להסמכה</div>
                <div className="text-lg font-bold">₪{fmt(Math.round(totalCost / totalCerts))}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">חידושים ממתינים</div>
                <div className="text-lg font-bold text-yellow-400">₪{fmt(costData.reduce((s, c) => s + c.pendingCost, 0))}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">עלות חודשית ממוצעת</div>
                <div className="text-lg font-bold">₪{fmt(Math.round(totalAnnualCost / 12))}</div>
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
