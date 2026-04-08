import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Globe, ShoppingCart, FileCheck, FileUp, FileText, Truck,
  CheckCircle2, Clock, AlertTriangle, TrendingUp, TrendingDown,
  Send, Upload, Building2, Phone, Mail, MapPin, Award
} from "lucide-react";

const fmt = (v: number) => "₪" + new Intl.NumberFormat("he-IL").format(v);
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString("he-IL") : "—";

const statusColors: Record<string, string> = {
  "ממתין לאישור": "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  "אושר": "bg-green-500/20 text-green-300 border-green-500/30",
  "נשלח": "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "בדרך": "bg-purple-500/20 text-purple-300 border-purple-500/30",
  "התקבל": "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  "בוטל": "bg-red-500/20 text-red-300 border-red-500/30",
  "חדש": "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  "הוגש": "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
  "נבחר": "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  "לא נבחר": "bg-gray-500/20 text-gray-300 border-gray-500/30",
  "הועלה": "bg-green-500/20 text-green-300 border-green-500/30",
  "חסר": "bg-red-500/20 text-red-300 border-red-500/30",
  "פג תוקף": "bg-orange-500/20 text-orange-300 border-orange-500/30",
};

const FALLBACK_ORDERS = [
  { po: "PO-2026-041", date: "2026-03-28", items: "פרופיל אלומיניום 6063-T5 x200", value: 148000, status: "ממתין לאישור", delivery: "2026-04-18" },
  { po: "PO-2026-038", date: "2026-03-25", items: "צינורות אלומיניום 50x50 x120", value: 86400, status: "אושר", delivery: "2026-04-12" },
  { po: "PO-2026-035", date: "2026-03-20", items: "גליל אלומיניום 1.5mm x30", value: 234000, status: "נשלח", delivery: "2026-04-10" },
  { po: "PO-2026-032", date: "2026-03-15", items: "זוויתנים 40x40 x500", value: 42500, status: "בדרך", delivery: "2026-04-08" },
  { po: "PO-2026-029", date: "2026-03-10", items: "פלטות אלומיניום 3mm x80", value: 192000, status: "התקבל", delivery: "2026-04-02" },
  { po: "PO-2026-025", date: "2026-03-05", items: "חלונות מסגרת TH-55 x60", value: 315000, status: "התקבל", delivery: "2026-03-28" },
  { po: "PO-2026-044", date: "2026-04-02", items: "פרופיל תרמי TB-62 x150", value: 267000, status: "ממתין לאישור", delivery: "2026-04-25" },
  { po: "PO-2026-046", date: "2026-04-05", items: "אביזרי חיבור אלומיניום x1000", value: 18500, status: "בוטל", delivery: "" },
];

const FALLBACK_QUOTES = [
  { rfq: "RFQ-2026-018", title: "פרופיל אלומיניום חדש TB-70", qty: "300 יח׳", deadline: "2026-04-15", status: "חדש", budget: 420000 },
  { rfq: "RFQ-2026-016", title: "גליל אלומיניום אנודייז 2mm", qty: "50 גליל", deadline: "2026-04-12", status: "הוגש", budget: 185000 },
  { rfq: "RFQ-2026-014", title: "מערכת חלונות הזזה SL-80", qty: "100 יח׳", deadline: "2026-04-08", status: "נבחר", budget: 520000 },
  { rfq: "RFQ-2026-012", title: "צינורות מרובעים 60x60", qty: "200 יח׳", deadline: "2026-03-30", status: "לא נבחר", budget: 98000 },
  { rfq: "RFQ-2026-020", title: "פרופיל דלתות DL-45", qty: "250 יח׳", deadline: "2026-04-20", status: "חדש", budget: 310000 },
  { rfq: "RFQ-2026-022", title: "אלומיניום מוברש למעטפת", qty: "120 מ״ר", deadline: "2026-04-22", status: "חדש", budget: 276000 },
];

const FALLBACK_DOCUMENTS = [
  { name: "תעודת ISO 9001:2025", type: "תקן איכות", status: "הועלה", expiry: "2027-01-15", uploaded: "2026-01-20" },
  { name: "ביטוח אחריות מקצועית", type: "ביטוח", status: "הועלה", expiry: "2026-12-31", uploaded: "2026-01-05" },
  { name: "אישור ניכוי מס במקור", type: "מס", status: "פג תוקף", expiry: "2026-03-31", uploaded: "2025-04-01" },
  { name: "רישיון עסק", type: "רגולציה", status: "הועלה", expiry: "2026-08-15", uploaded: "2025-09-01" },
  { name: "תעודת מעבדה — פרופיל TB-62", type: "בדיקות", status: "חסר", expiry: "", uploaded: "" },
  { name: "הצהרת תאימות CE", type: "תקן", status: "הועלה", expiry: "2027-06-30", uploaded: "2026-02-10" },
  { name: "דו״ח ביקורת מפעל 2026", type: "ביקורת", status: "חסר", expiry: "", uploaded: "" },
];

const FALLBACK_DELIVERIES = [
  { shipment: "SH-8841", po: "PO-2026-035", items: "גליל אלומיניום 1.5mm", qty: 30, eta: "2026-04-10", tracking: "IL-4488120", status: "בדרך", progress: 72 },
  { shipment: "SH-8839", po: "PO-2026-032", items: "זוויתנים 40x40", qty: 500, eta: "2026-04-08", tracking: "IL-4487655", status: "בדרך", progress: 95 },
  { shipment: "SH-8835", po: "PO-2026-029", items: "פלטות אלומיניום 3mm", qty: 80, eta: "2026-04-02", tracking: "IL-4486200", status: "התקבל", progress: 100 },
  { shipment: "SH-8830", po: "PO-2026-025", items: "חלונות מסגרת TH-55", qty: 60, eta: "2026-03-28", tracking: "IL-4485100", status: "התקבל", progress: 100 },
  { shipment: "SH-8845", po: "PO-2026-038", items: "צינורות אלומיניום 50x50", qty: 120, eta: "2026-04-12", tracking: "", status: "ממתין לאיסוף", progress: 10 },
  { shipment: "SH-8848", po: "PO-2026-041", items: "פרופיל אלומיניום 6063-T5", qty: 200, eta: "2026-04-18", tracking: "", status: "ממתין לאישור", progress: 0 },
];

export default function SupplierPortal() {
  const { data: supplierportalData } = useQuery({
    queryKey: ["supplier-portal"],
    queryFn: () => authFetch("/api/procurement/supplier_portal"),
    staleTime: 5 * 60 * 1000,
  });

  const orders = supplierportalData ?? FALLBACK_ORDERS;

  const [tab, setTab] = useState("orders");

  const openOrders = orders.filter(o => !["התקבל", "בוטל"].includes(o.status)).length;
  const pendingConfirm = orders.filter(o => o.status === "ממתין לאישור").length;
  const quotesRequested = quotes.filter(q => q.status === "חדש").length;
  const docsMissing = documents.filter(d => d.status === "חסר" || d.status === "פג תוקף").length;
  const deliveriesToUpdate = deliveries.filter(d => !d.tracking && d.status !== "התקבל").length;

  const kpis = [
    { label: "הזמנות פתוחות", value: String(openOrders), icon: ShoppingCart, color: "text-blue-400", trend: "+2", up: true },
    { label: "ממתינות לאישורך", value: String(pendingConfirm), icon: Clock, color: "text-yellow-400", trend: String(pendingConfirm), up: false },
    { label: "בקשות הצעת מחיר", value: String(quotesRequested), icon: FileText, color: "text-cyan-400", trend: "חדש", up: true },
    { label: "מסמכים להעלאה", value: String(docsMissing), icon: FileUp, color: "text-red-400", trend: "דחוף", up: false },
    { label: "אספקות לעדכון", value: String(deliveriesToUpdate), icon: Truck, color: "text-purple-400", trend: String(deliveriesToUpdate), up: false },
  ];

  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Globe className="h-7 w-7 text-blue-400" /> פורטל ספקים
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            תצוגת ספק: <span className="text-white font-medium">אלומיניום ישראל בע״מ</span> — טכנו-כל עוזי
          </p>
        </div>
        <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-xs">ספק מאושר</Badge>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpis.map((k, i) => {
          const Icon = k.icon;
          return (
            <Card key={i} className="bg-slate-800/50 border-slate-700 hover:border-slate-600 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[11px] text-muted-foreground">{k.label}</p>
                    <p className={`text-lg font-bold font-mono mt-1 ${k.color}`}>{k.value}</p>
                    <div className="flex items-center gap-1 mt-1">
                      {k.up ? <TrendingUp className="h-3 w-3 text-green-400" /> : <TrendingDown className="h-3 w-3 text-yellow-400" />}
                      <span className={`text-[10px] ${k.up ? "text-green-400" : "text-yellow-400"}`}>{k.trend}</span>
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-700/50"><Icon className={`h-4 w-4 ${k.color}`} /></div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-slate-800/60 border border-slate-700">
          <TabsTrigger value="orders">הזמנות</TabsTrigger>
          <TabsTrigger value="quotes">הצעות מחיר</TabsTrigger>
          <TabsTrigger value="documents">מסמכים</TabsTrigger>
          <TabsTrigger value="deliveries">אספקות</TabsTrigger>
          <TabsTrigger value="profile">פרופיל</TabsTrigger>
        </TabsList>

        {/* ── Orders Tab ── */}
        <TabsContent value="orders">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-transparent">
                    <TableHead className="text-right text-muted-foreground">מס׳ הזמנה</TableHead>
                    <TableHead className="text-right text-muted-foreground">תאריך</TableHead>
                    <TableHead className="text-right text-muted-foreground">פריטים</TableHead>
                    <TableHead className="text-right text-muted-foreground">ערך</TableHead>
                    <TableHead className="text-right text-muted-foreground">אספקה צפויה</TableHead>
                    <TableHead className="text-right text-muted-foreground">סטטוס</TableHead>
                    <TableHead className="text-right text-muted-foreground">פעולה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((o) => (
                    <TableRow key={o.po} className="border-slate-700/50 hover:bg-slate-700/30">
                      <TableCell className="font-mono text-sm text-blue-300">{o.po}</TableCell>
                      <TableCell className="text-sm">{fmtDate(o.date)}</TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">{o.items}</TableCell>
                      <TableCell className="font-mono text-sm">{fmt(o.value)}</TableCell>
                      <TableCell className="text-sm">{o.delivery ? fmtDate(o.delivery) : "—"}</TableCell>
                      <TableCell><Badge className={`text-[10px] ${statusColors[o.status] || ""}`}>{o.status}</Badge></TableCell>
                      <TableCell>
                        {o.status === "ממתין לאישור" ? (
                          <button className="flex items-center gap-1 text-xs bg-emerald-600/80 hover:bg-emerald-600 text-white px-2 py-1 rounded transition-colors">
                            <CheckCircle2 className="h-3 w-3" /> אשר הזמנה
                          </button>
                        ) : o.status === "אושר" ? (
                          <span className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> אושר</span>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Quotes Tab ── */}
        <TabsContent value="quotes">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-transparent">
                    <TableHead className="text-right text-muted-foreground">מס׳ RFQ</TableHead>
                    <TableHead className="text-right text-muted-foreground">תיאור</TableHead>
                    <TableHead className="text-right text-muted-foreground">כמות</TableHead>
                    <TableHead className="text-right text-muted-foreground">תקציב משוער</TableHead>
                    <TableHead className="text-right text-muted-foreground">מועד אחרון</TableHead>
                    <TableHead className="text-right text-muted-foreground">סטטוס</TableHead>
                    <TableHead className="text-right text-muted-foreground">פעולה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quotes.map((q) => (
                    <TableRow key={q.rfq} className="border-slate-700/50 hover:bg-slate-700/30">
                      <TableCell className="font-mono text-sm text-cyan-300">{q.rfq}</TableCell>
                      <TableCell className="text-sm">{q.title}</TableCell>
                      <TableCell className="text-sm">{q.qty}</TableCell>
                      <TableCell className="font-mono text-sm">{fmt(q.budget)}</TableCell>
                      <TableCell className="text-sm">{fmtDate(q.deadline)}</TableCell>
                      <TableCell><Badge className={`text-[10px] ${statusColors[q.status] || ""}`}>{q.status}</Badge></TableCell>
                      <TableCell>
                        {q.status === "חדש" ? (
                          <button className="flex items-center gap-1 text-xs bg-cyan-600/80 hover:bg-cyan-600 text-white px-2 py-1 rounded transition-colors">
                            <Send className="h-3 w-3" /> הגש הצעה
                          </button>
                        ) : q.status === "נבחר" ? (
                          <span className="text-xs text-emerald-400 flex items-center gap-1"><Award className="h-3 w-3" /> נבחרת!</span>
                        ) : q.status === "הוגש" ? (
                          <span className="text-xs text-indigo-400 flex items-center gap-1"><Clock className="h-3 w-3" /> בבדיקה</span>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Documents Tab ── */}
        <TabsContent value="documents">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-transparent">
                    <TableHead className="text-right text-muted-foreground">מסמך</TableHead>
                    <TableHead className="text-right text-muted-foreground">סוג</TableHead>
                    <TableHead className="text-right text-muted-foreground">סטטוס</TableHead>
                    <TableHead className="text-right text-muted-foreground">תוקף</TableHead>
                    <TableHead className="text-right text-muted-foreground">הועלה</TableHead>
                    <TableHead className="text-right text-muted-foreground">פעולה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map((d, i) => (
                    <TableRow key={i} className="border-slate-700/50 hover:bg-slate-700/30">
                      <TableCell className="text-sm font-medium">{d.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{d.type}</TableCell>
                      <TableCell><Badge className={`text-[10px] ${statusColors[d.status] || ""}`}>{d.status}</Badge></TableCell>
                      <TableCell className="text-sm">{d.expiry ? fmtDate(d.expiry) : "—"}</TableCell>
                      <TableCell className="text-sm">{d.uploaded ? fmtDate(d.uploaded) : "—"}</TableCell>
                      <TableCell>
                        {(d.status === "חסר" || d.status === "פג תוקף") ? (
                          <button className="flex items-center gap-1 text-xs bg-red-600/80 hover:bg-red-600 text-white px-2 py-1 rounded transition-colors">
                            <Upload className="h-3 w-3" /> העלה מסמך
                          </button>
                        ) : (
                          <span className="text-xs text-green-400 flex items-center gap-1"><FileCheck className="h-3 w-3" /> תקין</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Deliveries Tab ── */}
        <TabsContent value="deliveries">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-transparent">
                    <TableHead className="text-right text-muted-foreground">משלוח</TableHead>
                    <TableHead className="text-right text-muted-foreground">הזמנה</TableHead>
                    <TableHead className="text-right text-muted-foreground">פריטים</TableHead>
                    <TableHead className="text-right text-muted-foreground">כמות</TableHead>
                    <TableHead className="text-right text-muted-foreground">ETA</TableHead>
                    <TableHead className="text-right text-muted-foreground">מעקב</TableHead>
                    <TableHead className="text-right text-muted-foreground">התקדמות</TableHead>
                    <TableHead className="text-right text-muted-foreground">פעולה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveries.map((d) => (
                    <TableRow key={d.shipment} className="border-slate-700/50 hover:bg-slate-700/30">
                      <TableCell className="font-mono text-sm text-purple-300">{d.shipment}</TableCell>
                      <TableCell className="font-mono text-sm text-blue-300">{d.po}</TableCell>
                      <TableCell className="text-sm max-w-[160px] truncate">{d.items}</TableCell>
                      <TableCell className="text-sm font-mono">{d.qty}</TableCell>
                      <TableCell className="text-sm">{fmtDate(d.eta)}</TableCell>
                      <TableCell className="font-mono text-xs">{d.tracking || <span className="text-red-400">—</span>}</TableCell>
                      <TableCell className="w-[100px]">
                        <div className="flex items-center gap-2">
                          <Progress value={d.progress} className="h-2 flex-1" />
                          <span className="text-[10px] text-muted-foreground w-7">{d.progress}%</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {d.status === "התקבל" ? (
                          <span className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> נמסר</span>
                        ) : !d.tracking ? (
                          <button className="flex items-center gap-1 text-xs bg-purple-600/80 hover:bg-purple-600 text-white px-2 py-1 rounded transition-colors">
                            <Truck className="h-3 w-3" /> עדכן מעקב
                          </button>
                        ) : (
                          <button className="flex items-center gap-1 text-xs bg-slate-600/80 hover:bg-slate-600 text-white px-2 py-1 rounded transition-colors">
                            <Truck className="h-3 w-3" /> עדכן ETA
                          </button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Profile Tab ── */}
        <TabsContent value="profile">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-5 space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2"><Building2 className="h-5 w-5 text-blue-400" /> פרטי ספק</h3>
                {[
                  { label: "שם חברה", value: "אלומיניום ישראל בע״מ" },
                  { label: "ח.פ.", value: "51-456789-0" },
                  { label: "איש קשר", value: "דוד לוי — סמנכ״ל מכירות" },
                  { label: "טלפון", value: "04-8821234", icon: Phone },
                  { label: "דוא״ל", value: "david@aluminium-il.co.il", icon: Mail },
                  { label: "כתובת", value: "אזור תעשייה חדש, חיפה", icon: MapPin },
                  { label: "קטגוריה", value: "חומרי גלם — אלומיניום" },
                  { label: "דירוג", value: "A — ספק מועדף" },
                ].map((r, i) => (
                  <div key={i} className="flex justify-between items-center border-b border-slate-700/50 pb-2 last:border-0">
                    <span className="text-sm text-muted-foreground">{r.label}</span>
                    <span className="text-sm font-medium">{r.value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-5 space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2"><TrendingUp className="h-5 w-5 text-emerald-400" /> ביצועים</h3>
                {[
                  { label: "אחוז אספקה בזמן", value: 92, color: "bg-emerald-500" },
                  { label: "ציון איכות", value: 88, color: "bg-blue-500" },
                  { label: "תאימות מסמכים", value: 71, color: "bg-yellow-500" },
                  { label: "זמן תגובה ממוצע", value: 85, color: "bg-cyan-500" },
                  { label: "שביעות רצון כללית", value: 90, color: "bg-emerald-500" },
                ].map((m, i) => (
                  <div key={i}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-muted-foreground">{m.label}</span>
                      <span className="font-mono text-white">{m.value}%</span>
                    </div>
                    <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${m.color}`} style={{ width: `${m.value}%` }} />
                    </div>
                  </div>
                ))}
                <div className="pt-3 border-t border-slate-700 flex justify-between text-sm">
                  <span className="text-muted-foreground">סה״כ רכישות 2026</span>
                  <span className="font-mono text-emerald-400 font-bold">{fmt(1303400)}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
