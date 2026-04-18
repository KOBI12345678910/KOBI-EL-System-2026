import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import {
  Shield, FileCheck, Award, ClipboardCheck, ShieldCheck,
  FileWarning, Search, Clock, AlertTriangle,
} from "lucide-react";

/* ── helpers ────────────────────────────────────────────────────── */
const pct = (v: number) => `${v.toFixed(0)}%`;

/* ── 5 compliance controls ──────────────────────────────────────── */
const FALLBACK_CONTROLS = [
  { id: "CTL-01", name: "מסמכי רכש", icon: FileCheck, description: "תעודות משלוח, חשבוניות, הזמנות רכש מאושרות", compliant: 42, total: 48, color: "text-blue-400", bg: "bg-blue-500/10" },
  { id: "CTL-02", name: "הסמכות ספקים", icon: Award, description: "ISO 9001, ISO 14001, תקני ישראל", compliant: 18, total: 24, color: "text-purple-400", bg: "bg-purple-500/10" },
  { id: "CTL-03", name: "בקרת איכות", icon: ClipboardCheck, description: "תעודות בדיקה, COC, דו\"חות מעבדה", compliant: 35, total: 40, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { id: "CTL-04", name: "בטיחות", icon: ShieldCheck, description: "MSDS, הוראות בטיחות, אישורי כיבוי אש", compliant: 28, total: 30, color: "text-cyan-400", bg: "bg-cyan-500/10" },
  { id: "CTL-05", name: "רגולציית יבוא", icon: FileWarning, description: "רישיונות יבוא, מכס, תקנות סחר", compliant: 14, total: 18, color: "text-orange-400", bg: "bg-orange-500/10" },
];

/* ── supplier compliance status ─────────────────────────────────── */
const FALLBACK_SUPPLIER_COMPLIANCE = [
  { supplier: "אלומיניום ישראל בע\"מ", docs: "תקין", certs: "תקין", quality: "תקין", safety: "תקין", imports: "תקין",  overall: 100, status: "מאושר" },
  { supplier: "פלדות השרון", docs: "תקין", certs: "תקין", quality: "חסר", safety: "תקין", imports: "לא רלוונטי",  overall: 80, status: "חלקי" },
  { supplier: "זכוכית הגליל", docs: "תקין", certs: "פג תוקף", quality: "תקין", safety: "תקין", imports: "תקין",  overall: 85, status: "חלקי" },
  { supplier: "נירוסטה פלוס", docs: "תקין", certs: "תקין", quality: "תקין", safety: "תקין", imports: "תקין",  overall: 100, status: "מאושר" },
  { supplier: "כימיקלים מרכז", docs: "תקין", certs: "תקין", quality: "תקין", safety: "פג תוקף", imports: "חסר",  overall: 70, status: "חלקי" },
  { supplier: "מחברי עוזי טכנו", docs: "חסר", certs: "חסר", quality: "חסר", safety: "תקין", imports: "לא רלוונטי",  overall: 40, status: "לא תקין" },
  { supplier: "HPL ישראל", docs: "תקין", certs: "תקין", quality: "תקין", safety: "תקין", imports: "פג תוקף",  overall: 90, status: "חלקי" },
  { supplier: "גומי ואטמים בע\"מ", docs: "תקין", certs: "תקין", quality: "תקין", safety: "תקין", imports: "לא רלוונטי",  overall: 100, status: "מאושר" },
  { supplier: "ייבוא מתכות דרום", docs: "תקין", certs: "פג תוקף", quality: "חסר", safety: "תקין", imports: "חסר",  overall: 55, status: "לא תקין" },
  { supplier: "צבעי המפרץ", docs: "תקין", certs: "תקין", quality: "תקין", safety: "תקין", imports: "לא רלוונטי",  overall: 100, status: "מאושר" },
];

const cellColor: Record<string, string> = {
  "תקין": "text-green-400",
  "חסר": "text-red-400",
  "פג תוקף": "text-yellow-400",
  "לא רלוונטי": "text-muted-foreground",
};

const statusColor: Record<string, string> = {
  "מאושר": "bg-green-500/20 text-green-400",
  "חלקי": "bg-yellow-500/20 text-yellow-400",
  "לא תקין": "bg-red-500/20 text-red-400",
};

/* ================================================================ */
export default function ProcurementCompliance() {
  const { data: procurementcomplianceData } = useQuery({
    queryKey: ["procurement-compliance"],
    queryFn: () => authFetch("/api/procurement/procurement_compliance"),
    staleTime: 5 * 60 * 1000,
  });

  const controls = procurementcomplianceData ?? FALLBACK_CONTROLS;
  const supplierCompliance = FALLBACK_SUPPLIER_COMPLIANCE;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  /* overall KPI */
  const totalCompliant = controls.reduce((s, c) => s + c.compliant, 0);
  const totalItems = controls.reduce((s, c) => s + c.total, 0);
  const overallPct = totalItems > 0 ? Math.round((totalCompliant / totalItems) * 100) : 0;
  const approvedSuppliers = supplierCompliance.filter(s => s.status === "מאושר").length;
  const partialSuppliers = supplierCompliance.filter(s => s.status === "חלקי").length;
  const failedSuppliers = supplierCompliance.filter(s => s.status === "לא תקין").length;

  /* filtered suppliers */
  const sl = search.toLowerCase();
  const filtered = useMemo(() => {
    let arr = [...supplierCompliance];
    if (sl) arr = arr.filter(s => s.supplier.toLowerCase().includes(sl));
    if (statusFilter !== "all") arr = arr.filter(s => s.status === statusFilter);
    return arr;
  }, [sl, statusFilter]);

  return (
    <div dir="rtl" className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/10">
            <Shield className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">רגולציה ותאימות רכש</h1>
            <p className="text-sm text-muted-foreground">ניטור תאימות ספקים, הסמכות ורגולציה - טכנו-כל עוזי</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground"
          >
            <option value="all">כל הסטטוסים</option>
            <option value="מאושר">מאושר</option>
            <option value="חלקי">חלקי</option>
            <option value="לא תקין">לא תקין</option>
          </select>
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              className="bg-muted/50 border border-border rounded-lg pr-9 pl-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/40 w-60"
              placeholder="חיפוש ספק..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Overall + Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">תאימות כללית</span>
              <Shield className="w-4 h-4 text-indigo-400" />
            </div>
            <span className="text-2xl font-bold text-foreground">{pct(overallPct)}</span>
            <Progress value={overallPct} className="h-2 bg-muted/40" />
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">ספקים מאושרים</span>
              <ShieldCheck className="w-4 h-4 text-green-400" />
            </div>
            <span className="text-2xl font-bold text-green-400">{approvedSuppliers}</span>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">תאימות חלקית</span>
              <AlertTriangle className="w-4 h-4 text-yellow-400" />
            </div>
            <span className="text-2xl font-bold text-yellow-400">{partialSuppliers}</span>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">לא תקינים</span>
              <FileWarning className="w-4 h-4 text-red-400" />
            </div>
            <span className="text-2xl font-bold text-red-400">{failedSuppliers}</span>
          </CardContent>
        </Card>
      </div>

      {/* 5 Compliance Controls */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {controls.map((ctl) => {
          const p = ctl.total > 0 ? Math.round((ctl.compliant / ctl.total) * 100) : 0;
          return (
            <Card key={ctl.id} className="bg-card border-border">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-lg ${ctl.bg}`}>
                    <ctl.icon className={`w-4 h-4 ${ctl.color}`} />
                  </div>
                  <span className="font-semibold text-foreground text-sm">{ctl.name}</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{ctl.description}</p>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{ctl.compliant}/{ctl.total}</span>
                  <span className={`font-bold ${p >= 90 ? "text-green-400" : p >= 70 ? "text-yellow-400" : "text-red-400"}`}>{pct(p)}</span>
                </div>
                <Progress value={p} className="h-2 bg-muted/40" />
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Supplier Compliance Dashboard */}
      <Card className="bg-card border-border overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-right text-muted-foreground">ספק</TableHead>
                  <TableHead className="text-center text-muted-foreground">מסמכים</TableHead>
                  <TableHead className="text-center text-muted-foreground">הסמכות</TableHead>
                  <TableHead className="text-center text-muted-foreground">איכות</TableHead>
                  <TableHead className="text-center text-muted-foreground">בטיחות</TableHead>
                  <TableHead className="text-center text-muted-foreground">יבוא</TableHead>
                  <TableHead className="text-center text-muted-foreground w-28">ציון כללי</TableHead>
                  <TableHead className="text-center text-muted-foreground">סטטוס</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((sup, i) => (
                  <TableRow key={i} className={`border-border hover:bg-muted/30 ${sup.status === "לא תקין" ? "bg-red-500/5" : ""}`}>
                    <TableCell className="font-semibold text-foreground">{sup.supplier}</TableCell>
                    <TableCell className={`text-center text-sm ${cellColor[sup.docs]}`}>{sup.docs}</TableCell>
                    <TableCell className={`text-center text-sm ${cellColor[sup.certs]}`}>{sup.certs}</TableCell>
                    <TableCell className={`text-center text-sm ${cellColor[sup.quality]}`}>{sup.quality}</TableCell>
                    <TableCell className={`text-center text-sm ${cellColor[sup.safety]}`}>{sup.safety}</TableCell>
                    <TableCell className={`text-center text-sm ${cellColor[sup.imports]}`}>{sup.imports}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={sup.overall} className="h-2 flex-1 bg-muted/40" />
                        <span className={`text-xs font-bold w-8 text-left ${sup.overall >= 90 ? "text-green-400" : sup.overall >= 70 ? "text-yellow-400" : "text-red-400"}`}>
                          {pct(sup.overall)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className={`${statusColor[sup.status]} border-0 text-xs`}>{sup.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Footer */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <Clock className="w-3.5 h-3.5" />
        <span>עודכן: 08/04/2026 10:15</span>
        <span>|</span>
        <span>תאימות כללית: {pct(overallPct)}</span>
        <span>|</span>
        <span>{failedSuppliers} ספקים לא תקינים</span>
      </div>
    </div>
  );
}
