import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Calculator, Layers, TrendingUp, TrendingDown, DollarSign, BarChart3,
  Package, Factory, Zap, ChevronDown, ChevronLeft, Search, RefreshCw,
  ArrowUpRight, ArrowDownRight, Minus, FlaskConical, AlertTriangle, CheckCircle2
} from "lucide-react";

const fmt = (n: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(n);
const fmtDec = (n: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const fmtPct = (n: number) => new Intl.NumberFormat("he-IL", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n / 100);

// === MOCK DATA ===
const kpis = [
  { label: "שווי BOM כולל", value: 4_287_500, icon: DollarSign, color: "text-blue-600", bg: "bg-blue-50", suffix: "" },
  { label: "עלות מוצר ממוצעת", value: 428_750, icon: Calculator, color: "text-emerald-600", bg: "bg-emerald-50", suffix: "" },
  { label: "אחוז חומרי גלם", value: 62, icon: Package, color: "text-amber-600", bg: "bg-amber-50", suffix: "%" },
  { label: "אחוז עבודה", value: 25, icon: Factory, color: "text-purple-600", bg: "bg-purple-50", suffix: "%" },
  { label: "אחוז תקורה", value: 13, icon: Zap, color: "text-rose-600", bg: "bg-rose-50", suffix: "%" },
  { label: "סטיית עלות מתקציב", value: -3.2, icon: TrendingDown, color: "text-green-600", bg: "bg-green-50", suffix: "%" },
];

const products = [
  {
    id: "PRD-001", name: "חלון אלומיניום 120x150", totalCost: 1_845,
    levels: [
      { level: 0, desc: "מוצר מוגמר - חלון 120x150", cost: 1_845 },
      { level: 1, desc: "מסגרת אלומיניום מורכבת", cost: 720, type: "sub" },
      { level: 1, desc: "יחידת זיגוג כפול", cost: 580, type: "sub" },
      { level: 1, desc: "עבודת הרכבה וגימור", cost: 345, type: "labor" },
      { level: 1, desc: "תקורה (אנרגיה, מתקן)", cost: 200, type: "overhead" },
      { level: 2, desc: "פרופיל אלומיניום 6063-T5", cost: 385, type: "comp" },
      { level: 2, desc: "אטמי EPDM", cost: 95, type: "comp" },
      { level: 2, desc: "זכוכית מחוסמת 6mm", cost: 420, type: "comp" },
      { level: 2, desc: "פרזול ציר נירוסטה", cost: 160, type: "comp" },
      { level: 3, desc: "מטיל אלומיניום גולמי", cost: 210, type: "raw" },
      { level: 3, desc: "חול סיליקה לזכוכית", cost: 85, type: "raw" },
      { level: 3, desc: "גומי EPDM גולמי", cost: 42, type: "raw" },
    ],
    material: 1_145, labor: 345, overhead: 200, weight: 32
  },
  {
    id: "PRD-002", name: "דלת כניסה מפלדה+זכוכית", totalCost: 3_420,
    levels: [
      { level: 0, desc: "מוצר מוגמר - דלת כניסה", cost: 3_420 },
      { level: 1, desc: "מסגרת פלדה מרותכת", cost: 1_280, type: "sub" },
      { level: 1, desc: "פאנל זכוכית דקורטיבי", cost: 850, type: "sub" },
      { level: 1, desc: "עבודה (חיתוך, ריתוך, הרכבה)", cost: 890, type: "labor" },
      { level: 1, desc: "תקורה", cost: 400, type: "overhead" },
      { level: 2, desc: "פלדת ST37 לוח 3mm", cost: 620, type: "comp" },
      { level: 2, desc: "זכוכית טריפלקס 8mm", cost: 580, type: "comp" },
      { level: 2, desc: "מנעול רב-בריחי", cost: 340, type: "comp" },
      { level: 3, desc: "גליל פלדה חמה", cost: 380, type: "raw" },
      { level: 3, desc: "זכוכית שטוחה גולמית", cost: 290, type: "raw" },
    ],
    material: 2_130, labor: 890, overhead: 400, weight: 68
  },
  {
    id: "PRD-003", name: "מעקה אלומיניום למרפסת", totalCost: 2_150,
    levels: [
      { level: 0, desc: "מוצר מוגמר - מעקה מרפסת", cost: 2_150 },
      { level: 1, desc: "עמודים ומאחז יד", cost: 820, type: "sub" },
      { level: 1, desc: "מילוי זכוכית מחוסמת", cost: 650, type: "sub" },
      { level: 1, desc: "עבודה", cost: 420, type: "labor" },
      { level: 1, desc: "תקורה", cost: 260, type: "overhead" },
      { level: 2, desc: "צינור אלומיניום עגול 50mm", cost: 340, type: "comp" },
      { level: 2, desc: "זכוכית מחוסמת 10mm", cost: 510, type: "comp" },
      { level: 3, desc: "מטיל אלומיניום", cost: 185, type: "raw" },
    ],
    material: 1_470, labor: 420, overhead: 260, weight: 28
  },
  {
    id: "PRD-004", name: "ויטרינה חנות 300x250", totalCost: 5_890,
    levels: [
      { level: 0, desc: "מוצר מוגמר - ויטרינה", cost: 5_890 },
      { level: 1, desc: "מסגרת אלומיניום כבדה", cost: 1_950, type: "sub" },
      { level: 1, desc: "זיגוג בטיחותי כפול", cost: 2_100, type: "sub" },
      { level: 1, desc: "עבודה", cost: 1_240, type: "labor" },
      { level: 1, desc: "תקורה", cost: 600, type: "overhead" },
      { level: 2, desc: "פרופיל אלומיניום 6082", cost: 980, type: "comp" },
      { level: 2, desc: "זכוכית למינציה 12mm", cost: 1_620, type: "comp" },
      { level: 3, desc: "מטיל אלומיניום מיוחד", cost: 520, type: "raw" },
    ],
    material: 4_050, labor: 1_240, overhead: 600, weight: 95
  },
  {
    id: "PRD-005", name: "תריס הזזה חשמלי", totalCost: 2_780,
    levels: [
      { level: 0, desc: "מוצר מוגמר - תריס הזזה", cost: 2_780 },
      { level: 1, desc: "שלדת תריס אלומיניום", cost: 920, type: "sub" },
      { level: 1, desc: "מנוע חשמלי + בקר", cost: 680, type: "sub" },
      { level: 1, desc: "עבודה", cost: 730, type: "labor" },
      { level: 1, desc: "תקורה", cost: 450, type: "overhead" },
      { level: 2, desc: "למלות אלומיניום", cost: 480, type: "comp" },
      { level: 2, desc: "מנוע טיובולרי Somfy", cost: 520, type: "comp" },
      { level: 3, desc: "מטיל אלומיניום", cost: 260, type: "raw" },
    ],
    material: 1_600, labor: 730, overhead: 450, weight: 22
  },
  {
    id: "PRD-006", name: "מחיצת משרד זכוכית", totalCost: 4_320,
    levels: [
      { level: 0, desc: "מוצר מוגמר - מחיצת משרד", cost: 4_320 },
      { level: 1, desc: "מסגרת אלומיניום דקה", cost: 1_180, type: "sub" },
      { level: 1, desc: "פאנלי זכוכית מזג", cost: 1_850, type: "sub" },
      { level: 1, desc: "עבודה", cost: 890, type: "labor" },
      { level: 1, desc: "תקורה", cost: 400, type: "overhead" },
      { level: 2, desc: "פרופיל מינימלי 30mm", cost: 560, type: "comp" },
      { level: 2, desc: "זכוכית 10mm סאטן", cost: 1_420, type: "comp" },
      { level: 3, desc: "מטיל אלומיניום", cost: 295, type: "raw" },
    ],
    material: 3_030, labor: 890, overhead: 400, weight: 54
  },
  {
    id: "PRD-007", name: "שער חניה אוטומטי", totalCost: 6_250,
    levels: [
      { level: 0, desc: "מוצר מוגמר - שער חניה", cost: 6_250 },
      { level: 1, desc: "שלדת פלדה מגולוונת", cost: 2_100, type: "sub" },
      { level: 1, desc: "מערכת הנעה + שלט", cost: 1_350, type: "sub" },
      { level: 1, desc: "עבודה", cost: 1_800, type: "labor" },
      { level: 1, desc: "תקורה", cost: 1_000, type: "overhead" },
      { level: 2, desc: "פלדה מגולוונת 2mm", cost: 1_280, type: "comp" },
      { level: 2, desc: "מנוע תעשייתי 1HP", cost: 950, type: "comp" },
      { level: 3, desc: "גליל פלדה", cost: 780, type: "raw" },
    ],
    material: 3_450, labor: 1_800, overhead: 1_000, weight: 120
  },
  {
    id: "PRD-008", name: "חיפוי קיר ACP", totalCost: 3_150,
    levels: [
      { level: 0, desc: "מוצר מוגמר - חיפוי ACP", cost: 3_150 },
      { level: 1, desc: "פאנלי ACP מעוצבים", cost: 1_680, type: "sub" },
      { level: 1, desc: "תת-מסגרת אלומיניום", cost: 580, type: "sub" },
      { level: 1, desc: "עבודה", cost: 540, type: "labor" },
      { level: 1, desc: "תקורה", cost: 350, type: "overhead" },
      { level: 2, desc: "לוח ACP 4mm", cost: 1_120, type: "comp" },
      { level: 2, desc: "פרופילי תלייה", cost: 380, type: "comp" },
      { level: 3, desc: "אלומיניום גולמי + PE", cost: 620, type: "raw" },
    ],
    material: 2_260, labor: 540, overhead: 350, weight: 18
  },
  {
    id: "PRD-009", name: "פרגולה אלומיניום 4x3", totalCost: 8_450,
    levels: [
      { level: 0, desc: "מוצר מוגמר - פרגולה", cost: 8_450 },
      { level: 1, desc: "עמודים וקורות ראשיות", cost: 2_800, type: "sub" },
      { level: 1, desc: "למלות מתכווננות", cost: 1_950, type: "sub" },
      { level: 1, desc: "עבודה", cost: 2_200, type: "labor" },
      { level: 1, desc: "תקורה", cost: 1_500, type: "overhead" },
      { level: 2, desc: "פרופיל אלומיניום 100x100", cost: 1_680, type: "comp" },
      { level: 2, desc: "למלות סיבוביות 200mm", cost: 1_450, type: "comp" },
      { level: 3, desc: "מטיל אלומיניום כבד", cost: 920, type: "raw" },
    ],
    material: 4_750, labor: 2_200, overhead: 1_500, weight: 145
  },
  {
    id: "PRD-010", name: "דלת הזזה פנורמית", totalCost: 4_680,
    levels: [
      { level: 0, desc: "מוצר מוגמר - דלת פנורמית", cost: 4_680 },
      { level: 1, desc: "מסגרת ומסילה אלומיניום", cost: 1_520, type: "sub" },
      { level: 1, desc: "זיגוג פנורמי", cost: 1_580, type: "sub" },
      { level: 1, desc: "עבודה", cost: 980, type: "labor" },
      { level: 1, desc: "תקורה", cost: 600, type: "overhead" },
      { level: 2, desc: "מערכת מסילה כפולה", cost: 680, type: "comp" },
      { level: 2, desc: "זכוכית מחוסמת 8mm", cost: 1_240, type: "comp" },
      { level: 3, desc: "אלומיניום + זכוכית גולמית", cost: 520, type: "raw" },
    ],
    material: 3_100, labor: 980, overhead: 600, weight: 78
  },
];

const topComponents = [
  { name: "זכוכית למינציה 12mm", usage: 48, unitCost: 1_620, totalCost: 77_760 },
  { name: "פרופיל אלומיניום 100x100", usage: 32, unitCost: 1_680, totalCost: 53_760 },
  { name: "מנוע תעשייתי 1HP", usage: 25, unitCost: 950, totalCost: 23_750 },
  { name: "זכוכית מחוסמת 10mm", usage: 85, unitCost: 510, totalCost: 43_350 },
  { name: "פלדה מגולוונת 2mm", usage: 40, unitCost: 1_280, totalCost: 51_200 },
  { name: "פרופיל אלומיניום 6063-T5", usage: 120, unitCost: 385, totalCost: 46_200 },
  { name: "מנוע טיובולרי Somfy", usage: 65, unitCost: 520, totalCost: 33_800 },
  { name: "זכוכית 10mm סאטן", usage: 38, unitCost: 1_420, totalCost: 53_960 },
  { name: "לוח ACP 4mm", usage: 55, unitCost: 1_120, totalCost: 61_600 },
  { name: "מנעול רב-בריחי", usage: 90, unitCost: 340, totalCost: 30_600 },
];

const costPerKg = [
  { material: "אלומיניום 6063", priceKg: 42, density: "גבוהה" },
  { material: "אלומיניום 6082", priceKg: 48, density: "גבוהה" },
  { material: "פלדה ST37", priceKg: 18, density: "בינונית" },
  { material: "פלדה מגולוונת", priceKg: 22, density: "בינונית" },
  { material: "זכוכית מחוסמת", priceKg: 35, density: "גבוהה" },
  { material: "זכוכית למינציה", priceKg: 52, density: "גבוהה מאוד" },
  { material: "גומי EPDM", priceKg: 28, density: "נמוכה" },
  { material: "ACP (אלו-פלסטיק)", priceKg: 38, density: "נמוכה" },
];

const budgetComparison = [
  { id: "PRD-001", name: "חלון אלומיניום 120x150", budgeted: 1_900, actual: 1_845, variance: -55, pct: -2.9, status: "under" },
  { id: "PRD-002", name: "דלת כניסה מפלדה+זכוכית", budgeted: 3_200, actual: 3_420, variance: 220, pct: 6.9, status: "over" },
  { id: "PRD-003", name: "מעקה אלומיניום למרפסת", budgeted: 2_100, actual: 2_150, variance: 50, pct: 2.4, status: "on" },
  { id: "PRD-004", name: "ויטרינה חנות 300x250", budgeted: 6_000, actual: 5_890, variance: -110, pct: -1.8, status: "under" },
  { id: "PRD-005", name: "תריס הזזה חשמלי", budgeted: 2_750, actual: 2_780, variance: 30, pct: 1.1, status: "on" },
  { id: "PRD-006", name: "מחיצת משרד זכוכית", budgeted: 4_500, actual: 4_320, variance: -180, pct: -4.0, status: "under" },
  { id: "PRD-007", name: "שער חניה אוטומטי", budgeted: 5_800, actual: 6_250, variance: 450, pct: 7.8, status: "over" },
  { id: "PRD-008", name: "חיפוי קיר ACP", budgeted: 3_100, actual: 3_150, variance: 50, pct: 1.6, status: "on" },
];

const simulations = [
  {
    title: "עליית מחיר אלומיניום ב-10%",
    desc: "סימולציה של עלייה במחיר מטיל אלומיניום גולמי",
    originalCost: 4_287_500, newCost: 4_553_200, delta: 265_700, pctDelta: 6.2, affectedProducts: 8,
    icon: TrendingUp, color: "text-red-600", bg: "bg-red-50"
  },
  {
    title: "החלפת ספק זכוכית",
    desc: "מעבר מ-Foshan Glass לספק מקומי עם מחיר גבוה יותר ב-5%",
    originalCost: 4_287_500, newCost: 4_395_800, delta: 108_300, pctDelta: 2.5, affectedProducts: 7,
    icon: RefreshCw, color: "text-amber-600", bg: "bg-amber-50"
  },
  {
    title: "ייעול קו הרכבה - חיסכון 15% בעבודה",
    desc: "השקעה ברובוטיזציה לקו ההרכבה הראשי",
    originalCost: 4_287_500, newCost: 4_126_400, delta: -161_100, pctDelta: -3.8, affectedProducts: 10,
    icon: Factory, color: "text-green-600", bg: "bg-green-50"
  },
  {
    title: "עלייה בתעריפי חשמל ב-20%",
    desc: "השפעת העלאת תעריפי חשמל על עלויות תקורה",
    originalCost: 4_287_500, newCost: 4_401_200, delta: 113_700, pctDelta: 2.7, affectedProducts: 10,
    icon: Zap, color: "text-orange-600", bg: "bg-orange-50"
  },
];

// === COMPONENT ===
export default function BomCostRollupPage() {
  const [activeTab, setActiveTab] = useState("rollup");
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedProduct, setExpandedProduct] = useState<string | null>("PRD-001");

  const filteredProducts = products.filter(p =>
    p.name.includes(searchTerm) || p.id.includes(searchTerm)
  );

  const levelColor = (level: number) => {
    switch (level) {
      case 0: return "bg-blue-100 text-blue-800";
      case 1: return "bg-emerald-100 text-emerald-800";
      case 2: return "bg-amber-100 text-amber-800";
      case 3: return "bg-rose-100 text-rose-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "under": return <Badge className="bg-green-100 text-green-700">מתחת לתקציב</Badge>;
      case "on": return <Badge className="bg-amber-100 text-amber-700">בטווח</Badge>;
      case "over": return <Badge className="bg-red-100 text-red-700">חריגה</Badge>;
      default: return null;
    }
  };

  const costDistribution = [
    { label: "חומרי גלם", pct: 62, color: "bg-blue-500", items: "אלומיניום, זכוכית, פלדה, אטמים, פרזול" },
    { label: "עבודה", pct: 25, color: "bg-purple-500", items: "חיתוך, ריתוך, הרכבה, גימור" },
    { label: "תקורה", pct: 13, color: "bg-amber-500", items: "אנרגיה, מתקן, כלים" },
  ];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
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

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((kpi, i) => (
          <Card key={i} className="relative overflow-hidden">
            <CardContent className="pt-4 pb-3 px-4">
              <div className={`absolute top-0 left-0 w-1 h-full ${kpi.color.replace("text-", "bg-")}`} />
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground truncate">{kpi.label}</p>
                  <p className="text-lg font-bold mt-0.5">
                    {kpi.suffix === "%" ? `${kpi.value}%` : fmt(kpi.value)}
                  </p>
                </div>
                <div className={`${kpi.bg} p-1.5 rounded-lg`}>
                  <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="rollup">גלגול עלויות</TabsTrigger>
          <TabsTrigger value="analysis">ניתוח עלויות</TabsTrigger>
          <TabsTrigger value="budget">השוואה לתקציב</TabsTrigger>
          <TabsTrigger value="simulations">סימולציות</TabsTrigger>
        </TabsList>

        {/* Tab 1: Cost Rollup */}
        <TabsContent value="rollup" className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="חיפוש מוצר..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pr-9"
              />
            </div>
            <div className="flex gap-1.5 text-xs">
              <Badge variant="outline" className={levelColor(0)}>רמה 0 - מוגמר</Badge>
              <Badge variant="outline" className={levelColor(1)}>רמה 1 - תת-מכלול</Badge>
              <Badge variant="outline" className={levelColor(2)}>רמה 2 - רכיב</Badge>
              <Badge variant="outline" className={levelColor(3)}>רמה 3 - חומר גלם</Badge>
            </div>
          </div>

          <div className="space-y-2">
            {filteredProducts.map(product => (
              <Card key={product.id}>
                <div
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => setExpandedProduct(expandedProduct === product.id ? null : product.id)}
                >
                  <div className="flex items-center gap-3">
                    {expandedProduct === product.id ?
                      <ChevronDown className="h-4 w-4 text-muted-foreground" /> :
                      <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                    }
                    <div>
                      <span className="font-medium">{product.name}</span>
                      <span className="text-xs text-muted-foreground mr-2">{product.id}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-left">
                      <p className="text-xs text-muted-foreground">חומרים</p>
                      <p className="text-sm font-medium text-blue-600">{fmt(product.material)}</p>
                    </div>
                    <div className="text-left">
                      <p className="text-xs text-muted-foreground">עבודה</p>
                      <p className="text-sm font-medium text-purple-600">{fmt(product.labor)}</p>
                    </div>
                    <div className="text-left">
                      <p className="text-xs text-muted-foreground">תקורה</p>
                      <p className="text-sm font-medium text-amber-600">{fmt(product.overhead)}</p>
                    </div>
                    <div className="text-left border-r pr-4">
                      <p className="text-xs text-muted-foreground">סה״כ מגולגל</p>
                      <p className="text-lg font-bold">{fmt(product.totalCost)}</p>
                    </div>
                  </div>
                </div>

                {expandedProduct === product.id && (
                  <div className="border-t px-4 pb-4">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right w-16">רמה</TableHead>
                          <TableHead className="text-right">תיאור</TableHead>
                          <TableHead className="text-right w-32">עלות</TableHead>
                          <TableHead className="text-right w-28">% מסה״כ</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {product.levels.map((lvl, i) => (
                          <TableRow key={i} className={lvl.level === 0 ? "font-bold bg-muted/20" : ""}>
                            <TableCell>
                              <Badge variant="outline" className={`text-xs ${levelColor(lvl.level)}`}>
                                {lvl.level}
                              </Badge>
                            </TableCell>
                            <TableCell style={{ paddingRight: `${lvl.level * 24}px` }}>
                              {lvl.level > 0 && <span className="text-muted-foreground ml-1">└</span>}
                              {lvl.desc}
                            </TableCell>
                            <TableCell className="font-mono">{fmt(lvl.cost)}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Progress value={(lvl.cost / product.totalCost) * 100} className="h-2 flex-1" />
                                <span className="text-xs w-10 text-left">
                                  {((lvl.cost / product.totalCost) * 100).toFixed(1)}%
                                </span>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
                      <span>משקל: {product.weight} ק״ג</span>
                      <span>עלות/ק״ג: {fmtDec(product.totalCost / product.weight)}</span>
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Tab 2: Cost Analysis */}
        <TabsContent value="analysis" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Cost Distribution */}
            <Card>
              <CardHeader><CardTitle className="text-base">התפלגות עלויות</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {costDistribution.map((cat, i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{cat.label}</span>
                      <span className="font-bold">{cat.pct}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-6 relative overflow-hidden">
                      <div className={`${cat.color} h-full rounded-full transition-all flex items-center pr-3`} style={{ width: `${cat.pct}%` }}>
                        <span className="text-white text-xs font-medium truncate">{cat.items}</span>
                      </div>
                    </div>
                  </div>
                ))}
                <div className="pt-2 border-t text-xs text-muted-foreground">
                  סה״כ שווי BOM: {fmt(4_287_500)} | ממוצע למוצר: {fmt(428_750)}
                </div>
              </CardContent>
            </Card>

            {/* Cost per Kg */}
            <Card>
              <CardHeader><CardTitle className="text-base">עלות לק״ג לפי סוג חומר</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">חומר</TableHead>
                      <TableHead className="text-right">₪/ק״ג</TableHead>
                      <TableHead className="text-right">רגישות מחיר</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {costPerKg.map((m, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{m.material}</TableCell>
                        <TableCell className="font-mono">{fmtDec(m.priceKg)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={
                            m.density === "גבוהה מאוד" ? "bg-red-50 text-red-700" :
                            m.density === "גבוהה" ? "bg-amber-50 text-amber-700" :
                            m.density === "בינונית" ? "bg-blue-50 text-blue-700" :
                            "bg-green-50 text-green-700"
                          }>{m.density}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          {/* Top 10 Most Expensive Components */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-5 w-5" /> 10 הרכיבים היקרים ביותר
            </CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right w-8">#</TableHead>
                    <TableHead className="text-right">רכיב</TableHead>
                    <TableHead className="text-right">שימוש (יח׳)</TableHead>
                    <TableHead className="text-right">עלות יחידה</TableHead>
                    <TableHead className="text-right">עלות כוללת</TableHead>
                    <TableHead className="text-right w-40">חלק יחסי</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...topComponents].sort((a, b) => b.totalCost - a.totalCost).map((comp, i) => {
                    const maxCost = Math.max(...topComponents.map(c => c.totalCost));
                    return (
                      <TableRow key={i}>
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-medium">{comp.name}</TableCell>
                        <TableCell>{comp.usage.toLocaleString("he-IL")}</TableCell>
                        <TableCell className="font-mono">{fmt(comp.unitCost)}</TableCell>
                        <TableCell className="font-mono font-bold">{fmt(comp.totalCost)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={(comp.totalCost / maxCost) * 100} className="h-2 flex-1" />
                            <span className="text-xs w-10 text-left">{((comp.totalCost / maxCost) * 100).toFixed(0)}%</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Budget Comparison */}
        <TabsContent value="budget" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-5 w-5" /> השוואת תקציב מול בפועל
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">מק״ט</TableHead>
                    <TableHead className="text-right">מוצר</TableHead>
                    <TableHead className="text-right">תקציב</TableHead>
                    <TableHead className="text-right">בפועל</TableHead>
                    <TableHead className="text-right">סטייה ₪</TableHead>
                    <TableHead className="text-right">סטייה %</TableHead>
                    <TableHead className="text-right">מגמה</TableHead>
                    <TableHead className="text-right">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {budgetComparison.map((item, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-muted-foreground text-xs">{item.id}</TableCell>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell className="font-mono">{fmt(item.budgeted)}</TableCell>
                      <TableCell className="font-mono">{fmt(item.actual)}</TableCell>
                      <TableCell className={`font-mono font-bold ${item.variance > 0 ? "text-red-600" : item.variance < 0 ? "text-green-600" : ""}`}>
                        {item.variance > 0 ? "+" : ""}{fmt(item.variance)}
                      </TableCell>
                      <TableCell className={`font-mono ${item.pct > 0 ? "text-red-600" : item.pct < 0 ? "text-green-600" : ""}`}>
                        {item.pct > 0 ? "+" : ""}{item.pct}%
                      </TableCell>
                      <TableCell>
                        {item.variance > 0 ? <ArrowUpRight className="h-4 w-4 text-red-500" /> :
                         item.variance < 0 ? <ArrowDownRight className="h-4 w-4 text-green-500" /> :
                         <Minus className="h-4 w-4 text-gray-400" />}
                      </TableCell>
                      <TableCell>{statusBadge(item.status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Summary */}
              <div className="mt-4 pt-3 border-t grid grid-cols-3 gap-4">
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <CheckCircle2 className="h-5 w-5 text-green-600 mx-auto mb-1" />
                  <p className="text-xs text-muted-foreground">מתחת לתקציב</p>
                  <p className="text-lg font-bold text-green-700">3 מוצרים</p>
                </div>
                <div className="text-center p-3 bg-amber-50 rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-amber-600 mx-auto mb-1" />
                  <p className="text-xs text-muted-foreground">בטווח (±3%)</p>
                  <p className="text-lg font-bold text-amber-700">3 מוצרים</p>
                </div>
                <div className="text-center p-3 bg-red-50 rounded-lg">
                  <TrendingUp className="h-5 w-5 text-red-600 mx-auto mb-1" />
                  <p className="text-xs text-muted-foreground">חריגה מתקציב</p>
                  <p className="text-lg font-bold text-red-700">2 מוצרים</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Simulations */}
        <TabsContent value="simulations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FlaskConical className="h-5 w-5" /> תרחישי What-If
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">סימולציה של שינויים במחירי חומרי גלם, ספקים ותהליכי ייצור</p>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {simulations.map((sim, i) => (
              <Card key={i} className="relative overflow-hidden">
                <div className={`absolute top-0 left-0 w-1.5 h-full ${sim.color.replace("text-", "bg-")}`} />
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-start gap-3 mb-4">
                    <div className={`${sim.bg} p-2 rounded-lg`}>
                      <sim.icon className={`h-5 w-5 ${sim.color}`} />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-sm">{sim.title}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">{sim.desc}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div className="bg-muted/30 rounded-lg p-2.5 text-center">
                      <p className="text-xs text-muted-foreground">עלות מקורית</p>
                      <p className="text-sm font-bold mt-0.5">{fmt(sim.originalCost)}</p>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-2.5 text-center">
                      <p className="text-xs text-muted-foreground">עלות חדשה</p>
                      <p className="text-sm font-bold mt-0.5">{fmt(sim.newCost)}</p>
                    </div>
                    <div className={`rounded-lg p-2.5 text-center ${sim.delta > 0 ? "bg-red-50" : "bg-green-50"}`}>
                      <p className="text-xs text-muted-foreground">הפרש</p>
                      <p className={`text-sm font-bold mt-0.5 ${sim.delta > 0 ? "text-red-600" : "text-green-600"}`}>
                        {sim.delta > 0 ? "+" : ""}{fmt(sim.delta)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-2 border-t">
                    <span className="text-muted-foreground">
                      מוצרים מושפעים: <span className="font-bold text-foreground">{sim.affectedProducts}</span>
                    </span>
                    <Badge variant="outline" className={sim.delta > 0 ? "text-red-600 border-red-200" : "text-green-600 border-green-200"}>
                      {sim.pctDelta > 0 ? "+" : ""}{sim.pctDelta}%
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