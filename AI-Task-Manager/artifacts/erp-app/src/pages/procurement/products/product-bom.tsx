import { useState, useMemo } from "react";
import { Layers, Package, DollarSign, AlertTriangle, ChevronDown, BarChart3, GitCompare, ArrowUpDown, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";

const fmt = (v: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 2 }).format(v);
const fmtNum = (v: number) => new Intl.NumberFormat("he-IL", { maximumFractionDigits: 2 }).format(v);
const pct = (v: number) => `${v.toFixed(1)}%`;

interface BomLine { line: number; rm_code: string; name: string; category: string; quantity: number; cut_length_m: number; unit_cost: number; waste_pct: number; }

const PRODUCTS = [
  { id: "PRD-0001", name: "שער כניסה דגם Premium", bom_id: "BOM-1001" },
  { id: "PRD-0002", name: "גדר חניה דגם Classic", bom_id: "BOM-1002" },
  { id: "PRD-0003", name: "שער חשמלי דגם Pro", bom_id: "BOM-1003" },
];
const BOM_LINES: BomLine[] = [
  { line: 1, rm_code: "RM-1001", name: "צינור מרובע 40x40",   category: "פרופיל ברזל", quantity: 12, cut_length_m: 2.40, unit_cost: 38.50,  waste_pct: 8.0  },
  { line: 2, rm_code: "RM-1002", name: "זווית 50x50",          category: "פרופיל ברזל", quantity: 8,  cut_length_m: 1.20, unit_cost: 42.00,  waste_pct: 6.5  },
  { line: 3, rm_code: "RM-1003", name: "פח 2mm (1.25x2.5m)",   category: "לוחות מתכת", quantity: 2,  cut_length_m: 2.50, unit_cost: 185.00, waste_pct: 12.0 },
  { line: 4, rm_code: "RM-1004", name: "ציר כבד 150mm",        category: "פרזול",       quantity: 4,  cut_length_m: 0,    unit_cost: 65.00,  waste_pct: 0    },
  { line: 5, rm_code: "RM-1005", name: "מנעול צילינדר כפול",    category: "פרזול",       quantity: 1,  cut_length_m: 0,    unit_cost: 120.00, waste_pct: 0    },
  { line: 6, rm_code: "RM-1006", name: "חוט ריתוך MIG 0.8mm",  category: "מתכלים",      quantity: 1,  cut_length_m: 0,    unit_cost: 95.00,  waste_pct: 5.0  },
  { line: 7, rm_code: "RM-1007", name: "צבע יסוד אפוקסי 1L",   category: "צבעים",       quantity: 2,  cut_length_m: 0,    unit_cost: 54.00,  waste_pct: 3.0  },
  { line: 8, rm_code: "RM-1008", name: "אבקת צביעה RAL7016 1kg",category: "צבעים",      quantity: 3,  cut_length_m: 0,    unit_cost: 78.00,  waste_pct: 4.0  },
  { line: 9, rm_code: "RM-1009", name: "ברגי עיגון M12x100",    category: "פרזול",       quantity: 6,  cut_length_m: 0,    unit_cost: 8.50,   waste_pct: 0    },
  { line: 10,rm_code: "RM-1010", name: "דיסק חיתוך 125mm",     category: "מתכלים",      quantity: 3,  cut_length_m: 0,    unit_cost: 12.00,  waste_pct: 0    },
];

const BOM_VERSIONS = [
  { ver: "v3.1", date: "2026-03-15", lines: 10, cost: 2184.30, change: "הוספת ברגי עיגון + דיסק חיתוך" },
  { ver: "v3.0", date: "2026-01-20", lines: 8,  cost: 1978.50, change: "שדרוג פח ל-2mm" },
  { ver: "v2.0", date: "2025-09-05", lines: 7,  cost: 1745.00, change: "החלפת מנעול" },
  { ver: "v1.0", date: "2025-04-01", lines: 6,  cost: 1560.00, change: "גרסה ראשונית" },
];

function calcLine(l: BomLine) {
  const material = l.quantity * l.unit_cost;
  const waste = material * (l.waste_pct / 100);
  return { material, waste, total: material + waste };
}

function SummaryCard({ icon: Icon, label, value, sub, color }: { icon: any; label: string; value: string; sub?: string; color: string }) {
  return (
    <Card className="bg-[#1a1d23] border-[#2a2d35]">
      <CardContent className="p-4 flex items-center gap-4">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${color}`}><Icon className="w-5 h-5 text-white" /></div>
        <div className="flex-1 text-right">
          <div className="text-xs text-gray-400 mb-0.5">{label}</div>
          <div className="text-lg font-bold text-white">{value}</div>
          {sub && <div className="text-[11px] text-gray-500">{sub}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

/* ── main component ── */
export default function ProductBOM() {
  const [selectedProduct, setSelectedProduct] = useState(PRODUCTS[0]);
  const [activeTab, setActiveTab] = useState("components");
  const [sortField, setSortField] = useState<keyof BomLine>("line");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const sorted = useMemo(() => [...BOM_LINES].sort((a, b) => {
    const av = a[sortField], bv = b[sortField];
    if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av;
    return sortDir === "asc" ? String(av).localeCompare(String(bv), "he") : String(bv).localeCompare(String(av), "he");
  }), [sortField, sortDir]);

  const totals = useMemo(() => {
    let materials = 0, waste = 0;
    BOM_LINES.forEach((l) => { const c = calcLine(l); materials += c.material; waste += c.waste; });
    return { materials, waste, grand: materials + waste, count: BOM_LINES.length };
  }, []);

  const categories = useMemo(() => {
    const map: Record<string, number> = {};
    BOM_LINES.forEach((l) => { const c = calcLine(l); map[l.category] = (map[l.category] || 0) + c.total; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, []);

  const toggleSort = (f: keyof BomLine) => {
    if (sortField === f) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(f); setSortDir("asc"); }
  };

  /* ── render ── */
  return (
    <div dir="rtl" className="min-h-screen bg-[#0f1117] text-white p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center"><Layers className="w-5 h-5 text-white" /></div>
          <div><h1 className="text-2xl font-bold">רכיבי ייצור (BOM)</h1><p className="text-sm text-gray-400">טכנו-כל עוזי — ניהול רכיבי ייצור למוצרים</p></div>
        </div>
        <Badge className="bg-indigo-500/20 text-indigo-300 border-indigo-500/30 text-xs">{selectedProduct.bom_id} &bull; v3.1</Badge>
      </div>

      <Card className="bg-[#1a1d23] border-[#2a2d35]">
        <CardContent className="p-4 flex items-center gap-4">
          <Package className="w-5 h-5 text-indigo-400" />
          <span className="text-sm text-gray-400">מוצר:</span>
          <div className="relative flex-1 max-w-md">
            <select value={selectedProduct.id} onChange={(e) => setSelectedProduct(PRODUCTS.find((p) => p.id === e.target.value)!)}
              className="w-full bg-[#12141a] border border-[#2a2d35] rounded-lg px-3 py-2 text-sm text-white appearance-none cursor-pointer focus:ring-1 focus:ring-indigo-500 outline-none">
              {PRODUCTS.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.id}</option>)}
            </select>
            <ChevronDown className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard icon={Package} label="סה״כ חומרים" value={String(totals.count)} sub={`${categories.length} קטגוריות`} color="bg-blue-600" />
        <SummaryCard icon={DollarSign} label="עלות חומרים" value={fmt(totals.materials)} sub="לפני פחת" color="bg-emerald-600" />
        <SummaryCard icon={AlertTriangle} label="עלות פחת" value={fmt(totals.waste)} sub={pct((totals.waste / totals.materials) * 100)} color="bg-amber-600" />
        <SummaryCard icon={TrendingUp} label="עלות סופית כולל פחת" value={fmt(totals.grand)} sub="עלות ייצור חומרים" color="bg-purple-600" />
      </div>

      {/* tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-[#1a1d23] border border-[#2a2d35] p-1">
          <TabsTrigger value="components" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-gray-400 gap-1.5">
            <Layers className="w-4 h-4" /> רכיבים
          </TabsTrigger>
          <TabsTrigger value="costs" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-gray-400 gap-1.5">
            <BarChart3 className="w-4 h-4" /> עלויות
          </TabsTrigger>
          <TabsTrigger value="compare" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-gray-400 gap-1.5">
            <GitCompare className="w-4 h-4" /> השוואה
          </TabsTrigger>
        </TabsList>

        {/* ── Tab 1: BOM lines ── */}
        <TabsContent value="components" className="space-y-4">
          <Card className="bg-[#1a1d23] border-[#2a2d35] overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#2a2d35] hover:bg-transparent">
                    {[{ key: "line", label: "#" }, { key: "rm_code", label: "קוד חומר" }, { key: "name", label: "שם חומר גלם" },
                      { key: "category", label: "קטגוריה" }, { key: "quantity", label: "כמות" }, { key: "cut_length_m", label: "אורך חיתוך (מ')" },
                      { key: "unit_cost", label: "עלות ליח' ₪" }, { key: "waste_pct", label: "פחת %" },
                    ].map((col) => (
                      <TableHead key={col.key} className="text-gray-400 text-xs cursor-pointer select-none hover:text-white transition-colors"
                        onClick={() => toggleSort(col.key as keyof BomLine)}>
                        <span className="flex items-center gap-1">{col.label}{sortField === col.key && <ArrowUpDown className="w-3 h-3 text-indigo-400" />}</span>
                      </TableHead>
                    ))}
                    <TableHead className="text-gray-400 text-xs">עלות פחת ₪</TableHead>
                    <TableHead className="text-gray-400 text-xs">סה״כ ₪</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((l) => {
                    const c = calcLine(l);
                    return (
                      <TableRow key={l.line} className="border-[#2a2d35] hover:bg-[#1e2128] transition-colors">
                        <TableCell className="text-gray-500 text-xs font-mono">{l.line}</TableCell>
                        <TableCell><Badge variant="outline" className="border-indigo-500/40 text-indigo-300 font-mono text-xs">{l.rm_code}</Badge></TableCell>
                        <TableCell className="font-medium text-sm">{l.name}</TableCell>
                        <TableCell><Badge className="bg-[#22252d] text-gray-300 border-[#2a2d35] text-xs">{l.category}</Badge></TableCell>
                        <TableCell className="text-sm font-mono">{l.quantity}</TableCell>
                        <TableCell className="text-sm font-mono">{l.cut_length_m > 0 ? fmtNum(l.cut_length_m) : "\u2014"}</TableCell>
                        <TableCell className="text-sm font-mono">{fmt(l.unit_cost)}</TableCell>
                        <TableCell>{l.waste_pct > 0
                          ? <span className={`text-xs font-mono ${l.waste_pct >= 10 ? "text-red-400" : l.waste_pct >= 5 ? "text-amber-400" : "text-green-400"}`}>{pct(l.waste_pct)}</span>
                          : <span className="text-gray-600 text-xs">{"\u2014"}</span>}</TableCell>
                        <TableCell className="text-sm font-mono text-amber-400">{c.waste > 0 ? fmt(c.waste) : "\u2014"}</TableCell>
                        <TableCell className="text-sm font-mono font-bold text-emerald-400">{fmt(c.total)}</TableCell>
                      </TableRow>
                    );
                  })}
                  {/* summary row */}
                  <TableRow className="border-[#2a2d35] bg-[#12141a] font-bold">
                    <TableCell colSpan={6} className="text-sm text-gray-300">סה״כ — {totals.count} רכיבים</TableCell>
                    <TableCell className="text-sm font-mono text-white">{fmt(totals.materials)}</TableCell>
                    <TableCell className="text-xs text-amber-300">{pct((totals.waste / totals.materials) * 100)}</TableCell>
                    <TableCell className="text-sm font-mono text-amber-400">{fmt(totals.waste)}</TableCell>
                    <TableCell className="text-sm font-mono text-emerald-400">{fmt(totals.grand)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* ── Tab 2: cost breakdown ── */}
        <TabsContent value="costs" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* category breakdown */}
            <Card className="bg-[#1a1d23] border-[#2a2d35]">
              <CardContent className="p-5 space-y-4">
                <h3 className="text-sm font-semibold text-gray-300">פירוט עלויות לפי קטגוריה</h3>
                {categories.map(([cat, cost]) => {
                  const share = (cost / totals.grand) * 100;
                  return (
                    <div key={cat} className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-400">{cat}</span>
                        <span className="text-white font-mono">{fmt(cost)} ({pct(share)})</span>
                      </div>
                      <Progress value={share} className="h-2 bg-[#22252d]" />
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* cost summary */}
            <Card className="bg-[#1a1d23] border-[#2a2d35]">
              <CardContent className="p-5 space-y-5">
                <h3 className="text-sm font-semibold text-gray-300">סיכום עלויות ייצור</h3>
                <div className="space-y-3">
                  {[{ label: "עלות חומרי גלם (נטו)", value: totals.materials, color: "text-blue-400" },
                    { label: "עלות פחת מצטבר", value: totals.waste, color: "text-amber-400" },
                    { label: "סה״כ עלות חומרים (ברוטו)", value: totals.grand, color: "text-emerald-400" },
                  ].map((row) => (
                    <div key={row.label} className="flex justify-between items-center py-2 border-b border-[#2a2d35] last:border-0">
                      <span className="text-sm text-gray-400">{row.label}</span>
                      <span className={`text-lg font-bold font-mono ${row.color}`}>{fmt(row.value)}</span>
                    </div>))}
                </div>
                <div className="bg-[#12141a] rounded-lg p-4 space-y-2 mt-2">
                  <div className="text-xs text-gray-500">פילוח פחת</div>
                  {BOM_LINES.filter((l) => l.waste_pct > 0).map((l) => {
                    const c = calcLine(l);
                    return (
                      <div key={l.rm_code} className="flex justify-between text-xs">
                        <span className="text-gray-400">{l.name}</span>
                        <span className="text-amber-400 font-mono">{fmt(c.waste)} ({pct(l.waste_pct)})</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Tab 3: compare versions ── */}
        <TabsContent value="compare" className="space-y-4">
          <Card className="bg-[#1a1d23] border-[#2a2d35]">
            <CardContent className="p-5 space-y-4">
              <h3 className="text-sm font-semibold text-gray-300">השוואת גרסאות BOM — {selectedProduct.name}</h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-[#2a2d35] hover:bg-transparent">
                      {["גרסה","תאריך","רכיבים","עלות כוללת ₪","שינוי","הפרש"].map((h) => (
                        <TableHead key={h} className="text-gray-400 text-xs">{h}</TableHead>))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {BOM_VERSIONS.map((v, i) => {
                      const prev = BOM_VERSIONS[i + 1];
                      const diff = prev ? v.cost - prev.cost : 0;
                      const diffPct = prev ? ((diff / prev.cost) * 100) : 0;
                      return (
                        <TableRow key={v.ver} className="border-[#2a2d35] hover:bg-[#1e2128]">
                          <TableCell><Badge className={i === 0 ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/30" : "bg-[#22252d] text-gray-400 border-[#2a2d35]"}>{v.ver} {i === 0 && "\u25CF פעיל"}</Badge></TableCell>
                          <TableCell className="text-sm text-gray-300 font-mono">{v.date}</TableCell>
                          <TableCell className="text-sm font-mono">{v.lines}</TableCell>
                          <TableCell className="text-sm font-mono text-emerald-400">{fmt(v.cost)}</TableCell>
                          <TableCell className="text-xs text-gray-400 max-w-[200px] truncate">{v.change}</TableCell>
                          <TableCell>{prev
                            ? <span className={`text-xs font-mono ${diff > 0 ? "text-red-400" : diff < 0 ? "text-green-400" : "text-gray-500"}`}>{diff > 0 ? "+" : ""}{fmt(diff)} ({diff > 0 ? "+" : ""}{diffPct.toFixed(1)}%)</span>
                            : <span className="text-gray-600 text-xs">{"\u2014"}</span>}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="bg-[#12141a] rounded-lg p-4 mt-2">
                <div className="text-xs text-gray-500 mb-3">מגמת עלויות לפי גרסה</div>
                <div className="flex items-end gap-3 h-32">
                  {[...BOM_VERSIONS].reverse().map((v) => {
                    const h = (v.cost / Math.max(...BOM_VERSIONS.map((b) => b.cost))) * 100;
                    return (
                      <div key={v.ver} className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-[10px] text-gray-500 font-mono">{fmt(v.cost)}</span>
                        <div className="w-full rounded-t-md bg-gradient-to-t from-indigo-600 to-indigo-400 transition-all" style={{ height: `${h}%` }} />
                        <span className="text-[10px] text-gray-400">{v.ver}</span>
                      </div>);
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
