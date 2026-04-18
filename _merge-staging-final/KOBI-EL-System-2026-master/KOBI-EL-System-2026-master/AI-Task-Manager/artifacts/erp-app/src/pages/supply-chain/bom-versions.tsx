import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  GitBranch, FileText, Clock, CheckCircle2, AlertTriangle, Search,
  Plus, Minus, ArrowLeftRight, User, Calendar, Shield, ChevronLeft, ChevronRight
} from "lucide-react";
import { useState } from "react";

const kpis = [
  { label: "סה\"כ גרסאות", value: 47, icon: GitBranch, color: "text-blue-600", bg: "bg-blue-50" },
  { label: "גרסאות פעילות", value: 28, icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50" },
  { label: "ממתינות לאישור", value: 6, icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
  { label: "ממוצע רוויזיות ל-BOM", value: 3.8, icon: FileText, color: "text-purple-600", bg: "bg-purple-50" },
  { label: "קונפליקטים בגרסאות", value: 2, icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50" },
];

const FALLBACK_ACTIVEBOMS = [
  { id: "BOM-001", product: "חלון אלומיניום 120x150", version: "v2.3", status: "active", createdBy: "עוזי כהן", createdDate: "2026-01-15", approvedBy: "משה לוי", effectiveDate: "2026-02-01", components: 14, cost: 1250 },
  { id: "BOM-002", product: "דלת הזזה זכוכית כפולה", version: "v1.8", status: "active", createdBy: "דנה רותם", createdDate: "2026-02-10", approvedBy: "עוזי כהן", effectiveDate: "2026-03-01", components: 22, cost: 3400 },
  { id: "BOM-003", product: "מעקה אלומיניום מרפסת", version: "v3.1", status: "active", createdBy: "יוסי אברהם", createdDate: "2025-11-20", approvedBy: "דנה רותם", effectiveDate: "2025-12-15", components: 9, cost: 870 },
  { id: "BOM-004", product: "ויטרינה חנות 200x250", version: "v1.2", status: "draft", createdBy: "משה לוי", createdDate: "2026-03-28", approvedBy: "-", effectiveDate: "-", components: 18, cost: 4200 },
  { id: "BOM-005", product: "תריס גלילה חשמלי", version: "v2.0", status: "active", createdBy: "עוזי כהן", createdDate: "2026-01-05", approvedBy: "יוסי אברהם", effectiveDate: "2026-01-20", components: 16, cost: 1680 },
  { id: "BOM-006", product: "פרופיל תרמי 60mm", version: "v4.2", status: "active", createdBy: "דנה רותם", createdDate: "2025-09-12", approvedBy: "משה לוי", effectiveDate: "2025-10-01", components: 7, cost: 520 },
  { id: "BOM-007", product: "דלת כניסה מעוצבת", version: "v1.5", status: "archived", createdBy: "יוסי אברהם", createdDate: "2025-06-18", approvedBy: "עוזי כהן", effectiveDate: "2025-07-01", components: 25, cost: 5100 },
  { id: "BOM-008", product: "חלון ציר עליון", version: "v2.1", status: "active", createdBy: "משה לוי", createdDate: "2026-02-22", approvedBy: "דנה רותם", effectiveDate: "2026-03-10", components: 11, cost: 980 },
  { id: "BOM-009", product: "מחיצת זכוכית משרדית", version: "v1.0", status: "draft", createdBy: "עוזי כהן", createdDate: "2026-04-01", approvedBy: "-", effectiveDate: "-", components: 13, cost: 2750 },
  { id: "BOM-010", product: "חיפוי אלומיניום חזית", version: "v3.0", status: "active", createdBy: "דנה רותם", createdDate: "2025-12-08", approvedBy: "יוסי אברהם", effectiveDate: "2026-01-01", components: 20, cost: 6300 },
  { id: "BOM-011", product: "סורג ביטחון דקורטיבי", version: "v1.3", status: "active", createdBy: "יוסי אברהם", createdDate: "2026-03-05", approvedBy: "משה לוי", effectiveDate: "2026-03-20", components: 8, cost: 640 },
  { id: "BOM-012", product: "פרגולת אלומיניום 3x4", version: "v2.5", status: "active", createdBy: "משה לוי", createdDate: "2026-01-28", approvedBy: "עוזי כהן", effectiveDate: "2026-02-15", components: 17, cost: 4800 },
];

const FALLBACK_CHANGEHISTORY = [
  { id: 1, bom: "BOM-001", version: "v2.3", date: "2026-03-28", author: "עוזי כהן", type: "quantity", desc: "עדכון כמות אטמי EPDM מ-4 ל-6 יחידות", approval: "approved" },
  { id: 2, bom: "BOM-002", version: "v1.8", date: "2026-03-25", author: "דנה רותם", type: "added", desc: "הוספת מנגנון נעילה רב-נקודתי", approval: "approved" },
  { id: 3, bom: "BOM-004", version: "v1.2", date: "2026-03-22", author: "משה לוי", type: "substitution", desc: "החלפת זכוכית 6mm בזכוכית מחוסמת 8mm", approval: "pending" },
  { id: 4, bom: "BOM-005", version: "v2.0", date: "2026-03-18", author: "עוזי כהן", type: "removed", desc: "הסרת ידית חיצונית - עדכון לדגם שקוע", approval: "approved" },
  { id: 5, bom: "BOM-010", version: "v3.0", date: "2026-03-15", author: "דנה רותם", type: "added", desc: "הוספת שכבת בידוד תרמי 40mm", approval: "approved" },
  { id: 6, bom: "BOM-003", version: "v3.1", date: "2026-03-12", author: "יוסי אברהם", type: "quantity", desc: "הגדלת כמות עמודי תמיכה מ-3 ל-5", approval: "approved" },
  { id: 7, bom: "BOM-012", version: "v2.5", date: "2026-03-10", author: "משה לוי", type: "substitution", desc: "החלפת ברגים נירוסטה 304 ל-316 לעמידות", approval: "approved" },
  { id: 8, bom: "BOM-006", version: "v4.2", date: "2026-03-08", author: "דנה רותם", type: "added", desc: "הוספת גשר תרמי פוליאמיד", approval: "approved" },
  { id: 9, bom: "BOM-008", version: "v2.1", date: "2026-03-05", author: "משה לוי", type: "quantity", desc: "שינוי עובי פרופיל מ-1.4mm ל-1.6mm", approval: "approved" },
  { id: 10, bom: "BOM-009", version: "v1.0", date: "2026-03-02", author: "עוזי כהן", type: "added", desc: "הוספת מערכת תליה עליונה", approval: "pending" },
  { id: 11, bom: "BOM-011", version: "v1.3", date: "2026-02-28", author: "יוסי אברהם", type: "removed", desc: "הסרת חיזוק פינתי ישן - מוחלף בריתוך", approval: "approved" },
  { id: 12, bom: "BOM-001", version: "v2.2", date: "2026-02-20", author: "עוזי כהן", type: "substitution", desc: "החלפת ספק ציר - מ-Roto ל-Siegenia", approval: "approved" },
  { id: 13, bom: "BOM-002", version: "v1.7", date: "2026-02-15", author: "דנה רותם", type: "quantity", desc: "הוספת גלגלת נוספת למסילה תחתונה", approval: "approved" },
  { id: 14, bom: "BOM-005", version: "v1.9", date: "2026-02-10", author: "עוזי כהן", type: "added", desc: "הוספת חיישן רוח אוטומטי", approval: "approved" },
  { id: 15, bom: "BOM-010", version: "v2.9", date: "2026-02-05", author: "דנה רותם", type: "removed", desc: "הסרת רווחים פנימיים - עדכון לחיתוך רציף", approval: "approved" },
];

const FALLBACK_COMPARISONOLD = [
  { component: "פרופיל אלומיניום ראשי", qty: 4, unit: "מ'", cost: 280, status: "unchanged" },
  { component: "זכוכית בידודית 24mm", qty: 2, unit: "יח'", cost: 450, status: "modified" },
  { component: "אטם EPDM שחור", qty: 4, unit: "מ'", cost: 32, status: "modified" },
  { component: "ציר Roto NT", qty: 2, unit: "יח'", cost: 120, status: "removed" },
  { component: "ידית Hoppe Secustik", qty: 1, unit: "יח'", cost: 85, status: "unchanged" },
  { component: "בורג הידוק 4x30", qty: 16, unit: "יח'", cost: 8, status: "unchanged" },
  { component: "עוגן קיר 10mm", qty: 4, unit: "יח'", cost: 24, status: "unchanged" },
  { component: "סיליקון UV", qty: 1, unit: "שפ'", cost: 35, status: "unchanged" },
];

const FALLBACK_COMPARISONNEW = [
  { component: "פרופיל אלומיניום ראשי", qty: 4, unit: "מ'", cost: 280, status: "unchanged" },
  { component: "זכוכית בידודית 28mm", qty: 2, unit: "יח'", cost: 520, status: "modified" },
  { component: "אטם EPDM שחור", qty: 6, unit: "מ'", cost: 48, status: "modified" },
  { component: "ציר Siegenia Titan", qty: 2, unit: "יח'", cost: 145, status: "added" },
  { component: "ידית Hoppe Secustik", qty: 1, unit: "יח'", cost: 85, status: "unchanged" },
  { component: "בורג הידוק 4x30", qty: 16, unit: "יח'", cost: 8, status: "unchanged" },
  { component: "עוגן קיר 10mm", qty: 4, unit: "יח'", cost: 24, status: "unchanged" },
  { component: "סיליקון UV", qty: 1, unit: "שפ'", cost: 35, status: "unchanged" },
  { component: "רצועת בידוד תרמי", qty: 4, unit: "מ'", cost: 56, status: "added" },
  { component: "פס ניקוז פנימי", qty: 2, unit: "מ'", cost: 18, status: "added" },
  { component: "כיסוי ציר דקורטיבי", qty: 2, unit: "יח'", cost: 30, status: "added" },
];

const FALLBACK_PENDINGAPPROVALS = [
  { id: 1, bom: "BOM-004", product: "ויטרינה חנות 200x250", version: "v1.2", submitter: "משה לוי", submitted: "2026-03-28", reviewer: "עוזי כהן", summary: "החלפת זכוכית 6mm בזכוכית מחוסמת 8mm, עדכון עלות" },
  { id: 2, bom: "BOM-009", product: "מחיצת זכוכית משרדית", version: "v1.0", submitter: "עוזי כהן", submitted: "2026-04-01", reviewer: "דנה רותם", summary: "גרסה ראשונית - 13 רכיבים, מערכת תליה עליונה" },
  { id: 3, bom: "BOM-002", product: "דלת הזזה זכוכית כפולה", version: "v1.9", submitter: "דנה רותם", submitted: "2026-04-03", reviewer: "יוסי אברהם", summary: "הוספת מנגנון בלימה רכה ועדכון מסילות" },
  { id: 4, bom: "BOM-006", product: "פרופיל תרמי 60mm", version: "v4.3", submitter: "יוסי אברהם", submitted: "2026-04-05", reviewer: "משה לוי", summary: "שדרוג גשר תרמי לפוליאמיד מחוזק 25%" },
  { id: 5, bom: "BOM-011", product: "סורג ביטחון דקורטיבי", version: "v1.4", submitter: "משה לוי", submitted: "2026-04-06", reviewer: "עוזי כהן", summary: "הוספת ציפוי אנודייז בגוון ברונזה" },
  { id: 6, bom: "BOM-001", product: "חלון אלומיניום 120x150", version: "v2.4", submitter: "עוזי כהן", submitted: "2026-04-07", reviewer: "דנה רותם", summary: "עדכון כמויות ברגים ואטמים, תוספת פס ניקוז" },
];

const statusBadge = (status: string) => {
  switch (status) {
    case "active": return <Badge className="bg-green-500/15 text-green-700 border-green-200">פעיל</Badge>;
    case "draft": return <Badge className="bg-amber-500/15 text-amber-700 border-amber-200">טיוטה</Badge>;
    case "archived": return <Badge className="bg-gray-500/15 text-gray-600 border-gray-200">בארכיון</Badge>;
    default: return null;
  }
};

const changeTypeBadge = (type: string) => {
  switch (type) {
    case "added": return <Badge className="bg-green-500/15 text-green-700"><Plus className="h-3 w-3 ml-1" />הוספה</Badge>;
    case "removed": return <Badge className="bg-red-500/15 text-red-700"><Minus className="h-3 w-3 ml-1" />הסרה</Badge>;
    case "quantity": return <Badge className="bg-amber-500/15 text-amber-700"><ArrowLeftRight className="h-3 w-3 ml-1" />שינוי כמות</Badge>;
    case "substitution": return <Badge className="bg-blue-500/15 text-blue-700"><ArrowLeftRight className="h-3 w-3 ml-1" />החלפה</Badge>;
    default: return null;
  }
};

const approvalBadge = (status: string) => {
  switch (status) {
    case "approved": return <Badge className="bg-green-500/15 text-green-700">מאושר</Badge>;
    case "pending": return <Badge className="bg-amber-500/15 text-amber-700">ממתין</Badge>;
    case "rejected": return <Badge className="bg-red-500/15 text-red-700">נדחה</Badge>;
    default: return null;
  }
};

export default function BomVersionsPage() {
  const { data: apiactiveBoms } = useQuery({
    queryKey: ["/api/supply-chain/bom-versions/activeboms"],
    queryFn: () => authFetch("/api/supply-chain/bom-versions/activeboms").then(r => r.json()).catch(() => null),
  });
  const activeBoms = Array.isArray(apiactiveBoms) ? apiactiveBoms : (apiactiveBoms?.data ?? apiactiveBoms?.items ?? FALLBACK_ACTIVEBOMS);


  const { data: apichangeHistory } = useQuery({
    queryKey: ["/api/supply-chain/bom-versions/changehistory"],
    queryFn: () => authFetch("/api/supply-chain/bom-versions/changehistory").then(r => r.json()).catch(() => null),
  });
  const changeHistory = Array.isArray(apichangeHistory) ? apichangeHistory : (apichangeHistory?.data ?? apichangeHistory?.items ?? FALLBACK_CHANGEHISTORY);


  const { data: apicomparisonOld } = useQuery({
    queryKey: ["/api/supply-chain/bom-versions/comparisonold"],
    queryFn: () => authFetch("/api/supply-chain/bom-versions/comparisonold").then(r => r.json()).catch(() => null),
  });
  const comparisonOld = Array.isArray(apicomparisonOld) ? apicomparisonOld : (apicomparisonOld?.data ?? apicomparisonOld?.items ?? FALLBACK_COMPARISONOLD);


  const { data: apicomparisonNew } = useQuery({
    queryKey: ["/api/supply-chain/bom-versions/comparisonnew"],
    queryFn: () => authFetch("/api/supply-chain/bom-versions/comparisonnew").then(r => r.json()).catch(() => null),
  });
  const comparisonNew = Array.isArray(apicomparisonNew) ? apicomparisonNew : (apicomparisonNew?.data ?? apicomparisonNew?.items ?? FALLBACK_COMPARISONNEW);


  const { data: apipendingApprovals } = useQuery({
    queryKey: ["/api/supply-chain/bom-versions/pendingapprovals"],
    queryFn: () => authFetch("/api/supply-chain/bom-versions/pendingapprovals").then(r => r.json()).catch(() => null),
  });
  const pendingApprovals = Array.isArray(apipendingApprovals) ? apipendingApprovals : (apipendingApprovals?.data ?? apipendingApprovals?.items ?? FALLBACK_PENDINGAPPROVALS);

  const [search, setSearch] = useState("");

  const filteredBoms = activeBoms.filter(b =>
    b.product.includes(search) || b.id.includes(search) || b.version.includes(search)
  );

  const oldTotal = comparisonOld.reduce((s, c) => s + c.cost, 0);
  const newTotal = comparisonNew.reduce((s, c) => s + c.cost, 0);
  const costDelta = newTotal - oldTotal;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <GitBranch className="h-7 w-7 text-blue-600" /> ניהול גרסאות BOM - טכנו-כל עוזי
        </h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="חיפוש BOM, מוצר, גרסה..."
              className="pr-9 w-64"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button className="bg-blue-600 hover:bg-blue-700">
            <Plus className="h-4 w-4 ml-1" /> גרסה חדשה
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-5 gap-4">
        {kpis.map((k, i) => (
          <Card key={i} className="border-0 shadow-sm">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-lg ${k.bg}`}>
                  <k.icon className={`h-5 w-5 ${k.color}`} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{k.label}</p>
                  <p className="text-2xl font-bold">{k.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="active" className="space-y-4">
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="active">גרסאות פעילות</TabsTrigger>
          <TabsTrigger value="history">היסטוריית שינויים</TabsTrigger>
          <TabsTrigger value="compare">השוואת גרסאות</TabsTrigger>
          <TabsTrigger value="approvals">אישורים ({pendingApprovals.length})</TabsTrigger>
        </TabsList>

        {/* Tab 1: Active Versions */}
        <TabsContent value="active">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" /> גרסאות פעילות ({filteredBoms.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right font-semibold">מזהה</TableHead>
                    <TableHead className="text-right font-semibold">מוצר</TableHead>
                    <TableHead className="text-right font-semibold">גרסה</TableHead>
                    <TableHead className="text-right font-semibold">סטטוס</TableHead>
                    <TableHead className="text-right font-semibold">נוצר ע\"י</TableHead>
                    <TableHead className="text-right font-semibold">תאריך יצירה</TableHead>
                    <TableHead className="text-right font-semibold">אושר ע\"י</TableHead>
                    <TableHead className="text-right font-semibold">תאריך תוקף</TableHead>
                    <TableHead className="text-right font-semibold">רכיבים</TableHead>
                    <TableHead className="text-right font-semibold">עלות כוללת</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBoms.map((bom) => (
                    <TableRow key={bom.id} className="hover:bg-muted/30 cursor-pointer">
                      <TableCell className="font-mono text-sm font-medium text-blue-600">{bom.id}</TableCell>
                      <TableCell className="font-medium">{bom.product}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono">{bom.version}</Badge>
                      </TableCell>
                      <TableCell>{statusBadge(bom.status)}</TableCell>
                      <TableCell className="flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 text-muted-foreground" />{bom.createdBy}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{bom.createdDate}</TableCell>
                      <TableCell>{bom.approvedBy}</TableCell>
                      <TableCell className="text-muted-foreground">{bom.effectiveDate}</TableCell>
                      <TableCell className="text-center">{bom.components}</TableCell>
                      <TableCell className="font-semibold">{bom.cost.toLocaleString()} &#8362;</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Change History */}
        <TabsContent value="history">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="h-5 w-5 text-amber-600" /> היסטוריית שינויים
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <div className="absolute right-4 top-0 bottom-0 w-0.5 bg-border" />
                <div className="space-y-4">
                  {changeHistory.map((ch) => (
                    <div key={ch.id} className="relative pr-10">
                      <div className="absolute right-2.5 top-2 w-3.5 h-3.5 rounded-full border-2 border-blue-500 bg-white z-10" />
                      <Card className="border shadow-sm">
                        <CardContent className="py-3 px-4">
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="font-mono text-xs">{ch.bom}</Badge>
                              <Badge variant="outline" className="font-mono text-xs">{ch.version}</Badge>
                              {changeTypeBadge(ch.type)}
                            </div>
                            <div className="flex items-center gap-3 text-sm text-muted-foreground">
                              {approvalBadge(ch.approval)}
                              <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{ch.date}</span>
                            </div>
                          </div>
                          <p className="text-sm">{ch.desc}</p>
                          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                            <User className="h-3 w-3" />{ch.author}
                          </p>
                        </CardContent>
                      </Card>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Version Comparison */}
        <TabsContent value="compare">
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <ArrowLeftRight className="h-5 w-5 text-purple-600" /> השוואת גרסאות - חלון אלומיניום 120x150
                  </CardTitle>
                  <div className="flex items-center gap-2 text-sm">
                    <Badge variant="outline" className="font-mono">v2.2</Badge>
                    <ChevronLeft className="h-4 w-4" />
                    <ChevronRight className="h-4 w-4" />
                    <Badge variant="outline" className="font-mono bg-blue-50">v2.3</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="grid grid-cols-2 divide-x divide-border">
                  {/* Old Version */}
                  <div>
                    <div className="px-4 py-2 bg-muted/40 border-b font-semibold text-sm">
                      גרסה v2.2 (ישנה) - {oldTotal.toLocaleString()} &#8362;
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right">רכיב</TableHead>
                          <TableHead className="text-right">כמות</TableHead>
                          <TableHead className="text-right">עלות</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {comparisonOld.map((c, i) => (
                          <TableRow key={i} className={
                            c.status === "removed" ? "bg-red-50 line-through text-red-600" :
                            c.status === "modified" ? "bg-amber-50" : ""
                          }>
                            <TableCell className="text-sm">{c.component}</TableCell>
                            <TableCell className="text-sm">{c.qty} {c.unit}</TableCell>
                            <TableCell className="text-sm">{c.cost} &#8362;</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {/* New Version */}
                  <div>
                    <div className="px-4 py-2 bg-blue-50 border-b font-semibold text-sm">
                      גרסה v2.3 (חדשה) - {newTotal.toLocaleString()} &#8362;
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right">רכיב</TableHead>
                          <TableHead className="text-right">כמות</TableHead>
                          <TableHead className="text-right">עלות</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {comparisonNew.map((c, i) => (
                          <TableRow key={i} className={
                            c.status === "added" ? "bg-green-50 text-green-700 font-medium" :
                            c.status === "modified" ? "bg-amber-50" : ""
                          }>
                            <TableCell className="text-sm">{c.component}</TableCell>
                            <TableCell className="text-sm">{c.qty} {c.unit}</TableCell>
                            <TableCell className="text-sm">{c.cost} &#8362;</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Comparison Summary */}
            <div className="grid grid-cols-4 gap-4">
              <Card className="border-green-200 bg-green-50/50">
                <CardContent className="py-3 px-4 flex items-center gap-3">
                  <Plus className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="text-xs text-muted-foreground">רכיבים שנוספו</p>
                    <p className="text-xl font-bold text-green-700">+3</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-red-200 bg-red-50/50">
                <CardContent className="py-3 px-4 flex items-center gap-3">
                  <Minus className="h-5 w-5 text-red-600" />
                  <div>
                    <p className="text-xs text-muted-foreground">רכיבים שהוסרו</p>
                    <p className="text-xl font-bold text-red-700">-1</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-amber-200 bg-amber-50/50">
                <CardContent className="py-3 px-4 flex items-center gap-3">
                  <ArrowLeftRight className="h-5 w-5 text-amber-600" />
                  <div>
                    <p className="text-xs text-muted-foreground">רכיבים שהשתנו</p>
                    <p className="text-xl font-bold text-amber-700">4</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-blue-200 bg-blue-50/50">
                <CardContent className="py-3 px-4 flex items-center gap-3">
                  <FileText className="h-5 w-5 text-blue-600" />
                  <div>
                    <p className="text-xs text-muted-foreground">הפרש עלות</p>
                    <p className="text-xl font-bold text-blue-700">{costDelta > 0 ? "+" : ""}{costDelta.toLocaleString()} &#8362;</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Cost Comparison Progress */}
            <Card>
              <CardContent className="py-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">שינוי עלות כולל</span>
                  <span className="text-sm text-muted-foreground">{oldTotal.toLocaleString()} &#8362; &larr; {newTotal.toLocaleString()} &#8362;</span>
                </div>
                <Progress value={Math.min((newTotal / oldTotal) * 100, 100)} className="h-3" />
                <p className="text-xs text-muted-foreground mt-1.5">
                  עלייה של {((costDelta / oldTotal) * 100).toFixed(1)}% בעלות הכוללת
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 4: Approvals */}
        <TabsContent value="approvals">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="h-5 w-5 text-blue-600" /> אישורים ממתינים ({pendingApprovals.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {pendingApprovals.map((a) => (
                  <Card key={a.id} className="border shadow-sm">
                    <CardContent className="py-4 px-5">
                      <div className="flex items-start justify-between">
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="font-mono text-xs">{a.bom}</Badge>
                            <Badge variant="outline" className="font-mono text-xs bg-blue-50">{a.version}</Badge>
                            <span className="font-medium">{a.product}</span>
                          </div>
                          <p className="text-sm text-muted-foreground">{a.summary}</p>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1"><User className="h-3 w-3" /> הוגש ע"י: {a.submitter}</span>
                            <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {a.submitted}</span>
                            <span className="flex items-center gap-1"><Shield className="h-3 w-3" /> סוקר: {a.reviewer}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mr-4">
                          <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white">
                            <CheckCircle2 className="h-4 w-4 ml-1" /> אשר
                          </Button>
                          <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50">
                            <AlertTriangle className="h-4 w-4 ml-1" /> דחה
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
