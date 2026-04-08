import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  FileCheck, FileText, Truck, ShieldCheck, AlertTriangle, Clock,
  Link2, CheckCircle2, XCircle, MapPin, Package
} from "lucide-react";

const API = "/api";

const FALLBACK_KPIS = [
  { label: "מסמכים היום", value: "14", sub: "תעודות משלוח", icon: FileText, color: "text-blue-400", bg: "bg-blue-500/10" },
  { label: "ממתין לאימות", value: "6", sub: "מסמכים", icon: Clock, color: "text-amber-400", bg: "bg-amber-500/10" },
  { label: "חתומים", value: "38", sub: "החודש", icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { label: "מסמכים חסרים", value: "3", sub: "דורש טיפול", icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10" },
  { label: "מקושרים להזמנות", value: "92%", sub: "מתוך 52", icon: Link2, color: "text-teal-400", bg: "bg-teal-500/10" },
  { label: "זמן עיבוד ממוצע", value: "18 דק׳", sub: "קבלה עד אישור", icon: Clock, color: "text-purple-400", bg: "bg-purple-500/10" },
];

const FALLBACK_DELIVERY_NOTES = [
  { id: "DN-1041", supplier: "Schüco International", po: "PO-000461", items: "פרופיל אלומיניום 6060", qty: 300, date: "2026-04-08", signed: true },
  { id: "DN-1042", supplier: "Foshan Glass Co.", po: "PO-000462", items: "זכוכית מחוסמת 10מ״מ", qty: 120, date: "2026-04-08", signed: true },
  { id: "DN-1043", supplier: "מפעלי ברזל השרון", po: "PO-000463", items: "פלדה מגולוונת 2מ״מ", qty: 80, date: "2026-04-08", signed: false },
  { id: "DN-1044", supplier: "אלום-טק בע״מ", po: "PO-000464", items: "חיבורי פינה 90°", qty: 1000, date: "2026-04-07", signed: true },
  { id: "DN-1045", supplier: "Alumil SA", po: "PO-000465", items: "ידיות נירוסטה L-200", qty: 500, date: "2026-04-07", signed: false },
  { id: "DN-1046", supplier: "תעשיות זכוכית ים", po: "PO-000466", items: "זכוכית שקופה 6מ״מ", qty: 200, date: "2026-04-06", signed: true },
  { id: "DN-1047", supplier: "Schüco International", po: "PO-000467", items: "חותמות EPDM", qty: 2000, date: "2026-04-06", signed: true },
  { id: "DN-1048", supplier: "מפעלי ברזל השרון", po: "PO-000468", items: "ברזל בניין 12מ״מ", qty: 450, date: "2026-04-05", signed: false },
];

const FALLBACK_SHIPPING_DOCS = [
  { id: "SHP-301", carrier: "צים שילוח", origin: "פושאן, סין", dest: "נמל חיפה", po: "PO-000462", weight: "4,200 ק״ג", eta: "2026-04-12", status: "בדרך" },
  { id: "SHP-302", carrier: "DHL Freight", origin: "ביילפלד, גרמניה", dest: "נמל אשדוד", po: "PO-000461", weight: "1,850 ק״ג", eta: "2026-04-10", status: "בדרך" },
  { id: "SHP-303", carrier: "משלוחי הגליל", origin: "קריית שמונה", dest: "מפעל ראשי", po: "PO-000463", weight: "3,600 ק״ג", eta: "2026-04-08", status: "נמסר" },
  { id: "SHP-304", carrier: "Kuehne+Nagel", origin: "סלוניקי, יוון", dest: "נמל חיפה", po: "PO-000465", weight: "2,100 ק״ג", eta: "2026-04-14", status: "בדרך" },
  { id: "SHP-305", carrier: "הובלות השפלה", origin: "ראשון לציון", dest: "מפעל ראשי", po: "PO-000464", weight: "980 ק״ג", eta: "2026-04-08", status: "נמסר" },
  { id: "SHP-306", carrier: "צים שילוח", origin: "פושאן, סין", dest: "נמל אשדוד", po: "PO-000466", weight: "5,400 ק״ג", eta: "2026-04-16", status: "בנמל" },
  { id: "SHP-307", carrier: "DHL Freight", origin: "ביילפלד, גרמניה", dest: "נמל חיפה", po: "PO-000467", weight: "620 ק״ג", eta: "2026-04-09", status: "שוחרר ממכס" },
  { id: "SHP-308", carrier: "משלוחי הגליל", origin: "נהריה", dest: "מפעל ראשי", po: "PO-000468", weight: "7,200 ק״ג", eta: "2026-04-11", status: "בדרך" },
];

const FALLBACK_VERIFICATION_QUEUE = [
  { id: "VER-201", doc: "DN-1043", supplier: "מפעלי ברזל השרון", type: "תעודת משלוח", submitted: "2026-04-08 09:15", status: "ממתין", verifier: "—" },
  { id: "VER-202", doc: "DN-1045", supplier: "Alumil SA", type: "תעודת משלוח", submitted: "2026-04-07 14:30", status: "ממתין", verifier: "—" },
  { id: "VER-203", doc: "SHP-301", supplier: "Foshan Glass Co.", type: "מסמך שילוח", submitted: "2026-04-07 11:00", status: "אושר", verifier: "יוסי כהן" },
  { id: "VER-204", doc: "DN-1048", supplier: "מפעלי ברזל השרון", type: "תעודת משלוח", submitted: "2026-04-05 16:45", status: "ממתין", verifier: "—" },
  { id: "VER-205", doc: "SHP-306", supplier: "תעשיות זכוכית ים", type: "שטר מטען", submitted: "2026-04-06 08:20", status: "אושר", verifier: "שרה לוי" },
  { id: "VER-206", doc: "DN-1041", supplier: "Schüco International", type: "תעודת משלוח", submitted: "2026-04-08 07:50", status: "אושר", verifier: "דוד מזרחי" },
  { id: "VER-207", doc: "SHP-304", supplier: "Alumil SA", type: "חשבון מכס", submitted: "2026-04-06 13:10", status: "נדחה", verifier: "רחל אברהם" },
  { id: "VER-208", doc: "DN-1046", supplier: "תעשיות זכוכית ים", type: "תעודת משלוח", submitted: "2026-04-06 10:00", status: "אושר", verifier: "אלון גולדשטיין" },
];

const FALLBACK_TRACKING_TIMELINE = [
  { id: "TRK-501", po: "PO-000462", supplier: "Foshan Glass Co.", item: "זכוכית מחוסמת 10מ״מ", steps: ["הוזמן", "נשלח", "בנמל מוצא", "בדרך"], current: 3, total: 6, eta: "2026-04-12" },
  { id: "TRK-502", po: "PO-000461", supplier: "Schüco International", item: "פרופיל אלומיניום 6060", steps: ["הוזמן", "נשלח", "בנמל מוצא", "בדרך", "בנמל יעד"], current: 4, total: 6, eta: "2026-04-10" },
  { id: "TRK-503", po: "PO-000463", supplier: "מפעלי ברזל השרון", item: "פלדה מגולוונת 2מ״מ", steps: ["הוזמן", "נשלח", "בדרך", "נמסר למפעל", "אושר קבלה", "הועבר למחסן"], current: 6, total: 6, eta: "2026-04-08" },
  { id: "TRK-504", po: "PO-000465", supplier: "Alumil SA", item: "ידיות נירוסטה L-200", steps: ["הוזמן", "נשלח", "בנמל מוצא"], current: 2, total: 6, eta: "2026-04-14" },
  { id: "TRK-505", po: "PO-000464", supplier: "אלום-טק בע״מ", item: "חיבורי פינה 90°", steps: ["הוזמן", "נשלח", "בדרך", "נמסר למפעל", "אושר קבלה", "הועבר למחסן"], current: 6, total: 6, eta: "2026-04-08" },
  { id: "TRK-506", po: "PO-000466", supplier: "תעשיות זכוכית ים", item: "זכוכית שקופה 6מ״מ", steps: ["הוזמן", "נשלח", "בנמל מוצא", "בנמל יעד"], current: 3, total: 6, eta: "2026-04-16" },
  { id: "TRK-507", po: "PO-000467", supplier: "Schüco International", item: "חותמות EPDM", steps: ["הוזמן", "נשלח", "בנמל מוצא", "בדרך", "בנמל יעד", "שוחרר ממכס"], current: 5, total: 6, eta: "2026-04-09" },
  { id: "TRK-508", po: "PO-000468", supplier: "מפעלי ברזל השרון", item: "ברזל בניין 12מ״מ", steps: ["הוזמן", "נשלח", "בדרך"], current: 2, total: 6, eta: "2026-04-11" },
];

const signedBadge = (signed: boolean) =>
  signed
    ? <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">חתום</Badge>
    : <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px]">לא חתום</Badge>;

const shipStatusBadge = (status: string) => {
  if (status === "נמסר") return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">נמסר</Badge>;
  if (status === "בנמל") return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-[10px]">בנמל</Badge>;
  if (status === "שוחרר ממכס") return <Badge className="bg-teal-500/20 text-teal-400 border-teal-500/30 text-[10px]">שוחרר ממכס</Badge>;
  return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px]">בדרך</Badge>;
};

const verifyStatusBadge = (status: string) => {
  if (status === "אושר") return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">אושר</Badge>;
  if (status === "נדחה") return <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px]">נדחה</Badge>;
  return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px]">ממתין</Badge>;
};

const TH = "text-right text-[10px] font-semibold";

export default function DeliveryDocuments() {
  const [tab, setTab] = useState("notes");

  const { data: apiData } = useQuery({
    queryKey: ["procurement-deliveries"],
    queryFn: async () => {
      const res = await authFetch(`${API}/procurement/deliveries`);
      if (!res.ok) throw new Error("Failed to fetch deliveries");
      return res.json();
    },
  });

  const kpis = apiData?.kpis ?? FALLBACK_KPIS;
  const deliveryNotes = apiData?.deliveryNotes ?? FALLBACK_DELIVERY_NOTES;
  const shippingDocs = apiData?.shippingDocs ?? FALLBACK_SHIPPING_DOCS;
  const verificationQueue = apiData?.verificationQueue ?? FALLBACK_VERIFICATION_QUEUE;
  const trackingTimeline = apiData?.trackingTimeline ?? FALLBACK_TRACKING_TIMELINE;

  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <FileCheck className="h-7 w-7 text-primary" /> תעודות משלוח ואספקה
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">ניהול תעודות משלוח, מסמכי שילוח, אימות ומעקב — טכנו-כל עוזי</p>
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
          <TabsTrigger value="notes" className="text-xs gap-1"><FileText className="h-3.5 w-3.5" /> תעודות משלוח</TabsTrigger>
          <TabsTrigger value="shipping" className="text-xs gap-1"><Truck className="h-3.5 w-3.5" /> מסמכי שילוח</TabsTrigger>
          <TabsTrigger value="verify" className="text-xs gap-1"><ShieldCheck className="h-3.5 w-3.5" /> אימות</TabsTrigger>
          <TabsTrigger value="tracking" className="text-xs gap-1"><MapPin className="h-3.5 w-3.5" /> מעקב</TabsTrigger>
        </TabsList>

        {/* Delivery Notes */}
        <TabsContent value="notes">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className={TH}>מס׳ תעודה</TableHead>
                    <TableHead className={TH}>ספק</TableHead>
                    <TableHead className={TH}>הזמנת רכש</TableHead>
                    <TableHead className={TH}>פריטים</TableHead>
                    <TableHead className={TH}>כמות</TableHead>
                    <TableHead className={TH}>תאריך</TableHead>
                    <TableHead className={TH}>חתימה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveryNotes.map((row) => (
                    <TableRow key={row.id} className={!row.signed ? "bg-amber-500/5" : ""}>
                      <TableCell className="font-mono text-[11px] font-bold text-primary">{row.id}</TableCell>
                      <TableCell className="text-xs">{row.supplier}</TableCell>
                      <TableCell className="font-mono text-[11px]">{row.po}</TableCell>
                      <TableCell className="text-xs">{row.items}</TableCell>
                      <TableCell className="font-mono text-xs">{row.qty.toLocaleString("he-IL")}</TableCell>
                      <TableCell className="font-mono text-[11px]">{row.date}</TableCell>
                      <TableCell>{signedBadge(row.signed)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Shipping Documents */}
        <TabsContent value="shipping">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className={TH}>מס׳ משלוח</TableHead>
                    <TableHead className={TH}>מוביל</TableHead>
                    <TableHead className={TH}>מוצא</TableHead>
                    <TableHead className={TH}>יעד</TableHead>
                    <TableHead className={TH}>הזמנה</TableHead>
                    <TableHead className={TH}>משקל</TableHead>
                    <TableHead className={TH}>ETA</TableHead>
                    <TableHead className={TH}>סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shippingDocs.map((row) => (
                    <TableRow key={row.id} className={row.status === "נמסר" ? "bg-emerald-500/5" : ""}>
                      <TableCell className="font-mono text-[11px] font-bold text-primary">{row.id}</TableCell>
                      <TableCell className="text-xs">{row.carrier}</TableCell>
                      <TableCell className="text-xs">{row.origin}</TableCell>
                      <TableCell className="text-xs">{row.dest}</TableCell>
                      <TableCell className="font-mono text-[11px]">{row.po}</TableCell>
                      <TableCell className="font-mono text-[11px]">{row.weight}</TableCell>
                      <TableCell className="font-mono text-[11px]">{row.eta}</TableCell>
                      <TableCell>{shipStatusBadge(row.status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Verification Queue */}
        <TabsContent value="verify">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className={TH}>מס׳ אימות</TableHead>
                    <TableHead className={TH}>מסמך</TableHead>
                    <TableHead className={TH}>ספק</TableHead>
                    <TableHead className={TH}>סוג מסמך</TableHead>
                    <TableHead className={TH}>הוגש</TableHead>
                    <TableHead className={TH}>סטטוס</TableHead>
                    <TableHead className={TH}>מאמת</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {verificationQueue.map((row) => (
                    <TableRow key={row.id} className={row.status === "נדחה" ? "bg-red-500/5" : row.status === "ממתין" ? "bg-yellow-500/5" : ""}>
                      <TableCell className="font-mono text-[11px] font-bold text-primary">{row.id}</TableCell>
                      <TableCell className="font-mono text-[11px]">{row.doc}</TableCell>
                      <TableCell className="text-xs">{row.supplier}</TableCell>
                      <TableCell className="text-xs">{row.type}</TableCell>
                      <TableCell className="font-mono text-[11px]">{row.submitted}</TableCell>
                      <TableCell>{verifyStatusBadge(row.status)}</TableCell>
                      <TableCell className="text-xs">{row.verifier}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Delivery Tracking */}
        <TabsContent value="tracking">
          <div className="space-y-3">
            {trackingTimeline.map((row) => (
              <Card key={row.id} className="bg-slate-800/50 border-slate-700">
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[11px] font-bold text-primary">{row.id}</span>
                      <span className="text-xs text-muted-foreground">{row.po}</span>
                      <span className="text-xs">{row.supplier}</span>
                      <span className="text-xs text-muted-foreground">— {row.item}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">ETA:</span>
                      <span className="font-mono text-[11px] font-medium">{row.eta}</span>
                      {row.current === row.total
                        ? <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">הושלם</Badge>
                        : <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-[10px]">{row.current}/{row.total} שלבים</Badge>}
                    </div>
                  </div>
                  <Progress value={(row.current / row.total) * 100} className="h-2 mb-2" />
                  <div className="flex gap-1 flex-wrap">
                    {row.steps.map((step, si) => (
                      <Badge
                        key={si}
                        className={si < row.current
                          ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[9px]"
                          : "bg-slate-700/50 text-slate-500 border-slate-600 text-[9px]"}
                      >
                        {step}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
