import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Undo2, PackageX, ShieldCheck, Truck, CreditCard, RefreshCcw, Timer,
  ClipboardList, CheckCircle2, Package, FileText, ArrowLeftRight
} from "lucide-react";

const fmt = (v: number) => new Intl.NumberFormat("he-IL").format(v);
const fmtCurrency = (v: number) => "₪" + new Intl.NumberFormat("he-IL").format(v);

const kpis = [
  { label: "החזרות פתוחות", value: "12", sub: "בקשות פעילות", icon: PackageX, color: "text-red-400", bg: "bg-red-500/10" },
  { label: "ממתין לאישור", value: "5", sub: "בתור אישורים", icon: ShieldCheck, color: "text-amber-400", bg: "bg-amber-500/10" },
  { label: "בשילוח", value: "4", sub: "בדרך לספק", icon: Truck, color: "text-blue-400", bg: "bg-blue-500/10" },
  { label: "זיכויים ממתינים", value: fmtCurrency(34850), sub: "4 שוברים", icon: CreditCard, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { label: "חלופות צפויות", value: "6", sub: "פריטי החלפה", icon: RefreshCcw, color: "text-purple-400", bg: "bg-purple-500/10" },
  { label: "זמן החזרה ממוצע", value: "4.2", sub: "ימים", icon: Timer, color: "text-teal-400", bg: "bg-teal-500/10" },
];

const returnRequests = [
  { id: "RTN-001", supplier: "Foshan Glass Co.", item: "זכוכית מחוסמת 10מ״מ", qty: 15, reason: "פגם", requestedBy: "יוסי כהן", status: "ממתין לאישור", date: "2026-04-07" },
  { id: "RTN-002", supplier: "מפעלי ברזל השרון", item: "פלדה מגולוונת 2מ״מ", qty: 30, reason: "לא תואם", requestedBy: "שרה לוי", status: "אושר", date: "2026-04-06" },
  { id: "RTN-003", supplier: "Schüco International", item: "פרופיל אלומיניום 6060", qty: 50, reason: "עודף", requestedBy: "דוד מזרחי", status: "בשילוח", date: "2026-04-05" },
  { id: "RTN-004", supplier: "אלום-טק בע״מ", item: "חיבורי פינה 90°", qty: 200, reason: "פגם", requestedBy: "רחל אברהם", status: "ממתין לאישור", date: "2026-04-07" },
  { id: "RTN-005", supplier: "Alumil SA", item: "ידיות נירוסטה L-200", qty: 80, reason: "טעות", requestedBy: "אלון גולדשטיין", status: "התקבל זיכוי", date: "2026-04-03" },
  { id: "RTN-006", supplier: "תעשיות זכוכית ים", item: "זכוכית שקופה 6מ״מ", qty: 25, reason: "לא תואם", requestedBy: "מיכל ברק", status: "אושר", date: "2026-04-06" },
  { id: "RTN-007", supplier: "Foshan Glass Co.", item: "זכוכית למינציה 8מ״מ", qty: 10, reason: "פגם", requestedBy: "עומר חדד", status: "ממתין לאישור", date: "2026-04-08" },
  { id: "RTN-008", supplier: "מפעלי ברזל השרון", item: "ברזל בניין 12מ״מ", qty: 40, reason: "עודף", requestedBy: "נועה פרידמן", status: "בשילוח", date: "2026-04-04" },
];

const approvalQueue = [
  { id: "RTN-001", supplier: "Foshan Glass Co.", item: "זכוכית מחוסמת 10מ״מ", qty: 15, value: 8250, reason: "פגם", submittedBy: "יוסי כהן", priority: "גבוה", waitDays: 1 },
  { id: "RTN-004", supplier: "אלום-טק בע״מ", item: "חיבורי פינה 90°", qty: 200, value: 3400, reason: "פגם", submittedBy: "רחל אברהם", priority: "בינוני", waitDays: 1 },
  { id: "RTN-007", supplier: "Foshan Glass Co.", item: "זכוכית למינציה 8מ״מ", qty: 10, value: 6200, reason: "פגם", submittedBy: "עומר חדד", priority: "גבוה", waitDays: 0 },
  { id: "RTN-009", supplier: "Alumil SA", item: "פרופיל תרמי 65מ״מ", qty: 35, value: 12950, reason: "לא תואם", submittedBy: "דוד מזרחי", priority: "גבוה", waitDays: 2 },
  { id: "RTN-010", supplier: "תעשיות זכוכית ים", item: "זכוכית שקופה 6מ״מ", qty: 18, value: 4050, reason: "עודף", submittedBy: "שרה לוי", priority: "נמוך", waitDays: 3 },
  { id: "RTN-011", supplier: "Schüco International", item: "חותמות EPDM", qty: 500, value: 2750, reason: "טעות", submittedBy: "אלון גולדשטיין", priority: "בינוני", waitDays: 1 },
];

const shippingReturns = [
  { id: "RTN-003", supplier: "Schüco International", item: "פרופיל אלומיניום 6060", qty: 50, tracking: "IL-2026-88401", carrier: "שליחויות ישראל", shipped: "2026-04-06", eta: "2026-04-09", status: "במעבר" },
  { id: "RTN-008", supplier: "מפעלי ברזל השרון", item: "ברזל בניין 12מ״מ", qty: 40, tracking: "IL-2026-88402", carrier: "שלמה שילוח", shipped: "2026-04-05", eta: "2026-04-08", status: "הגיע לספק" },
  { id: "RTN-012", supplier: "Foshan Glass Co.", item: "זכוכית מחוסמת 8מ״מ", qty: 20, tracking: "CN-2026-55210", carrier: "DHL Express", shipped: "2026-04-03", eta: "2026-04-12", status: "במעבר" },
  { id: "RTN-013", supplier: "אלום-טק בע״מ", item: "צירים הידראוליים", qty: 60, tracking: "IL-2026-88403", carrier: "שליחויות ישראל", shipped: "2026-04-07", eta: "2026-04-10", status: "נאסף" },
  { id: "RTN-014", supplier: "Alumil SA", item: "מנעולים רב-נק׳", qty: 100, tracking: "GR-2026-77310", carrier: "FedEx", shipped: "2026-04-02", eta: "2026-04-11", status: "במכס" },
  { id: "RTN-015", supplier: "תעשיות זכוכית ים", item: "זכוכית שקופה 4מ״מ", qty: 30, tracking: "IL-2026-88404", carrier: "שלמה שילוח", shipped: "2026-04-06", eta: "2026-04-08", status: "הגיע לספק" },
];

const refunds = [
  { creditNote: "CN-4501", rtn: "RTN-005", supplier: "Alumil SA", item: "ידיות נירוסטה L-200", amount: 11200, issued: "2026-04-04", status: "התקבל", paidDate: "2026-04-07" },
  { creditNote: "CN-4502", rtn: "RTN-002", supplier: "מפעלי ברזל השרון", item: "פלדה מגולוונת 2מ״מ", amount: 7650, issued: "2026-04-06", status: "ממתין לספק", paidDate: "—" },
  { creditNote: "CN-4503", rtn: "RTN-008", supplier: "מפעלי ברזל השרון", item: "ברזל בניין 12מ״מ", amount: 9800, issued: "2026-04-05", status: "אושר", paidDate: "—" },
  { creditNote: "CN-4504", rtn: "RTN-003", supplier: "Schüco International", item: "פרופיל אלומיניום 6060", amount: 17400, issued: "2026-04-07", status: "ממתין לספק", paidDate: "—" },
  { creditNote: "CN-4505", rtn: "RTN-012", supplier: "Foshan Glass Co.", item: "זכוכית מחוסמת 8מ״מ", amount: 12600, issued: "2026-04-03", status: "התקבל", paidDate: "2026-04-06" },
  { creditNote: "CN-4506", rtn: "RTN-015", supplier: "תעשיות זכוכית ים", item: "זכוכית שקופה 4מ״מ", amount: 4200, issued: "2026-04-07", status: "ממתין לספק", paidDate: "—" },
  { creditNote: "CN-4507", rtn: "RTN-006", supplier: "תעשיות זכוכית ים", item: "זכוכית שקופה 6מ״מ", amount: 5850, issued: "2026-04-06", status: "אושר", paidDate: "—" },
];

const replacements = [
  { rtn: "RTN-001", supplier: "Foshan Glass Co.", item: "זכוכית מחוסמת 10מ״מ", qty: 15, expectedDate: "2026-04-12", status: "בייצור", progress: 40 },
  { rtn: "RTN-004", supplier: "אלום-טק בע״מ", item: "חיבורי פינה 90°", qty: 200, expectedDate: "2026-04-10", status: "נשלח", progress: 80 },
  { rtn: "RTN-007", supplier: "Foshan Glass Co.", item: "זכוכית למינציה 8מ״מ", qty: 10, expectedDate: "2026-04-15", status: "ממתין לאישור ספק", progress: 10 },
  { rtn: "RTN-009", supplier: "Alumil SA", item: "פרופיל תרמי 65מ״מ", qty: 35, expectedDate: "2026-04-14", status: "בייצור", progress: 55 },
  { rtn: "RTN-011", supplier: "Schüco International", item: "חותמות EPDM", qty: 500, expectedDate: "2026-04-11", status: "נשלח", progress: 90 },
  { rtn: "RTN-013", supplier: "אלום-טק בע״מ", item: "צירים הידראוליים", qty: 60, expectedDate: "2026-04-13", status: "בייצור", progress: 30 },
];

const reasonBadge = (reason: string) => {
  const map: Record<string, string> = {
    "פגם": "bg-red-500/20 text-red-400 border-red-500/30",
    "לא תואם": "bg-orange-500/20 text-orange-400 border-orange-500/30",
    "עודף": "bg-blue-500/20 text-blue-400 border-blue-500/30",
    "טעות": "bg-purple-500/20 text-purple-400 border-purple-500/30",
  };
  return <Badge className={`${map[reason] || "bg-slate-500/20 text-slate-400 border-slate-500/30"} text-[10px]`}>{reason}</Badge>;
};

const statusBadge = (status: string) => {
  const map: Record<string, string> = {
    "ממתין לאישור": "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    "אושר": "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    "בשילוח": "bg-blue-500/20 text-blue-400 border-blue-500/30",
    "התקבל זיכוי": "bg-teal-500/20 text-teal-400 border-teal-500/30",
    "התקבל": "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    "ממתין לספק": "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    "במעבר": "bg-blue-500/20 text-blue-400 border-blue-500/30",
    "הגיע לספק": "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    "נאסף": "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
    "במכס": "bg-amber-500/20 text-amber-400 border-amber-500/30",
    "נשלח": "bg-blue-500/20 text-blue-400 border-blue-500/30",
    "בייצור": "bg-purple-500/20 text-purple-400 border-purple-500/30",
    "ממתין לאישור ספק": "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  };
  return <Badge className={`${map[status] || "bg-slate-500/20 text-slate-400 border-slate-500/30"} text-[10px]`}>{status}</Badge>;
};

const priorityBadge = (p: string) => {
  const map: Record<string, string> = { "גבוה": "bg-red-500/20 text-red-400 border-red-500/30", "בינוני": "bg-amber-500/20 text-amber-400 border-amber-500/30", "נמוך": "bg-slate-500/20 text-slate-400 border-slate-500/30" };
  return <Badge className={`${map[p]} text-[10px]`}>{p}</Badge>;
};

const TH = "text-right text-[10px] font-semibold";

export default function SupplierReturns() {
  const [tab, setTab] = useState("requests");

  return (
    <div className="p-6 space-y-5" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Undo2 className="h-7 w-7 text-primary" /> החזרות לספקים
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">ניהול בקשות החזרה, אישורים, שילוח, זיכויים וחלופות — טכנו-כל עוזי</p>
      </div>

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

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-5 w-full max-w-3xl">
          <TabsTrigger value="requests" className="text-xs gap-1"><ClipboardList className="h-3.5 w-3.5" /> בקשות</TabsTrigger>
          <TabsTrigger value="approvals" className="text-xs gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> אישורים</TabsTrigger>
          <TabsTrigger value="shipping" className="text-xs gap-1"><Package className="h-3.5 w-3.5" /> שילוח</TabsTrigger>
          <TabsTrigger value="refunds" className="text-xs gap-1"><FileText className="h-3.5 w-3.5" /> זיכויים</TabsTrigger>
          <TabsTrigger value="replacements" className="text-xs gap-1"><ArrowLeftRight className="h-3.5 w-3.5" /> חלופות</TabsTrigger>
        </TabsList>

        <TabsContent value="requests">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className={TH}>מס׳ החזרה</TableHead>
                    <TableHead className={TH}>ספק</TableHead>
                    <TableHead className={TH}>פריט</TableHead>
                    <TableHead className={TH}>כמות</TableHead>
                    <TableHead className={TH}>סיבה</TableHead>
                    <TableHead className={TH}>מבקש</TableHead>
                    <TableHead className={TH}>סטטוס</TableHead>
                    <TableHead className={TH}>תאריך</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {returnRequests.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-[11px] font-bold text-primary">{row.id}</TableCell>
                      <TableCell className="text-xs">{row.supplier}</TableCell>
                      <TableCell className="text-xs">{row.item}</TableCell>
                      <TableCell className="font-mono text-xs">{fmt(row.qty)}</TableCell>
                      <TableCell>{reasonBadge(row.reason)}</TableCell>
                      <TableCell className="text-xs">{row.requestedBy}</TableCell>
                      <TableCell>{statusBadge(row.status)}</TableCell>
                      <TableCell className="font-mono text-[11px]">{row.date}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="approvals">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className={TH}>מס׳ החזרה</TableHead>
                    <TableHead className={TH}>ספק</TableHead>
                    <TableHead className={TH}>פריט</TableHead>
                    <TableHead className={TH}>כמות</TableHead>
                    <TableHead className={TH}>שווי ₪</TableHead>
                    <TableHead className={TH}>סיבה</TableHead>
                    <TableHead className={TH}>הוגש ע״י</TableHead>
                    <TableHead className={TH}>עדיפות</TableHead>
                    <TableHead className={TH}>ימי המתנה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {approvalQueue.map((row) => (
                    <TableRow key={row.id} className={row.waitDays >= 2 ? "bg-amber-500/5" : ""}>
                      <TableCell className="font-mono text-[11px] font-bold text-primary">{row.id}</TableCell>
                      <TableCell className="text-xs">{row.supplier}</TableCell>
                      <TableCell className="text-xs">{row.item}</TableCell>
                      <TableCell className="font-mono text-xs">{fmt(row.qty)}</TableCell>
                      <TableCell className="font-mono text-xs font-bold text-emerald-400">{fmtCurrency(row.value)}</TableCell>
                      <TableCell>{reasonBadge(row.reason)}</TableCell>
                      <TableCell className="text-xs">{row.submittedBy}</TableCell>
                      <TableCell>{priorityBadge(row.priority)}</TableCell>
                      <TableCell className={`font-mono text-xs font-bold ${row.waitDays >= 2 ? "text-red-400" : "text-amber-400"}`}>{row.waitDays}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="shipping">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className={TH}>מס׳ החזרה</TableHead>
                    <TableHead className={TH}>ספק</TableHead>
                    <TableHead className={TH}>פריט</TableHead>
                    <TableHead className={TH}>כמות</TableHead>
                    <TableHead className={TH}>מס׳ מעקב</TableHead>
                    <TableHead className={TH}>מוביל</TableHead>
                    <TableHead className={TH}>נשלח</TableHead>
                    <TableHead className={TH}>הגעה צפויה</TableHead>
                    <TableHead className={TH}>סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shippingReturns.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-[11px] font-bold text-primary">{row.id}</TableCell>
                      <TableCell className="text-xs">{row.supplier}</TableCell>
                      <TableCell className="text-xs">{row.item}</TableCell>
                      <TableCell className="font-mono text-xs">{fmt(row.qty)}</TableCell>
                      <TableCell className="font-mono text-[10px] text-cyan-400">{row.tracking}</TableCell>
                      <TableCell className="text-xs">{row.carrier}</TableCell>
                      <TableCell className="font-mono text-[11px]">{row.shipped}</TableCell>
                      <TableCell className="font-mono text-[11px]">{row.eta}</TableCell>
                      <TableCell>{statusBadge(row.status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="refunds">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className={TH}>שובר זיכוי</TableHead>
                    <TableHead className={TH}>החזרה</TableHead>
                    <TableHead className={TH}>ספק</TableHead>
                    <TableHead className={TH}>פריט</TableHead>
                    <TableHead className={TH}>סכום ₪</TableHead>
                    <TableHead className={TH}>תאריך הנפקה</TableHead>
                    <TableHead className={TH}>סטטוס</TableHead>
                    <TableHead className={TH}>תאריך קבלה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {refunds.map((row) => (
                    <TableRow key={row.creditNote}>
                      <TableCell className="font-mono text-[11px] font-bold text-primary">{row.creditNote}</TableCell>
                      <TableCell className="font-mono text-[11px]">{row.rtn}</TableCell>
                      <TableCell className="text-xs">{row.supplier}</TableCell>
                      <TableCell className="text-xs">{row.item}</TableCell>
                      <TableCell className="font-mono text-xs font-bold text-emerald-400">{fmtCurrency(row.amount)}</TableCell>
                      <TableCell className="font-mono text-[11px]">{row.issued}</TableCell>
                      <TableCell>{statusBadge(row.status)}</TableCell>
                      <TableCell className="font-mono text-[11px]">{row.paidDate}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="replacements">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className={TH}>החזרה</TableHead>
                    <TableHead className={TH}>ספק</TableHead>
                    <TableHead className={TH}>פריט</TableHead>
                    <TableHead className={TH}>כמות</TableHead>
                    <TableHead className={TH}>תאריך צפוי</TableHead>
                    <TableHead className={TH}>סטטוס</TableHead>
                    <TableHead className={TH}>התקדמות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {replacements.map((row) => (
                    <TableRow key={row.rtn}>
                      <TableCell className="font-mono text-[11px] font-bold text-primary">{row.rtn}</TableCell>
                      <TableCell className="text-xs">{row.supplier}</TableCell>
                      <TableCell className="text-xs">{row.item}</TableCell>
                      <TableCell className="font-mono text-xs">{fmt(row.qty)}</TableCell>
                      <TableCell className="font-mono text-[11px]">{row.expectedDate}</TableCell>
                      <TableCell>{statusBadge(row.status)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Progress value={row.progress} className="h-1.5 w-16" />
                          <span className={`font-mono text-[10px] font-bold ${row.progress >= 80 ? "text-emerald-400" : row.progress >= 40 ? "text-amber-400" : "text-red-400"}`}>
                            {row.progress}%
                          </span>
                        </div>
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
