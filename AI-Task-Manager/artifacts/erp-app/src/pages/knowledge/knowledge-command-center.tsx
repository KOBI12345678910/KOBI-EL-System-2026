import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  BookOpen, FileText, Lightbulb, HelpCircle, Eye, Users,
  TrendingUp, Award, Shield, Wrench, Factory, CheckCircle
} from "lucide-react";

const kpis = [
  { label: "סה\"כ מאמרים", value: "347", icon: BookOpen, color: "text-blue-400", bg: "bg-blue-500/10" },
  { label: "נהלי עבודה (SOP)", value: "84", icon: FileText, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { label: "לקחים נלמדים", value: "126", icon: Lightbulb, color: "text-amber-400", bg: "bg-amber-500/10" },
  { label: "פריטי FAQ", value: "215", icon: HelpCircle, color: "text-purple-400", bg: "bg-purple-500/10" },
  { label: "צפיות חודשיות", value: "4,820", icon: Eye, color: "text-cyan-400", bg: "bg-cyan-500/10" },
  { label: "אחוז תרומה", value: "68%", icon: Users, color: "text-rose-400", bg: "bg-rose-500/10" },
];

const knowledgeArticles = [
  { id: "KB-001", title: "תהליך חיתוך אלומיניום — הנחיות בטיחות", category: "בטיחות", author: "דוד לוי", views: 312, status: "פורסם", updated: "2026-04-02" },
  { id: "KB-002", title: "בדיקת איכות זכוכית מחוסמת — פרוטוקול", category: "איכות", author: "רונית כהן", views: 287, status: "פורסם", updated: "2026-04-05" },
  { id: "KB-003", title: "תחזוקת מכונת CNC — מדריך שבועי", category: "תחזוקה", author: "יוסי אברהם", views: 245, status: "פורסם", updated: "2026-03-28" },
  { id: "KB-004", title: "הרכבת חלונות דגם Premium — שלבים", category: "ייצור", author: "מיכל שרון", views: 198, status: "בעדכון", updated: "2026-04-07" },
  { id: "KB-005", title: "נוהל קבלת חומרי גלם למחסן", category: "ייצור", author: "אבי מזרחי", views: 176, status: "פורסם", updated: "2026-03-15" },
  { id: "KB-006", title: "טיפול בתלונות לקוח — מדריך צוות", category: "איכות", author: "שרית בן דוד", views: 154, status: "טיוטה", updated: "2026-04-06" },
];

const sopItems = [
  { id: "SOP-041", title: "נוהל חירום — דליפת גז", dept: "בטיחות", version: "3.2", lastReview: "2026-03-01", nextReview: "2026-06-01", compliance: 100, owner: "דוד לוי" },
  { id: "SOP-042", title: "בקרת איכות — ריתוך מתכת", dept: "איכות", version: "2.8", lastReview: "2026-02-15", nextReview: "2026-05-15", compliance: 95, owner: "רונית כהן" },
  { id: "SOP-043", title: "תהליך ייצור פרופיל אלומיניום", dept: "ייצור", version: "5.1", lastReview: "2026-01-20", nextReview: "2026-04-20", compliance: 88, owner: "יוסי אברהם" },
  { id: "SOP-044", title: "תחזוקה מונעת — מסורי יהלום", dept: "תחזוקה", version: "1.4", lastReview: "2026-03-10", nextReview: "2026-06-10", compliance: 92, owner: "עמית גולן" },
  { id: "SOP-045", title: "קבלת משלוחים ואימות תעודות", dept: "ייצור", version: "2.0", lastReview: "2026-02-28", nextReview: "2026-05-28", compliance: 78, owner: "אבי מזרחי" },
];

const lessons = [
  { id: "LL-031", title: "כשל בריתוך — שינוי סוג אלקטרודה", source: "ייצור", date: "2026-04-03", severity: "high", impact: "הפחתת 40% פגמים בריתוך", author: "יוסי אברהם" },
  { id: "LL-032", title: "עיכוב אספקה — ספק חלופי לא אושר", source: "איכות", date: "2026-03-25", severity: "medium", impact: "שיפור תהליך אישור ספקים", author: "שרית בן דוד" },
  { id: "LL-033", title: "תאונת עבודה — ציוד מגן חסר", source: "בטיחות", date: "2026-03-18", severity: "high", impact: "עדכון נוהל ציוד מגן לכל קו", author: "דוד לוי" },
  { id: "LL-034", title: "שבר זכוכית בהובלה — אריזה לא מספקת", source: "ייצור", date: "2026-03-12", severity: "medium", impact: "שדרוג חומרי אריזה ובדיקה", author: "מיכל שרון" },
  { id: "LL-035", title: "טעות מידות — כיול לא תקין", source: "תחזוקה", date: "2026-02-28", severity: "low", impact: "לוח כיול שבועי חדש", author: "עמית גולן" },
];

const contributions = [
  { dept: "ייצור", articles: 98, sops: 32, lessons: 45, faq: 61, rate: 82, trend: "up" },
  { dept: "בטיחות", articles: 64, sops: 22, lessons: 38, faq: 44, rate: 75, trend: "up" },
  { dept: "איכות", articles: 72, sops: 18, lessons: 24, faq: 52, rate: 70, trend: "stable" },
  { dept: "תחזוקה", articles: 55, sops: 12, lessons: 19, faq: 33, rate: 58, trend: "down" },
  { dept: "הנדסה", articles: 38, sops: 0, lessons: 0, faq: 18, rate: 45, trend: "up" },
  { dept: "מכירות", articles: 20, sops: 0, lessons: 0, faq: 7, rate: 32, trend: "stable" },
];

const severityColors: Record<string, string> = {
  high: "bg-red-500/20 text-red-300",
  medium: "bg-amber-500/20 text-amber-300",
  low: "bg-blue-500/20 text-blue-300",
};

const statusColors: Record<string, string> = {
  "פורסם": "bg-emerald-500/20 text-emerald-300",
  "בעדכון": "bg-amber-500/20 text-amber-300",
  "טיוטה": "bg-blue-500/20 text-blue-300",
};

const deptIcons: Record<string, typeof Factory> = {
  "ייצור": Factory, "בטיחות": Shield, "איכות": CheckCircle, "תחזוקה": Wrench,
};

export default function KnowledgeCommandCenter() {
  return (
    <div className="p-6 space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <BookOpen className="h-7 w-7 text-blue-400" /> מרכז פיקוד — ניהול ידע
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">מאמרים | נהלים | לקחים | תרומות מחלקות</p>
        </div>
        <Badge className="bg-slate-700 text-slate-300 text-xs">עדכון: אפריל 2026</Badge>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-6 gap-2">
        {kpis.map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <Card key={i} className={`${kpi.bg} border-slate-700 bg-slate-800/50`}>
              <CardContent className="pt-3 pb-2 text-center px-2">
                <Icon className={`h-5 w-5 mx-auto ${kpi.color} mb-1`} />
                <p className="text-[10px] text-slate-400 leading-tight">{kpi.label}</p>
                <p className={`text-lg font-bold font-mono ${kpi.color}`}>{kpi.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Tabs defaultValue="knowledge">
        <TabsList className="grid grid-cols-4 w-full max-w-2xl bg-slate-800/50 border border-slate-700">
          <TabsTrigger value="knowledge" className="text-xs gap-1 text-slate-300 data-[state=active]:text-white"><BookOpen className="h-3.5 w-3.5" /> מאגר ידע</TabsTrigger>
          <TabsTrigger value="sop" className="text-xs gap-1 text-slate-300 data-[state=active]:text-white"><FileText className="h-3.5 w-3.5" /> נהלים</TabsTrigger>
          <TabsTrigger value="lessons" className="text-xs gap-1 text-slate-300 data-[state=active]:text-white"><Lightbulb className="h-3.5 w-3.5" /> לקחים</TabsTrigger>
          <TabsTrigger value="contributions" className="text-xs gap-1 text-slate-300 data-[state=active]:text-white"><Award className="h-3.5 w-3.5" /> תרומות</TabsTrigger>
        </TabsList>

        {/* Knowledge Base Tab */}
        <TabsContent value="knowledge">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-2"><CardTitle className="text-sm text-white">מאמרים אחרונים</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 bg-slate-800/80">
                    <TableHead className="text-right text-[10px] font-semibold text-slate-300">מזהה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-slate-300">כותרת</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-slate-300">קטגוריה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-slate-300">כותב</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-slate-300">צפיות</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-slate-300">סטטוס</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-slate-300">עדכון</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {knowledgeArticles.map((a) => (
                    <TableRow key={a.id} className="border-slate-700 hover:bg-slate-700/30">
                      <TableCell className="font-mono text-[10px] text-slate-400">{a.id}</TableCell>
                      <TableCell className="text-xs text-white font-medium">{a.title}</TableCell>
                      <TableCell><Badge className="text-[9px] bg-slate-700 text-slate-300">{a.category}</Badge></TableCell>
                      <TableCell className="text-[10px] text-slate-300">{a.author}</TableCell>
                      <TableCell className="font-mono text-[10px] text-slate-300 flex items-center gap-1"><Eye className="h-3 w-3" />{a.views}</TableCell>
                      <TableCell><Badge className={`text-[9px] ${statusColors[a.status]}`}>{a.status}</Badge></TableCell>
                      <TableCell className="text-[10px] text-slate-400">{a.updated}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SOP Tab */}
        <TabsContent value="sop">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-2"><CardTitle className="text-sm text-white">מעקב נהלי עבודה</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 bg-slate-800/80">
                    <TableHead className="text-right text-[10px] font-semibold text-slate-300">מזהה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-slate-300">נוהל</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-slate-300">מחלקה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-slate-300">גרסה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-slate-300">סקירה הבאה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-slate-300 w-28">ציות</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-slate-300">אחראי</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sopItems.map((s) => (
                    <TableRow key={s.id} className={`border-slate-700 hover:bg-slate-700/30 ${s.compliance < 80 ? "bg-red-500/5" : ""}`}>
                      <TableCell className="font-mono text-[10px] text-slate-400">{s.id}</TableCell>
                      <TableCell className="text-xs text-white font-medium">{s.title}</TableCell>
                      <TableCell><Badge className="text-[9px] bg-slate-700 text-slate-300">{s.dept}</Badge></TableCell>
                      <TableCell className="font-mono text-[10px] text-slate-300">v{s.version}</TableCell>
                      <TableCell className="text-[10px] text-slate-400">{s.nextReview}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Progress value={s.compliance} className={`h-2 w-14 ${s.compliance < 80 ? "[&>div]:bg-red-500" : s.compliance < 90 ? "[&>div]:bg-amber-500" : "[&>div]:bg-emerald-500"}`} />
                          <span className="text-[9px] font-mono text-slate-300">{s.compliance}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-[10px] text-slate-300">{s.owner}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Lessons Learned Tab */}
        <TabsContent value="lessons">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-2"><CardTitle className="text-sm text-white">לקחים נלמדים אחרונים</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 bg-slate-800/80">
                    <TableHead className="text-right text-[10px] font-semibold text-slate-300">מזהה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-slate-300">תיאור</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-slate-300">מקור</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-slate-300">חומרה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-slate-300">השפעה / פעולה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-slate-300">כותב</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-slate-300">תאריך</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lessons.map((l) => (
                    <TableRow key={l.id} className="border-slate-700 hover:bg-slate-700/30">
                      <TableCell className="font-mono text-[10px] text-slate-400">{l.id}</TableCell>
                      <TableCell className="text-xs text-white font-medium">{l.title}</TableCell>
                      <TableCell><Badge className="text-[9px] bg-slate-700 text-slate-300">{l.source}</Badge></TableCell>
                      <TableCell><Badge className={`text-[9px] ${severityColors[l.severity]}`}>{l.severity === "high" ? "גבוהה" : l.severity === "medium" ? "בינונית" : "נמוכה"}</Badge></TableCell>
                      <TableCell className="text-[10px] text-emerald-400">{l.impact}</TableCell>
                      <TableCell className="text-[10px] text-slate-300">{l.author}</TableCell>
                      <TableCell className="text-[10px] text-slate-400">{l.date}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Contributions Tab */}
        <TabsContent value="contributions">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-2"><CardTitle className="text-sm text-white">תרומות לפי מחלקה</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 bg-slate-800/80">
                    <TableHead className="text-right text-[10px] font-semibold text-slate-300">מחלקה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-slate-300">מאמרים</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-slate-300">נהלים</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-slate-300">לקחים</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-slate-300">FAQ</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-slate-300 w-32">אחוז תרומה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-slate-300">מגמה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contributions.map((c) => {
                    const DeptIcon = deptIcons[c.dept] || Users;
                    return (
                      <TableRow key={c.dept} className="border-slate-700 hover:bg-slate-700/30">
                        <TableCell className="text-xs text-white font-medium flex items-center gap-1.5">
                          <DeptIcon className="h-3.5 w-3.5 text-slate-400" />{c.dept}
                        </TableCell>
                        <TableCell className="font-mono text-[10px] text-slate-300">{c.articles}</TableCell>
                        <TableCell className="font-mono text-[10px] text-slate-300">{c.sops}</TableCell>
                        <TableCell className="font-mono text-[10px] text-slate-300">{c.lessons}</TableCell>
                        <TableCell className="font-mono text-[10px] text-slate-300">{c.faq}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Progress value={c.rate} className={`h-2 w-16 ${c.rate < 50 ? "[&>div]:bg-red-500" : c.rate < 70 ? "[&>div]:bg-amber-500" : "[&>div]:bg-emerald-500"}`} />
                            <span className="text-[9px] font-mono text-slate-300">{c.rate}%</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-[9px] ${c.trend === "up" ? "bg-emerald-500/20 text-emerald-300" : c.trend === "down" ? "bg-red-500/20 text-red-300" : "bg-slate-600 text-slate-300"}`}>
                            {c.trend === "up" ? "עולה" : c.trend === "down" ? "יורדת" : "יציבה"}
                            {c.trend === "up" && <TrendingUp className="h-3 w-3 mr-1 inline" />}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
