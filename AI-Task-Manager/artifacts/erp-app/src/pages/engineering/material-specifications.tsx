import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Layers, CheckCircle2, FlaskConical, FolderTree, Truck, AlertTriangle,
  Search, FileText, ShieldCheck, XCircle, Calendar, Building2,
  Thermometer, Weight, ArrowUpDown, ClipboardList,
} from "lucide-react";

// ── Material Catalog ──
const FALLBACK_MATERIALS = [
  { id: "MAT-001", name: "אלומיניום 6063-T5", family: "אלומיניום", spec: "TK-AL-001", standard: "EN 755-2", density: 2.70, yieldMPa: 110, properties: "אנודייז מעולה, עמידות קורוזיה, ריתוך טוב", supplier: "אלקואה ישראל", status: "מאושר" },
  { id: "MAT-002", name: "אלומיניום 6061-T6", family: "אלומיניום", spec: "TK-AL-002", standard: "EN 755-2", density: 2.70, yieldMPa: 240, properties: "חוזק גבוה, עיבוד שבבי, ריתוך", supplier: "הידאל תעשיות", status: "מאושר" },
  { id: "MAT-003", name: "זכוכית שטוחה 4 מ\"מ", family: "זכוכית", spec: "TK-GL-001", standard: "EN 572-2", density: 2.50, yieldMPa: 45, properties: "שקיפות גבוהה, חיתוך קל", supplier: "פניציה זכוכית", status: "מאושר" },
  { id: "MAT-004", name: "זכוכית שטוחה 6 מ\"מ", family: "זכוכית", spec: "TK-GL-002", standard: "EN 572-2", density: 2.50, yieldMPa: 45, properties: "שקיפות גבוהה, בידוד סאונד בסיסי", supplier: "פניציה זכוכית", status: "מאושר" },
  { id: "MAT-005", name: "זכוכית שטוחה 8 מ\"מ", family: "זכוכית", spec: "TK-GL-003", standard: "EN 572-2", density: 2.50, yieldMPa: 45, properties: "עובי מוגבר, בידוד אקוסטי", supplier: "ישרגלאס", status: "ממתין לבדיקה" },
  { id: "MAT-006", name: "זכוכית מחוסמת", family: "זכוכית", spec: "TK-GL-004", standard: "EN 12150-1", density: 2.50, yieldMPa: 120, properties: "חוזק פי 5, שבירה בטוחה", supplier: "פניציה זכוכית", status: "מאושר" },
  { id: "MAT-007", name: "זכוכית למינציה", family: "זכוכית", spec: "TK-GL-005", standard: "EN 14449", density: 2.50, yieldMPa: 70, properties: "בטיחות, בידוד UV, אקוסטיקה", supplier: "ישרגלאס", status: "מאושר" },
  { id: "MAT-008", name: "פלדה S235", family: "פלדה", spec: "TK-ST-001", standard: "EN 10025-2", density: 7.85, yieldMPa: 235, properties: "ריתוך מצוין, עלות נמוכה, ציפוי נדרש", supplier: "מתכת הנגב", status: "מאושר" },
  { id: "MAT-009", name: "נירוסטה 304", family: "פלדה", spec: "TK-ST-002", standard: "EN 10088-2", density: 7.93, yieldMPa: 210, properties: "עמידות קורוזיה גבוהה, היגיינה", supplier: "סטיל ישראל", status: "מאושר" },
  { id: "MAT-010", name: "איטום EPDM", family: "איטום", spec: "TK-SE-001", standard: "EN 12365-1", density: 1.15, yieldMPa: 8, properties: "עמידות UV, גמישות -40 עד +120°C", supplier: "טכנוגומי", status: "מאושר" },
  { id: "MAT-011", name: "שבר תרמי פוליאמיד", family: "בידוד", spec: "TK-TB-001", standard: "EN 14024", density: 1.23, yieldMPa: 85, properties: "בידוד תרמי Uf=1.4, חוזק מבני", supplier: "אנסולדו פרופילים", status: "מאושר" },
  { id: "MAT-012", name: "סיליקון איטום", family: "איטום", spec: "TK-SE-002", standard: "ISO 11600", density: 1.05, yieldMPa: 2, properties: "גמישות, עמידות מזג אוויר, UV", supplier: "סיקה ישראל", status: "ממתין לבדיקה" },
  { id: "MAT-013", name: "ציפוי אבץ", family: "ציפוי", spec: "TK-CT-001", standard: "EN ISO 1461", density: 7.13, yieldMPa: 0, properties: "הגנה קתודית, 50+ שנות עמידות", supplier: "גלבניק בע\"מ", status: "מאושר" },
  { id: "MAT-014", name: "ציפוי אבקתי", family: "ציפוי", spec: "TK-CT-002", standard: "EN 12206-1", density: 1.40, yieldMPa: 0, properties: "עמידות UV, מגוון צבעים RAL", supplier: "טיגר ישראל", status: "מאושר" },
  { id: "MAT-015", name: "אנודייז", family: "ציפוי", spec: "TK-CT-003", standard: "EN 12373-1", density: 3.95, yieldMPa: 0, properties: "קשיות משטח, עמידות שחיקה", supplier: "אנודייז תעשיות", status: "ממתין לבדיקה" },
];

const pvbInterlayer = { id: "MAT-016", name: "שכבת PVB ביניים", family: "זכוכית", spec: "TK-GL-006", standard: "EN ISO 12543-4", density: 1.07, yieldMPa: 22, properties: "הדבקת שכבות, בטיחות, בידוד אקוסטי", supplier: "קוראקס ישראל", status: "מאושר" };
const argonGas = { id: "MAT-017", name: "גז ארגון", family: "גז בידוד", spec: "TK-GS-001", standard: "EN 1279-3", density: 0.0018, yieldMPa: 0, properties: "בידוד תרמי יחידות IGU, Ug=1.1", supplier: "מקסימה גזים", status: "מאושר" };
const FALLBACK_ALLMATERIALS = [...materials, pvbInterlayer, argonGas];

// ── Test Results ──
const FALLBACK_TESTRESULTS = [
  { id: "TST-001", material: "אלומיניום 6063-T5", test: "מתיחה", date: "2026-04-01", lab: "מעבדת התקנים", result: "115 MPa", target: ">=110 MPa", status: "עבר" },
  { id: "TST-002", material: "זכוכית מחוסמת", test: "שבירה / פרגמנטציה", date: "2026-04-02", lab: "מכון התקנים", result: "42 שברים/50x50", target: ">=40", status: "עבר" },
  { id: "TST-003", material: "פלדה S235", test: "מתיחה", date: "2026-04-03", lab: "מעבדת התקנים", result: "242 MPa", target: ">=235 MPa", status: "עבר" },
  { id: "TST-004", material: "זכוכית שטוחה 8 מ\"מ", test: "עמידות לחץ", date: "2026-04-04", lab: "מכון התקנים", result: "38 MPa", target: ">=45 MPa", status: "נכשל" },
  { id: "TST-005", material: "איטום EPDM", test: "הזדקנות מואצת", date: "2026-04-05", lab: "פולימרים בע\"מ", result: "1,200 שעות", target: ">=1,000", status: "עבר" },
  { id: "TST-006", material: "ציפוי אבקתי", test: "עמידות UV (QUV)", date: "2026-04-02", lab: "מעבדת ציפויים", result: "4,800 שעות", target: ">=5,000", status: "נכשל" },
  { id: "TST-007", material: "אלומיניום 6061-T6", test: "קשיות Brinell", date: "2026-04-06", lab: "מעבדת התקנים", result: "95 HB", target: ">=90 HB", status: "עבר" },
  { id: "TST-008", material: "סיליקון איטום", test: "הדבקה / תלישה", date: "2026-04-03", lab: "מכון התקנים", result: "0.45 MPa", target: ">=0.40 MPa", status: "עבר" },
  { id: "TST-009", material: "נירוסטה 304", test: "עמידות קורוזיה (SST)", date: "2026-04-07", lab: "מעבדת מתכות", result: "720 שעות", target: ">=500", status: "עבר" },
  { id: "TST-010", material: "שבר תרמי פוליאמיד", test: "חוזק גזירה", date: "2026-04-05", lab: "פולימרים בע\"מ", result: "88 MPa", target: ">=85 MPa", status: "עבר" },
];

// ── Certifications ──
const FALLBACK_CERTIFICATIONS = [
  { id: "CRT-001", material: "אלומיניום 6063-T5", certType: "תעודת בדיקה 3.1", issuer: "מכון התקנים הישראלי", issued: "2025-10-15", expiry: "2026-10-14", status: "בתוקף" },
  { id: "CRT-002", material: "זכוכית מחוסמת", certType: "CE EN 12150-1", issuer: "TUV Rheinland", issued: "2025-06-01", expiry: "2026-05-31", status: "בתוקף" },
  { id: "CRT-003", material: "פלדה S235", certType: "תעודת בדיקה 3.1", issuer: "מכון התקנים", issued: "2025-08-20", expiry: "2026-08-19", status: "בתוקף" },
  { id: "CRT-004", material: "ציפוי אבקתי", certType: "Qualicoat Class 2", issuer: "Qualicoat", issued: "2025-03-10", expiry: "2026-03-09", status: "פג תוקף" },
  { id: "CRT-005", material: "נירוסטה 304", certType: "EN 10204 Type 3.1", issuer: "Bureau Veritas", issued: "2025-12-01", expiry: "2026-11-30", status: "בתוקף" },
  { id: "CRT-006", material: "שבר תרמי פוליאמיד", certType: "EN 14024", issuer: "IFT Rosenheim", issued: "2025-09-15", expiry: "2026-09-14", status: "בתוקף" },
  { id: "CRT-007", material: "איטום EPDM", certType: "EN 12365-1", issuer: "SKZ Testing", issued: "2025-04-01", expiry: "2026-04-01", status: "פג תוקף" },
  { id: "CRT-008", material: "אנודייז", certType: "Qualanod Class 20", issuer: "Qualanod", issued: "2025-11-20", expiry: "2026-11-19", status: "בתוקף" },
];

// ── Non-Conformances ──
const FALLBACK_NCRS = [
  { id: "NCR-001", material: "זכוכית שטוחה 8 מ\"מ", desc: "עובי מתחת לטולרנס — 7.6 מ\"מ במקום 8.0", severity: "משמעותי", date: "2026-03-28", assignee: "דוד מזרחי", status: "פתוח", action: "החזרה לספק + בדיקה חוזרת" },
  { id: "NCR-002", material: "ציפוי אבקתי", desc: "גוון RAL 7016 חורג מדלתא E>2", severity: "קל", date: "2026-04-01", assignee: "שרה לוי", status: "בטיפול", action: "ריסוס מחדש אצווה 312" },
  { id: "NCR-003", material: "אלומיניום 6063-T5", desc: "שריטות אורך על פרופילים — פגם אקסטרוזיה", severity: "משמעותי", date: "2026-04-03", assignee: "יוסי כהן", status: "בטיפול", action: "תביעת ספק + בדיקת QC מחמירה" },
  { id: "NCR-004", material: "סיליקון איטום", desc: "תוקף LOT פג — חומר שהתקבל עם חיי מדף 30 יום", severity: "קריטי", date: "2026-04-05", assignee: "רחל אברהם", status: "פתוח", action: "השמדה + הזמנה חלופית דחופה" },
  { id: "NCR-005", material: "זכוכית למינציה", desc: "בועות אוויר בשכבת PVB — 3 יחידות מ-50", severity: "קל", date: "2026-04-06", assignee: "מיכל ברק", status: "נסגר", action: "פסילת יחידות, עדכון הוראות אחסון" },
];


const allMaterials = FALLBACK_ALLMATERIALS;
const materials = FALLBACK_MATERIALS;
const ncrs = FALLBACK_NCRS;

// ── KPI data ──
const kpis = [
  { label: "סה\"כ חומרים", value: allMaterials.length, icon: Layers, color: "text-blue-600 bg-blue-50" },
  { label: "מפרטים מאושרים", value: allMaterials.filter(m => m.status === "מאושר").length, icon: CheckCircle2, color: "text-emerald-600 bg-emerald-50" },
  { label: "ממתינים לבדיקה", value: allMaterials.filter(m => m.status === "ממתין לבדיקה").length, icon: FlaskConical, color: "text-amber-600 bg-amber-50" },
  { label: "משפחות חומר", value: [...new Set(allMaterials.map(m => m.family))].length, icon: FolderTree, color: "text-purple-600 bg-purple-50" },
  { label: "ספקים", value: [...new Set(allMaterials.map(m => m.supplier))].length, icon: Truck, color: "text-cyan-600 bg-cyan-50" },
  { label: "אי-התאמות פתוחות", value: ncrs.filter(n => n.status !== "נסגר").length, icon: AlertTriangle, color: "text-red-600 bg-red-50" },
];

const statusColor: Record<string, string> = {
  "מאושר": "bg-emerald-100 text-emerald-700",
  "ממתין לבדיקה": "bg-amber-100 text-amber-700",
  "עבר": "bg-emerald-100 text-emerald-700",
  "נכשל": "bg-red-100 text-red-700",
  "בתוקף": "bg-emerald-100 text-emerald-700",
  "פג תוקף": "bg-red-100 text-red-700",
  "פתוח": "bg-red-100 text-red-700",
  "בטיפול": "bg-amber-100 text-amber-700",
  "נסגר": "bg-slate-100 text-slate-600",
  "קריטי": "bg-red-100 text-red-700",
  "משמעותי": "bg-amber-100 text-amber-700",
  "קל": "bg-blue-100 text-blue-700",
};

export default function MaterialSpecificationsPage() {
  const { data: apimaterials } = useQuery({
    queryKey: ["/api/engineering/material-specifications/materials"],
    queryFn: () => authFetch("/api/engineering/material-specifications/materials").then(r => r.json()).catch(() => null),
  });
  const materials = Array.isArray(apimaterials) ? apimaterials : (apimaterials?.data ?? apimaterials?.items ?? FALLBACK_MATERIALS);


  const { data: apiallMaterials } = useQuery({
    queryKey: ["/api/engineering/material-specifications/allmaterials"],
    queryFn: () => authFetch("/api/engineering/material-specifications/allmaterials").then(r => r.json()).catch(() => null),
  });
  const allMaterials = Array.isArray(apiallMaterials) ? apiallMaterials : (apiallMaterials?.data ?? apiallMaterials?.items ?? FALLBACK_ALLMATERIALS);


  const { data: apitestResults } = useQuery({
    queryKey: ["/api/engineering/material-specifications/testresults"],
    queryFn: () => authFetch("/api/engineering/material-specifications/testresults").then(r => r.json()).catch(() => null),
  });
  const testResults = Array.isArray(apitestResults) ? apitestResults : (apitestResults?.data ?? apitestResults?.items ?? FALLBACK_TESTRESULTS);


  const { data: apicertifications } = useQuery({
    queryKey: ["/api/engineering/material-specifications/certifications"],
    queryFn: () => authFetch("/api/engineering/material-specifications/certifications").then(r => r.json()).catch(() => null),
  });
  const certifications = Array.isArray(apicertifications) ? apicertifications : (apicertifications?.data ?? apicertifications?.items ?? FALLBACK_CERTIFICATIONS);


  const { data: apincrs } = useQuery({
    queryKey: ["/api/engineering/material-specifications/ncrs"],
    queryFn: () => authFetch("/api/engineering/material-specifications/ncrs").then(r => r.json()).catch(() => null),
  });
  const ncrs = FALLBACK_NCRS;

  const [search, setSearch] = useState("");
  const [familyFilter, setFamilyFilter] = useState("all");

  const families = [...new Set(allMaterials.map(m => m.family))];

  const filtered = allMaterials.filter(m => {
    const matchesSearch = m.name.includes(search) || m.spec.includes(search) || m.standard.includes(search);
    const matchesFamily = familyFilter === "all" || m.family === familyFilter;
    return matchesSearch && matchesFamily;
  });

  const approvedPct = Math.round((allMaterials.filter(m => m.status === "מאושר").length / allMaterials.length) * 100);
  const testPassPct = Math.round((testResults.filter(t => t.status === "עבר").length / testResults.length) * 100);

  return (
    <div dir="rtl" className="p-6 space-y-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">מפרטי חומרים</h1>
          <p className="text-sm text-gray-500 mt-1">ניהול מפרטים, בדיקות ותעודות חומרי גלם - טכנו-כל עוזי</p>
        </div>
        <Button className="gap-2">
          <FileText className="w-4 h-4" />
          הוסף חומר חדש
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map(k => (
          <Card key={k.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${k.color}`}>
                <k.icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xl font-bold">{k.value}</p>
                <p className="text-xs text-gray-500">{k.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Progress bars */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex justify-between text-sm mb-2">
              <span className="font-medium">אחוז מפרטים מאושרים</span>
              <span className="font-bold text-emerald-600">{approvedPct}%</span>
            </div>
            <Progress value={approvedPct} className="h-2" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex justify-between text-sm mb-2">
              <span className="font-medium">אחוז בדיקות שעברו</span>
              <span className="font-bold text-blue-600">{testPassPct}%</span>
            </div>
            <Progress value={testPassPct} className="h-2" />
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="catalog" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="catalog" className="gap-1"><Layers className="w-4 h-4" />קטלוג חומרים</TabsTrigger>
          <TabsTrigger value="tests" className="gap-1"><FlaskConical className="w-4 h-4" />תוצאות בדיקות</TabsTrigger>
          <TabsTrigger value="certs" className="gap-1"><ShieldCheck className="w-4 h-4" />תעודות</TabsTrigger>
          <TabsTrigger value="ncr" className="gap-1"><AlertTriangle className="w-4 h-4" />אי-התאמות</TabsTrigger>
        </TabsList>

        {/* ── TAB 1: Catalog ── */}
        <TabsContent value="catalog" className="space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="חיפוש לפי שם, מפרט או תקן..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pr-10"
              />
            </div>
            <div className="flex gap-2">
              <Button variant={familyFilter === "all" ? "default" : "outline"} size="sm" onClick={() => setFamilyFilter("all")}>הכל</Button>
              {families.map(f => (
                <Button key={f} variant={familyFilter === f ? "default" : "outline"} size="sm" onClick={() => setFamilyFilter(f)}>{f}</Button>
              ))}
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 text-gray-600">
                    <tr>
                      <th className="p-3 text-right font-medium">מק\"ט</th>
                      <th className="p-3 text-right font-medium">שם חומר</th>
                      <th className="p-3 text-right font-medium">משפחה</th>
                      <th className="p-3 text-right font-medium">מפרט</th>
                      <th className="p-3 text-right font-medium">תקן</th>
                      <th className="p-3 text-right font-medium">צפיפות (g/cm3)</th>
                      <th className="p-3 text-right font-medium">חוזק כניעה (MPa)</th>
                      <th className="p-3 text-right font-medium">תכונות עיקריות</th>
                      <th className="p-3 text-right font-medium">ספק</th>
                      <th className="p-3 text-right font-medium">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filtered.map(m => (
                      <tr key={m.id} className="hover:bg-gray-50">
                        <td className="p-3 font-mono text-xs">{m.id}</td>
                        <td className="p-3 font-medium">{m.name}</td>
                        <td className="p-3"><Badge variant="outline">{m.family}</Badge></td>
                        <td className="p-3 font-mono text-xs">{m.spec}</td>
                        <td className="p-3 text-xs">{m.standard}</td>
                        <td className="p-3 text-center">{m.density}</td>
                        <td className="p-3 text-center">{m.yieldMPa || "—"}</td>
                        <td className="p-3 text-xs max-w-[200px] truncate">{m.properties}</td>
                        <td className="p-3 text-xs">{m.supplier}</td>
                        <td className="p-3"><Badge className={statusColor[m.status] || ""}>{m.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          <p className="text-xs text-gray-400 text-center">מציג {filtered.length} מתוך {allMaterials.length} חומרים</p>
        </TabsContent>

        {/* ── TAB 2: Test Results ── */}
        <TabsContent value="tests" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">תוצאות בדיקות אחרונות</h2>
            <div className="flex gap-2 text-sm">
              <Badge className="bg-emerald-100 text-emerald-700">{testResults.filter(t => t.status === "עבר").length} עברו</Badge>
              <Badge className="bg-red-100 text-red-700">{testResults.filter(t => t.status === "נכשל").length} נכשלו</Badge>
            </div>
          </div>

          <div className="grid gap-3">
            {testResults.map(t => (
              <Card key={t.id} className={t.status === "נכשל" ? "border-red-200 bg-red-50/30" : ""}>
                <CardContent className="p-4 flex items-center gap-4">
                  <div className={`p-2 rounded-full ${t.status === "עבר" ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600"}`}>
                    {t.status === "עבר" ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                  </div>
                  <div className="flex-1 grid grid-cols-2 md:grid-cols-6 gap-2 text-sm">
                    <div>
                      <p className="text-gray-500 text-xs">מזהה</p>
                      <p className="font-mono font-medium">{t.id}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs">חומר</p>
                      <p className="font-medium">{t.material}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs">סוג בדיקה</p>
                      <p>{t.test}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs">תוצאה / יעד</p>
                      <p>{t.result} <span className="text-gray-400">({t.target})</span></p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs">מעבדה</p>
                      <p>{t.lab}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs">תאריך</p>
                      <p className="flex items-center gap-1"><Calendar className="w-3 h-3" />{t.date}</p>
                    </div>
                  </div>
                  <Badge className={statusColor[t.status]}>{t.status}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ── TAB 3: Certifications ── */}
        <TabsContent value="certs" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">תעודות והסמכות חומרים</h2>
            <div className="flex gap-2 text-sm">
              <Badge className="bg-emerald-100 text-emerald-700">{certifications.filter(c => c.status === "בתוקף").length} בתוקף</Badge>
              <Badge className="bg-red-100 text-red-700">{certifications.filter(c => c.status === "פג תוקף").length} פג תוקף</Badge>
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 text-gray-600">
                    <tr>
                      <th className="p-3 text-right font-medium">מזהה</th>
                      <th className="p-3 text-right font-medium">חומר</th>
                      <th className="p-3 text-right font-medium">סוג תעודה</th>
                      <th className="p-3 text-right font-medium">גוף מנפיק</th>
                      <th className="p-3 text-right font-medium">תאריך הנפקה</th>
                      <th className="p-3 text-right font-medium">תוקף</th>
                      <th className="p-3 text-right font-medium">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {certifications.map(c => {
                      const isExpired = c.status === "פג תוקף";
                      return (
                        <tr key={c.id} className={isExpired ? "bg-red-50/40" : "hover:bg-gray-50"}>
                          <td className="p-3 font-mono text-xs">{c.id}</td>
                          <td className="p-3 font-medium">{c.material}</td>
                          <td className="p-3">{c.certType}</td>
                          <td className="p-3 flex items-center gap-1"><Building2 className="w-3 h-3 text-gray-400" />{c.issuer}</td>
                          <td className="p-3">{c.issued}</td>
                          <td className="p-3">{c.expiry}</td>
                          <td className="p-3"><Badge className={statusColor[c.status]}>{c.status}</Badge></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB 4: Non-Conformances ── */}
        <TabsContent value="ncr" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">דוחות אי-התאמה (NCR)</h2>
            <div className="flex gap-2 text-sm">
              <Badge className="bg-red-100 text-red-700">{ncrs.filter(n => n.status === "פתוח").length} פתוחים</Badge>
              <Badge className="bg-amber-100 text-amber-700">{ncrs.filter(n => n.status === "בטיפול").length} בטיפול</Badge>
              <Badge className="bg-slate-100 text-slate-600">{ncrs.filter(n => n.status === "נסגר").length} נסגרו</Badge>
            </div>
          </div>

          <div className="grid gap-3">
            {ncrs.map(n => (
              <Card key={n.id} className={n.severity === "קריטי" ? "border-red-300 bg-red-50/30" : n.severity === "משמעותי" ? "border-amber-200" : ""}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-sm">{n.id}</span>
                      <Badge className={statusColor[n.severity]}>{n.severity}</Badge>
                      <Badge className={statusColor[n.status]}>{n.status}</Badge>
                    </div>
                    <span className="text-xs text-gray-500 flex items-center gap-1"><Calendar className="w-3 h-3" />{n.date}</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                    <div>
                      <p className="text-gray-500 text-xs">חומר</p>
                      <p className="font-medium">{n.material}</p>
                    </div>
                    <div className="md:col-span-2">
                      <p className="text-gray-500 text-xs">תיאור</p>
                      <p>{n.desc}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm border-t pt-2">
                    <div>
                      <p className="text-gray-500 text-xs">אחראי טיפול</p>
                      <p className="flex items-center gap-1"><ClipboardList className="w-3 h-3 text-gray-400" />{n.assignee}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs">פעולה מתקנת</p>
                      <p>{n.action}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
