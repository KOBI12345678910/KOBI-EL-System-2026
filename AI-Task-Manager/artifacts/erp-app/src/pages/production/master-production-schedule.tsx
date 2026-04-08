import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  CalendarClock, CalendarDays, Zap, Link2, FlaskConical, AlertTriangle,
  Clock, Target, TrendingUp, Package, Gauge, ArrowRight, ShieldAlert,
} from "lucide-react";

const workCenters = ["מסור CNC","כיפוף","ריתוך","CNC פרזול","ציפוי/אנודייז","חיתוך זכוכית","הרכבה A","הרכבה B"];
const days = ["ראשון 06/04","שני 07/04","שלישי 08/04","רביעי 09/04","חמישי 10/04"];
const CAP = 8; // hours per center per day

const jobs = [
  { id:"MPS-1001", product:"פרופיל אלומיניום Pro-X 100mm", customer:"קבוצת אלון", qty:450, center:"מסור CNC", day:0, hours:6, priority:"high", status:"in_progress", deps:["MPS-1003"] },
  { id:"MPS-1002", product:"זכוכית מחוסמת 8mm", customer:"אמות השקעות", qty:200, center:"חיתוך זכוכית", day:0, hours:8, priority:"medium", status:"in_progress", deps:[] },
  { id:"MPS-1003", product:"מסגרת ברזל דגם B", customer:"שיכון ובינוי", qty:80, center:"ריתוך", day:1, hours:5, priority:"high", status:"planned", deps:[] },
  { id:"MPS-1004", product:"חלון אלומיניום Premium", customer:"קבוצת אלון", qty:120, center:"הרכבה A", day:2, hours:7, priority:"medium", status:"planned", deps:["MPS-1001","MPS-1002"] },
  { id:"MPS-1005", product:"דלת הזזה 2.4m", customer:'נדל"ן פלוס', qty:30, center:"הרכבה B", day:1, hours:4, priority:"low", status:"planned", deps:["MPS-1003"] },
  { id:"MPS-1006", product:"מעקה בטיחות נירוסטה", customer:"אפריקה ישראל", qty:60, center:"כיפוף", day:2, hours:6, priority:"medium", status:"planned", deps:[] },
  { id:"MPS-1007", product:"פרופיל צבוע RAL7016", customer:"קבוצת אלון", qty:300, center:"ציפוי/אנודייז", day:3, hours:8, priority:"rush", status:"rush", deps:["MPS-1001"] },
  { id:"MPS-1008", product:"ויטרינה חנות 3×2.5m", customer:"רשת שופרסל", qty:8, center:"הרכבה A", day:3, hours:6, priority:"rush", status:"rush", deps:["MPS-1006","MPS-1002"] },
  { id:"MPS-1009", product:"חיפוי אלומיניום קומפוזיט", customer:"מליסרון", qty:150, center:"CNC פרזול", day:4, hours:7, priority:"high", status:"planned", deps:[] },
  { id:"MPS-1010", product:"שלדת פלדה 2.0m", customer:"דניה סיבוס", qty:40, center:"ריתוך", day:4, hours:5, priority:"medium", status:"planned", deps:[] },
];

const loadForCell = (center: string, dayIdx: number) => {
  const cj = jobs.filter(j => j.center === center && j.day === dayIdx);
  const h = cj.reduce((s, j) => s + j.hours, 0);
  return { count: cj.length, hours: h, pct: Math.round((h / CAP) * 100) };
};

const PRI: Record<string, [string, string]> = {
  rush: ["bg-red-500/20 text-red-400 border-red-500/30", "דחוף"],
  high: ["bg-orange-500/20 text-orange-400 border-orange-500/30", "גבוהה"],
  medium: ["bg-yellow-500/20 text-yellow-400 border-yellow-500/30", "בינונית"],
  low: ["bg-blue-500/20 text-blue-400 border-blue-500/30", "נמוכה"],
};
const STS: Record<string, [string, string]> = {
  in_progress: ["bg-blue-500/20 text-blue-400", "בביצוע"], planned: ["bg-slate-500/20 text-slate-400", "מתוכנן"],
  rush: ["bg-red-500/20 text-red-400", "דחוף"], completed: ["bg-emerald-500/20 text-emerald-400", "הושלם"],
};
const priBadge = (p: string) => <Badge variant="outline" className={`text-[10px] ${PRI[p]?.[0]||""}`}>{PRI[p]?.[1]||p}</Badge>;
const stsBadge = (s: string) => <Badge className={`text-[10px] ${STS[s]?.[0]||""}`}>{STS[s]?.[1]||s}</Badge>;
const cellColor = (pct: number) => pct === 0 ? "bg-slate-800/40" : pct <= 60 ? "bg-emerald-900/30 border-emerald-700/30" : pct <= 85 ? "bg-yellow-900/30 border-yellow-700/30" : "bg-red-900/30 border-red-700/30";

const todayPlan = [
  { station:"מסור CNC", job:"MPS-1001", product:"פרופיל אלומיניום Pro-X", op:"רועי כהן", start:"07:00", end:"13:00", pct:65, st:"active" },
  { station:"חיתוך זכוכית", job:"MPS-1002", product:"זכוכית מחוסמת 8mm", op:"אמיר לוי", start:"06:30", end:"14:30", pct:48, st:"active" },
  { station:"ריתוך", job:"—", product:"—", op:"יוסי מזרחי", start:"—", end:"—", pct:0, st:"idle" },
  { station:"CNC פרזול", job:"—", product:"תחזוקה מתוכננת", op:"—", start:"07:00", end:"12:00", pct:0, st:"maint" },
  { station:"ציפוי/אנודייז", job:"—", product:"—", op:"מוחמד חסן", start:"—", end:"—", pct:0, st:"idle" },
  { station:"כיפוף", job:"—", product:"—", op:"דני אברהם", start:"—", end:"—", pct:0, st:"idle" },
  { station:"הרכבה A", job:"—", product:"—", op:"אלי ביטון", start:"—", end:"—", pct:0, st:"idle" },
  { station:"הרכבה B", job:"—", product:"—", op:"שלומי דהן", start:"—", end:"—", pct:0, st:"idle" },
];

const scenarios = [
  { id:1, name:"הוספת משמרת שנייה", desc:"הפעלת משמרת שנייה בקו ריתוך + הרכבה A", impact:"+40% קיבולת", risk:"עלות שכ\"ע +₪18K/שבוע", util:62, ok:true },
  { id:2, name:"דחיית MPS-1009", desc:"דחיית חיפוי קומפוזיט ב-3 ימים", impact:"מפנה CNC פרזול ליום ד׳", risk:"סיכון איחור מול מליסרון", util:71, ok:true },
  { id:3, name:"מיקור חוץ זכוכית", desc:"העברת MPS-1002 לקבלן חיצוני", impact:"פינוי חיתוך זכוכית 8 שעות", risk:"עלות +₪12K, אבדן שליטה על איכות", util:68, ok:false },
];

const rushCount = jobs.filter(j => j.priority === "rush").length;
const totalHours = jobs.reduce((s, j) => s + j.hours, 0);
const utilizationPct = Math.round((totalHours / (workCenters.length * CAP * 5)) * 100);
const [delayedCount, conflicts, adherence] = [1, 2, 87];

export default function MasterProductionSchedule() {
  const [activeTab, setActiveTab] = useState("weekly");
  const [selectedScenario, setSelectedScenario] = useState<number | null>(null);

  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <CalendarClock className="h-7 w-7 text-primary" /> לוח ייצור ראשי (MPS)
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            תכנון שבועי | יומי | עבודות דחופות | תלויות | תרחישי What-If
          </p>
        </div>
        <Badge variant="outline" className="text-xs gap-1 px-2 py-1">
          <Clock className="h-3 w-3" /> שבוע 06-10/04/2026
        </Badge>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-6 gap-2">
        {([
          ["הזמנות מתוכננות", String(jobs.length), Package, "text-blue-400", "bg-blue-500/10"],
          ["ניצולת קיבולת", `${utilizationPct}%`, Gauge, utilizationPct>80?"text-red-400":"text-emerald-400", utilizationPct>80?"bg-red-500/10":"bg-emerald-500/10"],
          ["עבודות דחופות", String(rushCount), Zap, rushCount>0?"text-red-400":"text-emerald-400", rushCount>0?"bg-red-500/10":"bg-emerald-500/10"],
          ["איחור מול תכנון", String(delayedCount), AlertTriangle, delayedCount>0?"text-amber-400":"text-emerald-400", delayedCount>0?"bg-amber-500/10":"bg-emerald-500/10"],
          ["התנגשויות משאבים", String(conflicts), ShieldAlert, conflicts>0?"text-orange-400":"text-emerald-400", conflicts>0?"bg-orange-500/10":"bg-emerald-500/10"],
          ['עמידה בלו"ז', `${adherence}%`, Target, adherence>=90?"text-emerald-400":"text-amber-400", adherence>=90?"bg-emerald-500/10":"bg-amber-500/10"],
        ] as [string, string, any, string, string][]).map(([label, value, Icon, color, bg], i) => (
          <Card key={i} className={`${bg} border-0 shadow-sm`}>
            <CardContent className="pt-2 pb-1.5 text-center px-1">
              <Icon className={`h-4 w-4 mx-auto ${color} mb-0.5`} />
              <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
              <p className={`text-lg font-bold font-mono ${color}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-5 w-full max-w-2xl">
          <TabsTrigger value="weekly" className="text-xs gap-1"><CalendarDays className="h-3.5 w-3.5" /> שבועי</TabsTrigger>
          <TabsTrigger value="daily" className="text-xs gap-1"><Clock className="h-3.5 w-3.5" /> יומי</TabsTrigger>
          <TabsTrigger value="rush" className="text-xs gap-1"><Zap className="h-3.5 w-3.5" /> דחוף</TabsTrigger>
          <TabsTrigger value="deps" className="text-xs gap-1"><Link2 className="h-3.5 w-3.5" /> תלויות</TabsTrigger>
          <TabsTrigger value="whatif" className="text-xs gap-1"><FlaskConical className="h-3.5 w-3.5" /> What-If</TabsTrigger>
        </TabsList>

        {/* ── Weekly Schedule Grid ── */}
        <TabsContent value="weekly" className="mt-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-primary" /> לוח שבועי — מרכזי עבודה × ימים
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="text-[11px]">
                    <TableHead className="text-right w-32 font-semibold">מרכז עבודה</TableHead>
                    {days.map(d => <TableHead key={d} className="text-center font-semibold">{d}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workCenters.map(center => (
                    <TableRow key={center} className="text-[11px]">
                      <TableCell className="font-medium py-1.5">{center}</TableCell>
                      {days.map((_, di) => { const c = loadForCell(center, di); return (
                        <TableCell key={di} className="p-1">
                          <div className={`rounded px-2 py-1.5 text-center border ${cellColor(c.pct)}`}>
                            {c.count > 0 ? (<>
                              <span className="font-bold text-xs">{c.count} עבודות</span>
                              <div className="text-[10px] text-muted-foreground">{c.hours}h / {CAP}h</div>
                              <Progress value={c.pct} className="h-1 mt-1" />
                              <span className={`text-[9px] font-mono ${c.pct>85?"text-red-400":c.pct>60?"text-yellow-400":"text-emerald-400"}`}>{c.pct}%</span>
                            </>) : <span className="text-[10px] text-muted-foreground">--</span>}
                          </div>
                        </TableCell>);
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="mt-3">
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Package className="h-4 w-4 text-primary" /> כל העבודות השבוע ({jobs.length})</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow className="text-[11px]">
                  {["מס׳","מוצר","לקוח"].map(h => <TableHead key={h} className="text-right">{h}</TableHead>)}
                  {["כמות","מרכז","יום","שעות","עדיפות","סטטוס"].map(h => <TableHead key={h} className="text-center">{h}</TableHead>)}
                </TableRow></TableHeader>
                <TableBody>
                  {jobs.map(j => (
                    <TableRow key={j.id} className="text-[11px]">
                      <TableCell className="font-mono font-medium">{j.id}</TableCell>
                      <TableCell>{j.product}</TableCell>
                      <TableCell className="text-muted-foreground">{j.customer}</TableCell>
                      <TableCell className="text-center font-mono">{j.qty}</TableCell>
                      <TableCell className="text-center">{j.center}</TableCell>
                      <TableCell className="text-center">{days[j.day]?.split(" ")[0]}</TableCell>
                      <TableCell className="text-center font-mono">{j.hours}h</TableCell>
                      <TableCell className="text-center">{priBadge(j.priority)}</TableCell>
                      <TableCell className="text-center">{stsBadge(j.status)}</TableCell>
                    </TableRow>))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Daily Plan ── */}
        <TabsContent value="daily" className="mt-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" /> תכנית יומית — שלישי 08/04/2026
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="text-[11px]">
                    <TableHead className="text-right">תחנה</TableHead>
                    <TableHead className="text-right">עבודה</TableHead>
                    <TableHead className="text-right">מוצר</TableHead>
                    <TableHead className="text-right">מפעיל</TableHead>
                    <TableHead className="text-center">התחלה</TableHead>
                    <TableHead className="text-center">סיום</TableHead>
                    <TableHead className="text-center w-28">התקדמות</TableHead>
                    <TableHead className="text-center">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {todayPlan.map((r, i) => (
                    <TableRow key={i} className="text-[11px]">
                      <TableCell className="font-medium">{r.station}</TableCell>
                      <TableCell className="font-mono">{r.job}</TableCell>
                      <TableCell>{r.product}</TableCell>
                      <TableCell className="text-muted-foreground">{r.op}</TableCell>
                      <TableCell className="text-center font-mono">{r.start}</TableCell>
                      <TableCell className="text-center font-mono">{r.end}</TableCell>
                      <TableCell className="text-center">
                        {r.pct > 0 ? (
                          <div className="flex items-center gap-1">
                            <Progress value={r.pct} className="h-1.5 flex-1" />
                            <span className="text-[10px] font-mono w-7">{r.pct}%</span>
                          </div>
                        ) : <span className="text-muted-foreground">--</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className={`text-[10px] ${r.st==="active"?"bg-blue-500/20 text-blue-400":r.st==="idle"?"bg-slate-500/20 text-slate-400":"bg-amber-500/20 text-amber-400"}`}>
                          {r.st==="active"?"בביצוע":r.st==="idle"?"פנוי":"תחזוקה"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Rush Jobs ── */}
        <TabsContent value="rush" className="mt-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap className="h-4 w-4 text-red-400" /> תור עבודות דחופות
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {jobs.filter(j => j.priority === "rush" || j.priority === "high")
                .sort((a, b) => (a.priority === "rush" ? 0 : 1) - (b.priority === "rush" ? 0 : 1))
                .map(j => {
                  const isRush = j.priority === "rush";
                  const bc = isRush ? "border-red-500/30 bg-red-500/5" : "border-orange-500/30 bg-orange-500/5";
                  return (
                    <div key={j.id} className={`border rounded-lg p-3 ${bc}`}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          {priBadge(j.priority)}
                          <span className="font-mono font-bold text-sm">{j.id}</span>
                        </div>
                        <Badge variant="outline" className="text-[10px]">{j.center} | {days[j.day]?.split(" ")[0]}</Badge>
                      </div>
                      <p className="text-sm font-medium">{j.product}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">לקוח: {j.customer} | כמות: {j.qty} | {j.hours} שעות</p>
                      {j.deps.length > 0 && (
                        <div className="flex items-center gap-1 mt-1.5 text-xs text-amber-400">
                          <AlertTriangle className="h-3 w-3" /> תלוי ב: {j.deps.join(", ")}
                        </div>
                      )}
                    </div>
                  );
                })}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Dependencies ── */}
        <TabsContent value="deps" className="mt-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Link2 className="h-4 w-4 text-primary" /> שרשרת תלויות — ויזואליזציה
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {jobs.filter(j => j.deps.length > 0).map(j => (
                <div key={j.id} className="border rounded-lg p-3 bg-muted/30">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-mono font-bold text-sm">{j.id}</span>
                    <span className="text-xs text-muted-foreground">({j.product})</span>
                    {priBadge(j.priority)}
                  </div>
                  <div className="flex items-center flex-wrap gap-2">
                    {j.deps.map(dep => {
                      const d = jobs.find(x => x.id === dep);
                      return (
                        <div key={dep} className="flex items-center gap-1.5">
                          <div className="border rounded px-2 py-1 bg-slate-800/60 text-xs">
                            <span className="font-mono font-medium">{dep}</span>
                            {d && <span className="text-muted-foreground mr-1">({d.center})</span>}
                            {d && stsBadge(d.status)}
                          </div>
                          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                      );
                    })}
                    <div className="border-2 border-primary/50 rounded px-2 py-1 bg-primary/10 text-xs font-mono font-medium">
                      {j.id} <span className="text-muted-foreground font-normal">({j.center})</span>
                    </div>
                  </div>
                  {j.deps.some(dep => { const d = jobs.find(x => x.id === dep); return d && d.day >= j.day; }) && (
                    <div className="flex items-center gap-1 mt-2 text-xs text-red-400">
                      <ShieldAlert className="h-3 w-3" /> התראה: תלות לא מספיקה - עבודה מקדימה טרם הסתיימה
                    </div>
                  )}
                </div>
              ))}
              <div className="border rounded-lg p-3 bg-muted/20 text-xs text-muted-foreground">
                <p className="font-medium mb-1">סיכום: {jobs.filter(j => j.deps.length > 0).length} עבודות עם תלויות | {jobs.filter(j => j.deps.length === 0).length} עצמאיות | 2 שרשראות קריטיות</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── What-If ── */}
        <TabsContent value="whatif" className="mt-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-primary" /> תרחישי What-If — תכנון תרחישים
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {scenarios.map(sc => (
                <div key={sc.id} onClick={() => setSelectedScenario(selectedScenario === sc.id ? null : sc.id)}
                  className={`border rounded-lg p-3 cursor-pointer transition-all ${selectedScenario === sc.id ? "border-primary bg-primary/5" : "bg-muted/20 hover:bg-muted/40"}`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm">{sc.name}</span>
                      <Badge className={`text-[10px] ${sc.ok ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>{sc.ok ? "ישים" : "לא מומלץ"}</Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">ניצולת: {sc.util}%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{sc.desc}</p>
                  {selectedScenario === sc.id && (
                    <div className="mt-3 pt-2 border-t space-y-2">
                      <div className="flex items-center gap-2 text-xs"><TrendingUp className="h-3.5 w-3.5 text-emerald-400" /><span className="font-medium">השפעה:</span>{sc.impact}</div>
                      <div className="flex items-center gap-2 text-xs"><AlertTriangle className="h-3.5 w-3.5 text-amber-400" /><span className="font-medium">סיכון:</span>{sc.risk}</div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground">ניצולת צפויה:</span>
                        <Progress value={sc.util} className="h-1.5 flex-1 max-w-40" />
                        <span className="text-xs font-mono">{sc.util}%</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
