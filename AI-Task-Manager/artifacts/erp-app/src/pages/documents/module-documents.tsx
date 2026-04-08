import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Layers, ShoppingCart, Ship, Landmark, Factory, Wrench,
  Users, Truck, ShieldCheck, FileText, Link2, ArrowLeftRight,
  CheckCircle2, Clock, AlertTriangle, Eye,
} from "lucide-react";

/* ================================================================
   MODULE-SPECIFIC DOCUMENTS HUB — טכנו-כל עוזי
   ================================================================ */

/* ── Module Overview Cards ── */
const FALLBACK_MODULES = [
  { key: "procurement", label: "רכש", icon: ShoppingCart, count: 645, color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200" },
  { key: "import", label: "ייבוא", icon: Ship, count: 180, color: "text-cyan-600", bg: "bg-cyan-50", border: "border-cyan-200" },
  { key: "finance", label: "כספים", icon: Landmark, count: 1530, color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
  { key: "production", label: "ייצור", icon: Factory, count: 820, color: "text-orange-600", bg: "bg-orange-50", border: "border-orange-200" },
  { key: "installations", label: "התקנות", icon: Wrench, count: 340, color: "text-purple-600", bg: "bg-purple-50", border: "border-purple-200" },
  { key: "customers", label: "לקוחות", icon: Users, count: 58, color: "text-pink-600", bg: "bg-pink-50", border: "border-pink-200" },
  { key: "suppliers", label: "ספקים", icon: Truck, count: 410, color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200" },
  { key: "quality", label: "איכות", icon: ShieldCheck, count: 95, color: "text-red-600", bg: "bg-red-50", border: "border-red-200" },
];

/* ── Per-Module Document Tables ── */
const FALLBACK_PROCUREMENT_DOCS = [
  { id: "PO-2026-1284", name: "הזמנת רכש — אלומיניום Alumil", type: "הזמנת רכש", entity: "Alumil Romania", date: "06/04/2026", status: "מאושר", version: "v2.1" },
  { id: "PO-2026-1279", name: "הזמנת רכש — זכוכית Foshan", type: "הזמנת רכש", entity: "Foshan Glass", date: "04/04/2026", status: "ממתין", version: "v1.0" },
  { id: "DN-5590", name: "תעודת משלוח — פרופילים", type: "תעודת משלוח", entity: "Alumil Romania", date: "05/04/2026", status: "מאושר", version: "v1.0" },
  { id: "INV-S-3321", name: "חשבונית ספק — חומרי גלם Q1", type: "חשבונית ספק", entity: "YKK AP", date: "01/04/2026", status: "מאושר", version: "v1.2" },
  { id: "CTR-SUP-048", name: "חוזה מסגרת — Alumil 2026", type: "חוזה ספק", entity: "Alumil Romania", date: "15/01/2026", status: "פעיל", version: "v3.0" },
  { id: "CMP-2026-022", name: "השוואת מחירים — אטמים", type: "השוואת מחיר", entity: "3 ספקים", date: "28/03/2026", status: "הושלם", version: "v1.0" },
  { id: "PAY-APR-012", name: "אישור תשלום — Foshan Glass", type: "אישור תשלום", entity: "Foshan Glass", date: "03/04/2026", status: "ממתין", version: "v1.0" },
  { id: "PO-2026-1270", name: "הזמנת רכש — חומרי אריזה", type: "הזמנת רכש", entity: "אריזות ישראל", date: "25/03/2026", status: "מאושר", version: "v1.1" },
];

const FALLBACK_IMPORT_DOCS = [
  { id: "LC-2026-034", name: "מכתב אשראי — Foshan Glass", type: "LC", entity: "בנק לאומי / Foshan", date: "10/03/2026", status: "פעיל", version: "v1.0" },
  { id: "BL-FG-2026-18", name: "שטר מטען — מכולה FSCU7734", type: "Bill of Lading", entity: "Maersk Line", date: "22/03/2026", status: "מאושר", version: "v1.0" },
  { id: "PL-FG-2026-18", name: "רשימת אריזה — זכוכית מחוסמת", type: "Packing List", entity: "Foshan Glass", date: "20/03/2026", status: "מאושר", version: "v1.1" },
  { id: "CO-FG-2026-18", name: "תעודת מקור — סין", type: "Certificate of Origin", entity: "CCPIT China", date: "19/03/2026", status: "מאושר", version: "v1.0" },
  { id: "CUS-2026-089", name: "רשימון יבוא — מכס אשדוד", type: "הצהרת מכס", entity: "מכס ישראל", date: "02/04/2026", status: "ממתין", version: "v1.0" },
  { id: "INS-MAR-2026-07", name: "פוליסת ביטוח ימי — מכולה 18", type: "ביטוח", entity: "הראל ביטוח", date: "15/03/2026", status: "פעיל", version: "v1.0" },
  { id: "LC-2026-029", name: "מכתב אשראי — Alumil Romania", type: "LC", entity: "בנק דיסקונט / Alumil", date: "05/02/2026", status: "מאושר", version: "v1.0" },
  { id: "BL-ALU-2026-12", name: "שטר מטען — מכולה ALRU4421", type: "Bill of Lading", entity: "ZIM Lines", date: "18/02/2026", status: "מאושר", version: "v1.0" },
];

const FALLBACK_FINANCE_DOCS = [
  { id: "INV-2026-0312", name: "חשבונית מס — פרויקט מגדלי הים", type: "חשבונית", entity: "מגדלי הים בע\"מ", date: "07/04/2026", status: "מאושר", version: "v1.0" },
  { id: "REC-2026-0298", name: "קבלה — תשלום ספק Alumil", type: "קבלה", entity: "Alumil Romania", date: "05/04/2026", status: "מאושר", version: "v1.0" },
  { id: "FIN-Q1-2026", name: "דוח כספי רבעוני Q1 2026", type: "דוח כספי", entity: "טכנו-כל עוזי", date: "01/04/2026", status: "טיוטה", version: "v0.9" },
  { id: "TAX-VAT-MAR", name: "הצהרת מע\"מ — מרץ 2026", type: "הצהרת מס", entity: "רשות המסים", date: "15/04/2026", status: "ממתין", version: "v1.0" },
  { id: "GRN-BNK-2026-05", name: "ערבות בנקאית — פרויקט נהריה", type: "ערבות", entity: "בנק הפועלים", date: "20/02/2026", status: "פעיל", version: "v1.0" },
  { id: "CHK-2026-0145", name: "שיק לפקודת YKK AP", type: "שיק", entity: "YKK AP", date: "30/03/2026", status: "נפדה", version: "v1.0" },
  { id: "INV-2026-0305", name: "חשבונית מס — התקנה רמת גן", type: "חשבונית", entity: "דיירי רמת גן", date: "02/04/2026", status: "מאושר", version: "v1.0" },
  { id: "FIN-BUDGET-2026", name: "תקציב שנתי 2026 — מאושר", type: "דוח כספי", entity: "טכנו-כל עוזי", date: "05/01/2026", status: "מאושר", version: "v4.0" },
  { id: "REC-2026-0301", name: "קבלה — תשלום Foshan Glass", type: "קבלה", entity: "Foshan Glass", date: "07/04/2026", status: "מאושר", version: "v1.0" },
  { id: "TAX-ANN-2025", name: "דוח שנתי מס הכנסה 2025", type: "הצהרת מס", entity: "רשות המסים", date: "31/03/2026", status: "ממתין", version: "v1.0" },
];

const FALLBACK_PRODUCTION_DOCS = [
  { id: "WI-PRD-088", name: "הוראת עבודה — קו חיתוך CNC", type: "הוראת עבודה", entity: "קו ייצור A", date: "01/04/2026", status: "פעיל", version: "v5.2" },
  { id: "DWG-SH40-R3", name: "שרטוט ציר הנעה SH-40", type: "שרטוט", entity: "מחלקת הנדסה", date: "15/03/2026", status: "מאושר", version: "v3.0" },
  { id: "BOM-PRO-X-2026", name: "BOM — פרופיל Pro-X Premium", type: "BOM", entity: "מוצר Pro-X", date: "10/03/2026", status: "פעיל", version: "v2.4" },
  { id: "QC-RPT-0087", name: "דוח QC — אצווה B-2026-041", type: "דוח QC", entity: "אצווה B-041", date: "06/04/2026", status: "מאושר", version: "v1.0" },
  { id: "TC-ALU-2026", name: "תעודת בדיקה — אלומיניום 6063", type: "תעודת בדיקה", entity: "מעבדת חומרים", date: "28/03/2026", status: "מאושר", version: "v1.0" },
  { id: "STD-ISO-9001", name: "תקן ISO 9001:2015 — תעודה", type: "תקן", entity: "מכון התקנים", date: "12/06/2025", status: "פעיל", version: "v1.0" },
  { id: "WI-PRD-091", name: "הוראת עבודה — קו הרכבה B", type: "הוראת עבודה", entity: "קו ייצור B", date: "05/04/2026", status: "פעיל", version: "v2.0" },
  { id: "DWG-PRO-X-R5", name: "שרטוט פרופיל Pro-X Premium", type: "שרטוט", entity: "מחלקת הנדסה", date: "01/04/2026", status: "מאושר", version: "v5.0" },
];

const FALLBACK_CUSTOMER_DOCS = [
  { id: "Q-2026-0312", name: "הצעת מחיר — מגדלי הים", type: "הצעת מחיר", entity: "מגדלי הים בע\"מ", date: "25/03/2026", status: "נשלח", version: "v2.0" },
  { id: "CTR-CUS-091", name: "חוזה — פרויקט נהריה מערב", type: "חוזה", entity: "עיריית נהריה", date: "01/02/2026", status: "חתום", version: "v1.0" },
  { id: "HNDVR-2026-014", name: "פרוטוקול מסירה — דירה 12A", type: "פרוטוקול מסירה", entity: "רמת גן טאוורס", date: "04/04/2026", status: "מאושר", version: "v1.0" },
  { id: "CLM-2026-003", name: "תביעת לקוח — סדק בזכוכית", type: "תביעה", entity: "שלמה ביטון", date: "20/03/2026", status: "בטיפול", version: "v1.1" },
  { id: "WRN-2026-058", name: "תעודת אחריות — פרויקט חיפה", type: "אחריות", entity: "קבוצת חיפה", date: "15/01/2026", status: "פעיל", version: "v1.0" },
  { id: "Q-2026-0318", name: "הצעת מחיר — פרויקט ראשון לציון", type: "הצעת מחיר", entity: "קבלן ר\"ל", date: "06/04/2026", status: "טיוטה", version: "v1.0" },
  { id: "CTR-CUS-094", name: "חוזה — שיפוץ משרדי הייטק ת\"א", type: "חוזה", entity: "סטארטאפ ויז'ן", date: "01/04/2026", status: "ממתין", version: "v1.0" },
];

const FALLBACK_INSTALLATION_DOCS = [
  { id: "INST-2026-078", name: "דוח התקנה — מגדלי הים קומה 14", type: "דוח התקנה", entity: "מגדלי הים בע\"מ", date: "07/04/2026", status: "מאושר", version: "v1.0" },
  { id: "INST-2026-075", name: "דוח התקנה — וילת פרימיום נתניה", type: "דוח התקנה", entity: "לקוח פרטי", date: "03/04/2026", status: "ממתין", version: "v1.0" },
  { id: "SFTY-INST-041", name: "אישור בטיחות — עבודה בגובה", type: "אישור בטיחות", entity: "צוות התקנות A", date: "01/04/2026", status: "פעיל", version: "v1.2" },
  { id: "MEAS-2026-312", name: "פרוטוקול מדידות — פרויקט חיפה", type: "מדידות", entity: "קבוצת חיפה", date: "28/03/2026", status: "מאושר", version: "v2.0" },
  { id: "WRNT-INST-019", name: "כתב אחריות התקנה — רמת גן", type: "אחריות", entity: "רמת גן טאוורס", date: "04/04/2026", status: "פעיל", version: "v1.0" },
  { id: "SCHD-INST-APR", name: "לוח זמנים התקנות — אפריל 2026", type: "תכנון", entity: "מחלקת התקנות", date: "30/03/2026", status: "פעיל", version: "v3.1" },
  { id: "COMP-INST-2026-07", name: "תעודת השלמה — פרויקט נהריה", type: "השלמה", entity: "עיריית נהריה", date: "25/03/2026", status: "מאושר", version: "v1.0" },
];

const FALLBACK_SUPPLIER_DOCS = [
  { id: "CTR-SUP-048", name: "חוזה מסגרת — Alumil 2026", type: "חוזה", entity: "Alumil Romania", date: "15/01/2026", status: "פעיל", version: "v3.0" },
  { id: "EVAL-SUP-2026-Q1", name: "הערכת ספק — Foshan Glass", type: "הערכת ספק", entity: "Foshan Glass", date: "31/03/2026", status: "הושלם", version: "v1.0" },
  { id: "APR-SUP-YKK", name: "אישור ספק מאושר — YKK AP", type: "אישור ספק", entity: "YKK AP", date: "10/02/2026", status: "מאושר", version: "v2.0" },
  { id: "CERT-SUP-ALU", name: "תעודת ISO — Alumil Romania", type: "תעודה", entity: "Alumil Romania", date: "01/07/2025", status: "פעיל", version: "v1.0" },
  { id: "ACC-SUP-FSH", name: "הסמכת מעבדה — Foshan Glass", type: "הסמכה", entity: "Foshan Glass", date: "15/09/2025", status: "פעיל", version: "v1.0" },
  { id: "CTR-SUP-052", name: "חוזה מסגרת — YKK AP 2026", type: "חוזה", entity: "YKK AP", date: "01/03/2026", status: "פעיל", version: "v2.0" },
  { id: "EVAL-SUP-2026-ALU", name: "הערכת ספק — Alumil Romania", type: "הערכת ספק", entity: "Alumil Romania", date: "28/03/2026", status: "הושלם", version: "v1.0" },
];

const FALLBACK_QUALITY_DOCS = [
  { id: "QMS-2026-001", name: "מדיניות איכות — טכנו-כל עוזי", type: "מדיניות", entity: "טכנו-כל עוזי", date: "01/01/2026", status: "פעיל", version: "v6.0" },
  { id: "AUD-INT-2026-Q1", name: "דוח מבדק פנימי — Q1 2026", type: "מבדק פנימי", entity: "מחלקת איכות", date: "31/03/2026", status: "מאושר", version: "v1.0" },
  { id: "NCR-2026-018", name: "דוח אי-התאמה — אצווה זכוכית", type: "NCR", entity: "קו ייצור B", date: "05/04/2026", status: "בטיפול", version: "v1.1" },
  { id: "CAL-LAB-2026", name: "תעודת כיול — מכשירי מדידה", type: "כיול", entity: "מעבדה מוסמכת", date: "15/02/2026", status: "פעיל", version: "v1.0" },
  { id: "CAPA-2026-007", name: "תיקון ומניעה — סטיית ממדים", type: "CAPA", entity: "קו ייצור A", date: "20/03/2026", status: "ממתין", version: "v1.0" },
  { id: "SPC-RPT-MAR-2026", name: "דוח SPC — פרופיל Pro-X", type: "בקרת תהליכים", entity: "מוצר Pro-X", date: "01/04/2026", status: "מאושר", version: "v1.0" },
  { id: "ITP-2026-003", name: "תכנית בדיקות — זכוכית מחוסמת", type: "ITP", entity: "מעבדת איכות", date: "15/03/2026", status: "פעיל", version: "v2.0" },
  { id: "MR-2026-011", name: "סקר הנהלה — Q1 2026", type: "סקר הנהלה", entity: "הנהלה בכירה", date: "07/04/2026", status: "טיוטה", version: "v0.8" },
];

/* ── Cross-Module Linking Examples ── */
const FALLBACK_CROSS_MODULE_LINKS = [
  {
    title: "הזמנת רכש → חשבונית ספק → תשלום",
    from: { module: "רכש", doc: "PO-2026-1284", label: "הזמנת רכש — Alumil" },
    through: { module: "כספים", doc: "INV-S-3321", label: "חשבונית ספק Q1" },
    to: { module: "כספים", doc: "REC-2026-0298", label: "קבלה — תשלום Alumil" },
    status: "הושלם",
  },
  {
    title: "שטר מטען → הצהרת מכס → תעודת משלוח",
    from: { module: "ייבוא", doc: "BL-FG-2026-18", label: "Bill of Lading — Foshan" },
    through: { module: "ייבוא", doc: "CUS-2026-089", label: "רשימון יבוא — מכס אשדוד" },
    to: { module: "רכש", doc: "DN-5590", label: "תעודת משלוח — פרופילים" },
    status: "בתהליך",
  },
  {
    title: "הצעת מחיר → חוזה → פרוטוקול מסירה",
    from: { module: "לקוחות", doc: "Q-2026-0312", label: "הצעת מחיר — מגדלי הים" },
    through: { module: "לקוחות", doc: "CTR-CUS-091", label: "חוזה — נהריה מערב" },
    to: { module: "לקוחות", doc: "HNDVR-2026-014", label: "פרוטוקול מסירה — 12A" },
    status: "הושלם",
  },
];

/* ── Helpers ── */
const statusColor = (s: string) => {
  switch (s) {
    case "מאושר": case "פעיל": case "חתום": case "הושלם": case "נפדה": return "bg-emerald-100 text-emerald-700";
    case "ממתין": case "טיוטה": case "בתהליך": return "bg-amber-100 text-amber-700";
    case "נשלח": return "bg-blue-100 text-blue-700";
    case "בטיפול": return "bg-red-100 text-red-700";
    default: return "bg-slate-100 text-slate-600";
  }
};

const linkStatusColor = (s: string) =>
  s === "הושלם" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700";

/* ── Module Stats Summary ── */
const FALLBACK_MODULE_STATS = [
  { module: "רכש", approved: 412, pending: 38, expired: 5, thisMonth: 22, growth: 8.4 },
  { module: "ייבוא", approved: 134, pending: 12, expired: 2, thisMonth: 8, growth: 5.1 },
  { module: "כספים", approved: 1205, pending: 85, expired: 12, thisMonth: 41, growth: 12.3 },
  { module: "ייצור", approved: 654, pending: 42, expired: 8, thisMonth: 34, growth: 6.7 },
  { module: "התקנות", approved: 278, pending: 18, expired: 3, thisMonth: 15, growth: 9.2 },
  { module: "לקוחות", approved: 41, pending: 7, expired: 1, thisMonth: 5, growth: 3.8 },
  { module: "ספקים", approved: 332, pending: 24, expired: 4, thisMonth: 12, growth: 4.5 },
  { module: "איכות", approved: 72, pending: 9, expired: 2, thisMonth: 6, growth: 7.1 },
];

/* ── Tab config ── */
const tabConfig: { key: string; label: string; docs: typeof procurementDocs }[] = [
  { key: "procurement", label: "רכש", docs: procurementDocs },
  { key: "import", label: "ייבוא", docs: importDocs },
  { key: "finance", label: "כספים", docs: financeDocs },
  { key: "production", label: "ייצור", docs: productionDocs },
  { key: "installations", label: "התקנות", docs: installationDocs },
  { key: "customers", label: "לקוחות", docs: customerDocs },
  { key: "suppliers", label: "ספקים", docs: supplierDocs },
  { key: "quality", label: "איכות", docs: qualityDocs },
];

/* ── Document Table Component ── */
function DocTable({ docs }: { docs: typeof procurementDocs }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="text-right">מזהה</TableHead>
          <TableHead className="text-right">שם מסמך</TableHead>
          <TableHead className="text-right">סוג</TableHead>
          <TableHead className="text-right">ישות מקושרת</TableHead>
          <TableHead className="text-right">תאריך</TableHead>
          <TableHead className="text-right">סטטוס</TableHead>
          <TableHead className="text-right">גרסה</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {docs.map((d) => (
          <TableRow key={d.id}>
            <TableCell className="font-mono text-xs">{d.id}</TableCell>
            <TableCell className="font-medium">{d.name}</TableCell>
            <TableCell className="text-xs text-muted-foreground">{d.type}</TableCell>
            <TableCell className="text-xs">{d.entity}</TableCell>
            <TableCell className="text-xs">{d.date}</TableCell>
            <TableCell><Badge className={`${statusColor(d.status)} text-[11px]`}>{d.status}</Badge></TableCell>
            <TableCell className="font-mono text-xs">{d.version}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/* ================================================================
   MAIN COMPONENT
   ================================================================ */
export default function ModuleDocuments() {

  const { data: apiData } = useQuery({
    queryKey: ["module_documents"],
    queryFn: () => authFetch("/api/documents/module-documents").then(r => r.json()),
    staleTime: 60_000,
    retry: 1,
  });
  const modules = apiData?.modules ?? FALLBACK_MODULES;
  const procurementDocs = apiData?.procurementDocs ?? FALLBACK_PROCUREMENT_DOCS;
  const importDocs = apiData?.importDocs ?? FALLBACK_IMPORT_DOCS;
  const financeDocs = apiData?.financeDocs ?? FALLBACK_FINANCE_DOCS;
  const productionDocs = apiData?.productionDocs ?? FALLBACK_PRODUCTION_DOCS;
  const customerDocs = apiData?.customerDocs ?? FALLBACK_CUSTOMER_DOCS;
  const installationDocs = apiData?.installationDocs ?? FALLBACK_INSTALLATION_DOCS;
  const supplierDocs = apiData?.supplierDocs ?? FALLBACK_SUPPLIER_DOCS;
  const qualityDocs = apiData?.qualityDocs ?? FALLBACK_QUALITY_DOCS;
  const crossModuleLinks = apiData?.crossModuleLinks ?? FALLBACK_CROSS_MODULE_LINKS;
  const moduleStats = apiData?.moduleStats ?? FALLBACK_MODULE_STATS;
  const [activeTab, setActiveTab] = useState("procurement");
  const totalDocs = modules.reduce((sum, m) => sum + m.count, 0);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* ── Header ───────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Layers className="h-7 w-7 text-primary" /> מסמכים לפי מודול
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            מאגר מסמכים ארגוני לפי מודולים | רכש, ייבוא, כספים, ייצור, לקוחות, ספקים — טכנו-כל עוזי
          </p>
        </div>
        <Badge variant="outline" className="text-xs gap-1">
          <FileText className="h-3 w-3" /> {totalDocs.toLocaleString()} מסמכים
        </Badge>
      </div>

      {/* ── Module Overview Cards ─────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {modules.map((m) => {
          const Icon = m.icon;
          const pct = Math.round((m.count / totalDocs) * 100);
          return (
            <Card
              key={m.key}
              className={`cursor-pointer transition-all hover:shadow-md border ${m.border} ${activeTab === m.key ? "ring-2 ring-primary" : ""}`}
              onClick={() => setActiveTab(m.key)}
            >
              <CardContent className="p-3 text-center space-y-1">
                <div className={`mx-auto w-9 h-9 rounded-lg ${m.bg} flex items-center justify-center`}>
                  <Icon className={`h-5 w-5 ${m.color}`} />
                </div>
                <p className="text-[11px] text-muted-foreground">{m.label}</p>
                <p className="text-lg font-bold">{m.count.toLocaleString()}</p>
                <Progress value={pct} className="h-1" />
                <p className="text-[10px] text-muted-foreground">{pct}% מהכלל</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── Tabbed Module Documents ───────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap gap-1">
          {tabConfig.map((t) => (
            <TabsTrigger key={t.key} value={t.key} className="text-xs">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {tabConfig.map((t) => (
          <TabsContent key={t.key} value={t.key}>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  מסמכי {t.label}
                  <Badge variant="secondary" className="text-[11px] mr-2">
                    {t.docs.length} מסמכים מוצגים
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <DocTable docs={t.docs} />
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* ── Module Stats Summary ────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> סיכום סטטוס מסמכים לפי מודול
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">מודול</TableHead>
                <TableHead className="text-right">מאושרים</TableHead>
                <TableHead className="text-right">ממתינים</TableHead>
                <TableHead className="text-right">פגי תוקף</TableHead>
                <TableHead className="text-right">החודש</TableHead>
                <TableHead className="text-right">צמיחה %</TableHead>
                <TableHead className="text-right">התקדמות אישור</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {moduleStats.map((ms) => {
                const total = ms.approved + ms.pending + ms.expired;
                const approvalRate = Math.round((ms.approved / total) * 100);
                return (
                  <TableRow key={ms.module}>
                    <TableCell className="font-medium">{ms.module}</TableCell>
                    <TableCell>
                      <Badge className="bg-emerald-100 text-emerald-700 text-[11px]">{ms.approved}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className="bg-amber-100 text-amber-700 text-[11px]">{ms.pending}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className="bg-red-100 text-red-700 text-[11px]">{ms.expired}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{ms.thisMonth}</TableCell>
                    <TableCell>
                      <span className="text-xs text-emerald-600 font-medium">+{ms.growth}%</span>
                    </TableCell>
                    <TableCell className="min-w-[120px]">
                      <div className="flex items-center gap-2">
                        <Progress value={approvalRate} className="h-2 flex-1" />
                        <span className="text-[11px] text-muted-foreground">{approvalRate}%</span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Cross-Module Linking ──────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Link2 className="h-4 w-4" /> קישור חוצה-מודולים
            <Badge variant="secondary" className="text-[11px] mr-2">
              {crossModuleLinks.length} שרשראות מסמכים
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {crossModuleLinks.map((link, i) => (
            <div key={i} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <ArrowLeftRight className="h-4 w-4 text-primary" />
                  {link.title}
                </h3>
                <Badge className={`${linkStatusColor(link.status)} text-[11px]`}>
                  {link.status === "הושלם" ? <CheckCircle2 className="h-3 w-3 ml-1" /> : <Clock className="h-3 w-3 ml-1" />}
                  {link.status}
                </Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[link.from, link.through, link.to].map((step, si) => (
                  <div key={si} className="flex items-start gap-2 bg-muted/40 rounded-md p-2">
                    <div className="mt-0.5">
                      {si === 0 && <Eye className="h-4 w-4 text-blue-500" />}
                      {si === 1 && <ArrowLeftRight className="h-4 w-4 text-amber-500" />}
                      {si === 2 && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {si === 0 ? "מקור" : si === 1 ? "ביניים" : "יעד"} — {step.module}
                      </p>
                      <p className="text-sm font-medium">{step.label}</p>
                      <p className="text-[11px] font-mono text-muted-foreground">{step.doc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
