import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Shield, FileCheck, TrendingUp, Wallet, Clock, AlertTriangle,
  Search, BarChart3, ArrowUpRight, ArrowDownRight, CheckCircle2,
  XCircle, Calendar, Package, Wrench, CreditCard, FileText, Users
} from "lucide-react";

const FALLBACK_KPIS = [
  { label: "אחריות פעילות", value: 248, icon: Shield, color: "text-blue-500", bg: "bg-blue-50", change: "+12", up: true },
  { label: "תביעות החודש", value: 8, icon: FileCheck, color: "text-amber-500", bg: "bg-amber-50", change: "+2", up: true },
  { label: "שיעור תביעות", value: "3.2%", icon: TrendingUp, color: "text-red-500", bg: "bg-red-50", change: "+0.4%", up: true },
  { label: "עלות תביעה ממוצעת ₪", value: "2,850", icon: Wallet, color: "text-orange-500", bg: "bg-orange-50", change: "-180", up: false },
  { label: "עתודת אחריות ₪", value: "145,000", icon: CreditCard, color: "text-green-500", bg: "bg-green-50", change: "+8,000", up: true },
  { label: "פוקעות (90 יום)", value: 34, icon: Clock, color: "text-purple-500", bg: "bg-purple-50", change: "+5", up: true },
];

const FALLBACK_WARRANTIES = [
  { id: "WR-2001", product: "חלון הזזה כפול 200x160", customer: "אלומיניום הצפון בע\"מ", start: "15/01/2025", end: "15/01/2030", status: "פעיל", terms: "5 שנים - מנגנון + אטימות" },
  { id: "WR-2002", product: "זכוכית מחוסמת 10 מ\"מ", customer: "זגוגית השרון", start: "20/03/2025", end: "20/03/2028", status: "פעיל", terms: "3 שנים - שלמות מבנית" },
  { id: "WR-2003", product: "דלת כניסה מפלדה", customer: "בניין ירוק בע\"מ", start: "01/06/2024", end: "01/06/2027", status: "פעיל", terms: "3 שנים - מנעול + צירים" },
  { id: "WR-2004", product: "מעקה אלומיניום מרפסת", customer: "פרויקט מגדלי ים", start: "10/09/2023", end: "10/09/2028", status: "פעיל", terms: "5 שנים - ייצור + ציפוי" },
  { id: "WR-2005", product: "תריס חשמלי", customer: "מתכת פלוס", start: "05/02/2024", end: "05/02/2026", status: "עומד לפוג", terms: "2 שנים - מנוע + שלט" },
  { id: "WR-2006", product: "ויטרינה חנות 3x2.5 מ'", customer: "סטודיו אדריכלים לב", start: "18/07/2025", end: "18/07/2030", status: "פעיל", terms: "5 שנים - מבנה + אטימות" },
  { id: "WR-2007", product: "פרגולת אלומיניום", customer: "קבלן שמעון אלון", start: "22/11/2023", end: "22/11/2025", status: "פג", terms: "2 שנים - מבנה" },
  { id: "WR-2008", product: "מחיצת זכוכית משרדית", customer: "חברת בנייה אופק", start: "14/04/2025", end: "14/04/2028", status: "פעיל", terms: "3 שנים - מבנה + פרזול" },
  { id: "WR-2009", product: "חלון ציר 70 סדרה", customer: "אלומטל תעשיות", start: "30/08/2024", end: "30/08/2029", status: "פעיל", terms: "5 שנים - מנגנון + אטימות" },
  { id: "WR-2010", product: "גדר אלומיניום דקורטיבית", customer: "זכוכית אילת", start: "12/05/2024", end: "12/05/2027", status: "תביעה", terms: "3 שנים - ציפוי + מבנה" },
  { id: "WR-2011", product: "פרופיל תרמי TH60", customer: "מפעלי גולן מתכת", start: "08/01/2025", end: "08/01/2030", status: "פעיל", terms: "5 שנים - בידוד תרמי" },
  { id: "WR-2012", product: "דלת הזזה אוטומטית", customer: "קליל תעשיות", start: "25/10/2024", end: "25/10/2026", status: "עומד לפוג", terms: "2 שנים - מנוע + מסילה" },
];

const FALLBACK_CLAIMS = [
  { id: "CL-401", warranty: "WR-2010", customer: "זכוכית אילת", product: "גדר אלומיניום דקורטיבית", issue: "התקלפות ציפוי אבקתי", filed: "02/04/2026", assessment: "מאושר - פגם ציפוי", cost: 4200, status: "אושר" },
  { id: "CL-402", warranty: "WR-2005", customer: "מתכת פלוס", product: "תריס חשמלי", issue: "תקלת מנוע חשמלי", filed: "05/04/2026", assessment: "בבדיקה", cost: 0, status: "בבדיקה" },
  { id: "CL-403", warranty: "WR-2003", customer: "בניין ירוק בע\"מ", product: "דלת כניסה מפלדה", issue: "ציר עליון שבור", filed: "01/04/2026", assessment: "מאושר - בלאי מוקדם", cost: 1800, status: "בתיקון" },
  { id: "CL-404", warranty: "WR-2001", customer: "אלומיניום הצפון בע\"מ", product: "חלון הזזה כפול", issue: "אטימה לקויה", filed: "07/04/2026", assessment: "בבדיקה", cost: 0, status: "בבדיקה" },
  { id: "CL-405", warranty: "WR-2009", customer: "אלומטל תעשיות", product: "חלון ציר 70 סדרה", issue: "ידית נשברה", filed: "03/04/2026", assessment: "נדחה - שימוש לא תקין", cost: 0, status: "נדחה" },
  { id: "CL-406", warranty: "WR-2004", customer: "פרויקט מגדלי ים", product: "מעקה אלומיניום מרפסת", issue: "חלודה בחיבורים", filed: "06/04/2026", assessment: "מאושר - תיקון אחריות", cost: 3200, status: "בתיקון" },
  { id: "CL-407", warranty: "WR-2006", customer: "סטודיו אדריכלים לב", product: "ויטרינה חנות", issue: "רטיבות חודרת", filed: "08/04/2026", assessment: "ממתין לבדיקת שטח", cost: 0, status: "בבדיקה" },
  { id: "CL-408", warranty: "WR-2011", customer: "מפעלי גולן מתכת", product: "פרופיל תרמי TH60", issue: "ירידת בידוד", filed: "04/04/2026", assessment: "מאושר - החלפת איטום", cost: 2600, status: "הושלם" },
];

const FALLBACK_COVERAGE_TERMS = [
  { category: "חלונות ודלתות", structural: "5 שנים", mechanism: "5 שנים", sealing: "5 שנים", coating: "3 שנים", electrical: "-" },
  { category: "מעקות וגדרות", structural: "5 שנים", mechanism: "-", sealing: "-", coating: "3 שנים", electrical: "-" },
  { category: "תריסים חשמליים", structural: "3 שנים", mechanism: "2 שנים", sealing: "2 שנים", coating: "3 שנים", electrical: "2 שנים" },
  { category: "ויטרינות ומחיצות", structural: "5 שנים", mechanism: "3 שנים", sealing: "5 שנים", coating: "3 שנים", electrical: "-" },
  { category: "פרגולות ומבנים", structural: "3 שנים", mechanism: "-", sealing: "2 שנים", coating: "3 שנים", electrical: "-" },
  { category: "פרופילים תרמיים", structural: "5 שנים", mechanism: "-", sealing: "5 שנים", coating: "-", electrical: "-" },
];

const FALLBACK_FINANCIALS = [
  { month: "ינואר 2026", claims: 5, totalCost: 11200, reserve: 130000, utilization: "8.6%" },
  { month: "פברואר 2026", claims: 6, totalCost: 14800, reserve: 135000, utilization: "11.0%" },
  { month: "מרץ 2026", claims: 7, totalCost: 18500, reserve: 140000, utilization: "13.2%" },
  { month: "אפריל 2026", claims: 8, totalCost: 11800, reserve: 145000, utilization: "8.1%" },
];

const warrantyStatusColor: Record<string, string> = {
  "פעיל": "bg-green-100 text-green-700",
  "עומד לפוג": "bg-amber-100 text-amber-700",
  "פג": "bg-gray-100 text-gray-600",
  "תביעה": "bg-red-100 text-red-700",
};

const claimStatusColor: Record<string, string> = {
  "בבדיקה": "bg-amber-100 text-amber-700",
  "אושר": "bg-green-100 text-green-700",
  "בתיקון": "bg-blue-100 text-blue-700",
  "נדחה": "bg-red-100 text-red-700",
  "הושלם": "bg-purple-100 text-purple-700",
};

export default function WarrantyManagement() {
  const { data: warrantymanagementData } = useQuery({
    queryKey: ["warranty-management"],
    queryFn: () => authFetch("/api/customer-service/warranty_management"),
    staleTime: 5 * 60 * 1000,
  });

  const kpis = warrantymanagementData ?? FALLBACK_KPIS;

  const [search, setSearch] = useState("");

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-7 w-7 text-blue-600" />
            ניהול אחריות - טכנו-כל עוזי
          </h1>
          <p className="text-sm text-muted-foreground mt-1">תעודות אחריות, תביעות וכיסוי מוצרים</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><BarChart3 className="h-4 w-4 ml-1" />דוחות</Button>
          <Button size="sm"><FileText className="h-4 w-4 ml-1" />אחריות חדשה</Button>
        </div>
      </div>

      {/* 6 KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((k, i) => {
          const Icon = k.icon;
          return (
            <Card key={i}>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center justify-between mb-2">
                  <div className={`p-2 rounded-lg ${k.bg}`}><Icon className={`h-5 w-5 ${k.color}`} /></div>
                  <span className={`text-xs font-medium flex items-center gap-0.5 ${!k.up ? "text-green-600" : k.label === "אחריות פעילות" || k.label === "עתודת אחריות ₪" ? "text-green-600" : "text-red-600"}`}>
                    {k.up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    {k.change}
                  </span>
                </div>
                <p className="text-2xl font-bold">{k.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{k.label}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="warranties" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="warranties">תעודות אחריות</TabsTrigger>
          <TabsTrigger value="claims">תביעות</TabsTrigger>
          <TabsTrigger value="coverage">כיסוי</TabsTrigger>
          <TabsTrigger value="financials">פיננסי</TabsTrigger>
        </TabsList>

        {/* Warranties Tab */}
        <TabsContent value="warranties" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">תעודות אחריות</CardTitle>
                <div className="relative w-64">
                  <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="חיפוש אחריות..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-right p-3 font-medium text-muted-foreground">מזהה</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">מוצר</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">לקוח</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">תחילה</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">סיום</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">סטטוס</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">תנאים</th>
                    </tr>
                  </thead>
                  <tbody>
                    {warranties
                      .filter(w => !search || Object.values(w).some(v => v.includes(search)))
                      .map((w, i) => (
                        <tr key={i} className="border-b hover:bg-muted/50 transition-colors">
                          <td className="p-3 font-mono text-xs font-bold">{w.id}</td>
                          <td className="p-3 font-medium">{w.product}</td>
                          <td className="p-3">{w.customer}</td>
                          <td className="p-3 text-xs">{w.start}</td>
                          <td className="p-3 text-xs">{w.end}</td>
                          <td className="p-3"><Badge className={warrantyStatusColor[w.status]}>{w.status}</Badge></td>
                          <td className="p-3 text-xs text-muted-foreground">{w.terms}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Claims Tab */}
        <TabsContent value="claims" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2"><FileCheck className="h-5 w-5 text-amber-500" />תביעות אחריות</CardTitle>
                <Badge className="bg-amber-100 text-amber-700">8 תביעות החודש</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-right p-3 font-medium text-muted-foreground">מזהה</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">לקוח</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">מוצר</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">תקלה</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">הערכה</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">עלות ₪</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {claims.map((c, i) => (
                      <tr key={i} className="border-b hover:bg-muted/50 transition-colors">
                        <td className="p-3 font-mono text-xs font-bold">{c.id}</td>
                        <td className="p-3 font-medium">{c.customer}</td>
                        <td className="p-3">{c.product}</td>
                        <td className="p-3">{c.issue}</td>
                        <td className="p-3 text-xs">{c.assessment}</td>
                        <td className="p-3 font-bold">{c.cost > 0 ? c.cost.toLocaleString() : "-"}</td>
                        <td className="p-3"><Badge className={claimStatusColor[c.status]}>{c.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-5 text-center">
                <CheckCircle2 className="h-6 w-6 mx-auto text-green-500 mb-1" />
                <p className="text-2xl font-bold text-green-600">4</p>
                <p className="text-xs text-muted-foreground">אושרו</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 text-center">
                <Clock className="h-6 w-6 mx-auto text-amber-500 mb-1" />
                <p className="text-2xl font-bold text-amber-600">3</p>
                <p className="text-xs text-muted-foreground">בבדיקה</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 text-center">
                <XCircle className="h-6 w-6 mx-auto text-red-500 mb-1" />
                <p className="text-2xl font-bold text-red-600">1</p>
                <p className="text-xs text-muted-foreground">נדחו</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 text-center">
                <Wallet className="h-6 w-6 mx-auto text-blue-500 mb-1" />
                <p className="text-2xl font-bold">₪11,800</p>
                <p className="text-xs text-muted-foreground">עלות כוללת</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Coverage Tab */}
        <TabsContent value="coverage" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2"><Package className="h-5 w-5 text-blue-500" />תנאי אחריות לפי קטגוריית מוצר</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-right p-3 font-medium text-muted-foreground">קטגוריה</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">מבני</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">מנגנון</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">אטימות</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">ציפוי</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">חשמלי</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coverageTerms.map((ct, i) => (
                      <tr key={i} className="border-b hover:bg-muted/50">
                        <td className="p-3 font-bold">{ct.category}</td>
                        <td className="p-3"><Badge variant="outline" className={ct.structural.includes("5") ? "border-green-300 text-green-600" : "border-amber-300 text-amber-600"}>{ct.structural}</Badge></td>
                        <td className="p-3">{ct.mechanism !== "-" ? <Badge variant="outline" className="border-blue-300 text-blue-600">{ct.mechanism}</Badge> : <span className="text-muted-foreground">-</span>}</td>
                        <td className="p-3">{ct.sealing !== "-" ? <Badge variant="outline" className={ct.sealing.includes("5") ? "border-green-300 text-green-600" : "border-amber-300 text-amber-600"}>{ct.sealing}</Badge> : <span className="text-muted-foreground">-</span>}</td>
                        <td className="p-3"><Badge variant="outline" className="border-purple-300 text-purple-600">{ct.coating}</Badge></td>
                        <td className="p-3">{ct.electrical !== "-" ? <Badge variant="outline" className="border-orange-300 text-orange-600">{ct.electrical}</Badge> : <span className="text-muted-foreground">-</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-5 text-center">
                <Calendar className="h-8 w-8 mx-auto text-amber-500 mb-2" />
                <p className="text-3xl font-bold text-amber-600">34</p>
                <p className="text-sm text-muted-foreground">אחריות פוקעות ב-90 יום</p>
                <p className="text-xs text-muted-foreground mt-1">שקול הצעת הארכה</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 text-center">
                <Users className="h-8 w-8 mx-auto text-blue-500 mb-2" />
                <p className="text-3xl font-bold">162</p>
                <p className="text-sm text-muted-foreground">לקוחות עם אחריות פעילה</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 text-center">
                <Shield className="h-8 w-8 mx-auto text-green-500 mb-2" />
                <p className="text-3xl font-bold text-green-600">5 שנים</p>
                <p className="text-sm text-muted-foreground">אחריות מקסימלית</p>
                <p className="text-xs text-muted-foreground mt-1">חלונות, מעקות, ויטרינות</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Financials Tab */}
        <TabsContent value="financials" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2"><Wallet className="h-5 w-5 text-green-500" />מעקב עלויות אחריות ועתודות</CardTitle>
                <Badge className="bg-green-100 text-green-700">עתודה נוכחית: ₪145,000</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-right p-3 font-medium text-muted-foreground">חודש</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">תביעות</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">עלות כוללת ₪</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">עתודה ₪</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">ניצול</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">מצב</th>
                    </tr>
                  </thead>
                  <tbody>
                    {financials.map((f, i) => {
                      const util = parseFloat(f.utilization);
                      return (
                        <tr key={i} className="border-b hover:bg-muted/50">
                          <td className="p-3 font-medium">{f.month}</td>
                          <td className="p-3 text-center">{f.claims}</td>
                          <td className="p-3 font-bold">{f.totalCost.toLocaleString()}</td>
                          <td className="p-3">{f.reserve.toLocaleString()}</td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <Progress value={util} className="h-2 flex-1" />
                              <span className="font-bold text-sm w-12">{f.utilization}</span>
                            </div>
                          </td>
                          <td className="p-3">
                            <Badge className={util < 10 ? "bg-green-100 text-green-700" : util < 15 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}>
                              {util < 10 ? "תקין" : util < 15 ? "מעקב" : "חריגה"}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-5 text-center">
                <TrendingUp className="h-8 w-8 mx-auto text-red-500 mb-2" />
                <p className="text-3xl font-bold">₪56,300</p>
                <p className="text-sm text-muted-foreground">סה"כ עלויות אחריות 2026</p>
                <p className="text-xs text-muted-foreground mt-1">4 חודשים</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 text-center">
                <Wrench className="h-8 w-8 mx-auto text-blue-500 mb-2" />
                <p className="text-3xl font-bold">₪2,850</p>
                <p className="text-sm text-muted-foreground">עלות ממוצעת לתביעה</p>
                <p className="text-xs text-green-600 mt-1">ירידה של 6% מ-Q4</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 text-center">
                <AlertTriangle className="h-8 w-8 mx-auto text-amber-500 mb-2" />
                <p className="text-3xl font-bold">10.2%</p>
                <p className="text-sm text-muted-foreground">ניצול עתודה ממוצע</p>
                <p className="text-xs text-muted-foreground mt-1">יעד: מתחת ל-15%</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
