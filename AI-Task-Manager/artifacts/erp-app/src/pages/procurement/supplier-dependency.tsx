import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import {
  Link, AlertTriangle, Search, ShieldAlert, TrendingUp,
  Package, Users, Clock,
} from "lucide-react";

/* ── helpers ────────────────────────────────────────────────────── */
const fmt = (v: number) => v.toLocaleString("he-IL");
const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(v);
const pct = (v: number) => `${v.toFixed(1)}%`;

/* ── static data ────────────────────────────────────────────────── */
const suppliers = [
  { id: "SUP-001", name: "אלומיניום ישראל בע\"מ", spendPct: 28.5, criticalPct: 65.0, alternatives: 2, spof: true,  risk: "קריטי",  spend: 1420000, materials: ["פרופיל אלומיניום 40x40", "פרופיל אלומיניום 60x60", "אלומיניום גולמי T6"] },
  { id: "SUP-002", name: "פלדות השרון", spendPct: 19.2, criticalPct: 45.0, alternatives: 3, spof: false, risk: "בינוני", spend: 960000, materials: ["פרופיל ברזל U80", "פלטת ברזל 200x200", "קורות HEA"] },
  { id: "SUP-003", name: "זכוכית הגליל", spendPct: 14.8, criticalPct: 80.0, alternatives: 1, spof: true,  risk: "קריטי",  spend: 740000, materials: ["זכוכית מחוסמת 10 מ\"מ", "זכוכית למינציה", "זכוכית LOW-E"] },
  { id: "SUP-004", name: "נירוסטה פלוס", spendPct: 11.3, criticalPct: 35.0, alternatives: 4, spof: false, risk: "נמוך",   spend: 565000, materials: ["צינור נירוסטה 304 ø50", "לוח נירוסטה 316"] },
  { id: "SUP-005", name: "כימיקלים מרכז", spendPct: 8.7, criticalPct: 55.0, alternatives: 2, spof: false, risk: "בינוני", spend: 435000, materials: ["אטם סיליקון", "צבע אפוקסי", "סיליקון שקוף UV"] },
  { id: "SUP-006", name: "מחברי עוזי טכנו", spendPct: 6.2, criticalPct: 25.0, alternatives: 5, spof: false, risk: "נמוך",   spend: 310000, materials: ["ברגים נירוסטה M8", "אומים", "דיבלים"] },
  { id: "SUP-007", name: "HPL ישראל", spendPct: 5.1, criticalPct: 70.0, alternatives: 1, spof: true,  risk: "קריטי",  spend: 255000, materials: ["לוח HPL 18 מ\"מ", "לוח HPL 22 מ\"מ"] },
  { id: "SUP-008", name: "גומי ואטמים בע\"מ", spendPct: 3.5, criticalPct: 40.0, alternatives: 3, spof: false, risk: "נמוך",   spend: 175000, materials: ["פרופיל גומי EPDM", "סרט הדבקה תעשייתי"] },
  { id: "SUP-009", name: "ייבוא מתכות דרום", spendPct: 1.9, criticalPct: 15.0, alternatives: 6, spof: false, risk: "נמוך",   spend: 95000, materials: ["פח מגולוון 1.5 מ\"מ", "פח מגולוון 2.0 מ\"מ"] },
  { id: "SUP-010", name: "צבעי המפרץ", spendPct: 0.8, criticalPct: 10.0, alternatives: 4, spof: false, risk: "נמוך",   spend: 40000, materials: ["צבע אפוקסי RAL7016", "פריימר"] },
];

const riskColor: Record<string, string> = {
  "קריטי": "bg-red-500/20 text-red-400",
  "בינוני": "bg-yellow-500/20 text-yellow-400",
  "נמוך": "bg-green-500/20 text-green-400",
};

/* ── alerts ──────────────────────────────────────────────────────── */
const alerts = [
  { supplier: "אלומיניום ישראל בע\"מ", message: "ספק יחיד ל-65% מהחומרים הקריטיים - נדרשת גיוון דחוף", severity: "קריטי" },
  { supplier: "זכוכית הגליל", message: "חלופה אחת בלבד - סיכון שרשרת אספקה גבוה", severity: "קריטי" },
  { supplier: "HPL ישראל", message: "תלות גבוהה בספק יחיד ללוחות HPL - נדרש ספק גיבוי", severity: "קריטי" },
  { supplier: "כימיקלים מרכז", message: "עלייה של 12% בהוצאות ברבעון האחרון - לבחון חלופות מחיר", severity: "בינוני" },
];

/* ================================================================ */
export default function SupplierDependency() {
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState("all");

  /* KPI computations */
  const totalSpend = suppliers.reduce((s, sup) => s + sup.spend, 0);
  const topSupplierPct = Math.max(...suppliers.map(s => s.spendPct));
  const criticalAvg = suppliers.reduce((s, sup) => s + sup.criticalPct, 0) / suppliers.length;
  const totalAlternatives = suppliers.reduce((s, sup) => s + sup.alternatives, 0);
  const spofCount = suppliers.filter(s => s.spof).length;

  const kpis = [
    { label: "ריכוז הוצאות (ספק מוביל)", value: pct(topSupplierPct), icon: TrendingUp, color: "text-red-400" },
    { label: "% חומרים קריטיים (ממוצע)", value: pct(criticalAvg), icon: Package, color: "text-yellow-400" },
    { label: 'סה"כ חלופות זמינות', value: fmt(totalAlternatives), icon: Users, color: "text-blue-400" },
    { label: "נקודות כשל בודדות (SPOF)", value: spofCount, icon: ShieldAlert, color: "text-red-400" },
  ];

  /* filtered list */
  const sl = search.toLowerCase();
  const filtered = useMemo(() => {
    let arr = [...suppliers];
    if (sl) arr = arr.filter(s => s.name.toLowerCase().includes(sl) || s.materials.some(m => m.toLowerCase().includes(sl)));
    if (riskFilter !== "all") arr = arr.filter(s => s.risk === riskFilter);
    return arr;
  }, [sl, riskFilter]);

  return (
    <div dir="rtl" className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-orange-500/10">
            <Link className="w-6 h-6 text-orange-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">תלות בספקים</h1>
            <p className="text-sm text-muted-foreground">ניתוח תלות, חלופות ונקודות כשל בשרשרת האספקה - טכנו-כל עוזי</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
            className="bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground"
          >
            <option value="all">כל הרמות</option>
            <option value="קריטי">קריטי</option>
            <option value="בינוני">בינוני</option>
            <option value="נמוך">נמוך</option>
          </select>
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              className="bg-muted/50 border border-border rounded-lg pr-9 pl-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-orange-500/40 w-60"
              placeholder="חיפוש ספק או חומר..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <Card key={k.label} className="bg-card border-border">
            <CardContent className="p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{k.label}</span>
                <k.icon className={`w-4 h-4 ${k.color}`} />
              </div>
              <span className="text-2xl font-bold text-foreground">{k.value}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Supplier Dependency Table */}
      <Card className="bg-card border-border overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-right text-muted-foreground">ספק</TableHead>
                  <TableHead className="text-center text-muted-foreground">% הוצאות</TableHead>
                  <TableHead className="text-center text-muted-foreground">הוצאה שנתית</TableHead>
                  <TableHead className="text-center text-muted-foreground">% חומרים קריטיים</TableHead>
                  <TableHead className="text-center text-muted-foreground">חלופות</TableHead>
                  <TableHead className="text-center text-muted-foreground">SPOF</TableHead>
                  <TableHead className="text-center text-muted-foreground w-28">ריכוז</TableHead>
                  <TableHead className="text-center text-muted-foreground">רמת סיכון</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((sup) => (
                  <TableRow key={sup.id} className={`border-border hover:bg-muted/30 ${sup.spof ? "bg-red-500/5" : ""}`}>
                    <TableCell>
                      <div>
                        <div className="font-semibold text-foreground">{sup.name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{sup.materials.slice(0, 2).join(", ")}{sup.materials.length > 2 ? ` +${sup.materials.length - 2}` : ""}</div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center font-mono text-foreground">{pct(sup.spendPct)}</TableCell>
                    <TableCell className="text-center font-mono text-foreground">{fmtCurrency(sup.spend)}</TableCell>
                    <TableCell className="text-center font-mono text-foreground">{pct(sup.criticalPct)}</TableCell>
                    <TableCell className="text-center">
                      <span className={`font-bold ${sup.alternatives <= 1 ? "text-red-400" : sup.alternatives <= 2 ? "text-yellow-400" : "text-green-400"}`}>
                        {sup.alternatives}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      {sup.spof ? (
                        <Badge variant="outline" className="bg-red-500/20 text-red-400 border-0 text-xs">כן</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-green-500/20 text-green-400 border-0 text-xs">לא</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={sup.spendPct * 3} className="h-2 flex-1 bg-muted/40" />
                        <span className="text-xs text-muted-foreground w-10 text-left">{pct(sup.spendPct)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className={`${riskColor[sup.risk]} border-0 text-xs`}>{sup.risk}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Over-Dependency Alerts */}
      <Card className="bg-card border-border">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <h2 className="text-lg font-semibold text-foreground">התראות תלות יתר</h2>
          </div>
          <div className="space-y-3">
            {alerts.map((alert, i) => (
              <div
                key={i}
                className={`flex items-start gap-3 p-3 rounded-lg border ${
                  alert.severity === "קריטי" ? "border-red-500/30 bg-red-500/5" : "border-yellow-500/30 bg-yellow-500/5"
                }`}
              >
                <ShieldAlert className={`w-4 h-4 mt-0.5 ${alert.severity === "קריטי" ? "text-red-400" : "text-yellow-400"}`} />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground text-sm">{alert.supplier}</span>
                    <Badge variant="outline" className={`${riskColor[alert.severity]} border-0 text-xs`}>{alert.severity}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{alert.message}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Footer */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <Clock className="w-3.5 h-3.5" />
        <span>עודכן: 08/04/2026 09:00</span>
        <span>|</span>
        <span>{spofCount} נקודות כשל בודדות</span>
        <span>|</span>
        <span>סה"כ הוצאות: {fmtCurrency(totalSpend)}</span>
      </div>
    </div>
  );
}
