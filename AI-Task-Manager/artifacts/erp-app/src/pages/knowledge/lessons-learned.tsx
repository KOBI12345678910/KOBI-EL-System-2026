import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Lightbulb, FolderOpen, TrendingUp, CheckCircle2, Coins, Search, Plus, Download, Target, BarChart3, ArrowUpRight } from "lucide-react";

const FALLBACK_LESSONS = [
  { id: 1, title: "עיכוב באספקת פרופיל תרמי מספק חיצוני", category: "ייצור", source: "פרויקט מגדלי הים", impact: "גבוה", recommendations: "לנהל מלאי ביטחון של 2 שבועות לפרופיל תרמי", status: "יושם", savings: 45000 },
  { id: 2, title: "שבירת זכוכית בהתקנה עקב אחסון לא נכון", category: "התקנה", source: "פרויקט בית הכנסת", impact: "גבוה", recommendations: "להוסיף מדפי אחסון ייעודיים לזכוכית באתר", status: "יושם", savings: 32000 },
  { id: 3, title: "חוסר התאמה בין מידות מפעל לאתר", category: "איכות", source: "פרויקט קניון הצפון", impact: "בינוני", recommendations: "בדיקת מידות כפולה — מפעל ואתר לפני שילוח", status: "יושם", savings: 18000 },
  { id: 4, title: "תקלת ציפוי עקב לחות גבוהה", category: "ייצור", source: "ייצור שוטף Q1-2026", impact: "בינוני", recommendations: "התקנת מד לחות אוטומטי בקו ציפוי", status: "בביצוע", savings: 25000 },
  { id: 5, title: "פציעת עובד בזמן הרמת זכוכית גדולה", category: "בטיחות", source: "פרויקט מלון דניאל", impact: "גבוה", recommendations: "חובת שימוש בוואקום להרמת זכוכית מעל 2 מ\"ר", status: "יושם", savings: 0 },
  { id: 6, title: "תכנון לא מדויק של חיבורי פינה", category: "תכנון", source: "פרויקט בניין משרדים", impact: "בינוני", recommendations: "הוספת שלב אישור הנדסי לחיבורים מורכבים", status: "בביצוע", savings: 12000 },
  { id: 7, title: "איחור בלוח זמנים עקב חוסר תיאום", category: "התקנה", source: "פרויקט שכונת הפארק", impact: "גבוה", recommendations: "ישיבת תיאום שבועית עם קבלן ראשי", status: "יושם", savings: 55000 },
  { id: 8, title: "בעיית אטימות בחלונות קומה 20+", category: "איכות", source: "פרויקט מגדל השחר", impact: "גבוה", recommendations: "שימוש באטם כפול ובדיקת לחץ רוח", status: "יושם", savings: 38000 },
  { id: 9, title: "בזבוז חומר בחיתוך — אופטימיזציה", category: "ייצור", source: "ייצור שוטף Q4-2025", impact: "בינוני", recommendations: "הטמעת תוכנת אופטימיזציית חיתוך", status: "בביצוע", savings: 67000 },
  { id: 10, title: "נפילת כלים מפיגום באתר", category: "בטיחות", source: "פרויקט בית ספר", impact: "גבוה", recommendations: "חובת רשת ביטחון ותיק כלים סגור", status: "יושם", savings: 0 },
];

const FALLBACK_CATEGORY_SUMMARY = [
  { name: "ייצור", count: 3, color: "bg-blue-500/20 text-blue-300", implemented: 1, inProgress: 2 },
  { name: "התקנה", count: 2, color: "bg-emerald-500/20 text-emerald-300", implemented: 2, inProgress: 0 },
  { name: "איכות", count: 2, color: "bg-orange-500/20 text-orange-300", implemented: 2, inProgress: 0 },
  { name: "בטיחות", count: 2, color: "bg-red-500/20 text-red-300", implemented: 2, inProgress: 0 },
  { name: "תכנון", count: 1, color: "bg-purple-500/20 text-purple-300", implemented: 0, inProgress: 1 },
];

const FALLBACK_ACTION_ITEMS = [
  { id: 1, action: "התקנת מד לחות אוטומטי בקו ציפוי", lesson: "תקלת ציפוי עקב לחות גבוהה", responsible: "משה אברהם", deadline: "2026-05-15", progress: 60, priority: "גבוה" },
  { id: 2, action: "הטמעת תוכנת אופטימיזציית חיתוך", lesson: "בזבוז חומר בחיתוך", responsible: "יוסי כהן", deadline: "2026-06-01", progress: 35, priority: "גבוה" },
  { id: 3, action: "הוספת שלב אישור הנדסי לחיבורים", lesson: "תכנון לא מדויק של חיבורי פינה", responsible: "רון ביטון", deadline: "2026-04-30", progress: 80, priority: "בינוני" },
  { id: 4, action: "עדכון נוהל אחסון זכוכית באתר", lesson: "שבירת זכוכית בהתקנה", responsible: "אבי מזרחי", deadline: "2026-04-20", progress: 90, priority: "בינוני" },
  { id: 5, action: "רכישת מדפי אחסון זכוכית ניידים", lesson: "שבירת זכוכית בהתקנה", responsible: "יעקב שמש", deadline: "2026-05-10", progress: 50, priority: "בינוני" },
];

const FALLBACK_IMPACT_TRACKING = [
  { metric: "הפחתת שבירות זכוכית", before: "8 לחודש", after: "2 לחודש", improvement: "75%", savings: "32,000 ₪/חודש" },
  { metric: "עיכובים באספקה", before: "12 ימים ממוצע", after: "3 ימים ממוצע", improvement: "75%", savings: "45,000 ₪/רבעון" },
  { metric: "בזבוז חומר בחיתוך", before: "14%", after: "6%", improvement: "57%", savings: "67,000 ₪/רבעון" },
  { metric: "תקלות אטימות", before: "5%", after: "0.5%", improvement: "90%", savings: "38,000 ₪/שנה" },
  { metric: "תיאום אתר—מפעל", before: "3 ישיבות/חודש", after: "4 ישיבות/חודש", improvement: "+33%", savings: "55,000 ₪/רבעון" },
  { metric: "אירועי בטיחות", before: "4 לרבעון", after: "1 לרבעון", improvement: "75%", savings: "— (ערך בטיחותי)" },
];

const FALLBACK_KPIS = [
  { label: "סה\"כ לקחים", value: "10", icon: Lightbulb, color: "text-yellow-400", bg: "bg-yellow-500/10" },
  { label: "קטגוריות", value: "5", icon: FolderOpen, color: "text-blue-400", bg: "bg-blue-500/10" },
  { label: "לקחים הרבעון", value: "4", icon: TrendingUp, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { label: "שיפורים שיושמו", value: "7", icon: CheckCircle2, color: "text-purple-400", bg: "bg-purple-500/10" },
  { label: "חיסכון מצטבר", value: "292,000 ₪", icon: Coins, color: "text-orange-400", bg: "bg-orange-500/10" },
];

const impactColor: Record<string, string> = {
  "גבוה": "bg-red-500/20 text-red-300",
  "בינוני": "bg-yellow-500/20 text-yellow-300",
  "נמוך": "bg-green-500/20 text-green-300",
};

const statusColor: Record<string, string> = {
  "יושם": "bg-green-500/20 text-green-300",
  "בביצוע": "bg-blue-500/20 text-blue-300",
};

const priorityColor: Record<string, string> = {
  "גבוה": "bg-red-500/20 text-red-300",
  "בינוני": "bg-yellow-500/20 text-yellow-300",
};

export default function LessonsLearned() {
  const { data: lessonslearnedData } = useQuery({
    queryKey: ["lessons-learned"],
    queryFn: () => authFetch("/api/knowledge/lessons_learned"),
    staleTime: 5 * 60 * 1000,
  });

  const lessons = lessonslearnedData ?? FALLBACK_LESSONS;
  const actionItems = FALLBACK_ACTION_ITEMS;
  const categorySummary = FALLBACK_CATEGORY_SUMMARY;
  const impactTracking = FALLBACK_IMPACT_TRACKING;
  const kpis = FALLBACK_KPIS;

  const [search, setSearch] = useState("");

  const filtered = lessons.filter(l =>
    !search || l.title.includes(search) || l.source.includes(search) || l.category.includes(search)
  );

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Lightbulb className="h-7 w-7 text-yellow-400" /> לקחים נלמדים
          </h1>
          <p className="text-sm text-muted-foreground mt-1">תיעוד לקחים מפרויקטים וייצור — טכנו-כל עוזי</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Download className="w-4 h-4 ml-1" />ייצוא</Button>
          <Button size="sm"><Plus className="w-4 h-4 ml-1" />לקח חדש</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {kpis.map(k => (
          <Card key={k.label} className="bg-card/50 border-border/50">
            <CardContent className="p-4 text-center">
              <div className={`mx-auto w-10 h-10 rounded-lg ${k.bg} flex items-center justify-center mb-2`}>
                <k.icon className={`w-5 h-5 ${k.color}`} />
              </div>
              <div className="text-xl font-bold text-foreground">{k.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{k.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="lessons" className="space-y-4">
        <TabsList className="bg-card/50">
          <TabsTrigger value="lessons"><Lightbulb className="w-4 h-4 ml-1" />לקחים</TabsTrigger>
          <TabsTrigger value="categories"><FolderOpen className="w-4 h-4 ml-1" />לפי קטגוריה</TabsTrigger>
          <TabsTrigger value="actions"><Target className="w-4 h-4 ml-1" />משימות שיפור</TabsTrigger>
          <TabsTrigger value="impact"><BarChart3 className="w-4 h-4 ml-1" />מעקב השפעה</TabsTrigger>
        </TabsList>

        <TabsContent value="lessons">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <div className="relative">
                <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input placeholder="חיפוש לקח..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 bg-background/50" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {filtered.map(l => (
                  <div key={l.id} className="p-4 rounded-lg bg-background/30 border border-border/30 hover:border-border/60 transition-colors">
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="font-medium text-foreground">{l.title}</h4>
                      <div className="flex gap-2">
                        <Badge className={impactColor[l.impact]}>השפעה {l.impact}</Badge>
                        <Badge className={statusColor[l.status]}>{l.status}</Badge>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-3 text-sm text-muted-foreground mb-2">
                      <span>קטגוריה: {l.category}</span>
                      <span>|</span>
                      <span>מקור: {l.source}</span>
                      {l.savings > 0 && <><span>|</span><span className="text-emerald-400">חיסכון: {l.savings.toLocaleString()} ₪</span></>}
                    </div>
                    <p className="text-sm text-muted-foreground">המלצה: {l.recommendations}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="categories">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {categorySummary.map(c => (
              <Card key={c.name} className="bg-card/50 border-border/50">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <Badge className={c.color + " text-base px-3 py-1"}>{c.name}</Badge>
                    <span className="text-2xl font-bold text-foreground">{c.count}</span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">יושמו</span>
                      <span className="text-emerald-400 font-medium">{c.implemented}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">בביצוע</span>
                      <span className="text-blue-400 font-medium">{c.inProgress}</span>
                    </div>
                    <Progress value={(c.implemented / c.count) * 100} className="h-2 mt-2" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="actions">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Target className="w-5 h-5 text-blue-400" /> משימות שיפור לביצוע
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {actionItems.map(a => (
                  <div key={a.id} className="p-4 rounded-lg bg-background/30 border border-border/30">
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="font-medium text-foreground">{a.action}</h4>
                      <Badge className={priorityColor[a.priority]}>{a.priority}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">מבוסס על: {a.lesson}</p>
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex gap-4 text-muted-foreground">
                        <span>אחראי: {a.responsible}</span>
                        <span>יעד: {a.deadline}</span>
                      </div>
                      <div className="flex items-center gap-2 w-32">
                        <Progress value={a.progress} className="h-2 flex-1" />
                        <span className="text-xs font-medium text-foreground">{a.progress}%</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="impact">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ArrowUpRight className="w-5 h-5 text-emerald-400" /> מעקב שיפורים מדידים
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">מדד</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">לפני</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">אחרי</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">שיפור</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">חיסכון</th>
                    </tr>
                  </thead>
                  <tbody>
                    {impactTracking.map((i, idx) => (
                      <tr key={idx} className="border-b border-border/30 hover:bg-card/80 transition-colors">
                        <td className="p-3 text-foreground font-medium">{i.metric}</td>
                        <td className="p-3 text-center text-red-300">{i.before}</td>
                        <td className="p-3 text-center text-emerald-300">{i.after}</td>
                        <td className="p-3 text-center">
                          <Badge className="bg-emerald-500/20 text-emerald-300">{i.improvement}</Badge>
                        </td>
                        <td className="p-3 text-center text-foreground font-medium">{i.savings}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 p-4 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-foreground">סה"כ חיסכון מצטבר משיפורים</span>
                  <span className="text-2xl font-bold text-emerald-400">292,000 ₪</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
