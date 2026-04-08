import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import {
  Package, Layers, CheckCircle2, Cog, TrendingUp,
  Clock, Sparkles, Shield, Flame, Star,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
const fmt  = (v: number) => new Intl.NumberFormat("he-IL").format(v);
const fmtC = (v: number) => "\u20AA" + fmt(v);
const pct  = (v: number) => `${v.toFixed(1)}%`;

/* ------------------------------------------------------------------ */
/*  KPI data                                                           */
/* ------------------------------------------------------------------ */
const kpis = [
  { label: "סה\"כ מוצרים",         value: "247",     icon: Package,      color: "from-blue-600 to-blue-800" },
  { label: "מוצרים פעילים",        value: "218",     icon: CheckCircle2, color: "from-emerald-600 to-emerald-800" },
  { label: "עם עץ מוצר (BOM)",    value: "194",     icon: Layers,       color: "from-violet-600 to-violet-800" },
  { label: "מרווח ממוצע %",        value: "34.2%",   icon: TrendingUp,   color: "from-amber-600 to-amber-800" },
  { label: "חדשים החודש",          value: "12",      icon: Sparkles,     color: "from-cyan-600 to-cyan-800" },
  { label: "עדכוני מחיר ממתינים",  value: "8",       icon: Clock,        color: "from-red-600 to-red-800" },
];

/* ------------------------------------------------------------------ */
/*  Category cards                                                     */
/* ------------------------------------------------------------------ */
interface Category {
  name: string;
  icon: React.ElementType;
  products: number;
  avgPrice: number;
  topSeller: string;
  revenueContrib: number;
  color: string;
  items: string[];
}

const categories: Category[] = [
  {
    name: "מוצרי ברזל",
    icon: Shield,
    products: 72,
    avgPrice: 8_450,
    topSeller: "שער חשמלי נגרר 5 מ'",
    revenueContrib: 31.4,
    color: "from-slate-600 to-slate-800",
    items: ["שערים", "גדרות", "מעקות", "פרגולות", "דלתות", "מדרגות"],
  },
  {
    name: "מוצרי אלומיניום",
    icon: Layers,
    products: 68,
    avgPrice: 4_200,
    topSeller: "חלון ויטרינה 200x150",
    revenueContrib: 28.6,
    color: "from-sky-600 to-sky-800",
    items: ["חלונות", "דלתות", "בלגי", "חזיתות", "מחיצות"],
  },
  {
    name: "מוצרי זכוכית",
    icon: Sparkles,
    products: 45,
    avgPrice: 6_800,
    topSeller: "מעקה זכוכית 1.1 מ'",
    revenueContrib: 18.5,
    color: "from-teal-600 to-teal-800",
    items: ["מעקות", "מקלחונים", "מחיצות", "דלתות"],
  },
  {
    name: "מוצרים ממונעים",
    icon: Cog,
    products: 34,
    avgPrice: 12_300,
    topSeller: "שער חשמלי אוטומטי",
    revenueContrib: 14.8,
    color: "from-orange-600 to-orange-800",
    items: ["שערים חשמליים", "דלתות הזזה", "תריסים גלילה"],
  },
  {
    name: "מוצרים בהתאמה אישית",
    icon: Star,
    products: 28,
    avgPrice: 15_600,
    topSeller: "פרגולה אלומיניום מותאמת",
    revenueContrib: 6.7,
    color: "from-purple-600 to-purple-800",
    items: ["עיצוב ייחודי", "מידות מיוחדות", "שילובי חומרים"],
  },
];

/* ------------------------------------------------------------------ */
/*  Top-products table                                                 */
/* ------------------------------------------------------------------ */
interface Product {
  name: string;
  category: string;
  baseCost: number;
  salePrice: number;
  margin: number;
  unitsSold: number;
  revenue: number;
}

const topProducts: Product[] = [
  { name: "שער חשמלי נגרר 5 מ'",        category: "ברזל",           baseCost: 5_200,  salePrice: 8_900,  margin: 41.6, unitsSold: 84,  revenue: 747_600 },
  { name: "חלון ויטרינה 200x150",        category: "אלומיניום",      baseCost: 2_100,  salePrice: 3_450,  margin: 39.1, unitsSold: 156, revenue: 538_200 },
  { name: "מעקה זכוכית 1.1 מ' (מ\"ר)",  category: "זכוכית",         baseCost: 3_800,  salePrice: 6_200,  margin: 38.7, unitsSold: 72,  revenue: 446_400 },
  { name: "דלת כניסה מעוצבת",            category: "ברזל",           baseCost: 3_600,  salePrice: 5_800,  margin: 37.9, unitsSold: 63,  revenue: 365_400 },
  { name: "פרגולה אלומיניום 4x3",        category: "התאמה אישית",    baseCost: 8_500,  salePrice: 14_200, margin: 40.1, unitsSold: 25,  revenue: 355_000 },
  { name: "מקלחון זכוכית L-Shape",       category: "זכוכית",         baseCost: 2_900,  salePrice: 4_500,  margin: 35.6, unitsSold: 68,  revenue: 306_000 },
  { name: "שער חשמלי אוטומטי",           category: "ממונע",          baseCost: 7_200,  salePrice: 12_500, margin: 42.4, unitsSold: 22,  revenue: 275_000 },
  { name: "חלון בלגי תלת-כנף",           category: "אלומיניום",      baseCost: 1_800,  salePrice: 2_950,  margin: 39.0, unitsSold: 91,  revenue: 268_450 },
  { name: "גדר אלומיניום/ברזל 2 מ'",    category: "ברזל",           baseCost: 1_400,  salePrice: 2_350,  margin: 40.4, unitsSold: 108, revenue: 253_800 },
  { name: "תריס גלילה ממונע",            category: "ממונע",          baseCost: 3_100,  salePrice: 5_100,  margin: 39.2, unitsSold: 47,  revenue: 239_700 },
  { name: "דלת הזזה אלומיניום",           category: "אלומיניום",      baseCost: 2_600,  salePrice: 4_100,  margin: 36.6, unitsSold: 54,  revenue: 221_400 },
  { name: "מחיצת זכוכית משרדית",         category: "זכוכית",         baseCost: 4_200,  salePrice: 6_900,  margin: 39.1, unitsSold: 31,  revenue: 213_900 },
];

/* ------------------------------------------------------------------ */
/*  Category badge colour                                              */
/* ------------------------------------------------------------------ */
const catBadge: Record<string, string> = {
  "ברזל":         "bg-slate-500/20 text-slate-300 border-slate-500/30",
  "אלומיניום":    "bg-sky-500/20 text-sky-300 border-sky-500/30",
  "זכוכית":       "bg-teal-500/20 text-teal-300 border-teal-500/30",
  "ממונע":        "bg-orange-500/20 text-orange-300 border-orange-500/30",
  "התאמה אישית":  "bg-purple-500/20 text-purple-300 border-purple-500/30",
};

/* ================================================================== */
/*  Component                                                          */
/* ================================================================== */
export default function ProductsDashboard() {
  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* ---------- Header ---------- */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-blue-600/20">
          <Package className="w-6 h-6 text-blue-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            לוח בקרה &mdash; קטלוג מוצרים
          </h1>
          <p className="text-sm text-gray-400">
            ניהול מוצרים, קטגוריות ומחירים &mdash; טכנו-כל עוזי
          </p>
        </div>
      </div>

      {/* ---------- KPI Row ---------- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpis.map((k, i) => (
          <div
            key={i}
            className={`rounded-xl bg-gradient-to-br ${k.color} p-4 border border-white/10`}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-foreground/70">{k.label}</div>
                <div className="text-xl font-bold text-foreground mt-1">{k.value}</div>
              </div>
              <k.icon className="w-7 h-7 text-foreground/30" />
            </div>
          </div>
        ))}
      </div>

      {/* ---------- Category Cards ---------- */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-3">קטגוריות מוצרים</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          {categories.map((cat) => (
            <Card
              key={cat.name}
              className="bg-slate-800/50 border-slate-700 hover:border-slate-600 transition-colors"
            >
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded-md bg-gradient-to-br ${cat.color}`}>
                    <cat.icon className="w-4 h-4 text-white" />
                  </div>
                  <CardTitle className="text-base text-foreground">{cat.name}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">מוצרים</span>
                  <span className="text-foreground font-medium">{cat.products}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">מחיר ממוצע</span>
                  <span className="text-foreground font-medium">{fmtC(cat.avgPrice)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">רב-מכר</span>
                  <span className="text-foreground font-medium text-xs truncate max-w-[120px]">{cat.topSeller}</span>
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-gray-400">תרומה להכנסות</span>
                    <span className="text-foreground font-medium">{pct(cat.revenueContrib)}</span>
                  </div>
                  <Progress value={cat.revenueContrib} className="h-1.5" />
                </div>
                <div className="flex flex-wrap gap-1 pt-1">
                  {cat.items.map((item) => (
                    <Badge
                      key={item}
                      variant="outline"
                      className="text-[10px] bg-white/5 text-gray-300 border-white/10"
                    >
                      {item}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* ---------- Top Products Table ---------- */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-orange-400" />
            <CardTitle className="text-foreground">מוצרים מובילים</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-slate-700 hover:bg-transparent">
                <TableHead className="text-gray-400 text-right">שם מוצר</TableHead>
                <TableHead className="text-gray-400 text-right">קטגוריה</TableHead>
                <TableHead className="text-gray-400 text-right">עלות בסיס</TableHead>
                <TableHead className="text-gray-400 text-right">מחיר מכירה</TableHead>
                <TableHead className="text-gray-400 text-right">מרווח %</TableHead>
                <TableHead className="text-gray-400 text-right">יח' נמכרו</TableHead>
                <TableHead className="text-gray-400 text-right">הכנסה</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topProducts.map((p, i) => (
                <TableRow key={i} className="border-slate-700/50 hover:bg-slate-700/30">
                  <TableCell className="text-foreground font-medium">{p.name}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={catBadge[p.category] ?? "bg-gray-500/20 text-gray-300 border-gray-500/30"}
                    >
                      {p.category}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-gray-300">{fmtC(p.baseCost)}</TableCell>
                  <TableCell className="text-foreground font-medium">{fmtC(p.salePrice)}</TableCell>
                  <TableCell>
                    <span
                      className={
                        p.margin >= 40
                          ? "text-emerald-400 font-semibold"
                          : p.margin >= 37
                          ? "text-blue-400"
                          : "text-amber-400"
                      }
                    >
                      {pct(p.margin)}
                    </span>
                  </TableCell>
                  <TableCell className="text-gray-300">{fmt(p.unitsSold)}</TableCell>
                  <TableCell className="text-foreground font-semibold">{fmtC(p.revenue)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
