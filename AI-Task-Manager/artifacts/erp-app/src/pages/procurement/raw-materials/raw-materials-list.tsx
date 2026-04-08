import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Search, Package, Layers, AlertTriangle, CheckCircle2,
  ArrowUpDown, Filter, Download, TrendingUp, TrendingDown,
  Minus, Warehouse, Ruler, Weight, DollarSign, Factory
} from "lucide-react";

// ============================================================
// FORMATTERS
// ============================================================
const fmt = (v: number) => new Intl.NumberFormat("he-IL").format(v);
const fmtCurrency = (v: number) => "\u20AA" + new Intl.NumberFormat("he-IL", { maximumFractionDigits: 2 }).format(v);
const fmtDec = (v: number) => new Intl.NumberFormat("he-IL", { minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(v);

// ============================================================
// TYPES
// ============================================================
interface RawMaterial {
  material_code: string;
  material_name: string;
  category: string;
  subcategory: string;
  material_type: string;
  alloy_or_grade: string;
  dimensions_display: string;
  thickness_mm: number | null;
  width_mm: number | null;
  height_mm: number | null;
  length_m: number | null;
  unit_of_measure: string;
  weight_per_meter: number | null;
  total_weight_unit: number | null;
  cost_before_vat: number;
  cost_after_vat: number;
  last_purchase_price: number;
  average_price: number;
  preferred_supplier: string;
  stock_on_hand: number;
  minimum_stock: number;
  status: string;
}

// ============================================================
// CATEGORY BADGES
// ============================================================
const CATEGORY_COLORS: Record<string, string> = {
  "ברזל": "bg-orange-500/20 text-orange-300 border-orange-500/30",
  "אלומיניום": "bg-sky-500/20 text-sky-300 border-sky-500/30",
  "זכוכית": "bg-violet-500/20 text-violet-300 border-violet-500/30",
  "נירוסטה": "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  "פרזול": "bg-amber-500/20 text-amber-300 border-amber-500/30",
  "מתכלים": "bg-rose-500/20 text-rose-300 border-rose-500/30",
};

const STATUS_COLORS: Record<string, string> = {
  "פעיל": "bg-green-500/20 text-green-300 border-green-500/30",
  "מלאי נמוך": "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  "אזל מהמלאי": "bg-red-500/20 text-red-300 border-red-500/30",
  "לא פעיל": "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

// ============================================================
// MOCK DATA — 14 realistic factory materials
// ============================================================
const materials: RawMaterial[] = [
  {
    material_code: "RM-1001", material_name: "צינור מרובע 40x40x2", category: "ברזל", subcategory: "צינורות", material_type: "פלדה שחורה",
    alloy_or_grade: "ST37", dimensions_display: "40x40x2 מ\"מ", thickness_mm: 2, width_mm: 40, height_mm: 40, length_m: 6,
    unit_of_measure: "יח' (6 מ')", weight_per_meter: 2.31, total_weight_unit: 13.86,
    cost_before_vat: 89, cost_after_vat: 104.13, last_purchase_price: 91, average_price: 87.5,
    preferred_supplier: "מפעלי ברזל השרון", stock_on_hand: 185, minimum_stock: 50, status: "פעיל",
  },
  {
    material_code: "RM-1002", material_name: 'זווית ברזל 50x50x4', category: "ברזל", subcategory: "זוויתנים", material_type: "פלדה שחורה",
    alloy_or_grade: "ST37", dimensions_display: "50x50x4 מ\"מ", thickness_mm: 4, width_mm: 50, height_mm: 50, length_m: 6,
    unit_of_measure: "יח' (6 מ')", weight_per_meter: 2.97, total_weight_unit: 17.82,
    cost_before_vat: 115, cost_after_vat: 134.55, last_purchase_price: 118, average_price: 112,
    preferred_supplier: "ברזל צפון", stock_on_hand: 72, minimum_stock: 30, status: "פעיל",
  },
  {
    material_code: "RM-1003", material_name: "פח ברזל שחור 2 מ\"מ", category: "ברזל", subcategory: "פחים", material_type: "פלדה שחורה",
    alloy_or_grade: "ST37", dimensions_display: '1250x2500x2 מ"מ', thickness_mm: 2, width_mm: 1250, height_mm: null, length_m: 2.5,
    unit_of_measure: 'מ"ר', weight_per_meter: null, total_weight_unit: 49.1,
    cost_before_vat: 320, cost_after_vat: 374.4, last_purchase_price: 335, average_price: 315,
    preferred_supplier: "מפעלי ברזל השרון", stock_on_hand: 38, minimum_stock: 20, status: "פעיל",
  },
  {
    material_code: "RM-1004", material_name: "I-Beam IPE 120", category: "ברזל", subcategory: "קורות", material_type: "פלדה מבנית",
    alloy_or_grade: "S275JR", dimensions_display: "IPE 120 - 6 מ'", thickness_mm: 6.3, width_mm: 64, height_mm: 120, length_m: 6,
    unit_of_measure: "יח' (6 מ')", weight_per_meter: 10.4, total_weight_unit: 62.4,
    cost_before_vat: 485, cost_after_vat: 567.45, last_purchase_price: 495, average_price: 478,
    preferred_supplier: "Metalcorp EU", stock_on_hand: 12, minimum_stock: 10, status: "מלאי נמוך",
  },
  {
    material_code: "RM-2001", material_name: "פרופיל בלגי 4500", category: "אלומיניום", subcategory: "פרופילים", material_type: "אלומיניום חול",
    alloy_or_grade: "6060-T6", dimensions_display: "קטלוג 4500 - 6.5 מ'", thickness_mm: 1.5, width_mm: 45, height_mm: 65, length_m: 6.5,
    unit_of_measure: "יח' (6.5 מ')", weight_per_meter: 0.85, total_weight_unit: 5.53,
    cost_before_vat: 62, cost_after_vat: 72.54, last_purchase_price: 64, average_price: 60,
    preferred_supplier: "Alumil SA", stock_on_hand: 340, minimum_stock: 100, status: "פעיל",
  },
  {
    material_code: "RM-2002", material_name: "פרופיל חלון הזזה", category: "אלומיניום", subcategory: "פרופילים", material_type: "אלומיניום תרמי",
    alloy_or_grade: "6063-T5", dimensions_display: "מסילה + כנף - 6.5 מ'", thickness_mm: 1.8, width_mm: 72, height_mm: 38, length_m: 6.5,
    unit_of_measure: "יח' (6.5 מ')", weight_per_meter: 1.42, total_weight_unit: 9.23,
    cost_before_vat: 95, cost_after_vat: 111.15, last_purchase_price: 98, average_price: 93,
    preferred_supplier: "Schüco International", stock_on_hand: 156, minimum_stock: 80, status: "פעיל",
  },
  {
    material_code: "RM-2003", material_name: "פרופיל מעקה בטיחות", category: "אלומיניום", subcategory: "פרופילים", material_type: "אלומיניום אנודייז",
    alloy_or_grade: "6061-T6", dimensions_display: "מאחז 50mm - 6 מ'", thickness_mm: 2.5, width_mm: 50, height_mm: 50, length_m: 6,
    unit_of_measure: "יח' (6 מ')", weight_per_meter: 1.18, total_weight_unit: 7.08,
    cost_before_vat: 78, cost_after_vat: 91.26, last_purchase_price: 80, average_price: 76,
    preferred_supplier: "אלומיניום הגליל", stock_on_hand: 210, minimum_stock: 60, status: "פעיל",
  },
  {
    material_code: "RM-3001", material_name: 'זכוכית מחוסמת 8 מ"מ', category: "זכוכית", subcategory: "מחוסמת", material_type: "זכוכית בטיחותית",
    alloy_or_grade: "שקוף ESG", dimensions_display: 'לפי הזמנה - 8 מ"מ', thickness_mm: 8, width_mm: null, height_mm: null, length_m: null,
    unit_of_measure: 'מ"ר', weight_per_meter: null, total_weight_unit: 20,
    cost_before_vat: 185, cost_after_vat: 216.45, last_purchase_price: 190, average_price: 182,
    preferred_supplier: "זכוכית ירושלים", stock_on_hand: 95, minimum_stock: 40, status: "פעיל",
  },
  {
    material_code: "RM-3002", material_name: 'זכוכית שכבתית 10 מ"מ', category: "זכוכית", subcategory: "שכבתית", material_type: "למינציה PVB",
    alloy_or_grade: "5+5 PVB 0.76", dimensions_display: 'לפי הזמנה - 10 מ"מ', thickness_mm: 10, width_mm: null, height_mm: null, length_m: null,
    unit_of_measure: 'מ"ר', weight_per_meter: null, total_weight_unit: 25,
    cost_before_vat: 260, cost_after_vat: 304.2, last_purchase_price: 270, average_price: 255,
    preferred_supplier: "AGC Glass", stock_on_hand: 18, minimum_stock: 25, status: "מלאי נמוך",
  },
  {
    material_code: "RM-4001", material_name: 'צינור נירוסטה 42 מ"מ', category: "נירוסטה", subcategory: "צינורות", material_type: "נירוסטה אוסטניטית",
    alloy_or_grade: "AISI 304", dimensions_display: '42x1.5 מ"מ - 6 מ\'', thickness_mm: 1.5, width_mm: 42, height_mm: null, length_m: 6,
    unit_of_measure: "יח' (6 מ')", weight_per_meter: 1.5, total_weight_unit: 9,
    cost_before_vat: 210, cost_after_vat: 245.7, last_purchase_price: 215, average_price: 205,
    preferred_supplier: "Metalcorp EU", stock_on_hand: 45, minimum_stock: 20, status: "פעיל",
  },
  {
    material_code: "RM-5001", material_name: 'ציר כבד 120 מ"מ', category: "פרזול", subcategory: "צירים", material_type: "פרזול שער",
    alloy_or_grade: "פלדה מגולוונת", dimensions_display: '120 מ"מ - זוג', thickness_mm: null, width_mm: null, height_mm: null, length_m: null,
    unit_of_measure: "זוג", weight_per_meter: null, total_weight_unit: 2.8,
    cost_before_vat: 145, cost_after_vat: 169.65, last_purchase_price: 148, average_price: 140,
    preferred_supplier: "Würth", stock_on_hand: 65, minimum_stock: 30, status: "פעיל",
  },
  {
    material_code: "RM-5002", material_name: "מנעול צילינדר כפול", category: "פרזול", subcategory: "מנעולים", material_type: "פרזול דלת",
    alloy_or_grade: "פליז/נירוסטה", dimensions_display: "70 מ\"מ - כפול", thickness_mm: null, width_mm: null, height_mm: null, length_m: null,
    unit_of_measure: "יחידה", weight_per_meter: null, total_weight_unit: 0.35,
    cost_before_vat: 85, cost_after_vat: 99.45, last_purchase_price: 88, average_price: 83,
    preferred_supplier: "Mul-T-Lock", stock_on_hand: 0, minimum_stock: 20, status: "אזל מהמלאי",
  },
  {
    material_code: "RM-6001", material_name: 'חוט ריתוך MIG 1.2 מ"מ', category: "מתכלים", subcategory: "ריתוך", material_type: "חוט מגן גז",
    alloy_or_grade: "ER70S-6", dimensions_display: 'סליל 15 ק"ג - 1.2 מ"מ', thickness_mm: 1.2, width_mm: null, height_mm: null, length_m: null,
    unit_of_measure: 'סליל (15 ק"ג)', weight_per_meter: null, total_weight_unit: 15,
    cost_before_vat: 195, cost_after_vat: 228.15, last_purchase_price: 198, average_price: 190,
    preferred_supplier: "Lincoln Electric", stock_on_hand: 22, minimum_stock: 10, status: "פעיל",
  },
  {
    material_code: "RM-6002", material_name: "דיסק חיתוך 230 מ\"מ", category: "מתכלים", subcategory: "חיתוך", material_type: "דיסק אבן",
    alloy_or_grade: "A30S-BF", dimensions_display: '230x3x22 מ"מ', thickness_mm: 3, width_mm: 230, height_mm: null, length_m: null,
    unit_of_measure: "יחידה", weight_per_meter: null, total_weight_unit: 0.42,
    cost_before_vat: 12, cost_after_vat: 14.04, last_purchase_price: 12.5, average_price: 11.8,
    preferred_supplier: "Würth", stock_on_hand: 148, minimum_stock: 50, status: "פעיל",
  },
];

const CATEGORIES = ["הכל", "ברזל", "אלומיניום", "זכוכית", "נירוסטה", "פרזול", "מתכלים"];

// ============================================================
// COMPONENT
// ============================================================
export default function RawMaterialsList() {
  const [search, setSearch] = useState("");
  const [categoryTab, setCategoryTab] = useState("הכל");
  const [statusFilter, setStatusFilter] = useState("הכל");
  const [sortField, setSortField] = useState<keyof RawMaterial | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const toggleSort = (field: keyof RawMaterial) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  // ---- filtered + sorted ----
  const filtered = useMemo(() => {
    let d = [...materials];
    if (categoryTab !== "הכל") d = d.filter(m => m.category === categoryTab);
    if (statusFilter !== "הכל") d = d.filter(m => m.status === statusFilter);
    if (search) {
      const s = search.toLowerCase();
      d = d.filter(m =>
        m.material_code.toLowerCase().includes(s) ||
        m.material_name.toLowerCase().includes(s) ||
        m.preferred_supplier.toLowerCase().includes(s) ||
        m.alloy_or_grade.toLowerCase().includes(s)
      );
    }
    if (sortField) {
      d.sort((a, b) => {
        const av = a[sortField], bv = b[sortField];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        const cmp = typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv), "he");
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return d;
  }, [search, categoryTab, statusFilter, sortField, sortDir]);

  // ---- summary KPIs ----
  const totalItems = materials.length;
  const activeItems = materials.filter(m => m.status === "פעיל").length;
  const lowStockItems = materials.filter(m => m.status === "מלאי נמוך").length;
  const outOfStockItems = materials.filter(m => m.status === "אזל מהמלאי").length;
  const totalStockValue = materials.reduce((sum, m) => sum + m.stock_on_hand * m.cost_before_vat, 0);
  const categoryCounts = CATEGORIES.slice(1).map(c => ({ name: c, count: materials.filter(m => m.category === c).length }));

  const SortHeader = ({ field, children }: { field: keyof RawMaterial; children: React.ReactNode }) => (
    <TableHead
      className="cursor-pointer select-none hover:bg-[#1a2332] transition-colors text-right whitespace-nowrap text-xs"
      onClick={() => toggleSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        <ArrowUpDown className={`h-3 w-3 ${sortField === field ? "text-blue-400" : "text-gray-600"}`} />
      </span>
    </TableHead>
  );

  const stockPercent = (stock: number, min: number) => {
    if (min === 0) return 100;
    const pct = Math.min((stock / (min * 3)) * 100, 100);
    return pct;
  };

  const stockBarColor = (stock: number, min: number) => {
    if (stock === 0) return "bg-red-500";
    if (stock <= min) return "bg-yellow-500";
    if (stock <= min * 1.5) return "bg-amber-400";
    return "bg-green-500";
  };

  // ============================================================
  return (
    <div dir="rtl" className="p-6 space-y-6 bg-[#0a0e17] min-h-screen text-gray-100">
      {/* ---- HEADER ---- */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Package className="h-7 w-7 text-blue-400" />
            מאגר חומרי גלם - טכנו-כל עוזי
          </h1>
          <p className="text-sm text-gray-400 mt-1">ניהול מלאי חומרי גלם | מתכות, אלומיניום, זכוכית, פרזול ומתכלים</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-md bg-[#1e293b] hover:bg-[#334155] border border-gray-700 text-gray-300 transition-colors">
            <Download className="h-3.5 w-3.5" /> ייצוא Excel
          </button>
          <button className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-md bg-blue-600 hover:bg-blue-700 text-white transition-colors">
            <Package className="h-3.5 w-3.5" /> חומר גלם חדש
          </button>
        </div>
      </div>

      {/* ---- KPI CARDS ---- */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="bg-[#111827] border-gray-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-400">סה"כ פריטים</p>
                <p className="text-2xl font-bold text-white">{totalItems}</p>
              </div>
              <Layers className="h-8 w-8 text-blue-400/40" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#111827] border-gray-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-400">פעילים</p>
                <p className="text-2xl font-bold text-green-400">{activeItems}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-400/40" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#111827] border-gray-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-400">מלאי נמוך</p>
                <p className="text-2xl font-bold text-yellow-400">{lowStockItems}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-yellow-400/40" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#111827] border-gray-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-400">אזל מהמלאי</p>
                <p className="text-2xl font-bold text-red-400">{outOfStockItems}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-400/40" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#111827] border-gray-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-400">שווי מלאי</p>
                <p className="text-2xl font-bold text-white">{fmtCurrency(totalStockValue)}</p>
              </div>
              <DollarSign className="h-8 w-8 text-blue-400/40" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ---- CATEGORY CHIPS ---- */}
      <div className="flex flex-wrap gap-2">
        {categoryCounts.map(c => (
          <span key={c.name} className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs border ${CATEGORY_COLORS[c.name] || "bg-gray-700 text-gray-300 border-gray-600"}`}>
            {c.name} <span className="font-bold">{c.count}</span>
          </span>
        ))}
      </div>

      {/* ---- FILTERS ---- */}
      <Card className="bg-[#111827] border-gray-800">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
            <div className="relative flex-1 w-full md:max-w-sm">
              <Search className="absolute right-3 top-2.5 h-4 w-4 text-gray-500" />
              <input
                placeholder="חיפוש לפי קוד, שם, ספק, סגסוגת..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pr-10 pl-3 py-2 text-sm bg-[#0a0e17] border border-gray-700 rounded-md text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-500" />
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="text-sm bg-[#0a0e17] border border-gray-700 rounded-md text-gray-200 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="הכל">כל הסטטוסים</option>
                <option value="פעיל">פעיל</option>
                <option value="מלאי נמוך">מלאי נמוך</option>
                <option value="אזל מהמלאי">אזל מהמלאי</option>
                <option value="לא פעיל">לא פעיל</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ---- TABS + TABLE ---- */}
      <Tabs value={categoryTab} onValueChange={setCategoryTab}>
        <TabsList className="bg-[#111827] border border-gray-800 p-1 flex flex-wrap gap-1">
          {CATEGORIES.map(c => (
            <TabsTrigger
              key={c}
              value={c}
              className="text-xs data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-400 px-3 py-1.5 rounded"
            >
              {c}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={categoryTab} className="mt-4">
          <Card className="bg-[#111827] border-gray-800">
            <CardHeader className="pb-2 border-b border-gray-800">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base text-gray-200 flex items-center gap-2">
                  <Factory className="h-4 w-4 text-blue-400" />
                  {categoryTab === "הכל" ? "כל חומרי הגלם" : `קטגוריה: ${categoryTab}`}
                  <Badge variant="outline" className="mr-2 text-xs border-gray-600 text-gray-400">{filtered.length} פריטים</Badge>
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-gray-800 bg-[#0d1320]">
                      <SortHeader field="material_code">קוד</SortHeader>
                      <SortHeader field="material_name">שם חומר</SortHeader>
                      <SortHeader field="category">קטגוריה</SortHeader>
                      <SortHeader field="dimensions_display">מידות</SortHeader>
                      <SortHeader field="thickness_mm">עובי (מ"מ)</SortHeader>
                      <SortHeader field="alloy_or_grade">סגסוגת / דרגה</SortHeader>
                      <SortHeader field="unit_of_measure">יח' מידה</SortHeader>
                      <SortHeader field="weight_per_meter">משקל/מ'</SortHeader>
                      <SortHeader field="cost_before_vat">מחיר ₪</SortHeader>
                      <SortHeader field="last_purchase_price">רכישה אחרונה</SortHeader>
                      <SortHeader field="preferred_supplier">ספק</SortHeader>
                      <SortHeader field="stock_on_hand">מלאי</SortHeader>
                      <SortHeader field="status">סטטוס</SortHeader>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={13} className="text-center py-12 text-gray-500">
                          <Package className="h-10 w-10 mx-auto mb-2 opacity-30" />
                          <p>לא נמצאו חומרי גלם</p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      filtered.map(m => {
                        const pct = stockPercent(m.stock_on_hand, m.minimum_stock);
                        const barColor = stockBarColor(m.stock_on_hand, m.minimum_stock);
                        return (
                          <TableRow key={m.material_code} className="border-gray-800/60 hover:bg-[#151d2e] transition-colors text-sm">
                            {/* Code */}
                            <TableCell className="font-mono text-blue-400 text-xs whitespace-nowrap">{m.material_code}</TableCell>
                            {/* Name */}
                            <TableCell className="font-medium text-gray-100 whitespace-nowrap">
                              {m.material_name}
                              <div className="text-[10px] text-gray-500">{m.subcategory} | {m.material_type}</div>
                            </TableCell>
                            {/* Category badge */}
                            <TableCell>
                              <Badge variant="outline" className={`text-[10px] whitespace-nowrap ${CATEGORY_COLORS[m.category] || ""}`}>
                                {m.category}
                              </Badge>
                            </TableCell>
                            {/* Dimensions */}
                            <TableCell className="text-xs text-gray-300 whitespace-nowrap">{m.dimensions_display}</TableCell>
                            {/* Thickness */}
                            <TableCell className="text-xs text-gray-300 text-center">
                              {m.thickness_mm != null ? fmtDec(m.thickness_mm) : "—"}
                            </TableCell>
                            {/* Alloy */}
                            <TableCell className="text-xs text-gray-400 whitespace-nowrap">{m.alloy_or_grade}</TableCell>
                            {/* Unit */}
                            <TableCell className="text-xs text-gray-400 whitespace-nowrap">{m.unit_of_measure}</TableCell>
                            {/* Weight/m */}
                            <TableCell className="text-xs text-gray-300 text-center">
                              {m.weight_per_meter != null ? (
                                <span className="inline-flex items-center gap-0.5">
                                  <Weight className="h-3 w-3 text-gray-600" />
                                  {fmtDec(m.weight_per_meter)} ק"ג
                                </span>
                              ) : "—"}
                            </TableCell>
                            {/* Cost */}
                            <TableCell className="text-xs font-medium text-gray-100 whitespace-nowrap">
                              {fmtCurrency(m.cost_before_vat)}
                              <div className="text-[10px] text-gray-500">+ מע"מ: {fmtCurrency(m.cost_after_vat)}</div>
                            </TableCell>
                            {/* Last purchase */}
                            <TableCell className="text-xs whitespace-nowrap">
                              <span className={m.last_purchase_price > m.average_price ? "text-red-400" : m.last_purchase_price < m.average_price ? "text-green-400" : "text-gray-300"}>
                                {fmtCurrency(m.last_purchase_price)}
                              </span>
                              <div className="text-[10px] text-gray-500 inline-flex items-center gap-0.5 mr-1">
                                {m.last_purchase_price > m.average_price ? (
                                  <TrendingUp className="h-2.5 w-2.5 text-red-400" />
                                ) : m.last_purchase_price < m.average_price ? (
                                  <TrendingDown className="h-2.5 w-2.5 text-green-400" />
                                ) : (
                                  <Minus className="h-2.5 w-2.5 text-gray-500" />
                                )}
                                ממוצע: {fmtCurrency(m.average_price)}
                              </div>
                            </TableCell>
                            {/* Supplier */}
                            <TableCell className="text-xs text-gray-300 whitespace-nowrap">{m.preferred_supplier}</TableCell>
                            {/* Stock with progress bar */}
                            <TableCell className="min-w-[130px]">
                              <div className="flex items-center gap-2">
                                <span className={`text-xs font-bold ${m.stock_on_hand === 0 ? "text-red-400" : m.stock_on_hand <= m.minimum_stock ? "text-yellow-400" : "text-gray-100"}`}>
                                  {fmt(m.stock_on_hand)}
                                </span>
                                <span className="text-[10px] text-gray-600">/ מינ' {fmt(m.minimum_stock)}</span>
                              </div>
                              <div className="mt-1 h-1.5 w-full bg-gray-800 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${barColor}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </TableCell>
                            {/* Status */}
                            <TableCell>
                              <Badge variant="outline" className={`text-[10px] whitespace-nowrap ${STATUS_COLORS[m.status] || ""}`}>
                                {m.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ---- FOOTER SUMMARY ---- */}
      <Card className="bg-[#111827] border-gray-800">
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-500 text-xs">סה"כ שווי מלאי (לפני מע"מ)</p>
              <p className="text-lg font-bold text-white">{fmtCurrency(totalStockValue)}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">מספר קטגוריות</p>
              <p className="text-lg font-bold text-white">{categoryCounts.length}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">ספקים מועדפים</p>
              <p className="text-lg font-bold text-white">{new Set(materials.map(m => m.preferred_supplier)).size}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">דורשים הזמנה דחופה</p>
              <p className="text-lg font-bold text-red-400">{outOfStockItems + lowStockItems}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}