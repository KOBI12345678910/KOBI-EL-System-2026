import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  BarChart3, DollarSign, Clock, PackageX, AlertTriangle, TrendingDown, Archive,
} from "lucide-react";

const fmt = (n: number) =>
  new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(n);
const fmtN = (n: number) => new Intl.NumberFormat("he-IL").format(n);

// ── KPI data ──
const kpis = [
  { label: "שווי מלאי כולל", value: fmt(4_872_350), icon: DollarSign, color: "text-emerald-400", bg: "bg-emerald-500/15" },
  { label: "עלות ממוצעת ליחידה", value: fmt(47), icon: BarChart3, color: "text-blue-400", bg: "bg-blue-500/15" },
  { label: "פריטים איטיים", value: "34", icon: TrendingDown, color: "text-amber-400", bg: "bg-amber-500/15" },
  { label: "פריטים מיושנים", value: "12", icon: PackageX, color: "text-red-400", bg: "bg-red-500/15" },
  { label: "שווי גיול >90 יום", value: fmt(623_400), icon: Clock, color: "text-orange-400", bg: "bg-orange-500/15" },
  { label: "מועמדים למחיקה", value: "8", icon: AlertTriangle, color: "text-rose-400", bg: "bg-rose-500/15" },
];

// ── Valuation by category ──
const valuationData = [
  { category: "חומרי גלם — מתכות", items: 142, qty: 28_400, avgCost: 38, total: 1_079_200, pct: 22.1 },
  { category: "חומרי גלם — פלסטיק", items: 96, qty: 41_200, avgCost: 12, total: 494_400, pct: 10.1 },
  { category: "רכיבים אלקטרוניים", items: 218, qty: 64_300, avgCost: 23, total: 1_478_900, pct: 30.4 },
  { category: "חומרי אריזה", items: 54, qty: 18_700, avgCost: 8, total: 149_600, pct: 3.1 },
  { category: "מוצרים מוגמרים", items: 67, qty: 3_420, avgCost: 185, total: 632_700, pct: 13.0 },
  { category: "חלפים ותחזוקה", items: 112, qty: 7_850, avgCost: 52, total: 408_200, pct: 8.4 },
  { category: "תת-הרכבות", items: 38, qty: 1_940, avgCost: 142, total: 275_480, pct: 5.7 },
  { category: "חומרי עזר", items: 85, qty: 12_600, avgCost: 9, total: 113_400, pct: 2.3 },
  { category: "מוצרים בתהליך (WIP)", items: 29, qty: 860, avgCost: 279, total: 239_940, pct: 4.9 },
];

// ── Aging analysis ──
const agingData = [
  { item: "פלדה גליל 2.5mm", code: "RM-1042", qty: 1_200, value: 84_000, lastMove: "2026-03-28", days: 11, bucket: "0-30" },
  { item: "מחבר USB-C 3.1", code: "EC-2187", qty: 8_400, value: 42_000, lastMove: "2026-03-15", days: 24, bucket: "0-30" },
  { item: "ציר נירוסטה 8mm", code: "SP-0334", qty: 640, value: 19_200, lastMove: "2026-02-20", days: 47, bucket: "30-60" },
  { item: "מודול Wi-Fi 6E", code: "EC-3012", qty: 520, value: 36_400, lastMove: "2026-02-08", days: 59, bucket: "30-60" },
  { item: "כבל שטוח 24AWG", code: "EC-1455", qty: 3_200, value: 16_000, lastMove: "2026-01-22", days: 76, bucket: "60-90" },
  { item: "אלומיניום 6061-T6", code: "RM-0871", qty: 380, value: 22_800, lastMove: "2026-01-10", days: 88, bucket: "60-90" },
  { item: "צג LCD 4.3 אינץ׳", code: "EC-0923", qty: 190, value: 47_500, lastMove: "2025-12-18", days: 111, bucket: "90+" },
  { item: "מארז פלסטי v2", code: "PK-0216", qty: 2_800, value: 14_000, lastMove: "2025-11-05", days: 154, bucket: "90+" },
  { item: "שנאי 12V/3A דגם ישן", code: "EC-0541", qty: 420, value: 25_200, lastMove: "2025-10-14", days: 176, bucket: "90+" },
  { item: "סוללה Li-Ion 2600mAh", code: "EC-0188", qty: 1_100, value: 38_500, lastMove: "2025-09-20", days: 200, bucket: "90+" },
];

// ── Slow moving (>60 days) ──
const slowData = [
  { item: "כבל שטוח 24AWG", code: "EC-1455", qty: 3_200, value: 16_000, lastMove: "2026-01-22", days: 76, reason: "ירידה בביקוש" },
  { item: "אלומיניום 6061-T6", code: "RM-0871", qty: 380, value: 22_800, lastMove: "2026-01-10", days: 88, reason: "הוחלף בגרסה חדשה" },
  { item: "צג LCD 4.3 אינץ׳", code: "EC-0923", qty: 190, value: 47_500, lastMove: "2025-12-18", days: 111, reason: "עודף הזמנה" },
  { item: "מארז פלסטי v2", code: "PK-0216", qty: 2_800, value: 14_000, lastMove: "2025-11-05", days: 154, reason: "עודף ייצור" },
  { item: "שנאי 12V/3A דגם ישן", code: "EC-0541", qty: 420, value: 25_200, lastMove: "2025-10-14", days: 176, reason: "דגם יוצא" },
  { item: "סוללה Li-Ion 2600mAh", code: "EC-0188", qty: 1_100, value: 38_500, lastMove: "2025-09-20", days: 200, reason: "רגולציה חדשה" },
  { item: "בורג M4x16 נירוסטה", code: "SP-0778", qty: 12_000, value: 4_800, lastMove: "2025-12-30", days: 99, reason: "מלאי ביטחון גבוה" },
  { item: "ממיר DC-DC 5V", code: "EC-0612", qty: 340, value: 10_200, lastMove: "2026-01-05", days: 93, reason: "ספק חדש" },
  { item: "גומי איטום 12mm", code: "SP-1102", qty: 4_500, value: 9_000, lastMove: "2025-11-22", days: 137, reason: "שינוי מפרט" },
];

// ── Obsolete candidates (>180 days) ──
const obsoleteData = [
  { item: "סוללה Li-Ion 2600mAh", code: "EC-0188", qty: 1_100, value: 38_500, days: 200, writeOff: 30_800, reason: "רגולציה חדשה — לא ניתן להשתמש", status: "ממתין לאישור" },
  { item: "לוח PCB דגם A3-rev1", code: "EC-0099", qty: 85, value: 21_250, days: 245, writeOff: 21_250, reason: "הוחלף בדגם A3-rev3", status: "מומלץ למחיקה" },
  { item: "מנוע צעד 42mm ישן", code: "SP-0201", qty: 64, value: 12_800, days: 312, writeOff: 12_800, reason: "אין שימוש בקווי ייצור", status: "מומלץ למחיקה" },
  { item: "חיישן IR דגם v1", code: "EC-0347", qty: 230, value: 11_500, days: 198, writeOff: 8_050, reason: "דגם חדש בשימוש", status: "בבדיקה" },
  { item: "מארז אלומיניום דגם ישן", code: "PK-0104", qty: 45, value: 9_000, days: 280, writeOff: 9_000, reason: "שינוי עיצוב מוצר", status: "מומלץ למחיקה" },
  { item: "כרטיס זיכרון eMMC 8GB", code: "EC-0555", qty: 600, value: 18_000, days: 210, writeOff: 12_600, reason: "שודרג ל-16GB", status: "ממתין לאישור" },
  { item: "קונדנסטור 470uF/25V", code: "EC-0822", qty: 5_000, value: 5_000, days: 365, writeOff: 5_000, reason: "עודף מזמן רב", status: "מומלץ למחיקה" },
  { item: "תווית ברקוד ישנה", code: "PK-0331", qty: 8_000, value: 2_400, days: 190, writeOff: 2_400, reason: "שינוי מיתוג", status: "מומלץ למחיקה" },
];

const bucketColor: Record<string, string> = {
  "0-30": "bg-emerald-500/20 text-emerald-300",
  "30-60": "bg-blue-500/20 text-blue-300",
  "60-90": "bg-amber-500/20 text-amber-300",
  "90+": "bg-red-500/20 text-red-300",
};

const statusColor: Record<string, string> = {
  "מומלץ למחיקה": "bg-red-500/20 text-red-300",
  "ממתין לאישור": "bg-amber-500/20 text-amber-300",
  "בבדיקה": "bg-blue-500/20 text-blue-300",
};

export default function StockValuationAging() {
  const [tab, setTab] = useState("valuation");

  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
          <BarChart3 className="w-5 h-5 text-blue-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">שווי מלאי וניתוח גיול</h1>
          <p className="text-sm text-muted-foreground">טכנו-כל עוזי — ניתוח שווי, גיול, פריטים איטיים ומיושנים</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k) => (
          <Card key={k.label} className="bg-card/70 border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className={`p-1.5 rounded-lg ${k.bg}`}>
                  <k.icon className={`w-4 h-4 ${k.color}`} />
                </div>
                <span className="text-[11px] text-muted-foreground leading-tight">{k.label}</span>
              </div>
              <p className={`text-lg font-bold font-mono ${k.color}`}>{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-card border border-border/50 h-10">
          <TabsTrigger value="valuation" className="gap-1.5 text-xs"><DollarSign className="w-3.5 h-3.5" />שווי</TabsTrigger>
          <TabsTrigger value="aging" className="gap-1.5 text-xs"><Clock className="w-3.5 h-3.5" />גיול</TabsTrigger>
          <TabsTrigger value="slow" className="gap-1.5 text-xs"><TrendingDown className="w-3.5 h-3.5" />איטי</TabsTrigger>
          <TabsTrigger value="obsolete" className="gap-1.5 text-xs"><Archive className="w-3.5 h-3.5" />מיושן</TabsTrigger>
        </TabsList>

        {/* ── Valuation Tab ── */}
        <TabsContent value="valuation">
          <Card className="bg-card/80 border-border/50">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/30">
                    <TableHead className="text-right text-xs">קטגוריה</TableHead>
                    <TableHead className="text-right text-xs">פריטים</TableHead>
                    <TableHead className="text-right text-xs">כמות</TableHead>
                    <TableHead className="text-right text-xs">עלות ממוצעת</TableHead>
                    <TableHead className="text-right text-xs">שווי כולל</TableHead>
                    <TableHead className="text-right text-xs w-[180px]">% מסה״כ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {valuationData.map((r) => (
                    <TableRow key={r.category} className="border-border/20 hover:bg-muted/30">
                      <TableCell className="font-medium text-sm">{r.category}</TableCell>
                      <TableCell className="font-mono text-muted-foreground">{fmtN(r.items)}</TableCell>
                      <TableCell className="font-mono">{fmtN(r.qty)}</TableCell>
                      <TableCell className="font-mono text-muted-foreground">{fmt(r.avgCost)}</TableCell>
                      <TableCell className="font-mono font-bold text-emerald-400">{fmt(r.total)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={r.pct} className="h-2 flex-1" />
                          <span className="text-xs font-mono text-muted-foreground w-12 text-left">{r.pct}%</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Aging Tab ── */}
        <TabsContent value="aging">
          <Card className="bg-card/80 border-border/50">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/30">
                    <TableHead className="text-right text-xs">פריט</TableHead>
                    <TableHead className="text-right text-xs">מק״ט</TableHead>
                    <TableHead className="text-right text-xs">כמות</TableHead>
                    <TableHead className="text-right text-xs">שווי</TableHead>
                    <TableHead className="text-right text-xs">תנועה אחרונה</TableHead>
                    <TableHead className="text-right text-xs">ימים</TableHead>
                    <TableHead className="text-right text-xs">טווח גיול</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agingData.map((r) => (
                    <TableRow key={r.code} className="border-border/20 hover:bg-muted/30">
                      <TableCell className="font-medium text-sm">{r.item}</TableCell>
                      <TableCell className="font-mono text-xs text-blue-400">{r.code}</TableCell>
                      <TableCell className="font-mono">{fmtN(r.qty)}</TableCell>
                      <TableCell className="font-mono font-bold text-emerald-400">{fmt(r.value)}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{new Date(r.lastMove).toLocaleDateString("he-IL")}</TableCell>
                      <TableCell className={`font-mono font-bold ${r.days > 90 ? "text-red-400" : r.days > 60 ? "text-amber-400" : "text-foreground"}`}>{r.days}</TableCell>
                      <TableCell>
                        <Badge className={`border-0 text-[11px] ${bucketColor[r.bucket]}`}>{r.bucket} יום</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Slow Moving Tab ── */}
        <TabsContent value="slow">
          <Card className="bg-card/80 border-border/50">
            <CardContent className="p-0">
              <div className="px-4 py-3 border-b border-border/30">
                <p className="text-xs text-muted-foreground">פריטים ללא תנועה מעל 60 יום — סה״כ שווי: <span className="text-amber-400 font-mono font-bold">{fmt(slowData.reduce((s, r) => s + r.value, 0))}</span></p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="border-border/30">
                    <TableHead className="text-right text-xs">פריט</TableHead>
                    <TableHead className="text-right text-xs">מק״ט</TableHead>
                    <TableHead className="text-right text-xs">כמות</TableHead>
                    <TableHead className="text-right text-xs">שווי</TableHead>
                    <TableHead className="text-right text-xs">תנועה אחרונה</TableHead>
                    <TableHead className="text-right text-xs">ימים</TableHead>
                    <TableHead className="text-right text-xs">סיבה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {slowData.map((r) => (
                    <TableRow key={r.code} className="border-border/20 hover:bg-muted/30">
                      <TableCell className="font-medium text-sm">{r.item}</TableCell>
                      <TableCell className="font-mono text-xs text-blue-400">{r.code}</TableCell>
                      <TableCell className="font-mono">{fmtN(r.qty)}</TableCell>
                      <TableCell className="font-mono font-bold text-amber-400">{fmt(r.value)}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{new Date(r.lastMove).toLocaleDateString("he-IL")}</TableCell>
                      <TableCell className="font-mono font-bold text-orange-400">{r.days}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="border-border/50 text-[11px] text-muted-foreground">{r.reason}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Obsolete Tab ── */}
        <TabsContent value="obsolete">
          <Card className="bg-card/80 border-border/50">
            <CardContent className="p-0">
              <div className="px-4 py-3 border-b border-border/30 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">פריטים ללא תנועה מעל 180 יום — מומלצים למחיקה</p>
                <span className="text-xs font-mono text-red-400 font-bold">מחיקה מומלצת: {fmt(obsoleteData.reduce((s, r) => s + r.writeOff, 0))}</span>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="border-border/30">
                    <TableHead className="text-right text-xs">פריט</TableHead>
                    <TableHead className="text-right text-xs">מק״ט</TableHead>
                    <TableHead className="text-right text-xs">כמות</TableHead>
                    <TableHead className="text-right text-xs">שווי</TableHead>
                    <TableHead className="text-right text-xs">ימים</TableHead>
                    <TableHead className="text-right text-xs">מחיקה מומלצת</TableHead>
                    <TableHead className="text-right text-xs">סיבה</TableHead>
                    <TableHead className="text-right text-xs">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {obsoleteData.map((r) => (
                    <TableRow key={r.code} className="border-border/20 hover:bg-muted/30">
                      <TableCell className="font-medium text-sm">{r.item}</TableCell>
                      <TableCell className="font-mono text-xs text-blue-400">{r.code}</TableCell>
                      <TableCell className="font-mono">{fmtN(r.qty)}</TableCell>
                      <TableCell className="font-mono text-muted-foreground">{fmt(r.value)}</TableCell>
                      <TableCell className="font-mono font-bold text-red-400">{r.days}</TableCell>
                      <TableCell className="font-mono font-bold text-rose-400">{fmt(r.writeOff)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate">{r.reason}</TableCell>
                      <TableCell>
                        <Badge className={`border-0 text-[11px] ${statusColor[r.status] || "bg-gray-500/20 text-gray-300"}`}>{r.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
