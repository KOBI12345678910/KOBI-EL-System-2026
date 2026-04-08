import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  FileSignature, DollarSign, CalendarDays, ShoppingCart, Wallet,
  Search, Download, Plus, Eye, Truck, Monitor, Forklift, ArrowLeftRight,
  TrendingUp, TrendingDown, Clock, AlertTriangle, CheckCircle2
} from "lucide-react";

const FALLBACK_LEASES = [
  { id: "LS-001", item: "משאית איווקו 12T", category: "רכב", vendor: "אוטו-ליס בע\"מ", monthly: 8500, total: 306000, start: "2024-01-01", end: "2026-12-31", buyout: 85000, status: "פעיל" },
  { id: "LS-002", item: "משאית מרצדס 8T", category: "רכב", vendor: "אוטו-ליס בע\"מ", monthly: 6800, total: 244800, start: "2024-06-01", end: "2027-05-31", buyout: 72000, status: "פעיל" },
  { id: "LS-003", item: "מלגזה חשמלית Still 2.5T", category: "מלגזה", vendor: "סטיל ישראל", monthly: 4200, total: 151200, start: "2025-01-01", end: "2027-12-31", buyout: 45000, status: "פעיל" },
  { id: "LS-004", item: "מלגזה דיזל Linde 4T", category: "מלגזה", vendor: "לינדה ישראל", monthly: 5100, total: 183600, start: "2024-03-01", end: "2027-02-28", buyout: 55000, status: "פעיל" },
  { id: "LS-005", item: "שרת HP ProLiant DL380", category: "IT", vendor: "HPE ישראל", monthly: 3200, total: 115200, start: "2025-04-01", end: "2028-03-31", buyout: 18000, status: "פעיל" },
  { id: "LS-006", item: "מערכת גיבוי Veeam", category: "IT", vendor: "מטריקס IT", monthly: 1800, total: 64800, start: "2025-07-01", end: "2028-06-30", buyout: 8500, status: "פעיל" },
  { id: "LS-007", item: "רכב שטח טויוטה היילקס", category: "רכב", vendor: "אוטו-ליס בע\"מ", monthly: 4500, total: 162000, start: "2023-09-01", end: "2026-08-31", buyout: 62000, status: "מסתיים בקרוב" },
  { id: "LS-008", item: "מדפסת תעשייתית Xerox", category: "IT", vendor: "זירוקס ישראל", monthly: 2400, total: 86400, start: "2024-10-01", end: "2027-09-30", buyout: 12000, status: "פעיל" },
];

const FALLBACK_PAYMENT_SCHEDULE = [
  { month: "אפריל 2026", amount: 36500, leases: 8, paid: false },
  { month: "מאי 2026", amount: 36500, leases: 8, paid: false },
  { month: "יוני 2026", amount: 36500, leases: 8, paid: false },
  { month: "יולי 2026", amount: 36500, leases: 8, paid: false },
  { month: "אוגוסט 2026", amount: 36500, leases: 8, paid: false },
  { month: "ספטמבר 2026", amount: 32000, leases: 7, paid: false },
  { month: "אוקטובר 2026", amount: 32000, leases: 7, paid: false },
  { month: "נובמבר 2026", amount: 32000, leases: 7, paid: false },
  { month: "דצמבר 2026", amount: 32000, leases: 7, paid: false },
];

const FALLBACK_LEASE_VS_BUY = [
  { item: "משאית איווקו 12T", leaseTotal: 306000, buyPrice: 380000, buyResidual: 120000, leaseSaving: true, diff: 46000 },
  { item: "מלגזה חשמלית Still 2.5T", leaseTotal: 151200, buyPrice: 160000, buyResidual: 55000, leaseSaving: false, diff: 46200 },
  { item: "שרת HP ProLiant DL380", leaseTotal: 115200, buyPrice: 95000, buyResidual: 15000, leaseSaving: false, diff: 35200 },
  { item: "רכב שטח טויוטה היילקס", leaseTotal: 162000, buyPrice: 195000, buyResidual: 75000, leaseSaving: false, diff: 42000 },
  { item: "מדפסת תעשייתית Xerox", leaseTotal: 86400, buyPrice: 65000, buyResidual: 10000, leaseSaving: false, diff: 31400 },
];

const FALLBACK_RENEWALS = [
  { id: "LS-007", item: "רכב שטח טויוטה היילקס", end: "2026-08-31", daysLeft: 145, buyout: 62000, recommend: "חידוש", reason: "רכב בשימוש יומיומי, מצב תקין" },
  { id: "LS-001", item: "משאית איווקו 12T", end: "2026-12-31", daysLeft: 267, buyout: 85000, recommend: "רכישה", reason: "שווי שוק גבוה מאופציית הרכישה" },
  { id: "LS-004", item: "מלגזה דיזל Linde 4T", end: "2027-02-28", daysLeft: 326, buyout: 55000, recommend: "החזרה", reason: "מעבר למלגזות חשמליות" },
  { id: "LS-002", item: "משאית מרצדס 8T", end: "2027-05-31", daysLeft: 418, buyout: 72000, recommend: "רכישה", reason: "עלות ליסינג חדש גבוהה יותר" },
];

const statusColor: Record<string, string> = {
  "פעיל": "bg-emerald-500/20 text-emerald-300",
  "מסתיים בקרוב": "bg-amber-500/20 text-amber-300",
  "חידוש": "bg-blue-500/20 text-blue-300",
  "רכישה": "bg-emerald-500/20 text-emerald-300",
  "החזרה": "bg-red-500/20 text-red-300",
};

const categoryIcon: Record<string, typeof Truck> = {
  "רכב": Truck,
  "מלגזה": Forklift,
  "IT": Monitor,
};

export default function Leasing() {
  const { data: leasingData } = useQuery({
    queryKey: ["leasing"],
    queryFn: () => authFetch("/api/assets/leasing"),
    staleTime: 5 * 60 * 1000,
  });

  const leases = leasingData ?? FALLBACK_LEASES;

  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("active");

  const totalMonthly = leases.reduce((s, l) => s + l.monthly, 0);
  const totalValue = leases.reduce((s, l) => s + l.total, 0);
  const expiringCount = leases.filter(l => l.status === "מסתיים בקרוב").length;
  const buyoutOptions = leases.filter(l => l.buyout > 0).length;

  const filteredLeases = leases.filter(l =>
    l.item.includes(search) || l.vendor.includes(search) || l.category.includes(search) || l.id.includes(search)
  );

  const kpis = [
    { label: "נכסים בליסינג", value: leases.length, icon: FileSignature, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "תשלום חודשי", value: `${(totalMonthly / 1000).toFixed(1)}K ₪`, icon: DollarSign, color: "text-emerald-400", bg: "bg-emerald-500/10" },
    { label: "ליסינג מסתיים", value: expiringCount, icon: CalendarDays, color: "text-amber-400", bg: "bg-amber-500/10" },
    { label: "אופציות רכישה", value: buyoutOptions, icon: ShoppingCart, color: "text-purple-400", bg: "bg-purple-500/10" },
    { label: "שווי כולל ליסינג", value: `${(totalValue / 1000000).toFixed(1)}M ₪`, icon: Wallet, color: "text-orange-400", bg: "bg-orange-500/10" },
  ];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileSignature className="w-7 h-7 text-blue-400" />
            חוזי ליסינג - טכנו-כל עוזי
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול חוזי השכרה, לוחות תשלום, ניתוח ליסינג מול רכישה</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Download className="w-4 h-4 ml-1" />ייצוא</Button>
          <Button size="sm" className="bg-primary"><Plus className="w-4 h-4 ml-1" />חוזה חדש</Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {kpis.map(k => (
          <Card key={k.label} className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{k.label}</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{k.value}</p>
                </div>
                <div className={`p-2.5 rounded-lg ${k.bg}`}>
                  <k.icon className={`w-5 h-5 ${k.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-card/50 border border-border/50">
          <TabsTrigger value="active">חוזים פעילים</TabsTrigger>
          <TabsTrigger value="payments">לוח תשלומים</TabsTrigger>
          <TabsTrigger value="analysis">ליסינג מול רכישה</TabsTrigger>
          <TabsTrigger value="renewals">חידושים</TabsTrigger>
        </TabsList>

        {/* Tab 1: Active Leases */}
        <TabsContent value="active" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">חוזי ליסינג פעילים ({leases.length})</CardTitle>
                <div className="relative w-64">
                  <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="חיפוש חוזה..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 bg-background/50" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">מזהה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">פריט</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">קטגוריה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">ספק</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">חודשי ₪</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">תקופה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">אופציית רכישה ₪</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סטטוס</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLeases.map(l => {
                      const Icon = categoryIcon[l.category] || FileSignature;
                      return (
                        <tr key={l.id} className="border-b border-border/30 hover:bg-card/30 transition-colors">
                          <td className="p-3 text-foreground font-mono text-xs">{l.id}</td>
                          <td className="p-3 text-foreground font-medium">
                            <div className="flex items-center gap-2">
                              <Icon className="w-4 h-4 text-muted-foreground" />
                              {l.item}
                            </div>
                          </td>
                          <td className="p-3 text-muted-foreground">{l.category}</td>
                          <td className="p-3 text-foreground">{l.vendor}</td>
                          <td className="p-3 text-foreground font-medium">{l.monthly.toLocaleString()}</td>
                          <td className="p-3 text-muted-foreground text-xs">{l.start} — {l.end}</td>
                          <td className="p-3 text-foreground">{l.buyout.toLocaleString()}</td>
                          <td className="p-3"><Badge className={statusColor[l.status] || "bg-gray-500/20 text-gray-300"}>{l.status}</Badge></td>
                          <td className="p-3 text-center">
                            <Button variant="ghost" size="sm"><Eye className="w-3.5 h-3.5" /></Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* By category */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {["רכב", "מלגזה", "IT"].map(cat => {
              const catLeases = leases.filter(l => l.category === cat);
              const catMonthly = catLeases.reduce((s, l) => s + l.monthly, 0);
              const Icon = categoryIcon[cat] || FileSignature;
              return (
                <Card key={cat} className="bg-card/50 border-border/50">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className="w-5 h-5 text-muted-foreground" />
                      <p className="text-sm font-medium text-foreground">{cat}</p>
                    </div>
                    <p className="text-lg font-bold text-foreground">{catLeases.length} חוזים</p>
                    <p className="text-xs text-muted-foreground">תשלום חודשי: {catMonthly.toLocaleString()} ₪</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* Tab 2: Payment Schedule */}
        <TabsContent value="payments" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Wallet className="w-5 h-5 text-emerald-400" />
                לוח תשלומים קרוב
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">חודש</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סכום ₪</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">מס' חוזים</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentSchedule.map((p, i) => (
                      <tr key={i} className="border-b border-border/30 hover:bg-card/30">
                        <td className="p-3 text-foreground font-medium">{p.month}</td>
                        <td className="p-3 text-foreground">{p.amount.toLocaleString()}</td>
                        <td className="p-3 text-muted-foreground">{p.leases}</td>
                        <td className="p-3">
                          <Badge className={p.paid ? "bg-emerald-500/20 text-emerald-300" : "bg-blue-500/20 text-blue-300"}>
                            {p.paid ? "שולם" : "ממתין"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <CardTitle className="text-lg">סיכום תשלומים</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-3 rounded-lg bg-background/30">
                    <span className="text-sm text-muted-foreground">תשלום חודשי נוכחי</span>
                    <span className="text-lg font-bold text-foreground">{totalMonthly.toLocaleString()} ₪</span>
                  </div>
                  <div className="flex justify-between items-center p-3 rounded-lg bg-background/30">
                    <span className="text-sm text-muted-foreground">סה"כ שנתי (2026)</span>
                    <span className="text-lg font-bold text-blue-400">{(totalMonthly * 12).toLocaleString()} ₪</span>
                  </div>
                  <div className="flex justify-between items-center p-3 rounded-lg bg-background/30">
                    <span className="text-sm text-muted-foreground">סה"כ שווי חוזים</span>
                    <span className="text-lg font-bold text-orange-400">{totalValue.toLocaleString()} ₪</span>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <CardTitle className="text-lg">פילוח תשלומים לפי קטגוריה</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {["רכב", "מלגזה", "IT"].map(cat => {
                    const catMonthly = leases.filter(l => l.category === cat).reduce((s, l) => s + l.monthly, 0);
                    const pct = Math.round((catMonthly / totalMonthly) * 100);
                    return (
                      <div key={cat} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-foreground">{cat}</span>
                          <span className="text-muted-foreground">{catMonthly.toLocaleString()} ₪ ({pct}%)</span>
                        </div>
                        <Progress value={pct} className="h-2" />
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 3: Lease vs Buy */}
        <TabsContent value="analysis" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ArrowLeftRight className="w-5 h-5 text-purple-400" />
                ניתוח ליסינג מול רכישה
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">פריט</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">עלות ליסינג כוללת ₪</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">מחיר רכישה ₪</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">שווי שאריתי ₪</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">עלות נטו רכישה ₪</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">הפרש ₪</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">המלצה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaseVsBuy.map(a => {
                      const netBuy = a.buyPrice - a.buyResidual;
                      return (
                        <tr key={a.item} className="border-b border-border/30 hover:bg-card/30">
                          <td className="p-3 text-foreground font-medium">{a.item}</td>
                          <td className="p-3 text-foreground">{a.leaseTotal.toLocaleString()}</td>
                          <td className="p-3 text-foreground">{a.buyPrice.toLocaleString()}</td>
                          <td className="p-3 text-muted-foreground">{a.buyResidual.toLocaleString()}</td>
                          <td className="p-3 text-foreground">{netBuy.toLocaleString()}</td>
                          <td className="p-3">
                            <span className={a.leaseSaving ? "text-emerald-400" : "text-red-400"}>
                              {a.leaseSaving ? <TrendingDown className="w-3 h-3 inline ml-1" /> : <TrendingUp className="w-3 h-3 inline ml-1" />}
                              {a.diff.toLocaleString()}
                            </span>
                          </td>
                          <td className="p-3">
                            <Badge className={a.leaseSaving ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"}>
                              {a.leaseSaving ? "ליסינג עדיף" : "רכישה עדיפה"}
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

          <Card className="bg-card/50 border-border/50 border-blue-500/30">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">
                <strong className="text-foreground">הערה:</strong> הניתוח מבוסס על עלות כוללת לתקופת הליסינג מול רכישה ישירה בניכוי שווי שאריתי משוער.
                לא כולל יתרונות מס (הוצאה שוטפת בליסינג), עלות הון, וגמישות תפעולית.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Renewals */}
        <TabsContent value="renewals" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-blue-400" />
                חוזים לחידוש / סיום
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {renewals.map(r => (
                  <div key={r.id} className={`p-4 rounded-lg border ${r.daysLeft <= 180 ? "bg-amber-500/5 border-amber-500/20" : "bg-background/30 border-border/30"}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground">{r.item}</p>
                        <Badge className={statusColor[r.recommend] || "bg-gray-500/20 text-gray-300"}>{r.recommend}</Badge>
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-medium text-foreground">{r.end}</p>
                        <p className={`text-xs ${r.daysLeft <= 180 ? "text-amber-400" : "text-muted-foreground"}`}>{r.daysLeft} ימים</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">{r.reason}</p>
                      <p className="text-xs text-foreground">אופציית רכישה: {r.buyout.toLocaleString()} ₪</p>
                    </div>
                    <Progress value={Math.max(0, 100 - (r.daysLeft / 365 * 100))} className="h-1.5 mt-2" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-4 text-center">
                <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-400 mb-2" />
                <p className="text-2xl font-bold text-foreground">{renewals.filter(r => r.recommend === "רכישה").length}</p>
                <p className="text-sm text-muted-foreground">מומלץ לרכישה</p>
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-4 text-center">
                <Clock className="w-8 h-8 mx-auto text-blue-400 mb-2" />
                <p className="text-2xl font-bold text-foreground">{renewals.filter(r => r.recommend === "חידוש").length}</p>
                <p className="text-sm text-muted-foreground">מומלץ לחידוש</p>
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-4 text-center">
                <AlertTriangle className="w-8 h-8 mx-auto text-red-400 mb-2" />
                <p className="text-2xl font-bold text-foreground">{renewals.filter(r => r.recommend === "החזרה").length}</p>
                <p className="text-sm text-muted-foreground">מומלץ להחזרה</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
