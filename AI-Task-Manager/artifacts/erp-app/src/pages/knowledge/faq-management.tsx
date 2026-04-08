import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { HelpCircle, FolderOpen, Eye, MessageCircleQuestion, ThumbsUp, Search, Plus, Download, BarChart3, TrendingUp, AlertCircle } from "lucide-react";

const FALLBACK_FAQS = [
  { id: 1, question: "מהם סוגי האלומיניום שאתם עובדים איתם?", answer: "אנו עובדים עם פרופילי אלומיניום 6063-T5 ו-6061-T6, כולל פרופילים תרמיים עם גשר תרמי מפוליאמיד.", category: "מוצרים", views: 456, helpful: 412 },
  { id: 2, question: "מה ההבדל בין זכוכית מחוסמת לזכוכית רב-שכבתית?", answer: "זכוכית מחוסמת עוברת חימום וקירור מהיר, חזקה פי 5 מרגילה. זכוכית רב-שכבתית מורכבת משתי שכבות זכוכית עם שכבת PVB ביניהן — במקרה שבירה, השברים נשארים מוחזקים.", category: "מוצרים", views: 389, helpful: 367 },
  { id: 3, question: "כמה זמן לוקחת התקנת חלונות לדירה?", answer: "התקנת חלונות לדירת 4 חדרים נמשכת בדרך כלל 2-3 ימי עבודה, תלוי בכמות ובמורכבות הפתחים.", category: "התקנה", views: 678, helpful: 623 },
  { id: 4, question: "האם אתם מבצעים התקנה בקומות גבוהות?", answer: "כן, אנו מבצעים התקנות בכל גובה. לקומות 8+ משתמשים בפיגום חשמלי או במנוף עם סלסלת הרמה, בהתאם לתנאי האתר.", category: "התקנה", views: 234, helpful: 210 },
  { id: 5, question: "מה תקופת האחריות על חלונות?", answer: "האחריות היא 5 שנים על מבנה האלומיניום, 3 שנים על אביזרי נעילה, 10 שנים על זכוכית מחוסמת, ושנתיים על אטמים.", category: "אחריות", views: 892, helpful: 834 },
  { id: 6, question: "כיצד מגישים תביעת אחריות?", answer: "יש לפנות למחלקת שירות בטלפון או באימייל, לצרף מספר הזמנה ותמונות של הבעיה. טכנאי ייצור קשר תוך 48 שעות.", category: "אחריות", views: 345, helpful: 298 },
  { id: 7, question: "כיצד מחושב מחיר חלון?", answer: "המחיר מחושב לפי: סוג פרופיל (רגיל/תרמי), מידות, סוג זכוכית, צבע ציפוי, סוג מנגנון פתיחה, ואביזרים נוספים כמו רשתות ותריסים.", category: "מחירים", views: 1234, helpful: 1089 },
  { id: 8, question: "האם יש הנחה להזמנות גדולות?", answer: "כן, ניתנת הנחת כמות: מעל 10 חלונות — 5%, מעל 20 — 8%, מעל 50 — 12%. לפרויקטים קבלניים — מחירון מיוחד.", category: "מחירים", views: 567, helpful: 534 },
  { id: 9, question: "מה ההבדל בין פרופיל רגיל לתרמי?", answer: "פרופיל תרמי מכיל גשר תרמי מפוליאמיד שמפריד בין הצד הפנימי לחיצוני, ומספק בידוד תרמי ואקוסטי מעולה. עמידה בתקן ירוק 5281.", category: "טכני", views: 456, helpful: 423 },
  { id: 10, question: "באיזה צבעים הציפוי זמין?", answer: "מגוון מלא של צבעי RAL — מעל 200 גוונים. הפופולריים: לבן 9016, אפור 7016, שחור 9005, חום 8014. ציפוי אפקט עץ זמין גם.", category: "טכני", views: 678, helpful: 645 },
  { id: 11, question: "האם המוצרים עומדים בתקן ישראלי?", answer: "כל המוצרים עומדים בתקן ישראלי 1649 לחלונות, תקן 2431 לדלתות, ותקן 5281 לבידוד תרמי. המפעל מחזיק תקן ISO 9001.", category: "טכני", views: 345, helpful: 312 },
  { id: 12, question: "כמה זמן לוקח ייצור הזמנה?", answer: "זמן ייצור רגיל: 14-21 ימי עבודה. הזמנות דחופות: 7-10 ימי עבודה בתוספת 15%. פרויקטים גדולים — לפי לוח זמנים מוסכם.", category: "מוצרים", views: 789, helpful: 745 },
  { id: 13, question: "האם אתם מתקינים תריסי גלילה?", answer: "כן, אנו מספקים ומתקינים תריסי גלילה חשמליים ידניים, כולל תריסים חכמים עם שלט ואינטגרציה לבית חכם.", category: "מוצרים", views: 456, helpful: 398 },
  { id: 14, question: "כיצד לתחזק חלונות אלומיניום?", answer: "ניקוי עם מים ונוזל כלים רך כל חודש. שמנון מנגנונים כל 6 חודשים. בדיקת אטמים שנתית. אין לשמש חומרים שוחקים.", category: "התקנה", views: 523, helpful: 489 },
  { id: 15, question: "האם ניתן להחליף זכוכית בלבד?", answer: "כן, ניתן להחליף זכוכית בלבד ללא החלפת מסגרת. נדרש ביקור טכנאי למדידה ואז הזמנת זכוכית בהתאמה. זמן טיפול: 5-7 ימי עבודה.", category: "אחריות", views: 267, helpful: 234 },
];

const FALLBACK_FAQ_CATEGORIES = [
  { name: "מוצרים", count: 4, color: "bg-blue-500/20 text-blue-300" },
  { name: "התקנה", count: 3, color: "bg-emerald-500/20 text-emerald-300" },
  { name: "אחריות", count: 3, color: "bg-orange-500/20 text-orange-300" },
  { name: "מחירים", count: 2, color: "bg-purple-500/20 text-purple-300" },
  { name: "טכני", count: 3, color: "bg-cyan-500/20 text-cyan-300" },
];

const FALLBACK_UNANSWERED = [
  { id: 1, question: "האם יש אפשרות לחלונות עגולים?", askedBy: "לקוח — פרויקט מגדלי הים", date: "2026-04-07", category: "מוצרים" },
  { id: 2, question: "מה עלות תיקון שבר בזכוכית בידוד?", askedBy: "לקוח — אורי מזרחי", date: "2026-04-06", category: "מחירים" },
  { id: 3, question: "האם יש פתרון לחלון שלא נסגר הרמטית?", askedBy: "לקוח — דירת הפארק", date: "2026-04-05", category: "טכני" },
  { id: 4, question: "האם אתם עובדים עם פרופיל Schuco?", askedBy: "אדריכל — משרד לוי", date: "2026-04-04", category: "מוצרים" },
  { id: 5, question: "מהי עמידות הציפוי לקרינת שמש?", askedBy: "לקוח — מלון הים", date: "2026-04-03", category: "טכני" },
];

const FALLBACK_ANALYTICS_DATA = [
  { term: "מחיר חלון אלומיניום", searches: 245, clicks: 198, ctr: 81 },
  { term: "אחריות חלונות", searches: 189, clicks: 156, ctr: 83 },
  { term: "זמן התקנה", searches: 167, clicks: 142, ctr: 85 },
  { term: "הבדל פרופיל תרמי", searches: 134, clicks: 112, ctr: 84 },
  { term: "צבעי RAL", searches: 123, clicks: 98, ctr: 80 },
  { term: "תקן ישראלי חלונות", searches: 98, clicks: 76, ctr: 78 },
  { term: "החלפת זכוכית", searches: 87, clicks: 72, ctr: 83 },
  { term: "תריסי גלילה חשמליים", searches: 76, clicks: 58, ctr: 76 },
];

const totalViews = faqs.reduce((s, f) => s + f.views, 0);
const totalHelpful = faqs.reduce((s, f) => s + f.helpful, 0);
const satisfactionPct = Math.round((totalHelpful / totalViews) * 100);

const FALLBACK_KPIS = [
  { label: "סה\"כ שאלות", value: faqs.length.toString(), icon: HelpCircle, color: "text-blue-400", bg: "bg-blue-500/10" },
  { label: "קטגוריות", value: faqCategories.length.toString(), icon: FolderOpen, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { label: "צפיות החודש", value: totalViews.toLocaleString(), icon: Eye, color: "text-purple-400", bg: "bg-purple-500/10" },
  { label: "ללא מענה", value: unanswered.length.toString(), icon: MessageCircleQuestion, color: "text-red-400", bg: "bg-red-500/10" },
  { label: "שביעות רצון", value: `${satisfactionPct}%`, icon: ThumbsUp, color: "text-orange-400", bg: "bg-orange-500/10" },
];

export default function FaqManagement() {
  const { data: faqmanagementData } = useQuery({
    queryKey: ["faq-management"],
    queryFn: () => authFetch("/api/knowledge/faq_management"),
    staleTime: 5 * 60 * 1000,
  });

  const faqs = faqmanagementData ?? FALLBACK_FAQS;

  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");

  const filtered = faqs.filter(f => {
    if (catFilter !== "all" && f.category !== catFilter) return false;
    if (search && !f.question.includes(search) && !f.answer.includes(search)) return false;
    return true;
  });

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <HelpCircle className="h-7 w-7 text-blue-400" /> שאלות נפוצות — טכנו-כל עוזי
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול שאלות ותשובות ללקוחות ועובדים</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Download className="w-4 h-4 ml-1" />ייצוא</Button>
          <Button size="sm"><Plus className="w-4 h-4 ml-1" />שאלה חדשה</Button>
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

      <Tabs defaultValue="faqlist" className="space-y-4">
        <TabsList className="bg-card/50">
          <TabsTrigger value="faqlist"><HelpCircle className="w-4 h-4 ml-1" />שאלות ותשובות</TabsTrigger>
          <TabsTrigger value="categories"><FolderOpen className="w-4 h-4 ml-1" />קטגוריות</TabsTrigger>
          <TabsTrigger value="unanswered"><AlertCircle className="w-4 h-4 ml-1" />ללא מענה</TabsTrigger>
          <TabsTrigger value="analytics"><BarChart3 className="w-4 h-4 ml-1" />אנליטיקה</TabsTrigger>
        </TabsList>

        <TabsContent value="faqlist">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <div className="flex flex-wrap gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="חיפוש שאלה..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 bg-background/50" />
                </div>
                <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className="bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
                  <option value="all">כל הקטגוריות</option>
                  {faqCategories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {filtered.map(f => (
                  <div key={f.id} className="p-4 rounded-lg bg-background/30 border border-border/30 hover:border-border/60 transition-colors">
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="font-medium text-foreground">{f.question}</h4>
                      <Badge className={faqCategories.find(c => c.name === f.category)?.color || ""}>{f.category}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">{f.answer}</p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> {f.views} צפיות</span>
                      <span className="flex items-center gap-1"><ThumbsUp className="w-3 h-3" /> {f.helpful} מועיל</span>
                      <span className="flex items-center gap-1">({Math.round((f.helpful / f.views) * 100)}% שביעות רצון)</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 text-sm text-muted-foreground">מציג {filtered.length} מתוך {faqs.length} שאלות</div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="categories">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {faqCategories.map(c => {
              const catFaqs = faqs.filter(f => f.category === c.name);
              const catViews = catFaqs.reduce((s, f) => s + f.views, 0);
              const catHelpful = catFaqs.reduce((s, f) => s + f.helpful, 0);
              return (
                <Card key={c.name} className="bg-card/50 border-border/50">
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-4">
                      <Badge className={c.color + " text-base px-3 py-1"}>{c.name}</Badge>
                      <span className="text-2xl font-bold text-foreground">{c.count}</span>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">צפיות</span>
                        <span className="text-foreground font-medium">{catViews.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">מועיל</span>
                        <span className="text-emerald-400 font-medium">{catHelpful.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">שביעות רצון</span>
                        <span className="text-foreground font-medium">{catViews > 0 ? Math.round((catHelpful / catViews) * 100) : 0}%</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="unanswered">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-400" /> שאלות הממתינות למענה ({unanswered.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {unanswered.map(q => (
                  <div key={q.id} className="p-4 rounded-lg bg-background/30 border border-red-500/20">
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="font-medium text-foreground">{q.question}</h4>
                      <Badge className={faqCategories.find(c => c.name === q.category)?.color || ""}>{q.category}</Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>שואל: {q.askedBy}</span>
                      <span>{q.date}</span>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" variant="outline">כתוב תשובה</Button>
                      <Button size="sm" variant="ghost">שייך לשאלה קיימת</Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-400" /> חיפושים נפוצים ושיעורי הקלקה
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">מונח חיפוש</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">חיפושים</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">הקלקות</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">שיעור הקלקה</th>
                      <th className="p-3 text-muted-foreground font-medium w-32">ויזואלי</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analyticsData.map((a, idx) => (
                      <tr key={idx} className="border-b border-border/30 hover:bg-card/80 transition-colors">
                        <td className="p-3 text-foreground font-medium">{a.term}</td>
                        <td className="p-3 text-center text-muted-foreground">{a.searches}</td>
                        <td className="p-3 text-center text-muted-foreground">{a.clicks}</td>
                        <td className="p-3 text-center">
                          <Badge className={a.ctr >= 80 ? "bg-green-500/20 text-green-300" : "bg-yellow-500/20 text-yellow-300"}>{a.ctr}%</Badge>
                        </td>
                        <td className="p-3">
                          <Progress value={a.ctr} className="h-2" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-4">
                <div className="p-3 rounded-lg bg-background/30 border border-border/30 text-center">
                  <div className="text-lg font-bold text-foreground">1,119</div>
                  <div className="text-xs text-muted-foreground">סה"כ חיפושים</div>
                </div>
                <div className="p-3 rounded-lg bg-background/30 border border-border/30 text-center">
                  <div className="text-lg font-bold text-foreground">912</div>
                  <div className="text-xs text-muted-foreground">סה"כ הקלקות</div>
                </div>
                <div className="p-3 rounded-lg bg-background/30 border border-border/30 text-center">
                  <div className="text-lg font-bold text-emerald-400">81.5%</div>
                  <div className="text-xs text-muted-foreground">שיעור הקלקה ממוצע</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
