import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { FileText, CheckCircle, XCircle, Clock, AlertTriangle, ShieldCheck, CalendarX, ClipboardList, FileSearch, FolderOpen, Ship } from "lucide-react";

type DocType = "commercial_invoices" | "packing_lists" | "bills_of_lading" | "airway_bills" | "certificates_of_origin" | "import_licenses" | "insurance_documents" | "customs_declarations" | "inspection_certificates" | "supplier_documents" | "checklists";

const DOC_TYPES: { key: DocType; label: string }[] = [
  { key: "commercial_invoices", label: "חשבונית מסחרית" },
  { key: "packing_lists", label: "רשימת אריזה" },
  { key: "bills_of_lading", label: "שטר מטען ימי" },
  { key: "airway_bills", label: "שטר מטען אווירי" },
  { key: "certificates_of_origin", label: "תעודת מקור" },
  { key: "import_licenses", label: "רישיון יבוא" },
  { key: "insurance_documents", label: "מסמכי ביטוח" },
  { key: "customs_declarations", label: "הצהרת מכס" },
  { key: "inspection_certificates", label: "תעודת בדיקה" },
  { key: "supplier_documents", label: "מסמכי ספק" },
  { key: "checklists", label: "צ׳קליסט" },
];

const SHIPMENTS = [
  { id: "SH-2026-001", supplier: "Foshan Glass Co.", origin: "סין", port: "אשדוד", eta: "2026-04-20", docs: { commercial_invoices: "approved", packing_lists: "approved", bills_of_lading: "approved", airway_bills: "na", certificates_of_origin: "approved", import_licenses: "pending", insurance_documents: "approved", customs_declarations: "pending", inspection_certificates: "approved", supplier_documents: "approved", checklists: "approved" } },
  { id: "SH-2026-002", supplier: "Schüco International", origin: "גרמניה", port: "חיפה", eta: "2026-04-25", docs: { commercial_invoices: "approved", packing_lists: "approved", bills_of_lading: "approved", airway_bills: "na", certificates_of_origin: "approved", import_licenses: "approved", insurance_documents: "approved", customs_declarations: "approved", inspection_certificates: "approved", supplier_documents: "approved", checklists: "approved" } },
  { id: "SH-2026-003", supplier: "Alumil SA", origin: "יוון", port: "אשדוד", eta: "2026-05-01", docs: { commercial_invoices: "approved", packing_lists: "pending", bills_of_lading: "missing", airway_bills: "na", certificates_of_origin: "pending", import_licenses: "missing", insurance_documents: "approved", customs_declarations: "missing", inspection_certificates: "missing", supplier_documents: "pending", checklists: "missing" } },
  { id: "SH-2026-004", supplier: "Technal India", origin: "הודו", port: "חיפה", eta: "2026-04-15", docs: { commercial_invoices: "approved", packing_lists: "approved", bills_of_lading: "na", airway_bills: "approved", certificates_of_origin: "approved", import_licenses: "approved", insurance_documents: "expired", customs_declarations: "approved", inspection_certificates: "pending", supplier_documents: "approved", checklists: "approved" } },
  { id: "SH-2026-005", supplier: "YKK AP Inc.", origin: "יפן", port: "אשדוד", eta: "2026-05-10", docs: { commercial_invoices: "pending", packing_lists: "missing", bills_of_lading: "missing", airway_bills: "na", certificates_of_origin: "missing", import_licenses: "missing", insurance_documents: "missing", customs_declarations: "missing", inspection_certificates: "missing", supplier_documents: "missing", checklists: "missing" } },
  { id: "SH-2026-006", supplier: "Kawneer EMEA", origin: "צרפת", port: "חיפה", eta: "2026-05-05", docs: { commercial_invoices: "approved", packing_lists: "approved", bills_of_lading: "approved", airway_bills: "na", certificates_of_origin: "approved", import_licenses: "pending", insurance_documents: "approved", customs_declarations: "pending", inspection_certificates: "approved", supplier_documents: "pending", checklists: "pending" } },
  { id: "SH-2026-007", supplier: "Guangdong Kinlong", origin: "סין", port: "אשדוד", eta: "2026-04-28", docs: { commercial_invoices: "approved", packing_lists: "approved", bills_of_lading: "approved", airway_bills: "na", certificates_of_origin: "approved", import_licenses: "approved", insurance_documents: "approved", customs_declarations: "approved", inspection_certificates: "pending", supplier_documents: "approved", checklists: "approved" } },
  { id: "SH-2026-008", supplier: "Hydro Building Systems", origin: "נורווגיה", port: "חיפה", eta: "2026-05-15", docs: { commercial_invoices: "approved", packing_lists: "pending", bills_of_lading: "missing", airway_bills: "na", certificates_of_origin: "approved", import_licenses: "approved", insurance_documents: "expired", customs_declarations: "missing", inspection_certificates: "missing", supplier_documents: "pending", checklists: "missing" } },
];

const ALL_DOCUMENTS = [
  { id: "DOC-001", type: "commercial_invoices", shipment: "SH-2026-001", supplier: "Foshan Glass Co.", uploadDate: "2026-03-15", status: "approved", expiry: "2026-09-15" },
  { id: "DOC-002", type: "packing_lists", shipment: "SH-2026-001", supplier: "Foshan Glass Co.", uploadDate: "2026-03-15", status: "approved", expiry: "-" },
  { id: "DOC-003", type: "bills_of_lading", shipment: "SH-2026-002", supplier: "Schüco International", uploadDate: "2026-03-20", status: "approved", expiry: "-" },
  { id: "DOC-004", type: "certificates_of_origin", shipment: "SH-2026-003", supplier: "Alumil SA", uploadDate: "2026-03-22", status: "pending", expiry: "2026-10-01" },
  { id: "DOC-005", type: "import_licenses", shipment: "SH-2026-001", supplier: "Foshan Glass Co.", uploadDate: "2026-03-10", status: "pending", expiry: "2026-06-10" },
  { id: "DOC-006", type: "insurance_documents", shipment: "SH-2026-004", supplier: "Technal India", uploadDate: "2025-12-01", status: "expired", expiry: "2026-03-01" },
  { id: "DOC-007", type: "customs_declarations", shipment: "SH-2026-006", supplier: "Kawneer EMEA", uploadDate: "2026-04-01", status: "pending", expiry: "-" },
  { id: "DOC-008", type: "inspection_certificates", shipment: "SH-2026-007", supplier: "Guangdong Kinlong", uploadDate: "2026-04-02", status: "pending", expiry: "2027-04-02" },
  { id: "DOC-009", type: "commercial_invoices", shipment: "SH-2026-005", supplier: "YKK AP Inc.", uploadDate: "2026-04-05", status: "pending", expiry: "2026-10-05" },
  { id: "DOC-010", type: "supplier_documents", shipment: "SH-2026-008", supplier: "Hydro Building Systems", uploadDate: "2026-03-28", status: "pending", expiry: "-" },
  { id: "DOC-011", type: "insurance_documents", shipment: "SH-2026-008", supplier: "Hydro Building Systems", uploadDate: "2025-11-15", status: "expired", expiry: "2026-02-15" },
  { id: "DOC-012", type: "commercial_invoices", shipment: "SH-2026-004", supplier: "Technal India", uploadDate: "2026-03-12", status: "approved", expiry: "2026-09-12" },
];

const statusIcon = (s: string) => {
  switch (s) {
    case "approved": return <CheckCircle className="h-4 w-4 text-green-400" />;
    case "pending": return <Clock className="h-4 w-4 text-amber-400" />;
    case "missing": return <XCircle className="h-4 w-4 text-red-400" />;
    case "expired": return <CalendarX className="h-4 w-4 text-red-500" />;
    case "na": return <span className="text-xs text-gray-500">-</span>;
    default: return null;
  }
};

const statusBadge = (s: string) => {
  switch (s) {
    case "approved": return <Badge className="bg-green-500/20 text-green-300">מאושר</Badge>;
    case "pending": return <Badge className="bg-amber-500/20 text-amber-300">ממתין</Badge>;
    case "missing": return <Badge className="bg-red-500/20 text-red-300">חסר</Badge>;
    case "expired": return <Badge className="bg-red-700/20 text-red-400">פג תוקף</Badge>;
    default: return null;
  }
};

const docLabel = (key: string) => DOC_TYPES.find(d => d.key === key)?.label ?? key;

export default function ImportDocuments() {
  const [tab, setTab] = useState("checklist");

  const allDocStatuses = SHIPMENTS.flatMap(s => Object.entries(s.docs).filter(([, v]) => v !== "na").map(([, v]) => v));
  const totalDocs = allDocStatuses.length;
  const approvedCount = allDocStatuses.filter(v => v === "approved").length;
  const pendingCount = allDocStatuses.filter(v => v === "pending").length;
  const missingCount = allDocStatuses.filter(v => v === "missing").length;
  const expiredCount = allDocStatuses.filter(v => v === "expired").length;
  const completeShipments = SHIPMENTS.filter(s => Object.entries(s.docs).filter(([, v]) => v !== "na").every(([, v]) => v === "approved")).length;

  const missingAlerts = SHIPMENTS.flatMap(s =>
    Object.entries(s.docs).filter(([, v]) => v === "missing" || v === "expired").map(([k, v]) => ({
      shipment: s.id, supplier: s.supplier, eta: s.eta, docType: k, status: v,
    }))
  );

  const getShipmentProgress = (docs: Record<string, string>) => {
    const relevant = Object.entries(docs).filter(([, v]) => v !== "na");
    const done = relevant.filter(([, v]) => v === "approved").length;
    return Math.round((done / relevant.length) * 100);
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileText className="h-7 w-7" /> מסמכי יבוא
        </h1>
        <Badge variant="outline" className="text-xs">טכנו-כל עוזי</Badge>
      </div>

      <div className="grid grid-cols-6 gap-3">
        <Card className="border-blue-800 bg-blue-950/30">
          <CardContent className="pt-5 text-center">
            <FolderOpen className="h-5 w-5 mx-auto text-blue-400 mb-1" />
            <p className="text-xs text-muted-foreground">סה״כ מסמכים</p>
            <p className="text-2xl font-bold text-blue-300">{totalDocs}</p>
          </CardContent>
        </Card>
        <Card className="border-green-800 bg-green-950/30">
          <CardContent className="pt-5 text-center">
            <Ship className="h-5 w-5 mx-auto text-green-400 mb-1" />
            <p className="text-xs text-muted-foreground">משלוחים שלמים</p>
            <p className="text-2xl font-bold text-green-300">{completeShipments}</p>
          </CardContent>
        </Card>
        <Card className="border-red-800 bg-red-950/30">
          <CardContent className="pt-5 text-center">
            <XCircle className="h-5 w-5 mx-auto text-red-400 mb-1" />
            <p className="text-xs text-muted-foreground">מסמכים חסרים</p>
            <p className="text-2xl font-bold text-red-300">{missingCount}</p>
          </CardContent>
        </Card>
        <Card className="border-amber-800 bg-amber-950/30">
          <CardContent className="pt-5 text-center">
            <Clock className="h-5 w-5 mx-auto text-amber-400 mb-1" />
            <p className="text-xs text-muted-foreground">ממתין לאישור</p>
            <p className="text-2xl font-bold text-amber-300">{pendingCount}</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-800 bg-emerald-950/30">
          <CardContent className="pt-5 text-center">
            <ShieldCheck className="h-5 w-5 mx-auto text-emerald-400 mb-1" />
            <p className="text-xs text-muted-foreground">מאושרים</p>
            <p className="text-2xl font-bold text-emerald-300">{approvedCount}</p>
          </CardContent>
        </Card>
        <Card className="border-rose-800 bg-rose-950/30">
          <CardContent className="pt-5 text-center">
            <CalendarX className="h-5 w-5 mx-auto text-rose-400 mb-1" />
            <p className="text-xs text-muted-foreground">פגי תוקף</p>
            <p className="text-2xl font-bold text-rose-300">{expiredCount}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="checklist"><ClipboardList className="h-4 w-4 ml-1" />צ׳קליסט</TabsTrigger>
          <TabsTrigger value="documents"><FileText className="h-4 w-4 ml-1" />מסמכים</TabsTrigger>
          <TabsTrigger value="missing"><AlertTriangle className="h-4 w-4 ml-1" />חסרים</TabsTrigger>
          <TabsTrigger value="types"><FileSearch className="h-4 w-4 ml-1" />סוגים</TabsTrigger>
        </TabsList>

        <TabsContent value="checklist">
          <Card>
            <CardHeader><CardTitle className="text-lg">צ׳קליסט מסמכים לפי משלוח</CardTitle></CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right sticky right-0 bg-background z-10 min-w-[140px]">משלוח</TableHead>
                    <TableHead className="text-right min-w-[120px]">ספק</TableHead>
                    <TableHead className="text-center min-w-[60px]">התקדמות</TableHead>
                    {DOC_TYPES.map(d => (
                      <TableHead key={d.key} className="text-center min-w-[40px] px-1">
                        <span className="text-[10px] leading-tight block">{d.label}</span>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {SHIPMENTS.map(s => {
                    const pct = getShipmentProgress(s.docs);
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="font-mono text-sm sticky right-0 bg-background z-10">
                          <div>{s.id}</div>
                          <div className="text-[10px] text-muted-foreground">{s.origin} → {s.port}</div>
                        </TableCell>
                        <TableCell className="text-sm">{s.supplier}</TableCell>
                        <TableCell className="text-center">
                          <Progress value={pct} className="h-2 w-16 mx-auto" />
                          <span className="text-[10px] text-muted-foreground">{pct}%</span>
                        </TableCell>
                        {DOC_TYPES.map(d => (
                          <TableCell key={d.key} className="text-center px-1">
                            {statusIcon(s.docs[d.key])}
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents">
          <Card>
            <CardHeader><CardTitle className="text-lg">כל המסמכים</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">מזהה</TableHead>
                    <TableHead className="text-right">סוג מסמך</TableHead>
                    <TableHead className="text-right">משלוח</TableHead>
                    <TableHead className="text-right">ספק</TableHead>
                    <TableHead className="text-right">תאריך העלאה</TableHead>
                    <TableHead className="text-center">סטטוס</TableHead>
                    <TableHead className="text-right">תוקף</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ALL_DOCUMENTS.map(doc => (
                    <TableRow key={doc.id}>
                      <TableCell className="font-mono text-sm">{doc.id}</TableCell>
                      <TableCell>{docLabel(doc.type)}</TableCell>
                      <TableCell className="font-mono text-sm">{doc.shipment}</TableCell>
                      <TableCell>{doc.supplier}</TableCell>
                      <TableCell className="text-sm">{doc.uploadDate}</TableCell>
                      <TableCell className="text-center">{statusBadge(doc.status)}</TableCell>
                      <TableCell className="text-sm">{doc.expiry}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="missing">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-400" /> מסמכים חסרים / פגי תוקף
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">משלוח</TableHead>
                    <TableHead className="text-right">ספק</TableHead>
                    <TableHead className="text-right">סוג מסמך</TableHead>
                    <TableHead className="text-center">סטטוס</TableHead>
                    <TableHead className="text-right">ETA</TableHead>
                    <TableHead className="text-center">דחיפות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {missingAlerts.map((a, i) => {
                    const daysToEta = Math.ceil((new Date(a.eta).getTime() - Date.now()) / 86400000);
                    const urgency = daysToEta <= 7 ? "critical" : daysToEta <= 14 ? "high" : "medium";
                    return (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-sm">{a.shipment}</TableCell>
                        <TableCell>{a.supplier}</TableCell>
                        <TableCell>{docLabel(a.docType)}</TableCell>
                        <TableCell className="text-center">{statusBadge(a.status)}</TableCell>
                        <TableCell className="text-sm">{a.eta}</TableCell>
                        <TableCell className="text-center">
                          <Badge className={urgency === "critical" ? "bg-red-600/30 text-red-300" : urgency === "high" ? "bg-orange-500/20 text-orange-300" : "bg-yellow-500/20 text-yellow-300"}>
                            {urgency === "critical" ? "קריטי" : urgency === "high" ? "גבוה" : "בינוני"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="types">
          <Card>
            <CardHeader><CardTitle className="text-lg">סוגי מסמכים - מידע נדרש</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                {DOC_TYPES.map(d => {
                  const total = SHIPMENTS.flatMap(s => Object.entries(s.docs)).filter(([k, v]) => k === d.key && v !== "na").length;
                  const approved = SHIPMENTS.flatMap(s => Object.entries(s.docs)).filter(([k, v]) => k === d.key && v === "approved").length;
                  const missing = SHIPMENTS.flatMap(s => Object.entries(s.docs)).filter(([k, v]) => k === d.key && v === "missing").length;
                  return (
                    <Card key={d.key} className="border-gray-700">
                      <CardContent className="pt-4 pb-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-sm">{d.label}</span>
                          <div className="flex gap-1">
                            <Badge variant="outline" className="text-[10px]">{approved}/{total} מאושר</Badge>
                            {missing > 0 && <Badge className="bg-red-500/20 text-red-300 text-[10px]">{missing} חסר</Badge>}
                          </div>
                        </div>
                        <Progress value={total > 0 ? (approved / total) * 100 : 0} className="h-1.5" />
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
