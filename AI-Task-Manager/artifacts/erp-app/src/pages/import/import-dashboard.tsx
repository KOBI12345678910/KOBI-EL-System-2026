import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import {
  Globe, Ship, Anchor, Plane, Truck, Package, FileWarning, AlertTriangle,
  DollarSign, Clock, ShieldAlert, FileText, MapPin, TrendingUp,
  CalendarClock, Container, CircleDot, CheckCircle2, XCircle
} from "lucide-react";

// ── KPI data ──────────────────────────────────────────────────────────
const kpis = [
  { label: "הזמנות יבוא פתוחות", value: "8", icon: Package, color: "text-blue-400", bg: "bg-blue-500/10" },
  { label: "משלוחים פעילים", value: "5", icon: Ship, color: "text-cyan-400", bg: "bg-cyan-500/10" },
  { label: "מכולות בדרך", value: "3", icon: Container, color: "text-indigo-400", bg: "bg-indigo-500/10" },
  { label: "משלוחים מעוכבים", value: "2", icon: Clock, color: "text-red-400", bg: "bg-red-500/10" },
  { label: "ממתין למכס", value: "1", icon: ShieldAlert, color: "text-amber-400", bg: "bg-amber-500/10" },
  { label: "שווי יבוא כולל", value: "$485K", icon: DollarSign, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { label: "Landed Cost צפוי", value: "₪2.1M", icon: TrendingUp, color: "text-purple-400", bg: "bg-purple-500/10" },
  { label: "תשלומי מכס לתשלום", value: "₪180K", icon: DollarSign, color: "text-orange-400", bg: "bg-orange-500/10" },
  { label: "מסמכים חסרים", value: "4", icon: FileWarning, color: "text-rose-400", bg: "bg-rose-500/10" },
  { label: "חריגות יבוא", value: "2", icon: AlertTriangle, color: "text-yellow-400", bg: "bg-yellow-500/10" },
  { label: "מדינות ספקים", value: "6", icon: Globe, color: "text-teal-400", bg: "bg-teal-500/10", sub: "טורקיה, סין, גרמניה, איטליה, בלגיה, ספרד" },
  { label: "הגעות קרובות", value: "3", icon: CalendarClock, color: "text-sky-400", bg: "bg-sky-500/10" },
];

// ── Active shipments table data ───────────────────────────────────────
const shipments = [
  {
    id: "SHP-401", supplier: "Zhongshan Glass Ltd.", country: "סין", flag: "\u{1F1E8}\u{1F1F3}",
    mode: "sea" as const, eta: "2026-04-18", status: "in_transit" as const,
    containers: 2, value: 128000, progress: 68,
  },
  {
    id: "SHP-402", supplier: "Schüco International KG", country: "גרמניה", flag: "\u{1F1E9}\u{1F1EA}",
    mode: "air" as const, eta: "2026-04-11", status: "customs" as const,
    containers: 0, value: 94000, progress: 90,
  },
  {
    id: "SHP-403", supplier: "Alumil S.A.", country: "טורקיה", flag: "\u{1F1F9}\u{1F1F7}",
    mode: "sea" as const, eta: "2026-04-22", status: "in_transit" as const,
    containers: 1, value: 76000, progress: 45,
  },
  {
    id: "SHP-404", supplier: "Vitrum SpA", country: "איטליה", flag: "\u{1F1EE}\u{1F1F9}",
    mode: "land" as const, eta: "2026-04-14", status: "delayed" as const,
    containers: 1, value: 52000, progress: 55,
  },
  {
    id: "SHP-405", supplier: "AGC Glass Europe", country: "בלגיה", flag: "\u{1F1E7}\u{1F1EA}",
    mode: "sea" as const, eta: "2026-04-27", status: "in_transit" as const,
    containers: 2, value: 135000, progress: 30,
  },
];

// ── Alerts ────────────────────────────────────────────────────────────
const alerts = [
  { severity: "critical", text: "SHP-404 — עיכוב 5 ימים בנמל ג'נובה, צפי הגעה חדש 19/04", time: "לפני 2 שעות" },
  { severity: "critical", text: "מכס — מסמך EUR.1 חסר למשלוח SHP-401, שחרור מעוכב", time: "לפני 4 שעות" },
  { severity: "high", text: "תשלום מכס ₪82K למשלוח SHP-402 — דד-ליין מחר 09/04", time: "היום" },
  { severity: "high", text: "ספק Zhongshan — תעודת בדיקה (Mill Test) טרם התקבלה ל-SHP-401", time: "היום" },
  { severity: "medium", text: "שער USD/ILS עלה 1.8% השבוע — עלות Landed Cost עודכנה ב-₪12K", time: "אתמול" },
];

// ── Helper functions ──────────────────────────────────────────────────
const modeIcon = (m: string) => {
  if (m === "sea") return <Ship className="h-4 w-4 text-cyan-400" />;
  if (m === "air") return <Plane className="h-4 w-4 text-sky-400" />;
  return <Truck className="h-4 w-4 text-amber-400" />;
};
const modeLabel = (m: string) => {
  if (m === "sea") return "ימי";
  if (m === "air") return "אווירי";
  return "יבשתי";
};

const statusConfig: Record<string, { label: string; cls: string }> = {
  in_transit: { label: "בדרך", cls: "bg-blue-500/20 text-blue-400" },
  customs: { label: "במכס", cls: "bg-amber-500/20 text-amber-400" },
  delayed: { label: "מעוכב", cls: "bg-red-500/20 text-red-400" },
  arrived: { label: "הגיע", cls: "bg-emerald-500/20 text-emerald-400" },
  ordered: { label: "הוזמן", cls: "bg-slate-500/20 text-slate-400" },
};

const sevCfg: Record<string, { label: string; badge: string; border: string }> = {
  critical: { label: "קריטי", badge: "bg-red-500/20 text-red-400", border: "border-r-4 border-r-red-500" },
  high: { label: "גבוה", badge: "bg-orange-500/20 text-orange-400", border: "border-r-4 border-r-orange-500" },
  medium: { label: "בינוני", badge: "bg-amber-500/20 text-amber-400", border: "border-r-4 border-r-amber-500" },
};

// ── Country breakdown mini data ───────────────────────────────────────
const countries = [
  { name: "טורקיה", flag: "\u{1F1F9}\u{1F1F7}", orders: 3, value: "$142K", pct: 29 },
  { name: "סין", flag: "\u{1F1E8}\u{1F1F3}", orders: 2, value: "$128K", pct: 26 },
  { name: "גרמניה", flag: "\u{1F1E9}\u{1F1EA}", orders: 1, value: "$94K", pct: 19 },
  { name: "איטליה", flag: "\u{1F1EE}\u{1F1F9}", orders: 1, value: "$52K", pct: 11 },
  { name: "בלגיה", flag: "\u{1F1E7}\u{1F1EA}", orders: 1, value: "$48K", pct: 10 },
  { name: "ספרד", flag: "\u{1F1EA}\u{1F1F8}", orders: 0, value: "$21K", pct: 5 },
];

// ══════════════════════════════════════════════════════════════════════
export default function ImportDashboard() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 p-6 space-y-6" dir="rtl">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Globe className="w-7 h-7 text-cyan-400" />
            לוח בקרה — מחלקת יבוא
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            טכנו-כל עוזי — ניהול משלוחים, מכס, עלויות ומסמכים בזמן אמת
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-cyan-500/20 text-cyan-400 text-xs">אפריל 2026</Badge>
          <Badge className="bg-green-500/20 text-green-400 text-xs animate-pulse">LIVE</Badge>
        </div>
      </div>

      {/* ── KPI Grid 4x3 ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <Card key={k.label} className="bg-slate-800/50 border-slate-700 hover:border-slate-600 transition-colors">
              <CardContent className="p-4 flex items-start gap-3">
                <div className={`rounded-lg p-2 ${k.bg}`}>
                  <Icon className={`h-5 w-5 ${k.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-400 truncate">{k.label}</p>
                  <p className={`text-xl font-bold ${k.color}`}>{k.value}</p>
                  {k.sub && <p className="text-[10px] text-slate-500 mt-0.5 truncate">{k.sub}</p>}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── Active Shipments Table ─────────────────────────────────── */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-white flex items-center gap-2 text-lg">
            <Ship className="h-5 w-5 text-cyan-400" />
            משלוחים פעילים
            <Badge className="bg-cyan-500/20 text-cyan-400 text-xs mr-auto">{shipments.length} משלוחים</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-700 hover:bg-transparent">
                <TableHead className="text-right text-slate-400">מספר משלוח</TableHead>
                <TableHead className="text-right text-slate-400">ספק</TableHead>
                <TableHead className="text-right text-slate-400">ארץ מקור</TableHead>
                <TableHead className="text-right text-slate-400">אמצעי</TableHead>
                <TableHead className="text-right text-slate-400">ETA</TableHead>
                <TableHead className="text-right text-slate-400">סטטוס</TableHead>
                <TableHead className="text-right text-slate-400">מכולות</TableHead>
                <TableHead className="text-right text-slate-400">שווי ($)</TableHead>
                <TableHead className="text-right text-slate-400 w-[120px]">התקדמות</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shipments.map((s) => (
                <TableRow key={s.id} className="border-slate-700/50 hover:bg-slate-700/30 cursor-pointer">
                  <TableCell className="font-mono font-semibold text-cyan-300">{s.id}</TableCell>
                  <TableCell className="text-slate-200">{s.supplier}</TableCell>
                  <TableCell className="text-slate-200">
                    <span className="ml-1">{s.flag}</span>{s.country}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      {modeIcon(s.mode)}
                      <span className="text-slate-300 text-sm">{modeLabel(s.mode)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-slate-200 font-medium">{s.eta}</TableCell>
                  <TableCell>
                    <Badge className={statusConfig[s.status]?.cls ?? ""}>
                      {statusConfig[s.status]?.label ?? s.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-slate-300 text-center">
                    {s.containers > 0 ? s.containers : "—"}
                  </TableCell>
                  <TableCell className="text-emerald-400 font-semibold">
                    ${s.value.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress value={s.progress} className="h-2 flex-1 bg-slate-700 [&>div]:bg-cyan-500" />
                      <span className="text-xs text-slate-400 w-8 text-left">{s.progress}%</span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Bottom row: Alerts + Countries ─────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Alerts card — 3 cols */}
        <Card className="lg:col-span-3 bg-slate-800/50 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-white flex items-center gap-2 text-lg">
              <AlertTriangle className="h-5 w-5 text-red-400" />
              התראות יבוא קריטיות
              <Badge className="bg-red-500/20 text-red-400 text-xs mr-auto">{alerts.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {alerts.map((a, i) => {
              const cfg = sevCfg[a.severity] ?? sevCfg.medium;
              return (
                <div
                  key={i}
                  className={`rounded-lg p-3 bg-slate-700/30 ${cfg.border} flex items-start gap-3`}
                >
                  {a.severity === "critical" ? (
                    <XCircle className="h-5 w-5 text-red-400 mt-0.5 shrink-0" />
                  ) : a.severity === "high" ? (
                    <AlertTriangle className="h-5 w-5 text-orange-400 mt-0.5 shrink-0" />
                  ) : (
                    <CircleDot className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200">{a.text}</p>
                    <p className="text-xs text-slate-500 mt-1">{a.time}</p>
                  </div>
                  <Badge className={`${cfg.badge} shrink-0`}>{cfg.label}</Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Countries breakdown — 2 cols */}
        <Card className="lg:col-span-2 bg-slate-800/50 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-white flex items-center gap-2 text-lg">
              <MapPin className="h-5 w-5 text-teal-400" />
              פילוח לפי מדינות
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {countries.map((c) => (
              <div key={c.name} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-200 flex items-center gap-1.5">
                    <span>{c.flag}</span>
                    {c.name}
                    <span className="text-slate-500 text-xs">({c.orders} הזמנות)</span>
                  </span>
                  <span className="text-emerald-400 font-semibold">{c.value}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Progress value={c.pct} className="h-1.5 flex-1 bg-slate-700 [&>div]:bg-teal-500" />
                  <span className="text-xs text-slate-500 w-8 text-left">{c.pct}%</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* ── Documents & Costs summary row ──────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="rounded-lg p-2 bg-rose-500/10">
                <FileText className="h-5 w-5 text-rose-400" />
              </div>
              <div>
                <p className="text-sm text-slate-400">מסמכים חסרים</p>
                <p className="text-lg font-bold text-rose-400">4 מסמכים</p>
              </div>
            </div>
            <div className="space-y-1.5 text-xs text-slate-300">
              <div className="flex justify-between"><span>EUR.1 — SHP-401</span><Badge className="bg-red-500/20 text-red-400 text-[10px]">דחוף</Badge></div>
              <div className="flex justify-between"><span>תעודת בדיקה — SHP-401</span><Badge className="bg-orange-500/20 text-orange-400 text-[10px]">ממתין</Badge></div>
              <div className="flex justify-between"><span>B/L מקורי — SHP-403</span><Badge className="bg-amber-500/20 text-amber-400 text-[10px]">בטיפול</Badge></div>
              <div className="flex justify-between"><span>Packing List — SHP-405</span><Badge className="bg-slate-500/20 text-slate-400 text-[10px]">צפוי</Badge></div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="rounded-lg p-2 bg-orange-500/10">
                <DollarSign className="h-5 w-5 text-orange-400" />
              </div>
              <div>
                <p className="text-sm text-slate-400">תשלומי מכס צפויים</p>
                <p className="text-lg font-bold text-orange-400">₪180,000</p>
              </div>
            </div>
            <div className="space-y-1.5 text-xs text-slate-300">
              <div className="flex justify-between"><span>SHP-402 — מכס + מע״מ</span><span className="text-orange-400 font-semibold">₪82,000</span></div>
              <div className="flex justify-between"><span>SHP-401 — אגרות נמל</span><span className="text-orange-400 font-semibold">₪34,000</span></div>
              <div className="flex justify-between"><span>SHP-403 — מכס משוער</span><span className="text-orange-400 font-semibold">₪41,000</span></div>
              <div className="flex justify-between"><span>SHP-405 — הערכה ראשונית</span><span className="text-orange-400 font-semibold">₪23,000</span></div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="rounded-lg p-2 bg-sky-500/10">
                <CalendarClock className="h-5 w-5 text-sky-400" />
              </div>
              <div>
                <p className="text-sm text-slate-400">הגעות קרובות</p>
                <p className="text-lg font-bold text-sky-400">3 משלוחים</p>
              </div>
            </div>
            <div className="space-y-1.5 text-xs text-slate-300">
              <div className="flex justify-between items-center">
                <span>SHP-402 — Schüco</span>
                <div className="flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-amber-400" />
                  <span className="text-slate-400">11/04</span>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span>SHP-404 — Vitrum</span>
                <div className="flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 text-red-400" />
                  <span className="text-slate-400">14/04 (מעוכב)</span>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span>SHP-401 — Zhongshan</span>
                <div className="flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                  <span className="text-slate-400">18/04</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
