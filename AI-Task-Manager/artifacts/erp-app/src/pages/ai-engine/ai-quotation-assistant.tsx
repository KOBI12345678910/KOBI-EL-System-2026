import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Brain, Clock, TrendingUp, Target, FileText, DollarSign,
  Search, Send, CheckCircle, XCircle, Sparkles, ShoppingCart,
  BarChart3, Users, ArrowUpRight, ArrowDownRight, Layers,
  Zap, Star, Package, RefreshCw, Eye
} from "lucide-react";

const kpis = [
  { label: "הצעות שנוצרו", value: "1,247", change: "+18%", up: true, icon: FileText, color: "from-blue-500 to-cyan-500" },
  { label: "זמן תגובה ממוצע", value: "2.4 דק׳", change: "-35%", up: true, icon: Clock, color: "from-emerald-500 to-green-500" },
  { label: "שיפור שיעור זכייה", value: "+23%", change: "+5.2%", up: true, icon: TrendingUp, color: "from-violet-500 to-purple-500" },
  { label: "דיוק תמחור AI", value: "94.7%", change: "+2.1%", up: true, icon: Target, color: "from-amber-500 to-orange-500" },
  { label: "ממתינות לבדיקה", value: "18", change: "-4", up: true, icon: Brain, color: "from-rose-500 to-pink-500" },
  { label: "הכנסות מהצעות AI", value: "₪4.8M", change: "+28%", up: true, icon: DollarSign, color: "from-teal-500 to-cyan-500" },
];

const aiQuotes = [
  { id: "QAI-1001", customer: "אלביט מערכות", products: "חיישנים תעשייתיים x50", aiPrice: "₪245,000", margin: "32%", confidence: 94, status: "accepted" },
  { id: "QAI-1002", customer: "רפאל מערכות", products: "מודולי תקשורת x120", aiPrice: "₪512,000", margin: "28%", confidence: 91, status: "sent" },
  { id: "QAI-1003", customer: "IAI תעשייה אווירית", products: "בקרי טמפרטורה x80", aiPrice: "₪178,000", margin: "35%", confidence: 88, status: "draft" },
  { id: "QAI-1004", customer: "טבע תעשיות", products: "ציוד מעבדה מתקדם x30", aiPrice: "₪392,000", margin: "26%", confidence: 96, status: "accepted" },
  { id: "QAI-1005", customer: "ICL כימיקלים", products: "משאבות תעשייתיות x15", aiPrice: "₪287,000", margin: "30%", confidence: 85, status: "rejected" },
  { id: "QAI-1006", customer: "נתיבי ישראל", products: "תאורת LED תעשייתית x200", aiPrice: "₪156,000", margin: "38%", confidence: 92, status: "sent" },
  { id: "QAI-1007", customer: "מקורות", products: "חיישני לחץ x60", aiPrice: "₪98,000", margin: "41%", confidence: 89, status: "draft" },
  { id: "QAI-1008", customer: "חברת חשמל", products: "שנאי מתח x25", aiPrice: "₪634,000", margin: "24%", confidence: 93, status: "accepted" },
  { id: "QAI-1009", customer: "פלאפון תקשורת", products: "אנטנות תקשורת x40", aiPrice: "₪421,000", margin: "29%", confidence: 87, status: "sent" },
  { id: "QAI-1010", customer: "סלקום", products: "מגברי אות x70", aiPrice: "₪189,000", margin: "33%", confidence: 90, status: "draft" },
];

const statusMap: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  draft: { label: "טיוטה", color: "bg-slate-500/20 text-slate-300 border-slate-500/30", icon: FileText },
  sent: { label: "נשלח", color: "bg-blue-500/20 text-blue-300 border-blue-500/30", icon: Send },
  accepted: { label: "אושר", color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30", icon: CheckCircle },
  rejected: { label: "נדחה", color: "bg-red-500/20 text-red-300 border-red-500/30", icon: XCircle },
};

const pricingIntel = [
  { product: "חיישנים תעשייתיים", ourPrice: "₪4,900", marketAvg: "₪5,200", competitorLow: "₪4,600", competitorHigh: "₪5,800", winRate: 72, trend: "up" },
  { product: "מודולי תקשורת", ourPrice: "₪4,267", marketAvg: "₪4,500", competitorLow: "₪3,900", competitorHigh: "₪5,100", winRate: 65, trend: "down" },
  { product: "בקרי טמפרטורה", ourPrice: "₪2,225", marketAvg: "₪2,400", competitorLow: "₪2,000", competitorHigh: "₪2,900", winRate: 78, trend: "up" },
  { product: "ציוד מעבדה", ourPrice: "₪13,067", marketAvg: "₪14,200", competitorLow: "₪11,500", competitorHigh: "₪16,000", winRate: 81, trend: "up" },
  { product: "משאבות תעשייתיות", ourPrice: "₪19,133", marketAvg: "₪18,500", competitorLow: "₪16,000", competitorHigh: "₪22,000", winRate: 54, trend: "down" },
];

const recommendations = [
  { customer: "אלביט מערכות", currentProducts: "חיישנים", suggestion: "מודולי תקשורת + בקרי טמפרטורה", potential: "₪320,000", confidence: 91, reason: "רכישות דומות ע״י לקוחות בענף הביטחון" },
  { customer: "טבע תעשיות", currentProducts: "ציוד מעבדה", suggestion: "חיישני לחות + מערכות סינון", potential: "₪185,000", confidence: 87, reason: "היסטוריית רכישות מעבדתיות משלימות" },
  { customer: "חברת חשמל", currentProducts: "שנאי מתח", suggestion: "מערכות הגנה + כבלי מתח גבוה", potential: "₪520,000", confidence: 94, reason: "פרויקט הרחבת רשת ידוע" },
  { customer: "מקורות", currentProducts: "חיישני לחץ", suggestion: "שסתומי בקרה + מד זרימה", potential: "₪210,000", confidence: 88, reason: "שדרוג תשתיות מים ארצי" },
  { customer: "נתיבי ישראל", currentProducts: "תאורת LED", suggestion: "חיישני תנועה + בקרי תאורה חכמים", potential: "₪145,000", confidence: 85, reason: "פרויקט כבישים חכמים 2026" },
];

const templates = [
  { name: "פרויקט ביטחוני", winRate: 78, avgMargin: "31%", uses: 142, optimized: true, components: ["חיישנים", "תקשורת", "בקרה"], lastUpdated: "לפני 3 ימים" },
  { name: "תשתיות אנרגיה", winRate: 82, avgMargin: "27%", uses: 98, optimized: true, components: ["שנאים", "כבלים", "הגנה"], lastUpdated: "לפני שבוע" },
  { name: "ציוד מעבדה", winRate: 74, avgMargin: "34%", uses: 67, optimized: false, components: ["מכשור", "כימיקלים", "ריהוט"], lastUpdated: "לפני 2 שבועות" },
  { name: "תקשורת ורשתות", winRate: 69, avgMargin: "29%", uses: 115, optimized: true, components: ["אנטנות", "מגברים", "כבלים"], lastUpdated: "לפני 5 ימים" },
  { name: "מים וביוב", winRate: 85, avgMargin: "36%", uses: 53, optimized: false, components: ["חיישנים", "משאבות", "שסתומים"], lastUpdated: "לפני חודש" },
  { name: "תחבורה חכמה", winRate: 71, avgMargin: "32%", uses: 41, optimized: true, components: ["תאורה", "חיישנים", "בקרה"], lastUpdated: "לפני 4 ימים" },
];

export default function AiQuotationAssistant() {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("quotes");

  const filteredQuotes = aiQuotes.filter(
    (q) => !search || q.customer.includes(search) || q.products.includes(search) || q.id.includes(search)
  );

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Brain className="w-7 h-7 text-purple-400" />
            עוזר הצעות מחיר AI
          </h1>
          <p className="text-sm text-muted-foreground mt-1">תמחור חכם, ניתוח שוק והמלצות מבוססות בינה מלאכותית</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1"><RefreshCw className="w-4 h-4" />רענון נתונים</Button>
          <Button size="sm" className="bg-gradient-to-l from-purple-600 to-blue-600 gap-1"><Sparkles className="w-4 h-4" />הצעה חדשה עם AI</Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="bg-card/60 border-border/40 hover:border-border/70 transition-all">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className={`p-2 rounded-lg bg-gradient-to-br ${kpi.color} bg-opacity-20`}>
                  <kpi.icon className="w-4 h-4 text-white" />
                </div>
                <Badge variant="outline" className={kpi.up ? "text-emerald-400 border-emerald-500/30 text-xs" : "text-red-400 border-red-500/30 text-xs"}>
                  {kpi.up ? <ArrowUpRight className="w-3 h-3 ml-1" /> : <ArrowDownRight className="w-3 h-3 ml-1" />}
                  {kpi.change}
                </Badge>
              </div>
              <div className="text-xl font-bold text-white">{kpi.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{kpi.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-card/60 border border-border/40 p-1">
          <TabsTrigger value="quotes" className="gap-1 data-[state=active]:bg-purple-600/30"><FileText className="w-4 h-4" />הצעות AI</TabsTrigger>
          <TabsTrigger value="pricing" className="gap-1 data-[state=active]:bg-blue-600/30"><BarChart3 className="w-4 h-4" />מודיעין תמחור</TabsTrigger>
          <TabsTrigger value="recommendations" className="gap-1 data-[state=active]:bg-emerald-600/30"><ShoppingCart className="w-4 h-4" />המלצות מוצרים</TabsTrigger>
          <TabsTrigger value="templates" className="gap-1 data-[state=active]:bg-amber-600/30"><Layers className="w-4 h-4" />תבניות הצעה</TabsTrigger>
        </TabsList>

        {/* Tab 1: AI Quotes */}
        <TabsContent value="quotes" className="space-y-4">
          <Card className="bg-card/60 border-border/40">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2"><Sparkles className="w-5 h-5 text-purple-400" />הצעות מחיר שנוצרו ע״י AI</CardTitle>
                <div className="relative w-64">
                  <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="חיפוש הצעה..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-9 bg-background/50" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/40">
                      <th className="text-right p-3 text-muted-foreground font-medium">מזהה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">לקוח</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">מוצרים</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">מחיר AI</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">מרווח</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">ביטחון</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">סטטוס</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredQuotes.map((q) => {
                      const st = statusMap[q.status];
                      return (
                        <tr key={q.id} className="border-b border-border/20 hover:bg-card/40 transition-colors">
                          <td className="p-3 font-mono text-purple-300 text-xs">{q.id}</td>
                          <td className="p-3 text-white font-medium">{q.customer}</td>
                          <td className="p-3 text-muted-foreground">{q.products}</td>
                          <td className="p-3 text-white font-semibold">{q.aiPrice}</td>
                          <td className="p-3"><Badge variant="outline" className="text-emerald-400 border-emerald-500/30">{q.margin}</Badge></td>
                          <td className="p-3">
                            <div className="flex flex-col items-center gap-1">
                              <span className={`text-xs font-bold ${q.confidence >= 90 ? "text-emerald-400" : q.confidence >= 85 ? "text-amber-400" : "text-red-400"}`}>{q.confidence}%</span>
                              <Progress value={q.confidence} className="h-1.5 w-16" />
                            </div>
                          </td>
                          <td className="p-3 text-center">
                            <Badge className={`${st.color} border gap-1`}><st.icon className="w-3 h-3" />{st.label}</Badge>
                          </td>
                          <td className="p-3 text-center">
                            <Button variant="ghost" size="sm" className="gap-1 text-xs"><Eye className="w-3.5 h-3.5" />צפייה</Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Pricing Intelligence */}
        <TabsContent value="pricing" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2 bg-card/60 border-border/40">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2"><BarChart3 className="w-5 h-5 text-blue-400" />ניתוח תמחור שוק</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/40">
                        <th className="text-right p-3 text-muted-foreground font-medium">מוצר</th>
                        <th className="text-right p-3 text-muted-foreground font-medium">המחיר שלנו</th>
                        <th className="text-right p-3 text-muted-foreground font-medium">ממוצע שוק</th>
                        <th className="text-right p-3 text-muted-foreground font-medium">טווח מתחרים</th>
                        <th className="text-center p-3 text-muted-foreground font-medium">שיעור זכייה</th>
                        <th className="text-center p-3 text-muted-foreground font-medium">מגמה</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pricingIntel.map((p) => (
                        <tr key={p.product} className="border-b border-border/20 hover:bg-card/40">
                          <td className="p-3 text-white font-medium">{p.product}</td>
                          <td className="p-3 text-emerald-400 font-semibold">{p.ourPrice}</td>
                          <td className="p-3 text-muted-foreground">{p.marketAvg}</td>
                          <td className="p-3 text-xs text-muted-foreground">{p.competitorLow} - {p.competitorHigh}</td>
                          <td className="p-3">
                            <div className="flex flex-col items-center gap-1">
                              <span className={`text-xs font-bold ${p.winRate >= 75 ? "text-emerald-400" : p.winRate >= 60 ? "text-amber-400" : "text-red-400"}`}>{p.winRate}%</span>
                              <Progress value={p.winRate} className="h-1.5 w-16" />
                            </div>
                          </td>
                          <td className="p-3 text-center">
                            {p.trend === "up" ? <ArrowUpRight className="w-4 h-4 text-emerald-400 mx-auto" /> : <ArrowDownRight className="w-4 h-4 text-red-400 mx-auto" />}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card className="bg-card/60 border-border/40">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2"><Target className="w-4 h-4 text-amber-400" />מדדי מתחרים</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    { name: "מתחרה A - סימנס", position: "פרימיום", share: 28 },
                    { name: "מתחרה B - שניידר", position: "ביניים-גבוה", share: 22 },
                    { name: "אנחנו", position: "תחרותי", share: 19 },
                    { name: "מתחרה C - ABB", position: "ביניים", share: 16 },
                  ].map((c) => (
                    <div key={c.name} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className={c.name === "אנחנו" ? "text-purple-400 font-bold" : "text-muted-foreground"}>{c.name}</span>
                        <span className="text-white">{c.share}%</span>
                      </div>
                      <Progress value={c.share} className={`h-2 ${c.name === "אנחנו" ? "[&>div]:bg-purple-500" : ""}`} />
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="bg-card/60 border-border/40">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="w-4 h-4 text-emerald-400" />זכייה לפי מחיר</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    { range: "מתחת לממוצע שוק", winRate: 82, deals: 89 },
                    { range: "בגובה ממוצע השוק", winRate: 64, deals: 156 },
                    { range: "מעל ממוצע שוק (עד 10%)", winRate: 45, deals: 72 },
                    { range: "מעל ממוצע שוק (10%+)", winRate: 23, deals: 31 },
                  ].map((r) => (
                    <div key={r.range} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{r.range}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium">{r.winRate}%</span>
                        <span className="text-muted-foreground">({r.deals} עסקאות)</span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Tab 3: Product Recommendations */}
        <TabsContent value="recommendations" className="space-y-4">
          <Card className="bg-card/60 border-border/40">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2"><ShoppingCart className="w-5 h-5 text-emerald-400" />המלצות Cross-sell / Upsell מבוססות AI</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                {recommendations.map((rec) => (
                  <div key={rec.customer} className="p-4 rounded-xl bg-background/40 border border-border/30 hover:border-purple-500/30 transition-all">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-gradient-to-br from-purple-600/20 to-blue-600/20">
                          <Users className="w-5 h-5 text-purple-400" />
                        </div>
                        <div>
                          <h4 className="text-white font-semibold">{rec.customer}</h4>
                          <p className="text-xs text-muted-foreground">מוצרים נוכחיים: {rec.currentProducts}</p>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-emerald-400 border-emerald-500/30 gap-1"><Zap className="w-3 h-3" />ביטחון {rec.confidence}%</Badge>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <Star className="w-4 h-4 text-amber-400" />
                      <span className="text-sm text-white">המלצה: <span className="text-purple-300">{rec.suggestion}</span></span>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground flex items-center gap-1"><Brain className="w-3 h-3" />{rec.reason}</p>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-emerald-400">{rec.potential}</span>
                        <Button size="sm" variant="outline" className="text-xs gap-1"><Send className="w-3 h-3" />צור הצעה</Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Quote Templates */}
        <TabsContent value="templates" className="space-y-4">
          <Card className="bg-card/60 border-border/40">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2"><Layers className="w-5 h-5 text-amber-400" />תבניות הצעה ממוטבות AI</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {templates.map((t) => (
                  <div key={t.name} className="p-4 rounded-xl bg-background/40 border border-border/30 hover:border-amber-500/30 transition-all space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-white font-semibold flex items-center gap-2">
                        <Package className="w-4 h-4 text-amber-400" />{t.name}
                      </h4>
                      {t.optimized && <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs gap-1"><Sparkles className="w-3 h-3" />ממוטב</Badge>}
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="p-2 rounded-lg bg-card/40">
                        <div className="text-lg font-bold text-white">{t.winRate}%</div>
                        <div className="text-[10px] text-muted-foreground">שיעור זכייה</div>
                      </div>
                      <div className="p-2 rounded-lg bg-card/40">
                        <div className="text-lg font-bold text-white">{t.avgMargin}</div>
                        <div className="text-[10px] text-muted-foreground">מרווח ממוצע</div>
                      </div>
                      <div className="p-2 rounded-lg bg-card/40">
                        <div className="text-lg font-bold text-white">{t.uses}</div>
                        <div className="text-[10px] text-muted-foreground">שימושים</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {t.components.map((c) => (
                        <Badge key={c} variant="outline" className="text-xs text-muted-foreground border-border/50">{c}</Badge>
                      ))}
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-border/20">
                      <span className="text-[10px] text-muted-foreground">עודכן {t.lastUpdated}</span>
                      <Button size="sm" variant="ghost" className="text-xs gap-1 h-7"><Eye className="w-3 h-3" />השתמש בתבנית</Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
