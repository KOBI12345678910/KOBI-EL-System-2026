import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  TrendingUp, TrendingDown, DollarSign, Package, Truck, BarChart3, Clock,
  ShieldCheck, AlertTriangle, Search, Brain, ArrowUpRight, ArrowDownRight,
  Layers, Box, Target, Lightbulb, RefreshCw,
} from "lucide-react";

const fmt = (n: number) => new Intl.NumberFormat("he-IL").format(n);
const fmtC = (n: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(n);
const fmtP = (n: number) => `${n.toFixed(1)}%`;

const KPI = [
  { title: "סה\"כ הוצאות רכש", value: fmtC(4_870_000), change: -3.2, icon: DollarSign, color: "text-blue-600 bg-blue-50" },
  { title: "עלות ליחידה (מגמה)", value: "₪48.2", change: -1.8, icon: TrendingDown, color: "text-green-600 bg-green-50" },
  { title: "שיעור הזמנה מושלמת", value: "94.6%", change: 2.1, icon: ShieldCheck, color: "text-emerald-600 bg-emerald-50" },
  { title: "מחזור מזומן (ימים)", value: "38", change: -4, icon: Clock, color: "text-purple-600 bg-purple-50" },
  { title: "ימי מלאי ממוצע", value: "22", change: -2, icon: Package, color: "text-amber-600 bg-amber-50" },
  { title: "עלות שרשרת / הכנסות", value: "6.8%", change: -0.5, icon: BarChart3, color: "text-cyan-600 bg-cyan-50" },
];

const PERF = [{ m:"נוב׳",otd:91.2,fill:88.5,quality:97.1,cost:82.0 },{ m:"דצמ׳",otd:92.8,fill:90.1,quality:97.5,cost:83.5 },
  { m:"ינו׳",otd:93.5,fill:91.4,quality:96.8,cost:85.2 },{ m:"פבר׳",otd:94.1,fill:92.0,quality:97.9,cost:86.0 },
  { m:"מרץ",otd:95.0,fill:93.5,quality:98.2,cost:87.4 },{ m:"אפר׳",otd:95.8,fill:94.2,quality:98.5,cost:88.1 }];

const SUPPLIERS = [
  { name: "אלומיניום ישראל בע\"מ", score: 96.5, otd: 98.2, quality: 99.1, cat: "אלומיניום" },
  { name: "זכוכית השרון", score: 94.8, otd: 97.0, quality: 98.5, cat: "זכוכית" },
  { name: "פלדות הצפון", score: 93.2, otd: 95.8, quality: 97.8, cat: "פלדה" },
  { name: "כימיקלים מתקדמים", score: 91.7, otd: 94.2, quality: 98.0, cat: "חומרי גלם" },
  { name: "אריזות מהדרין", score: 90.5, otd: 93.5, quality: 96.2, cat: "אריזה" },
  { name: "מתכות הנגב", score: 89.8, otd: 92.8, quality: 97.5, cat: "פלדה" },
  { name: "פרופילים בע\"מ", score: 88.4, otd: 91.0, quality: 96.8, cat: "אלומיניום" },
  { name: "חומרי בניין דרום", score: 87.1, otd: 90.5, quality: 95.5, cat: "חומרי גלם" },
  { name: "ייבוא זגוגית פלוס", score: 85.9, otd: 89.2, quality: 97.0, cat: "זכוכית" },
  { name: "ברגים ומחברים ת\"א", score: 84.3, otd: 88.0, quality: 94.8, cat: "מחברים" },
];

const CAT_SCORES = [{ cat:"אלומיניום",score:92.5,n:4,trend:"up" as const },{ cat:"זכוכית",score:90.4,n:3,trend:"up" as const },
  { cat:"פלדה",score:91.5,n:3,trend:"stable" as const },{ cat:"חומרי גלם",score:89.4,n:5,trend:"down" as const },
  { cat:"אריזה",score:90.5,n:2,trend:"up" as const }];

const SPEND = [{ cat:"חומרי גלם",amount:2_450_000,pct:50.3 },{ cat:"הובלה",amount:730_000,pct:15.0 },
  { cat:"מכס ויבוא",amount:535_000,pct:11.0 },{ cat:"אחסנה",amount:487_000,pct:10.0 },
  { cat:"טיפול ומשלוח",amount:390_000,pct:8.0 },{ cat:"אחר",amount:278_000,pct:5.7 }];

const COST_TREND = [{ m:"נוב׳",total:840_000,mat:420_000,log:210_000 },{ m:"דצמ׳",total:810_000,mat:405_000,log:200_000 },
  { m:"ינו׳",total:795_000,mat:398_000,log:195_000 },{ m:"פבר׳",total:820_000,mat:415_000,log:205_000 },
  { m:"מרץ",total:805_000,mat:400_000,log:198_000 },{ m:"אפר׳",total:800_000,mat:395_000,log:192_000 }];

const PRODUCTS = [{ p:"חלון אלומיניום סטנדרט",cost:285,target:270,gap:5.6 },{ p:"דלת זכוכית מחוסמת",cost:520,target:500,gap:4.0 },
  { p:"מעקה פלדה",cost:180,target:175,gap:2.9 },{ p:"חזית מבנה מותאמת",cost:1_200,target:1_100,gap:9.1 },
  { p:"תריס אלומיניום חשמלי",cost:420,target:400,gap:5.0 }];

const SAVINGS = [{ t:"איחוד הזמנות אלומיניום (3 ספקים)",v:85_000,effort:"בינוני",pri:"גבוה" },
  { t:"מעבר למכס מופחת (הסכם סחר חופשי)",v:62_000,effort:"גבוה",pri:"גבוה" },
  { t:"אופטימיזציית מסלולי הובלה",v:45_000,effort:"נמוך",pri:"בינוני" },
  { t:"הפחתת מלאי עודף — קטגוריה C",v:38_000,effort:"נמוך",pri:"בינוני" }];

const ABC = [{ cls:"A",items:142,pI:20,value:3_896_000,pV:80,clr:"bg-red-500",turn:8.2 },
  { cls:"B",items:213,pI:30,value:731_250,pV:15,clr:"bg-amber-500",turn:5.1 },
  { cls:"C",items:355,pI:50,value:243_750,pV:5,clr:"bg-green-500",turn:2.3 }];

const TURNOVER = [{ cat:"אלומיניום גולמי",rate:9.4,target:10,ok:true },{ cat:"זכוכית מחוסמת",rate:7.8,target:8,ok:false },
  { cat:"פלדת נירוסטה",rate:6.2,target:7,ok:false },{ cat:"חומרי איטום",rate:11.5,target:10,ok:true },
  { cat:"ברגים ומחברים",rate:4.8,target:6,ok:false }];

const DEAD = [{ name:"פרופיל AL-2040 (דגם ישן)",value:42_000,days:380 },
  { name:"זגוגית 8 מ\"מ ירוקה",value:28_500,days:290 },{ name:"ציר פלדה T-55 (הופסק)",value:19_800,days:250 }];
const EXCESS = [{ name:"פרופיל AL-6060 T5",qty:"2,400 מ\"ט",value:96_000 },
  { name:"זגוגית שקופה 6 מ\"מ",qty:"180 מ\"ר",value:54_000 },{ name:"סיליקון שקוף 310 מ\"ל",qty:"800 יח׳",value:32_000 }];

const FORECAST_ACC = [{ m:"נוב׳",v:87.2 },{ m:"דצמ׳",v:89.5 },{ m:"ינו׳",v:91.0 },
  { m:"פבר׳",v:90.3 },{ m:"מרץ",v:92.8 },{ m:"אפר׳",v:93.5 }];

const STOCKOUTS = [{ item:"פרופיל AL-6063 T6",days:5,demand:320,onHand:85,sev:"critical" },
  { item:"זגוגית מחוסמת 10 מ\"מ",days:9,demand:150,onHand:65,sev:"high" },
  { item:"בורג נירוסטה M8x30",days:14,demand:5000,onHand:2800,sev:"medium" },
  { item:"סיליקון מבני שחור",days:22,demand:400,onHand:310,sev:"low" }];

const PRICES = [{ mat:"אלומיניום",cur:9.85,pred:10.20,chg:3.6,up:true },
  { mat:"זכוכית שטוחה",cur:52.0,pred:50.5,chg:-2.9,up:false },{ mat:"פלדת נירוסטה",cur:14.2,pred:15.1,chg:6.3,up:true }];

const AI_REC = [{ a:"להגדיל הזמנת פרופיל AL-6063 ב-40% לפני מחסור צפוי",imp:"גבוה",type:"מלאי" },
  { a:"לנעול מחיר אלומיניום לרבעון הבא — מגמת עלייה צפויה",imp:"גבוה",type:"מחיר" },
  { a:"לנצל ירידת מחיר זכוכית — להגדיל רכש ב-15%",imp:"בינוני",type:"מחיר" },
  { a:"לסלק מלאי מת בקטגוריה C — פוטנציאל שחרור ₪187K",imp:"בינוני",type:"מלאי" },
  { a:"לאחד ספקי פלדה — חיסכון שנתי ₪62K",imp:"בינוני",type:"ספקים" },
  { a:"להחליף ספק ברגים — ציון ביצועים נמוך מתמשך",imp:"נמוך",type:"ספקים" }];

const sevLabel: Record<string, [string, string]> = {
  critical: ["קריטי", "bg-red-100 text-red-700"], high: ["גבוה", "bg-orange-100 text-orange-700"],
  medium: ["בינוני", "bg-amber-100 text-amber-700"], low: ["נמוך", "bg-green-100 text-green-700"],
};
const impColor = (i: string) => i === "גבוה" ? "bg-red-100 text-red-700" : i === "בינוני" ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700";

export default function SupplyChainAnalyticsPage() {
  const [search, setSearch] = useState("");
  const filtered = SUPPLIERS.filter((s) => s.name.includes(search) || s.cat.includes(search));

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Truck className="w-6 h-6 text-blue-600" />אנליטיקת שרשרת אספקה
          </h1>
          <p className="text-sm text-muted-foreground mt-1">טכנו-כל עוזי — ניתוח ביצועים, עלויות, מלאי וחיזוי</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted rounded-lg px-3 py-1.5">
          <RefreshCw className="w-3.5 h-3.5" />עודכן: 08 אפריל 2026
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {KPI.map((k) => (
          <Card key={k.title}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground leading-tight">{k.title}</span>
                <div className={`p-1.5 rounded-lg ${k.color}`}><k.icon className="w-4 h-4" /></div>
              </div>
              <p className="text-xl font-bold">{k.value}</p>
              <div className={`flex items-center gap-1 text-xs mt-1 ${k.change < 0 ? "text-green-600" : "text-red-500"}`}>
                {k.change < 0 ? <ArrowDownRight className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                {Math.abs(k.change)}% מהחודש הקודם
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="performance">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="performance">ביצועים</TabsTrigger>
          <TabsTrigger value="costs">עלויות</TabsTrigger>
          <TabsTrigger value="inventory">מלאי</TabsTrigger>
          <TabsTrigger value="predictive">חיזוי</TabsTrigger>
        </TabsList>

        {/* ── Performance ── */}
        <TabsContent value="performance" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">מגמת ביצועים — 6 חודשים</CardTitle></CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead><tr className="border-b text-muted-foreground">
                  <th className="text-right py-2 font-medium">חודש</th>
                  <th className="text-center py-2 font-medium">OTD %</th>
                  <th className="text-center py-2 font-medium">שיעור מילוי</th>
                  <th className="text-center py-2 font-medium">איכות</th>
                  <th className="text-center py-2 font-medium">יעילות עלות</th>
                </tr></thead>
                <tbody>{PERF.map((r) => (
                  <tr key={r.m} className="border-b last:border-0">
                    <td className="py-2 font-medium">{r.m}</td>
                    <td className="text-center"><Badge variant="outline" className="bg-blue-50 text-blue-700">{fmtP(r.otd)}</Badge></td>
                    <td className="text-center"><Badge variant="outline" className="bg-emerald-50 text-emerald-700">{fmtP(r.fill)}</Badge></td>
                    <td className="text-center"><Badge variant="outline" className="bg-purple-50 text-purple-700">{fmtP(r.quality)}</Badge></td>
                    <td className="text-center"><Badge variant="outline" className="bg-amber-50 text-amber-700">{fmtP(r.cost)}</Badge></td>
                  </tr>
                ))}</tbody>
              </table>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">דירוג ספקים — 10 המובילים</CardTitle>
                  <div className="relative w-48">
                    <Search className="absolute right-2 top-2 w-4 h-4 text-muted-foreground" />
                    <Input placeholder="חיפוש ספק..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 text-sm pr-8" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-muted-foreground">
                    <th className="text-right py-2 font-medium">#</th><th className="text-right py-2 font-medium">ספק</th>
                    <th className="text-center py-2 font-medium">ציון</th><th className="text-center py-2 font-medium">OTD</th>
                    <th className="text-center py-2 font-medium">איכות</th><th className="text-right py-2 font-medium">קטגוריה</th>
                  </tr></thead>
                  <tbody>{filtered.map((s, i) => (
                    <tr key={s.name} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="py-2 text-muted-foreground">{i + 1}</td>
                      <td className="py-2 font-medium">{s.name}</td>
                      <td className="text-center"><span className={`font-bold ${s.score >= 90 ? "text-green-600" : s.score >= 85 ? "text-amber-600" : "text-red-600"}`}>{s.score}</span></td>
                      <td className="text-center">{fmtP(s.otd)}</td>
                      <td className="text-center">{fmtP(s.quality)}</td>
                      <td><Badge variant="secondary">{s.cat}</Badge></td>
                    </tr>
                  ))}</tbody>
                </table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">ציון לפי קטגוריה</CardTitle></CardHeader>
              <CardContent className="space-y-3">{CAT_SCORES.map((c) => (
                <div key={c.cat} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{c.cat}</span>
                    <span className="flex items-center gap-1">{c.score}
                      {c.trend === "up" && <TrendingUp className="w-3 h-3 text-green-500" />}
                      {c.trend === "down" && <TrendingDown className="w-3 h-3 text-red-500" />}
                    </span>
                  </div>
                  <Progress value={c.score} className="h-2" />
                  <p className="text-xs text-muted-foreground">{c.n} ספקים</p>
                </div>
              ))}</CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Costs ── */}
        <TabsContent value="costs" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">התפלגות הוצאות לפי קטגוריה</CardTitle></CardHeader>
              <CardContent className="space-y-3">{SPEND.map((s) => (
                <div key={s.cat} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{s.cat}</span>
                    <span className="text-muted-foreground">{fmtC(s.amount)} ({fmtP(s.pct)})</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-3">
                    <div className="bg-blue-500 h-3 rounded-full" style={{ width: `${Math.max((s.pct / 55) * 100, 4)}%` }} />
                  </div>
                </div>
              ))}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">מגמת עלויות חודשית</CardTitle></CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-muted-foreground">
                    <th className="text-right py-2 font-medium">חודש</th><th className="text-center py-2 font-medium">סה״כ</th>
                    <th className="text-center py-2 font-medium">חומרים</th><th className="text-center py-2 font-medium">לוגיסטיקה</th>
                  </tr></thead>
                  <tbody>{COST_TREND.map((r) => (
                    <tr key={r.m} className="border-b last:border-0">
                      <td className="py-2 font-medium">{r.m}</td>
                      <td className="text-center">{fmtC(r.total)}</td>
                      <td className="text-center text-blue-600">{fmtC(r.mat)}</td>
                      <td className="text-center text-amber-600">{fmtC(r.log)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </CardContent>
            </Card>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">עלות ליחידה לפי מוצר</CardTitle></CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-muted-foreground">
                    <th className="text-right py-2 font-medium">מוצר</th><th className="text-center py-2 font-medium">עלות</th>
                    <th className="text-center py-2 font-medium">יעד</th><th className="text-center py-2 font-medium">פער</th>
                  </tr></thead>
                  <tbody>{PRODUCTS.map((p) => (
                    <tr key={p.p} className="border-b last:border-0">
                      <td className="py-2 font-medium">{p.p}</td>
                      <td className="text-center">{fmtC(p.cost)}</td>
                      <td className="text-center text-green-600">{fmtC(p.target)}</td>
                      <td className="text-center"><Badge className={p.gap > 5 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}>+{fmtP(p.gap)}</Badge></td>
                    </tr>
                  ))}</tbody>
                </table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Lightbulb className="w-4 h-4 text-amber-500" />הזדמנויות חיסכון</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {SAVINGS.map((s, i) => (
                  <div key={i} className="border rounded-lg p-3 space-y-2">
                    <p className="text-sm font-medium">{s.t}</p>
                    <div className="flex items-center gap-3 text-xs">
                      <Badge className="bg-green-100 text-green-700">{fmtC(s.v)} פוטנציאל</Badge>
                      <span className="text-muted-foreground">מאמץ: {s.effort}</span>
                      <span className="text-muted-foreground">עדיפות: {s.pri}</span>
                    </div>
                  </div>
                ))}
                <div className="text-sm font-medium text-green-700 bg-green-50 rounded-lg p-3 text-center">
                  סה״כ פוטנציאל חיסכון: {fmtC(SAVINGS.reduce((a, s) => a + s.v, 0))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Inventory ── */}
        <TabsContent value="inventory" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Layers className="w-4 h-4 text-blue-500" />ניתוח ABC — סיווג מלאי</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">{ABC.map((a) => (
                <div key={a.cls} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full ${a.clr} flex items-center justify-center text-white font-bold text-lg`}>{a.cls}</div>
                    <div><p className="font-bold">קטגוריה {a.cls}</p><p className="text-xs text-muted-foreground">{a.pI}% פריטים — {a.pV}% ערך</p></div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="bg-muted rounded p-2 text-center"><p className="text-xs text-muted-foreground">פריטים</p><p className="font-bold">{fmt(a.items)}</p></div>
                    <div className="bg-muted rounded p-2 text-center"><p className="text-xs text-muted-foreground">ערך</p><p className="font-bold">{fmtC(a.value)}</p></div>
                  </div>
                  <div className="text-sm"><span className="text-muted-foreground">מחזוריות: </span><span className="font-medium">{a.turn}x</span></div>
                  <Progress value={a.pV} className="h-2" />
                </div>
              ))}</div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">שיעורי מחזוריות</CardTitle></CardHeader>
              <CardContent className="space-y-3">{TURNOVER.map((t) => (
                <div key={t.cat} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{t.cat}</span>
                    <span className={t.ok ? "text-green-600" : "text-red-600"}>{t.rate}x / {t.target}x</span>
                  </div>
                  <Progress value={Math.min((t.rate / t.target) * 100, 100)} className={`h-2 ${!t.ok ? "[&>div]:bg-red-500" : ""}`} />
                </div>
              ))}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-500" />מלאי מת</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="bg-red-50 rounded-lg p-2"><p className="text-xs text-muted-foreground">ערך כולל</p><p className="font-bold text-red-700">{fmtC(187_000)}</p></div>
                  <div className="bg-red-50 rounded-lg p-2"><p className="text-xs text-muted-foreground">פריטים</p><p className="font-bold text-red-700">48</p></div>
                </div>
                {DEAD.map((d) => (
                  <div key={d.name} className="border rounded p-2 text-sm">
                    <p className="font-medium">{d.name}</p>
                    <div className="flex justify-between text-xs text-muted-foreground mt-1"><span>{fmtC(d.value)}</span><span>{d.days} ימים ללא תנועה</span></div>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Box className="w-4 h-4 text-amber-500" />מלאי עודף</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="bg-amber-50 rounded-lg p-2"><p className="text-xs text-muted-foreground">ערך כולל</p><p className="font-bold text-amber-700">{fmtC(312_000)}</p></div>
                  <div className="bg-amber-50 rounded-lg p-2"><p className="text-xs text-muted-foreground">פריטים</p><p className="font-bold text-amber-700">73</p></div>
                </div>
                {EXCESS.map((e) => (
                  <div key={e.name} className="border rounded p-2 text-sm">
                    <p className="font-medium">{e.name}</p>
                    <div className="flex justify-between text-xs text-muted-foreground mt-1"><span>עודף: {e.qty}</span><span>{fmtC(e.value)}</span></div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Predictive ── */}
        <TabsContent value="predictive" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Brain className="w-4 h-4 text-purple-500" />דיוק חיזוי ביקוש — מגמה</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {FORECAST_ACC.map((f) => (
                  <div key={f.m} className="flex items-center gap-3">
                    <span className="w-12 text-sm text-muted-foreground">{f.m}</span>
                    <div className="flex-1 bg-muted rounded-full h-4 relative">
                      <div className="bg-purple-500 h-4 rounded-full flex items-center justify-end pr-2" style={{ width: `${f.v}%` }}>
                        <span className="text-[10px] text-white font-bold">{fmtP(f.v)}</span>
                      </div>
                    </div>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground mt-3 text-center">שיפור של 6.3% בדיוק חיזוי ב-6 חודשים אחרונים</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-500" />מחסור צפוי — 30 ימים קרובים</CardTitle></CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-muted-foreground">
                    <th className="text-right py-2 font-medium">פריט</th><th className="text-center py-2 font-medium">ימים</th>
                    <th className="text-center py-2 font-medium">ביקוש</th><th className="text-center py-2 font-medium">במלאי</th>
                    <th className="text-center py-2 font-medium">חומרה</th>
                  </tr></thead>
                  <tbody>{STOCKOUTS.map((s) => (
                    <tr key={s.item} className="border-b last:border-0">
                      <td className="py-2 font-medium">{s.item}</td>
                      <td className="text-center font-bold">{s.days}</td>
                      <td className="text-center">{fmt(s.demand)}</td>
                      <td className="text-center">{fmt(s.onHand)}</td>
                      <td className="text-center"><Badge className={sevLabel[s.sev][1]}>{sevLabel[s.sev][0]}</Badge></td>
                    </tr>
                  ))}</tbody>
                </table>
              </CardContent>
            </Card>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="w-4 h-4 text-blue-500" />תחזית מחירי חומרים מרכזיים</CardTitle></CardHeader>
              <CardContent className="space-y-3">{PRICES.map((p) => (
                <div key={p.mat} className="border rounded-lg p-3">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">{p.mat}</span>
                    <Badge className={p.up ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}>
                      {p.up ? <ArrowUpRight className="w-3 h-3 ml-1" /> : <ArrowDownRight className="w-3 h-3 ml-1" />}
                      {p.chg > 0 ? "+" : ""}{fmtP(p.chg)}
                    </Badge>
                  </div>
                  <div className="flex justify-between text-sm text-muted-foreground mt-2">
                    <span>נוכחי: ₪{p.cur}/ק״ג</span><span>צפוי: ₪{p.pred}/ק״ג</span>
                  </div>
                  <Progress value={p.up ? 35 + p.chg * 5 : 65 - Math.abs(p.chg) * 5} className={`h-1.5 mt-2 ${p.up ? "[&>div]:bg-red-400" : "[&>div]:bg-green-400"}`} />
                </div>
              ))}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Target className="w-4 h-4 text-emerald-500" />המלצות AI לפעולה</CardTitle></CardHeader>
              <CardContent className="space-y-2">{AI_REC.map((r, i) => (
                <div key={i} className="flex items-start gap-3 border rounded-lg p-3">
                  <div className="mt-0.5 p-1 rounded bg-emerald-50 text-emerald-600"><Lightbulb className="w-4 h-4" /></div>
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-medium">{r.a}</p>
                    <div className="flex gap-2">
                      <Badge variant="outline" className="text-xs">{r.type}</Badge>
                      <Badge className={impColor(r.imp)}>השפעה: {r.imp}</Badge>
                    </div>
                  </div>
                </div>
              ))}</CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
