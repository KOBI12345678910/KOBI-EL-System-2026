import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  FileText, Layers, Target, TrendingUp, ArrowDown, ShieldCheck,
  CheckCircle2, Clock, AlertTriangle, Package, Truck, Wrench,
  DollarSign, BarChart3, User, Calendar, Building2, Ruler,
  Weight, MapPin, Paintbrush, Zap, Star, Globe, Factory,
} from "lucide-react";

/* ── Helpers ───────────────────────────────────────────────────── */
const shekel = (v: number) =>
  "₪" + v.toLocaleString("he-IL", { maximumFractionDigits: 0 });
const pct = (v: number) => v.toFixed(1) + "%";

/* ── Request Master Data ──────────────────────────────────────── */
const request = {
  pricing_request_number: "PR-3041",
  project: "חזית אלומיניום קורטן — מגדל אופק ת״א",
  customer: "אורבן נדל״ן בע״מ",
  quote: "QT-8820",
  version: 4,
  status: "review",
  project_type: "חזית מבנה",
  system_type: "חזית",
  area_m2: 1280,
  length_m: 340,
  weight_kg: 7680,
  installation_required: true,
  finishing: "אנודייז ברונזה + אבקתי RAL 7016",
  urgency: "high",
  target_margin: 34,
  min_margin: 22,
  strategic_customer: true,
  sourcing_strategy: "60% יבוא / 40% מקומי",
  estimated_total_cost: 892000,
  min_sale_price: 1089640,
  target_sale_price: 1351520,
  recommended_sale_price: 1420000,
  gross_profit: 528000,
  margin_percent: 37.2,
};

const statusMap: Record<string, { label: string; cls: string }> = {
  draft:       { label: "טיוטה",       cls: "bg-slate-600/40 text-slate-300" },
  calculating: { label: "בחישוב",      cls: "bg-blue-500/20 text-blue-400" },
  review:      { label: "בבדיקה",      cls: "bg-yellow-500/20 text-yellow-400" },
  approved:    { label: "מאושר",       cls: "bg-green-500/20 text-green-400" },
  sent:        { label: "נשלח ללקוח",  cls: "bg-purple-500/20 text-purple-400" },
};

const urgencyMap: Record<string, { label: string; cls: string }> = {
  low:    { label: "רגיל",   cls: "bg-slate-600/40 text-slate-300" },
  medium: { label: "בינוני", cls: "bg-yellow-500/20 text-yellow-400" },
  high:   { label: "גבוה",  cls: "bg-orange-500/20 text-orange-400" },
  urgent: { label: "דחוף",  cls: "bg-red-500/20 text-red-400" },
};

/* ── 19 Cost Categories ───────────────────────────────────────── */
const costLines = [
  { category: "אלומיניום פרופילים",      amount: 184600, pctOfTotal: 20.7, color: "bg-blue-500" },
  { category: "זכוכית מחוסמת",            amount: 132400, pctOfTotal: 14.8, color: "bg-cyan-500" },
  { category: "חומרי איטום סיליקון",       amount: 28900,  pctOfTotal: 3.2,  color: "bg-teal-500" },
  { category: "חומרי מילוי אש EI60",      amount: 42100,  pctOfTotal: 4.7,  color: "bg-red-400" },
  { category: "ברגים ופרזול נירוסטה",       amount: 18700,  pctOfTotal: 2.1,  color: "bg-slate-400" },
  { category: "צבע אבקתי / אנודייז",      amount: 38500,  pctOfTotal: 4.3,  color: "bg-pink-500" },
  { category: "יבוא, הובלה ימית ומכס",     amount: 54200,  pctOfTotal: 6.1,  color: "bg-indigo-500" },
  { category: "הובלה מקומית",              amount: 21300,  pctOfTotal: 2.4,  color: "bg-amber-500" },
  { category: "חיתוך CNC",                amount: 36800,  pctOfTotal: 4.1,  color: "bg-violet-500" },
  { category: "ריתוך ואסמבלי",             amount: 52400,  pctOfTotal: 5.9,  color: "bg-orange-500" },
  { category: "גימור פני שטח",             amount: 24300,  pctOfTotal: 2.7,  color: "bg-lime-500" },
  { category: "בקרת איכות ובדיקות",        amount: 16200,  pctOfTotal: 1.8,  color: "bg-emerald-500" },
  { category: "אריזה",                    amount: 11800,  pctOfTotal: 1.3,  color: "bg-stone-400" },
  { category: "עבודת התקנה באתר",          amount: 89600,  pctOfTotal: 10.0, color: "bg-sky-500" },
  { category: "פיגומים וציוד הרמה",        amount: 34500,  pctOfTotal: 3.9,  color: "bg-fuchsia-500" },
  { category: "ניהול פרויקט",              amount: 31200,  pctOfTotal: 3.5,  color: "bg-rose-500" },
  { category: "ביטוח וערבויות",             amount: 18400,  pctOfTotal: 2.1,  color: "bg-yellow-500" },
  { category: "תקורה כללית",              amount: 44800,  pctOfTotal: 5.0,  color: "bg-gray-500" },
  { category: "רזרבת סיכון 3%",           amount: 31300,  pctOfTotal: 3.5,  color: "bg-red-500" },
];
const totalCost = costLines.reduce((s, c) => s + c.amount, 0);

/* ── Material Sources ─────────────────────────────────────────── */
const materialSources = [
  { material: "אלומיניום 6063-T5",     supplier: "Henan Mingtai",    origin: "סין",      unitPrice: 843,  qty: 120, total: 101160, lead: "45 ימים",  status: "אושר" },
  { material: "אלומיניום 6063-T5",     supplier: "אלוניל ישראל",     origin: "מקומי",    unitPrice: 920,  qty: 80,  total: 73600,  lead: "14 ימים",  status: "אושר" },
  { material: "זכוכית מחוסמת 8mm",     supplier: "AGC Europe",       origin: "בלגיה",    unitPrice: 185,  qty: 520, total: 96200,  lead: "60 ימים",  status: "בהזמנה" },
  { material: "זכוכית מחוסמת 8mm",     supplier: "פניציה זכוכית",     origin: "מקומי",    unitPrice: 210,  qty: 180, total: 37800,  lead: "10 ימים",  status: "אושר" },
  { material: "סיליקון SG-20 DOW",     supplier: "Dow Corning",      origin: "גרמניה",   unitPrice: 124,  qty: 230, total: 28520,  lead: "30 ימים",  status: "אושר" },
  { material: "חומר מילוי אש EI60",    supplier: "Rockwool",         origin: "דנמרק",    unitPrice: 2528, qty: 16,  total: 40448,  lead: "35 ימים",  status: "ממתין" },
  { material: "ברגים M8 נירוסטה 316",   supplier: "Würth Israel",     origin: "מקומי",    unitPrice: 2.8,  qty: 4200, total: 11760, lead: "5 ימים",   status: "במלאי" },
  { material: "צבע אבקתי RAL 7016",    supplier: "AkzoNobel",        origin: "הולנד",    unitPrice: 68,   qty: 560, total: 38080,  lead: "25 ימים",  status: "אושר" },
];

/* ── Approval Trail ───────────────────────────────────────────── */
const approvalTrail = [
  { step: 1, action: "נוצרה בקשה",       by: "רונן לוי",        role: "מתמחר בכיר",     date: "2026-03-18", time: "09:12", note: "גרסה ראשונית על בסיס BOQ מהנדס",    status: "done" },
  { step: 2, action: "עדכון עלויות",      by: "מיכל כהן",       role: "רכשת",            date: "2026-03-20", time: "14:30", note: "עדכון מחירי יבוא לפי הצעות ספקים",   status: "done" },
  { step: 3, action: "בדיקת מרווח",       by: "אלון דוד",       role: "מנהל תמחור",      date: "2026-03-22", time: "10:45", note: "מרווח יעד 34% — תקין",               status: "done" },
  { step: 4, action: "עדכון גרסה v3",     by: "רונן לוי",        role: "מתמחר בכיר",     date: "2026-03-28", time: "08:55", note: "תיקון עלות התקנה אחרי סיור באתר",     status: "done" },
  { step: 5, action: "עדכון גרסה v4",     by: "רונן לוי",        role: "מתמחר בכיר",     date: "2026-04-02", time: "11:20", note: "הוספת פיגומים + ציוד הרמה לאחר דרישת בטיחות", status: "done" },
  { step: 6, action: "אישור מנהל תפעול",  by: "שרה לוינשטיין",   role: "מנהלת תפעול",    date: "2026-04-04", time: "16:05", note: "מחיר מעל ₪500K — נדרש אישור מנכ״ל",  status: "done" },
  { step: 7, action: "אישור מנכ״ל",       by: "—",              role: "מנכ״ל",           date: "—",         time: "—",     note: "ממתין לאישור עוזי",                  status: "pending" },
  { step: 8, action: "שליחה ללקוח",       by: "—",              role: "מנהל מכירות",     date: "—",         time: "—",     note: "—",                                  status: "future" },
];

/* ── Price Output Cards ───────────────────────────────────────── */
const priceCards = [
  { title: "מחיר רצפה (מינימום)", price: request.min_sale_price, margin: request.min_margin, profit: request.min_sale_price - request.estimated_total_cost, icon: ArrowDown, gradient: "from-red-600/30 to-red-900/10 border-red-500/30", text: "text-red-400" },
  { title: "מחיר יעד",           price: request.target_sale_price, margin: request.target_margin, profit: request.target_sale_price - request.estimated_total_cost, icon: Target, gradient: "from-amber-600/30 to-amber-900/10 border-amber-500/30", text: "text-amber-400" },
  { title: "מחיר מומלץ",         price: request.recommended_sale_price, margin: request.margin_percent, profit: request.gross_profit, icon: TrendingUp, gradient: "from-emerald-600/30 to-emerald-900/10 border-emerald-500/30", text: "text-emerald-400" },
];

/* ── Component ─────────────────────────────────────────────────── */
export default function ProjectPricingDetails() {
  const [tab, setTab] = useState("summary");
  const st = statusMap[request.status] ?? statusMap.draft;
  const ur = urgencyMap[request.urgency] ?? urgencyMap.low;

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 space-y-6 text-slate-100">

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-500/20">
            <FileText className="h-6 w-6 text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              פרטי בקשת תמחור &mdash; {request.pricing_request_number}
            </h1>
            <p className="text-sm text-slate-400">טכנו-כל עוזי &mdash; תמחור פרויקטים</p>
          </div>
        </div>
        <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-sm px-3 py-1">
          <FileText className="w-3.5 h-3.5 ml-1.5" /> {request.quote} v{request.version}
        </Badge>
      </div>

      {/* ── Top Info Bar ────────────────────────────────────── */}
      <Card className="bg-slate-800/60 border-slate-700">
        <CardContent className="p-4">
          <div className="flex items-center flex-wrap gap-x-6 gap-y-3 text-sm">
            <span className="flex items-center gap-1.5"><Layers className="w-4 h-4 text-violet-400" /> <b>פרויקט:</b> {request.project}</span>
            <span className="flex items-center gap-1.5"><Building2 className="w-4 h-4 text-cyan-400" /> <b>לקוח:</b> {request.customer}</span>
            <span className="flex items-center gap-1.5"><Factory className="w-4 h-4 text-pink-400" /> <b>מערכת:</b> {request.system_type} — {request.project_type}</span>
            <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4 text-slate-400" /> <b>גרסה:</b> v{request.version}</span>
            <Badge className={`${st.cls} text-xs`}>{st.label}</Badge>
            <Badge className={`${ur.cls} text-xs`}>{ur.label}</Badge>
          </div>
        </CardContent>
      </Card>

      {/* ── Scope + Commercial side-by-side ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Scope */}
        <Card className="bg-slate-800/60 border-slate-700">
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Ruler className="w-4 h-4 text-blue-400" /> היקף פרויקט</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-700/40 rounded-lg p-3 text-center">
                <div className="text-xs text-slate-400 mb-1">שטח</div>
                <div className="text-lg font-bold text-blue-400">{request.area_m2.toLocaleString()} מ״ר</div>
              </div>
              <div className="bg-slate-700/40 rounded-lg p-3 text-center">
                <div className="text-xs text-slate-400 mb-1">אורך</div>
                <div className="text-lg font-bold text-cyan-400">{request.length_m} מ׳</div>
              </div>
              <div className="bg-slate-700/40 rounded-lg p-3 text-center">
                <div className="text-xs text-slate-400 mb-1">משקל</div>
                <div className="text-lg font-bold text-violet-400">{request.weight_kg.toLocaleString()} ק״ג</div>
              </div>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              <span className="flex items-center gap-1.5"><Wrench className="w-3.5 h-3.5 text-amber-400" /> התקנה: <b>{request.installation_required ? "נדרשת" : "לא נדרשת"}</b></span>
              <span className="flex items-center gap-1.5"><Paintbrush className="w-3.5 h-3.5 text-pink-400" /> גימור: <b>{request.finishing}</b></span>
            </div>
          </CardContent>
        </Card>

        {/* Commercial */}
        <Card className="bg-slate-800/60 border-slate-700">
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><DollarSign className="w-4 h-4 text-emerald-400" /> פרמטרים מסחריים</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-700/40 rounded-lg p-3">
                <div className="text-xs text-slate-400 mb-1">מרווח יעד</div>
                <div className="text-lg font-bold text-emerald-400">{pct(request.target_margin)}</div>
              </div>
              <div className="bg-slate-700/40 rounded-lg p-3">
                <div className="text-xs text-slate-400 mb-1">מרווח מינימלי</div>
                <div className="text-lg font-bold text-red-400">{pct(request.min_margin)}</div>
              </div>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              <span className="flex items-center gap-1.5">
                <Star className="w-3.5 h-3.5 text-yellow-400" /> לקוח אסטרטגי:
                <Badge className={request.strategic_customer ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs" : "bg-slate-600/40 text-slate-400 text-xs"}>
                  {request.strategic_customer ? "כן" : "לא"}
                </Badge>
              </span>
              <span className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5 text-indigo-400" /> אסטרטגיית רכש: <b>{request.sourcing_strategy}</b></span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Cost Summary Bar ────────────────────────────────── */}
      <Card className="bg-slate-800/60 border-slate-700">
        <CardContent className="p-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="text-center">
              <div className="text-xs text-slate-400">עלות מוערכת</div>
              <div className="text-xl font-bold text-white">{shekel(request.estimated_total_cost)}</div>
            </div>
            <div className="hidden sm:block h-8 w-px bg-slate-600" />
            <div className="text-center">
              <div className="text-xs text-slate-400">מחיר מומלץ</div>
              <div className="text-xl font-bold text-emerald-400">{shekel(request.recommended_sale_price)}</div>
            </div>
            <div className="hidden sm:block h-8 w-px bg-slate-600" />
            <div className="text-center">
              <div className="text-xs text-slate-400">רווח גולמי</div>
              <div className="text-xl font-bold text-green-400">{shekel(request.gross_profit)}</div>
            </div>
            <div className="hidden sm:block h-8 w-px bg-slate-600" />
            <div className="text-center">
              <div className="text-xs text-slate-400">מרווח</div>
              <div className="text-xl font-bold text-amber-400">{pct(request.margin_percent)}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Price Output Cards ──────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {priceCards.map((c) => (
          <Card key={c.title} className={`bg-gradient-to-br ${c.gradient} border`}>
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <c.icon className={`w-5 h-5 ${c.text}`} />
                <span className={`font-semibold ${c.text}`}>{c.title}</span>
              </div>
              <div className="text-2xl font-bold text-white mb-2">{shekel(c.price)}</div>
              <div className="flex items-center justify-between text-sm text-slate-300">
                <span>מרווח: <b className={c.text}>{pct(c.margin)}</b></span>
                <span>רווח: <b>{shekel(c.profit)}</b></span>
              </div>
              <Progress value={c.margin} className="mt-3 h-1.5" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Tabs ────────────────────────────────────────────── */}
      <Tabs value={tab} onValueChange={setTab} dir="rtl">
        <TabsList className="bg-slate-800/80 border border-slate-700">
          <TabsTrigger value="summary">סיכום</TabsTrigger>
          <TabsTrigger value="costs">עלויות</TabsTrigger>
          <TabsTrigger value="sources">מקורות</TabsTrigger>
          <TabsTrigger value="approvals">אישורים</TabsTrigger>
        </TabsList>

        {/* ── Tab: Summary ──────────────────────────────────── */}
        <TabsContent value="summary" className="space-y-4 mt-4">
          <Card className="bg-slate-800/60 border-slate-700">
            <CardHeader className="pb-2"><CardTitle className="text-base">סיכום כללי</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-2 text-slate-300">
              <p>בקשת תמחור <b>{request.pricing_request_number}</b> עבור פרויקט <b>{request.project}</b> ללקוח <b>{request.customer}</b>.</p>
              <p>סה״כ 19 קטגוריות עלות, עלות מצטברת <b>{shekel(totalCost)}</b>. מחיר מכירה מומלץ <b>{shekel(request.recommended_sale_price)}</b> עם מרווח של <b>{pct(request.margin_percent)}</b>.</p>
              <p>הבקשה בגרסה {request.version}. סטטוס נוכחי: <Badge className={`${st.cls} text-xs`}>{st.label}</Badge> — ממתין לאישור מנכ״ל (מחיר מעל ₪500,000).</p>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "עלות ל-מ״ר",   value: shekel(Math.round(request.estimated_total_cost / request.area_m2)),   icon: Ruler,   color: "text-blue-400" },
              { label: "עלות ל-ק״ג",   value: shekel(Math.round(request.estimated_total_cost / request.weight_kg)), icon: Weight,  color: "text-violet-400" },
              { label: "עלות ל-מ׳",    value: shekel(Math.round(request.estimated_total_cost / request.length_m)),  icon: MapPin,  color: "text-cyan-400" },
              { label: "מחיר ל-מ״ר",   value: shekel(Math.round(request.recommended_sale_price / request.area_m2)), icon: BarChart3, color: "text-emerald-400" },
            ].map((k) => (
              <Card key={k.label} className="bg-slate-800/60 border-slate-700">
                <CardContent className="p-3 flex items-center gap-3">
                  <k.icon className={`w-5 h-5 ${k.color}`} />
                  <div>
                    <div className="text-xs text-slate-400">{k.label}</div>
                    <div className="text-base font-bold text-white">{k.value}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ── Tab: Costs ────────────────────────────────────── */}
        <TabsContent value="costs" className="mt-4">
          <Card className="bg-slate-800/60 border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-amber-400" /> פירוט 19 קטגוריות עלות
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-slate-400 text-right">#</TableHead>
                    <TableHead className="text-slate-400 text-right">קטגוריה</TableHead>
                    <TableHead className="text-slate-400 text-right">סכום</TableHead>
                    <TableHead className="text-slate-400 text-right">% מסה״כ</TableHead>
                    <TableHead className="text-slate-400 text-right w-36">התפלגות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {costLines.map((c, i) => (
                    <TableRow key={i} className="border-slate-700/50 hover:bg-slate-700/30">
                      <TableCell className="text-slate-500 text-xs">{i + 1}</TableCell>
                      <TableCell className="font-medium">{c.category}</TableCell>
                      <TableCell className="font-mono">{shekel(c.amount)}</TableCell>
                      <TableCell className="text-slate-400">{pct(c.pctOfTotal)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-slate-700 rounded-full h-2 overflow-hidden">
                            <div className={`${c.color} h-full rounded-full`} style={{ width: `${c.pctOfTotal * 4}%` }} />
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-slate-600 bg-slate-700/30 font-bold">
                    <TableCell />
                    <TableCell>סה״כ עלות</TableCell>
                    <TableCell className="font-mono">{shekel(totalCost)}</TableCell>
                    <TableCell>100%</TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Sources ──────────────────────────────────── */}
        <TabsContent value="sources" className="mt-4">
          <Card className="bg-slate-800/60 border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="w-4 h-4 text-indigo-400" /> מקורות חומרים וספקים
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-slate-400 text-right">חומר</TableHead>
                    <TableHead className="text-slate-400 text-right">ספק</TableHead>
                    <TableHead className="text-slate-400 text-right">מקור</TableHead>
                    <TableHead className="text-slate-400 text-right">מחיר יח׳</TableHead>
                    <TableHead className="text-slate-400 text-right">כמות</TableHead>
                    <TableHead className="text-slate-400 text-right">סה״כ</TableHead>
                    <TableHead className="text-slate-400 text-right">זמן אספקה</TableHead>
                    <TableHead className="text-slate-400 text-right">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {materialSources.map((m, i) => (
                    <TableRow key={i} className="border-slate-700/50 hover:bg-slate-700/30">
                      <TableCell className="font-medium">{m.material}</TableCell>
                      <TableCell>{m.supplier}</TableCell>
                      <TableCell className="text-slate-400">{m.origin}</TableCell>
                      <TableCell className="font-mono">{shekel(m.unitPrice)}</TableCell>
                      <TableCell>{m.qty.toLocaleString()}</TableCell>
                      <TableCell className="font-mono">{shekel(m.total)}</TableCell>
                      <TableCell className="text-slate-400">{m.lead}</TableCell>
                      <TableCell>
                        <Badge className={
                          m.status === "אושר" ? "bg-green-500/20 text-green-400 border-green-500/30 text-xs" :
                          m.status === "במלאי" ? "bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs" :
                          m.status === "בהזמנה" ? "bg-purple-500/20 text-purple-400 border-purple-500/30 text-xs" :
                          "bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs"
                        }>{m.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Approvals ────────────────────────────────── */}
        <TabsContent value="approvals" className="mt-4">
          <Card className="bg-slate-800/60 border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-green-400" /> מסלול אישורים
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {approvalTrail.map((a) => (
                <div key={a.step} className={`flex items-start gap-3 p-3 rounded-lg ${a.status === "pending" ? "bg-yellow-500/10 border border-yellow-500/30" : a.status === "future" ? "bg-slate-700/30 opacity-50" : "bg-slate-700/40"}`}>
                  <div className="mt-0.5">
                    {a.status === "done" ? <CheckCircle2 className="w-5 h-5 text-green-400" /> : a.status === "pending" ? <Clock className="w-5 h-5 text-yellow-400 animate-pulse" /> : <AlertTriangle className="w-5 h-5 text-slate-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{a.action}</span>
                      {a.status === "pending" && <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs">ממתין</Badge>}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      <User className="w-3 h-3 inline ml-1" />{a.by} &mdash; {a.role}
                      {a.date !== "—" && <> &nbsp;|&nbsp; {a.date} {a.time}</>}
                    </div>
                    {a.note !== "—" && <div className="text-xs text-slate-500 mt-1">{a.note}</div>}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
