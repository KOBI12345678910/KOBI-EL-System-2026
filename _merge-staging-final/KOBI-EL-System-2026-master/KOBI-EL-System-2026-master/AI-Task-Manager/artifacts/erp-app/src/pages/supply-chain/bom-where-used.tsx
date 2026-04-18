import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Component, Share2, AlertTriangle, PackageX, ShieldAlert, ArrowUpDown, Layers, DollarSign, ChevronLeft } from "lucide-react";

const kpis = [
  { label: "סה\"כ רכיבים במעקב", value: 342, icon: Component, color: "text-blue-600", bg: "bg-blue-50" },
  { label: "רכיבים משותפים (3+ מוצרים)", value: 87, icon: Share2, color: "text-purple-600", bg: "bg-purple-50" },
  { label: "רכיבי מקור יחיד", value: 23, icon: ShieldAlert, color: "text-red-600", bg: "bg-red-50" },
  { label: "רכיבים קריטיים", value: 41, icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50" },
  { label: "רכיבים יתומים (ללא שימוש)", value: 5, icon: PackageX, color: "text-slate-500", bg: "bg-slate-50" },
];

const selectedComponent = "פרופיל אלומיניום 60x40";

const FALLBACK_WHEREUSEDDATA = [
  { product: "חלון ויטרינה 200x240", bomLevel: 1, qtyPerUnit: 4, totalDemand: 480, costPct: 18.5, substitutable: true },
  { product: "דלת כניסה מחוזקת TK-900", bomLevel: 1, qtyPerUnit: 2, totalDemand: 260, costPct: 12.3, substitutable: false },
  { product: "מחיצת זכוכית משרדית", bomLevel: 2, qtyPerUnit: 6, totalDemand: 720, costPct: 22.1, substitutable: true },
  { product: "פרגולה מאלומיניום 3x4", bomLevel: 1, qtyPerUnit: 8, totalDemand: 320, costPct: 31.4, substitutable: false },
  { product: "חלון הזזה תלת-מסלולי", bomLevel: 1, qtyPerUnit: 3, totalDemand: 390, costPct: 14.7, substitutable: true },
  { product: "ויטרינת חנות מסחרית", bomLevel: 2, qtyPerUnit: 10, totalDemand: 500, costPct: 26.8, substitutable: false },
  { product: "מעקה מרפסת דגם סהרה", bomLevel: 1, qtyPerUnit: 5, totalDemand: 350, costPct: 19.2, substitutable: true },
  { product: "תריס גלילה חשמלי", bomLevel: 3, qtyPerUnit: 2, totalDemand: 180, costPct: 8.9, substitutable: true },
];

const FALLBACK_SHAREDCOMPONENTS = [
  { name: "בורג נירוסטה M6x20", sku: "HW-BLT-0061", usedIn: 28, demand: 14200, suppliers: 5, avgPrice: 0.85, criticality: "נמוך" },
  { name: 'אטם EPDM 12 מ"מ', sku: "SL-EPD-0034", usedIn: 24, demand: 9600, suppliers: 3, avgPrice: 4.2, criticality: "בינוני" },
  { name: "פרופיל אלומיניום 60x40", sku: "AL-PRF-0012", usedIn: 18, demand: 3200, suppliers: 2, avgPrice: 48.5, criticality: "קריטי" },
  { name: 'זכוכית מחוסמת 6 מ"מ', sku: "GL-TMP-0008", usedIn: 16, demand: 2100, suppliers: 3, avgPrice: 125, criticality: "קריטי" },
  { name: 'ידית אלומיניום 160 מ"מ', sku: "HW-HND-0023", usedIn: 14, demand: 1800, suppliers: 4, avgPrice: 32, criticality: "בינוני" },
  { name: "ציר נסתר 3D", sku: "HW-HNG-0045", usedIn: 13, demand: 3900, suppliers: 2, avgPrice: 28.5, criticality: "גבוה" },
  { name: 'גלגלת הזזה 40 ק"ג', sku: "HW-WHL-0019", usedIn: 11, demand: 1650, suppliers: 3, avgPrice: 18.9, criticality: "בינוני" },
  { name: "פס הדבקה תרמי", sku: "SL-THR-0056", usedIn: 10, demand: 5200, suppliers: 4, avgPrice: 6.3, criticality: "נמוך" },
  { name: "פרופיל תרמי PA66", sku: "AL-THB-0003", usedIn: 9, demand: 2700, suppliers: 1, avgPrice: 22.4, criticality: "קריטי" },
  { name: "מנעול רב-נקודתי", sku: "HW-LCK-0078", usedIn: 9, demand: 1080, suppliers: 2, avgPrice: 145, criticality: "גבוה" },
  { name: 'סף אלומיניום 70 מ"מ', sku: "AL-SIL-0091", usedIn: 8, demand: 960, suppliers: 3, avgPrice: 38, criticality: "בינוני" },
  { name: "זכוכית Low-E כפולה", sku: "GL-LOW-0015", usedIn: 7, demand: 840, suppliers: 2, avgPrice: 210, criticality: "קריטי" },
  { name: "פינה חיבור פלדה", sku: "HW-CRN-0033", usedIn: 7, demand: 4200, suppliers: 5, avgPrice: 3.5, criticality: "נמוך" },
  { name: "רשת יתושים 18x16", sku: "AC-MSH-0042", usedIn: 6, demand: 720, suppliers: 3, avgPrice: 15.8, criticality: "נמוך" },
  { name: "אגוז ריתוך M8", sku: "HW-NUT-0088", usedIn: 6, demand: 7200, suppliers: 4, avgPrice: 1.2, criticality: "נמוך" },
];

const FALLBACK_DEPENDENCIES = [
  {
    component: "פרופיל תרמי PA66", sku: "AL-THB-0003",
    affectedProducts: ["חלון ויטרינה 200x240", "חלון הזזה תלת-מסלולי", "דלת כניסה מחוזקת TK-900"],
    impact: "קריטי", altAvailable: false, note: "ספק יחיד - Ensinger GmbH. אין חלופה מאושרת." },
  { component: 'זכוכית מחוסמת 6 מ"מ', sku: "GL-TMP-0008",
    affectedProducts: ["חלון ויטרינה 200x240", "מחיצת זכוכית משרדית", "ויטרינת חנות מסחרית", "מעקה מרפסת דגם סהרה"],
    impact: "גבוה", altAvailable: true, note: "חלופה זמינה מ-AGC Glass. זמן הסבה: 14 יום." },
  { component: "ציר נסתר 3D", sku: "HW-HNG-0045",
    affectedProducts: ["דלת כניסה מחוזקת TK-900", "חלון ויטרינה 200x240"],
    impact: "גבוה", altAvailable: true, note: "חלופה Dr. Hahn זמינה. דורש שינוי תבנית עיבוד." },
  { component: "מנעול רב-נקודתי", sku: "HW-LCK-0078",
    affectedProducts: ["דלת כניסה מחוזקת TK-900", "חלון הזזה תלת-מסלולי"],
    impact: "בינוני", altAvailable: true, note: "חלופה Winkhaus. תואם ללא שינוי." },
  { component: "פרופיל אלומיניום 60x40", sku: "AL-PRF-0012",
    affectedProducts: ["חלון ויטרינה 200x240", "דלת כניסה מחוזקת TK-900", "מחיצת זכוכית משרדית", "פרגולה מאלומיניום 3x4", "חלון הזזה תלת-מסלולי"],
    impact: "קריטי", altAvailable: true, note: "חלופה מ-קבוצת אלומיל. דורש אישור מהנדס." },
  { component: "זכוכית Low-E כפולה", sku: "GL-LOW-0015",
    affectedProducts: ["חלון ויטרינה 200x240", "חלון הזזה תלת-מסלולי", "ויטרינת חנות מסחרית"],
    impact: "בינוני", altAvailable: false, note: "שני ספקים פעילים. סיכון בינוני בשל ייבוא." },
];

const FALLBACK_ORPHANCOMPONENTS = [
  { name: 'ציר פרפר 80 מ"מ', sku: "HW-HNG-0012", lastUsedIn: "דלת פנים קלאסית דגם A", removedDate: "2025-11-20", stockOnHand: 340, value: 5440, action: "למכור" },
  { name: 'פרופיל T עגול 30 מ"מ', sku: "AL-PRF-0099", lastUsedIn: "מעקה ישן דגם ספיר", removedDate: "2025-08-15", stockOnHand: 120, value: 3960, action: "לגרוט" },
  { name: "ידית פליז עתיקה", sku: "HW-HND-0067", lastUsedIn: "חלון אנגלי דגם B", removedDate: "2026-01-10", stockOnHand: 85, value: 7650, action: "למכור" },
  { name: 'אטם סיליקון שחור 8 מ"מ', sku: "SL-SIL-0041", lastUsedIn: "ויטרינת תצוגה V1", removedDate: "2025-06-03", stockOnHand: 1200, value: 2160, action: "לארכב" },
  { name: 'זכוכית סבוכה 4 מ"מ', sku: "GL-PTN-0027", lastUsedIn: "מחיצת אמבטיה מיני", removedDate: "2026-02-28", stockOnHand: 45, value: 6750, action: "למכור" },
];

const impactBadge = (level: string) => {
  switch (level) {
    case "קריטי": return <Badge className="bg-red-500/20 text-red-700 border-red-200">קריטי</Badge>;
    case "גבוה": return <Badge className="bg-orange-500/20 text-orange-700 border-orange-200">גבוה</Badge>;
    case "בינוני": return <Badge className="bg-amber-500/20 text-amber-700 border-amber-200">בינוני</Badge>;
    case "נמוך": return <Badge className="bg-green-500/20 text-green-700 border-green-200">נמוך</Badge>;
    default: return <Badge variant="outline">{level}</Badge>;
  }
};

const actionBadge = (action: string) => {
  switch (action) {
    case "למכור": return <Badge className="bg-blue-500/20 text-blue-700 border-blue-200">למכור</Badge>;
    case "לגרוט": return <Badge className="bg-red-500/20 text-red-700 border-red-200">לגרוט</Badge>;
    case "לארכב": return <Badge className="bg-slate-500/20 text-slate-700 border-slate-200">לארכב</Badge>;
    default: return <Badge variant="outline">{action}</Badge>;
  }
};

export default function BomWhereUsedPage() {
  const { data: apiwhereUsedData } = useQuery({
    queryKey: ["/api/supply-chain/bom-where-used/whereuseddata"],
    queryFn: () => authFetch("/api/supply-chain/bom-where-used/whereuseddata").then(r => r.json()).catch(() => null),
  });
  const whereUsedData = Array.isArray(apiwhereUsedData) ? apiwhereUsedData : (apiwhereUsedData?.data ?? apiwhereUsedData?.items ?? FALLBACK_WHEREUSEDDATA);


  const { data: apisharedComponents } = useQuery({
    queryKey: ["/api/supply-chain/bom-where-used/sharedcomponents"],
    queryFn: () => authFetch("/api/supply-chain/bom-where-used/sharedcomponents").then(r => r.json()).catch(() => null),
  });
  const sharedComponents = Array.isArray(apisharedComponents) ? apisharedComponents : (apisharedComponents?.data ?? apisharedComponents?.items ?? FALLBACK_SHAREDCOMPONENTS);


  const { data: apidependencies } = useQuery({
    queryKey: ["/api/supply-chain/bom-where-used/dependencies"],
    queryFn: () => authFetch("/api/supply-chain/bom-where-used/dependencies").then(r => r.json()).catch(() => null),
  });
  const dependencies = Array.isArray(apidependencies) ? apidependencies : (apidependencies?.data ?? apidependencies?.items ?? FALLBACK_DEPENDENCIES);


  const { data: apiorphanComponents } = useQuery({
    queryKey: ["/api/supply-chain/bom-where-used/orphancomponents"],
    queryFn: () => authFetch("/api/supply-chain/bom-where-used/orphancomponents").then(r => r.json()).catch(() => null),
  });
  const orphanComponents = Array.isArray(apiorphanComponents) ? apiorphanComponents : (apiorphanComponents?.data ?? apiorphanComponents?.items ?? FALLBACK_ORPHANCOMPONENTS);

  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("where-used");

  const totalWhereUsedDemand = whereUsedData.reduce((s, r) => s + r.totalDemand, 0);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Layers className="h-7 w-7 text-indigo-600" />
            ניתוח היכן-בשימוש (Where-Used) - BOM
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            טכנו-כל עוזי | חיפוש הפוך ב-BOM - באילו מוצרים משמש כל רכיב
          </p>
        </div>
        <Button variant="outline" size="sm">
          <ArrowUpDown className="h-4 w-4 ml-1" /> ייצוא דו"ח
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-5 gap-4">
        {kpis.map((k, i) => (
          <Card key={i} className="relative overflow-hidden">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${k.bg}`}>
                  <k.icon className={`h-5 w-5 ${k.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground truncate">{k.label}</p>
                  <p className="text-2xl font-bold mt-0.5">{k.value.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search Bar */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            <Search className="h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="חיפוש רכיב לפי שם, מק״ט או קטגוריה..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="text-base"
            />
            <Button>חפש</Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="where-used">היכן בשימוש</TabsTrigger>
          <TabsTrigger value="shared">רכיבים משותפים</TabsTrigger>
          <TabsTrigger value="dependencies">ניתוח תלויות</TabsTrigger>
          <TabsTrigger value="orphans">רכיבים יתומים</TabsTrigger>
        </TabsList>

        {/* Tab 1: Where Used */}
        <TabsContent value="where-used" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Component className="h-5 w-5 text-indigo-600" />
                  רכיב נבחר: {selectedComponent}
                </CardTitle>
                <Badge className="bg-indigo-500/20 text-indigo-700 border-indigo-200">
                  {whereUsedData.length} מוצרים
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                מק"ט: AL-PRF-0012 | ביקוש חודשי כולל: {totalWhereUsedDemand.toLocaleString()} יח'
              </p>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">מוצר</TableHead>
                    <TableHead className="text-center">רמת BOM</TableHead>
                    <TableHead className="text-center">כמות ליחידה</TableHead>
                    <TableHead className="text-center">ביקוש חודשי</TableHead>
                    <TableHead className="text-center">% מעלות המוצר</TableHead>
                    <TableHead className="text-center">ניתן להחלפה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {whereUsedData.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{row.product}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline">רמה {row.bomLevel}</Badge>
                      </TableCell>
                      <TableCell className="text-center">{row.qtyPerUnit}</TableCell>
                      <TableCell className="text-center">{row.totalDemand.toLocaleString()}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center gap-2 justify-center">
                          <Progress value={row.costPct} className="w-16 h-2" />
                          <span className="text-sm">{row.costPct}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {row.substitutable
                          ? <Badge className="bg-green-500/20 text-green-700 border-green-200">כן</Badge>
                          : <Badge className="bg-red-500/20 text-red-700 border-red-200">לא</Badge>
                        }
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Shared Components */}
        <TabsContent value="shared" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Share2 className="h-5 w-5 text-purple-600" />
                  15 הרכיבים המשותפים ביותר
                </CardTitle>
                <Badge className="bg-purple-500/20 text-purple-700 border-purple-200">
                  87 רכיבים משותפים סה"כ
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">רכיב</TableHead>
                    <TableHead className="text-center">מק"ט</TableHead>
                    <TableHead className="text-center">במוצרים</TableHead>
                    <TableHead className="text-center">ביקוש חודשי</TableHead>
                    <TableHead className="text-center">ספקים</TableHead>
                    <TableHead className="text-center">מחיר ממוצע ₪</TableHead>
                    <TableHead className="text-center">קריטיות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sharedComponents.map((c, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-center font-mono text-xs">{c.sku}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="font-bold">{c.usedIn}</Badge>
                      </TableCell>
                      <TableCell className="text-center">{c.demand.toLocaleString()}</TableCell>
                      <TableCell className="text-center">{c.suppliers}</TableCell>
                      <TableCell className="text-center">₪{c.avgPrice.toFixed(2)}</TableCell>
                      <TableCell className="text-center">{impactBadge(c.criticality)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Dependency Analysis */}
        <TabsContent value="dependencies" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  ניתוח תלויות קריטיות
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  מה קורה אם רכיב X אינו זמין?
                </p>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {dependencies.map((dep, i) => (
                <Card key={i} className="border">
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-base">{dep.component}</span>
                          <span className="text-xs font-mono text-muted-foreground">{dep.sku}</span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">{dep.note}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {impactBadge(dep.impact)}
                        {dep.altAvailable
                          ? <Badge className="bg-green-500/20 text-green-700 border-green-200">חלופה זמינה</Badge>
                          : <Badge className="bg-red-500/20 text-red-700 border-red-200">אין חלופה</Badge>
                        }
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground">מוצרים מושפעים:</span>
                      {dep.affectedProducts.map((p, j) => (
                        <Badge key={j} variant="outline" className="text-xs">
                          <ChevronLeft className="h-3 w-3 ml-0.5" />{p}
                        </Badge>
                      ))}
                    </div>
                    <Progress
                      value={dep.impact === "קריטי" ? 95 : dep.impact === "גבוה" ? 70 : dep.impact === "בינוני" ? 45 : 20}
                      className="mt-3 h-1.5"
                    />
                  </CardContent>
                </Card>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Orphan Components */}
        <TabsContent value="orphans" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <PackageX className="h-5 w-5 text-slate-500" />
                  רכיבים יתומים - לא בשימוש ב-BOM פעיל
                </CardTitle>
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    שווי מלאי כולל: ₪{orphanComponents.reduce((s, o) => s + o.value, 0).toLocaleString()}
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">רכיב</TableHead>
                    <TableHead className="text-center">מק"ט</TableHead>
                    <TableHead className="text-right">שימוש אחרון ב-</TableHead>
                    <TableHead className="text-center">תאריך הסרה</TableHead>
                    <TableHead className="text-center">מלאי קיים</TableHead>
                    <TableHead className="text-center">שווי ₪</TableHead>
                    <TableHead className="text-center">פעולה מומלצת</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orphanComponents.map((o, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{o.name}</TableCell>
                      <TableCell className="text-center font-mono text-xs">{o.sku}</TableCell>
                      <TableCell>{o.lastUsedIn}</TableCell>
                      <TableCell className="text-center">{o.removedDate}</TableCell>
                      <TableCell className="text-center">{o.stockOnHand.toLocaleString()}</TableCell>
                      <TableCell className="text-center">₪{o.value.toLocaleString()}</TableCell>
                      <TableCell className="text-center">{actionBadge(o.action)}</TableCell>
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
