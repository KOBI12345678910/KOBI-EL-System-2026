import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  ClipboardCheck, TrendingUp, Package, Target, AlertTriangle,
  CalendarCheck, CheckCircle2, Clock, UserCheck, BarChart3,
} from "lucide-react";

const kpis = [
  { label: "ספירות החודש", value: "12", icon: ClipboardCheck, color: "text-cyan-400", bg: "bg-cyan-500/10" },
  { label: "פריטים נספרו", value: "3,847", icon: Package, color: "text-blue-400", bg: "bg-blue-500/10" },
  { label: "אחוז דיוק", value: "97.8%", icon: Target, color: "text-green-400", bg: "bg-green-500/10" },
  { label: "סטיות שנמצאו", value: "34", icon: AlertTriangle, color: "text-orange-400", bg: "bg-orange-500/10" },
  { label: "התאמות בוצעו", value: "28", icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { label: "ספירה הבאה", value: "12/04", icon: CalendarCheck, color: "text-purple-400", bg: "bg-purple-500/10" },
];

const SC: Record<string, string> = {
  "בביצוע": "bg-yellow-500/20 text-yellow-300",
  "הושלם": "bg-green-500/20 text-green-300",
  "ממתין": "bg-blue-500/20 text-blue-300",
  "מושהה": "bg-red-500/20 text-red-300",
};

const activeCounts = [
  { id: "CC-401", zone: "A-1 מדפים עליונים", items: 120, counter: "יוסי כהן", start: "08:30", progress: 85, status: "בביצוע" },
  { id: "CC-402", zone: "B-3 חומרי גלם", items: 95, counter: "שרה לוי", start: "09:15", progress: 62, status: "בביצוע" },
  { id: "CC-403", zone: "C-2 מוצרים מוגמרים", items: 200, counter: "דוד מזרחי", start: "07:45", progress: 100, status: "הושלם" },
  { id: "CC-404", zone: "D-1 חלפים", items: 78, counter: "רחל אברהם", start: "10:00", progress: 41, status: "בביצוע" },
  { id: "CC-405", zone: "A-4 אריזות", items: 150, counter: "אלון גולדשטיין", start: "08:00", progress: 100, status: "הושלם" },
  { id: "CC-406", zone: "B-1 כימיקלים", items: 60, counter: "מיכל ברק", start: "11:30", progress: 0, status: "ממתין" },
  { id: "CC-407", zone: "C-4 ציוד עזר", items: 88, counter: "עומר חדד", start: "09:00", progress: 73, status: "בביצוע" },
  { id: "CC-408", zone: "D-3 מחסן חיצוני", items: 45, counter: "נועה פרידמן", start: "—", progress: 0, status: "מושהה" },
];

const results = [
  { item: "חומר גלם #1042", systemQty: 500, countedQty: 498, variance: -2, pct: -0.4, adj: "בוצע", auditor: "איתן רוזנברג" },
  { item: "אריזה קרטון 40x30", systemQty: 1200, countedQty: 1185, variance: -15, pct: -1.25, adj: "בוצע", auditor: "תמר שלום" },
  { item: "בורג M8 נירוסטה", systemQty: 10000, countedQty: 10000, variance: 0, pct: 0, adj: "תקין", auditor: "יוסי כהן" },
  { item: "צבע תעשייתי כחול", systemQty: 80, countedQty: 82, variance: 2, pct: 2.5, adj: "ממתין", auditor: "שרה לוי" },
  { item: "פלסטיק ABS גרנולים", systemQty: 3000, countedQty: 2970, variance: -30, pct: -1.0, adj: "בוצע", auditor: "דוד מזרחי" },
  { item: "מסנן שמן HF-200", systemQty: 150, countedQty: 148, variance: -2, pct: -1.33, adj: "בוצע", auditor: "רחל אברהם" },
  { item: "גליל ניילון שקוף", systemQty: 400, countedQty: 405, variance: 5, pct: 1.25, adj: "ממתין", auditor: "אלון גולדשטיין" },
  { item: "תווית מודפסת XL", systemQty: 5000, countedQty: 4990, variance: -10, pct: -0.2, adj: "בוצע", auditor: "מיכל ברק" },
];

const schedule = [
  { zone: "A - מדפים ראשיים", freq: "שבועי", last: "01/04/2026", next: "08/04/2026", items: 320, assigned: "יוסי כהן" },
  { zone: "B - חומרי גלם", freq: "דו-שבועי", last: "25/03/2026", next: "08/04/2026", items: 210, assigned: "שרה לוי" },
  { zone: "C - מוצרים מוגמרים", freq: "חודשי", last: "01/03/2026", next: "01/04/2026", items: 480, assigned: "דוד מזרחי" },
  { zone: "D - חלפים וציוד", freq: "חודשי", last: "15/03/2026", next: "15/04/2026", items: 175, assigned: "רחל אברהם" },
  { zone: "E - אריזות", freq: "שבועי", last: "01/04/2026", next: "08/04/2026", items: 95, assigned: "אלון גולדשטיין" },
  { zone: "F - כימיקלים", freq: "דו-שבועי", last: "22/03/2026", next: "05/04/2026", items: 60, assigned: "מיכל ברק" },
  { zone: "G - מחסן חיצוני", freq: "חודשי", last: "01/03/2026", next: "01/04/2026", items: 130, assigned: "עומר חדד" },
  { zone: "H - קו ייצור", freq: "יומי", last: "07/04/2026", next: "08/04/2026", items: 42, assigned: "נועה פרידמן" },
];

const accuracy = [
  { month: "נובמבר 2025", pct: 96.2 },
  { month: "דצמבר 2025", pct: 96.8 },
  { month: "ינואר 2026", pct: 97.1 },
  { month: "פברואר 2026", pct: 97.5 },
  { month: "מרץ 2026", pct: 97.3 },
  { month: "אפריל 2026", pct: 97.8 },
];

const ADJ: Record<string, string> = {
  "בוצע": "bg-green-500/20 text-green-300",
  "ממתין": "bg-yellow-500/20 text-yellow-300",
  "תקין": "bg-blue-500/20 text-blue-300",
};

export default function CycleCounts() {
  const [tab, setTab] = useState("active");

  return (
    <div className="p-6 space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-cyan-500/10">
          <ClipboardCheck className="h-6 w-6 text-cyan-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">ספירות מלאי מחזוריות</h1>
          <p className="text-sm text-muted-foreground">ניהול ספירות, תוצאות, תכנון ומעקב דיוק - טכנו-כל עוזי</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k, i) => (
          <Card key={i} className="bg-card/80 border-border">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] text-muted-foreground">{k.label}</p>
                  <p className={`text-lg font-bold font-mono mt-1 ${k.color}`}>{k.value}</p>
                </div>
                <div className={`p-1.5 rounded-md ${k.bg}`}>
                  <k.icon className={`h-4 w-4 ${k.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-card/60 border border-border">
          <TabsTrigger value="active" className="data-[state=active]:bg-cyan-600 gap-1">
            <Clock className="h-3.5 w-3.5" /> ספירות פעילות
          </TabsTrigger>
          <TabsTrigger value="results" className="data-[state=active]:bg-cyan-600 gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" /> תוצאות
          </TabsTrigger>
          <TabsTrigger value="schedule" className="data-[state=active]:bg-cyan-600 gap-1">
            <CalendarCheck className="h-3.5 w-3.5" /> תכנון
          </TabsTrigger>
          <TabsTrigger value="accuracy" className="data-[state=active]:bg-cyan-600 gap-1">
            <BarChart3 className="h-3.5 w-3.5" /> דיוק
          </TabsTrigger>
        </TabsList>

        {/* Active Counts */}
        <TabsContent value="active">
          <Card className="bg-card/80 border-border">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-background/50">
                      <th className="p-3 text-right text-muted-foreground font-medium">מזהה</th>
                      <th className="p-3 text-right text-muted-foreground font-medium">אזור / מיקום</th>
                      <th className="p-3 text-right text-muted-foreground font-medium">פריטים לספירה</th>
                      <th className="p-3 text-right text-muted-foreground font-medium">סופר</th>
                      <th className="p-3 text-right text-muted-foreground font-medium">שעת התחלה</th>
                      <th className="p-3 text-right text-muted-foreground font-medium">התקדמות</th>
                      <th className="p-3 text-right text-muted-foreground font-medium">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeCounts.map((r) => (
                      <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="p-3 font-mono text-xs text-blue-400">{r.id}</td>
                        <td className="p-3 text-foreground font-medium">{r.zone}</td>
                        <td className="p-3 font-mono text-cyan-400 text-center">{r.items}</td>
                        <td className="p-3 text-muted-foreground flex items-center gap-1.5">
                          <UserCheck className="h-3.5 w-3.5 text-muted-foreground/60" />{r.counter}
                        </td>
                        <td className="p-3 text-muted-foreground font-mono text-xs">{r.start}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <Progress value={r.progress} className="h-2 flex-1" />
                            <span className="font-mono text-xs text-muted-foreground w-10 text-left">{r.progress}%</span>
                          </div>
                        </td>
                        <td className="p-3">
                          <Badge className={`${SC[r.status]} border-0 text-xs`}>{r.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Results */}
        <TabsContent value="results">
          <Card className="bg-card/80 border-border">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-background/50">
                      <th className="p-3 text-right text-muted-foreground font-medium">פריט</th>
                      <th className="p-3 text-right text-muted-foreground font-medium">כמות מערכת</th>
                      <th className="p-3 text-right text-muted-foreground font-medium">כמות נספרה</th>
                      <th className="p-3 text-right text-muted-foreground font-medium">סטייה</th>
                      <th className="p-3 text-right text-muted-foreground font-medium">סטייה %</th>
                      <th className="p-3 text-right text-muted-foreground font-medium">התאמה</th>
                      <th className="p-3 text-right text-muted-foreground font-medium">מבקר</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => (
                      <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="p-3 text-foreground font-medium">{r.item}</td>
                        <td className="p-3 font-mono text-muted-foreground text-center">{r.systemQty.toLocaleString()}</td>
                        <td className="p-3 font-mono text-cyan-400 text-center">{r.countedQty.toLocaleString()}</td>
                        <td className="p-3 font-mono">
                          <span className={r.variance === 0 ? "text-blue-400" : r.variance < 0 ? "text-red-400" : "text-orange-400"}>
                            {r.variance > 0 ? "+" : ""}{r.variance}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-xs">
                          <span className={r.pct === 0 ? "text-blue-400" : Math.abs(r.pct) <= 1 ? "text-yellow-400" : "text-red-400"}>
                            {r.pct > 0 ? "+" : ""}{r.pct}%
                          </span>
                        </td>
                        <td className="p-3">
                          <Badge className={`${ADJ[r.adj]} border-0 text-xs`}>{r.adj}</Badge>
                        </td>
                        <td className="p-3 text-muted-foreground text-xs">{r.auditor}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Schedule */}
        <TabsContent value="schedule">
          <Card className="bg-card/80 border-border">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-background/50">
                      <th className="p-3 text-right text-muted-foreground font-medium">אזור</th>
                      <th className="p-3 text-right text-muted-foreground font-medium">תדירות</th>
                      <th className="p-3 text-right text-muted-foreground font-medium">ספירה אחרונה</th>
                      <th className="p-3 text-right text-muted-foreground font-medium">ספירה הבאה</th>
                      <th className="p-3 text-right text-muted-foreground font-medium">פריטים</th>
                      <th className="p-3 text-right text-muted-foreground font-medium">מוקצה ל</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedule.map((r, i) => (
                      <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="p-3 text-foreground font-medium">{r.zone}</td>
                        <td className="p-3">
                          <Badge className="bg-indigo-500/20 text-indigo-300 border-0 text-xs">{r.freq}</Badge>
                        </td>
                        <td className="p-3 text-muted-foreground font-mono text-xs">{r.last}</td>
                        <td className="p-3 font-mono text-xs text-cyan-400">{r.next}</td>
                        <td className="p-3 font-mono text-muted-foreground text-center">{r.items}</td>
                        <td className="p-3 text-muted-foreground text-xs flex items-center gap-1.5">
                          <UserCheck className="h-3.5 w-3.5 text-muted-foreground/60" />{r.assigned}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Accuracy */}
        <TabsContent value="accuracy">
          <Card className="bg-card/80 border-border">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-5 w-5 text-green-400" />
                <h3 className="text-sm font-semibold text-foreground">מגמת דיוק ספירות - 6 חודשים אחרונים</h3>
              </div>
              {accuracy.map((r, i) => (
                <div key={i} className="flex items-center gap-4">
                  <span className="text-sm text-muted-foreground min-w-[100px]">{r.month}</span>
                  <div className="flex-1">
                    <Progress value={r.pct} className="h-3" />
                  </div>
                  <span className={`font-mono text-sm font-bold min-w-[55px] text-left ${r.pct >= 97.5 ? "text-green-400" : r.pct >= 97 ? "text-cyan-400" : "text-yellow-400"}`}>
                    {r.pct}%
                  </span>
                </div>
              ))}
              <div className="mt-4 pt-4 border-t border-border grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-[11px] text-muted-foreground">ממוצע תקופה</p>
                  <p className="text-lg font-bold font-mono text-cyan-400">97.1%</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">שיא</p>
                  <p className="text-lg font-bold font-mono text-green-400">97.8%</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">יעד</p>
                  <p className="text-lg font-bold font-mono text-purple-400">98.0%</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
