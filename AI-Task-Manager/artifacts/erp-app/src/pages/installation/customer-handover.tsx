import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  FileCheck, ClipboardList, Clock, CheckCircle, XCircle, Star, Camera,
  MessageSquare, Pen, AlertTriangle, Calendar, ShieldCheck, ThumbsUp, Minus
} from "lucide-react";

const handovers = [
  { id: "HDV-101", installation: "INS-003", project: "בית חכם — הרצליה", customer: "אבי רוזנפלד", phone: "052-845-9901", date: "2026-04-06", crew: "צוות גמא", status: "אושר" },
  { id: "HDV-102", installation: "INS-008", project: "מרכז ספורט — ראשל\"צ", customer: "דנה כהן-מלמד", phone: "054-332-7718", date: "2026-04-07", crew: "צוות דלתא", status: "אושר" },
  { id: "HDV-103", installation: "INS-001", project: "מגדלי הים — חיפה", customer: "יורם חזן", phone: "050-611-4420", date: "2026-04-09", crew: "צוות אלפא", status: "בביצוע" },
  { id: "HDV-104", installation: "INS-005", project: "קניון הדרום — באר שבע", customer: "מירב אלקיים", phone: "053-780-2256", date: "2026-04-09", crew: "צוות דלתא", status: "ממתין לאישור" },
  { id: "HDV-105", installation: "INS-007", project: "בניין מגורים — נתניה", customer: "שלמה ביטון", phone: "058-900-1133", date: "2026-04-10", crew: "צוות גמא", status: "דורש תיקון" },
  { id: "HDV-106", installation: "INS-002", project: "פארק המדע — רחובות", customer: "ד\"ר נועה פישר", phone: "054-267-8834", date: "2026-04-11", crew: "צוות בטא", status: "מתוכנן" },
  { id: "HDV-107", installation: "INS-004", project: "מלון ים התיכון", customer: "רונן שטרית", phone: "052-440-5567", date: "2026-04-13", crew: "צוות אלפא", status: "מתוכנן" },
  { id: "HDV-108", installation: "INS-006", project: "משרדי הייטק — הרצליה פיתוח", customer: "ליאת ברגמן", phone: "050-998-3342", date: "2026-04-14", crew: "צוות בטא", status: "מתוכנן" },
];

const punchListItems = [
  { item: "איטום היקפי", hdv103: "pass", hdv104: "pass", hdv105: "fail" },
  { item: "יישור מסגרת", hdv103: "pass", hdv104: "pass", hdv105: "pass" },
  { item: "פעולת נעילה", hdv103: "pass", hdv104: "na", hdv105: "pass" },
  { item: "זכוכית — שלמות", hdv103: "pass", hdv104: "pass", hdv105: "fail" },
  { item: "צבע / גימור", hdv103: "pass", hdv104: "pass", hdv105: "pass" },
  { item: "ניקיון סופי", hdv103: "fail", hdv104: "pass", hdv105: "fail" },
  { item: "פעולת הזזה / פתיחה", hdv103: "pass", hdv104: "pass", hdv105: "pass" },
  { item: "אביזרי נילווים", hdv103: "pass", hdv104: "pass", hdv105: "na" },
  { item: "רשת יתושים", hdv103: "na", hdv104: "pass", hdv105: "pass" },
  { item: "תיעוד צילומי", hdv103: "pass", hdv104: "pass", hdv105: "pass" },
];

const signoffData = [
  { hdv: "HDV-101", customer: "אבי רוזנפלד", signed: true, rating: 5, comments: "התקנה מצוינת, מקצועיות גבוהה", photos: 12 },
  { hdv: "HDV-102", customer: "דנה כהן-מלמד", signed: true, rating: 4, comments: "ציר בדלת אש #3 צריך כיוון קל", photos: 8 },
  { hdv: "HDV-103", customer: "יורם חזן", signed: false, rating: 0, comments: "ממתין — מסירה בתהליך", photos: 5 },
  { hdv: "HDV-104", customer: "מירב אלקיים", signed: false, rating: 0, comments: "בדיקה סופית לפני חתימה", photos: 6 },
  { hdv: "HDV-105", customer: "שלמה ביטון", signed: false, rating: 0, comments: "נדרש תיקון זכוכית + ניקיון חוזר", photos: 9 },
];

const protocolTemplate: { num: number; category: string; check: string; mandatory: boolean }[] = [
  { num: 1, category: "בטיחות", check: "אין שברים או קצוות חדים", mandatory: true },
  { num: 2, category: "בטיחות", check: "נעילה תקינה בכל נקודות הנעילה", mandatory: true },
  { num: 3, category: "איטום", check: "איטום סיליקון רציף ללא פערים", mandatory: true },
  { num: 4, category: "איטום", check: "בדיקת מים — אין חדירה 15 דקות", mandatory: true },
  { num: 5, category: "מראה", check: "זכוכית נקייה ללא שריטות", mandatory: true },
  { num: 6, category: "מראה", check: "צבע / אנודייז אחיד ללא פגמים", mandatory: true },
  { num: 7, category: "מראה", check: "ניקיון אזור עבודה — ללא פסולת", mandatory: false },
  { num: 8, category: "תפקוד", check: "פתיחה / סגירה חלקה ללא חיכוך", mandatory: true },
  { num: 9, category: "תפקוד", check: "ידיות ומנגנונים מהודקים", mandatory: true },
  { num: 10, category: "תפקוד", check: "תריס / גלילה — פעולה תקינה", mandatory: false },
  { num: 11, category: "מידות", check: "התאמה לפתח — סטייה מקסימלית 2 מ\"מ", mandatory: true },
  { num: 12, category: "מידות", check: "אנכיות ואופקיות — פלס תקין", mandatory: true },
  { num: 13, category: "תיעוד", check: "צילומי לפני / אחרי הועלו למערכת", mandatory: true },
  { num: 14, category: "תיעוד", check: "תעודת אחריות נמסרה ללקוח", mandatory: true },
  { num: 15, category: "תיעוד", check: "הנחיות תחזוקה הוסברו ללקוח", mandatory: false },
];

const customerFeedback = [
  { date: "2026-04-06", customer: "אבי רוזנפלד", project: "בית חכם — הרצליה", rating: 5, summary: "מרוצה מאוד. ציין מקצועיות הצוות ועמידה בזמנים." },
  { date: "2026-04-07", customer: "דנה כהן-מלמד", project: "מרכז ספורט — ראשל\"צ", rating: 4, summary: "רוב ההתקנה מצוינת, ציר בדלת אש דורש כיוון. תוקן תוך יום." },
  { date: "2026-03-28", customer: "משה אדרי", project: "בית ספר השלום — אשדוד", rating: 5, summary: "עבודה מושלמת. הלקוח ביקש הצעה לפרויקט נוסף." },
  { date: "2026-03-25", customer: "רינת גולדברג", project: "דירת גג — רמת גן", rating: 3, summary: "עיכוב של יומיים. איכות סופית טובה אך התקשורת הייתה לקויה." },
  { date: "2026-03-20", customer: "חיים סויסה", project: "מחסן תעשייתי — אשקלון", rating: 5, summary: "מסירה חלקה, ללא הערות. ממליץ בחום." },
  { date: "2026-03-15", customer: "ענבל לוי-שרון", project: "קליניקה — כפר סבא", rating: 4, summary: "עבודה טובה. בקשה לשיפור — סימון אזורי עבודה בזמן התקנה." },
  { date: "2026-03-10", customer: "עופר נחמיאס", project: "וילה — סביון", rating: 2, summary: "שריטה על זכוכית ויטרינה. הוחלפה אך נדרשו 5 ימים." },
  { date: "2026-03-01", customer: "סיגל ממן", project: "משרד עו\"ד — ת\"א", rating: 5, summary: "שירות יוצא מן הכלל. נתנה המלצה בפייסבוק." },
];

const statusColor: Record<string, string> = {
  "אושר": "bg-emerald-500/20 text-emerald-300",
  "בביצוע": "bg-yellow-500/20 text-yellow-300",
  "ממתין לאישור": "bg-blue-500/20 text-blue-300",
  "מתוכנן": "bg-slate-500/20 text-slate-300",
  "דורש תיקון": "bg-red-500/20 text-red-300",
};

const PunchIcon = ({ v }: { v: string }) =>
  v === "pass" ? <CheckCircle className="h-4 w-4 text-emerald-400 mx-auto" />
    : v === "fail" ? <XCircle className="h-4 w-4 text-red-400 mx-auto" />
    : <Minus className="h-4 w-4 text-gray-500 mx-auto" />;

const Stars = ({ n }: { n: number }) => (
  <span className="flex gap-0.5">{[1,2,3,4,5].map(i => (
    <Star key={i} className={`h-3.5 w-3.5 ${i <= n ? "text-amber-400 fill-amber-400" : "text-gray-600"}`} />
  ))}</span>
);

const kpiData = [
  { label: "ממתינות למסירה", value: 4, icon: Clock, color: "text-orange-400", bg: "bg-orange-500/10" },
  { label: "מסירות השבוע", value: 3, icon: Calendar, color: "text-blue-400", bg: "bg-blue-500/10" },
  { label: "אושרו ע\"י לקוח", value: 2, icon: ThumbsUp, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { label: "עם הערות", value: 1, icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/10" },
  { label: "ממוצע זמן מסירה", value: "1.5 שעות", icon: Clock, color: "text-purple-400", bg: "bg-purple-500/10" },
];

export default function CustomerHandover() {
  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <FileCheck className="h-7 w-7 text-primary" /> מסירות ואישורי לקוח
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          טכנו-כל עוזי — תור מסירות | פרוטוקול בדיקה | חתימת לקוח | הערות ומשוב
        </p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-5 gap-3">
        {kpiData.map((kpi, i) => { const Icon = kpi.icon; return (
          <Card key={i} className={`${kpi.bg} border-0 shadow-sm`}>
            <CardContent className="pt-3 pb-2 text-center px-2">
              <Icon className={`h-5 w-5 mx-auto ${kpi.color} mb-1`} />
              <p className="text-[10px] text-muted-foreground leading-tight">{kpi.label}</p>
              <p className={`text-2xl font-bold font-mono ${kpi.color}`}>{kpi.value}</p>
            </CardContent>
          </Card>
        ); })}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="queue">
        <TabsList className="grid grid-cols-3 w-full max-w-xl">
          <TabsTrigger value="queue" className="text-xs gap-1"><ClipboardList className="h-3.5 w-3.5" /> תור מסירות</TabsTrigger>
          <TabsTrigger value="protocol" className="text-xs gap-1"><ShieldCheck className="h-3.5 w-3.5" /> פרוטוקול</TabsTrigger>
          <TabsTrigger value="feedback" className="text-xs gap-1"><MessageSquare className="h-3.5 w-3.5" /> הערות לקוח</TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Handover Queue ───────────────────────────── */}
        <TabsContent value="queue" className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><ClipboardList className="h-4 w-4 text-blue-400" /> תור מסירות — 8 הזמנות</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow className="bg-muted/40">
                  {["מס׳ מסירה","התקנה / פרויקט","לקוח","טלפון","תאריך מסירה","צוות מסירה","סטטוס"].map(h => (
                    <TableHead key={h} className="text-right text-[10px] font-semibold">{h}</TableHead>
                  ))}
                </TableRow></TableHeader>
                <TableBody>
                  {handovers.map((h) => (
                    <TableRow key={h.id} className="text-xs">
                      <TableCell className="font-mono font-semibold text-primary">{h.id}</TableCell>
                      <TableCell><span className="font-mono text-muted-foreground">{h.installation}</span> — {h.project}</TableCell>
                      <TableCell className="font-semibold">{h.customer}</TableCell>
                      <TableCell className="font-mono text-muted-foreground" dir="ltr">{h.phone}</TableCell>
                      <TableCell className="font-mono">{h.date}</TableCell>
                      <TableCell>{h.crew}</TableCell>
                      <TableCell><Badge className={`text-[9px] ${statusColor[h.status] || "bg-gray-500/20 text-gray-300"}`}>{h.status}</Badge></TableCell>
                    </TableRow>))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><CheckCircle className="h-4 w-4 text-emerald-400" /> רשימת בדיקה (Punch List) — מסירות פעילות</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow className="bg-muted/40">
                  <TableHead className="text-right text-[10px] font-semibold">פריט בדיקה</TableHead>
                  <TableHead className="text-center text-[10px] font-semibold">HDV-103<br /><span className="font-normal">מגדלי הים</span></TableHead>
                  <TableHead className="text-center text-[10px] font-semibold">HDV-104<br /><span className="font-normal">קניון הדרום</span></TableHead>
                  <TableHead className="text-center text-[10px] font-semibold">HDV-105<br /><span className="font-normal">בניין מגורים</span></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {punchListItems.map((p, i) => (
                    <TableRow key={i} className="text-xs">
                      <TableCell className="font-semibold">{p.item}</TableCell>
                      <TableCell><PunchIcon v={p.hdv103} /></TableCell>
                      <TableCell><PunchIcon v={p.hdv104} /></TableCell>
                      <TableCell><PunchIcon v={p.hdv105} /></TableCell>
                    </TableRow>))}
                  <TableRow className="text-xs bg-muted/30 font-semibold">
                    <TableCell>סה״כ עובר</TableCell>
                    <TableCell className="text-center text-emerald-400">8/10</TableCell>
                    <TableCell className="text-center text-emerald-400">9/10</TableCell>
                    <TableCell className="text-center text-red-400">6/10</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Pen className="h-4 w-4 text-indigo-400" /> חתימה דיגיטלית ואישור לקוח</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow className="bg-muted/40">
                  <TableHead className="text-right text-[10px] font-semibold">מסירה</TableHead>
                  <TableHead className="text-right text-[10px] font-semibold">לקוח</TableHead>
                  <TableHead className="text-center text-[10px] font-semibold">חתימה</TableHead>
                  <TableHead className="text-center text-[10px] font-semibold">דירוג שביעות רצון</TableHead>
                  <TableHead className="text-right text-[10px] font-semibold">הערות</TableHead>
                  <TableHead className="text-center text-[10px] font-semibold">תמונות</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {signoffData.map((s, i) => (
                    <TableRow key={i} className="text-xs">
                      <TableCell className="font-mono font-semibold text-primary">{s.hdv}</TableCell>
                      <TableCell className="font-semibold">{s.customer}</TableCell>
                      <TableCell className="text-center">{s.signed
                        ? <Badge className="text-[9px] bg-emerald-500/20 text-emerald-300">נחתם</Badge>
                        : <Badge className="text-[9px] bg-gray-500/20 text-gray-400">ממתין</Badge>}</TableCell>
                      <TableCell><div className="flex justify-center">{s.rating > 0 ? <Stars n={s.rating} /> : <span className="text-muted-foreground">—</span>}</div></TableCell>
                      <TableCell className="text-muted-foreground max-w-[220px] truncate">{s.comments}</TableCell>
                      <TableCell className="text-center"><span className="flex items-center justify-center gap-1 text-sky-400"><Camera className="h-3.5 w-3.5" /> {s.photos}</span></TableCell>
                    </TableRow>))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 2: Protocol Template ────────────────────────── */}
        <TabsContent value="protocol">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-blue-400" /> פרוטוקול מסירה — תבנית בדיקה (15 סעיפים)</CardTitle>
              <p className="text-[10px] text-muted-foreground">יש לסמן כל סעיף לפני חתימת הלקוח. סעיפי חובה מסומנים ב-★</p>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow className="bg-muted/40">
                  <TableHead className="text-right text-[10px] font-semibold w-10">#</TableHead>
                  <TableHead className="text-right text-[10px] font-semibold">קטגוריה</TableHead>
                  <TableHead className="text-right text-[10px] font-semibold">סעיף בדיקה</TableHead>
                  <TableHead className="text-center text-[10px] font-semibold">חובה</TableHead>
                  <TableHead className="text-center text-[10px] font-semibold">תקין</TableHead>
                  <TableHead className="text-center text-[10px] font-semibold">לא תקין</TableHead>
                  <TableHead className="text-center text-[10px] font-semibold">לא רלוונטי</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {protocolTemplate.map((p) => {
                    const catColor = p.category === "בטיחות" ? "bg-red-500/20 text-red-300" : p.category === "איטום" ? "bg-blue-500/20 text-blue-300"
                      : p.category === "מראה" ? "bg-purple-500/20 text-purple-300" : p.category === "תפקוד" ? "bg-amber-500/20 text-amber-300"
                      : p.category === "מידות" ? "bg-cyan-500/20 text-cyan-300" : "bg-slate-500/20 text-slate-300";
                    return (
                    <TableRow key={p.num} className="text-xs">
                      <TableCell className="font-mono font-semibold text-primary">{p.num}</TableCell>
                      <TableCell><Badge className={`text-[9px] ${catColor}`}>{p.category}</Badge></TableCell>
                      <TableCell>{p.check}</TableCell>
                      <TableCell className="text-center">{p.mandatory ? <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400 mx-auto" /> : <Minus className="h-3.5 w-3.5 text-gray-600 mx-auto" />}</TableCell>
                      <TableCell className="text-center"><div className="h-4 w-4 rounded border border-emerald-500/40 mx-auto" /></TableCell>
                      <TableCell className="text-center"><div className="h-4 w-4 rounded border border-red-500/40 mx-auto" /></TableCell>
                      <TableCell className="text-center"><div className="h-4 w-4 rounded border border-gray-500/40 mx-auto" /></TableCell>
                    </TableRow>); })}
                </TableBody>
              </Table>
            </CardContent>
            <CardContent className="border-t border-border/40 pt-3">
              <div className="grid grid-cols-3 gap-4 text-xs">
                <div className="space-y-1">
                  <p className="font-semibold text-muted-foreground">סיכום פרוטוקול</p>
                  <p>סעיפי חובה: <span className="font-mono font-bold text-primary">11</span> | רשות: <span className="font-mono font-bold">4</span></p>
                  <p>סף מעבר: <span className="font-mono font-bold text-emerald-400">100% חובה + 50% רשות</span></p>
                </div>
                <div className="space-y-1">
                  <p className="font-semibold text-muted-foreground">חתימת מבצע</p>
                  <div className="h-12 rounded border border-dashed border-muted-foreground/30 flex items-center justify-center"><span className="text-muted-foreground/50 text-[10px]">[ חתימת ראש צוות ]</span></div>
                </div>
                <div className="space-y-1">
                  <p className="font-semibold text-muted-foreground">חתימת לקוח</p>
                  <div className="h-12 rounded border border-dashed border-muted-foreground/30 flex items-center justify-center"><span className="text-muted-foreground/50 text-[10px]">[ חתימה דיגיטלית ]</span></div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 3: Customer Feedback Log ────────────────────── */}
        <TabsContent value="feedback">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><MessageSquare className="h-4 w-4 text-violet-400" /> יומן הערות לקוח — מסירות אחרונות</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow className="bg-muted/40">
                  {["תאריך","לקוח","פרויקט"].map(h => <TableHead key={h} className="text-right text-[10px] font-semibold">{h}</TableHead>)}
                  <TableHead className="text-center text-[10px] font-semibold">דירוג</TableHead>
                  <TableHead className="text-right text-[10px] font-semibold">סיכום הערות</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {customerFeedback.map((f, i) => (
                    <TableRow key={i} className="text-xs">
                      <TableCell className="font-mono">{f.date}</TableCell>
                      <TableCell className="font-semibold">{f.customer}</TableCell>
                      <TableCell className="text-muted-foreground">{f.project}</TableCell>
                      <TableCell><div className="flex justify-center"><Stars n={f.rating} /></div></TableCell>
                      <TableCell className="text-muted-foreground max-w-[300px]">{f.summary}</TableCell>
                    </TableRow>))}
                </TableBody>
              </Table>
            </CardContent>
            <CardContent className="border-t border-border/40 pt-3">
              <div className="grid grid-cols-4 gap-4">
                <Card className="bg-emerald-500/10 border-0"><CardContent className="py-2 text-center">
                  <p className="text-[10px] text-muted-foreground">ממוצע דירוג</p>
                  <p className="text-xl font-bold font-mono text-emerald-400">4.1</p><Stars n={4} />
                </CardContent></Card>
                <Card className="bg-blue-500/10 border-0"><CardContent className="py-2 text-center">
                  <p className="text-[10px] text-muted-foreground">סה״כ מסירות (חודש)</p>
                  <p className="text-xl font-bold font-mono text-blue-400">8</p>
                </CardContent></Card>
                <Card className="bg-amber-500/10 border-0"><CardContent className="py-2 text-center">
                  <p className="text-[10px] text-muted-foreground">עם הערות</p>
                  <p className="text-xl font-bold font-mono text-amber-400">3</p><Progress value={37.5} className="h-1 mt-1" />
                </CardContent></Card>
                <Card className="bg-purple-500/10 border-0"><CardContent className="py-2 text-center">
                  <p className="text-[10px] text-muted-foreground">המלצות לקוח</p>
                  <p className="text-xl font-bold font-mono text-purple-400">2</p>
                </CardContent></Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
