import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ListOrdered, Search, Plus, Download, Eye, Edit2, Trash2,
  CheckCircle2, Clock, AlertTriangle, Tag, Calendar, Copy,
  TrendingUp, Layers, FileText
} from "lucide-react";

const priceLists = [
  { id: "PL-001", name: "מחירון חלונות אלומיניום 2026", category: "חלונות", products: 45, tiers: ["קמעונאי", "סיטונאי", "קבלן"], validFrom: "2026-01-01", validUntil: "2026-12-31", lastUpdate: "2026-03-15", status: "פעיל", currency: "ILS", avgDiscount: "12%" },
  { id: "PL-002", name: "מחירון דלתות כניסה", category: "דלתות", products: 28, tiers: ["קמעונאי", "מפיץ"], validFrom: "2026-01-01", validUntil: "2026-12-31", lastUpdate: "2026-02-20", status: "פעיל", currency: "ILS", avgDiscount: "15%" },
  { id: "PL-003", name: "מחירון מעקות ומסגרות", category: "מעקות", products: 32, tiers: ["קמעונאי", "קבלן", "פרויקט"], validFrom: "2026-01-01", validUntil: "2026-06-30", lastUpdate: "2026-01-10", status: "פעיל", currency: "ILS", avgDiscount: "10%" },
  { id: "PL-004", name: "מחירון זכוכית מחוסמת", category: "זכוכית", products: 18, tiers: ["קמעונאי", "סיטונאי"], validFrom: "2025-07-01", validUntil: "2026-06-30", lastUpdate: "2025-12-01", status: "פעיל", currency: "ILS", avgDiscount: "8%" },
  { id: "PL-005", name: "מחירון פרגולות וסוככים", category: "פרגולות", products: 15, tiers: ["קמעונאי", "פרויקט"], validFrom: "2026-03-01", validUntil: "2026-12-31", lastUpdate: "2026-03-01", status: "פעיל", currency: "ILS", avgDiscount: "18%" },
  { id: "PL-006", name: "מחירון תריסים חשמליים", category: "תריסים", products: 22, tiers: ["קמעונאי", "מתקין", "קבלן"], validFrom: "2025-01-01", validUntil: "2025-12-31", lastUpdate: "2025-11-15", status: "פג תוקף", currency: "ILS", avgDiscount: "14%" },
  { id: "PL-007", name: "מחירון חזיתות מבנים", category: "חזיתות", products: 12, tiers: ["פרויקט", "קבלן ראשי"], validFrom: "2026-02-01", validUntil: "2026-12-31", lastUpdate: "2026-02-01", status: "פעיל", currency: "ILS + USD", avgDiscount: "5%" },
  { id: "PL-008", name: "מחירון ייצוא - אירופה", category: "כללי", products: 60, tiers: ["מפיץ", "OEM"], validFrom: "2026-01-01", validUntil: "2026-12-31", lastUpdate: "2026-01-20", status: "פעיל", currency: "EUR", avgDiscount: "20%" },
  { id: "PL-009", name: "מחירון אביזרי התקנה", category: "אביזרים", products: 85, tiers: ["קמעונאי", "סיטונאי", "מתקין"], validFrom: "2026-04-01", validUntil: "2027-03-31", lastUpdate: "2026-04-01", status: "חדש", currency: "ILS", avgDiscount: "22%" },
  { id: "PL-010", name: "מחירון שירותי התקנה", category: "שירותים", products: 20, tiers: ["לקוח ישיר", "דרך קבלן"], validFrom: "2026-01-01", validUntil: "2026-12-31", lastUpdate: "2026-03-10", status: "טיוטה", currency: "ILS", avgDiscount: "0%" },
];

const statusColors: Record<string, string> = {
  "פעיל": "bg-green-500/20 text-green-300 border-green-500/30",
  "חדש": "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  "טיוטה": "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "פג תוקף": "bg-red-500/20 text-red-300 border-red-500/30",
  "ארכיון": "bg-gray-500/20 text-gray-300 border-gray-500/30",
};

const sampleProducts = [
  { sku: "WIN-T60-150120", name: "חלון T-60 150x120", retail: 4200, wholesale: 3570, contractor: 3150, unit: "יח׳" },
  { sku: "WIN-T60-180150", name: "חלון T-60 180x150", retail: 5800, wholesale: 4930, contractor: 4350, unit: "יח׳" },
  { sku: "WIN-T60-200180", name: "חלון T-60 200x180", retail: 7500, wholesale: 6375, contractor: 5625, unit: "יח׳" },
  { sku: "WIN-SLD-300210", name: "חלון הזזה 300x210", retail: 12800, wholesale: 10880, contractor: 9600, unit: "יח׳" },
  { sku: "WIN-FIX-120120", name: "חלון קבוע 120x120", retail: 2400, wholesale: 2040, contractor: 1800, unit: "יח׳" },
];

export default function PricingPriceLists() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("lists");
  const [selectedList, setSelectedList] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return priceLists.filter(r => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        return r.name.toLowerCase().includes(s) || r.category.toLowerCase().includes(s) || r.id.toLowerCase().includes(s);
      }
      return true;
    });
  }, [search, statusFilter]);

  const kpis = useMemo(() => {
    const totalProducts = priceLists.reduce((s, p) => s + p.products, 0);
    return {
      totalLists: priceLists.length,
      activeLists: priceLists.filter(p => p.status === "פעיל" || p.status === "חדש").length,
      totalProducts,
      expired: priceLists.filter(p => p.status === "פג תוקף").length,
      drafts: priceLists.filter(p => p.status === "טיוטה").length,
    };
  }, []);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ListOrdered className="h-7 w-7 text-cyan-400" />
            מחירונים
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול מחירונים, שכבות מחיר ותוקף | טכנו-כל עוזי</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Download className="w-4 h-4 ml-1" />ייצוא</Button>
          <Button size="sm" className="bg-cyan-600 hover:bg-cyan-700"><Plus className="w-4 h-4 ml-1" />מחירון חדש</Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">סה״כ מחירונים</p>
                <p className="text-2xl font-bold text-white">{kpis.totalLists}</p>
              </div>
              <FileText className="h-8 w-8 text-slate-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-900/50 to-green-950 border-green-800/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-green-400">פעילים</p>
                <p className="text-2xl font-bold text-green-300">{kpis.activeLists}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
            <Progress value={(kpis.activeLists / kpis.totalLists) * 100} className="mt-2 h-1.5" />
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-cyan-900/50 to-cyan-950 border-cyan-800/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-cyan-400">סה״כ מוצרים</p>
                <p className="text-2xl font-bold text-cyan-300">{kpis.totalProducts}</p>
              </div>
              <Layers className="h-8 w-8 text-cyan-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-red-900/50 to-red-950 border-red-800/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-red-400">פגי תוקף</p>
                <p className="text-2xl font-bold text-red-300">{kpis.expired}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-900/50 to-blue-950 border-blue-800/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-blue-400">טיוטות</p>
                <p className="text-2xl font-bold text-blue-300">{kpis.drafts}</p>
              </div>
              <Edit2 className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <TabsList className="bg-background/50">
            <TabsTrigger value="lists">רשימת מחירונים</TabsTrigger>
            <TabsTrigger value="products">מוצרים לדוגמה</TabsTrigger>
          </TabsList>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input placeholder="חיפוש מחירון..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 w-64 bg-background/50" />
            </div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
              <option value="all">כל הסטטוסים</option>
              <option value="פעיל">פעיל</option>
              <option value="חדש">חדש</option>
              <option value="טיוטה">טיוטה</option>
              <option value="פג תוקף">פג תוקף</option>
            </select>
          </div>
        </div>

        {/* Price Lists Tab */}
        <TabsContent value="lists" className="mt-4">
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 bg-muted/30">
                      <th className="text-right p-3 text-muted-foreground font-medium">מס׳</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">שם המחירון</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">קטגוריה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">מוצרים</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">שכבות מחיר</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">תוקף מ-</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">תוקף עד</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">מטבע</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">הנחה ממוצעת</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סטטוס</th>
                      <th className="text-center p-3 text-muted-foreground font-medium w-28">פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(row => (
                      <tr key={row.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                        <td className="p-3 font-mono text-xs text-foreground">{row.id}</td>
                        <td className="p-3 text-foreground font-medium">{row.name}</td>
                        <td className="p-3"><Badge variant="outline" className="text-xs">{row.category}</Badge></td>
                        <td className="p-3 text-foreground font-bold">{row.products}</td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-1">
                            {row.tiers.map(t => (
                              <Badge key={t} className="bg-slate-700/50 text-slate-300 text-xs">{t}</Badge>
                            ))}
                          </div>
                        </td>
                        <td className="p-3 text-muted-foreground">{row.validFrom}</td>
                        <td className="p-3 text-muted-foreground">{row.validUntil}</td>
                        <td className="p-3 text-foreground">{row.currency}</td>
                        <td className="p-3 text-cyan-300">{row.avgDiscount}</td>
                        <td className="p-3"><Badge className={statusColors[row.status] || ""}>{row.status}</Badge></td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button variant="ghost" size="sm" title="צפייה"><Eye className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="sm" title="עריכה"><Edit2 className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="sm" title="שכפול"><Copy className="w-3.5 h-3.5" /></Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sample Products Tab */}
        <TabsContent value="products" className="mt-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Tag className="w-4 h-4 text-cyan-400" />
                דוגמה: מחירון חלונות אלומיניום 2026 (PL-001) - שכבות מחיר
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 bg-muted/30">
                    <th className="text-right p-3 text-muted-foreground font-medium">מק״ט</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">מוצר</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">מחיר קמעונאי</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">מחיר סיטונאי</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">מחיר קבלן</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">יחידה</th>
                  </tr>
                </thead>
                <tbody>
                  {sampleProducts.map(p => (
                    <tr key={p.sku} className="border-b border-border/30 hover:bg-muted/20">
                      <td className="p-3 font-mono text-xs text-muted-foreground">{p.sku}</td>
                      <td className="p-3 text-foreground font-medium">{p.name}</td>
                      <td className="p-3 text-foreground">{p.retail.toLocaleString()} &#8362;</td>
                      <td className="p-3 text-cyan-300">{p.wholesale.toLocaleString()} &#8362;</td>
                      <td className="p-3 text-emerald-300">{p.contractor.toLocaleString()} &#8362;</td>
                      <td className="p-3 text-muted-foreground">{p.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Tier Comparison */}
          <Card className="bg-card/50 border-border/50 mt-4">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                השוואת שכבות מחיר - הנחות
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg bg-muted/20 border border-border/30 text-center">
                  <p className="text-sm font-medium text-foreground mb-2">קמעונאי</p>
                  <p className="text-2xl font-bold text-foreground">מחירון מלא</p>
                  <p className="text-xs text-muted-foreground mt-1">ללא הנחה</p>
                </div>
                <div className="p-4 rounded-lg bg-cyan-950/30 border border-cyan-800/30 text-center">
                  <p className="text-sm font-medium text-cyan-300 mb-2">סיטונאי / מפיץ</p>
                  <p className="text-2xl font-bold text-cyan-300">15% הנחה</p>
                  <p className="text-xs text-muted-foreground mt-1">מינימום 10 יחידות</p>
                </div>
                <div className="p-4 rounded-lg bg-emerald-950/30 border border-emerald-800/30 text-center">
                  <p className="text-sm font-medium text-emerald-300 mb-2">קבלן / פרויקט</p>
                  <p className="text-2xl font-bold text-emerald-300">25% הנחה</p>
                  <p className="text-xs text-muted-foreground mt-1">חוזה שנתי נדרש</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
