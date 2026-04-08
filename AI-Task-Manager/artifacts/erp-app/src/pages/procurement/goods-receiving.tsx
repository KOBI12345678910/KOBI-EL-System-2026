import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  PackageCheck, Truck, Clock, XCircle, ShieldCheck, Timer,
  AlertTriangle, CalendarClock, ClipboardList, ArrowDownUp, Ban
} from "lucide-react";

const API = "/api";

const fmt = (v: number) => new Intl.NumberFormat("he-IL").format(v);

const FALLBACK_KPIS = [
  { label: "התקבלו היום", value: "18", sub: "פריטים", icon: PackageCheck, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { label: "ממתין לקבלה", value: "7", sub: "משלוחים", icon: Truck, color: "text-blue-400", bg: "bg-blue-500/10" },
  { label: "פריטים שנדחו", value: "3", sub: "החודש", icon: XCircle, color: "text-red-400", bg: "bg-red-500/10" },
  { label: "עובר בדיקת איכות", value: "94.2%", sub: "מתוך 156", icon: ShieldCheck, color: "text-teal-400", bg: "bg-teal-500/10" },
  { label: "זמן קבלה ממוצע", value: "23 דק׳", sub: "מפריקה עד אחסון", icon: Timer, color: "text-purple-400", bg: "bg-purple-500/10" },
  { label: "משלוחים מאחרים", value: "4", sub: "מעל 3 ימים", icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/10" },
];

const FALLBACK_EXPECTED_ARRIVALS = [
  { po: "PO-000461", supplier: "Foshan Glass Co.", expectedDate: "2026-04-09", items: "זכוכית מחוסמת 10מ״מ", qty: 120, status: "בזמן", daysUntil: 1 },
  { po: "PO-000462", supplier: "Schüco International", expectedDate: "2026-04-10", items: "פרופיל אלומיניום 6060", qty: 300, status: "בזמן", daysUntil: 2 },
  { po: "PO-000463", supplier: "מפעלי ברזל השרון", expectedDate: "2026-04-08", items: "פלדה מגולוונת 2מ״מ", qty: 80, status: "מאחר", daysUntil: 0 },
  { po: "PO-000464", supplier: "Alumil SA", expectedDate: "2026-04-11", items: "ידיות נירוסטה L-200", qty: 500, status: "בזמן", daysUntil: 3 },
  { po: "PO-000465", supplier: "תעשיות זכוכית ים", expectedDate: "2026-04-07", items: "זכוכית שקופה 6מ״מ", qty: 200, status: "מאחר", daysUntil: -1 },
  { po: "PO-000466", supplier: "אלום-טק בע״מ", expectedDate: "2026-04-12", items: "חיבורי פינה 90°", qty: 1000, status: "בזמן", daysUntil: 4 },
  { po: "PO-000467", supplier: "Foshan Glass Co.", expectedDate: "2026-04-06", items: "זכוכית למינציה 8מ״מ", qty: 60, status: "מאחר", daysUntil: -2 },
  { po: "PO-000468", supplier: "מפעלי ברזל השרון", expectedDate: "2026-04-13", items: "ברזל בניין 12מ״מ", qty: 450, status: "בזמן", daysUntil: 5 },
];

const FALLBACK_TODAY_RECEIPTS = [
  { grn: "GRN-001", po: "PO-000455", supplier: "Schüco International", items: "פרופיל אלומיניום 6060", qtyOrdered: 250, qtyReceived: 250, quality: "עבר", receivedBy: "יוסי כהן", time: "07:45" },
  { grn: "GRN-002", po: "PO-000456", supplier: "Foshan Glass Co.", items: "זכוכית מחוסמת 10מ״מ", qtyOrdered: 100, qtyReceived: 98, quality: "עבר", receivedBy: "שרה לוי", time: "08:20" },
  { grn: "GRN-003", po: "PO-000457", supplier: "מפעלי ברזל השרון", items: "פלדה מגולוונת 2מ״מ", qtyOrdered: 60, qtyReceived: 60, quality: "ממתין", receivedBy: "דוד מזרחי", time: "09:10" },
  { grn: "GRN-004", po: "PO-000458", supplier: "אלום-טק בע״מ", items: "חיבורי פינה 90°", qtyOrdered: 800, qtyReceived: 780, quality: "עבר", receivedBy: "רחל אברהם", time: "10:05" },
  { grn: "GRN-005", po: "PO-000449", supplier: "Alumil SA", items: "ידיות נירוסטה L-200", qtyOrdered: 400, qtyReceived: 400, quality: "נכשל", receivedBy: "אלון גולדשטיין", time: "10:40" },
  { grn: "GRN-006", po: "PO-000450", supplier: "תעשיות זכוכית ים", items: "זכוכית שקופה 6מ״מ", qtyOrdered: 150, qtyReceived: 148, quality: "עבר", receivedBy: "מיכל ברק", time: "11:30" },
  { grn: "GRN-007", po: "PO-000451", supplier: "Schüco International", items: "חותמות EPDM", qtyOrdered: 2000, qtyReceived: 2000, quality: "ממתין", receivedBy: "עומר חדד", time: "12:15" },
  { grn: "GRN-008", po: "PO-000452", supplier: "מפעלי ברזל השרון", items: "ברזל בניין 12מ״מ", qtyOrdered: 300, qtyReceived: 295, quality: "עבר", receivedBy: "נועה פרידמן", time: "13:00" },
];

const FALLBACK_DISCREPANCIES = [
  { grn: "GRN-002", po: "PO-000456", supplier: "Foshan Glass Co.", item: "זכוכית מחוסמת 10מ״מ", qtyOrdered: 100, qtyReceived: 98, variance: -2.0, action: "אושר חלקי – הזמנת השלמה" },
  { grn: "GRN-004", po: "PO-000458", supplier: "אלום-טק בע״מ", item: "חיבורי פינה 90°", qtyOrdered: 800, qtyReceived: 780, variance: -2.5, action: "זיכוי מספק" },
  { grn: "GRN-006", po: "PO-000450", supplier: "תעשיות זכוכית ים", item: "זכוכית שקופה 6מ״מ", qtyOrdered: 150, qtyReceived: 148, variance: -1.3, action: "אושר – סטייה מקובלת" },
  { grn: "GRN-008", po: "PO-000452", supplier: "מפעלי ברזל השרון", item: "ברזל בניין 12מ״מ", qtyOrdered: 300, qtyReceived: 295, variance: -1.7, action: "הזמנת השלמה נשלחה" },
  { grn: "GRN-019", po: "PO-000440", supplier: "Alumil SA", item: "פרופיל תרמי 65מ״מ", qtyOrdered: 200, qtyReceived: 185, variance: -7.5, action: "בירור מול ספק" },
  { grn: "GRN-021", po: "PO-000442", supplier: "Foshan Glass Co.", item: "זכוכית למינציה 8מ״מ", qtyOrdered: 80, qtyReceived: 72, variance: -10.0, action: "דרישת פיצוי" },
];

const FALLBACK_REJECTIONS = [
  { date: "2026-04-08", supplier: "Alumil SA", item: "ידיות נירוסטה L-200", reason: "פגם", qtyRejected: 400, replacement: "הוזמן חלופי" },
  { date: "2026-04-06", supplier: "Foshan Glass Co.", item: "זכוכית למינציה 8מ״מ", reason: "לא תואם מפרט", qtyRejected: 15, replacement: "ממתין לאישור ספק" },
  { date: "2026-04-04", supplier: "מפעלי ברזל השרון", item: "פלדה מגולוונת 2מ״מ", reason: "אריזה פגומה", qtyRejected: 8, replacement: "נשלח מחדש" },
  { date: "2026-04-03", supplier: "תעשיות זכוכית ים", item: "זכוכית שקופה 6מ״מ", reason: "פגם", qtyRejected: 12, replacement: "זיכוי התקבל" },
  { date: "2026-04-01", supplier: "אלום-טק בע״מ", item: "חיבורי פינה 90°", reason: "לא תואם מפרט", qtyRejected: 50, replacement: "הוזמן חלופי" },
  { date: "2026-03-28", supplier: "Schüco International", item: "חותמות EPDM", reason: "אריזה פגומה", qtyRejected: 200, replacement: "נשלח מחדש" },
  { date: "2026-03-25", supplier: "Alumil SA", item: "פרופיל תרמי 65מ״מ", reason: "פגם", qtyRejected: 30, replacement: "ממתין לאישור ספק" },
];

const qualityBadge = (status: string) => {
  if (status === "עבר") return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">עבר</Badge>;
  if (status === "נכשל") return <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px]">נכשל</Badge>;
  return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px]">ממתין</Badge>;
};

const reasonBadge = (reason: string) => {
  if (reason === "פגם") return <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px]">פגם</Badge>;
  if (reason === "לא תואם מפרט") return <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-[10px]">לא תואם מפרט</Badge>;
  return <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 text-[10px]">אריזה פגומה</Badge>;
};

const statusBadge = (status: string) => {
  if (status === "בזמן") return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">בזמן</Badge>;
  return <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px]">מאחר</Badge>;
};

const TH = "text-right text-[10px] font-semibold";

export default function GoodsReceiving() {
  const [tab, setTab] = useState("expected");

  const { data: apiData } = useQuery({
    queryKey: ["procurement-goods-receipts"],
    queryFn: async () => {
      const res = await authFetch(`${API}/procurement/goods-receipts`);
      if (!res.ok) throw new Error("Failed to fetch goods receipts");
      return res.json();
    },
  });

  const kpis = apiData?.kpis ?? FALLBACK_KPIS;
  const expectedArrivals = apiData?.expectedArrivals ?? FALLBACK_EXPECTED_ARRIVALS;
  const todayReceipts = apiData?.todayReceipts ?? FALLBACK_TODAY_RECEIPTS;
  const discrepancies = apiData?.discrepancies ?? FALLBACK_DISCREPANCIES;
  const rejections = apiData?.rejections ?? FALLBACK_REJECTIONS;

  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <PackageCheck className="h-7 w-7 text-primary" /> קבלת סחורה
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">ניהול קבלות, בדיקת איכות, פערי כמות ודחיות — טכנו-כל עוזי</p>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-6 gap-2">
        {kpis.map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <Card key={i} className={`${kpi.bg} border-slate-700 bg-slate-800/50`}>
              <CardContent className="pt-3 pb-2 text-center px-2">
                <Icon className={`h-4 w-4 mx-auto ${kpi.color} mb-1`} />
                <p className="text-[9px] text-muted-foreground leading-tight">{kpi.label}</p>
                <p className={`text-lg font-bold font-mono ${kpi.color}`}>{kpi.value}</p>
                <p className="text-[8px] text-muted-foreground">{kpi.sub}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="expected" className="text-xs gap-1"><CalendarClock className="h-3.5 w-3.5" /> צפוי להגיע</TabsTrigger>
          <TabsTrigger value="today" className="text-xs gap-1"><ClipboardList className="h-3.5 w-3.5" /> קבלות היום</TabsTrigger>
          <TabsTrigger value="discrepancies" className="text-xs gap-1"><ArrowDownUp className="h-3.5 w-3.5" /> פערי כמות</TabsTrigger>
          <TabsTrigger value="rejections" className="text-xs gap-1"><Ban className="h-3.5 w-3.5" /> דחיות</TabsTrigger>
        </TabsList>

        {/* Expected Arrivals */}
        <TabsContent value="expected">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className={TH}>מס׳ הזמנה</TableHead>
                    <TableHead className={TH}>ספק</TableHead>
                    <TableHead className={TH}>תאריך צפוי</TableHead>
                    <TableHead className={TH}>פריטים</TableHead>
                    <TableHead className={TH}>כמות</TableHead>
                    <TableHead className={TH}>סטטוס</TableHead>
                    <TableHead className={TH}>ימים להגעה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expectedArrivals.map((row) => (
                    <TableRow key={row.po} className={row.status === "מאחר" ? "bg-red-500/5" : ""}>
                      <TableCell className="font-mono text-[11px] font-medium">{row.po}</TableCell>
                      <TableCell className="text-xs">{row.supplier}</TableCell>
                      <TableCell className="font-mono text-[11px]">{row.expectedDate}</TableCell>
                      <TableCell className="text-xs">{row.items}</TableCell>
                      <TableCell className="font-mono text-xs">{fmt(row.qty)}</TableCell>
                      <TableCell>{statusBadge(row.status)}</TableCell>
                      <TableCell className={`font-mono text-xs font-bold ${row.daysUntil <= 0 ? "text-red-400" : row.daysUntil <= 1 ? "text-amber-400" : "text-emerald-400"}`}>
                        {row.daysUntil <= 0 ? `${Math.abs(row.daysUntil)} באיחור` : row.daysUntil}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Today's Receipts */}
        <TabsContent value="today">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className={TH}>מס׳ קבלה</TableHead>
                    <TableHead className={TH}>הזמנה</TableHead>
                    <TableHead className={TH}>ספק</TableHead>
                    <TableHead className={TH}>פריטים</TableHead>
                    <TableHead className={TH}>הוזמן</TableHead>
                    <TableHead className={TH}>התקבל</TableHead>
                    <TableHead className={TH}>בדיקת איכות</TableHead>
                    <TableHead className={TH}>קיבל</TableHead>
                    <TableHead className={TH}>שעה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {todayReceipts.map((row) => (
                    <TableRow key={row.grn} className={row.quality === "נכשל" ? "bg-red-500/5" : ""}>
                      <TableCell className="font-mono text-[11px] font-bold text-primary">{row.grn}</TableCell>
                      <TableCell className="font-mono text-[11px]">{row.po}</TableCell>
                      <TableCell className="text-xs">{row.supplier}</TableCell>
                      <TableCell className="text-xs">{row.items}</TableCell>
                      <TableCell className="font-mono text-xs">{fmt(row.qtyOrdered)}</TableCell>
                      <TableCell className={`font-mono text-xs font-bold ${row.qtyReceived < row.qtyOrdered ? "text-amber-400" : "text-emerald-400"}`}>
                        {fmt(row.qtyReceived)}
                      </TableCell>
                      <TableCell>{qualityBadge(row.quality)}</TableCell>
                      <TableCell className="text-xs">{row.receivedBy}</TableCell>
                      <TableCell className="font-mono text-[11px]">{row.time}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Quantity Discrepancies */}
        <TabsContent value="discrepancies">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className={TH}>מס׳ קבלה</TableHead>
                    <TableHead className={TH}>הזמנה</TableHead>
                    <TableHead className={TH}>ספק</TableHead>
                    <TableHead className={TH}>פריט</TableHead>
                    <TableHead className={TH}>הוזמן</TableHead>
                    <TableHead className={TH}>התקבל</TableHead>
                    <TableHead className={TH}>סטייה %</TableHead>
                    <TableHead className={TH}>פעולה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {discrepancies.map((row) => (
                    <TableRow key={row.grn}>
                      <TableCell className="font-mono text-[11px] font-bold text-primary">{row.grn}</TableCell>
                      <TableCell className="font-mono text-[11px]">{row.po}</TableCell>
                      <TableCell className="text-xs">{row.supplier}</TableCell>
                      <TableCell className="text-xs">{row.item}</TableCell>
                      <TableCell className="font-mono text-xs">{fmt(row.qtyOrdered)}</TableCell>
                      <TableCell className="font-mono text-xs font-bold text-amber-400">{fmt(row.qtyReceived)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Progress value={100 - Math.abs(row.variance)} className="h-1.5 w-12" />
                          <span className={`font-mono text-[11px] font-bold ${Math.abs(row.variance) > 5 ? "text-red-400" : "text-amber-400"}`}>
                            {row.variance.toFixed(1)}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[9px] border-slate-600">{row.action}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Rejections */}
        <TabsContent value="rejections">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className={TH}>תאריך</TableHead>
                    <TableHead className={TH}>ספק</TableHead>
                    <TableHead className={TH}>פריט</TableHead>
                    <TableHead className={TH}>סיבת דחייה</TableHead>
                    <TableHead className={TH}>כמות נדחתה</TableHead>
                    <TableHead className={TH}>סטטוס החלפה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rejections.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-[11px]">{row.date}</TableCell>
                      <TableCell className="text-xs font-medium">{row.supplier}</TableCell>
                      <TableCell className="text-xs">{row.item}</TableCell>
                      <TableCell>{reasonBadge(row.reason)}</TableCell>
                      <TableCell className="font-mono text-xs font-bold text-red-400">{fmt(row.qtyRejected)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[9px] ${
                          row.replacement === "נשלח מחדש" ? "border-emerald-500/40 text-emerald-400" :
                          row.replacement === "הוזמן חלופי" ? "border-blue-500/40 text-blue-400" :
                          row.replacement === "זיכוי התקבל" ? "border-teal-500/40 text-teal-400" :
                          "border-yellow-500/40 text-yellow-400"
                        }`}>
                          {row.replacement}
                        </Badge>
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
