import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Scissors, ListChecks, Layers, BarChart3, Target, Clock, Search, Download, Plus, Eye, Edit2,
  CheckCircle2, AlertTriangle, ArrowUpDown, Cpu, Timer, TrendingDown, Recycle, LayoutList } from "lucide-react";

type CutStatus = "טיוטה" | "מאושרת" | "בחיתוך" | "הושלמה";
interface CuttingList { id: string; listNumber: string; orderRef: string; profilesCount: number; pieces: number; totalLengthM: number; wastePct: number; status: CutStatus; operator: string; date: string; priority: "רגילה" | "דחופה" | "גבוהה"; }
interface CuttingPattern { id: string; profile: string; barLength: number; pieces: { length: number; qty: number }[]; utilization: number; waste: number; }
interface WasteRecord { profileType: string; dailyWasteKg: number; targetPct: number; actualPct: number; trend: "up" | "down" | "stable"; weekAvg: number; }
interface MachineJob { id: string; machine: string; listRef: string; profile: string; pieces: number; estMinutes: number; status: "בתור" | "פעיל" | "הושלם"; position: number; }

const SC: Record<CutStatus, string> = { "טיוטה": "bg-slate-500/20 text-slate-300 border-slate-500/30", "מאושרת": "bg-blue-500/20 text-blue-300 border-blue-500/30", "בחיתוך": "bg-amber-500/20 text-amber-300 border-amber-500/30", "הושלמה": "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" };
const PC: Record<string, string> = { "רגילה": "bg-gray-500/20 text-gray-300", "דחופה": "bg-red-500/20 text-red-300", "גבוהה": "bg-orange-500/20 text-orange-300" };
const MC: Record<string, string> = { "בתור": "bg-slate-500/20 text-slate-300", "פעיל": "bg-green-500/20 text-green-300", "הושלם": "bg-blue-500/20 text-blue-300" };

const LISTS: CuttingList[] = [
  { id: "CL001", listNumber: "CL-2026-0041", orderRef: "HZ-1087", profilesCount: 8, pieces: 124, totalLengthM: 312.5, wastePct: 3.2, status: "הושלמה", operator: "יוסי כהן", date: "2026-04-08", priority: "רגילה" },
  { id: "CL002", listNumber: "CL-2026-0042", orderRef: "HZ-1088", profilesCount: 5, pieces: 86, totalLengthM: 198.3, wastePct: 4.1, status: "בחיתוך", operator: "אבי לוי", date: "2026-04-08", priority: "דחופה" },
  { id: "CL003", listNumber: "CL-2026-0043", orderRef: "HZ-1089", profilesCount: 12, pieces: 210, totalLengthM: 540.0, wastePct: 2.8, status: "מאושרת", operator: "משה דוד", date: "2026-04-08", priority: "גבוהה" },
  { id: "CL004", listNumber: "CL-2026-0044", orderRef: "HZ-1090", profilesCount: 3, pieces: 42, totalLengthM: 96.7, wastePct: 5.6, status: "טיוטה", operator: "—", date: "2026-04-08", priority: "רגילה" },
  { id: "CL005", listNumber: "CL-2026-0045", orderRef: "HZ-1091", profilesCount: 7, pieces: 98, totalLengthM: 245.1, wastePct: 3.9, status: "בחיתוך", operator: "יוסי כהן", date: "2026-04-08", priority: "רגילה" },
  { id: "CL006", listNumber: "CL-2026-0046", orderRef: "HZ-1092", profilesCount: 9, pieces: 156, totalLengthM: 410.8, wastePct: 2.1, status: "הושלמה", operator: "דני שמש", date: "2026-04-07", priority: "רגילה" },
  { id: "CL007", listNumber: "CL-2026-0047", orderRef: "HZ-1093", profilesCount: 4, pieces: 64, totalLengthM: 152.0, wastePct: 4.8, status: "מאושרת", operator: "אבי לוי", date: "2026-04-07", priority: "דחופה" },
  { id: "CL008", listNumber: "CL-2026-0048", orderRef: "HZ-1094", profilesCount: 6, pieces: 78, totalLengthM: 189.4, wastePct: 3.5, status: "טיוטה", operator: "—", date: "2026-04-07", priority: "רגילה" },
  { id: "CL009", listNumber: "CL-2026-0049", orderRef: "HZ-1095", profilesCount: 11, pieces: 192, totalLengthM: 488.2, wastePct: 1.9, status: "הושלמה", operator: "משה דוד", date: "2026-04-07", priority: "גבוהה" },
  { id: "CL010", listNumber: "CL-2026-0050", orderRef: "HZ-1096", profilesCount: 2, pieces: 36, totalLengthM: 78.5, wastePct: 6.2, status: "בחיתוך", operator: "דני שמש", date: "2026-04-06", priority: "רגילה" },
  { id: "CL011", listNumber: "CL-2026-0051", orderRef: "HZ-1097", profilesCount: 8, pieces: 134, totalLengthM: 346.9, wastePct: 3.7, status: "מאושרת", operator: "יוסי כהן", date: "2026-04-06", priority: "רגילה" },
  { id: "CL012", listNumber: "CL-2026-0052", orderRef: "HZ-1098", profilesCount: 5, pieces: 72, totalLengthM: 167.3, wastePct: 4.4, status: "טיוטה", operator: "—", date: "2026-04-06", priority: "דחופה" },
];

const PATTERNS: CuttingPattern[] = [
  { id: "P1", profile: "4520 - אלומיניום כנף", barLength: 6500, pieces: [{ length: 1850, qty: 3 }, { length: 450, qty: 1 }], utilization: 96.2, waste: 3.8 },
  { id: "P2", profile: "7230 - אלומיניום אדן", barLength: 6500, pieces: [{ length: 2100, qty: 2 }, { length: 1120, qty: 2 }], utilization: 99.1, waste: 0.9 },
  { id: "P3", profile: "3310 - אלומיניום מסגרת", barLength: 6000, pieces: [{ length: 1500, qty: 4 }], utilization: 100.0, waste: 0.0 },
  { id: "P4", profile: "5560 - אלומיניום חלון הזזה", barLength: 6500, pieces: [{ length: 1200, qty: 5 }, { length: 200, qty: 1 }], utilization: 95.4, waste: 4.6 },
  { id: "P5", profile: "1180 - אלומיניום דלת כניסה", barLength: 6000, pieces: [{ length: 2200, qty: 2 }, { length: 800, qty: 1 }], utilization: 86.7, waste: 13.3 },
  { id: "P6", profile: "9940 - אלומיניום תריס", barLength: 6500, pieces: [{ length: 1600, qty: 4 }], utilization: 98.5, waste: 1.5 },
];

const WASTE: WasteRecord[] = [
  { profileType: "אלומיניום כנף", dailyWasteKg: 4.2, targetPct: 5.0, actualPct: 3.8, trend: "down", weekAvg: 4.1 },
  { profileType: "אלומיניום אדן", dailyWasteKg: 1.1, targetPct: 5.0, actualPct: 0.9, trend: "stable", weekAvg: 1.2 },
  { profileType: "אלומיניום מסגרת", dailyWasteKg: 0.0, targetPct: 5.0, actualPct: 0.0, trend: "down", weekAvg: 0.8 },
  { profileType: "אלומיניום חלון הזזה", dailyWasteKg: 5.8, targetPct: 5.0, actualPct: 4.6, trend: "up", weekAvg: 3.9 },
  { profileType: "אלומיניום דלת כניסה", dailyWasteKg: 12.4, targetPct: 5.0, actualPct: 13.3, trend: "up", weekAvg: 8.7 },
  { profileType: "אלומיניום תריס", dailyWasteKg: 1.8, targetPct: 5.0, actualPct: 1.5, trend: "down", weekAvg: 2.0 },
];

const QUEUE: MachineJob[] = [
  { id: "MQ1", machine: "מסור CNC ראשי #1", listRef: "CL-2026-0042", profile: "4520 - אלומיניום כנף", pieces: 32, estMinutes: 45, status: "פעיל", position: 1 },
  { id: "MQ2", machine: "מסור CNC ראשי #1", listRef: "CL-2026-0042", profile: "7230 - אלומיניום אדן", pieces: 24, estMinutes: 30, status: "בתור", position: 2 },
  { id: "MQ3", machine: "מסור CNC ראשי #1", listRef: "CL-2026-0045", profile: "3310 - אלומיניום מסגרת", pieces: 48, estMinutes: 55, status: "בתור", position: 3 },
  { id: "MQ4", machine: "מסור CNC משני #2", listRef: "CL-2026-0045", profile: "5560 - חלון הזזה", pieces: 50, estMinutes: 60, status: "פעיל", position: 1 },
  { id: "MQ5", machine: "מסור CNC משני #2", listRef: "CL-2026-0050", profile: "1180 - דלת כניסה", pieces: 18, estMinutes: 25, status: "בתור", position: 2 },
  { id: "MQ6", machine: "מסור CNC משני #2", listRef: "CL-2026-0050", profile: "9940 - אלומיניום תריס", pieces: 18, estMinutes: 20, status: "בתור", position: 3 },
  { id: "MQ7", machine: "מסור זוויות #3", listRef: "CL-2026-0043", profile: "4520 - אלומיניום כנף", pieces: 64, estMinutes: 75, status: "פעיל", position: 1 },
  { id: "MQ8", machine: "מסור זוויות #3", listRef: "CL-2026-0043", profile: "7230 - אלומיניום אדן", pieces: 40, estMinutes: 48, status: "בתור", position: 2 },
];

const SUGGESTIONS = [
  { color: "emerald", icon: CheckCircle2, title: "שילוב הזמנות HZ-1088 ו-HZ-1096", desc: "שילוב חלקים מ-2 הזמנות יקטין פחת ב-1180 דלת כניסה מ-13.3% ל-4.2%", badge: "חיסכון משוער: 8.2 ק״ג" },
  { color: "blue", icon: CheckCircle2, title: "שינוי אורך מוט ל-7000 מ״מ בפרופיל 5560", desc: "מעבר למוט 7 מטר יאפשר 5 חלקים + שארית שמישה במקום פחת", badge: "שיפור ניצולת: +3.1%" },
  { color: "amber", icon: AlertTriangle, title: "התראה: פרופיל 1180 מעל יעד פחת", desc: "פחת ממוצע 13.3% - נדרש שינוי תבנית חיתוך או הזמנת מוטות באורך מותאם", badge: "חריגה: +8.3% מעל יעד" },
  { color: "violet", icon: CheckCircle2, title: "ניצול שאריות ממלאי", desc: "12 שאריות בגודל 800-1200 מ״מ במלאי - ניתן לנצל עבור חלקים קטנים ברשימה CL-2026-0044", badge: "שאריות זמינות: 12 יח׳" },
  { color: "cyan", icon: CheckCircle2, title: "הזמנת מוטות באורך 6200 מ״מ", desc: "ניתוח 30 יום אחורה מראה שמוט 6200 מ״מ ייתן ניצולת טובה יותר לפרופיל 4520", badge: "חיסכון שנתי: ~₪18,400" },
];

export default function FabCuttingLists() {
  const [activeTab, setActiveTab] = useState("lists");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<CutStatus | "all">("all");

  const activeLists = LISTS.filter(l => l.status === "בחיתוך" || l.status === "מאושרת").length;
  const profilesToday = LISTS.filter(l => l.date === "2026-04-08").reduce((s, l) => s + l.profilesCount, 0);
  const piecesCut = LISTS.filter(l => l.status === "הושלמה").reduce((s, l) => s + l.pieces, 0);
  const avgWaste = +(LISTS.reduce((s, l) => s + l.wastePct, 0) / LISTS.length).toFixed(1);
  const optScore = Math.round(PATTERNS.reduce((s, p) => s + p.utilization, 0) / PATTERNS.length);
  const pendingLists = LISTS.filter(l => l.status === "טיוטה").length;

  const filtered = useMemo(() => LISTS.filter(l => {
    if (statusFilter !== "all" && l.status !== statusFilter) return false;
    if (search) { const q = search.toLowerCase(); return l.listNumber.toLowerCase().includes(q) || l.orderRef.toLowerCase().includes(q) || l.operator.includes(q); }
    return true;
  }), [search, statusFilter]);

  const kpis = [
    { label: "רשימות פעילות", value: activeLists, icon: ListChecks, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
    { label: "פרופילים היום", value: profilesToday, icon: Layers, color: "text-cyan-400", bg: "bg-cyan-500/10 border-cyan-500/20" },
    { label: "חלקים שנחתכו", value: piecesCut.toLocaleString(), icon: Scissors, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
    { label: "פחת % (יעד <5%)", value: `${avgWaste}%`, icon: TrendingDown, color: avgWaste <= 5 ? "text-green-400" : "text-red-400", bg: avgWaste <= 5 ? "bg-green-500/10 border-green-500/20" : "bg-red-500/10 border-red-500/20" },
    { label: "ציון אופטימיזציה", value: `${optScore}%`, icon: Target, color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20" },
    { label: "רשימות ממתינות", value: pendingLists, icon: Clock, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
  ];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Scissors className="w-7 h-7 text-blue-400" />רשימות חיתוך - טכנו-כל עוזי
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול רשימות חיתוך פרופילי אלומיניום, אופטימיזציה ומעקב פחת</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5"><Download className="w-4 h-4" />יצוא לאקסל</Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 gap-1.5"><Plus className="w-4 h-4" />רשימה חדשה</Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map(k => (
          <Card key={k.label} className={`${k.bg} border`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <k.icon className={`w-5 h-5 ${k.color}`} />
                <span className="text-xs text-muted-foreground">{k.label}</span>
              </div>
              <div className={`text-2xl font-bold ${k.color}`}>{k.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-card/60 border border-border/50">
          <TabsTrigger value="lists" className="gap-1.5"><LayoutList className="w-4 h-4" />רשימות חיתוך</TabsTrigger>
          <TabsTrigger value="optimization" className="gap-1.5"><BarChart3 className="w-4 h-4" />אופטימיזציה</TabsTrigger>
          <TabsTrigger value="waste" className="gap-1.5"><Recycle className="w-4 h-4" />מעקב פחת</TabsTrigger>
          <TabsTrigger value="queue" className="gap-1.5"><Cpu className="w-4 h-4" />תור מכונות</TabsTrigger>
        </TabsList>

        {/* TAB 1: Cutting Lists */}
        <TabsContent value="lists">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="חיפוש לפי מספר רשימה, הזמנה או מפעיל..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 bg-background/50" />
                </div>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as CutStatus | "all")} className="bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
                  <option value="all">כל הסטטוסים</option>
                  <option value="טיוטה">טיוטה</option><option value="מאושרת">מאושרת</option>
                  <option value="בחיתוך">בחיתוך</option><option value="הושלמה">הושלמה</option>
                </select>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 bg-muted/30">
                      {["מס׳ רשימה","הזמנה","פרופילים","חלקים","אורך כולל (מ׳)","פחת %","סטטוס","עדיפות","מפעיל","פעולות"].map(h => (
                        <th key={h} className={`p-3 font-medium text-muted-foreground ${h === "מס׳ רשימה" || h === "הזמנה" || h === "מפעיל" ? "text-right" : "text-center"}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(l => (
                      <tr key={l.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                        <td className="p-3 font-mono text-blue-400 font-medium">{l.listNumber}</td>
                        <td className="p-3 text-foreground">{l.orderRef}</td>
                        <td className="p-3 text-center">{l.profilesCount}</td>
                        <td className="p-3 text-center font-medium">{l.pieces}</td>
                        <td className="p-3 text-center">{l.totalLengthM.toFixed(1)}</td>
                        <td className="p-3 text-center"><span className={`font-medium ${l.wastePct <= 5 ? "text-green-400" : "text-red-400"}`}>{l.wastePct}%</span></td>
                        <td className="p-3 text-center"><Badge className={SC[l.status]}>{l.status}</Badge></td>
                        <td className="p-3 text-center"><Badge className={PC[l.priority]}>{l.priority}</Badge></td>
                        <td className="p-3 text-foreground">{l.operator}</td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><Eye className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><Edit2 className="w-3.5 h-3.5" /></Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="p-3 text-sm text-muted-foreground border-t border-border/30">מציג {filtered.length} מתוך {LISTS.length} רשימות</div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: Optimization */}
        <TabsContent value="optimization">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="bg-card/50 border-border/50">
              <CardHeader><CardTitle className="text-lg flex items-center gap-2"><ArrowUpDown className="w-5 h-5 text-violet-400" />תבניות חיתוך - ניצולת חומר</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {PATTERNS.map(p => (
                  <div key={p.id} className="p-3 rounded-lg bg-muted/20 border border-border/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">{p.profile}</span>
                      <span className={`text-sm font-bold ${p.utilization >= 95 ? "text-green-400" : p.utilization >= 85 ? "text-amber-400" : "text-red-400"}`}>{p.utilization}%</span>
                    </div>
                    <Progress value={p.utilization} className="h-2.5" />
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>מוט: {p.barLength} מ״מ</span>
                      <div className="flex gap-2">
                        {p.pieces.map((pc, i) => <span key={i} className="bg-blue-500/10 text-blue-300 px-1.5 py-0.5 rounded">{pc.length} מ״מ x{pc.qty}</span>)}
                      </div>
                      <span className={p.waste <= 3 ? "text-green-400" : "text-amber-400"}>פחת: {p.waste}%</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-border/50">
              <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Target className="w-5 h-5 text-emerald-400" />המלצות להפחתת פחת</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {SUGGESTIONS.map((s, i) => (
                  <div key={i} className={`p-3 rounded-lg bg-${s.color}-500/10 border border-${s.color}-500/20`}>
                    <div className="flex items-start gap-2">
                      <s.icon className={`w-5 h-5 text-${s.color}-400 mt-0.5 shrink-0`} />
                      <div>
                        <p className={`text-sm font-medium text-${s.color}-300`}>{s.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">{s.desc}</p>
                        <Badge className={`mt-2 bg-${s.color}-500/20 text-${s.color}-300`}>{s.badge}</Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB 3: Waste Tracking */}
        <TabsContent value="waste">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2 bg-card/50 border-border/50">
              <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Recycle className="w-5 h-5 text-amber-400" />פחת יומי לפי סוג פרופיל</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {WASTE.map(r => (
                  <div key={r.profileType} className="p-3 rounded-lg bg-muted/20 border border-border/30">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-foreground">{r.profileType}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground">ממוצע שבועי: {r.weekAvg}%</span>
                        <span className={`text-sm font-bold ${r.actualPct <= r.targetPct ? "text-green-400" : "text-red-400"}`}>{r.actualPct}%</span>
                        {r.trend === "down" && <TrendingDown className="w-4 h-4 text-green-400" />}
                        {r.trend === "up" && <TrendingDown className="w-4 h-4 text-red-400 rotate-180" />}
                        {r.trend === "stable" && <span className="text-muted-foreground text-xs">—</span>}
                      </div>
                    </div>
                    <div className="relative">
                      <Progress value={Math.min(r.actualPct * (100 / 15), 100)} className="h-3" />
                      <div className="absolute top-0 h-3 border-r-2 border-dashed border-yellow-400" style={{ right: `${100 - r.targetPct * (100 / 15)}%` }} />
                    </div>
                    <div className="flex items-center justify-between mt-1.5 text-xs text-muted-foreground">
                      <span>פחת יומי: {r.dailyWasteKg} ק״ג</span><span>יעד: {r.targetPct}%</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
            <div className="space-y-4">
              <Card className="bg-card/50 border-border/50">
                <CardHeader><CardTitle className="text-lg flex items-center gap-2"><BarChart3 className="w-5 h-5 text-blue-400" />סיכום פחת יומי</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-center p-4 rounded-lg bg-muted/20 border border-border/30">
                    <div className="text-3xl font-bold text-foreground">{WASTE.reduce((s, r) => s + r.dailyWasteKg, 0).toFixed(1)}</div>
                    <p className="text-xs text-muted-foreground mt-1">ק״ג פחת כולל היום</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="text-center p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                      <div className="text-xl font-bold text-green-400">{WASTE.filter(r => r.actualPct <= r.targetPct).length}</div>
                      <p className="text-xs text-muted-foreground mt-1">ביעד</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                      <div className="text-xl font-bold text-red-400">{WASTE.filter(r => r.actualPct > r.targetPct).length}</div>
                      <p className="text-xs text-muted-foreground mt-1">חריגה</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-card/50 border-border/50">
                <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Target className="w-5 h-5 text-violet-400" />יעדים חודשיים</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">פחת ממוצע</span><span className="font-medium text-foreground">{avgWaste}%</span></div>
                  <Progress value={avgWaste * 20} className="h-2" />
                  <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">יעד חודשי</span><span className="font-medium text-green-400">{"< 5.0%"}</span></div>
                  <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">חיסכון מצטבר החודש</span><span className="font-medium text-emerald-400">₪12,840</span></div>
                  <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">שיפור מחודש קודם</span><span className="font-medium text-green-400">-0.8%</span></div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* TAB 4: Machine Queue */}
        <TabsContent value="queue" className="space-y-4">
          {["מסור CNC ראשי #1", "מסור CNC משני #2", "מסור זוויות #3"].map(machine => {
            const jobs = QUEUE.filter(j => j.machine === machine);
            const activeJob = jobs.find(j => j.status === "פעיל");
            const totalMin = jobs.reduce((s, j) => s + j.estMinutes, 0);
            return (
              <Card key={machine} className="bg-card/50 border-border/50">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2"><Cpu className="w-5 h-5 text-blue-400" />{machine}</CardTitle>
                    <div className="flex items-center gap-3">
                      <Badge className="bg-green-500/20 text-green-300 border-green-500/30">{activeJob ? "פעיל" : "ממתין"}</Badge>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground"><Timer className="w-4 h-4" />{totalMin} דק׳ סה״כ</div>
                    </div>
                  </div>
                  {activeJob && (
                    <div className="mt-2">
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1"><span>התקדמות עבודה נוכחית</span><span>60%</span></div>
                      <Progress value={60} className="h-2" />
                    </div>
                  )}
                </CardHeader>
                <CardContent className="p-0">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50 bg-muted/20">
                        {["#","רשימה","פרופיל","חלקים","זמן משוער","סטטוס"].map(h => (
                          <th key={h} className={`p-2.5 font-medium text-muted-foreground ${h === "רשימה" || h === "פרופיל" ? "text-right" : "text-center"} ${h === "#" ? "w-16" : ""}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {jobs.map(j => (
                        <tr key={j.id} className="border-b border-border/20 hover:bg-muted/10 transition-colors">
                          <td className="p-2.5 text-center text-muted-foreground font-mono">{j.position}</td>
                          <td className="p-2.5 font-mono text-blue-400">{j.listRef}</td>
                          <td className="p-2.5 text-foreground">{j.profile}</td>
                          <td className="p-2.5 text-center font-medium">{j.pieces}</td>
                          <td className="p-2.5 text-center">{j.estMinutes} דק׳</td>
                          <td className="p-2.5 text-center"><Badge className={MC[j.status]}>{j.status}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>
      </Tabs>
    </div>
  );
}
