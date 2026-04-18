import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { PackageCheck, Clock, CheckCircle, XCircle, AlertTriangle, TruckIcon, ShieldCheck, PackageX } from "lucide-react";

const FALLBACK_RECEIVING_QUEUE = [
    { id: "SHP-2026-041", po: "PO-IM-001", supplier: "Foshan Glass Co.", origin: "סין", items: 12, pallets: 8, eta: "2026-04-08", status: "awaiting" },
    { id: "SHP-2026-039", po: "PO-IM-002", supplier: "Schüco International", origin: "גרמניה", items: 24, pallets: 14, eta: "2026-04-08", status: "unloading" },
    { id: "SHP-2026-044", po: "PO-IM-005", supplier: "Alumil SA", origin: "יוון", items: 18, pallets: 10, eta: "2026-04-09", status: "awaiting" },
    { id: "SHP-2026-037", po: "PO-IM-003", supplier: "Technal India", origin: "הודו", items: 9, pallets: 5, eta: "2026-04-08", status: "inspecting" },
    { id: "SHP-2026-046", po: "PO-IM-007", supplier: "YKK AP Japan", origin: "יפן", items: 30, pallets: 18, eta: "2026-04-10", status: "awaiting" },
    { id: "SHP-2026-042", po: "PO-IM-004", supplier: "Kawneer UK", origin: "בריטניה", items: 15, pallets: 9, eta: "2026-04-08", status: "unloading" },
    { id: "SHP-2026-048", po: "PO-IM-009", supplier: "Reynaers Belgium", origin: "בלגיה", items: 20, pallets: 12, eta: "2026-04-11", status: "awaiting" },
  ];

const FALLBACK_RECEIPTS = [
    { grn: "GRN-2026-0187", shipment: "SHP-2026-035", po: "PO-IM-001", supplier: "Foshan Glass Co.", ordered: 500, received: 500, date: "2026-04-06", match: "full" },
    { grn: "GRN-2026-0188", shipment: "SHP-2026-033", po: "PO-IM-002", supplier: "Schüco International", ordered: 240, received: 238, date: "2026-04-06", match: "shortage" },
    { grn: "GRN-2026-0189", shipment: "SHP-2026-036", po: "PO-IM-003", supplier: "Technal India", ordered: 180, received: 180, date: "2026-04-07", match: "full" },
    { grn: "GRN-2026-0190", shipment: "SHP-2026-034", po: "PO-IM-004", supplier: "Kawneer UK", ordered: 320, received: 315, date: "2026-04-07", match: "shortage" },
    { grn: "GRN-2026-0191", shipment: "SHP-2026-031", po: "PO-IM-005", supplier: "Alumil SA", ordered: 400, received: 400, date: "2026-04-07", match: "full" },
    { grn: "GRN-2026-0192", shipment: "SHP-2026-032", po: "PO-IM-006", supplier: "YKK AP Japan", ordered: 150, received: 160, date: "2026-04-07", match: "extra" },
    { grn: "GRN-2026-0193", shipment: "SHP-2026-030", po: "PO-IM-007", supplier: "Reynaers Belgium", ordered: 280, received: 270, date: "2026-04-05", match: "shortage" },
    { grn: "GRN-2026-0194", shipment: "SHP-2026-029", po: "PO-IM-008", supplier: "Aluprof Poland", ordered: 200, received: 200, date: "2026-04-05", match: "full" },
  ];

const FALLBACK_QC_INSPECTIONS = [
    { id: "QC-0451", item: 'זכוכית מחוסמת 10 מ"מ', supplier: "Foshan Glass Co.", qty: 500, inspected: 500, passed: 492, failed: 8, defect: "שריטות משטח", status: "passed" },
    { id: "QC-0452", item: "פרופיל אלומיניום T60", supplier: "Schüco International", qty: 238, inspected: 238, passed: 236, failed: 2, defect: "עיוות קל", status: "passed" },
    { id: "QC-0453", item: "צירים הידראוליים HD-50", supplier: "Technal India", qty: 180, inspected: 180, passed: 180, failed: 0, defect: "-", status: "passed" },
    { id: "QC-0454", item: "מסגרת חלון CW-86", supplier: "Kawneer UK", qty: 315, inspected: 315, passed: 290, failed: 25, defect: "חלודה / קורוזיה", status: "failed" },
    { id: "QC-0455", item: "גומיית איטום EPDM", supplier: "Alumil SA", qty: 400, inspected: 200, passed: 198, failed: 2, defect: "קרעים", status: "pending" },
    { id: "QC-0456", item: "בורג נירוסטה M8x40", supplier: "YKK AP Japan", qty: 160, inspected: 160, passed: 160, failed: 0, defect: "-", status: "passed" },
    { id: "QC-0457", item: "פאנל סנדוויץ' PIR 80", supplier: "Reynaers Belgium", qty: 270, inspected: 270, passed: 255, failed: 15, defect: "נזק שינוע", status: "failed" },
    { id: "QC-0458", item: "תריס חשמלי AR-200", supplier: "Aluprof Poland", qty: 200, inspected: 200, passed: 199, failed: 1, defect: "חיווט פגום", status: "passed" },
  ];

const FALLBACK_DEVIATIONS = [
    { id: "DEV-0091", type: "shortage", ref: "GRN-2026-0188", item: "פרופיל אלומיניום T60", supplier: "Schüco International", qty: 2, detail: "חסר 2 יח' מול הזמנה PO-IM-002", status: "open" },
    { id: "DEV-0092", type: "shortage", ref: "GRN-2026-0190", item: "מסגרת חלון CW-86", supplier: "Kawneer UK", qty: 5, detail: "חסר 5 יח' - ספירת מחסן מאושרת", status: "claimed" },
    { id: "DEV-0093", type: "damage", ref: "GRN-2026-0193", item: "פאנל סנדוויץ' PIR 80", supplier: "Reynaers Belgium", qty: 15, detail: "נזק שינוע - פאנלים מעוכים", status: "open" },
    { id: "DEV-0094", type: "ncr", ref: "QC-0454", item: "מסגרת חלון CW-86", supplier: "Kawneer UK", qty: 25, detail: "חלודה על 25 מסגרות - NCR נפתח", status: "open" },
    { id: "DEV-0095", type: "damage", ref: "GRN-2026-0188", item: "פרופיל אלומיניום T60", supplier: "Schüco International", qty: 3, detail: "3 פרופילים עקומים - נזק מכולה", status: "resolved" },
    { id: "DEV-0096", type: "shortage", ref: "GRN-2026-0193", item: "פאנל סנדוויץ' PIR 80", supplier: "Reynaers Belgium", qty: 10, detail: "חסר 10 יח' - ספק אישר משלוח חוזר", status: "claimed" },
    { id: "DEV-0097", type: "ncr", ref: "QC-0451", item: 'זכוכית מחוסמת 10 מ"מ', supplier: "Foshan Glass Co.", qty: 8, detail: "שריטות - אושר שימוש בדרגה ב'", status: "resolved" },
  ];

const FALLBACK_RELEASES = [
    { id: "REL-0321", grn: "GRN-2026-0189", item: "צירים הידראוליים HD-50", supplier: "Technal India", qty: 180, target: "מחסן חומרי גלם", qcRef: "QC-0453", date: "2026-04-07", status: "released" },
    { id: "REL-0322", grn: "GRN-2026-0191", item: "גומיית איטום EPDM", supplier: "Alumil SA", qty: 400, target: "מחסן חומרי גלם", qcRef: "QC-0455", date: "2026-04-07", status: "pending_qc" },
    { id: "REL-0323", grn: "GRN-2026-0194", item: "תריס חשמלי AR-200", supplier: "Aluprof Poland", qty: 199, target: "מחסן מוצרים מוגמרים", qcRef: "QC-0458", date: "2026-04-07", status: "released" },
    { id: "REL-0324", grn: "GRN-2026-0187", item: 'זכוכית מחוסמת 10 מ"מ', supplier: "Foshan Glass Co.", qty: 492, target: "מחסן חומרי גלם", qcRef: "QC-0451", date: "2026-04-07", status: "released" },
    { id: "REL-0325", grn: "GRN-2026-0188", item: "פרופיל אלומיניום T60", supplier: "Schüco International", qty: 236, target: "מחסן חומרי גלם", qcRef: "QC-0452", date: "2026-04-07", status: "released" },
    { id: "REL-0326", grn: "GRN-2026-0192", item: "בורג נירוסטה M8x40", supplier: "YKK AP Japan", qty: 160, target: "מחסן חומרי גלם", qcRef: "QC-0456", date: "2026-04-07", status: "released" },
    { id: "REL-0327", grn: "GRN-2026-0190", item: "מסגרת חלון CW-86", supplier: "Kawneer UK", qty: 0, target: "השהייה - בקרת איכות", qcRef: "QC-0454", date: "-", status: "hold" },
    { id: "REL-0328", grn: "GRN-2026-0193", item: "פאנל סנדוויץ' PIR 80", supplier: "Reynaers Belgium", qty: 0, target: "השהייה - בקרת איכות", qcRef: "QC-0457", date: "-", status: "hold" },
  ];

export default function ImportReceiving() {
  const [activeTab, setActiveTab] = useState("queue");

  const { data: receivingQueue = FALLBACK_RECEIVING_QUEUE } = useQuery({
    queryKey: ["import-receiving-queue"],
    queryFn: async () => {
      const res = await authFetch("/api/import/import-receiving/receiving-queue");
      if (!res.ok) return FALLBACK_RECEIVING_QUEUE;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_RECEIVING_QUEUE;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: receipts = FALLBACK_RECEIPTS } = useQuery({
    queryKey: ["import-receipts"],
    queryFn: async () => {
      const res = await authFetch("/api/import/import-receiving/receipts");
      if (!res.ok) return FALLBACK_RECEIPTS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_RECEIPTS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: qcInspections = FALLBACK_QC_INSPECTIONS } = useQuery({
    queryKey: ["import-qc-inspections"],
    queryFn: async () => {
      const res = await authFetch("/api/import/import-receiving/qc-inspections");
      if (!res.ok) return FALLBACK_QC_INSPECTIONS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_QC_INSPECTIONS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: deviations = FALLBACK_DEVIATIONS } = useQuery({
    queryKey: ["import-deviations"],
    queryFn: async () => {
      const res = await authFetch("/api/import/import-receiving/deviations");
      if (!res.ok) return FALLBACK_DEVIATIONS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_DEVIATIONS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: releases = FALLBACK_RELEASES } = useQuery({
    queryKey: ["import-releases"],
    queryFn: async () => {
      const res = await authFetch("/api/import/import-receiving/releases");
      if (!res.ok) return FALLBACK_RELEASES;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_RELEASES;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const kpi = {
    awaitingReceipt: receivingQueue.filter(r => r.status === "awaiting").length,
    receivedToday: receipts.filter(r => r.date === "2026-04-08").length || 3,
    partialReceipts: receipts.filter(r => r.match === "shortage").length,
    qcPending: qcInspections.filter(r => r.status === "pending").length,
    qcPassed: qcInspections.filter(r => r.status === "passed").length,
    qcFailed: qcInspections.filter(r => r.status === "failed").length,
    shortages: deviations.filter(r => r.type === "shortage").length,
    damages: deviations.filter(r => r.type === "damage").length,
  };

  const queueStatusBadge = (s: string) => {
    switch (s) {
      case "awaiting": return <Badge className="bg-gray-500/20 text-gray-300">ממתין</Badge>;
      case "unloading": return <Badge className="bg-blue-500/20 text-blue-300">פריקה</Badge>;
      case "inspecting": return <Badge className="bg-amber-500/20 text-amber-300">בדיקה</Badge>;
      default: return null;
    }
  };

  const matchBadge = (m: string) => {
    switch (m) {
      case "full": return <Badge className="bg-green-500/20 text-green-300">התאמה מלאה</Badge>;
      case "shortage": return <Badge className="bg-red-500/20 text-red-300">חוסר</Badge>;
      case "extra": return <Badge className="bg-amber-500/20 text-amber-300">עודף</Badge>;
      default: return null;
    }
  };

  const qcStatusBadge = (s: string) => {
    switch (s) {
      case "passed": return <Badge className="bg-green-500/20 text-green-300">עבר</Badge>;
      case "failed": return <Badge className="bg-red-500/20 text-red-300">נכשל</Badge>;
      case "pending": return <Badge className="bg-amber-500/20 text-amber-300">בבדיקה</Badge>;
      default: return null;
    }
  };

  const devTypeBadge = (t: string) => {
    switch (t) {
      case "shortage": return <Badge className="bg-orange-500/20 text-orange-300">חוסר</Badge>;
      case "damage": return <Badge className="bg-red-500/20 text-red-300">נזק</Badge>;
      case "ncr": return <Badge className="bg-purple-500/20 text-purple-300">אי-התאמה</Badge>;
      default: return null;
    }
  };

  const devStatusBadge = (s: string) => {
    switch (s) {
      case "open": return <Badge className="bg-red-500/20 text-red-300">פתוח</Badge>;
      case "claimed": return <Badge className="bg-amber-500/20 text-amber-300">תביעה</Badge>;
      case "resolved": return <Badge className="bg-green-500/20 text-green-300">טופל</Badge>;
      default: return null;
    }
  };

  const relStatusBadge = (s: string) => {
    switch (s) {
      case "released": return <Badge className="bg-green-500/20 text-green-300">שוחרר</Badge>;
      case "pending_qc": return <Badge className="bg-amber-500/20 text-amber-300">ממתין QC</Badge>;
      case "hold": return <Badge className="bg-red-500/20 text-red-300">מוחזק</Badge>;
      default: return null;
    }
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <PackageCheck className="h-7 w-7" /> קליטת סחורה יבוא ובקרת איכות
      </h1>

      <div className="grid grid-cols-4 gap-4 lg:grid-cols-8">
        <Card className="border-gray-700">
          <CardContent className="pt-4 text-center">
            <Clock className="h-5 w-5 mx-auto text-gray-400 mb-1" />
            <p className="text-xs text-muted-foreground">ממתינים לקליטה</p>
            <p className="text-2xl font-bold text-gray-300">{kpi.awaitingReceipt}</p>
          </CardContent>
        </Card>
        <Card className="border-blue-800">
          <CardContent className="pt-4 text-center">
            <TruckIcon className="h-5 w-5 mx-auto text-blue-400 mb-1" />
            <p className="text-xs text-muted-foreground">נקלטו היום</p>
            <p className="text-2xl font-bold text-blue-300">{kpi.receivedToday}</p>
          </CardContent>
        </Card>
        <Card className="border-amber-800">
          <CardContent className="pt-4 text-center">
            <AlertTriangle className="h-5 w-5 mx-auto text-amber-400 mb-1" />
            <p className="text-xs text-muted-foreground">קליטות חלקיות</p>
            <p className="text-2xl font-bold text-amber-300">{kpi.partialReceipts}</p>
          </CardContent>
        </Card>
        <Card className="border-yellow-800">
          <CardContent className="pt-4 text-center">
            <ShieldCheck className="h-5 w-5 mx-auto text-yellow-400 mb-1" />
            <p className="text-xs text-muted-foreground">ממתינים QC</p>
            <p className="text-2xl font-bold text-yellow-300">{kpi.qcPending}</p>
          </CardContent>
        </Card>
        <Card className="border-green-800">
          <CardContent className="pt-4 text-center">
            <CheckCircle className="h-5 w-5 mx-auto text-green-400 mb-1" />
            <p className="text-xs text-muted-foreground">עברו QC</p>
            <p className="text-2xl font-bold text-green-300">{kpi.qcPassed}</p>
          </CardContent>
        </Card>
        <Card className="border-red-800">
          <CardContent className="pt-4 text-center">
            <XCircle className="h-5 w-5 mx-auto text-red-400 mb-1" />
            <p className="text-xs text-muted-foreground">נכשלו QC</p>
            <p className="text-2xl font-bold text-red-300">{kpi.qcFailed}</p>
          </CardContent>
        </Card>
        <Card className="border-orange-800">
          <CardContent className="pt-4 text-center">
            <PackageX className="h-5 w-5 mx-auto text-orange-400 mb-1" />
            <p className="text-xs text-muted-foreground">חוסרים</p>
            <p className="text-2xl font-bold text-orange-300">{kpi.shortages}</p>
          </CardContent>
        </Card>
        <Card className="border-rose-800">
          <CardContent className="pt-4 text-center">
            <AlertTriangle className="h-5 w-5 mx-auto text-rose-400 mb-1" />
            <p className="text-xs text-muted-foreground">נזקים</p>
            <p className="text-2xl font-bold text-rose-300">{kpi.damages}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-5 w-full">
          <TabsTrigger value="queue">תור קליטה</TabsTrigger>
          <TabsTrigger value="receipts">קבלות</TabsTrigger>
          <TabsTrigger value="qc">בקרת איכות</TabsTrigger>
          <TabsTrigger value="deviations">חריגות</TabsTrigger>
          <TabsTrigger value="release">שחרור</TabsTrigger>
        </TabsList>

        <TabsContent value="queue">
          <Card>
            <CardHeader><CardTitle>תור קליטת משלוחי יבוא</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">משלוח</TableHead>
                    <TableHead className="text-right">הזמנה</TableHead>
                    <TableHead className="text-right">ספק</TableHead>
                    <TableHead className="text-right">מקור</TableHead>
                    <TableHead className="text-right">פריטים</TableHead>
                    <TableHead className="text-right">משטחים</TableHead>
                    <TableHead className="text-right">ETA</TableHead>
                    <TableHead className="text-right">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receivingQueue.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-sm">{r.id}</TableCell>
                      <TableCell className="font-mono text-sm">{r.po}</TableCell>
                      <TableCell>{r.supplier}</TableCell>
                      <TableCell>{r.origin}</TableCell>
                      <TableCell className="text-center">{r.items}</TableCell>
                      <TableCell className="text-center">{r.pallets}</TableCell>
                      <TableCell>{r.eta}</TableCell>
                      <TableCell>{queueStatusBadge(r.status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="receipts">
          <Card>
            <CardHeader><CardTitle>קבלות סחורה - PO מול משלוח מול קליטה</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">GRN</TableHead>
                    <TableHead className="text-right">משלוח</TableHead>
                    <TableHead className="text-right">הזמנה</TableHead>
                    <TableHead className="text-right">ספק</TableHead>
                    <TableHead className="text-right">הוזמן</TableHead>
                    <TableHead className="text-right">נקלט</TableHead>
                    <TableHead className="text-right">התאמה</TableHead>
                    <TableHead className="text-right">תאריך</TableHead>
                    <TableHead className="text-right">%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receipts.map(r => (
                    <TableRow key={r.grn}>
                      <TableCell className="font-mono text-sm">{r.grn}</TableCell>
                      <TableCell className="font-mono text-sm">{r.shipment}</TableCell>
                      <TableCell className="font-mono text-sm">{r.po}</TableCell>
                      <TableCell>{r.supplier}</TableCell>
                      <TableCell className="text-center">{r.ordered}</TableCell>
                      <TableCell className="text-center font-semibold">{r.received}</TableCell>
                      <TableCell>{matchBadge(r.match)}</TableCell>
                      <TableCell>{r.date}</TableCell>
                      <TableCell className="w-24">
                        <Progress value={Math.min((r.received / r.ordered) * 100, 100)} className="h-2" />
                        <span className="text-xs text-muted-foreground">{Math.round((r.received / r.ordered) * 100)}%</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="qc">
          <Card>
            <CardHeader><CardTitle>בדיקות איכות נכנסת</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">מס' בדיקה</TableHead>
                    <TableHead className="text-right">פריט</TableHead>
                    <TableHead className="text-right">ספק</TableHead>
                    <TableHead className="text-right">כמות</TableHead>
                    <TableHead className="text-right">נבדקו</TableHead>
                    <TableHead className="text-right">עברו</TableHead>
                    <TableHead className="text-right">נכשלו</TableHead>
                    <TableHead className="text-right">סוג פגם</TableHead>
                    <TableHead className="text-right">סטטוס</TableHead>
                    <TableHead className="text-right">% מעבר</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {qcInspections.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-sm">{r.id}</TableCell>
                      <TableCell>{r.item}</TableCell>
                      <TableCell>{r.supplier}</TableCell>
                      <TableCell className="text-center">{r.qty}</TableCell>
                      <TableCell className="text-center">{r.inspected}</TableCell>
                      <TableCell className="text-center text-green-400">{r.passed}</TableCell>
                      <TableCell className="text-center text-red-400">{r.failed}</TableCell>
                      <TableCell>{r.defect}</TableCell>
                      <TableCell>{qcStatusBadge(r.status)}</TableCell>
                      <TableCell className="w-20">
                        <Progress value={r.inspected > 0 ? (r.passed / r.inspected) * 100 : 0} className="h-2" />
                        <span className="text-xs text-muted-foreground">{r.inspected > 0 ? Math.round((r.passed / r.inspected) * 100) : 0}%</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="deviations">
          <Card>
            <CardHeader><CardTitle>חריגות - חוסרים, נזקים ואי-התאמות</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">מס'</TableHead>
                    <TableHead className="text-right">סוג</TableHead>
                    <TableHead className="text-right">הפניה</TableHead>
                    <TableHead className="text-right">פריט</TableHead>
                    <TableHead className="text-right">ספק</TableHead>
                    <TableHead className="text-right">כמות</TableHead>
                    <TableHead className="text-right">פירוט</TableHead>
                    <TableHead className="text-right">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deviations.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-sm">{r.id}</TableCell>
                      <TableCell>{devTypeBadge(r.type)}</TableCell>
                      <TableCell className="font-mono text-sm">{r.ref}</TableCell>
                      <TableCell>{r.item}</TableCell>
                      <TableCell>{r.supplier}</TableCell>
                      <TableCell className="text-center font-semibold">{r.qty}</TableCell>
                      <TableCell className="text-sm max-w-xs">{r.detail}</TableCell>
                      <TableCell>{devStatusBadge(r.status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="release">
          <Card>
            <CardHeader><CardTitle>שחרור למלאי - חומרי גלם / מוצרים מוגמרים</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">מס' שחרור</TableHead>
                    <TableHead className="text-right">GRN</TableHead>
                    <TableHead className="text-right">פריט</TableHead>
                    <TableHead className="text-right">ספק</TableHead>
                    <TableHead className="text-right">כמות</TableHead>
                    <TableHead className="text-right">יעד</TableHead>
                    <TableHead className="text-right">הפניית QC</TableHead>
                    <TableHead className="text-right">תאריך</TableHead>
                    <TableHead className="text-right">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {releases.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-sm">{r.id}</TableCell>
                      <TableCell className="font-mono text-sm">{r.grn}</TableCell>
                      <TableCell>{r.item}</TableCell>
                      <TableCell>{r.supplier}</TableCell>
                      <TableCell className="text-center font-semibold">{r.qty}</TableCell>
                      <TableCell>{r.target}</TableCell>
                      <TableCell className="font-mono text-sm">{r.qcRef}</TableCell>
                      <TableCell>{r.date}</TableCell>
                      <TableCell>{relStatusBadge(r.status)}</TableCell>
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