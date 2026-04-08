import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ShieldCheck, ClipboardCheck, AlertTriangle, Wrench, TrendingUp,
  TrendingDown, Users, DollarSign, Package, Star, CheckCircle2, XCircle,
} from "lucide-react";

/* ───────── mock data ───────── */

const inspections = [
  { id: "INS-0401", item: "פרופיל אלומיניום 60x40", stage: "incoming", result: "עבר", inspector: "יוסי כהן", date: "2026-04-07", notes: "תקין לפי מפרט" },
  { id: "INS-0402", item: "פלטת פלדה 3mm", stage: "incoming", result: "נכשל", inspector: "דני לוי", date: "2026-04-07", notes: "עובי חורג ב-0.2mm" },
  { id: "INS-0403", item: "מסגרת ריתוך #W-112", stage: "in_process", result: "עבר", inspector: "אורית שמש", date: "2026-04-07", notes: "ריתוך תקין" },
  { id: "INS-0404", item: "צילינדר הידראולי CYL-88", stage: "in_process", result: "עבר", inspector: "יוסי כהן", date: "2026-04-08", notes: "לחץ תקין 150bar" },
  { id: "INS-0405", item: "שלדת מכונה SM-200", stage: "final", result: "עבר", inspector: "דני לוי", date: "2026-04-08", notes: "מידות ±0.1mm" },
  { id: "INS-0406", item: "מעקה בטיחות BR-55", stage: "final", result: "נכשל", inspector: "אורית שמש", date: "2026-04-08", notes: "צבע מתקלף בפינה" },
  { id: "INS-0407", item: "ברגי חיבור M12 (משלוח)", stage: "incoming", result: "עבר", inspector: "יוסי כהן", date: "2026-04-08", notes: "דגימה 20/20 תקין" },
  { id: "INS-0408", item: "גוף משאבה PMP-44", stage: "in_process", result: "עבר", inspector: "דני לוי", date: "2026-04-08", notes: "עיבוד שבבי תקין" },
];

const ncrs = [
  { id: "NCR-001", item: "פלטת פלדה 3mm", desc: "עובי חורג מהמפרט", disposition: "החזרה לספק", cost: 2400, date: "2026-04-07", status: "פתוח" },
  { id: "NCR-002", item: "מעקה בטיחות BR-55", desc: "צבע מתקלף", disposition: "עיבוד חוזר", cost: 850, date: "2026-04-08", status: "פתוח" },
  { id: "NCR-003", item: "ציר פלדה SH-12", desc: "סדק בריתוך", disposition: "גריטה", cost: 3200, date: "2026-04-05", status: "בטיפול" },
  { id: "NCR-004", item: "משטח עבודה WP-90", desc: "שריטות על פני השטח", disposition: "עיבוד חוזר", cost: 600, date: "2026-04-03", status: "סגור" },
  { id: "NCR-005", item: "בורג M16 אי-התאמה", desc: "חוזק מתיחה נמוך", disposition: "החזרה לספק", cost: 1800, date: "2026-04-01", status: "סגור" },
  { id: "NCR-006", item: "צינור הידראולי HP-30", desc: "דליפה בחיבור", disposition: "עיבוד חוזר", cost: 1100, date: "2026-03-30", status: "בטיפול" },
  { id: "NCR-007", item: "גוף שסתום VB-18", desc: "מידות חורגות", disposition: "ויתור מותנה", cost: 0, date: "2026-03-28", status: "סגור" },
];

const capas = [
  { id: "CAPA-01", type: "CA", action: "הכשרת מחדש לצוות ריתוך", rootCause: "חוסר הכשרה", responsible: "מנהל ייצור", due: "2026-04-15", status: "בביצוע", verified: false },
  { id: "CAPA-02", type: "CA", action: "החלפת ספק פלדה", rootCause: "חומר גלם לקוי", responsible: "מנהל רכש", due: "2026-04-20", status: "מתוכנן", verified: false },
  { id: "CAPA-03", type: "PA", action: "בדיקת קליברציה שבועית", rootCause: "סטייה במכשירי מדידה", responsible: "מנהל איכות", due: "2026-04-10", status: "בביצוע", verified: false },
  { id: "CAPA-04", type: "CA", action: "עדכון הוראות עבודה לצביעה", rootCause: "תהליך לא מעודכן", responsible: "מהנדס תהליך", due: "2026-04-12", status: "הושלם", verified: true },
  { id: "CAPA-05", type: "PA", action: "תוכנית תחזוקה מונעת למכונות CNC", rootCause: "בלאי ציוד", responsible: "מנהל תחזוקה", due: "2026-04-25", status: "מתוכנן", verified: false },
  { id: "CAPA-06", type: "CA", action: "הוספת בדיקת ביניים אחרי ריתוך", rootCause: "איתור מאוחר של פגמים", responsible: "מנהל איכות", due: "2026-04-08", status: "הושלם", verified: true },
  { id: "CAPA-07", type: "PA", action: "הטמעת SPC בקו ייצור 2", rootCause: "חוסר בקרה סטטיסטית", responsible: "מהנדס איכות", due: "2026-05-01", status: "מתוכנן", verified: false },
];

const suppliers = [
  { name: "מתכות ישראל בע\"מ", deliveries: 48, defects: 2, rate: 4.2, score: 92, trend: "up" },
  { name: "פלדת הצפון", deliveries: 35, defects: 3, rate: 8.6, score: 84, trend: "down" },
  { name: "ברגים ומחברים בע\"מ", deliveries: 120, defects: 1, rate: 0.8, score: 97, trend: "up" },
  { name: "אלומיניום הגליל", deliveries: 28, defects: 4, rate: 14.3, score: 71, trend: "down" },
  { name: "הידראוליקה מתקדמת", deliveries: 22, defects: 0, rate: 0, score: 99, trend: "stable" },
  { name: "צבעי תעשייה", deliveries: 60, defects: 5, rate: 8.3, score: 78, trend: "down" },
  { name: "חומרי גלם דרום", deliveries: 42, defects: 1, rate: 2.4, score: 94, trend: "up" },
];

const installers = [
  { team: "צוות התקנה א׳ - חיפה", checked: 18, issues: 1, rating: 96, lead: "אבי כהן" },
  { team: "צוות התקנה ב׳ - ת\"א", checked: 24, issues: 3, rating: 88, lead: "משה לוי" },
  { team: "צוות התקנה ג׳ - באר שבע", checked: 12, issues: 0, rating: 100, lead: "יוסי דוד" },
  { team: "צוות התקנה ד׳ - ירושלים", checked: 15, issues: 2, rating: 87, lead: "דוד מזרחי" },
  { team: "צוות התקנה ה׳ - נתניה", checked: 20, issues: 1, rating: 95, lead: "רון ביטון" },
  { team: "צוות התקנה ו׳ - אשדוד", checked: 10, issues: 4, rating: 60, lead: "עמית גולן" },
];

const defectCosts = [
  { category: "חומר גלם לקוי", occurrences: 12, cost: 18400, trend: "up" },
  { category: "טעות ריתוך", occurrences: 8, cost: 12800, trend: "down" },
  { category: "צביעה לקויה", occurrences: 6, cost: 5100, trend: "up" },
  { category: "מידות חורגות", occurrences: 5, cost: 7500, trend: "stable" },
  { category: "דליפה הידראולית", occurrences: 3, cost: 4200, trend: "down" },
  { category: "התקנה לקויה (שטח)", occurrences: 4, cost: 6800, trend: "up" },
  { category: "אריזה/שינוע", occurrences: 2, cost: 1600, trend: "stable" },
];

/* ───────── helpers ───────── */

const fmt = (n: number) => "₪" + n.toLocaleString("he-IL");

const stageBadge = (s: string) => {
  const map: Record<string, { label: string; cls: string }> = {
    incoming: { label: "כניסה", cls: "bg-blue-500/20 text-blue-300" },
    in_process: { label: "תהליך", cls: "bg-yellow-500/20 text-yellow-300" },
    final: { label: "סופי", cls: "bg-purple-500/20 text-purple-300" },
  };
  const m = map[s] || { label: s, cls: "bg-gray-500/20 text-gray-300" };
  return <Badge className={m.cls}>{m.label}</Badge>;
};

const resultBadge = (r: string) =>
  r === "עבר"
    ? <Badge className="bg-green-500/20 text-green-300"><CheckCircle2 className="w-3 h-3 ml-1" />עבר</Badge>
    : <Badge className="bg-red-500/20 text-red-300"><XCircle className="w-3 h-3 ml-1" />נכשל</Badge>;

const statusBadge = (s: string) => {
  const map: Record<string, string> = {
    "פתוח": "bg-red-500/20 text-red-300",
    "בטיפול": "bg-yellow-500/20 text-yellow-300",
    "בביצוע": "bg-yellow-500/20 text-yellow-300",
    "סגור": "bg-green-500/20 text-green-300",
    "הושלם": "bg-green-500/20 text-green-300",
    "מתוכנן": "bg-blue-500/20 text-blue-300",
  };
  return <Badge className={map[s] || "bg-gray-500/20 text-gray-300"}>{s}</Badge>;
};

const trendIcon = (t: string) =>
  t === "up" ? <TrendingUp className="w-4 h-4 text-red-400" />
    : t === "down" ? <TrendingDown className="w-4 h-4 text-green-400" />
      : <span className="text-xs text-muted-foreground">—</span>;

const scoreColor = (s: number) =>
  s >= 90 ? "text-green-400" : s >= 75 ? "text-yellow-400" : "text-red-400";

/* ───────── component ───────── */

export default function QualityManagementSystem() {
  const [tab, setTab] = useState("inspections");

  const kpis = [
    { title: "בדיקות היום", value: inspections.filter(i => i.date === "2026-04-08").length, icon: ClipboardCheck, color: "text-blue-400" },
    { title: "First Pass Yield", value: ((inspections.filter(i => i.result === "עבר").length / inspections.length) * 100).toFixed(1) + "%", icon: CheckCircle2, color: "text-green-400" },
    { title: "NCR פתוחים", value: ncrs.filter(n => n.status !== "סגור").length, icon: AlertTriangle, color: "text-red-400" },
    { title: "פעולות מתקנות פתוחות", value: capas.filter(c => c.status !== "הושלם").length, icon: Wrench, color: "text-orange-400" },
    { title: "שיעור פגמי ספקים", value: ((suppliers.reduce((a, s) => a + s.defects, 0) / suppliers.reduce((a, s) => a + s.deliveries, 0)) * 100).toFixed(1) + "%", icon: Package, color: "text-yellow-400" },
    { title: "עלות פגמים כוללת", value: fmt(defectCosts.reduce((a, d) => a + d.cost, 0)), icon: DollarSign, color: "text-rose-400" },
  ];

  return (
    <div dir="rtl" className="p-6 space-y-6 min-h-screen">
      {/* Header */}
      <div className="flex items-center gap-3">
        <ShieldCheck className="w-8 h-8 text-blue-400" />
        <div>
          <h1 className="text-2xl font-bold">מערכת ניהול איכות (QMS)</h1>
          <p className="text-sm text-muted-foreground">טכנו-כל עוזי — ניהול איכות מקצה לקצה</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((k, i) => (
          <Card key={i} className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{k.title}</p>
                  <p className={`text-2xl font-bold mt-1 ${k.color}`}>{k.value}</p>
                </div>
                <k.icon className={`w-6 h-6 ${k.color} opacity-60`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-muted/30">
          <TabsTrigger value="inspections">בדיקות</TabsTrigger>
          <TabsTrigger value="ncr">NCR</TabsTrigger>
          <TabsTrigger value="capa">CAPA</TabsTrigger>
          <TabsTrigger value="suppliers">ספקים</TabsTrigger>
          <TabsTrigger value="installations">התקנות</TabsTrigger>
          <TabsTrigger value="costs">עלויות</TabsTrigger>
        </TabsList>

        {/* ─── Inspections ─── */}
        <TabsContent value="inspections">
          <Card className="bg-card/50 border-border/50">
            <CardHeader><CardTitle className="text-lg">בדיקות — כניסה / תהליך / סופי</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">מזהה</TableHead>
                    <TableHead className="text-right">פריט</TableHead>
                    <TableHead className="text-right">שלב</TableHead>
                    <TableHead className="text-right">תוצאה</TableHead>
                    <TableHead className="text-right">בודק</TableHead>
                    <TableHead className="text-right">תאריך</TableHead>
                    <TableHead className="text-right">הערות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inspections.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-sm">{r.id}</TableCell>
                      <TableCell>{r.item}</TableCell>
                      <TableCell>{stageBadge(r.stage)}</TableCell>
                      <TableCell>{resultBadge(r.result)}</TableCell>
                      <TableCell>{r.inspector}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.date}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[180px] truncate">{r.notes}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── NCR ─── */}
        <TabsContent value="ncr">
          <Card className="bg-card/50 border-border/50">
            <CardHeader><CardTitle className="text-lg">דוחות אי-התאמה (NCR)</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">מספר</TableHead>
                    <TableHead className="text-right">פריט</TableHead>
                    <TableHead className="text-right">תיאור</TableHead>
                    <TableHead className="text-right">דיספוזיציה</TableHead>
                    <TableHead className="text-right">השפעת עלות</TableHead>
                    <TableHead className="text-right">תאריך</TableHead>
                    <TableHead className="text-right">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ncrs.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-sm">{r.id}</TableCell>
                      <TableCell>{r.item}</TableCell>
                      <TableCell className="max-w-[200px]">{r.desc}</TableCell>
                      <TableCell><Badge variant="outline">{r.disposition}</Badge></TableCell>
                      <TableCell className="font-mono text-red-400">{fmt(r.cost)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.date}</TableCell>
                      <TableCell>{statusBadge(r.status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── CAPA ─── */}
        <TabsContent value="capa">
          <Card className="bg-card/50 border-border/50">
            <CardHeader><CardTitle className="text-lg">פעולות מתקנות ומונעות (CAPA)</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">מזהה</TableHead>
                    <TableHead className="text-right">סוג</TableHead>
                    <TableHead className="text-right">פעולה</TableHead>
                    <TableHead className="text-right">סיבת שורש</TableHead>
                    <TableHead className="text-right">אחראי</TableHead>
                    <TableHead className="text-right">תאריך יעד</TableHead>
                    <TableHead className="text-right">סטטוס</TableHead>
                    <TableHead className="text-right">אימות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {capas.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-sm">{r.id}</TableCell>
                      <TableCell>
                        <Badge className={r.type === "CA" ? "bg-orange-500/20 text-orange-300" : "bg-cyan-500/20 text-cyan-300"}>
                          {r.type === "CA" ? "מתקנת" : "מונעת"}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[220px]">{r.action}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.rootCause}</TableCell>
                      <TableCell>{r.responsible}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.due}</TableCell>
                      <TableCell>{statusBadge(r.status)}</TableCell>
                      <TableCell>
                        {r.verified
                          ? <CheckCircle2 className="w-5 h-5 text-green-400" />
                          : <XCircle className="w-5 h-5 text-muted-foreground/40" />}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Suppliers ─── */}
        <TabsContent value="suppliers">
          <Card className="bg-card/50 border-border/50">
            <CardHeader><CardTitle className="text-lg">איכות ספקים</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">ספק</TableHead>
                    <TableHead className="text-right">אספקות</TableHead>
                    <TableHead className="text-right">פגמים</TableHead>
                    <TableHead className="text-right">שיעור פגמים %</TableHead>
                    <TableHead className="text-right">ציון איכות</TableHead>
                    <TableHead className="text-right">מגמה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suppliers.map((s, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>{s.deliveries}</TableCell>
                      <TableCell>{s.defects}</TableCell>
                      <TableCell className="font-mono">{s.rate.toFixed(1)}%</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className={`font-bold ${scoreColor(s.score)}`}>{s.score}</span>
                          <Progress value={s.score} className="w-20 h-2" />
                        </div>
                      </TableCell>
                      <TableCell>{trendIcon(s.trend)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Installations ─── */}
        <TabsContent value="installations">
          <Card className="bg-card/50 border-border/50">
            <CardHeader><CardTitle className="text-lg">איכות התקנות</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">צוות</TableHead>
                    <TableHead className="text-right">ראש צוות</TableHead>
                    <TableHead className="text-right">התקנות נבדקו</TableHead>
                    <TableHead className="text-right">תקלות שנמצאו</TableHead>
                    <TableHead className="text-right">דירוג</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {installers.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{r.team}</TableCell>
                      <TableCell>{r.lead}</TableCell>
                      <TableCell>{r.checked}</TableCell>
                      <TableCell>
                        {r.issues === 0
                          ? <Badge className="bg-green-500/20 text-green-300">0</Badge>
                          : <Badge className="bg-red-500/20 text-red-300">{r.issues}</Badge>}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Star className={`w-4 h-4 ${scoreColor(r.rating)}`} />
                          <span className={`font-bold ${scoreColor(r.rating)}`}>{r.rating}%</span>
                          <Progress value={r.rating} className="w-20 h-2" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Defect Costs ─── */}
        <TabsContent value="costs">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-rose-400" />
                ניתוח עלויות פגמים
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">קטגוריה</TableHead>
                    <TableHead className="text-right">מקרים</TableHead>
                    <TableHead className="text-right">עלות כוללת</TableHead>
                    <TableHead className="text-right">עלות ממוצעת</TableHead>
                    <TableHead className="text-right">מגמה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {defectCosts.map((d, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{d.category}</TableCell>
                      <TableCell>{d.occurrences}</TableCell>
                      <TableCell className="font-mono text-red-400">{fmt(d.cost)}</TableCell>
                      <TableCell className="font-mono text-muted-foreground">{fmt(Math.round(d.cost / d.occurrences))}</TableCell>
                      <TableCell>{trendIcon(d.trend)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-4 pt-4 border-t border-border/40 flex justify-between items-center">
                <span className="text-sm text-muted-foreground">סה״כ עלויות פגמים</span>
                <span className="text-xl font-bold text-red-400">{fmt(defectCosts.reduce((a, d) => a + d.cost, 0))}</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
