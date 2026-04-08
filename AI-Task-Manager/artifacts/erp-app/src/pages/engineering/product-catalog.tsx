import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Package, CheckCircle2, Sparkles, Layers, XCircle, Clock,
  Search, FileText, RotateCcw, TrendingUp, TrendingDown,
  Thermometer, Weight, Ruler, ShieldCheck, FolderTree, LifeBuoy,
} from "lucide-react";

// ── 15 Products ──
const FALLBACK_PRODUCTS = [
  { sku: "ALW-1001", name: "חלון אלומיניום ציר", family: "חלונות", dims: "1200x1400", weight: 28, thermal: 1.4, status: "פעיל" },
  { sku: "ALW-1002", name: "חלון אלומיניום הזזה", family: "חלונות", dims: "1800x1200", weight: 35, thermal: 1.6, status: "פעיל" },
  { sku: "ALW-1003", name: "חלון אלומיניום קיפ-דרה", family: "חלונות", dims: "1000x1200", weight: 26, thermal: 1.3, status: "פעיל" },
  { sku: "ALW-1004", name: "חלון אלומיניום קבוע", family: "חלונות", dims: "1500x1800", weight: 32, thermal: 1.5, status: "ממתין לאישור" },
  { sku: "GLD-2001", name: "דלת זכוכית", family: "דלתות", dims: "900x2100", weight: 62, thermal: 1.8, status: "פעיל" },
  { sku: "GLD-2002", name: "דלת מתקפלת", family: "דלתות", dims: "2400x2200", weight: 78, thermal: 1.7, status: "פעיל" },
  { sku: "CWP-3001", name: "פאנל קיר מסך", family: "קירות מסך", dims: "1200x3000", weight: 45, thermal: 1.1, status: "פעיל" },
  { sku: "ALS-4001", name: "תריס אלומיניום", family: "תריסים", dims: "1400x1600", weight: 18, thermal: 2.0, status: "פעיל" },
  { sku: "SKY-5001", name: "אשנב / סקיילייט", family: "חלונות", dims: "1000x1000", weight: 22, thermal: 1.2, status: "חדש ברבעון" },
  { sku: "STD-6001", name: "דלת פלדה חסינת אש", family: "דלתות", dims: "1000x2100", weight: 95, thermal: 2.4, status: "פעיל" },
  { sku: "ALR-7001", name: "מעקה אלומיניום", family: "מעקות", dims: "1000x1100", weight: 12, thermal: 0, status: "פעיל" },
  { sku: "GLB-7002", name: "מעקה זכוכית", family: "מעקות", dims: "1000x1100", weight: 18, thermal: 0, status: "פעיל" },
  { sku: "ALP-8001", name: "פרגולת אלומיניום", family: "מוצרים חיצוניים", dims: "3000x4000", weight: 85, thermal: 0, status: "הופסק" },
  { sku: "ALC-8002", name: "חיפוי אלומיניום", family: "מוצרים חיצוניים", dims: "600x3000", weight: 14, thermal: 1.9, status: "פעיל" },
  { sku: "STG-9001", name: "שער פלדה", family: "דלתות", dims: "3000x2200", weight: 120, thermal: 0, status: "ממתין לאישור" },
];

// ── 6 Product Families ──
const FALLBACK_FAMILIES = [
  { name: "חלונות", count: 5, revenue: 38, color: "bg-blue-500/20 text-blue-300", icon: "bg-blue-500" },
  { name: "דלתות", count: 4, revenue: 28, color: "bg-purple-500/20 text-purple-300", icon: "bg-purple-500" },
  { name: "קירות מסך", count: 1, revenue: 15, color: "bg-cyan-500/20 text-cyan-300", icon: "bg-cyan-500" },
  { name: "תריסים", count: 1, revenue: 8, color: "bg-amber-500/20 text-amber-300", icon: "bg-amber-500" },
  { name: "מעקות", count: 2, revenue: 6, color: "bg-green-500/20 text-green-300", icon: "bg-green-500" },
  { name: "מוצרים חיצוניים", count: 2, revenue: 5, color: "bg-rose-500/20 text-rose-300", icon: "bg-rose-500" },
];

// ── Technical Datasheets ──
const FALLBACK_DATASHEETS = [
  { sku: "ALW-1001", name: "חלון אלומיניום ציר", profile: "TB-60", glass: "דו-שכבתי 24 מ\"מ", sealant: "EPDM", finish: "אנודייז כסף", standard: "ת\"י 23", testPressure: "600 Pa", acousticRating: "Rw 35dB", updated: "2026-03-15" },
  { sku: "ALW-1002", name: "חלון אלומיניום הזזה", profile: "TB-70", glass: "דו-שכבתי 28 מ\"מ", sealant: "EPDM", finish: "צביעה RAL 7016", standard: "ת\"י 23", testPressure: "450 Pa", acousticRating: "Rw 32dB", updated: "2026-03-10" },
  { sku: "GLD-2001", name: "דלת זכוכית", profile: "TB-80", glass: "מחוסם 10 מ\"מ", sealant: "סיליקון", finish: "אנודייז שחור", standard: "ת\"י 23 / EN 14351", testPressure: "750 Pa", acousticRating: "Rw 38dB", updated: "2026-02-28" },
  { sku: "CWP-3001", name: "פאנל קיר מסך", profile: "UCW-120", glass: "תלת-שכבתי 36 מ\"מ", sealant: "סיליקון מבני", finish: "PVDF", standard: "EN 13830", testPressure: "1200 Pa", acousticRating: "Rw 42dB", updated: "2026-03-20" },
  { sku: "STD-6001", name: "דלת פלדה חסינת אש", profile: "פלדה 1.5 מ\"מ", glass: "עמיד אש EI60", sealant: "אינטומסנט", finish: "צביעה RAL 9010", standard: "ת\"י 931 / EN 1634", testPressure: "N/A", acousticRating: "Rw 40dB", updated: "2026-01-22" },
  { sku: "ALR-7001", name: "מעקה אלומיניום", profile: "AL-50x50", glass: "מחוסם למינטד 8+8", sealant: "גומי", finish: "אנודייז טבעי", standard: "ת\"י 1142 / EN 1991", testPressure: "N/A", acousticRating: "N/A", updated: "2026-03-05" },
];

// ── Lifecycle Stages ──
const FALLBACK_LIFECYCLESTAGES = [
  { stage: "קונספט", color: "bg-purple-500", products: ["חלון משולב תריס חשמלי"], count: 1 },
  { stage: "עיצוב", color: "bg-blue-500", products: ["חלון אלומיניום קבוע (ALW-1004)", "שער פלדה (STG-9001)"], count: 2 },
  { stage: "בדיקות", color: "bg-amber-500", products: ["אשנב / סקיילייט (SKY-5001)"], count: 1 },
  { stage: "ייצור", color: "bg-green-500", products: ["חלון ציר", "חלון הזזה", "חלון קיפ-דרה", "דלת זכוכית", "דלת מתקפלת", "פאנל קיר מסך", "תריס אלומיניום", "דלת חסינת אש", "מעקה אלומיניום", "מעקה זכוכית", "חיפוי אלומיניום"], count: 11 },
  { stage: "בוגר", color: "bg-teal-500", products: ["מערכות קיר מסך דור 2", "דלת זכוכית מסדרה ישנה"], count: 2 },
  { stage: "סוף חיים", color: "bg-red-500", products: ["פרגולת אלומיניום (ALP-8001)"], count: 1 },
];

// ── Helpers ──
const statusColor = (s: string) =>
  s === "פעיל" ? "bg-green-500/20 text-green-300"
  : s === "חדש ברבעון" ? "bg-cyan-500/20 text-cyan-300"
  : s === "הופסק" ? "bg-red-500/20 text-red-300"
  : "bg-amber-500/20 text-amber-300";

const th = "p-3 text-right text-muted-foreground font-medium text-xs";
const td = "p-3 text-sm";

export default function ProductCatalogPage() {
  const { data: apiproducts } = useQuery({
    queryKey: ["/api/engineering/product-catalog/products"],
    queryFn: () => authFetch("/api/engineering/product-catalog/products").then(r => r.json()).catch(() => null),
  });
  const products = Array.isArray(apiproducts) ? apiproducts : (apiproducts?.data ?? apiproducts?.items ?? FALLBACK_PRODUCTS);


  const { data: apifamilies } = useQuery({
    queryKey: ["/api/engineering/product-catalog/families"],
    queryFn: () => authFetch("/api/engineering/product-catalog/families").then(r => r.json()).catch(() => null),
  });
  const families = Array.isArray(apifamilies) ? apifamilies : (apifamilies?.data ?? apifamilies?.items ?? FALLBACK_FAMILIES);


  const { data: apidatasheets } = useQuery({
    queryKey: ["/api/engineering/product-catalog/datasheets"],
    queryFn: () => authFetch("/api/engineering/product-catalog/datasheets").then(r => r.json()).catch(() => null),
  });
  const datasheets = Array.isArray(apidatasheets) ? apidatasheets : (apidatasheets?.data ?? apidatasheets?.items ?? FALLBACK_DATASHEETS);


  const { data: apilifecycleStages } = useQuery({
    queryKey: ["/api/engineering/product-catalog/lifecyclestages"],
    queryFn: () => authFetch("/api/engineering/product-catalog/lifecyclestages").then(r => r.json()).catch(() => null),
  });
  const lifecycleStages = Array.isArray(apilifecycleStages) ? apilifecycleStages : (apilifecycleStages?.data ?? apilifecycleStages?.items ?? FALLBACK_LIFECYCLESTAGES);

  const [tab, setTab] = useState("catalog");
  const [search, setSearch] = useState("");

  const filtered = products.filter(
    (p) => p.name.includes(search) || p.sku.toLowerCase().includes(search.toLowerCase()) || p.family.includes(search)
  );

  const kpis = [
    { label: "סה\"כ מוצרים", value: "15", icon: Package, color: "text-blue-400", trend: "+2", up: true },
    { label: "מוצרים פעילים", value: "11", icon: CheckCircle2, color: "text-green-400", trend: "+1", up: true },
    { label: "חדשים ברבעון", value: "1", icon: Sparkles, color: "text-cyan-400", trend: "+1", up: true },
    { label: "משפחות מוצר", value: "6", icon: FolderTree, color: "text-purple-400", trend: "0", up: true },
    { label: "הופסקו", value: "1", icon: XCircle, color: "text-red-400", trend: "-1", up: true },
    { label: "ממתינים לאישור", value: "2", icon: Clock, color: "text-amber-400", trend: "+2", up: false },
  ];

  return (
    <div className="p-6 space-y-4" dir="rtl">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Package className="h-6 w-6 text-blue-400" />
            קטלוג מוצרים הנדסי
          </h1>
          <p className="text-sm text-muted-foreground mt-1">טכנו-כל עוזי -- Engineering Product Catalog &amp; Technical Specs</p>
        </div>
        <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5">
          <Sparkles className="h-4 w-4" /> מוצר חדש
        </Button>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k, i) => (
          <Card key={i} className="bg-card/80 border-border hover:border-border transition-colors">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] text-muted-foreground">{k.label}</p>
                  <p className={`text-lg font-bold font-mono mt-1 ${k.color}`}>{k.value}</p>
                  <div className="flex items-center gap-1 mt-1">
                    {k.up ? <TrendingUp className="h-3 w-3 text-green-400" /> : <TrendingDown className="h-3 w-3 text-red-400" />}
                    <span className={`text-[10px] ${k.up ? "text-green-400" : "text-red-400"}`}>{k.trend}</span>
                  </div>
                </div>
                <k.icon className={`h-5 w-5 ${k.color} opacity-60`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Catalog coverage progress ── */}
      <Card className="bg-card/60 border-border">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">מוצרים עם מפרט טכני מלא -- יעד 100%</span>
            <span className="text-sm font-mono text-green-400">73%</span>
          </div>
          <Progress value={73} className="h-2" />
        </CardContent>
      </Card>

      {/* ── Tabs ── */}
      <Tabs value={tab} onValueChange={setTab} dir="rtl">
        <TabsList className="bg-card/60 border border-border w-full justify-start gap-1 p-1 h-auto flex-wrap">
          <TabsTrigger value="catalog" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white gap-1.5 text-xs"><Package className="h-3.5 w-3.5" />קטלוג</TabsTrigger>
          <TabsTrigger value="families" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white gap-1.5 text-xs"><FolderTree className="h-3.5 w-3.5" />משפחות מוצר</TabsTrigger>
          <TabsTrigger value="datasheets" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white gap-1.5 text-xs"><FileText className="h-3.5 w-3.5" />מפרטים טכניים</TabsTrigger>
          <TabsTrigger value="lifecycle" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white gap-1.5 text-xs"><RotateCcw className="h-3.5 w-3.5" />מחזור חיים</TabsTrigger>
        </TabsList>

        {/* ── Catalog Tab ── */}
        <TabsContent value="catalog">
          <div className="mb-3">
            <div className="relative max-w-sm">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="חיפוש לפי שם, מק\"ט או משפחה..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pr-10 bg-card/60 border-border text-sm"
              />
            </div>
          </div>
          <Card className="bg-card/80 border-border"><CardContent className="p-0"><div className="overflow-x-auto">
            <table className="w-full text-sm"><thead><tr className="border-b border-border bg-background/50">
              <th className={th}>מק"ט</th><th className={th}>שם מוצר</th><th className={th}>משפחה</th>
              <th className={th}>מידות (מ"מ)</th><th className={th}>משקל (ק"ג)</th>
              <th className={th}>U-Value</th><th className={th}>סטטוס</th>
            </tr></thead><tbody>
              {filtered.map((p, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className={`${td} font-mono text-blue-400 font-bold`}>{p.sku}</td>
                  <td className={`${td} text-foreground font-medium`}>{p.name}</td>
                  <td className={td}>
                    <Badge className={`${families.find(f => f.name === p.family)?.color || "bg-gray-500/20 text-gray-300"} border-0 text-xs`}>{p.family}</Badge>
                  </td>
                  <td className={`${td} font-mono text-muted-foreground`}>{p.dims}</td>
                  <td className={`${td} font-mono text-muted-foreground`}>{p.weight}</td>
                  <td className={`${td} font-mono`}>
                    {p.thermal > 0 ? (
                      <span className={p.thermal <= 1.4 ? "text-green-400" : p.thermal <= 1.8 ? "text-amber-400" : "text-red-400"}>
                        {p.thermal} W/m²K
                      </span>
                    ) : (
                      <span className="text-muted-foreground">N/A</span>
                    )}
                  </td>
                  <td className={td}><Badge className={`${statusColor(p.status)} border-0 text-xs`}>{p.status}</Badge></td>
                </tr>
              ))}
            </tbody></table>
          </div></CardContent></Card>
        </TabsContent>

        {/* ── Product Families Tab ── */}
        <TabsContent value="families">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {families.map((f, i) => (
              <Card key={i} className="bg-card/80 border-border hover:border-blue-500/30 transition-colors">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`h-10 w-10 rounded-lg ${f.icon} flex items-center justify-center`}>
                      <Layers className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-foreground font-bold text-sm">{f.name}</h3>
                      <p className="text-xs text-muted-foreground">{f.count} מוצרים</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">תרומה להכנסות</span>
                      <span className="font-mono font-bold text-foreground">{f.revenue}%</span>
                    </div>
                    <Progress value={f.revenue} className="h-1.5" />
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">מוצרים בקטלוג</span>
                      <Badge className={`${f.color} border-0 text-xs`}>{f.count}</Badge>
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-border/50">
                    <div className="flex flex-wrap gap-1">
                      {products.filter(p => p.family === f.name).map((p, j) => (
                        <Badge key={j} variant="outline" className="text-[10px] border-border/50 text-muted-foreground">{p.sku}</Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ── Technical Datasheets Tab ── */}
        <TabsContent value="datasheets">
          <div className="space-y-4">
            {datasheets.map((ds, i) => (
              <Card key={i} className="bg-card/80 border-border hover:border-blue-500/30 transition-colors">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-blue-500/20 flex items-center justify-center">
                        <FileText className="h-4 w-4 text-blue-400" />
                      </div>
                      <div>
                        <h3 className="text-foreground font-bold text-sm">{ds.name}</h3>
                        <p className="text-xs text-muted-foreground font-mono">{ds.sku}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px] border-border/50 text-muted-foreground">
                      עדכון: {ds.updated}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-background/40 rounded-lg p-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Ruler className="h-3 w-3 text-blue-400" />
                        <span className="text-[10px] text-muted-foreground">פרופיל</span>
                      </div>
                      <p className="text-xs font-medium text-foreground">{ds.profile}</p>
                    </div>
                    <div className="bg-background/40 rounded-lg p-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <ShieldCheck className="h-3 w-3 text-green-400" />
                        <span className="text-[10px] text-muted-foreground">זיגוג</span>
                      </div>
                      <p className="text-xs font-medium text-foreground">{ds.glass}</p>
                    </div>
                    <div className="bg-background/40 rounded-lg p-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Thermometer className="h-3 w-3 text-amber-400" />
                        <span className="text-[10px] text-muted-foreground">אטימות</span>
                      </div>
                      <p className="text-xs font-medium text-foreground">{ds.sealant}</p>
                    </div>
                    <div className="bg-background/40 rounded-lg p-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Weight className="h-3 w-3 text-purple-400" />
                        <span className="text-[10px] text-muted-foreground">גימור</span>
                      </div>
                      <p className="text-xs font-medium text-foreground">{ds.finish}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                    <div className="flex items-center justify-between bg-background/40 rounded-lg p-3">
                      <span className="text-[10px] text-muted-foreground">תקן</span>
                      <span className="text-xs font-mono text-foreground">{ds.standard}</span>
                    </div>
                    <div className="flex items-center justify-between bg-background/40 rounded-lg p-3">
                      <span className="text-[10px] text-muted-foreground">לחץ בדיקה</span>
                      <span className="text-xs font-mono text-cyan-400">{ds.testPressure}</span>
                    </div>
                    <div className="flex items-center justify-between bg-background/40 rounded-lg p-3">
                      <span className="text-[10px] text-muted-foreground">אקוסטי</span>
                      <span className="text-xs font-mono text-green-400">{ds.acousticRating}</span>
                    </div>
                    <div className="flex items-center justify-between bg-background/40 rounded-lg p-3">
                      <span className="text-[10px] text-muted-foreground">עדכון אחרון</span>
                      <span className="text-xs font-mono text-muted-foreground">{ds.updated}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ── Lifecycle Tab ── */}
        <TabsContent value="lifecycle">
          {/* Lifecycle Pipeline Visual */}
          <Card className="bg-card/80 border-border mb-4">
            <CardContent className="p-5">
              <h3 className="text-sm font-bold text-foreground mb-4">צינור מחזור חיי מוצר</h3>
              <div className="flex items-center gap-1">
                {lifecycleStages.map((s, i) => (
                  <div key={i} className="flex-1 text-center">
                    <div className={`${s.color} h-10 rounded-md flex items-center justify-center mb-2 relative`}>
                      <span className="text-white font-bold text-lg">{s.count}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground font-medium">{s.stage}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Lifecycle Detail Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {lifecycleStages.map((s, i) => (
              <Card key={i} className="bg-card/80 border-border">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`h-3 w-3 rounded-full ${s.color}`} />
                    <h4 className="text-sm font-bold text-foreground">{s.stage}</h4>
                    <Badge variant="outline" className="mr-auto text-[10px] border-border/50">{s.count} מוצרים</Badge>
                  </div>
                  <div className="space-y-1.5">
                    {s.products.map((p, j) => (
                      <div key={j} className="flex items-center gap-2 bg-background/40 rounded-md px-3 py-1.5">
                        <LifeBuoy className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs text-foreground">{p}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 pt-2 border-t border-border/50">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground">אחוז מהקטלוג</span>
                      <span className="font-mono text-foreground">{Math.round((s.count / 18) * 100)}%</span>
                    </div>
                    <Progress value={Math.round((s.count / 18) * 100)} className="h-1 mt-1" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
