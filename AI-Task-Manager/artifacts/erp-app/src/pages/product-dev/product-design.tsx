import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Palette, PenTool, CheckCircle2, Clock, RotateCcw, Layers,
  Search, BookOpen, Ruler, MessageSquare, Star, AlertCircle,
  ArrowRight, Eye, FileCheck, Users, Lightbulb, Shield, Box, Maximize2
} from "lucide-react";

const designs = [
  { id: "DSN-001", name: "פרופיל אלומיניום T-60", designer: "דוד כהן", version: "3.2", stage: "סופי", approval: "מאושר", iterations: 8, completion: 100 },
  { id: "DSN-002", name: "מערכת חלון הזזה כפולה", designer: "שרה לוי", version: "2.1", stage: "מפורט", approval: "מאושר", iterations: 5, completion: 85 },
  { id: "DSN-003", name: "דלת כניסה מעוצבת Z-Pro", designer: "יוסי אברהם", version: "1.4", stage: "קונספט", approval: "ממתין", iterations: 4, completion: 35 },
  { id: "DSN-004", name: "מחיצת זכוכית משרדית", designer: "מירב שמעון", version: "4.0", stage: "סופי", approval: "מאושר", iterations: 12, completion: 100 },
  { id: "DSN-005", name: "חזית אלומיניום מבודדת", designer: "אלון דניאל", version: "2.0", stage: "מפורט", approval: "בבדיקה", iterations: 6, completion: 72 },
  { id: "DSN-006", name: "תריס חשמלי אינטגרלי", designer: "נועה גולן", version: "1.1", stage: "קונספט", approval: "ממתין", iterations: 2, completion: 20 },
  { id: "DSN-007", name: "פרגולה מתכתית מתקפלת", designer: "דוד כהן", version: "3.0", stage: "סופי", approval: "מאושר", iterations: 9, completion: 100 },
  { id: "DSN-008", name: "מערכת ויטרינה חנות", designer: "שרה לוי", version: "1.8", stage: "מפורט", approval: "בבדיקה", iterations: 7, completion: 65 },
  { id: "DSN-009", name: "דופן זכוכית מבנית", designer: "יוסי אברהם", version: "2.5", stage: "מפורט", approval: "מאושר", iterations: 6, completion: 90 },
  { id: "DSN-010", name: "מעקה זכוכית בטיחותי", designer: "מירב שמעון", version: "1.0", stage: "קונספט", approval: "ממתין", iterations: 1, completion: 15 },
  { id: "DSN-011", name: "חלון ציר עליון חסין אש", designer: "אלון דניאל", version: "2.3", stage: "סופי", approval: "מאושר", iterations: 10, completion: 100 },
  { id: "DSN-012", name: "מסגרת פנל סולארי", designer: "נועה גולן", version: "1.6", stage: "מפורט", approval: "בבדיקה", iterations: 3, completion: 55 },
];

const libraryItems = [
  { category: "פרופילים", items: [
    { name: "פרופיל T-60 סטנדרט", type: "אלומיניום 6063", uses: 34, rating: 4.8 },
    { name: "פרופיל U-40 תרמי", type: "אלומיניום 6060", uses: 28, rating: 4.6 },
  ]},
  { category: "חיבורים", items: [
    { name: "חיבור פינתי 90 מעלות", type: "פלדת אל-חלד", uses: 45, rating: 4.9 },
    { name: "ציר נסתר 180 מעלות", type: "פליז", uses: 22, rating: 4.7 },
  ]},
  { category: "איטומים", items: [
    { name: "גומיית EPDM פרופיל", type: "EPDM", uses: 52, rating: 4.4 },
    { name: "סיליקון מבני UV", type: "סיליקון", uses: 38, rating: 4.6 },
  ]},
  { category: "חומרה", items: [
    { name: "ידית מנוף אירופאית", type: "אלומיניום יצוק", uses: 41, rating: 4.8 },
    { name: "מנעול רב-נקודתי", type: "פלדת אל-חלד", uses: 29, rating: 4.7 },
  ]},
  { category: "יחידות זכוכית", items: [
    { name: "זכוכית כפולה Low-E", type: "4/16/4 מ\"מ", uses: 47, rating: 4.9 },
    { name: "זכוכית בטיחותית מחוסמת", type: "10 מ\"מ ESG", uses: 33, rating: 4.6 },
  ]},
];

const standards = [
  { title: "הנחיות עיצוב כלליות", items: [
    "כל עיצוב חייב לעמוד בתקן ישראלי ת\"י 23 לחלונות ודלתות",
    "מידות מינימום לפרופיל נושא: 60 מ\"מ רוחב, 1.4 מ\"מ עובי דופן",
    "ניקוז מים: לפחות 2 פתחי ניקוז בכל יחידה, קוטר מינימלי 8 מ\"מ",
    "מרווח תרמי: הפסקה תרמית מינימלית 24 מ\"מ במערכות מבודדות",
  ]},
  { title: "אילוצי חומרים", items: [
    "אלומיניום: סגסוגת 6063-T6 בלבד לפרופילים חיצוניים",
    "זכוכית: עובי מינימלי 4 מ\"מ, מחוסמת בגובה מעל 2 מטר",
    "איטומים: EPDM עמיד UV בחשיפה חיצונית, טמפרטורה -30 עד +80 מעלות",
    "ציפוי: אנודייז 20 מיקרון או צביעה אלקטרוסטטית 60 מיקרון מינימום",
  ]},
  { title: "יכולות ייצור", items: [
    "אורך מקסימלי לשחול: 7,000 מ\"מ",
    "כיפוף מינימלי: רדיוס 150 מ\"מ לפרופיל סטנדרט",
    "דיוק חיתוך CNC: סטייה מקסימלית 0.1 מ\"מ",
    "ריתוך TIG: זמין לאלומיניום 6061 ופלדת אל-חלד",
    "עיבוד שבבי: מרכז עיבוד 5 צירים, דיוק 0.05 מ\"מ",
  ]},
];

const collaboration = [
  { id: 1, design: "DSN-003", reviewer: "מנהל הנדסה", date: "2026-04-06", type: "הערה", status: "פתוח", text: "יש לבדוק עמידות הפרופיל בעומס רוח 120 קמ\"ש לפי תקן" },
  { id: 2, design: "DSN-005", reviewer: "מנהל ייצור", date: "2026-04-05", type: "משוב", status: "טופל", text: "החיתוך בזווית 45 מעלות מחייב כלי חיתוך ייעודי - לוודא זמינות" },
  { id: 3, design: "DSN-008", reviewer: "מנהל איכות", date: "2026-04-04", type: "בקשת שינוי", status: "בטיפול", text: "להוסיף איטום כפול בפינות התחתונות למניעת חדירת מים" },
  { id: 4, design: "DSN-006", reviewer: "לקוח - מגדלי הים", date: "2026-04-03", type: "משוב", status: "פתוח", text: "הלקוח מבקש אפשרות לתריס עם למלות רחבות יותר (120 מ\"מ)" },
  { id: 5, design: "DSN-012", reviewer: "מהנדס מבנים", date: "2026-04-02", type: "הערה", status: "טופל", text: "מסגרת הפנל צריכה לתמוך במשקל 25 ק\"ג למ\"ר - אישור חוזק" },
  { id: 6, design: "DSN-002", reviewer: "מנהל פיתוח", date: "2026-04-01", type: "בקשת שינוי", status: "פתוח", text: "לשלב מנגנון נעילה אוטומטי בחלון ההזזה - דרישת בטיחות ילדים" },
  { id: 7, design: "DSN-010", reviewer: "יועץ בטיחות", date: "2026-03-30", type: "הערה", status: "בטיפול", text: "מעקה זכוכית בגובה 1.02 מ - תקן ישראלי מחייב 1.05 מ מינימום" },
];

const stageColor: Record<string, string> = {
  "קונספט": "bg-purple-500/20 text-purple-400",
  "מפורט": "bg-blue-500/20 text-blue-400",
  "סופי": "bg-green-500/20 text-green-400",
};

const approvalColor: Record<string, string> = {
  "מאושר": "bg-emerald-500/20 text-emerald-400",
  "ממתין": "bg-yellow-500/20 text-yellow-400",
  "בבדיקה": "bg-orange-500/20 text-orange-400",
};

const collabStatusColor: Record<string, string> = {
  "פתוח": "bg-red-500/20 text-red-400",
  "בטיפול": "bg-yellow-500/20 text-yellow-400",
  "טופל": "bg-green-500/20 text-green-400",
};

const collabTypeColor: Record<string, string> = {
  "הערה": "bg-blue-500/20 text-blue-400",
  "משוב": "bg-purple-500/20 text-purple-400",
  "בקשת שינוי": "bg-orange-500/20 text-orange-400",
};

export default function ProductDesignPage() {
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [collabFilter, setCollabFilter] = useState("all");

  const activeDesigns = designs.length;
  const totalIterations = designs.reduce((s, d) => s + d.iterations, 0);
  const approvedCount = designs.filter(d => d.approval === "מאושר").length;
  const pendingCount = designs.filter(d => d.approval === "ממתין" || d.approval === "בבדיקה").length;
  const avgCycle = "18 ימים";
  const reusePercent = "73%";

  const filteredDesigns = designs.filter(d =>
    (stageFilter === "all" || d.stage === stageFilter) &&
    (!search || [d.id, d.name, d.designer].some(f => f.toLowerCase().includes(search.toLowerCase())))
  );

  const filteredCollab = collaboration.filter(c =>
    collabFilter === "all" || c.status === collabFilter
  );

  return (
    <div className="p-4 md:p-6 space-y-6" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <Palette className="text-violet-400 w-6 h-6" />
            ניהול עיצוב מוצר
          </h1>
          <p className="text-sm text-muted-foreground mt-1">עיצוב, תכנון וניהול מוצרי מתכת, אלומיניום וזכוכית - טכנו-כל עוזי</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "עיצובים פעילים", value: activeDesigns, icon: PenTool, color: "text-violet-400" },
          { label: "איטרציות עיצוב", value: totalIterations, icon: RotateCcw, color: "text-blue-400" },
          { label: "עיצובים מאושרים", value: approvedCount, icon: CheckCircle2, color: "text-emerald-400" },
          { label: "ממתינים לאישור", value: pendingCount, icon: Clock, color: "text-yellow-400" },
          { label: "מחזור עיצוב ממוצע", value: avgCycle, icon: Layers, color: "text-cyan-400" },
          { label: "אחוז שימוש חוזר", value: reusePercent, icon: Maximize2, color: "text-pink-400" },
        ].map((kpi, i) => (
          <Card key={i} className="bg-card border-border/50">
            <CardContent className="p-4">
              <kpi.icon className={`${kpi.color} w-5 h-5 mb-2`} />
              <div className="text-xl font-bold text-foreground">{kpi.value}</div>
              <div className="text-xs text-muted-foreground">{kpi.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="designs" className="space-y-4">
        <TabsList className="bg-muted/30 border border-border/50">
          <TabsTrigger value="designs" className="gap-1.5"><PenTool className="w-3.5 h-3.5" /> עיצובים</TabsTrigger>
          <TabsTrigger value="library" className="gap-1.5"><BookOpen className="w-3.5 h-3.5" /> ספריית עיצוב</TabsTrigger>
          <TabsTrigger value="standards" className="gap-1.5"><Ruler className="w-3.5 h-3.5" /> תקנים</TabsTrigger>
          <TabsTrigger value="collaboration" className="gap-1.5"><MessageSquare className="w-3.5 h-3.5" /> שיתוף פעולה</TabsTrigger>
        </TabsList>

        {/* Tab 1: Designs */}
        <TabsContent value="designs" className="space-y-4">
          <div className="flex gap-3 flex-wrap items-center">
            <div className="relative flex-1 min-w-0 sm:min-w-[220px] max-w-md">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="חיפוש עיצוב, מעצב, מזהה..."
                className="pr-10" />
            </div>
            <select value={stageFilter} onChange={e => setStageFilter(e.target.value)}
              className="bg-card border border-border rounded-xl px-3 py-2 text-sm">
              <option value="all">כל השלבים</option>
              <option value="קונספט">קונספט</option>
              <option value="מפורט">מפורט</option>
              <option value="סופי">סופי</option>
            </select>
            <span className="text-sm text-muted-foreground">{filteredDesigns.length} עיצובים</span>
          </div>

          <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 border-b border-border/50">
                  <tr>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">מזהה</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">שם מוצר</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">מעצב</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">גרסה</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">שלב</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">אישור</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">איטרציות</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">השלמה</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDesigns.map(d => (
                    <tr key={d.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{d.id}</td>
                      <td className="px-4 py-3 text-foreground font-medium">{d.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{d.designer}</td>
                      <td className="px-4 py-3 text-muted-foreground">v{d.version}</td>
                      <td className="px-4 py-3">
                        <Badge className={`text-[10px] ${stageColor[d.stage]}`}>{d.stage}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={`text-[10px] ${approvalColor[d.approval]}`}>{d.approval}</Badge>
                      </td>
                      <td className="px-4 py-3 text-center text-muted-foreground">{d.iterations}</td>
                      <td className="px-4 py-3 w-36">
                        <div className="flex items-center gap-2">
                          <Progress value={d.completion} className="h-2 flex-1" />
                          <span className="text-xs text-muted-foreground w-9 text-left">{d.completion}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* Tab 2: Design Library */}
        <TabsContent value="library" className="space-y-4">
          <p className="text-sm text-muted-foreground">רכיבי עיצוב לשימוש חוזר - פרופילים, חיבורים, איטומים, חומרה ויחידות זכוכית</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {libraryItems.map((cat, ci) => (
              <Card key={ci} className="bg-card border-border/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    {ci === 0 && <Box className="w-4 h-4 text-blue-400" />}
                    {ci === 1 && <Layers className="w-4 h-4 text-green-400" />}
                    {ci === 2 && <Shield className="w-4 h-4 text-orange-400" />}
                    {ci === 3 && <Lightbulb className="w-4 h-4 text-yellow-400" />}
                    {ci === 4 && <Eye className="w-4 h-4 text-cyan-400" />}
                    {cat.category}
                    <Badge variant="secondary" className="mr-auto text-[10px]">{cat.items.length} פריטים</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 space-y-3">
                  {cat.items.map((item, ii) => (
                    <div key={ii} className="border border-border/30 rounded-xl p-3 hover:bg-muted/20 transition-colors">
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-sm font-medium text-foreground">{item.name}</span>
                        <div className="flex items-center gap-0.5">
                          <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                          <span className="text-xs text-muted-foreground">{item.rating}</span>
                        </div>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-muted-foreground">{item.type}</span>
                        <span className="text-xs text-blue-400">{item.uses} שימושים</span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Tab 3: Design Standards */}
        <TabsContent value="standards" className="space-y-4">
          <p className="text-sm text-muted-foreground">הנחיות עיצוב, אילוצי חומרים ויכולות ייצור של המפעל</p>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {standards.map((section, si) => (
              <Card key={si} className="bg-card border-border/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    {si === 0 && <FileCheck className="w-4 h-4 text-emerald-400" />}
                    {si === 1 && <AlertCircle className="w-4 h-4 text-amber-400" />}
                    {si === 2 && <Ruler className="w-4 h-4 text-blue-400" />}
                    {section.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <ul className="space-y-2.5">
                    {section.items.map((item, ii) => (
                      <li key={ii} className="flex gap-2 text-sm">
                        <ArrowRight className="w-3.5 h-3.5 mt-0.5 text-primary shrink-0" />
                        <span className="text-muted-foreground leading-relaxed">{item}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="bg-card border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Users className="w-4 h-4 text-violet-400" />
                סיכום עמידה בתקנים
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "תקן ישראלי ת\"י 23", status: "עומד", pct: 100 },
                  { label: "ISO 9001 - איכות", status: "עומד", pct: 95 },
                  { label: "CE - אירופי", status: "בתהליך", pct: 78 },
                  { label: "תקן אקוסטי ת\"י 1301", status: "עומד", pct: 88 },
                ].map((std, i) => (
                  <div key={i} className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{std.label}</span>
                      <Badge className={`text-[10px] ${std.status === "עומד" ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"}`}>
                        {std.status}
                      </Badge>
                    </div>
                    <Progress value={std.pct} className="h-2" />
                    <div className="text-left text-xs text-muted-foreground">{std.pct}%</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Collaboration */}
        <TabsContent value="collaboration" className="space-y-4">
          <div className="flex gap-3 flex-wrap items-center justify-between">
            <p className="text-sm text-muted-foreground">הערות סקירת עיצוב, מעקב משובים ובקשות שינוי</p>
            <div className="flex gap-2">
              {["all", "פתוח", "בטיפול", "טופל"].map(s => (
                <Button key={s} size="sm" variant={collabFilter === s ? "default" : "outline"}
                  onClick={() => setCollabFilter(s)} className="text-xs">
                  {s === "all" ? "הכל" : s}
                  <Badge variant="secondary" className="mr-1.5 text-[10px]">
                    {s === "all" ? collaboration.length : collaboration.filter(c => c.status === s).length}
                  </Badge>
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {filteredCollab.map(c => (
              <Card key={c.id} className="bg-card border-border/50 hover:border-border transition-colors">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row justify-between items-start gap-3">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={`text-[10px] ${collabTypeColor[c.type]}`}>{c.type}</Badge>
                        <Badge className={`text-[10px] ${collabStatusColor[c.status]}`}>{c.status}</Badge>
                        <span className="text-xs text-muted-foreground font-mono">{c.design}</span>
                      </div>
                      <p className="text-sm text-foreground leading-relaxed">{c.text}</p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Users className="w-3 h-3" />{c.reviewer}</span>
                        <span>{c.date}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="bg-card border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-blue-400" />
                סיכום שיתוף פעולה
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "סה\"כ הערות", value: collaboration.length, color: "text-blue-400" },
                  { label: "פתוחות", value: collaboration.filter(c => c.status === "פתוח").length, color: "text-red-400" },
                  { label: "בטיפול", value: collaboration.filter(c => c.status === "בטיפול").length, color: "text-yellow-400" },
                  { label: "טופלו", value: collaboration.filter(c => c.status === "טופל").length, color: "text-green-400" },
                ].map((s, i) => (
                  <div key={i} className="text-center p-3 border border-border/30 rounded-xl">
                    <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                    <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
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