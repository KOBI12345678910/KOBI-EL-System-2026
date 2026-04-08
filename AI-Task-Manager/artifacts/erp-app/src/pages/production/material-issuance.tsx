import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Package, RotateCcw, AlertTriangle, ShieldCheck, TrendingUp,
  Trash2, Clock, Search, ArrowDownToLine, ArrowUpFromLine,
} from "lucide-react";

/* ── helpers ────────────────────────────────────────────────────── */
const ils = (v: number) =>
  new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(v);

/* ── static data ── issue_to_job ────────────────────────────────── */
const issuances = [
  { id: "ISS-4001", wo: "WO-1021", material: "RM-110 פרופיל אלומיניום 40x40", qty: 24, unit: "מ'", issuedBy: "יוסי כהן", time: "08:15", warehouse: "מחסן A1" },
  { id: "ISS-4002", wo: "WO-1018", material: "RM-205 צינור נירוסטה 304 ø50", qty: 12, unit: "מ'", issuedBy: "דוד מזרחי", time: "08:42", warehouse: "מחסן B2" },
  { id: "ISS-4003", wo: "WO-1025", material: "RM-312 זכוכית מחוסמת 10 מ\"מ", qty: 8, unit: "יח'", issuedBy: "שרה לוי", time: "09:10", warehouse: "מחסן C1" },
  { id: "ISS-4004", wo: "WO-1021", material: "RM-118 ברגים נירוסטה M8x30", qty: 200, unit: "יח'", issuedBy: "יוסי כהן", time: "09:35", warehouse: "מחסן A1" },
  { id: "ISS-4005", wo: "WO-1030", material: "RM-420 פח מגולוון 1.5 מ\"מ", qty: 6, unit: "גיליון", issuedBy: "אלון גולדשטיין", time: "10:05", warehouse: "מחסן A2" },
  { id: "ISS-4006", wo: "WO-1028", material: "RM-155 פרופיל ברזל U80", qty: 18, unit: "מ'", issuedBy: "עומר חדד", time: "10:30", warehouse: "מחסן B1" },
  { id: "ISS-4007", wo: "WO-1032", material: "RM-260 אטם סיליקון שחור", qty: 30, unit: "שפופרת", issuedBy: "מיכל ברק", time: "11:00", warehouse: "מחסן D1" },
  { id: "ISS-4008", wo: "WO-1018", material: "RM-330 לוח HPL 18 מ\"מ", qty: 4, unit: "לוח", issuedBy: "דוד מזרחי", time: "11:25", warehouse: "מחסן C2" },
];

/* ── return_unused ──────────────────────────────────────────────── */
const returns = [
  { id: "RET-501", material: "RM-110 פרופיל אלומיניום 40x40", qty: 3, unit: "מ'", reason: "עודף מתכנון", returnedBy: "יוסי כהן", time: "14:20", condition: "תקין" },
  { id: "RET-502", material: "RM-118 ברגים נירוסטה M8x30", qty: 45, unit: "יח'", reason: "שינוי מפרט", returnedBy: "שרה לוי", time: "14:50", condition: "תקין" },
  { id: "RET-503", material: "RM-260 אטם סיליקון שחור", qty: 8, unit: "שפופרת", reason: "עודף מתכנון", returnedBy: "מיכל ברק", time: "15:10", condition: "תקין" },
  { id: "RET-504", material: "RM-420 פח מגולוון 1.5 מ\"מ", qty: 1, unit: "גיליון", reason: "חומר פגום", returnedBy: "אלון גולדשטיין", time: "15:35", condition: "פגום" },
  { id: "RET-505", material: "RM-205 צינור נירוסטה 304 ø50", qty: 2, unit: "מ'", reason: "ביטול פעולה", returnedBy: "דוד מזרחי", time: "16:00", condition: "תקין" },
  { id: "RET-506", material: "RM-155 פרופיל ברזל U80", qty: 4, unit: "מ'", reason: "עודף מתכנון", returnedBy: "עומר חדד", time: "16:20", condition: "תקין" },
  { id: "RET-507", material: "RM-312 זכוכית מחוסמת 10 מ\"מ", qty: 1, unit: "יח'", reason: "שבר בהרכבה", returnedBy: "שרה לוי", time: "16:45", condition: "פגום" },
  { id: "RET-508", material: "RM-330 לוח HPL 18 מ\"מ", qty: 1, unit: "לוח", reason: "גודל לא מתאים", returnedBy: "דוד מזרחי", time: "17:00", condition: "תקין" },
];

/* ── shortage_reporting ─────────────────────────────────────────── */
const shortages = [
  { wo: "WO-1021", material: "RM-142 ציר כבד 120 מ\"מ", needed: 16, available: 4, action: "הזמנה דחופה" },
  { wo: "WO-1018", material: "RM-205 צינור נירוסטה 304 ø50", needed: 20, available: 12, action: "העברה ממחסן B3" },
  { wo: "WO-1025", material: "RM-315 סיליקון שקוף UV", needed: 24, available: 10, action: "חלופי מאושר" },
  { wo: "WO-1030", material: "RM-425 צבע אפוקסי RAL7016", needed: 10, available: 3, action: "הזמנה דחופה" },
  { wo: "WO-1028", material: "RM-160 פלטת ברזל 200x200x10", needed: 36, available: 20, action: "ייצור פנימי" },
  { wo: "WO-1032", material: "RM-270 סרט הדבקה תעשייתי", needed: 50, available: 50, action: "מסופק" },
  { wo: "WO-1035", material: "RM-118 ברגים נירוסטה M8x30", needed: 300, available: 155, action: "הזמנה רגילה" },
  { wo: "WO-1021", material: "RM-450 פרופיל גומי EPDM", needed: 40, available: 0, action: "הזמנה דחופה" },
];

/* ── substitute_approval ────────────────────────────────────────── */
const substitutes = [
  { id: "SUB-101", original: "RM-110 פרופיל אלומיניום 40x40", substitute: "RM-112 פרופיל אלומיניום 40x45", reason: "חוסר במלאי", approver: "עוזי אלקיים", status: "מאושר" },
  { id: "SUB-102", original: "RM-315 סיליקון שקוף UV", substitute: "RM-318 סיליקון שקוף פרימיום", reason: "עדיפות איכות", approver: "עוזי אלקיים", status: "מאושר" },
  { id: "SUB-103", original: "RM-420 פח מגולוון 1.5 מ\"מ", substitute: "RM-422 פח מגולוון 2.0 מ\"מ", reason: "חוסר במלאי", approver: "רחל אברהם", status: "ממתין" },
  { id: "SUB-104", original: "RM-205 צינור נירוסטה 304 ø50", substitute: "RM-208 צינור נירוסטה 316 ø50", reason: "דרישת לקוח", approver: "עוזי אלקיים", status: "מאושר" },
  { id: "SUB-105", original: "RM-155 פרופיל ברזל U80", substitute: "RM-158 פרופיל ברזל U100", reason: "חיזוק מבני", approver: "רחל אברהם", status: "ממתין" },
  { id: "SUB-106", original: "RM-142 ציר כבד 120 מ\"מ", substitute: "RM-145 ציר כבד 150 מ\"מ", reason: "חוסר במלאי", approver: "עוזי אלקיים", status: "נדחה" },
  { id: "SUB-107", original: "RM-330 לוח HPL 18 מ\"מ", substitute: "RM-332 לוח HPL 22 מ\"מ", reason: "שינוי תכנון", approver: "רחל אברהם", status: "ממתין" },
  { id: "SUB-108", original: "RM-450 פרופיל גומי EPDM", substitute: "RM-452 פרופיל גומי סיליקון", reason: "חוסר במלאי", approver: "עוזי אלקיים", status: "מאושר" },
];

/* ── consumption_tracking ───────────────────────────────────────── */
const consumption = [
  { material: "RM-110 פרופיל אלומיניום 40x40", planned: 500, actual: 478, unit: "מ'", cost: 28680 },
  { material: "RM-205 צינור נירוסטה 304 ø50", planned: 200, actual: 215, unit: "מ'", cost: 43000 },
  { material: "RM-312 זכוכית מחוסמת 10 מ\"מ", planned: 60, actual: 55, unit: "יח'", cost: 33000 },
  { material: "RM-118 ברגים נירוסטה M8x30", planned: 2000, actual: 1870, unit: "יח'", cost: 3740 },
  { material: "RM-420 פח מגולוון 1.5 מ\"מ", planned: 80, actual: 82, unit: "גיליון", cost: 24600 },
  { material: "RM-155 פרופיל ברזל U80", planned: 300, actual: 290, unit: "מ'", cost: 20300 },
  { material: "RM-260 אטם סיליקון שחור", planned: 150, actual: 138, unit: "שפופרת", cost: 4140 },
  { material: "RM-330 לוח HPL 18 מ\"מ", planned: 40, actual: 42, unit: "לוח", cost: 16800 },
];

/* ── scrap_tracking ─────────────────────────────────────────────── */
const scrap = [
  { material: "RM-110 פרופיל אלומיניום 40x40", scrapQty: 12, unit: "מ'", reason: "חיתוך לא מדויק", value: 720, wo: "WO-1021" },
  { material: "RM-312 זכוכית מחוסמת 10 מ\"מ", scrapQty: 2, unit: "יח'", reason: "שבירה במשלוח", value: 1200, wo: "WO-1025" },
  { material: "RM-420 פח מגולוון 1.5 מ\"מ", scrapQty: 3, unit: "גיליון", reason: "קורוזיה", value: 900, wo: "WO-1030" },
  { material: "RM-205 צינור נירוסטה 304 ø50", scrapQty: 1.5, unit: "מ'", reason: "ריתוך פגום", value: 300, wo: "WO-1018" },
  { material: "RM-155 פרופיל ברזל U80", scrapQty: 5, unit: "מ'", reason: "חלודה", value: 350, wo: "WO-1028" },
  { material: "RM-118 ברגים נירוסטה M8x30", scrapQty: 30, unit: "יח'", reason: "הברגה פגומה", value: 60, wo: "WO-1021" },
  { material: "RM-260 אטם סיליקון שחור", scrapQty: 5, unit: "שפופרת", reason: "פג תוקף", value: 150, wo: "WO-1032" },
  { material: "RM-330 לוח HPL 18 מ\"מ", scrapQty: 1, unit: "לוח", reason: "גזירה שגויה", value: 400, wo: "WO-1018" },
];

/* ── status badge helpers ───────────────────────────────────────── */
const subStatusColor: Record<string, string> = {
  "מאושר": "bg-green-500/20 text-green-400",
  "ממתין": "bg-yellow-500/20 text-yellow-400",
  "נדחה": "bg-red-500/20 text-red-400",
};

const conditionColor: Record<string, string> = {
  "תקין": "bg-green-500/20 text-green-400",
  "פגום": "bg-red-500/20 text-red-400",
};

const actionColor: Record<string, string> = {
  "הזמנה דחופה": "bg-red-500/20 text-red-400",
  "הזמנה רגילה": "bg-yellow-500/20 text-yellow-400",
  "העברה ממחסן B3": "bg-blue-500/20 text-blue-400",
  "חלופי מאושר": "bg-purple-500/20 text-purple-400",
  "ייצור פנימי": "bg-cyan-500/20 text-cyan-400",
  "מסופק": "bg-green-500/20 text-green-400",
};

type TabKey = "issues" | "returns" | "shortages" | "substitutes" | "consumption";

/* ================================================================ */
export default function MaterialIssuance() {
  const [tab, setTab] = useState<TabKey>("issues");
  const [search, setSearch] = useState("");

  /* KPI computations */
  const issuedToday = issuances.length;
  const returnsCount = returns.length;
  const activeShortages = shortages.filter(s => s.available < s.needed).length;
  const pendingSubs = substitutes.filter(s => s.status === "ממתין").length;
  const totalConsumption = consumption.reduce((s, c) => s + c.cost, 0);
  const totalScrap = scrap.reduce((s, c) => s + c.value, 0);

  const kpis = [
    { label: "הונפקו היום", value: issuedToday, icon: ArrowDownToLine, color: "text-blue-400" },
    { label: "החזרות", value: returnsCount, icon: ArrowUpFromLine, color: "text-cyan-400" },
    { label: "חוסרים פעילים", value: activeShortages, icon: AlertTriangle, color: "text-red-400" },
    { label: "חלופות ממתינות", value: pendingSubs, icon: ShieldCheck, color: "text-yellow-400" },
    { label: "צריכה חודשית", value: ils(totalConsumption), icon: TrendingUp, color: "text-emerald-400" },
    { label: "ערך גרוטאות", value: ils(totalScrap), icon: Trash2, color: "text-orange-400" },
  ];

  /* search filter per tab */
  const sl = search.toLowerCase();
  const filteredIssues = useMemo(() => !sl ? issuances : issuances.filter(r =>
    r.material.toLowerCase().includes(sl) || r.wo.toLowerCase().includes(sl) || r.issuedBy.includes(sl)
  ), [sl]);
  const filteredReturns = useMemo(() => !sl ? returns : returns.filter(r =>
    r.material.toLowerCase().includes(sl) || r.returnedBy.includes(sl) || r.reason.includes(sl)
  ), [sl]);
  const filteredShortages = useMemo(() => !sl ? shortages : shortages.filter(r =>
    r.material.toLowerCase().includes(sl) || r.wo.toLowerCase().includes(sl)
  ), [sl]);
  const filteredSubs = useMemo(() => !sl ? substitutes : substitutes.filter(r =>
    r.original.toLowerCase().includes(sl) || r.substitute.toLowerCase().includes(sl)
  ), [sl]);
  const filteredConsumption = useMemo(() => !sl ? consumption : consumption.filter(r =>
    r.material.toLowerCase().includes(sl)
  ), [sl]);

  return (
    <div dir="rtl" className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-500/10">
            <Package className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">הנפקת חומרים לייצור</h1>
            <p className="text-sm text-muted-foreground">ניהול הנפקות, החזרות, חוסרים וחלופות - טכנו-כל עוזי</p>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            className="bg-muted/50 border border-border rounded-lg pr-9 pl-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/40 w-64"
            placeholder="חיפוש חומר, הזמנה, עובד..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((k) => (
          <Card key={k.label} className="bg-card border-border">
            <CardContent className="p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{k.label}</span>
                <k.icon className={`w-4 h-4 ${k.color}`} />
              </div>
              <span className="text-2xl font-bold text-foreground">{k.value}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList className="bg-muted/50">
          <TabsTrigger value="issues">הנפקות</TabsTrigger>
          <TabsTrigger value="returns">החזרות</TabsTrigger>
          <TabsTrigger value="shortages">חוסרים</TabsTrigger>
          <TabsTrigger value="substitutes">חלופות</TabsTrigger>
          <TabsTrigger value="consumption">צריכה</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* ── Tab: Issues ─────────────────────────────────────────── */}
      {tab === "issues" && (
        <Card className="bg-card border-border overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-right text-muted-foreground">מס'</TableHead>
                    <TableHead className="text-right text-muted-foreground">הזמנת עבודה</TableHead>
                    <TableHead className="text-right text-muted-foreground">חומר</TableHead>
                    <TableHead className="text-center text-muted-foreground">כמות</TableHead>
                    <TableHead className="text-center text-muted-foreground">יחידה</TableHead>
                    <TableHead className="text-right text-muted-foreground">הונפק ע"י</TableHead>
                    <TableHead className="text-center text-muted-foreground">שעה</TableHead>
                    <TableHead className="text-right text-muted-foreground">מחסן</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredIssues.map((r) => (
                    <TableRow key={r.id} className="border-border hover:bg-muted/30">
                      <TableCell className="font-mono font-semibold text-foreground">{r.id}</TableCell>
                      <TableCell className="font-mono text-blue-400">{r.wo}</TableCell>
                      <TableCell className="text-foreground">{r.material}</TableCell>
                      <TableCell className="text-center text-foreground">{r.qty}</TableCell>
                      <TableCell className="text-center text-muted-foreground">{r.unit}</TableCell>
                      <TableCell className="text-foreground">{r.issuedBy}</TableCell>
                      <TableCell className="text-center text-muted-foreground">{r.time}</TableCell>
                      <TableCell className="text-muted-foreground">{r.warehouse}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Tab: Returns ────────────────────────────────────────── */}
      {tab === "returns" && (
        <Card className="bg-card border-border overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-right text-muted-foreground">מס'</TableHead>
                    <TableHead className="text-right text-muted-foreground">חומר</TableHead>
                    <TableHead className="text-center text-muted-foreground">כמות</TableHead>
                    <TableHead className="text-center text-muted-foreground">יחידה</TableHead>
                    <TableHead className="text-right text-muted-foreground">סיבה</TableHead>
                    <TableHead className="text-right text-muted-foreground">הוחזר ע"י</TableHead>
                    <TableHead className="text-center text-muted-foreground">שעה</TableHead>
                    <TableHead className="text-center text-muted-foreground">מצב</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReturns.map((r) => (
                    <TableRow key={r.id} className="border-border hover:bg-muted/30">
                      <TableCell className="font-mono font-semibold text-foreground">{r.id}</TableCell>
                      <TableCell className="text-foreground">{r.material}</TableCell>
                      <TableCell className="text-center text-foreground">{r.qty}</TableCell>
                      <TableCell className="text-center text-muted-foreground">{r.unit}</TableCell>
                      <TableCell className="text-foreground">{r.reason}</TableCell>
                      <TableCell className="text-foreground">{r.returnedBy}</TableCell>
                      <TableCell className="text-center text-muted-foreground">{r.time}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className={`${conditionColor[r.condition]} border-0 text-xs`}>{r.condition}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Tab: Shortages ──────────────────────────────────────── */}
      {tab === "shortages" && (
        <Card className="bg-card border-border overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-right text-muted-foreground">הזמנת עבודה</TableHead>
                    <TableHead className="text-right text-muted-foreground">חומר</TableHead>
                    <TableHead className="text-center text-muted-foreground">נדרש</TableHead>
                    <TableHead className="text-center text-muted-foreground">זמין</TableHead>
                    <TableHead className="text-center text-muted-foreground">פער</TableHead>
                    <TableHead className="text-center text-muted-foreground w-28">כיסוי</TableHead>
                    <TableHead className="text-center text-muted-foreground">פעולה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredShortages.map((r, i) => {
                    const gap = r.needed - r.available;
                    const cover = Math.min(100, Math.round((r.available / r.needed) * 100));
                    return (
                      <TableRow key={i} className={`border-border hover:bg-muted/30 ${gap > 0 ? "bg-red-500/5" : ""}`}>
                        <TableCell className="font-mono text-blue-400">{r.wo}</TableCell>
                        <TableCell className="text-foreground">{r.material}</TableCell>
                        <TableCell className="text-center text-foreground">{r.needed}</TableCell>
                        <TableCell className="text-center text-foreground">{r.available}</TableCell>
                        <TableCell className={`text-center font-semibold ${gap > 0 ? "text-red-400" : "text-green-400"}`}>{gap > 0 ? `-${gap}` : "0"}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={cover} className="h-2 flex-1 bg-muted/40" />
                            <span className="text-xs text-muted-foreground w-8 text-left">{cover}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={`${actionColor[r.action] || "bg-muted/20 text-muted-foreground"} border-0 text-xs`}>{r.action}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Tab: Substitutes ────────────────────────────────────── */}
      {tab === "substitutes" && (
        <Card className="bg-card border-border overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-right text-muted-foreground">מס'</TableHead>
                    <TableHead className="text-right text-muted-foreground">חומר מקורי</TableHead>
                    <TableHead className="text-right text-muted-foreground">חלופה</TableHead>
                    <TableHead className="text-right text-muted-foreground">סיבה</TableHead>
                    <TableHead className="text-right text-muted-foreground">מאשר</TableHead>
                    <TableHead className="text-center text-muted-foreground">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSubs.map((r) => (
                    <TableRow key={r.id} className="border-border hover:bg-muted/30">
                      <TableCell className="font-mono font-semibold text-foreground">{r.id}</TableCell>
                      <TableCell className="text-foreground">{r.original}</TableCell>
                      <TableCell className="text-emerald-400">{r.substitute}</TableCell>
                      <TableCell className="text-muted-foreground">{r.reason}</TableCell>
                      <TableCell className="text-foreground">{r.approver}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className={`${subStatusColor[r.status]} border-0 text-xs`}>{r.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Tab: Consumption ────────────────────────────────────── */}
      {tab === "consumption" && (
        <Card className="bg-card border-border overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-right text-muted-foreground">חומר</TableHead>
                    <TableHead className="text-center text-muted-foreground">מתוכנן</TableHead>
                    <TableHead className="text-center text-muted-foreground">בפועל</TableHead>
                    <TableHead className="text-center text-muted-foreground">יחידה</TableHead>
                    <TableHead className="text-center text-muted-foreground">סטייה %</TableHead>
                    <TableHead className="text-center text-muted-foreground w-28">ניצול</TableHead>
                    <TableHead className="text-left text-muted-foreground">עלות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredConsumption.map((r, i) => {
                    const deviation = r.planned > 0 ? Math.round(((r.actual - r.planned) / r.planned) * 100) : 0;
                    const utilPct = r.planned > 0 ? Math.min(100, Math.round((r.actual / r.planned) * 100)) : 0;
                    return (
                      <TableRow key={i} className="border-border hover:bg-muted/30">
                        <TableCell className="text-foreground">{r.material}</TableCell>
                        <TableCell className="text-center text-muted-foreground">{r.planned.toLocaleString("he-IL")}</TableCell>
                        <TableCell className="text-center text-foreground">{r.actual.toLocaleString("he-IL")}</TableCell>
                        <TableCell className="text-center text-muted-foreground">{r.unit}</TableCell>
                        <TableCell className={`text-center font-semibold ${deviation > 0 ? "text-red-400" : deviation < 0 ? "text-green-400" : "text-muted-foreground"}`}>
                          {deviation > 0 ? `+${deviation}%` : `${deviation}%`}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={utilPct} className="h-2 flex-1 bg-muted/40" />
                            <span className="text-xs text-muted-foreground w-8 text-left">{utilPct}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-left font-mono text-foreground">{ils(r.cost)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Footer */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <Clock className="w-3.5 h-3.5" />
        <span>עודכן: 08/04/2026 11:30</span>
        <span>|</span>
        <span>{activeShortages} חוסרים פעילים</span>
        <span>|</span>
        <span>גרוטאות: {ils(totalScrap)}</span>
      </div>
    </div>
  );
}
