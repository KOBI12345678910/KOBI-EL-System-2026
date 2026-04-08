import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Shield, Clock, CheckCircle, AlertTriangle, DollarSign, FileText, Ban, TruckIcon } from "lucide-react";

const fmt = (v: number) => "₪" + v.toLocaleString("he-IL");

const FALLBACK_STAGES = ["submitted", "review", "payment", "inspection", "release"] as const;
const stageLabel: Record<string, string> = { submitted: "הוגש", review: "בבדיקה", payment: "תשלום", inspection: "בדיקה פיזית", release: "שחרור" };
const stagePercent: Record<string, number> = { submitted: 20, review: 40, payment: 60, inspection: 80, release: 100 };

const FALLBACK_CUSTOMS_ENTRIES = [
  { id: "CE-4401", shipment: "SHP-1120", supplier: "Foshan Glass Co.", origin: "סין", port: "אשדוד", date: "2026-04-01", stage: "inspection", value: 184000, broker: "שמעון סחר בע\"מ" },
  { id: "CE-4402", shipment: "SHP-1121", supplier: "Schüco International", origin: "גרמניה", port: "חיפה", date: "2026-04-03", stage: "payment", value: 312000, broker: "גלובל לוגיסטיקה" },
  { id: "CE-4403", shipment: "SHP-1122", supplier: "Alumil SA", origin: "יוון", port: "אשדוד", date: "2026-04-05", stage: "review", value: 98500, broker: "שמעון סחר בע\"מ" },
  { id: "CE-4404", shipment: "SHP-1123", supplier: "Technal India", origin: "הודו", port: "חיפה", date: "2026-03-28", stage: "release", value: 67200, broker: "יבוא ישיר בע\"מ" },
  { id: "CE-4405", shipment: "SHP-1124", supplier: "YKK AP", origin: "יפן", port: "אשדוד", date: "2026-04-06", stage: "submitted", value: 145000, broker: "גלובל לוגיסטיקה" },
  { id: "CE-4406", shipment: "SHP-1125", supplier: "Reynaers Aluminium", origin: "בלגיה", port: "חיפה", date: "2026-04-02", stage: "inspection", value: 223000, broker: "שמעון סחר בע\"מ" },
  { id: "CE-4407", shipment: "SHP-1126", supplier: "Kawneer (Arconic)", origin: "ארה\"ב", port: "אשדוד", date: "2026-04-07", stage: "submitted", value: 176400, broker: "יבוא ישיר בע\"מ" },
  { id: "CE-4408", shipment: "SHP-1127", supplier: "Xingfa Aluminium", origin: "סין", port: "חיפה", date: "2026-03-30", stage: "payment", value: 89000, broker: "גלובל לוגיסטיקה" },
];

const FALLBACK_PAYMENTS = [
  { id: "PAY-801", shipment: "SHP-1120", duty: 14720, vat: 31280, portFees: 4200, brokerFees: 3800, total: 54000, status: "שולם" },
  { id: "PAY-802", shipment: "SHP-1121", duty: 24960, vat: 53040, portFees: 5800, brokerFees: 4500, total: 88300, status: "ממתין" },
  { id: "PAY-803", shipment: "SHP-1122", duty: 7880, vat: 16745, portFees: 3100, brokerFees: 3200, total: 30925, status: "ממתין" },
  { id: "PAY-804", shipment: "SHP-1123", duty: 5376, vat: 11424, portFees: 2800, brokerFees: 2900, total: 22500, status: "שולם" },
  { id: "PAY-805", shipment: "SHP-1124", duty: 11600, vat: 24650, portFees: 4100, brokerFees: 3600, total: 43950, status: "ממתין" },
  { id: "PAY-806", shipment: "SHP-1125", duty: 17840, vat: 37910, portFees: 5200, brokerFees: 4100, total: 65050, status: "שולם" },
  { id: "PAY-807", shipment: "SHP-1126", duty: 14112, vat: 29988, portFees: 4500, brokerFees: 3700, total: 52300, status: "ממתין" },
  { id: "PAY-808", shipment: "SHP-1127", duty: 7120, vat: 15130, portFees: 3000, brokerFees: 3100, total: 28350, status: "שולם" },
];

const FALLBACK_DOCUMENTS = [
  { shipment: "SHP-1120", invoice: true, packingList: true, bl: true, coo: true, insurance: true, customsDecl: false, phyto: false, importLicense: true },
  { shipment: "SHP-1121", invoice: true, packingList: true, bl: true, coo: true, insurance: true, customsDecl: true, phyto: true, importLicense: true },
  { shipment: "SHP-1122", invoice: true, packingList: false, bl: true, coo: false, insurance: true, customsDecl: false, phyto: false, importLicense: true },
  { shipment: "SHP-1123", invoice: true, packingList: true, bl: true, coo: true, insurance: true, customsDecl: true, phyto: true, importLicense: true },
  { shipment: "SHP-1124", invoice: true, packingList: true, bl: false, coo: true, insurance: false, customsDecl: false, phyto: false, importLicense: false },
  { shipment: "SHP-1125", invoice: true, packingList: true, bl: true, coo: true, insurance: true, customsDecl: true, phyto: false, importLicense: true },
  { shipment: "SHP-1126", invoice: true, packingList: true, bl: true, coo: false, insurance: true, customsDecl: false, phyto: false, importLicense: true },
  { shipment: "SHP-1127", invoice: true, packingList: true, bl: true, coo: true, insurance: true, customsDecl: true, phyto: true, importLicense: true },
];

const docLabels: Record<string, string> = {
  invoice: "חשבונית ספק", packingList: "רשימת אריזה", bl: "שטר מטען", coo: "תעודת מקור",
  insurance: "פוליסת ביטוח", customsDecl: "הצהרת מכס", phyto: "תעודה פיטוסניטרית", importLicense: "רישיון יבוא",
};

const FALLBACK_EXCEPTIONS = [
  { id: "EXC-301", shipment: "SHP-1120", type: "עיכוב בדיקה", reason: "דגימת חומרים לבדיקת מעבדה", opened: "2026-04-05", status: "פתוח", severity: "medium" },
  { id: "EXC-302", shipment: "SHP-1122", type: "מסמך חסר", reason: "תעודת מקור לא הומצאה מהספק", opened: "2026-04-06", status: "פתוח", severity: "high" },
  { id: "EXC-303", shipment: "SHP-1124", type: "סיווג מכס", reason: "מחלוקת על קוד HS - 7610.10 vs 7610.90", opened: "2026-04-07", status: "פתוח", severity: "high" },
  { id: "EXC-304", shipment: "SHP-1121", type: "תשלום עודף", reason: "חישוב מכס כפול על אביזרי התקנה", opened: "2026-04-03", status: "טופל", severity: "low" },
  { id: "EXC-305", shipment: "SHP-1125", type: "עיכוב נמל", reason: "גודש בנמל חיפה - המתנה לפריקה", opened: "2026-04-04", status: "טופל", severity: "medium" },
  { id: "EXC-306", shipment: "SHP-1126", type: "בדיקת תקן", reason: "דרישת בדיקת מכון התקנים SI-1474", opened: "2026-04-07", status: "פתוח", severity: "high" },
];

const severityBadge = (s: string) => {
  switch (s) {
    case "high": return <Badge className="bg-red-500/20 text-red-400">גבוה</Badge>;
    case "medium": return <Badge className="bg-amber-500/20 text-amber-400">בינוני</Badge>;
    case "low": return <Badge className="bg-green-500/20 text-green-400">נמוך</Badge>;
    default: return null;
  }
};

const stageBadge = (stage: string) => {
  switch (stage) {
    case "submitted": return <Badge className="bg-gray-500/20 text-gray-400">הוגש</Badge>;
    case "review": return <Badge className="bg-blue-500/20 text-blue-400">בבדיקה</Badge>;
    case "payment": return <Badge className="bg-amber-500/20 text-amber-400">תשלום</Badge>;
    case "inspection": return <Badge className="bg-purple-500/20 text-purple-400">בדיקה</Badge>;
    case "release": return <Badge className="bg-green-500/20 text-green-400">שוחרר</Badge>;
    default: return null;
  }
};

export default function CustomsClearance() {
  const { data: stages = FALLBACK_STAGES } = useQuery({
    queryKey: ["import-stages"],
    queryFn: async () => {
      const res = await authFetch("/api/import/customs-clearance/stages");
      if (!res.ok) return FALLBACK_STAGES;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_STAGES;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: customsEntries = FALLBACK_CUSTOMS_ENTRIES } = useQuery({
    queryKey: ["import-customs-entries"],
    queryFn: async () => {
      const res = await authFetch("/api/import/customs-clearance/customs-entries");
      if (!res.ok) return FALLBACK_CUSTOMS_ENTRIES;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_CUSTOMS_ENTRIES;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: payments = FALLBACK_PAYMENTS } = useQuery({
    queryKey: ["import-payments"],
    queryFn: async () => {
      const res = await authFetch("/api/import/customs-clearance/payments");
      if (!res.ok) return FALLBACK_PAYMENTS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_PAYMENTS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: documents = FALLBACK_DOCUMENTS } = useQuery({
    queryKey: ["import-documents"],
    queryFn: async () => {
      const res = await authFetch("/api/import/customs-clearance/documents");
      if (!res.ok) return FALLBACK_DOCUMENTS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_DOCUMENTS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: exceptions = FALLBACK_EXCEPTIONS } = useQuery({
    queryKey: ["import-exceptions"],
    queryFn: async () => {
      const res = await authFetch("/api/import/customs-clearance/exceptions");
      if (!res.ok) return FALLBACK_EXCEPTIONS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_EXCEPTIONS;
    },
    staleTime: 30_000,
    retry: 1,
  });


  const [tab, setTab] = useState("entries");

  const inCustomsNow = customsEntries.filter(e => e.stage !== "release").length;
  const clearedMonth = customsEntries.filter(e => e.stage === "release").length;
  const avgDays = 5.3;
  const totalDuties = payments.reduce((s, p) => s + p.duty, 0);
  const pendingPayments = payments.filter(p => p.status === "ממתין").reduce((s, p) => s + p.total, 0);
  const openExceptions = exceptions.filter(e => e.status === "פתוח").length;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <Shield className="h-7 w-7 text-blue-400" />
        <h1 className="text-2xl font-bold">מכס ושחרור</h1>
        <Badge variant="outline" className="mr-auto text-xs text-muted-foreground">טכנו-כל עוזי</Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="bg-slate-900 border-slate-700">
          <CardContent className="pt-5 text-center">
            <Clock className="h-5 w-5 mx-auto text-amber-400 mb-1" />
            <p className="text-xs text-slate-400">במכס כעת</p>
            <p className="text-2xl font-bold text-amber-400">{inCustomsNow}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-700">
          <CardContent className="pt-5 text-center">
            <CheckCircle className="h-5 w-5 mx-auto text-green-400 mb-1" />
            <p className="text-xs text-slate-400">שוחררו החודש</p>
            <p className="text-2xl font-bold text-green-400">{clearedMonth}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-700">
          <CardContent className="pt-5 text-center">
            <TruckIcon className="h-5 w-5 mx-auto text-blue-400 mb-1" />
            <p className="text-xs text-slate-400">ממוצע ימי שחרור</p>
            <p className="text-2xl font-bold text-blue-400">{avgDays}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-700">
          <CardContent className="pt-5 text-center">
            <DollarSign className="h-5 w-5 mx-auto text-purple-400 mb-1" />
            <p className="text-xs text-slate-400">סה״כ מכס ששולם</p>
            <p className="text-xl font-bold text-purple-400">{fmt(totalDuties)}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-700">
          <CardContent className="pt-5 text-center">
            <AlertTriangle className="h-5 w-5 mx-auto text-red-400 mb-1" />
            <p className="text-xs text-slate-400">תשלומים ממתינים</p>
            <p className="text-xl font-bold text-red-400">{fmt(pendingPayments)}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-700">
          <CardContent className="pt-5 text-center">
            <Ban className="h-5 w-5 mx-auto text-orange-400 mb-1" />
            <p className="text-xs text-slate-400">חריגות פתוחות</p>
            <p className="text-2xl font-bold text-orange-400">{openExceptions}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-slate-800">
          <TabsTrigger value="entries">בשחרור</TabsTrigger>
          <TabsTrigger value="payments">תשלומים</TabsTrigger>
          <TabsTrigger value="documents">מסמכים</TabsTrigger>
          <TabsTrigger value="exceptions">חריגות</TabsTrigger>
        </TabsList>

        {/* ====== Customs Entries ====== */}
        <TabsContent value="entries">
          <Card className="bg-slate-900 border-slate-700">
            <CardHeader><CardTitle className="text-base">רשומות מכס פעילות</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-right text-slate-400">מס׳ רשומה</TableHead>
                    <TableHead className="text-right text-slate-400">משלוח</TableHead>
                    <TableHead className="text-right text-slate-400">ספק</TableHead>
                    <TableHead className="text-right text-slate-400">מקור</TableHead>
                    <TableHead className="text-right text-slate-400">נמל</TableHead>
                    <TableHead className="text-right text-slate-400">שווי</TableHead>
                    <TableHead className="text-right text-slate-400">שלב</TableHead>
                    <TableHead className="text-right text-slate-400">התקדמות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customsEntries.map(e => (
                    <TableRow key={e.id} className="border-slate-800 hover:bg-slate-800/50">
                      <TableCell className="font-mono text-sm">{e.id}</TableCell>
                      <TableCell className="text-sm">{e.shipment}</TableCell>
                      <TableCell className="text-sm">{e.supplier}</TableCell>
                      <TableCell className="text-sm">{e.origin}</TableCell>
                      <TableCell className="text-sm">{e.port}</TableCell>
                      <TableCell className="text-sm font-medium">{fmt(e.value)}</TableCell>
                      <TableCell>{stageBadge(e.stage)}</TableCell>
                      <TableCell className="w-32">
                        <Progress value={stagePercent[e.stage]} className="h-2" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ====== Payments ====== */}
        <TabsContent value="payments">
          <Card className="bg-slate-900 border-slate-700">
            <CardHeader><CardTitle className="text-base">תשלומי מכס</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-right text-slate-400">מס׳ תשלום</TableHead>
                    <TableHead className="text-right text-slate-400">משלוח</TableHead>
                    <TableHead className="text-right text-slate-400">מכס</TableHead>
                    <TableHead className="text-right text-slate-400">מע״מ</TableHead>
                    <TableHead className="text-right text-slate-400">עמלות נמל</TableHead>
                    <TableHead className="text-right text-slate-400">עמלת סוכן</TableHead>
                    <TableHead className="text-right text-slate-400">סה״כ</TableHead>
                    <TableHead className="text-right text-slate-400">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map(p => (
                    <TableRow key={p.id} className="border-slate-800 hover:bg-slate-800/50">
                      <TableCell className="font-mono text-sm">{p.id}</TableCell>
                      <TableCell className="text-sm">{p.shipment}</TableCell>
                      <TableCell className="text-sm">{fmt(p.duty)}</TableCell>
                      <TableCell className="text-sm">{fmt(p.vat)}</TableCell>
                      <TableCell className="text-sm">{fmt(p.portFees)}</TableCell>
                      <TableCell className="text-sm">{fmt(p.brokerFees)}</TableCell>
                      <TableCell className="text-sm font-bold">{fmt(p.total)}</TableCell>
                      <TableCell>
                        {p.status === "שולם"
                          ? <Badge className="bg-green-500/20 text-green-400">שולם</Badge>
                          : <Badge className="bg-amber-500/20 text-amber-400">ממתין</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ====== Documents Checklist ====== */}
        <TabsContent value="documents">
          <Card className="bg-slate-900 border-slate-700">
            <CardHeader><CardTitle className="text-base">רשימת מסמכים לשחרור</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-right text-slate-400">משלוח</TableHead>
                    {Object.values(docLabels).map(l => (
                      <TableHead key={l} className="text-right text-slate-400 text-xs">{l}</TableHead>
                    ))}
                    <TableHead className="text-right text-slate-400">השלמה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map(d => {
                    const keys = Object.keys(docLabels) as (keyof typeof d)[];
                    const total = keys.length;
                    const done = keys.filter(k => d[k] === true).length;
                    const pct = Math.round((done / total) * 100);
                    return (
                      <TableRow key={d.shipment} className="border-slate-800 hover:bg-slate-800/50">
                        <TableCell className="text-sm font-mono">{d.shipment}</TableCell>
                        {keys.map(k => (
                          <TableCell key={k} className="text-center">
                            {d[k]
                              ? <CheckCircle className="h-4 w-4 text-green-400 inline-block" />
                              : <AlertTriangle className="h-4 w-4 text-red-400 inline-block" />}
                          </TableCell>
                        ))}
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={pct} className="h-2 w-16" />
                            <span className="text-xs text-slate-400">{pct}%</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ====== Exceptions ====== */}
        <TabsContent value="exceptions">
          <Card className="bg-slate-900 border-slate-700">
            <CardHeader><CardTitle className="text-base">חריגות ועיכובים</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-right text-slate-400">מס׳ חריגה</TableHead>
                    <TableHead className="text-right text-slate-400">משלוח</TableHead>
                    <TableHead className="text-right text-slate-400">סוג</TableHead>
                    <TableHead className="text-right text-slate-400">סיבה</TableHead>
                    <TableHead className="text-right text-slate-400">נפתח</TableHead>
                    <TableHead className="text-right text-slate-400">חומרה</TableHead>
                    <TableHead className="text-right text-slate-400">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exceptions.map(ex => (
                    <TableRow key={ex.id} className="border-slate-800 hover:bg-slate-800/50">
                      <TableCell className="font-mono text-sm">{ex.id}</TableCell>
                      <TableCell className="text-sm">{ex.shipment}</TableCell>
                      <TableCell className="text-sm">{ex.type}</TableCell>
                      <TableCell className="text-sm max-w-[260px] truncate">{ex.reason}</TableCell>
                      <TableCell className="text-sm">{ex.opened}</TableCell>
                      <TableCell>{severityBadge(ex.severity)}</TableCell>
                      <TableCell>
                        {ex.status === "פתוח"
                          ? <Badge className="bg-red-500/20 text-red-400">פתוח</Badge>
                          : <Badge className="bg-green-500/20 text-green-400">טופל</Badge>}
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
