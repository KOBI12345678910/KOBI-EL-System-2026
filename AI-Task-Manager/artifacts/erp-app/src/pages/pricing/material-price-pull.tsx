import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Search, Package, TrendingDown, Warehouse, FileText, Ship,
  CheckCircle2, ArrowDownUp, RefreshCw, Star, AlertTriangle,
  DollarSign, ChevronDown, ChevronUp
} from "lucide-react";

/* ──────────── types ──────────── */
type PriceSource = "stock" | "supplier" | "contract" | "import";

interface Material {
  id: string;
  name: string;
  rmCode: string;
  unit: string;
  qtyNeeded: number;
  stockAvailable: number;
  stockCost: number;
  supplierPrice: number;
  contractPrice: number | null;
  landedCost: number | null;
  lastUpdated: string;
}

/* ──────────── projects ──────────── */
const PROJECTS = [
  { id: "PRJ-2601", name: "שער חשמלי כפול — וילה אשכנזי, סביון" },
  { id: "PRJ-2602", name: "גדר בטחון 80 מ׳ — מפעל כימי חיפה" },
  { id: "PRJ-2603", name: "פרגולת אלומיניום — מלון רמדה נתניה" },
  { id: "PRJ-2604", name: "מעקות בטיחות x3 קומות — מגדל ת״א" },
];

/* ──────────── 10 BOM materials for gate project ──────────── */
const MATERIALS: Material[] = [
  { id: "RM-1001", name: "פרופיל ברזל 60x40x2 מ״מ",       rmCode: "FE-6040-2",  unit: "מטר",  qtyNeeded: 48,  stockAvailable: 120, stockCost: 38.50,  supplierPrice: 36.00, contractPrice: 34.20,  landedCost: 31.80,  lastUpdated: "2026-04-07" },
  { id: "RM-1002", name: "פרופיל ברזל 80x80x3 מ״מ",       rmCode: "FE-8080-3",  unit: "מטר",  qtyNeeded: 24,  stockAvailable: 15,  stockCost: 62.00,  supplierPrice: 58.50, contractPrice: 55.00,  landedCost: 52.40,  lastUpdated: "2026-04-06" },
  { id: "RM-1003", name: "צירים כבדים נירוסטה 200 מ״מ",    rmCode: "HW-HNG-200", unit: "יחידה", qtyNeeded: 6,   stockAvailable: 22,  stockCost: 145.00, supplierPrice: 138.00, contractPrice: null,   landedCost: 118.50, lastUpdated: "2026-04-05" },
  { id: "RM-1004", name: "מנעול אלקטרומגנטי 600 ק״ג",     rmCode: "HW-LCK-600", unit: "יחידה", qtyNeeded: 2,   stockAvailable: 5,   stockCost: 420.00, supplierPrice: 395.00, contractPrice: 380.00, landedCost: 345.00, lastUpdated: "2026-04-07" },
  { id: "RM-1005", name: "צבע אלקטרוסטטי RAL 7016",       rmCode: "PT-RAL7016", unit: 'ק"ג',  qtyNeeded: 12,  stockAvailable: 35,  stockCost: 78.00,  supplierPrice: 72.50, contractPrice: 68.00,  landedCost: null,   lastUpdated: "2026-04-04" },
  { id: "RM-1006", name: "חוט ריתוך MIG 1.0 מ״מ (15 ק״ג)", rmCode: "WL-MIG-10",  unit: "גליל",  qtyNeeded: 3,   stockAvailable: 8,   stockCost: 195.00, supplierPrice: 185.00, contractPrice: 178.00, landedCost: 162.00, lastUpdated: "2026-04-06" },
  { id: "RM-1007", name: "גלגלת V מסילה 80 מ״מ",          rmCode: "HW-WHL-80",  unit: "יחידה", qtyNeeded: 8,   stockAvailable: 30,  stockCost: 56.00,  supplierPrice: 52.00, contractPrice: null,   landedCost: 44.50,  lastUpdated: "2026-04-07" },
  { id: "RM-1008", name: "מסילת ברזל U-channel 3 מ׳",     rmCode: "FE-UCH-3M",  unit: "יחידה", qtyNeeded: 4,   stockAvailable: 6,   stockCost: 210.00, supplierPrice: 198.00, contractPrice: 188.00, landedCost: 175.00, lastUpdated: "2026-04-05" },
  { id: "RM-1009", name: "פח ברזל 2 מ״מ 1.25x2.5 מ׳",     rmCode: "FE-SHT-2",   unit: "גיליון", qtyNeeded: 3,   stockAvailable: 10,  stockCost: 320.00, supplierPrice: 305.00, contractPrice: 290.00, landedCost: 268.00, lastUpdated: "2026-04-07" },
  { id: "RM-1010", name: "דיסקים חיתוך 230 מ״מ (חבילת 25)", rmCode: "TL-DSC-230", unit: "חבילה", qtyNeeded: 2,   stockAvailable: 14,  stockCost: 89.00,  supplierPrice: 82.00, contractPrice: 76.00,  landedCost: null,   lastUpdated: "2026-04-03" },
];

/* ──────────── helpers ──────────── */
const fmt = (v: number) => v.toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtCurrency = (v: number) => `₪${fmt(v)}`;
const fmtInt = (v: number) => v.toLocaleString("he-IL");

const SOURCE_LABELS: Record<PriceSource, string> = {
  stock: "עלות מלאי", supplier: "מחיר ספק", contract: "חוזה מסגרת", import: "נחיתה מיובא",
};
const SOURCE_COLORS: Record<PriceSource, string> = {
  stock: "bg-slate-500/20 text-slate-300 border-slate-500/30",
  supplier: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  contract: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  import: "bg-amber-500/20 text-amber-300 border-amber-500/30",
};
const SOURCE_ICONS: Record<PriceSource, React.ReactNode> = {
  stock: <Warehouse className="w-3.5 h-3.5" />,
  supplier: <Package className="w-3.5 h-3.5" />,
  contract: <FileText className="w-3.5 h-3.5" />,
  import: <Ship className="w-3.5 h-3.5" />,
};

function getBestPrice(m: Material): { price: number; source: PriceSource } {
  const candidates: { price: number; source: PriceSource }[] = [
    { price: m.stockCost, source: "stock" },
    { price: m.supplierPrice, source: "supplier" },
  ];
  if (m.contractPrice !== null) candidates.push({ price: m.contractPrice, source: "contract" });
  if (m.landedCost !== null) candidates.push({ price: m.landedCost, source: "import" });
  return candidates.reduce((best, c) => c.price < best.price ? c : best);
}

/* ══════════════════════════════════════════════════════════
   COMPONENT
   ══════════════════════════════════════════════════════════ */
export default function MaterialPricePull() {
  const [selectedProject, setSelectedProject] = useState(PROJECTS[0].id);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<"name" | "saving" | "best">("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [showDetails, setShowDetails] = useState<string | null>(null);

  const project = PROJECTS.find(p => p.id === selectedProject)!;

  const filtered = useMemo(() => {
    let list = MATERIALS.filter(m =>
      m.name.includes(searchTerm) || m.rmCode.toLowerCase().includes(searchTerm.toLowerCase())
    );
    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === "name") cmp = a.name.localeCompare(b.name, "he");
      else if (sortField === "best") cmp = getBestPrice(a).price - getBestPrice(b).price;
      else {
        const savA = a.stockCost - getBestPrice(a).price;
        const savB = b.stockCost - getBestPrice(b).price;
        cmp = savB - savA;
      }
      return sortAsc ? cmp : -cmp;
    });
    return list;
  }, [searchTerm, sortField, sortAsc]);

  const summary = useMemo(() => {
    let totalStock = 0, totalBest = 0;
    MATERIALS.forEach(m => {
      const best = getBestPrice(m);
      totalStock += m.stockCost * m.qtyNeeded;
      totalBest += best.price * m.qtyNeeded;
    });
    return { totalStock, totalBest, saving: totalStock - totalBest, savingPct: totalStock > 0 ? ((totalStock - totalBest) / totalStock * 100) : 0 };
  }, []);

  const sourceBreakdown = useMemo(() => {
    const counts: Record<PriceSource, { count: number; total: number }> = {
      stock: { count: 0, total: 0 }, supplier: { count: 0, total: 0 },
      contract: { count: 0, total: 0 }, import: { count: 0, total: 0 },
    };
    MATERIALS.forEach(m => {
      const best = getBestPrice(m);
      counts[best.source].count++;
      counts[best.source].total += best.price * m.qtyNeeded;
    });
    return counts;
  }, []);

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(true); }
  };

  const priceCell = (value: number | null, isBest: boolean) => {
    if (value === null) return <span className="text-muted-foreground/40 text-xs">---</span>;
    return (
      <span className={`text-xs font-mono ${isBest ? "text-emerald-400 font-bold" : "text-foreground/70"}`}>
        {fmtCurrency(value)}
        {isBest && <Star className="w-3 h-3 inline mr-1 text-emerald-400" />}
      </span>
    );
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* ── header ── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-700 flex items-center justify-center">
            <Search className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">שליפת מחירי חומרי גלם לתמחור</h1>
            <p className="text-sm text-muted-foreground">טכנו-כל עוזי — השוואת 4 מקורות מחיר אוטומטית</p>
          </div>
        </div>
        <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-cyan-500/20 text-sm text-cyan-300 hover:bg-cyan-500/30 transition">
          <RefreshCw className="w-4 h-4" /> רענון מחירים
        </button>
      </div>

      {/* ── project selector ── */}
      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-4">
          <label className="text-xs font-medium text-muted-foreground block mb-2">בחירת פרויקט לשליפת BOM</label>
          <select
            value={selectedProject}
            onChange={e => setSelectedProject(e.target.value)}
            className="w-full bg-background/50 border border-border rounded-lg px-4 py-2.5 text-sm text-foreground focus:ring-2 focus:ring-cyan-500/40 focus:outline-none"
          >
            {PROJECTS.map(p => (
              <option key={p.id} value={p.id}>{p.id} — {p.name}</option>
            ))}
          </select>
          <div className="flex gap-6 mt-3 text-xs text-muted-foreground">
            <span>מזהה: <span className="text-foreground font-medium">{project.id}</span></span>
            <span>חומרים ב-BOM: <span className="text-foreground font-medium">{MATERIALS.length}</span></span>
            <span>עדכון אחרון: <span className="text-foreground font-medium">2026-04-07</span></span>
          </div>
        </CardContent>
      </Card>

      {/* ── 4 source summary cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(["stock", "supplier", "contract", "import"] as PriceSource[]).map(src => (
          <Card key={src} className={`border ${SOURCE_COLORS[src].split(" ")[2]} bg-card/50`}>
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-2">
                {SOURCE_ICONS[src]}
                <span className="text-xs font-medium text-muted-foreground">{SOURCE_LABELS[src]}</span>
              </div>
              <div className="text-lg font-bold text-foreground">{sourceBreakdown[src].count} פריטים</div>
              <div className="text-sm text-muted-foreground">{fmtCurrency(sourceBreakdown[src].total)}</div>
              <Progress value={MATERIALS.length > 0 ? (sourceBreakdown[src].count / MATERIALS.length * 100) : 0} className="mt-2 h-1" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── search + sort controls ── */}
      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[200px] relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="חיפוש חומר או קוד RM..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-background/50 border border-border rounded-lg pr-10 pl-4 py-2 text-sm text-foreground focus:ring-2 focus:ring-cyan-500/40 focus:outline-none"
              />
            </div>
            <div className="flex gap-2 text-xs">
              {([
                { field: "name" as const, label: "שם" },
                { field: "best" as const, label: "מחיר מיטבי" },
                { field: "saving" as const, label: "חיסכון" },
              ]).map(s => (
                <button
                  key={s.field}
                  onClick={() => toggleSort(s.field)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md transition ${
                    sortField === s.field
                      ? "bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-500/30"
                      : "bg-muted/20 text-muted-foreground hover:bg-muted/40"
                  }`}
                >
                  <ArrowDownUp className="w-3 h-3" /> {s.label}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── main price comparison table ── */}
      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
            <h2 className="text-sm font-semibold text-foreground">השוואת מחירים — 4 מקורות</h2>
            <Badge className="bg-cyan-500/20 text-cyan-300">{filtered.length} / {MATERIALS.length} חומרים</Badge>
          </div>

          {/* header */}
          <div className="grid grid-cols-[1.8fr_0.7fr_0.5fr_0.5fr_0.7fr_0.7fr_0.7fr_0.7fr_0.8fr_0.6fr] gap-1 px-4 py-2 border-b border-border/30 text-[11px] text-muted-foreground font-medium">
            <span>חומר</span>
            <span className="text-center">קוד RM</span>
            <span className="text-center">כמות</span>
            <span className="text-center">מלאי</span>
            <span className="text-center">עלות מלאי</span>
            <span className="text-center">מחיר ספק</span>
            <span className="text-center">חוזה</span>
            <span className="text-center">נחיתה</span>
            <span className="text-center">מחיר מיטבי</span>
            <span className="text-center">מקור</span>
          </div>

          {/* rows */}
          {filtered.map(m => {
            const best = getBestPrice(m);
            const lineCost = best.price * m.qtyNeeded;
            const stockLineCost = m.stockCost * m.qtyNeeded;
            const lineSaving = stockLineCost - lineCost;
            const stockSufficient = m.stockAvailable >= m.qtyNeeded;
            const isExpanded = showDetails === m.id;

            return (
              <div key={m.id}>
                <div
                  onClick={() => setShowDetails(isExpanded ? null : m.id)}
                  className="grid grid-cols-[1.8fr_0.7fr_0.5fr_0.5fr_0.7fr_0.7fr_0.7fr_0.7fr_0.8fr_0.6fr] gap-1 px-4 py-2.5 border-b border-border/10 hover:bg-muted/10 transition items-center cursor-pointer"
                >
                  {/* name */}
                  <div className="flex items-center gap-1.5">
                    {isExpanded ? <ChevronUp className="w-3 h-3 text-muted-foreground shrink-0" /> : <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />}
                    <span className="text-sm text-foreground truncate">{m.name}</span>
                  </div>
                  {/* RM code */}
                  <span className="text-center text-xs font-mono text-muted-foreground">{m.rmCode}</span>
                  {/* qty needed */}
                  <span className="text-center text-xs text-foreground">{fmtInt(m.qtyNeeded)} {m.unit}</span>
                  {/* stock available */}
                  <div className="text-center">
                    <span className={`text-xs ${stockSufficient ? "text-emerald-400" : "text-red-400"}`}>
                      {fmtInt(m.stockAvailable)}
                    </span>
                    {!stockSufficient && <AlertTriangle className="w-3 h-3 inline mr-1 text-red-400" />}
                  </div>
                  {/* 4 price columns */}
                  {priceCell(m.stockCost, best.source === "stock")}
                  {priceCell(m.supplierPrice, best.source === "supplier")}
                  {priceCell(m.contractPrice, best.source === "contract")}
                  {priceCell(m.landedCost, best.source === "import")}
                  {/* best price */}
                  <div className="text-center">
                    <span className="text-sm font-bold text-emerald-400">{fmtCurrency(best.price)}</span>
                  </div>
                  {/* source badge */}
                  <div className="flex justify-center">
                    <Badge className={`text-[10px] px-1.5 ${SOURCE_COLORS[best.source]}`}>
                      {SOURCE_LABELS[best.source].split(" ").pop()}
                    </Badge>
                  </div>
                </div>

                {/* expanded detail row */}
                {isExpanded && (
                  <div className="px-6 py-3 bg-muted/5 border-b border-border/20 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                    <div>
                      <span className="text-muted-foreground">עלות שורה (מיטבי):</span>
                      <span className="text-foreground font-bold mr-2">{fmtCurrency(lineCost)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">עלות שורה (מלאי):</span>
                      <span className="text-foreground mr-2">{fmtCurrency(stockLineCost)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">חיסכון בשורה:</span>
                      <span className={`font-bold mr-2 ${lineSaving > 0 ? "text-emerald-400" : "text-foreground"}`}>
                        {fmtCurrency(lineSaving)}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">עדכון אחרון:</span>
                      <span className="text-foreground mr-2">{m.lastUpdated}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-muted-foreground text-sm">לא נמצאו חומרים מתאימים</div>
          )}
        </CardContent>
      </Card>

      {/* ── total summary ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4 text-center">
            <div className="text-xs text-muted-foreground mb-1">עלות כוללת (מלאי)</div>
            <div className="text-xl font-bold text-foreground">{fmtCurrency(summary.totalStock)}</div>
          </CardContent>
        </Card>
        <Card className="bg-emerald-500/10 border-emerald-500/30">
          <CardContent className="p-4 text-center">
            <div className="text-xs text-muted-foreground mb-1">עלות כוללת (מיטבי)</div>
            <div className="text-xl font-bold text-emerald-400">{fmtCurrency(summary.totalBest)}</div>
            <CheckCircle2 className="w-4 h-4 text-emerald-400 inline mt-1" />
          </CardContent>
        </Card>
        <Card className="bg-cyan-500/10 border-cyan-500/30">
          <CardContent className="p-4 text-center">
            <div className="text-xs text-muted-foreground mb-1">חיסכון כולל</div>
            <div className="text-xl font-bold text-cyan-400">{fmtCurrency(summary.saving)}</div>
            <TrendingDown className="w-4 h-4 text-cyan-400 inline mt-1" />
          </CardContent>
        </Card>
        <Card className="bg-purple-500/10 border-purple-500/30">
          <CardContent className="p-4 text-center">
            <div className="text-xs text-muted-foreground mb-1">אחוז חיסכון</div>
            <div className="text-xl font-bold text-purple-400">{summary.savingPct.toFixed(1)}%</div>
            <Progress value={summary.savingPct} className="mt-2 h-1.5" />
          </CardContent>
        </Card>
      </div>

      {/* ── footer ── */}
      <div className="text-center text-xs text-muted-foreground pb-4">
        <DollarSign className="w-3 h-3 inline -mt-0.5 ml-1" />
        שליפת מחירים טכנו-כל עוזי — {MATERIALS.length} חומרי גלם &bull; 4 מקורות מחיר &bull; חיסכון {summary.savingPct.toFixed(1)}%
      </div>
    </div>
  );
}
