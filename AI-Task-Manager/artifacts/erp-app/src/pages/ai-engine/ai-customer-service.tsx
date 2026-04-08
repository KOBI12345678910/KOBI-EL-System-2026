import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Bot, Clock, SmilePlus, ArrowUpRight, BookOpen, Brain,
  MessageSquare, Search, Send, AlertTriangle, TrendingUp,
  TrendingDown, Users, DollarSign, CheckCircle2, XCircle,
  Zap, Shield, ThumbsUp, ThumbsDown, Minus, RefreshCw
} from "lucide-react";

const kpis = [
  { label: "פניות שנפתרו אוטומטית", value: "1,847", change: "+12.3%", up: true, icon: Bot, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { label: "זמן תגובת AI", value: "0.8 שנ'", change: "-34%", up: true, icon: Clock, color: "text-blue-400", bg: "bg-blue-500/10" },
  { label: "שביעות רצון לקוחות", value: "94.2%", change: "+2.1%", up: true, icon: SmilePlus, color: "text-amber-400", bg: "bg-amber-500/10" },
  { label: "שיעור הסלמה", value: "8.4%", change: "-3.2%", up: true, icon: ArrowUpRight, color: "text-purple-400", bg: "bg-purple-500/10" },
  { label: "שאילתות מאגר ידע", value: "12,340", change: "+18%", up: true, icon: BookOpen, color: "text-cyan-400", bg: "bg-cyan-500/10" },
  { label: "ציון סנטימנט", value: "8.6/10", change: "+0.4", up: true, icon: Brain, color: "text-rose-400", bg: "bg-rose-500/10" },
];

const conversations = [
  { id: "CS-4021", customer: "דני כהן", topic: "סטטוס משלוח", status: "פעיל", sentiment: "חיובי", duration: "2:14", confidence: 96 },
  { id: "CS-4022", customer: "מיכל לוי", topic: "אחריות מוצר", status: "פעיל", sentiment: "ניטרלי", duration: "5:30", confidence: 88 },
  { id: "CS-4023", customer: "אבי ישראלי", topic: "תמחור", status: "ממתין", sentiment: "שלילי", duration: "1:45", confidence: 72 },
  { id: "CS-4024", customer: "רונית שרון", topic: "תמיכה טכנית", status: "נפתר", sentiment: "חיובי", duration: "8:12", confidence: 94 },
  { id: "CS-4025", customer: "יוסי ברק", topic: "סטטוס משלוח", status: "פעיל", sentiment: "חיובי", duration: "0:58", confidence: 97 },
  { id: "CS-4026", customer: "שירה גולן", topic: "אחריות מוצר", status: "הוסלם", sentiment: "שלילי", duration: "12:05", confidence: 61 },
];

const topicStats = [
  { topic: "סטטוס משלוח", count: 482, autoResolved: 94, avgTime: "1.2 דק'", icon: "📦" },
  { topic: "אחריות מוצר", count: 318, autoResolved: 78, avgTime: "3.8 דק'", icon: "🛡️" },
  { topic: "תמחור", count: 256, autoResolved: 65, avgTime: "2.4 דק'", icon: "💰" },
  { topic: "תמיכה טכנית", count: 198, autoResolved: 52, avgTime: "6.1 דק'", icon: "🔧" },
];

const kbArticles = [
  { title: "מדיניות החזרות והחלפות", matches: 342, confidence: 98, lastUsed: "לפני 2 דק'", category: "מדיניות" },
  { title: "מעקב משלוחים - שאלות נפוצות", matches: 289, confidence: 96, lastUsed: "לפני 5 דק'", category: "משלוחים" },
  { title: "תנאי אחריות מורחבת", matches: 214, confidence: 91, lastUsed: "לפני 12 דק'", category: "אחריות" },
  { title: "מדריך פתרון בעיות טכניות", matches: 187, confidence: 87, lastUsed: "לפני 8 דק'", category: "טכני" },
  { title: "טבלת מחירים ומבצעים עדכניים", matches: 156, confidence: 93, lastUsed: "לפני 3 דק'", category: "תמחור" },
  { title: "הוראות התקנה ושימוש", matches: 134, confidence: 85, lastUsed: "לפני 20 דק'", category: "טכני" },
];

const sentimentTrends = [
  { period: "ינואר", positive: 68, neutral: 22, negative: 10 },
  { period: "פברואר", positive: 71, neutral: 20, negative: 9 },
  { period: "מרץ", positive: 74, neutral: 18, negative: 8 },
  { period: "אפריל", positive: 72, neutral: 19, negative: 9 },
  { period: "מאי", positive: 76, neutral: 17, negative: 7 },
  { period: "יוני", positive: 78, neutral: 16, negative: 6 },
];

const negativeAlerts = [
  { id: "ALT-01", customer: "אבי ישראלי", issue: "עיכוב משלוח חוזר - לקוח מתוסכל", severity: "גבוה", time: "לפני 5 דק'", score: 2.1 },
  { id: "ALT-02", customer: "שירה גולן", issue: "תלונה על איכות מוצר - בקשת החזר", severity: "בינוני", time: "לפני 18 דק'", score: 3.4 },
  { id: "ALT-03", customer: "עמית דר", issue: "חיוב כפול - דורש טיפול מיידי", severity: "גבוה", time: "לפני 32 דק'", score: 1.8 },
];

const performanceComparison = [
  { metric: "זמן תגובה ממוצע", ai: "0.8 שנ'", human: "4.2 דק'", improvement: "99.7%" },
  { metric: "שיעור פתרון בפנייה ראשונה", ai: "87%", human: "72%", improvement: "20.8%" },
  { metric: "שביעות רצון לקוח", ai: "94.2%", human: "89.5%", improvement: "5.3%" },
  { metric: "עלות לפנייה", ai: "₪0.12", human: "₪18.50", improvement: "99.4%" },
  { metric: "זמינות", ai: "24/7", human: "9-18", improvement: "---" },
  { metric: "פניות ביום", ai: "2,400", human: "45", improvement: "5,233%" },
];

const statusColor: Record<string, string> = {
  "פעיל": "bg-green-500/20 text-green-300",
  "ממתין": "bg-yellow-500/20 text-yellow-300",
  "נפתר": "bg-blue-500/20 text-blue-300",
  "הוסלם": "bg-red-500/20 text-red-300",
};

const sentimentIcon = (s: string) => {
  if (s === "חיובי") return <ThumbsUp className="w-3.5 h-3.5 text-emerald-400" />;
  if (s === "שלילי") return <ThumbsDown className="w-3.5 h-3.5 text-red-400" />;
  return <Minus className="w-3.5 h-3.5 text-yellow-400" />;
};

export default function AiCustomerService() {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("dashboard");

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Bot className="w-7 h-7 text-primary" />
            סוכן שירות לקוחות AI
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול אוטומטי של פניות, ניתוח סנטימנט ומאגר ידע חכם</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><RefreshCw className="w-4 h-4 ml-1" />רענון</Button>
          <Button size="sm" className="bg-primary"><Zap className="w-4 h-4 ml-1" />אימון מודל</Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className={`p-2 rounded-lg ${kpi.bg}`}>
                  <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
                </div>
                <span className={`text-xs font-medium ${kpi.up ? "text-emerald-400" : "text-red-400"}`}>
                  {kpi.change}
                </span>
              </div>
              <div className="text-xl font-bold text-foreground">{kpi.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{kpi.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-card/50 border border-border/50">
          <TabsTrigger value="dashboard">לוח בקרה סוכן AI</TabsTrigger>
          <TabsTrigger value="knowledge">מאגר ידע</TabsTrigger>
          <TabsTrigger value="sentiment">ניתוח סנטימנט</TabsTrigger>
          <TabsTrigger value="performance">ביצועי סוכן</TabsTrigger>
        </TabsList>

        {/* Tab 1: AI Agent Dashboard */}
        <TabsContent value="dashboard" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Active Conversations */}
            <Card className="lg:col-span-2 bg-card/50 border-border/50">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-primary" />
                    שיחות פעילות
                  </CardTitle>
                  <div className="relative">
                    <Search className="absolute right-2.5 top-2 w-4 h-4 text-muted-foreground" />
                    <Input placeholder="חיפוש שיחה..." value={search} onChange={e => setSearch(e.target.value)} className="pr-8 h-8 w-48 bg-background/50 text-sm" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="text-right p-3 text-muted-foreground font-medium">מזהה</th>
                        <th className="text-right p-3 text-muted-foreground font-medium">לקוח</th>
                        <th className="text-right p-3 text-muted-foreground font-medium">נושא</th>
                        <th className="text-right p-3 text-muted-foreground font-medium">סטטוס</th>
                        <th className="text-right p-3 text-muted-foreground font-medium">סנטימנט</th>
                        <th className="text-right p-3 text-muted-foreground font-medium">ביטחון</th>
                        <th className="text-center p-3 text-muted-foreground font-medium">משך</th>
                      </tr>
                    </thead>
                    <tbody>
                      {conversations.filter(c => !search || c.customer.includes(search) || c.topic.includes(search)).map(c => (
                        <tr key={c.id} className="border-b border-border/30 hover:bg-card/30 transition-colors">
                          <td className="p-3 font-mono text-xs text-muted-foreground">{c.id}</td>
                          <td className="p-3 text-foreground font-medium">{c.customer}</td>
                          <td className="p-3 text-foreground">{c.topic}</td>
                          <td className="p-3"><Badge className={statusColor[c.status] || ""}>{c.status}</Badge></td>
                          <td className="p-3"><span className="flex items-center gap-1.5">{sentimentIcon(c.sentiment)} {c.sentiment}</span></td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <Progress value={c.confidence} className="h-1.5 w-16" />
                              <span className="text-xs text-muted-foreground">{c.confidence}%</span>
                            </div>
                          </td>
                          <td className="p-3 text-center text-muted-foreground">{c.duration}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Topics Handled */}
            <Card className="bg-card/50 border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="w-4 h-4 text-primary" />
                  נושאים מטופלים
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {topicStats.map(t => (
                  <div key={t.topic} className="p-3 rounded-lg bg-background/40 border border-border/30">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-foreground flex items-center gap-2">
                        <span className="text-lg">{t.icon}</span> {t.topic}
                      </span>
                      <Badge variant="outline" className="text-xs">{t.count} פניות</Badge>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>פתרון אוטומטי: {t.autoResolved}%</span>
                      <span>ממוצע: {t.avgTime}</span>
                    </div>
                    <Progress value={t.autoResolved} className="h-1.5 mt-2" />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Auto-response Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "תגובות אוטומטיות היום", value: "312", icon: Send, color: "text-blue-400" },
              { label: "הסלמות לנציג אנושי", value: "28", icon: Users, color: "text-orange-400" },
              { label: "פניות בתור", value: "7", icon: Clock, color: "text-yellow-400" },
              { label: "שיעור פתרון מיידי", value: "91.8%", icon: CheckCircle2, color: "text-emerald-400" },
            ].map(s => (
              <Card key={s.label} className="bg-card/50 border-border/50">
                <CardContent className="p-4 flex items-center gap-3">
                  <s.icon className={`w-8 h-8 ${s.color}`} />
                  <div>
                    <div className="text-lg font-bold text-foreground">{s.value}</div>
                    <div className="text-xs text-muted-foreground">{s.label}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Tab 2: Knowledge Base */}
        <TabsContent value="knowledge" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-primary" />
                  התאמת FAQ מבוססת AI
                </CardTitle>
                <Button size="sm" variant="outline">הוספת מאמר</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">מאמר</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">קטגוריה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">התאמות</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">ציון ביטחון</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">שימוש אחרון</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kbArticles.map(a => (
                      <tr key={a.title} className="border-b border-border/30 hover:bg-card/30 transition-colors">
                        <td className="p-3 text-foreground font-medium">{a.title}</td>
                        <td className="p-3"><Badge variant="outline">{a.category}</Badge></td>
                        <td className="p-3 text-foreground">{a.matches}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <Progress value={a.confidence} className="h-1.5 w-20" />
                            <span className={`text-xs font-medium ${a.confidence >= 90 ? "text-emerald-400" : a.confidence >= 80 ? "text-yellow-400" : "text-red-400"}`}>{a.confidence}%</span>
                          </div>
                        </td>
                        <td className="p-3 text-muted-foreground text-xs">{a.lastUsed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Document Suggestions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { title: "מסמכים מומלצים לעדכון", count: 8, desc: "מאמרים שלא עודכנו מעל 30 יום", icon: AlertTriangle, color: "text-amber-400" },
              { title: "פערי ידע מזוהים", count: 12, desc: "נושאים שהסוכן לא הצליח לענות עליהם", icon: XCircle, color: "text-red-400" },
              { title: "מאמרים בביצועים גבוהים", count: 24, desc: "ציון ביטחון ממוצע מעל 95%", icon: CheckCircle2, color: "text-emerald-400" },
            ].map(c => (
              <Card key={c.title} className="bg-card/50 border-border/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <c.icon className={`w-5 h-5 ${c.color}`} />
                    <span className="font-medium text-foreground">{c.title}</span>
                  </div>
                  <div className="text-2xl font-bold text-foreground">{c.count}</div>
                  <div className="text-xs text-muted-foreground mt-1">{c.desc}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Tab 3: Sentiment Analysis */}
        <TabsContent value="sentiment" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                מגמות סנטימנט לקוחות
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {sentimentTrends.map(t => (
                  <div key={t.period} className="flex items-center gap-3">
                    <span className="w-16 text-sm text-muted-foreground">{t.period}</span>
                    <div className="flex-1 flex h-6 rounded-md overflow-hidden">
                      <div className="bg-emerald-500/70 flex items-center justify-center text-[10px] text-white font-medium" style={{ width: `${t.positive}%` }}>{t.positive}%</div>
                      <div className="bg-yellow-500/70 flex items-center justify-center text-[10px] text-white font-medium" style={{ width: `${t.neutral}%` }}>{t.neutral}%</div>
                      <div className="bg-red-500/70 flex items-center justify-center text-[10px] text-white font-medium" style={{ width: `${t.negative}%` }}>{t.negative}%</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-6 mt-4 text-xs text-muted-foreground justify-center">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-500/70" /> חיובי</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-yellow-500/70" /> ניטרלי</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-500/70" /> שלילי</span>
              </div>
            </CardContent>
          </Card>

          {/* Negative Alert Triggers */}
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                התראות סנטימנט שלילי
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {negativeAlerts.map(a => (
                  <div key={a.id} className="flex items-center gap-4 p-3 rounded-lg bg-red-500/5 border border-red-500/20">
                    <div className="flex-shrink-0">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${a.severity === "גבוה" ? "bg-red-500/20" : "bg-orange-500/20"}`}>
                        <TrendingDown className={`w-5 h-5 ${a.severity === "גבוה" ? "text-red-400" : "text-orange-400"}`} />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{a.customer}</span>
                        <Badge className={a.severity === "גבוה" ? "bg-red-500/20 text-red-300" : "bg-orange-500/20 text-orange-300"}>{a.severity}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">{a.issue}</p>
                    </div>
                    <div className="text-left flex-shrink-0">
                      <div className="text-sm font-bold text-red-400">{a.score}/10</div>
                      <div className="text-xs text-muted-foreground">{a.time}</div>
                    </div>
                    <Button size="sm" variant="outline" className="border-red-500/30 text-red-300 hover:bg-red-500/10">טפל עכשיו</Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Agent Performance */}
        <TabsContent value="performance" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                השוואת AI מול נציג אנושי
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">מדד</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סוכן AI</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">נציג אנושי</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">שיפור</th>
                    </tr>
                  </thead>
                  <tbody>
                    {performanceComparison.map(p => (
                      <tr key={p.metric} className="border-b border-border/30 hover:bg-card/30 transition-colors">
                        <td className="p-3 text-foreground font-medium">{p.metric}</td>
                        <td className="p-3 text-emerald-400 font-semibold">{p.ai}</td>
                        <td className="p-3 text-muted-foreground">{p.human}</td>
                        <td className="p-3">
                          <Badge className="bg-emerald-500/20 text-emerald-300">{p.improvement}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Cost Savings */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <DollarSign className="w-6 h-6 text-emerald-400" />
                  <span className="text-sm text-muted-foreground">חיסכון חודשי</span>
                </div>
                <div className="text-3xl font-bold text-emerald-400">₪142,800</div>
                <p className="text-xs text-muted-foreground mt-2">חיסכון מצטבר של 1,847 פניות אוטומטיות במקום טיפול ידני</p>
                <Progress value={78} className="h-2 mt-3" />
                <span className="text-xs text-muted-foreground">78% מהפניות נפתרו ללא מגע אנושי</span>
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <Users className="w-6 h-6 text-blue-400" />
                  <span className="text-sm text-muted-foreground">שעות עבודה שנחסכו</span>
                </div>
                <div className="text-3xl font-bold text-blue-400">684</div>
                <p className="text-xs text-muted-foreground mt-2">שעות נציגים שהופנו למשימות מורכבות יותר</p>
                <Progress value={85} className="h-2 mt-3" />
                <span className="text-xs text-muted-foreground">85% ניצולת זמן משופרת</span>
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <TrendingUp className="w-6 h-6 text-purple-400" />
                  <span className="text-sm text-muted-foreground">ROI שנתי</span>
                </div>
                <div className="text-3xl font-bold text-purple-400">847%</div>
                <p className="text-xs text-muted-foreground mt-2">החזר השקעה על מערכת סוכן AI לשירות לקוחות</p>
                <Progress value={92} className="h-2 mt-3" />
                <span className="text-xs text-muted-foreground">92% עלייה ביעילות תפעולית</span>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
