import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Building2, Search, Plus, Download, Eye, Edit2, Trash2,
  CheckCircle2, TrendingDown, AlertTriangle, Calendar,
  DollarSign, Package, Wrench, MapPin, BarChart3, Landmark
} from "lucide-react";

const assets = [
  { id: "FA-001", name: "מכונת CNC 5 צירים Haas", category: "מכונות ייצור", location: "אולם ייצור 1", acquisitionDate: "2021-03-15", acquisitionCost: 850000, depMethod: "קו ישר", lifeYears: 10, accDepreciation: 425000, bookValue: 425000, status: "פעיל", condition: "טובה" },
  { id: "FA-002", name: "מכונת חיתוך לייזר Trumpf", category: "מכונות ייצור", location: "אולם ייצור 1", acquisitionDate: "2022-06-20", acquisitionCost: 1200000, depMethod: "קו ישר", lifeYears: 12, accDepreciation: 400000, bookValue: 800000, status: "פעיל", condition: "מצוינת" },
  { id: "FA-003", name: "מלגזה חשמלית Toyota 3 טון", category: "כלי רכב", location: "מחסן", acquisitionDate: "2020-01-10", acquisitionCost: 180000, depMethod: "קו ישר", lifeYears: 8, accDepreciation: 135000, bookValue: 45000, status: "פעיל", condition: "סבירה" },
  { id: "FA-004", name: "מנוף גשר 10 טון", category: "מכונות ייצור", location: "אולם ייצור 2", acquisitionDate: "2019-08-01", acquisitionCost: 420000, depMethod: "קו ישר", lifeYears: 15, accDepreciation: 186667, bookValue: 233333, status: "פעיל", condition: "טובה" },
  { id: "FA-005", name: "קו צביעה אלקטרוסטטית", category: "מכונות ייצור", location: "אולם צביעה", acquisitionDate: "2023-02-01", acquisitionCost: 650000, depMethod: "קו ישר", lifeYears: 10, accDepreciation: 195000, bookValue: 455000, status: "פעיל", condition: "מצוינת" },
  { id: "FA-006", name: "משאית שינוע Volvo FH", category: "כלי רכב", location: "חניון", acquisitionDate: "2021-11-15", acquisitionCost: 520000, depMethod: "קו ישר", lifeYears: 8, accDepreciation: 276250, bookValue: 243750, status: "פעיל", condition: "טובה" },
  { id: "FA-007", name: "מערכת מיזוג אוויר תעשייתי", category: "מערכות מבנה", location: "כל המפעל", acquisitionDate: "2020-05-20", acquisitionCost: 320000, depMethod: "קו ישר", lifeYears: 12, accDepreciation: 160000, bookValue: 160000, status: "פעיל", condition: "טובה" },
  { id: "FA-008", name: "מכונת ריתוך רובוטית ABB", category: "מכונות ייצור", location: "אולם ייצור 2", acquisitionDate: "2024-01-10", acquisitionCost: 780000, depMethod: "קו ישר", lifeYears: 10, accDepreciation: 175500, bookValue: 604500, status: "פעיל", condition: "מצוינת" },
  { id: "FA-009", name: "גנרטור חירום 500KVA", category: "מערכות מבנה", location: "חדר חשמל", acquisitionDate: "2018-09-01", acquisitionCost: 280000, depMethod: "קו ישר", lifeYears: 15, accDepreciation: 140000, bookValue: 140000, status: "פעיל", condition: "סבירה" },
  { id: "FA-010", name: "שרתי מחשוב - חדר שרתים", category: "IT", location: "חדר שרתים", acquisitionDate: "2023-07-01", acquisitionCost: 145000, depMethod: "מואץ", lifeYears: 5, accDepreciation: 87000, bookValue: 58000, status: "פעיל", condition: "טובה" },
  { id: "FA-011", name: "מערכת מצלמות ואבטחה", category: "IT", location: "כל המפעל", acquisitionDate: "2022-03-15", acquisitionCost: 95000, depMethod: "קו ישר", lifeYears: 7, accDepreciation: 54286, bookValue: 40714, status: "פעיל", condition: "טובה" },
  { id: "FA-012", name: "מכונת כיפוף פח CNC", category: "מכונות ייצור", location: "אולם ייצור 1", acquisitionDate: "2017-04-01", acquisitionCost: 380000, depMethod: "קו ישר", lifeYears: 10, accDepreciation: 380000, bookValue: 0, status: "מופחת במלואו", condition: "סבירה" },
  { id: "FA-013", name: "מלגזה דיזל Linde 5 טון", category: "כלי רכב", location: "חצר", acquisitionDate: "2016-01-01", acquisitionCost: 220000, depMethod: "קו ישר", lifeYears: 8, accDepreciation: 220000, bookValue: 0, status: "למכירה", condition: "ירודה" },
  { id: "FA-014", name: "ריהוט משרדי - קומה 2", category: "ריהוט", location: "משרדים", acquisitionDate: "2022-01-01", acquisitionCost: 85000, depMethod: "קו ישר", lifeYears: 10, accDepreciation: 34000, bookValue: 51000, status: "פעיל", condition: "טובה" },
  { id: "FA-015", name: "מכונת חיתוך זכוכית אוטומטית", category: "מכונות ייצור", location: "אולם זכוכית", acquisitionDate: "2024-09-01", acquisitionCost: 560000, depMethod: "קו ישר", lifeYears: 10, accDepreciation: 84000, bookValue: 476000, status: "פעיל", condition: "מצוינת" },
];

const statusColors: Record<string, string> = {
  "פעיל": "bg-green-500/20 text-green-300 border-green-500/30",
  "מופחת במלואו": "bg-amber-500/20 text-amber-300 border-amber-500/30",
  "למכירה": "bg-purple-500/20 text-purple-300 border-purple-500/30",
  "גרוטאה": "bg-red-500/20 text-red-300 border-red-500/30",
};

const conditionColors: Record<string, string> = {
  "מצוינת": "text-green-400",
  "טובה": "text-blue-400",
  "סבירה": "text-amber-400",
  "ירודה": "text-red-400",
};

export default function FinanceFixedAssets() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("register");

  const filtered = useMemo(() => {
    return assets.filter(r => {
      if (categoryFilter !== "all" && r.category !== categoryFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        return r.name.toLowerCase().includes(s) || r.id.toLowerCase().includes(s) || r.location.toLowerCase().includes(s);
      }
      return true;
    });
  }, [search, categoryFilter]);

  const kpis = useMemo(() => {
    const totalCost = assets.reduce((s, a) => s + a.acquisitionCost, 0);
    const totalBookValue = assets.reduce((s, a) => s + a.bookValue, 0);
    const totalDepreciation = assets.reduce((s, a) => s + a.accDepreciation, 0);
    const activeCount = assets.filter(a => a.status === "פעיל").length;
    const fullyDepreciated = assets.filter(a => a.bookValue === 0).length;
    return {
      totalAssets: assets.length,
      totalCost,
      totalBookValue,
      totalDepreciation,
      activeCount,
      fullyDepreciated,
    };
  }, []);

  const categories = useMemo(() => {
    const cats: Record<string, { count: number; cost: number; bookValue: number }> = {};
    assets.forEach(a => {
      if (!cats[a.category]) cats[a.category] = { count: 0, cost: 0, bookValue: 0 };
      cats[a.category].count++;
      cats[a.category].cost += a.acquisitionCost;
      cats[a.category].bookValue += a.bookValue;
    });
    return cats;
  }, []);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Landmark className="h-7 w-7 text-amber-400" />
            רכוש קבוע
          </h1>
          <p className="text-sm text-muted-foreground mt-1">מרשם נכסים, פחת וערך בספרים | טכנו-כל עוזי</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Download className="w-4 h-4 ml-1" />ייצוא</Button>
          <Button size="sm" className="bg-amber-600 hover:bg-amber-700"><Plus className="w-4 h-4 ml-1" />נכס חדש</Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <Card className="bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">סה״כ נכסים</p>
                <p className="text-2xl font-bold text-white">{kpis.totalAssets}</p>
              </div>
              <Building2 className="h-7 w-7 text-slate-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-900/50 to-blue-950 border-blue-800/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-blue-400">עלות רכישה כוללת</p>
                <p className="text-lg font-bold text-blue-300">{(kpis.totalCost / 1000000).toFixed(2)}M &#8362;</p>
              </div>
              <DollarSign className="h-7 w-7 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-900/50 to-green-950 border-green-800/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-green-400">ערך בספרים</p>
                <p className="text-lg font-bold text-green-300">{(kpis.totalBookValue / 1000000).toFixed(2)}M &#8362;</p>
              </div>
              <BarChart3 className="h-7 w-7 text-green-500" />
            </div>
            <Progress value={(kpis.totalBookValue / kpis.totalCost) * 100} className="mt-2 h-1.5" />
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-red-900/50 to-red-950 border-red-800/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-red-400">פחת מצטבר</p>
                <p className="text-lg font-bold text-red-300">{(kpis.totalDepreciation / 1000000).toFixed(2)}M &#8362;</p>
              </div>
              <TrendingDown className="h-7 w-7 text-red-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-emerald-900/50 to-emerald-950 border-emerald-800/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-emerald-400">נכסים פעילים</p>
                <p className="text-2xl font-bold text-emerald-300">{kpis.activeCount}</p>
              </div>
              <CheckCircle2 className="h-7 w-7 text-emerald-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-900/50 to-amber-950 border-amber-800/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-amber-400">מופחתים במלואם</p>
                <p className="text-2xl font-bold text-amber-300">{kpis.fullyDepreciated}</p>
              </div>
              <AlertTriangle className="h-7 w-7 text-amber-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <TabsList className="bg-background/50">
            <TabsTrigger value="register">מרשם נכסים</TabsTrigger>
            <TabsTrigger value="categories">לפי קטגוריה</TabsTrigger>
          </TabsList>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input placeholder="חיפוש נכס..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 w-64 bg-background/50" />
            </div>
            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
              <option value="all">כל הקטגוריות</option>
              <option value="מכונות ייצור">מכונות ייצור</option>
              <option value="כלי רכב">כלי רכב</option>
              <option value="מערכות מבנה">מערכות מבנה</option>
              <option value="IT">IT</option>
              <option value="ריהוט">ריהוט</option>
            </select>
          </div>
        </div>

        {/* Asset Register */}
        <TabsContent value="register" className="mt-4">
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 bg-muted/30">
                      <th className="text-right p-3 text-muted-foreground font-medium">מס׳</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">שם הנכס</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">קטגוריה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">מיקום</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">תאריך רכישה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">עלות רכישה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">פחת מצטבר</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">ערך בספרים</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">% נותר</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">מצב</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סטטוס</th>
                      <th className="text-center p-3 text-muted-foreground font-medium w-24">פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(a => {
                      const remainPct = a.acquisitionCost > 0 ? Math.round((a.bookValue / a.acquisitionCost) * 100) : 0;
                      return (
                        <tr key={a.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                          <td className="p-3 font-mono text-xs text-foreground">{a.id}</td>
                          <td className="p-3 text-foreground font-medium">{a.name}</td>
                          <td className="p-3"><Badge variant="outline" className="text-xs">{a.category}</Badge></td>
                          <td className="p-3 text-muted-foreground text-xs">
                            <div className="flex items-center gap-1"><MapPin className="w-3 h-3" />{a.location}</div>
                          </td>
                          <td className="p-3 text-muted-foreground">{a.acquisitionDate}</td>
                          <td className="p-3 text-foreground">{a.acquisitionCost.toLocaleString()} &#8362;</td>
                          <td className="p-3 text-red-300">{a.accDepreciation.toLocaleString()} &#8362;</td>
                          <td className="p-3 text-green-300 font-bold">{a.bookValue.toLocaleString()} &#8362;</td>
                          <td className="p-3">
                            <div className="flex items-center gap-1">
                              <Progress value={remainPct} className="h-2 w-12" />
                              <span className="text-xs text-muted-foreground">{remainPct}%</span>
                            </div>
                          </td>
                          <td className="p-3">
                            <span className={`text-xs font-medium ${conditionColors[a.condition] || ""}`}>{a.condition}</span>
                          </td>
                          <td className="p-3"><Badge className={statusColors[a.status] || "bg-gray-500/20 text-gray-300"}>{a.status}</Badge></td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button variant="ghost" size="sm"><Eye className="w-3.5 h-3.5" /></Button>
                              <Button variant="ghost" size="sm"><Edit2 className="w-3.5 h-3.5" /></Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Categories Tab */}
        <TabsContent value="categories" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(categories).map(([cat, data]) => {
              const depPct = data.cost > 0 ? Math.round(((data.cost - data.bookValue) / data.cost) * 100) : 0;
              return (
                <Card key={cat} className="bg-card/50 border-border/50">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-bold text-foreground">{cat}</h3>
                      <Badge variant="outline">{data.count} נכסים</Badge>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">עלות רכישה:</span>
                        <span className="text-foreground font-bold">{data.cost.toLocaleString()} &#8362;</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">ערך בספרים:</span>
                        <span className="text-green-300 font-bold">{data.bookValue.toLocaleString()} &#8362;</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">פחת מצטבר:</span>
                        <span className="text-red-300">{(data.cost - data.bookValue).toLocaleString()} &#8362;</span>
                      </div>
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-muted-foreground">שיעור פחת</span>
                          <span className="text-foreground">{depPct}%</span>
                        </div>
                        <Progress value={depPct} className="h-2" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
