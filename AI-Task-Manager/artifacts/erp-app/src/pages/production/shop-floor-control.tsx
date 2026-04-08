import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Monitor, Play, Square, Trash2, Clock, Package, ShieldCheck, ArrowRight,
  PauseCircle, CheckCircle2, ScanBarcode, AlertTriangle, Wrench, Activity,
  User, Timer, Zap, Radio, ChevronLeft, ChevronRight,
} from "lucide-react";

/* ── Types ── */
type StationStatus = "running" | "idle" | "setup" | "down" | "break";

interface Station {
  id: number;
  name: string;
  currentJob: string;
  operator: string;
  product: string;
  progress: number;
  elapsed: string;
  status: StationStatus;
  target: number;
  completed: number;
}

interface FeedEvent {
  id: number;
  time: string;
  station: string;
  msg: string;
  type: "info" | "success" | "warning" | "error";
}

/* ── Station mock data ── */
const initialStations: Station[] = [
  { id: 1, name: "מסור 1", currentJob: "WO-4501", operator: "רועי כהן", product: "פרופיל אלומיניום 100mm", progress: 72, elapsed: "02:18:05", status: "running", target: 120, completed: 86 },
  { id: 2, name: "CNC 1", currentJob: "WO-4502", operator: "אמיר לוי", product: "מסגרת ברזל דגם B", progress: 45, elapsed: "01:33:40", status: "running", target: 80, completed: 36 },
  { id: 3, name: "ריתוך 1", currentJob: "WO-4503", operator: "יוסי מזרחי", product: "שלדת פלדה 2.0m", progress: 88, elapsed: "03:45:12", status: "running", target: 50, completed: 44 },
  { id: 4, name: "ריתוך 2", currentJob: "WO-4504", operator: "דני אברהם", product: "מעקה בטיחות", progress: 15, elapsed: "00:28:10", status: "setup", target: 60, completed: 9 },
  { id: 5, name: "שיוף", currentJob: "—", operator: "—", product: "—", progress: 0, elapsed: "00:00:00", status: "idle", target: 0, completed: 0 },
  { id: 6, name: "ציפוי", currentJob: "WO-4506", operator: "מוחמד חסן", product: "פרופיל צבוע RAL7016", progress: 60, elapsed: "01:52:30", status: "running", target: 200, completed: 120 },
  { id: 7, name: "הרכבה 1", currentJob: "WO-4507", operator: "אלי ביטון", product: 'חלון 1.2×1.5m', progress: 33, elapsed: "00:55:20", status: "running", target: 30, completed: 10 },
  { id: 8, name: "הרכבה 2", currentJob: "—", operator: "—", product: "—", progress: 0, elapsed: "01:15:00", status: "down", target: 0, completed: 0 },
];

const initialFeed: FeedEvent[] = [
  { id: 1, time: "14:32", station: "מסור 1", msg: "רועי כהן התחיל עבודה WO-4501", type: "info" },
  { id: 2, time: "14:28", station: "CNC 1", msg: "בדיקת QC עברה בהצלחה — 36 יח׳", type: "success" },
  { id: 3, time: "14:25", station: "ריתוך 1", msg: "דיווח התקדמות: 88% — 44/50 יח׳", type: "info" },
  { id: 4, time: "14:20", station: "ציפוי", msg: "חומר גלם הונפק — 25 ק״ג צבע RAL7016", type: "success" },
  { id: 5, time: "14:15", station: "הרכבה 2", msg: "תקלה מכנית — ממתין לתחזוקה", type: "error" },
  { id: 6, time: "14:10", station: "ריתוך 2", msg: "דני אברהם — הכנת תחנה (Setup)", type: "warning" },
  { id: 7, time: "14:05", station: "הרכבה 1", msg: "בקשת חומר: 30 יח׳ ידיות נירוסטה", type: "info" },
  { id: 8, time: "13:58", station: "מסור 1", msg: "דיווח פסילה: 2 יח׳ — סטייה ממידות", type: "warning" },
  { id: 9, time: "13:50", station: "CNC 1", msg: "העברה לתחנה הבאה — שיוף", type: "info" },
  { id: 10, time: "13:45", station: "ציפוי", msg: "דיווח עיכוב: ייבוש איטי — +30 דקות", type: "warning" },
];

/* ── Status helpers ── */
const statusConfig: Record<StationStatus, { label: string; color: string; bg: string; border: string }> = {
  running: { label: "פעיל", color: "text-green-400", bg: "bg-green-500/15", border: "border-green-500/40" },
  idle:    { label: "ממתין", color: "text-gray-400", bg: "bg-gray-500/10", border: "border-gray-500/30" },
  setup:   { label: "הכנה", color: "text-amber-400", bg: "bg-amber-500/15", border: "border-amber-500/40" },
  down:    { label: "תקלה", color: "text-red-400", bg: "bg-red-500/15", border: "border-red-500/40" },
  break:   { label: "הפסקה", color: "text-blue-400", bg: "bg-blue-500/15", border: "border-blue-500/40" },
};

const feedTypeIcon: Record<string, { icon: typeof Activity; color: string }> = {
  info:    { icon: Activity, color: "text-blue-400" },
  success: { icon: CheckCircle2, color: "text-green-400" },
  warning: { icon: AlertTriangle, color: "text-amber-400" },
  error:   { icon: Zap, color: "text-red-400" },
};

/* ── Action buttons config ── */
const actions = [
  { key: "start",    label: "התחל עבודה",  icon: Play,          color: "bg-green-600 hover:bg-green-700 text-white" },
  { key: "stop",     label: "עצור עבודה",  icon: Square,        color: "bg-red-600 hover:bg-red-700 text-white" },
  { key: "scan",     label: "סרוק הזמנה",  icon: ScanBarcode,   color: "bg-blue-600 hover:bg-blue-700 text-white" },
  { key: "progress", label: "דווח התקדמות", icon: Activity,      color: "bg-indigo-600 hover:bg-indigo-700 text-white" },
  { key: "scrap",    label: "דווח פסילה",  icon: Trash2,        color: "bg-orange-600 hover:bg-orange-700 text-white" },
  { key: "delay",    label: "סיבת עיכוב",  icon: Clock,         color: "bg-amber-600 hover:bg-amber-700 text-white" },
  { key: "material", label: "בקשת חומר",   icon: Package,       color: "bg-cyan-600 hover:bg-cyan-700 text-white" },
  { key: "qc",       label: "בקשת QC",     icon: ShieldCheck,   color: "bg-purple-600 hover:bg-purple-700 text-white" },
  { key: "next",     label: "העבר תחנה",   icon: ArrowRight,    color: "bg-teal-600 hover:bg-teal-700 text-white" },
  { key: "hold",     label: "השהה עבודה",  icon: PauseCircle,   color: "bg-yellow-600 hover:bg-yellow-700 text-white" },
  { key: "complete", label: "סיים עבודה",  icon: CheckCircle2,  color: "bg-emerald-600 hover:bg-emerald-700 text-white" },
];

/* ═══════════════ Component ═══════════════ */
export default function ShopFloorControl() {
  const [stations, setStations] = useState<Station[]>(initialStations);
  const [feed, setFeed] = useState<FeedEvent[]>(initialFeed);
  const [selectedStation, setSelectedStation] = useState<number | null>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);

  const now = new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });

  /* push a new feed event */
  const pushFeed = (stationName: string, msg: string, type: FeedEvent["type"]) => {
    setFeed(prev => [{ id: Date.now(), time: now, station: stationName, msg, type }, ...prev.slice(0, 9)]);
  };

  /* handle action click */
  const handleAction = (key: string) => {
    const st = selectedStation !== null ? stations.find(s => s.id === selectedStation) : null;
    const name = st?.name ?? "—";
    setLastAction(key);

    const actionMessages: Record<string, { msg: string; type: FeedEvent["type"] }> = {
      start:    { msg: `${st?.operator ?? "מפעיל"} התחיל עבודה ב-${name}`, type: "info" },
      stop:     { msg: `עבודה נעצרה ב-${name}`, type: "warning" },
      scan:     { msg: `סריקת הזמנת עבודה ב-${name}`, type: "info" },
      progress: { msg: `דיווח התקדמות: ${st?.progress ?? 0}% ב-${name}`, type: "info" },
      scrap:    { msg: `דיווח פסילה ב-${name}`, type: "warning" },
      delay:    { msg: `דיווח עיכוב ב-${name}`, type: "warning" },
      material: { msg: `בקשת חומר גלם ל-${name}`, type: "info" },
      qc:       { msg: `בקשת בדיקת איכות ב-${name}`, type: "info" },
      next:     { msg: `העברה לתחנה הבאה מ-${name}`, type: "success" },
      hold:     { msg: `עבודה הושהתה ב-${name}`, type: "warning" },
      complete: { msg: `עבודה הושלמה ב-${name}`, type: "success" },
    };

    const entry = actionMessages[key];
    if (entry) pushFeed(name, entry.msg, entry.type);

    /* update station status on certain actions */
    if (st && (key === "start" || key === "stop" || key === "hold" || key === "complete")) {
      setStations(prev => prev.map(s => {
        if (s.id !== st.id) return s;
        if (key === "start") return { ...s, status: "running" as StationStatus };
        if (key === "stop") return { ...s, status: "idle" as StationStatus };
        if (key === "hold") return { ...s, status: "break" as StationStatus };
        if (key === "complete") return { ...s, status: "idle" as StationStatus, progress: 100 };
        return s;
      }));
    }

    setTimeout(() => setLastAction(null), 1200);
  };

  const runningCount = stations.filter(s => s.status === "running").length;
  const downCount = stations.filter(s => s.status === "down").length;
  const avgProgress = Math.round(stations.filter(s => s.status === "running").reduce((a, s) => a + s.progress, 0) / (runningCount || 1));

  return (
    <div className="p-6 space-y-5 bg-gray-950 min-h-screen text-gray-100" dir="rtl">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Monitor className="h-7 w-7 text-green-400" />
            <span className="absolute -top-0.5 -left-0.5 h-2.5 w-2.5 rounded-full bg-green-500 animate-ping" />
            <span className="absolute -top-0.5 -left-0.5 h-2.5 w-2.5 rounded-full bg-green-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">בקרת רצפת ייצור — LIVE</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              טכנו-כל עוזי | {runningCount} תחנות פעילות · {downCount > 0 ? <span className="text-red-400">{downCount} תקלות</span> : "0 תקלות"} · ממוצע התקדמות {avgProgress}%
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Radio className="h-3.5 w-3.5 text-green-400 animate-pulse" />
          <span className="font-mono">{now}</span>
        </div>
      </div>

      {/* ── Summary KPIs bar ── */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "תחנות פעילות", value: `${runningCount}/8`, icon: Zap, color: "text-green-400", bg: "bg-green-500/10" },
          { label: "תקלות", value: String(downCount), icon: AlertTriangle, color: downCount > 0 ? "text-red-400" : "text-green-400", bg: downCount > 0 ? "bg-red-500/10" : "bg-green-500/10" },
          { label: "ממוצע התקדמות", value: `${avgProgress}%`, icon: Activity, color: "text-blue-400", bg: "bg-blue-500/10" },
          { label: "תחנה נבחרת", value: selectedStation !== null ? stations.find(s => s.id === selectedStation)?.name ?? "—" : "לא נבחרה", icon: Monitor, color: "text-purple-400", bg: "bg-purple-500/10" },
        ].map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <Card key={i} className={`${kpi.bg} border border-gray-800`}>
              <CardContent className="py-2 px-3 flex items-center gap-2">
                <Icon className={`h-4 w-4 ${kpi.color}`} />
                <div>
                  <p className="text-[10px] text-gray-500">{kpi.label}</p>
                  <p className={`text-sm font-bold font-mono ${kpi.color}`}>{kpi.value}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── Station Grid ── */}
      <div>
        <h2 className="text-sm font-semibold text-gray-400 mb-2 flex items-center gap-1.5">
          <Wrench className="h-3.5 w-3.5" /> תחנות עבודה
        </h2>
        <div className="grid grid-cols-4 gap-3">
          {stations.map(st => {
            const cfg = statusConfig[st.status];
            const isSelected = selectedStation === st.id;
            return (
              <Card
                key={st.id}
                onClick={() => setSelectedStation(isSelected ? null : st.id)}
                className={`cursor-pointer transition-all border ${cfg.border} ${cfg.bg} ${isSelected ? "ring-2 ring-blue-500 shadow-lg shadow-blue-500/20" : "hover:brightness-110"}`}
              >
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm">{st.name}</span>
                    <Badge className={`text-[10px] px-1.5 py-0 ${cfg.color} border-0 ${cfg.bg}`}>
                      {cfg.label}
                    </Badge>
                  </div>
                  {st.status !== "idle" && st.status !== "down" ? (
                    <>
                      <div className="text-[10px] text-gray-500 space-y-0.5">
                        <p className="flex items-center gap-1"><ScanBarcode className="h-3 w-3" /> {st.currentJob}</p>
                        <p className="flex items-center gap-1"><User className="h-3 w-3" /> {st.operator}</p>
                        <p className="flex items-center gap-1"><Package className="h-3 w-3" /> {st.product}</p>
                      </div>
                      <div>
                        <div className="flex justify-between text-[10px] text-gray-500 mb-0.5">
                          <span>{st.completed}/{st.target} יח׳</span>
                          <span className="font-mono">{st.progress}%</span>
                        </div>
                        <Progress value={st.progress} className="h-1.5 bg-gray-800" />
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-gray-600">
                        <Timer className="h-3 w-3" /> {st.elapsed}
                      </div>
                    </>
                  ) : st.status === "down" ? (
                    <div className="text-xs text-red-400 flex items-center gap-1 py-2">
                      <AlertTriangle className="h-4 w-4" /> תקלה — ממתין לתחזוקה
                    </div>
                  ) : (
                    <div className="text-xs text-gray-600 py-2">אין עבודה פעילה</div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* ── Active Jobs Timeline + Actions + Feed ── */}
      <div className="grid grid-cols-12 gap-4">
        {/* Active Jobs Timeline */}
        <div className="col-span-5">
          <Card className="border-gray-800 bg-gray-900/60">
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm font-semibold text-gray-300 flex items-center gap-1.5">
                <Activity className="h-4 w-4 text-blue-400" /> עבודות פעילות
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3 space-y-2">
              {stations
                .filter(s => s.status === "running" || s.status === "setup")
                .sort((a, b) => b.progress - a.progress)
                .map(st => {
                  const cfg = statusConfig[st.status];
                  return (
                    <div
                      key={st.id}
                      className={`rounded-md border p-2 ${cfg.border} ${cfg.bg} cursor-pointer ${selectedStation === st.id ? "ring-1 ring-blue-500" : ""}`}
                      onClick={() => setSelectedStation(st.id)}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5 text-xs font-medium">
                          <span className={cfg.color}>{st.name}</span>
                          <span className="text-gray-500">·</span>
                          <span className="text-gray-400 font-mono">{st.currentJob}</span>
                        </div>
                        <span className="text-[10px] text-gray-500 font-mono">{st.elapsed}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Progress value={st.progress} className="h-1.5 flex-1 bg-gray-800" />
                        <span className={`text-xs font-mono font-bold ${cfg.color}`}>{st.progress}%</span>
                      </div>
                      <p className="text-[10px] text-gray-600 mt-0.5">{st.product} — {st.operator}</p>
                    </div>
                  );
                })}
              {stations.filter(s => s.status === "running" || s.status === "setup").length === 0 && (
                <p className="text-xs text-gray-600 text-center py-4">אין עבודות פעילות</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Action Toolbar + Feed */}
        <div className="col-span-7 space-y-4">
          {/* Action Buttons */}
          <Card className="border-gray-800 bg-gray-900/60">
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm font-semibold text-gray-300 flex items-center gap-1.5">
                <Wrench className="h-4 w-4 text-amber-400" /> פעולות תחנה
                {selectedStation !== null && (
                  <Badge className="mr-2 text-[10px] bg-blue-500/20 text-blue-400 border-0">
                    {stations.find(s => s.id === selectedStation)?.name}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <div className="flex flex-wrap gap-2">
                {actions.map(act => {
                  const Icon = act.icon;
                  const isActive = lastAction === act.key;
                  return (
                    <button
                      key={act.key}
                      onClick={() => handleAction(act.key)}
                      disabled={selectedStation === null && act.key !== "scan"}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all
                        ${act.color}
                        ${selectedStation === null && act.key !== "scan" ? "opacity-40 cursor-not-allowed" : ""}
                        ${isActive ? "scale-95 ring-2 ring-white/30" : "hover:scale-[1.03]"}
                      `}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {act.label}
                    </button>
                  );
                })}
              </div>
              {selectedStation === null && (
                <p className="text-[10px] text-gray-600 mt-2 flex items-center gap-1">
                  <ChevronRight className="h-3 w-3" /> בחר תחנה מהרשת למעלה כדי להפעיל פעולות
                </p>
              )}
            </CardContent>
          </Card>

          {/* Live Feed */}
          <Card className="border-gray-800 bg-gray-900/60">
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm font-semibold text-gray-300 flex items-center gap-1.5">
                <Radio className="h-4 w-4 text-green-400 animate-pulse" /> פיד חי — אירועי רצפה
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3 space-y-1">
              {feed.map(ev => {
                const { icon: FIcon, color } = feedTypeIcon[ev.type] ?? feedTypeIcon.info;
                return (
                  <div key={ev.id} className="flex items-start gap-2 py-1 border-b border-gray-800/50 last:border-0">
                    <FIcon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${color}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-300 leading-snug">{ev.msg}</p>
                      <p className="text-[10px] text-gray-600">{ev.station} · {ev.time}</p>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
