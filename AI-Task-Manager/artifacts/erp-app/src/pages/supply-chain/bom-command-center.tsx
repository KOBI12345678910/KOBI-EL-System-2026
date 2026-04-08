import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Layers, FileText, Clock, GitBranch, Box, Target, AlertCircle, Search,
  ChevronLeft, TrendingUp, TrendingDown, ArrowUpDown, Package,
  DollarSign, Wrench, CheckCircle2, Eye, PenLine, Archive, XCircle,
  TreePine, ChevronDown, ChevronUp, Minus,
} from "lucide-react";
import { useState } from "react";

// ── Mock Data ──────────────────────────────────────────────────────────────

const kpis = [
  { label: "סה\"כ BOMs", value: 247, icon: Layers, color: "text-blue-600", bg: "bg-blue-50" },
  { label: "BOMs פעילים", value: 189, icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50" },
  { label: "גרסאות ממתינות", value: 14, icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
  { label: "עומק ממוצע (שכבות)", value: 4.2, icon: GitBranch, color: "text-purple-600", bg: "bg-purple-50" },
  { label: "רכיבים כלליים", value: 1843, icon: Box, color: "text-indigo-600", bg: "bg-indigo-50" },
  { label: "דיוק עלויות", value: "96.4%", icon: Target, color: "text-teal-600", bg: "bg-teal-50" },
  { label: "ECOs פתוחים", value: 8, icon: AlertCircle, color: "text-red-600", bg: "bg-red-50" },
  { label: "BOMs לבדיקה", value: 23, icon: Eye, color: "text-orange-600", bg: "bg-orange-50" },
];

const statusData = [
  { label: "טיוטה", count: 35, color: "bg-slate-500", textColor: "text-slate-700", bgLight: "bg-slate-50", icon: PenLine },
  { label: "פעיל", count: 189, color: "bg-green-500", textColor: "text-green-700", bgLight: "bg-green-50", icon: CheckCircle2 },
  { label: "בארכיון", count: 18, color: "bg-blue-500", textColor: "text-blue-700", bgLight: "bg-blue-50", icon: Archive },
  { label: "מבוטל", count: 5, color: "bg-red-500", textColor: "text-red-700", bgLight: "bg-red-50", icon: XCircle },
];

const topProducts = [
  { name: "חלון אלומיניום כפול TK-W200", levels: 6, components: 87, lastChange: "05/04/2026", status: "פעיל" },
  { name: "קיר מסך CW-5000 Premium", levels: 7, components: 124, lastChange: "03/04/2026", status: "פעיל" },
  { name: "דלת זכוכית מחוסמת GD-300", levels: 5, components: 63, lastChange: "01/04/2026", status: "פעיל" },
  { name: "מסגרת פלדה SF-150 Heavy", levels: 5, components: 58, lastChange: "30/03/2026", status: "בדיקה" },
  { name: "חלון גג SL-900 Solar", levels: 6, components: 95, lastChange: "28/03/2026", status: "פעיל" },
  { name: "מעקה בטיחות RL-400", levels: 4, components: 42, lastChange: "25/03/2026", status: "פעיל" },
  { name: "חלון אלומיניום הרמה TK-W350", levels: 5, components: 76, lastChange: "22/03/2026", status: "טיוטה" },
  { name: "דלת כניסה מעוצבת GD-500", levels: 6, components: 91, lastChange: "20/03/2026", status: "פעיל" },
  { name: "קיר מסך CW-3000 Standard", levels: 5, components: 68, lastChange: "18/03/2026", status: "פעיל" },
  { name: "חלון גג SL-600 Basic", levels: 4, components: 52, lastChange: "15/03/2026", status: "פעיל" },
];

const recentChanges = [
  { product: "CW-5000 Premium", change: "הוספת רכיב איטום חדש", by: "מוטי כהן", date: "05/04/2026" },
  { product: "TK-W200", change: "עדכון כמות ברגים M6", by: "שרון לוי", date: "04/04/2026" },
  { product: "GD-300", change: "החלפת ספק זכוכית", by: "דני אברהם", date: "03/04/2026" },
  { product: "SF-150 Heavy", change: "עדכון עובי פלדה 3mm→4mm", by: "אילן רז", date: "01/04/2026" },
  { product: "SL-900 Solar", change: "הוספת פנל סולארי משולב", by: "יעל מזרחי", date: "30/03/2026" },
];

const productsWithoutBom = [
  { sku: "TK-W500", name: "חלון אלומיניום מיני", category: "חלונות אלומיניום", createdDate: "02/04/2026" },
  { sku: "GD-150", name: "דלת זכוכית דקורטיבית", category: "דלתות זכוכית", createdDate: "28/03/2026" },
  { sku: "RL-250", name: "מעקה זכוכית מעוקל", category: "מעקות", createdDate: "20/03/2026" },
];

const productFamilies = [
  {
    name: "חלונות אלומיניום", icon: "🪟", subProducts: 38, components: 412,
    totalCost: 2850000, expanded: false,
    items: [
      { name: "TK-W200 כפול", components: 87, cost: 1250 },
      { name: "TK-W350 הרמה", components: 76, cost: 1680 },
      { name: "TK-W100 בסיסי", components: 34, cost: 580 },
    ],
  },
  {
    name: "דלתות זכוכית", icon: "🚪", subProducts: 24, components: 298,
    totalCost: 1920000, expanded: false,
    items: [
      { name: "GD-300 מחוסמת", components: 63, cost: 2100 },
      { name: "GD-500 כניסה", components: 91, cost: 3400 },
      { name: "GD-100 פנימית", components: 28, cost: 750 },
    ],
  },
  {
    name: "מסגרות פלדה", icon: "🔩", subProducts: 31, components: 387,
    totalCost: 2100000, expanded: false,
    items: [
      { name: "SF-150 Heavy", components: 58, cost: 1800 },
      { name: "SF-100 Standard", components: 42, cost: 1100 },
      { name: "SF-200 Industrial", components: 73, cost: 2600 },
    ],
  },
  {
    name: "קירות מסך", icon: "🏗️", subProducts: 18, components: 356,
    totalCost: 4200000, expanded: false,
    items: [
      { name: "CW-5000 Premium", components: 124, cost: 8500 },
      { name: "CW-3000 Standard", components: 68, cost: 4200 },
      { name: "CW-1000 Basic", components: 45, cost: 2800 },
    ],
  },
  {
    name: "חלונות גג", icon: "☀️", subProducts: 15, components: 218,
    totalCost: 1650000, expanded: false,
    items: [
      { name: "SL-900 Solar", components: 95, cost: 4500 },
      { name: "SL-600 Basic", components: 52, cost: 2200 },
      { name: "SL-300 Manual", components: 31, cost: 1100 },
    ],
  },
  {
    name: "מעקות", icon: "🛡️", subProducts: 21, components: 172,
    totalCost: 980000, expanded: false,
    items: [
      { name: "RL-400 בטיחות", components: 42, cost: 950 },
      { name: "RL-300 דקורטיבי", components: 36, cost: 1200 },
      { name: "RL-100 פשוט", components: 18, cost: 420 },
    ],
  },
];

const costData = [
  { family: "חלונות אלומיניום", material: 1850000, labor: 620000, overhead: 380000, variance: -2.3 },
  { family: "דלתות זכוכית", material: 1250000, labor: 410000, overhead: 260000, variance: 1.8 },
  { family: "מסגרות פלדה", material: 1380000, labor: 450000, overhead: 270000, variance: -4.1 },
  { family: "קירות מסך", material: 2750000, labor: 920000, overhead: 530000, variance: 3.2 },
  { family: "חלונות גג", material: 1050000, labor: 380000, overhead: 220000, variance: -1.5 },
  { family: "מעקות", material: 620000, labor: 220000, overhead: 140000, variance: 0.8 },
];

const topExpensiveBoms = [
  { name: "קיר מסך CW-5000 Premium", cost: 8500, components: 124, trend: "up" },
  { name: "חלון גג SL-900 Solar", cost: 4500, components: 95, trend: "up" },
  { name: "קיר מסך CW-3000 Standard", cost: 4200, components: 68, trend: "stable" },
  { name: "דלת כניסה GD-500", cost: 3400, components: 91, trend: "down" },
  { name: "קיר מסך CW-1000 Basic", cost: 2800, components: 45, trend: "stable" },
];

const ecoData = [
  {
    id: "ECO-2026-041", product: "CW-5000 Premium", changeType: "הוספת רכיב",
    reason: "שיפור בידוד תרמי לעמידה בתקן SI 1045", requestor: "מוטי כהן",
    status: "approved", impact: "עלות +₪120, זמן ייצור +15 דקות",
  },
  {
    id: "ECO-2026-040", product: "TK-W200", changeType: "שינוי כמות",
    reason: "הגדלת עובי דופן מ-1.4mm ל-1.8mm", requestor: "שרון לוי",
    status: "implemented", impact: "עלות +₪45, חוזק +22%",
  },
  {
    id: "ECO-2026-039", product: "GD-300", changeType: "החלפת רכיב",
    reason: "ספק זכוכית נוכחי הפסיק ייצור דגם", requestor: "דני אברהם",
    status: "review", impact: "עלות +₪80, Lead Time -3 ימים",
  },
  {
    id: "ECO-2026-038", product: "SF-150 Heavy", changeType: "הוספת רכיב",
    reason: "הוספת חיזוק פינתי לפי דרישת מהנדס", requestor: "אילן רז",
    status: "draft", impact: "עלות +₪35, משקל +0.8 ק\"ג",
  },
  {
    id: "ECO-2026-037", product: "SL-900 Solar", changeType: "הוספת רכיב",
    reason: "שילוב פנל סולארי למערכת פתיחה אוטומטית", requestor: "יעל מזרחי",
    status: "approved", impact: "עלות +₪650, ערך מוסף גבוה",
  },
  {
    id: "ECO-2026-036", product: "RL-400", changeType: "הסרת רכיב",
    reason: "ביטול מחבר מיותר - פישוט הרכבה", requestor: "עמית גולן",
    status: "implemented", impact: "עלות -₪18, זמן הרכבה -8 דקות",
  },
  {
    id: "ECO-2026-035", product: "CW-3000 Standard", changeType: "החלפת רכיב",
    reason: "מעבר לאטם סיליקון עמיד UV", requestor: "רותם בן-דוד",
    status: "review", impact: "עלות +₪25, אחריות +5 שנים",
  },
  {
    id: "ECO-2026-034", product: "TK-W350", changeType: "שינוי כמות",
    reason: "הפחתת ברגים מ-24 ל-18 ללא פגיעה בחוזק", requestor: "שרון לוי",
    status: "draft", impact: "עלות -₪12, זמן הרכבה -5 דקות",
  },
];

// ── Helper Functions ───────────────────────────────────────────────────────

const formatCurrency = (val: number) =>
  "₪" + val.toLocaleString("he-IL");

const statusBadge = (status: string) => {
  const map: Record<string, { label: string; className: string }> = {
    "פעיל": { label: "פעיל", className: "bg-green-500/15 text-green-700 hover:bg-green-500/25" },
    "טיוטה": { label: "טיוטה", className: "bg-slate-500/15 text-slate-700 hover:bg-slate-500/25" },
    "בדיקה": { label: "בדיקה", className: "bg-amber-500/15 text-amber-700 hover:bg-amber-500/25" },
  };
  const s = map[status] || { label: status, className: "bg-gray-100 text-gray-700" };
  return <Badge className={s.className}>{s.label}</Badge>;
};

const ecoStatusBadge = (status: string) => {
  const map: Record<string, { label: string; className: string }> = {
    draft: { label: "טיוטה", className: "bg-slate-500/15 text-slate-700" },
    review: { label: "בבדיקה", className: "bg-amber-500/15 text-amber-700" },
    approved: { label: "מאושר", className: "bg-blue-500/15 text-blue-700" },
    implemented: { label: "יושם", className: "bg-green-500/15 text-green-700" },
  };
  const s = map[status] || { label: status, className: "bg-gray-100 text-gray-700" };
  return <Badge className={s.className}>{s.label}</Badge>;
};

const changeTypeBadge = (type: string) => {
  const map: Record<string, string> = {
    "הוספת רכיב": "bg-emerald-500/15 text-emerald-700",
    "הסרת רכיב": "bg-red-500/15 text-red-700",
    "החלפת רכיב": "bg-purple-500/15 text-purple-700",
    "שינוי כמות": "bg-sky-500/15 text-sky-700",
  };
  return <Badge className={map[type] || "bg-gray-100 text-gray-700"}>{type}</Badge>;
};

const trendIcon = (trend: string) => {
  if (trend === "up") return <TrendingUp className="h-4 w-4 text-red-500" />;
  if (trend === "down") return <TrendingDown className="h-4 w-4 text-green-500" />;
  return <Minus className="h-4 w-4 text-gray-400" />;
};

// ── Component ──────────────────────────────────────────────────────────────

export default function BomCommandCenter() {
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedFamilies, setExpandedFamilies] = useState<Set<number>>(new Set());

  const toggleFamily = (idx: number) => {
    setExpandedFamilies((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const totalBoms = statusData.reduce((s, d) => s + d.count, 0);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Layers className="h-7 w-7 text-blue-600" />
            מרכז פיקוד BOM - טכנו-כל עוזי
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            ניהול מבנה מוצרים, גרסאות, עלויות ושינויים הנדסיים
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="חיפוש BOM..."
              className="pr-9 w-64"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Button variant="outline" size="sm">
            <FileText className="h-4 w-4 ml-1" /> ייצוא דוח
          </Button>
          <Button size="sm">
            <Package className="h-4 w-4 ml-1" /> BOM חדש
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        {kpis.map((kpi, i) => (
          <Card key={i} className="hover:shadow-md transition-shadow">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-lg ${kpi.bg}`}>
                  <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">{kpi.label}</p>
                  <p className="text-xl font-bold mt-0.5">{kpi.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* BOM Status Distribution */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ArrowUpDown className="h-5 w-5 text-blue-500" /> סטטוס BOM
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4">
            {statusData.map((s, i) => (
              <div key={i} className={`${s.bgLight} rounded-xl p-4 border`}>
                <div className="flex items-center gap-2 mb-2">
                  <s.icon className={`h-4 w-4 ${s.textColor}`} />
                  <span className={`text-sm font-medium ${s.textColor}`}>{s.label}</span>
                </div>
                <p className={`text-3xl font-bold ${s.textColor}`}>{s.count}</p>
                <div className="mt-2">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>{((s.count / totalBoms) * 100).toFixed(1)}%</span>
                  </div>
                  <Progress value={(s.count / totalBoms) * 100} className="h-1.5" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Main Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">סקירה</TabsTrigger>
          <TabsTrigger value="tree">עץ מוצרים</TabsTrigger>
          <TabsTrigger value="costs">עלויות</TabsTrigger>
          <TabsTrigger value="eco">ECO</TabsTrigger>
        </TabsList>

        {/* ── Tab: Overview ─────────────────────────────────────────── */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            {/* Top 10 Products */}
            <Card className="col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Top 10 מוצרים לפי מורכבות BOM</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {topProducts.map((p, i) => (
                    <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors border border-transparent hover:border-border">
                      <span className="text-sm font-bold text-muted-foreground w-5 text-center">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.levels} שכבות | {p.components} רכיבים | עדכון: {p.lastChange}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-left w-14">
                          <Progress value={(p.components / 130) * 100} className="h-1.5" />
                        </div>
                        {statusBadge(p.status)}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Right column */}
            <div className="space-y-4">
              {/* Recent Changes */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="h-4 w-4" /> שינויים אחרונים
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {recentChanges.map((c, i) => (
                      <div key={i} className="border-r-2 border-blue-400 pr-3 py-1">
                        <p className="text-sm font-medium">{c.product}</p>
                        <p className="text-xs text-muted-foreground">{c.change}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {c.by} | {c.date}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Products without BOM */}
              <Card className="border-amber-200 bg-amber-50/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2 text-amber-700">
                    <AlertCircle className="h-4 w-4" /> מוצרים ללא BOM
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {productsWithoutBom.map((p, i) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded bg-white border">
                        <div>
                          <p className="text-sm font-medium">{p.sku} - {p.name}</p>
                          <p className="text-xs text-muted-foreground">{p.category} | נוצר: {p.createdDate}</p>
                        </div>
                        <Button variant="outline" size="sm" className="text-xs h-7">
                          צור BOM
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ── Tab: Product Tree ─────────────────────────────────────── */}
        <TabsContent value="tree" className="space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-base font-semibold flex items-center gap-2">
              <TreePine className="h-5 w-5 text-green-600" /> עץ משפחות מוצרים
            </h3>
            <p className="text-sm text-muted-foreground">6 משפחות | 147 תת-מוצרים | 1,843 רכיבים</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {productFamilies.map((fam, idx) => (
              <Card key={idx} className="overflow-hidden">
                <div
                  className="p-4 cursor-pointer hover:bg-muted/40 transition-colors"
                  onClick={() => toggleFamily(idx)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{fam.icon}</span>
                      <div>
                        <p className="font-semibold">{fam.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {fam.subProducts} מוצרים | {fam.components} רכיבים
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-blue-700">
                        {formatCurrency(fam.totalCost)}
                      </span>
                      {expandedFamilies.has(idx)
                        ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      }
                    </div>
                  </div>
                </div>
                {expandedFamilies.has(idx) && (
                  <div className="border-t bg-muted/20 px-4 py-3">
                    <div className="space-y-2">
                      {fam.items.map((item, j) => (
                        <div key={j} className="flex items-center justify-between py-2 px-3 bg-white rounded border">
                          <div className="flex items-center gap-2">
                            <ChevronLeft className="h-3 w-3 text-muted-foreground" />
                            <span className="text-sm">{item.name}</span>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span>{item.components} רכיבים</span>
                            <span className="font-medium text-foreground">{formatCurrency(item.cost)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ── Tab: Costs ────────────────────────────────────────────── */}
        <TabsContent value="costs" className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            {/* Cost Summary Table */}
            <Card className="col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-green-600" /> סיכום עלויות BOM לפי משפחה
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="grid grid-cols-6 gap-2 text-xs font-medium text-muted-foreground pb-2 border-b">
                    <span className="col-span-1">משפחה</span>
                    <span className="text-center">חומרים</span>
                    <span className="text-center">עבודה</span>
                    <span className="text-center">תקורה</span>
                    <span className="text-center">סה"כ</span>
                    <span className="text-center">שונות vs רבעון קודם</span>
                  </div>
                  {costData.map((c, i) => {
                    const total = c.material + c.labor + c.overhead;
                    return (
                      <div key={i} className="grid grid-cols-6 gap-2 items-center py-2 border-b border-dashed last:border-0">
                        <span className="text-sm font-medium">{c.family}</span>
                        <span className="text-sm text-center">{formatCurrency(c.material)}</span>
                        <span className="text-sm text-center">{formatCurrency(c.labor)}</span>
                        <span className="text-sm text-center">{formatCurrency(c.overhead)}</span>
                        <span className="text-sm text-center font-bold">{formatCurrency(total)}</span>
                        <div className="flex items-center justify-center gap-1">
                          {c.variance > 0
                            ? <TrendingUp className="h-3.5 w-3.5 text-red-500" />
                            : <TrendingDown className="h-3.5 w-3.5 text-green-500" />
                          }
                          <span className={`text-sm font-medium ${c.variance > 0 ? "text-red-600" : "text-green-600"}`}>
                            {c.variance > 0 ? "+" : ""}{c.variance}%
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  <div className="grid grid-cols-6 gap-2 items-center pt-3 border-t-2 font-bold text-sm">
                    <span>סה"כ</span>
                    <span className="text-center">{formatCurrency(costData.reduce((s, c) => s + c.material, 0))}</span>
                    <span className="text-center">{formatCurrency(costData.reduce((s, c) => s + c.labor, 0))}</span>
                    <span className="text-center">{formatCurrency(costData.reduce((s, c) => s + c.overhead, 0))}</span>
                    <span className="text-center text-blue-700">
                      {formatCurrency(costData.reduce((s, c) => s + c.material + c.labor + c.overhead, 0))}
                    </span>
                    <span />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Top 5 Expensive BOMs */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-red-500" /> 5 ה-BOMs היקרים ביותר
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {topExpensiveBoms.map((b, i) => (
                    <div key={i} className="p-3 rounded-lg border hover:bg-muted/30 transition-colors">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium">{b.name}</span>
                        {trendIcon(b.trend)}
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">{b.components} רכיבים</span>
                        <span className="text-sm font-bold text-blue-700">{formatCurrency(b.cost)}</span>
                      </div>
                      <Progress value={(b.cost / 9000) * 100} className="h-1 mt-2" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Cost breakdown bar visualization */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">פילוח עלויות לפי משפחה</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {costData.map((c, i) => {
                  const total = c.material + c.labor + c.overhead;
                  const maxTotal = 4200000;
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-sm w-32 text-left">{c.family}</span>
                      <div className="flex-1 flex h-6 rounded overflow-hidden">
                        <div
                          className="bg-blue-500 flex items-center justify-center"
                          style={{ width: `${(c.material / maxTotal) * 100}%` }}
                        >
                          <span className="text-[10px] text-white font-medium">חומרים</span>
                        </div>
                        <div
                          className="bg-amber-500 flex items-center justify-center"
                          style={{ width: `${(c.labor / maxTotal) * 100}%` }}
                        >
                          <span className="text-[10px] text-white font-medium">עבודה</span>
                        </div>
                        <div
                          className="bg-purple-500 flex items-center justify-center"
                          style={{ width: `${(c.overhead / maxTotal) * 100}%` }}
                        >
                          <span className="text-[10px] text-white font-medium">תקורה</span>
                        </div>
                      </div>
                      <span className="text-sm font-bold w-24 text-left">{formatCurrency(total)}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-4 mt-4 pt-3 border-t text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-blue-500" /> חומרים</div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-amber-500" /> עבודה</div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-purple-500" /> תקורה</div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: ECO ──────────────────────────────────────────────── */}
        <TabsContent value="eco" className="space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-base font-semibold flex items-center gap-2">
              <Wrench className="h-5 w-5 text-orange-600" /> הוראות שינוי הנדסי (ECO)
            </h3>
            <div className="flex gap-2">
              <Badge className="bg-slate-500/15 text-slate-700">2 טיוטות</Badge>
              <Badge className="bg-amber-500/15 text-amber-700">2 בבדיקה</Badge>
              <Badge className="bg-blue-500/15 text-blue-700">2 מאושרים</Badge>
              <Badge className="bg-green-500/15 text-green-700">2 יושמו</Badge>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {ecoData.map((eco, i) => (
              <Card key={i} className="hover:shadow-md transition-shadow">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono font-bold text-blue-700">{eco.id}</span>
                      {ecoStatusBadge(eco.status)}
                    </div>
                    {changeTypeBadge(eco.changeType)}
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-16">מוצר:</span>
                      <span className="text-sm font-medium">{eco.product}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-xs text-muted-foreground w-16 shrink-0">סיבה:</span>
                      <span className="text-sm">{eco.reason}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-16">מבקש:</span>
                      <span className="text-sm">{eco.requestor}</span>
                    </div>
                    <div className="flex items-start gap-2 bg-muted/50 rounded p-2 mt-1">
                      <span className="text-xs text-muted-foreground w-16 shrink-0">השפעה:</span>
                      <span className="text-sm font-medium">{eco.impact}</span>
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