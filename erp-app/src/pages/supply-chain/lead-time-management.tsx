import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Clock, TrendingUp, TrendingDown, Minus, AlertTriangle, Zap,
  Shield, Target, Package, Truck, Search, ArrowUpDown, Lightbulb,
} from "lucide-react";

// --- Static mock data ---

const FALLBACK_SUPPLIERS = [
  { name: "Foshan Glass Co.", country: "סין", avgLead: 28, min: 22, max: 35, reliability: 82, trend: "worsening" as const, openOrders: 5, lastDelivery: "2026-03-28" },
  { name: 'Schüco International', country: "גרמניה", avgLead: 14, min: 12, max: 18, reliability: 96, trend: "stable" as const, openOrders: 3, lastDelivery: "2026-04-02" },
  { name: "קבוצת אלומיל", country: "ישראל", avgLead: 7, min: 5, max: 10, reliability: 94, trend: "improving" as const, openOrders: 8, lastDelivery: "2026-04-06" },
  { name: "Hydro Aluminium", country: "נורבגיה", avgLead: 18, min: 15, max: 22, reliability: 91, trend: "stable" as const, openOrders: 2, lastDelivery: "2026-03-30" },
  { name: "Guardian Glass", country: "ארה\"ב", avgLead: 24, min: 20, max: 30, reliability: 88, trend: "improving" as const, openOrders: 4, lastDelivery: "2026-03-25" },
  { name: "YKK AP", country: "יפן", avgLead: 21, min: 18, max: 26, reliability: 93, trend: "stable" as const, openOrders: 3, lastDelivery: "2026-04-01" },
  { name: "Technal (Hydro)", country: "צרפת", avgLead: 16, min: 13, max: 20, reliability: 90, trend: "improving" as const, openOrders: 2, lastDelivery: "2026-04-04" },
  { name: "Tostem (Lixil)", country: "יפן", avgLead: 23, min: 19, max: 28, reliability: 87, trend: "worsening" as const, openOrders: 1, lastDelivery: "2026-03-20" },
  { name: "AGC Glass Europe", country: "בלגיה", avgLead: 17, min: 14, max: 21, reliability: 92, trend: "stable" as const, openOrders: 6, lastDelivery: "2026-04-05" },
  { name: "Pilkington (NSG)", country: "בריטניה", avgLead: 19, min: 16, max: 24, reliability: 89, trend: "stable" as const, openOrders: 2, lastDelivery: "2026-03-27" },
  { name: "Hafele GmbH", country: "גרמניה", avgLead: 12, min: 9, max: 15, reliability: 95, trend: "improving" as const, openOrders: 4, lastDelivery: "2026-04-03" },
  { name: "מפעלי ירון", country: "ישראל", avgLead: 5, min: 3, max: 8, reliability: 97, trend: "stable" as const, openOrders: 7, lastDelivery: "2026-04-07" },
];

const FALLBACK_CATEGORIES = [
  { name: "פרופילי אלומיניום", avgLead: 12, variance: 18, supplierCount: 4 },
  { name: "לוחות זכוכית", avgLead: 22, variance: 25, supplierCount: 3 },
  { name: "פחי פלדה", avgLead: 15, variance: 14, supplierCount: 2 },
  { name: "פרזול ואביזרים", avgLead: 10, variance: 12, supplierCount: 3 },
  { name: "אטמים וגומיות", avgLead: 8, variance: 9, supplierCount: 2 },
  { name: "מחברים וברגים", avgLead: 6, variance: 7, supplierCount: 3 },
  { name: "צבע וציפוי", avgLead: 11, variance: 16, supplierCount: 2 },
  { name: "אריזה", avgLead: 4, variance: 5, supplierCount: 2 },
];

const FALLBACK_ATRISKORDERS = [
  { po: "PO-2026-1847", supplier: "Foshan Glass Co.", promised: "2026-04-05", expected: "2026-04-14", delay: 9, impact: "עיכוב ייצור", mitigation: "הזמנת חירום מ-Guardian Glass" },
  { po: "PO-2026-1862", supplier: "Tostem (Lixil)", promised: "2026-04-08", expected: "2026-04-16", delay: 8, impact: "עיכוב לקוח", mitigation: "עדכון לקוח + תאריך אספקה חדש" },
  { po: "PO-2026-1901", supplier: "Foshan Glass Co.", promised: "2026-04-10", expected: "2026-04-17", delay: 7, impact: "עיכוב ייצור", mitigation: "תיאום עם קו ייצור 2" },
  { po: "PO-2026-1915", supplier: "Guardian Glass", promised: "2026-04-12", expected: "2026-04-18", delay: 6, impact: "עיכוב לקוח", mitigation: "שינוי סדר עדיפויות ייצור" },
  { po: "PO-2026-1923", supplier: "Hydro Aluminium", promised: "2026-04-09", expected: "2026-04-14", delay: 5, impact: "עיכוב ייצור", mitigation: "שימוש במלאי ביטחון" },
  { po: "PO-2026-1938", supplier: "Pilkington (NSG)", promised: "2026-04-11", expected: "2026-04-15", delay: 4, impact: "עיכוב לקוח", mitigation: "אישור לקוח לאיחור" },
  { po: "PO-2026-1950", supplier: "AGC Glass Europe", promised: "2026-04-13", expected: "2026-04-16", delay: 3, impact: "עיכוב ייצור", mitigation: "חומר חלופי מאושר" },
  { po: "PO-2026-1967", supplier: "YKK AP", promised: "2026-04-14", expected: "2026-04-17", delay: 3, impact: "עיכוב לקוח", mitigation: "הזמנה חלופית מ-Hafele" },
];

const FALLBACK_OPTIMIZATIONS = [
  { type: "reduction", title: "קיצור Lead Time לזכוכית", desc: "מעבר לספק אירופי במקום סיני יקצר Lead Time ב-10 ימים בממוצע", saving: "10 ימים", priority: "גבוהה" },
  { type: "reduction", title: "הזמנות מרוכזות לפרזול", desc: "איחוד הזמנות מ-3 ספקים ל-2 עם הנחת כמות ושיפור זמני אספקה", saving: "3 ימים", priority: "בינונית" },
  { type: "safety", title: "מלאי ביטחון פרופילי אלומיניום", desc: "העלאת מלאי ביטחון ל-14 יום לכיסוי שונות Lead Time", saving: "כיסוי 95%", priority: "גבוהה" },
  { type: "safety", title: "מלאי ביטחון אטמים", desc: "שמירה על מלאי 30 יום לרכיבים קריטיים", saving: "כיסוי 99%", priority: "בינונית" },
  { type: "alternative", title: 'ספק חלופי ל-Foshan Glass', desc: "הוספת Saint-Gobain כספק חלופי עם Lead Time של 15 יום", saving: "13 ימים", priority: "גבוהה" },
  { type: "alternative", title: "ספק מקומי לברגים", desc: "מעבר למפעלי ירון לאספקה מהירה של מחברים סטנדרטיים", saving: "8 ימים", priority: "נמוכה" },
  { type: "buffer", title: "חוצץ זמן להזמנות סין", desc: "הוספת 7 ימי חוצץ לכל הזמנות מסין בשל תנודתיות גבוהה", saving: "הפחתת סיכון 40%", priority: "גבוהה" },
  { type: "buffer", title: "חוצץ חגים ועונתיות", desc: "הוספת 5 ימים לפני חגי סוף שנה וראש השנה הסיני", saving: "הפחתת סיכון 25%", priority: "בינונית" },
];


const atRiskOrders = FALLBACK_ATRISKORDERS;
const suppliers = FALLBACK_SUPPLIERS;

// --- Helpers ---

const trendIcon = (trend: "improving" | "stable" | "worsening") => {
  switch (trend) {
    case "improving": return <TrendingDown className="h-4 w-4 text-green-500" />;
    case "stable": return <Minus className="h-4 w-4 text-blue-500" />;
    case "worsening": return <TrendingUp className="h-4 w-4 text-red-500" />;
  }
};

const trendBadge = (trend: "improving" | "stable" | "worsening") => {
  switch (trend) {
    case "improving": return <Badge className="bg-green-500/15 text-green-600 gap-1">{trendIcon(trend)} משתפר</Badge>;
    case "stable": return <Badge className="bg-blue-500/15 text-blue-600 gap-1">{trendIcon(trend)} יציב</Badge>;
    case "worsening": return <Badge className="bg-red-500/15 text-red-600 gap-1">{trendIcon(trend)} מידרדר</Badge>;
  }
};

const priorityBadge = (p: string) => {
  switch (p) {
    case "גבוהה": return <Badge className="bg-red-500/15 text-red-600">גבוהה</Badge>;
    case "בינונית": return <Badge className="bg-amber-500/15 text-amber-600">בינונית</Badge>;
    case "נמוכה": return <Badge className="bg-green-500/15 text-green-600">נמוכה</Badge>;
    default: return null;
  }
};

const typeIcon = (t: string) => {
  switch (t) {
    case "reduction": return <Zap className="h-5 w-5 text-amber-500" />;
    case "safety": return <Shield className="h-5 w-5 text-blue-500" />;
    case "alternative": return <ArrowUpDown className="h-5 w-5 text-purple-500" />;
    case "buffer": return <Clock className="h-5 w-5 text-teal-500" />;
    default: return null;
  }
};

const typeLabel = (t: string) => {
  switch (t) {
    case "reduction": return "קיצור Lead Time";
    case "safety": return "מלאי ביטחון";
    case "alternative": return "ספק חלופי";
    case "buffer": return "חוצץ זמן";
    default: return t;
  }
};

// --- KPI calculations ---

const avgLeadTime = Math.round(suppliers.reduce((s, x) => s + x.avgLead, 0) / suppliers.length);
const fastestSupplier = suppliers.reduce((a, b) => a.avgLead < b.avgLead ? a : b);
const slowestSupplier = suppliers.reduce((a, b) => a.avgLead > b.avgLead ? a : b);
const leadTimeVariance = 22;
const ordersAtRisk = atRiskOrders.length;
const improvementTrend = suppliers.filter(s => s.trend === "improving").length;

// --- Component ---

export default function LeadTimeManagementPage() {
  const { data: apisuppliers } = useQuery({
    queryKey: ["/api/supply-chain/lead-time-management/suppliers"],
    queryFn: () => authFetch("/api/supply-chain/lead-time-management/suppliers").then(r => r.json()).catch(() => null),
  });
  const suppliers = Array.isArray(apisuppliers) ? apisuppliers : (apisuppliers?.data ?? apisuppliers?.items ?? FALLBACK_SUPPLIERS);


  const { data: apicategories } = useQuery({
    queryKey: ["/api/supply-chain/lead-time-management/categories"],
    queryFn: () => authFetch("/api/supply-chain/lead-time-management/categories").then(r => r.json()).catch(() => null),
  });
  const categories = Array.isArray(apicategories) ? apicategories : (apicategories?.data ?? apicategories?.items ?? FALLBACK_CATEGORIES);


  const { data: apiatRiskOrders } = useQuery({
    queryKey: ["/api/supply-chain/lead-time-management/atriskorders"],
    queryFn: () => authFetch("/api/supply-chain/lead-time-management/atriskorders").then(r => r.json()).catch(() => null),
  });
  const atRiskOrders = Array.isArray(apiatRiskOrders) ? apiatRiskOrders : (apiatRiskOrders?.data ?? apiatRiskOrders?.items ?? FALLBACK_ATRISKORDERS);


  const { data: apioptimizations } = useQuery({
    queryKey: ["/api/supply-chain/lead-time-management/optimizations"],
    queryFn: () => authFetch("/api/supply-chain/lead-time-management/optimizations").then(r => r.json()).catch(() => null),
  });
  const optimizations = Array.isArray(apioptimizations) ? apioptimizations : (apioptimizations?.data ?? apioptimizations?.items ?? FALLBACK_OPTIMIZATIONS);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Clock className="h-7 w-7 text-blue-600" />
          ניהול Lead Time - טכנו-כל עוזי
        </h1>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="חיפוש ספק או הזמנה..." className="pr-9 w-64" />
          </div>
          <Button variant="outline">ייצוא דוח</Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-5 w-5 text-blue-600" />
              <span className="text-xs text-muted-foreground">Lead Time ממוצע</span>
            </div>
            <p className="text-2xl font-bold">{avgLeadTime} <span className="text-sm font-normal">ימים</span></p>
            <p className="text-xs text-muted-foreground mt-1">יעד: 14 ימים</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="h-5 w-5 text-green-600" />
              <span className="text-xs text-muted-foreground">ספק מהיר ביותר</span>
            </div>
            <p className="text-lg font-bold">{fastestSupplier.name}</p>
            <p className="text-xs text-muted-foreground mt-1">{fastestSupplier.avgLead} ימים ממוצע</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <Truck className="h-5 w-5 text-red-600" />
              <span className="text-xs text-muted-foreground">ספק איטי ביותר</span>
            </div>
            <p className="text-lg font-bold">{slowestSupplier.name}</p>
            <p className="text-xs text-muted-foreground mt-1">{slowestSupplier.avgLead} ימים ממוצע</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <Target className="h-5 w-5 text-amber-600" />
              <span className="text-xs text-muted-foreground">שונות Lead Time</span>
            </div>
            <p className="text-2xl font-bold">{leadTimeVariance}%</p>
            <p className="text-xs text-muted-foreground mt-1">ממוצע סטיה מיעד</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <span className="text-xs text-muted-foreground">הזמנות בסיכון</span>
            </div>
            <p className="text-2xl font-bold text-red-600">{ordersAtRisk}</p>
            <p className="text-xs text-muted-foreground mt-1">חריגה מיעד</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="h-5 w-5 text-green-600" />
              <span className="text-xs text-muted-foreground">מגמת שיפור</span>
            </div>
            <p className="text-2xl font-bold text-green-600">{improvementTrend}</p>
            <p className="text-xs text-muted-foreground mt-1">ספקים משתפרים</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="suppliers" className="space-y-4">
        <TabsList>
          <TabsTrigger value="suppliers">לפי ספק</TabsTrigger>
          <TabsTrigger value="categories">לפי קטגוריה</TabsTrigger>
          <TabsTrigger value="at-risk">הזמנות בסיכון</TabsTrigger>
          <TabsTrigger value="optimization">אופטימיזציה</TabsTrigger>
        </TabsList>

        {/* Tab 1: By Supplier */}
        <TabsContent value="suppliers">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Package className="h-5 w-5" /> Lead Time לפי ספק
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">ספק</TableHead>
                    <TableHead className="text-right">מדינה</TableHead>
                    <TableHead className="text-right">ממוצע (ימים)</TableHead>
                    <TableHead className="text-right">מינ׳ / מקס׳</TableHead>
                    <TableHead className="text-right">אמינות</TableHead>
                    <TableHead className="text-right">מגמה</TableHead>
                    <TableHead className="text-right">הזמנות פתוחות</TableHead>
                    <TableHead className="text-right">אספקה אחרונה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suppliers.map((s, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>{s.country}</TableCell>
                      <TableCell>
                        <span className={s.avgLead > 20 ? "text-red-600 font-semibold" : s.avgLead > 14 ? "text-amber-600 font-semibold" : "text-green-600 font-semibold"}>
                          {s.avgLead}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{s.min} / {s.max}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={s.reliability} className="h-2 w-16" />
                          <span className="text-sm">{s.reliability}%</span>
                        </div>
                      </TableCell>
                      <TableCell>{trendBadge(s.trend)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{s.openOrders}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{s.lastDelivery}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: By Category */}
        <TabsContent value="categories">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Package className="h-5 w-5" /> Lead Time לפי קטגוריית חומר
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {categories.map((c, i) => (
                  <Card key={i} className="border">
                    <CardContent className="pt-5 pb-4">
                      <h3 className="font-semibold text-base mb-3">{c.name}</h3>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">Lead Time ממוצע</span>
                          <span className={`font-bold ${c.avgLead > 15 ? "text-red-600" : c.avgLead > 10 ? "text-amber-600" : "text-green-600"}`}>
                            {c.avgLead} ימים
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">שונות</span>
                          <span className="font-medium">{c.variance}%</span>
                        </div>
                        <Progress value={100 - c.variance} className="h-2" />
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">ספקים</span>
                          <Badge variant="outline">{c.supplierCount} ספקים</Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: At-Risk Orders */}
        <TabsContent value="at-risk">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <AlertTriangle className="h-5 w-5 text-red-500" /> הזמנות בסיכון ({atRiskOrders.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">מס׳ הזמנה</TableHead>
                    <TableHead className="text-right">ספק</TableHead>
                    <TableHead className="text-right">תאריך מובטח</TableHead>
                    <TableHead className="text-right">תאריך צפוי</TableHead>
                    <TableHead className="text-right">ימי עיכוב</TableHead>
                    <TableHead className="text-right">השפעה</TableHead>
                    <TableHead className="text-right">פעולת מענה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {atRiskOrders.map((o, i) => (
                    <TableRow key={i} className={o.delay >= 7 ? "bg-red-50 dark:bg-red-950/20" : ""}>
                      <TableCell className="font-mono font-medium">{o.po}</TableCell>
                      <TableCell>{o.supplier}</TableCell>
                      <TableCell className="text-muted-foreground">{o.promised}</TableCell>
                      <TableCell className="text-red-600 font-medium">{o.expected}</TableCell>
                      <TableCell>
                        <Badge className={o.delay >= 7 ? "bg-red-500/15 text-red-600" : o.delay >= 5 ? "bg-amber-500/15 text-amber-600" : "bg-yellow-500/15 text-yellow-700"}>
                          {o.delay} ימים
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={o.impact === "עיכוב ייצור" ? "destructive" : "outline"}>
                          {o.impact}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm max-w-[220px]">{o.mitigation}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Optimization */}
        <TabsContent value="optimization">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Lightbulb className="h-5 w-5 text-amber-500" /> הזדמנויות אופטימיזציה
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {optimizations.map((opt, i) => (
                  <Card key={i} className="border">
                    <CardContent className="pt-5 pb-4">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5">{typeIcon(opt.type)}</div>
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center justify-between">
                            <h3 className="font-semibold text-sm">{opt.title}</h3>
                            {priorityBadge(opt.priority)}
                          </div>
                          <p className="text-sm text-muted-foreground">{opt.desc}</p>
                          <div className="flex items-center justify-between pt-1">
                            <Badge variant="outline" className="gap-1">
                              <Target className="h-3 w-3" /> {opt.saving}
                            </Badge>
                            <Badge className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                              {typeLabel(opt.type)}
                            </Badge>
                          </div>
                          <Button variant="outline" size="sm" className="w-full mt-2">יישום המלצה</Button>
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
