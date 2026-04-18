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
import {
  Calculator, Layers, TrendingUp, TrendingDown, DollarSign, BarChart3, Package,
  Factory, Zap, ChevronDown, ChevronLeft, Search, RefreshCw, ArrowUpRight,
  ArrowDownRight, Minus, FlaskConical, AlertTriangle, CheckCircle2
} from "lucide-react";

const fmt = (n: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(n);
const fmtDec = (n: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const kpis = [
  { label: "שווי BOM כולל", value: 4_287_500, icon: DollarSign, color: "text-blue-600", bg: "bg-blue-50", suffix: "" },
  { label: "עלות מוצר ממוצעת", value: 428_750, icon: Calculator, color: "text-emerald-600", bg: "bg-emerald-50", suffix: "" },
  { label: "אחוז חומרי גלם", value: 62, icon: Package, color: "text-amber-600", bg: "bg-amber-50", suffix: "%" },
  { label: "אחוז עבודה", value: 25, icon: Factory, color: "text-purple-600", bg: "bg-purple-50", suffix: "%" },
  { label: "אחוז תקורה", value: 13, icon: Zap, color: "text-rose-600", bg: "bg-rose-50", suffix: "%" },
  { label: "סטיית עלות מתקציב", value: -3.2, icon: TrendingDown, color: "text-green-600", bg: "bg-green-50", suffix: "%" },
];

type Level = { level: number; desc: string; cost: number; type?: string };
type Product = { id: string; name: string; totalCost: number; levels: Level[]; material: number; labor: number; overhead: number; weight: number };

const L = (level: number, desc: string, cost: number, type?: string): Level => ({ level, desc, cost, type });
const FALLBACK_PRODUCTS: Product[] = [
  { id: "PRD-001", name: "חלון אלומיניום 120x150", totalCost: 1845, material: 1145, labor: 345, overhead: 200, weight: 32,
    levels: [L(0,"מוצר מוגמר - חלון 120x150",1845), L(1,"מסגרת אלומיניום מורכבת",720,"sub"), L(1,"יחידת זיגוג כפול",580,"sub"), L(1,"עבודת הרכבה וגימור",345,"labor"), L(1,"תקורה (אנרגיה, מתקן)",200,"overhead"), L(2,"פרופיל אלומיניום 6063-T5",385,"comp"), L(2,"אטמי EPDM",95,"comp"), L(2,"זכוכית מחוסמת 6mm",420,"comp"), L(2,"פרזול ציר נירוסטה",160,"comp"), L(3,"מטיל אלומיניום גולמי",210,"raw"), L(3,"חול סיליקה לזכוכית",85,"raw"), L(3,"גומי EPDM גולמי",42,"raw")] },
  { id: "PRD-002", name: "דלת כניסה מפלדה+זכוכית", totalCost: 3420, material: 2130, labor: 890, overhead: 400, weight: 68,
    levels: [L(0,"מוצר מוגמר - דלת כניסה",3420), L(1,"מסגרת פלדה מרותכת",1280,"sub"), L(1,"פאנל זכוכית דקורטיבי",850,"sub"), L(1,"עבודה (חיתוך, ריתוך, הרכבה)",890,"labor"), L(1,"תקורה",400,"overhead"), L(2,"פלדת ST37 לוח 3mm",620,"comp"), L(2,"זכוכית טריפלקס 8mm",580,"comp"), L(2,"מנעול רב-בריחי",340,"comp"), L(3,"גליל פלדה חמה",380,"raw"), L(3,"זכוכית שטוחה גולמית",290,"raw")] },
  { id: "PRD-003", name: "מעקה אלומיניום למרפסת", totalCost: 2150, material: 1470, labor: 420, overhead: 260, weight: 28,
    levels: [L(0,"מוצר מוגמר - מעקה מרפסת",2150), L(1,"עמודים ומאחז יד",820,"sub"), L(1,"מילוי זכוכית מחוסמת",650,"sub"), L(1,"עבודה",420,"labor"), L(1,"תקורה",260,"overhead"), L(2,"צינור אלומיניום עגול 50mm",340,"comp"), L(2,"זכוכית מחוסמת 10mm",510,"comp"), L(3,"מטיל אלומיניום",185,"raw")] },
  { id: "PRD-004", name: "ויטרינה חנות 300x250", totalCost: 5890, material: 4050, labor: 1240, overhead: 600, weight: 95,
    levels: [L(0,"מוצר מוגמר - ויטרינה",5890), L(1,"מסגרת אלומיניום כבדה",1950,"sub"), L(1,"זיגוג בטיחותי כפול",2100,"sub"), L(1,"עבודה",1240,"labor"), L(1,"תקורה",600,"overhead"), L(2,"פרופיל אלומיניום 6082",980,"comp"), L(2,"זכוכית למינציה 12mm",1620,"comp"), L(3,"מטיל אלומיניום מיוחד",520,"raw")] },
  { id: "PRD-005", name: "תריס הזזה חשמלי", totalCost: 2780, material: 1600, labor: 730, overhead: 450, weight: 22,
    levels: [L(0,"מוצר מוגמר - תריס הזזה",2780), L(1,"שלדת תריס אלומיניום",920,"sub"), L(1,"מנוע חשמלי + בקר",680,"sub"), L(1,"עבודה",730,"labor"), L(1,"תקורה",450,"overhead"), L(2,"למלות אלומיניום",480,"comp"), L(2,"מנוע טיובולרי Somfy",520,"comp"), L(3,"מטיל אלומיניום",260,"raw")] },
  { id: "PRD-006", name: "מחיצת משרד זכוכית", totalCost: 4320, material: 3030, labor: 890, overhead: 400, weight: 54,
    levels: [L(0,"מוצר מוגמר - מחיצת משרד",4320), L(1,"מסגרת אלומיניום דקה",1180,"sub"), L(1,"פאנלי זכוכית מזג",1850,"sub"), L(1,"עבודה",890,"labor"), L(1,"תקורה",400,"overhead"), L(2,"פרופיל מינימלי 30mm",560,"comp"), L(2,"זכוכית 10mm סאטן",1420,"comp"), L(3,"מטיל אלומיניום",295,"raw")] },
  { id: "PRD-007", name: "שער חניה אוטומטי", totalCost: 6250, material: 3450, labor: 1800, overhead: 1000, weight: 120,
    levels: [L(0,"מוצר מוגמר - שער חניה",6250), L(1,"שלדת פלדה מגולוונת",2100,"sub"), L(1,"מערכת הנעה + שלט",1350,"sub"), L(1,"עבודה",1800,"labor"), L(1,"תקורה",1000,"overhead"), L(2,"פלדה מגולוונת 2mm",1280,"comp"), L(2,"מנוע תעשייתי 1HP",950,"comp"), L(3,"גליל פלדה",780,"raw")] },
  { id: "PRD-008", name: "חיפוי קיר ACP", totalCost: 3150, material: 2260, labor: 540, overhead: 350, weight: 18,
    levels: [L(0,"מוצר מוגמר - חיפוי ACP",3150), L(1,"פאנלי ACP מעוצבים",1680,"sub"), L(1,"תת-מסגרת אלומיניום",580,"sub"), L(1,"עבודה",540,"labor"), L(1,"תקורה",350,"overhead"), L(2,"לוח ACP 4mm",1120,"comp"), L(2,"פרופילי תלייה",380,"comp"), L(3,"אלומיניום גולמי + PE",620,"raw")] },
  { id: "PRD-009", name: "פרגולה אלומיניום 4x3", totalCost: 8450, material: 4750, labor: 2200, overhead: 1500, weight: 145,
    levels: [L(0,"מוצר מוגמר - פרגולה",8450), L(1,"עמודים וקורות ראשיות",2800,"sub"), L(1,"למלות מתכווננות",1950,"sub"), L(1,"עבודה",2200,"labor"), L(1,"תקורה",1500,"overhead"), L(2,"פרופיל אלומיניום 100x100",1680,"comp"), L(2,"למלות סיבוביות 200mm",1450,"comp"), L(3,"מטיל אלומיניום כבד",920,"raw")] },
  { id: "PRD-010", name: "דלת הזזה פנורמית", totalCost: 4680, material: 3100, labor: 980, overhead: 600, weight: 78,
    levels: [L(0,"מוצר מוגמר - דלת פנורמית",4680), L(1,"מסגרת ומסילה אלומיניום",1520,"sub"), L(1,"זיגוג פנורמי",1580,"sub"), L(1,"עבודה",980,"labor"), L(1,"תקורה",600,"overhead"), L(2,"מערכת מסילה כפולה",680,"comp"), L(2,"זכוכית מחוסמת 8mm",1240,"comp"), L(3,"אלומיניום + זכוכית גולמית",520,"raw")] },
];

const FALLBACK_TOPCOMPONENTS = [
  { name: "זכוכית למינציה 12mm", usage: 48, unitCost: 1620, total: 77760 },
  { name: "לוח ACP 4mm", usage: 55, unitCost: 1120, total: 61600 },
  { name: "פרופיל אלומיניום 100x100", usage: 32, unitCost: 1680, total: 53760 },
  { name: "זכוכית 10mm סאטן", usage: 38, unitCost: 1420, total: 53960 },
  { name: "פלדה מגולוונת 2mm", usage: 40, unitCost: 1280, total: 51200 },
  { name: "פרופיל אלומיניום 6063-T5", usage: 120, unitCost: 385, total: 46200 },
  { name: "זכוכית מחוסמת 10mm", usage: 85, unitCost: 510, total: 43350 },
  { name: "מנוע טיובולרי Somfy", usage: 65, unitCost: 520, total: 33800 },
  { name: "מנעול רב-בריחי", usage: 90, unitCost: 340, total: 30600 },
  { name: "מנוע תעשייתי 1HP", usage: 25, unitCost: 950, total: 23750 },
];

const FALLBACK_COSTPERKG = [
  { material: "אלומיניום 6063", priceKg: 42, sensitivity: "גבוהה" },
  { material: "אלומיניום 6082", priceKg: 48, sensitivity: "גבוהה" },
  { material: "פלדה ST37", priceKg: 18, sensitivity: "בינונית" },
  { material: "פלדה מגולוונת", priceKg: 22, sensitivity: "בינונית" },
  { material: "זכוכית מחוסמת", priceKg: 35, sensitivity: "גבוהה" },
  { material: "זכוכית למינציה", priceKg: 52, sensitivity: "גבוהה מאוד" },
  { material: "גומי EPDM", priceKg: 28, sensitivity: "נמוכה" },
  { material: "ACP (אלו-פלסטיק)", priceKg: 38, sensitivity: "נמוכה" },
];

const FALLBACK_BUDGETITEMS = [
  { id: "PRD-001", name: "חלון אלומיניום 120x150", budgeted: 1900, actual: 1845, variance: -55, pct: -2.9, status: "under" as const },
  { id: "PRD-002", name: "דלת כניסה מפלדה+זכוכית", budgeted: 3200, actual: 3420, variance: 220, pct: 6.9, status: "over" as const },
  { id: "PRD-003", name: "מעקה אלומיניום למרפסת", budgeted: 2100, actual: 2150, variance: 50, pct: 2.4, status: "on" as const },
  { id: "PRD-004", name: "ויטרינה חנות 300x250", budgeted: 6000, actual: 5890, variance: -110, pct: -1.8, status: "under" as const },
  { id: "PRD-005", name: "תריס הזזה חשמלי", budgeted: 2750, actual: 2780, variance: 30, pct: 1.1, status: "on" as const },
  { id: "PRD-006", name: "מחיצת משרד זכוכית", budgeted: 4500, actual: 4320, variance: -180, pct: -4.0, status: "under" as const },
  { id: "PRD-007", name: "שער חניה אוטומטי", budgeted: 5800, actual: 6250, variance: 450, pct: 7.8, status: "over" as const },
  { id: "PRD-008", name: "חיפוי קיר ACP", budgeted: 3100, actual: 3150, variance: 50, pct: 1.6, status: "on" as const },
];

const FALLBACK_SIMULATIONS = [
  { title: "עליית מחיר אלומיניום ב-10%", desc: "סימולציה של עלייה במחיר מטיל אלומיניום גולמי",
    originalCost: 4287500, newCost: 4553200, delta: 265700, pctDelta: 6.2, affected: 8, icon: TrendingUp, color: "text-red-600", bg: "bg-red-50" },
  { title: "החלפת ספק זכוכית", desc: "מעבר מ-Foshan Glass לספק מקומי עם מחיר גבוה יותר ב-5%",
    originalCost: 4287500, newCost: 4395800, delta: 108300, pctDelta: 2.5, affected: 7, icon: RefreshCw, color: "text-amber-600", bg: "bg-amber-50" },
  { title: "ייעול קו הרכבה - חיסכון 15% בעבודה", desc: "השקעה ברובוטיזציה לקו ההרכבה הראשי",
    originalCost: 4287500, newCost: 4126400, delta: -161100, pctDelta: -3.8, affected: 10, icon: Factory, color: "text-green-600", bg: "bg-green-50" },
  { title: "עלייה בתעריפי חשמל ב-20%", desc: "השפעת העלאת תעריפי חשמל על עלויות תקורה",
    originalCost: 4287500, newCost: 4401200, delta: 113700, pctDelta: 2.7, affected: 10, icon: Zap, color: "text-orange-600", bg: "bg-orange-50" },
];

const levelColor = (l: number) => ["bg-blue-100 text-blue-800","bg-emerald-100 text-emerald-800","bg-amber-100 text-amber-800","bg-rose-100 text-rose-800"][l] ?? "bg-gray-100";
const statusBadge = (s: string) => s === "under" ? <Badge className="bg-green-100 text-green-700">מתחת לתקציב</Badge>
  : s === "on" ? <Badge className="bg-amber-100 text-amber-700">בטווח</Badge>
  : <Badge className="bg-red-100 text-red-700">חריגה</Badge>;

const FALLBACK_COSTDIST = [
  { label: "חומרי גלם", pct: 62, color: "bg-blue-500", items: "אלומיניום, זכוכית, פלדה, אטמים, פרזול" },
  { label: "עבודה", pct: 25, color: "bg-purple-500", items: "חיתוך, ריתוך, הרכבה, גימור" },
  { label: "תקורה", pct: 13, color: "bg-amber-500", items: "אנרגיה, מתקן, כלים" },
];

export default function BomCostRollupPage() {
  const { data: apiproducts } = useQuery({
    queryKey: ["/api/supply-chain/bom-cost-rollup/products"],
    queryFn: () => authFetch("/api/supply-chain/bom-cost-rollup/products").then(r => r.json()).catch(() => null),
  });
  const products = Array.isArray(apiproducts) ? apiproducts : (apiproducts?.data ?? apiproducts?.items ?? FALLBACK_PRODUCTS);


  const { data: apitopComponents } = useQuery({
    queryKey: ["/api/supply-chain/bom-cost-rollup/topcomponents"],
    queryFn: () => authFetch("/api/supply-chain/bom-cost-rollup/topcomponents").then(r => r.json()).catch(() => null),
  });
  const topComponents = Array.isArray(apitopComponents) ? apitopComponents : (apitopComponents?.data ?? apitopComponents?.items ?? FALLBACK_TOPCOMPONENTS);


  const { data: apicostPerKg } = useQuery({
    queryKey: ["/api/supply-chain/bom-cost-rollup/costperkg"],
    queryFn: () => authFetch("/api/supply-chain/bom-cost-rollup/costperkg").then(r => r.json()).catch(() => null),
  });
  const costPerKg = Array.isArray(apicostPerKg) ? apicostPerKg : (apicostPerKg?.data ?? apicostPerKg?.items ?? FALLBACK_COSTPERKG);


  const { data: apibudgetItems } = useQuery({
    queryKey: ["/api/supply-chain/bom-cost-rollup/budgetitems"],
    queryFn: () => authFetch("/api/supply-chain/bom-cost-rollup/budgetitems").then(r => r.json()).catch(() => null),
  });
  const budgetItems = Array.isArray(apibudgetItems) ? apibudgetItems : (apibudgetItems?.data ?? apibudgetItems?.items ?? FALLBACK_BUDGETITEMS);


  const { data: apisimulations } = useQuery({
    queryKey: ["/api/supply-chain/bom-cost-rollup/simulations"],
    queryFn: () => authFetch("/api/supply-chain/bom-cost-rollup/simulations").then(r => r.json()).catch(() => null),
  });
  const simulations = Array.isArray(apisimulations) ? apisimulations : (apisimulations?.data ?? apisimulations?.items ?? FALLBACK_SIMULATIONS);


  const { data: apicostDist } = useQuery({
    queryKey: ["/api/supply-chain/bom-cost-rollup/costdist"],
    queryFn: () => authFetch("/api/supply-chain/bom-cost-rollup/costdist").then(r => r.json()).catch(() => null),
  });
  const costDist = Array.isArray(apicostDist) ? apicostDist : (apicostDist?.data ?? apicostDist?.items ?? FALLBACK_COSTDIST);

  const [activeTab, setActiveTab] = useState("rollup");
  const [searchTerm, setSearchTerm] = useState("");
  const [expanded, setExpanded] = useState<string | null>("PRD-001");
  const filtered = products.filter(p => p.name.includes(searchTerm) || p.id.includes(searchTerm));

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Layers className="h-7 w-7 text-blue-600" /> גלגול עלויות BOM
          </h1>
          <p className="text-sm text-muted-foreground mt-1">טכנו-כל עוזי | חישוב עלויות רב-שכבתי למוצרי מתכת, אלומיניום וזכוכית</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><RefreshCw className="h-4 w-4 ml-1" /> עדכון מחירים</Button>
          <Button size="sm"><Calculator className="h-4 w-4 ml-1" /> חשב מחדש</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k, i) => (
          <Card key={i} className="relative overflow-hidden">
            <CardContent className="pt-4 pb-3 px-4">
              <div className={`absolute top-0 left-0 w-1 h-full ${k.color.replace("text-","bg-")}`} />
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground truncate">{k.label}</p>
                  <p className="text-lg font-bold mt-0.5">{k.suffix === "%" ? `${k.value}%` : fmt(k.value)}</p>
                </div>
                <div className={`${k.bg} p-1.5 rounded-lg`}><k.icon className={`h-4 w-4 ${k.color}`} /></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="rollup">גלגול עלויות</TabsTrigger>
          <TabsTrigger value="analysis">ניתוח עלויות</TabsTrigger>
          <TabsTrigger value="budget">השוואה לתקציב</TabsTrigger>
          <TabsTrigger value="simulations">סימולציות</TabsTrigger>
        </TabsList>

        {/* === Tab 1: Cost Rollup === */}
        <TabsContent value="rollup" className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="חיפוש מוצר..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pr-9" />
            </div>
            <div className="flex gap-1.5 text-xs">
              {[["0","מוגמר"],["1","תת-מכלול"],["2","רכיב"],["3","חומר גלם"]].map(([n,t]) => (
                <Badge key={n} variant="outline" className={levelColor(+n)}>רמה {n} - {t}</Badge>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            {filtered.map(p => (
              <Card key={p.id}>
                <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => setExpanded(expanded === p.id ? null : p.id)}>
                  <div className="flex items-center gap-3">
                    {expanded === p.id ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronLeft className="h-4 w-4 text-muted-foreground" />}
                    <div><span className="font-medium">{p.name}</span><span className="text-xs text-muted-foreground mr-2">{p.id}</span></div>
                  </div>
                  <div className="flex items-center gap-6">
                    {[["חומרים",p.material,"text-blue-600"],["עבודה",p.labor,"text-purple-600"],["תקורה",p.overhead,"text-amber-600"]].map(([l,v,c]) => (
                      <div key={l as string} className="text-left"><p className="text-xs text-muted-foreground">{l}</p><p className={`text-sm font-medium ${c}`}>{fmt(v as number)}</p></div>
                    ))}
                    <div className="text-left border-r pr-4"><p className="text-xs text-muted-foreground">סה״כ מגולגל</p><p className="text-lg font-bold">{fmt(p.totalCost)}</p></div>
                  </div>
                </div>
                {expanded === p.id && (
                  <div className="border-t px-4 pb-4">
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead className="text-right w-16">רמה</TableHead>
                        <TableHead className="text-right">תיאור</TableHead>
                        <TableHead className="text-right w-32">עלות</TableHead>
                        <TableHead className="text-right w-28">% מסה״כ</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {p.levels.map((lv, i) => (
                          <TableRow key={i} className={lv.level === 0 ? "font-bold bg-muted/20" : ""}>
                            <TableCell><Badge variant="outline" className={`text-xs ${levelColor(lv.level)}`}>{lv.level}</Badge></TableCell>
                            <TableCell style={{ paddingRight: `${lv.level * 24}px` }}>
                              {lv.level > 0 && <span className="text-muted-foreground ml-1">└</span>}{lv.desc}
                            </TableCell>
                            <TableCell className="font-mono">{fmt(lv.cost)}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Progress value={(lv.cost / p.totalCost) * 100} className="h-2 flex-1" />
                                <span className="text-xs w-10 text-left">{((lv.cost / p.totalCost) * 100).toFixed(1)}%</span>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
                      <span>משקל: {p.weight} ק״ג</span><span>עלות/ק״ג: {fmtDec(p.totalCost / p.weight)}</span>
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* === Tab 2: Cost Analysis === */}
        <TabsContent value="analysis" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">התפלגות עלויות</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {costDist.map((c, i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="flex justify-between text-sm"><span className="font-medium">{c.label}</span><span className="font-bold">{c.pct}%</span></div>
                    <div className="w-full bg-gray-100 rounded-full h-6 relative overflow-hidden">
                      <div className={`${c.color} h-full rounded-full flex items-center pr-3`} style={{ width: `${c.pct}%` }}>
                        <span className="text-white text-xs font-medium truncate">{c.items}</span>
                      </div>
                    </div>
                  </div>
                ))}
                <div className="pt-2 border-t text-xs text-muted-foreground">סה״כ שווי BOM: {fmt(4287500)} | ממוצע למוצר: {fmt(428750)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">עלות לק״ג לפי סוג חומר</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow>
                    <TableHead className="text-right">חומר</TableHead><TableHead className="text-right">₪/ק״ג</TableHead><TableHead className="text-right">רגישות מחיר</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {costPerKg.map((m, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{m.material}</TableCell>
                        <TableCell className="font-mono">{fmtDec(m.priceKg)}</TableCell>
                        <TableCell><Badge variant="outline" className={m.sensitivity === "גבוהה מאוד" ? "bg-red-50 text-red-700" : m.sensitivity === "גבוהה" ? "bg-amber-50 text-amber-700" : m.sensitivity === "בינונית" ? "bg-blue-50 text-blue-700" : "bg-green-50 text-green-700"}>{m.sensitivity}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-5 w-5" /> 10 הרכיבים היקרים ביותר</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="text-right w-8">#</TableHead><TableHead className="text-right">רכיב</TableHead>
                  <TableHead className="text-right">שימוש (יח׳)</TableHead><TableHead className="text-right">עלות יחידה</TableHead>
                  <TableHead className="text-right">עלות כוללת</TableHead><TableHead className="text-right w-40">חלק יחסי</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {[...topComponents].sort((a, b) => b.total - a.total).map((c, i) => {
                    const max = Math.max(...topComponents.map(x => x.total));
                    return (<TableRow key={i}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>{c.usage.toLocaleString("he-IL")}</TableCell>
                      <TableCell className="font-mono">{fmt(c.unitCost)}</TableCell>
                      <TableCell className="font-mono font-bold">{fmt(c.total)}</TableCell>
                      <TableCell><div className="flex items-center gap-2"><Progress value={(c.total / max) * 100} className="h-2 flex-1" /><span className="text-xs w-10 text-left">{((c.total / max) * 100).toFixed(0)}%</span></div></TableCell>
                    </TableRow>);
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* === Tab 3: Budget Comparison === */}
        <TabsContent value="budget" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-5 w-5" /> השוואת תקציב מול בפועל</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="text-right">מק״ט</TableHead><TableHead className="text-right">מוצר</TableHead>
                  <TableHead className="text-right">תקציב</TableHead><TableHead className="text-right">בפועל</TableHead>
                  <TableHead className="text-right">סטייה ₪</TableHead><TableHead className="text-right">סטייה %</TableHead>
                  <TableHead className="text-right">מגמה</TableHead><TableHead className="text-right">סטטוס</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {budgetItems.map((b, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-muted-foreground text-xs">{b.id}</TableCell>
                      <TableCell className="font-medium">{b.name}</TableCell>
                      <TableCell className="font-mono">{fmt(b.budgeted)}</TableCell>
                      <TableCell className="font-mono">{fmt(b.actual)}</TableCell>
                      <TableCell className={`font-mono font-bold ${b.variance > 0 ? "text-red-600" : b.variance < 0 ? "text-green-600" : ""}`}>
                        {b.variance > 0 ? "+" : ""}{fmt(b.variance)}</TableCell>
                      <TableCell className={`font-mono ${b.pct > 0 ? "text-red-600" : b.pct < 0 ? "text-green-600" : ""}`}>
                        {b.pct > 0 ? "+" : ""}{b.pct}%</TableCell>
                      <TableCell>{b.variance > 0 ? <ArrowUpRight className="h-4 w-4 text-red-500" /> : b.variance < 0 ? <ArrowDownRight className="h-4 w-4 text-green-500" /> : <Minus className="h-4 w-4 text-gray-400" />}</TableCell>
                      <TableCell>{statusBadge(b.status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-4 pt-3 border-t grid grid-cols-3 gap-4">
                {[
                  { icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50", label: "מתחת לתקציב", count: 3, textColor: "text-green-700" },
                  { icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50", label: "בטווח (±3%)", count: 3, textColor: "text-amber-700" },
                  { icon: TrendingUp, color: "text-red-600", bg: "bg-red-50", label: "חריגה מתקציב", count: 2, textColor: "text-red-700" },
                ].map((s, i) => (
                  <div key={i} className={`text-center p-3 ${s.bg} rounded-lg`}>
                    <s.icon className={`h-5 w-5 ${s.color} mx-auto mb-1`} />
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className={`text-lg font-bold ${s.textColor}`}>{s.count} מוצרים</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* === Tab 4: Simulations === */}
        <TabsContent value="simulations" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><FlaskConical className="h-5 w-5" /> תרחישי What-If</CardTitle></CardHeader>
            <CardContent><p className="text-sm text-muted-foreground">סימולציה של שינויים במחירי חומרי גלם, ספקים ותהליכי ייצור</p></CardContent>
          </Card>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {simulations.map((s, i) => (
              <Card key={i} className="relative overflow-hidden">
                <div className={`absolute top-0 left-0 w-1.5 h-full ${s.color.replace("text-","bg-")}`} />
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-start gap-3 mb-4">
                    <div className={`${s.bg} p-2 rounded-lg`}><s.icon className={`h-5 w-5 ${s.color}`} /></div>
                    <div className="flex-1"><h3 className="font-bold text-sm">{s.title}</h3><p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p></div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div className="bg-muted/30 rounded-lg p-2.5 text-center">
                      <p className="text-xs text-muted-foreground">עלות מקורית</p><p className="text-sm font-bold mt-0.5">{fmt(s.originalCost)}</p>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-2.5 text-center">
                      <p className="text-xs text-muted-foreground">עלות חדשה</p><p className="text-sm font-bold mt-0.5">{fmt(s.newCost)}</p>
                    </div>
                    <div className={`rounded-lg p-2.5 text-center ${s.delta > 0 ? "bg-red-50" : "bg-green-50"}`}>
                      <p className="text-xs text-muted-foreground">הפרש</p>
                      <p className={`text-sm font-bold mt-0.5 ${s.delta > 0 ? "text-red-600" : "text-green-600"}`}>{s.delta > 0 ? "+" : ""}{fmt(s.delta)}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs pt-2 border-t">
                    <span className="text-muted-foreground">מוצרים מושפעים: <span className="font-bold text-foreground">{s.affected}</span></span>
                    <Badge variant="outline" className={s.delta > 0 ? "text-red-600 border-red-200" : "text-green-600 border-green-200"}>
                      {s.pctDelta > 0 ? "+" : ""}{s.pctDelta}%
                    </Badge>
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