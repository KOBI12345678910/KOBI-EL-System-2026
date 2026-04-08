import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  FileText,
  Package,
  CalendarDays,
  Clock,
  TrendingUp,
  Plus,
  Search,
  CheckCircle2,
  AlertTriangle,
  History,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

const priceLists = [
  { id: 1, name: "מחירון כללי 2026", type: "כללי", currency: "₪", validFrom: "2026-01-01", validTo: "2026-12-31", products: 245, status: "פעיל", lastUpdate: "2026-03-15" },
  { id: 2, name: "מחירון קבלנים", type: "קבלנים", currency: "₪", validFrom: "2026-01-01", validTo: "2026-06-30", products: 180, status: "פעיל", lastUpdate: "2026-03-20" },
  { id: 3, name: "מחירון פרויקטים גדולים", type: "פרויקטים", currency: "₪", validFrom: "2026-01-01", validTo: "2026-12-31", products: 120, status: "פעיל", lastUpdate: "2026-04-01" },
  { id: 4, name: "מחירון ייצוא - אירופה", type: "ייצוא", currency: "EUR", validFrom: "2026-01-01", validTo: "2026-06-30", products: 95, status: "פעיל", lastUpdate: "2026-02-28" },
  { id: 5, name: "מחירון ייצוא - ארה\"ב", type: "ייצוא", currency: "USD", validFrom: "2026-01-01", validTo: "2026-12-31", products: 85, status: "פעיל", lastUpdate: "2026-03-10" },
  { id: 6, name: "מחירון VIP לקוחות מרכזיים", type: "VIP", currency: "₪", validFrom: "2026-04-01", validTo: "2026-09-30", products: 200, status: "פעיל", lastUpdate: "2026-04-01" },
  { id: 7, name: "מחירון מבצעי אביב", type: "מבצע", currency: "₪", validFrom: "2026-03-01", validTo: "2026-05-31", products: 50, status: "פעיל", lastUpdate: "2026-03-01" },
  { id: 8, name: "מחירון 2025 (ארכיון)", type: "כללי", currency: "₪", validFrom: "2025-01-01", validTo: "2025-12-31", products: 230, status: "לא פעיל", lastUpdate: "2025-12-15" },
];

const sampleProducts = [
  { name: "חלון אלומיניום דו-כנפי 120x150", general: 2800, contractor: 2380, vip: 2240, project: 2100 },
  { name: "דלת כניסה אלומיניום 100x220", general: 4500, contractor: 3825, vip: 3600, project: 3375 },
  { name: "ויטרינה זכוכית מחוסמת 200x250", general: 6200, contractor: 5270, vip: 4960, project: 4650 },
  { name: "מעקה זכוכית בטיחות מ\"א", general: 850, contractor: 722, vip: 680, project: 638 },
  { name: "תריס חשמלי אלומיניום 150x120", general: 3200, contractor: 2720, vip: 2560, project: 2400 },
  { name: "חלון הזזה תרמי 200x150", general: 3800, contractor: 3230, vip: 3040, project: 2850 },
  { name: "דלת מרפסת הזזה 300x220", general: 7500, contractor: 6375, vip: 6000, project: 5625 },
  { name: "פרגולת אלומיניום 3x4 מ'", general: 12000, contractor: 10200, vip: 9600, project: 9000 },
];

const priceChanges = [
  { date: "2026-04-01", product: "חלון אלומיניום דו-כנפי", list: "מחירון כללי", oldPrice: 2650, newPrice: 2800, reason: "עליית מחיר אלומיניום" },
  { date: "2026-03-20", product: "דלת כניסה אלומיניום", list: "מחירון קבלנים", oldPrice: 3600, newPrice: 3825, reason: "עדכון שנתי" },
  { date: "2026-03-15", product: "ויטרינה זכוכית מחוסמת", list: "מחירון כללי", oldPrice: 5900, newPrice: 6200, reason: "עליית מחיר זכוכית" },
  { date: "2026-03-10", product: "מעקה זכוכית בטיחות", list: "מחירון ייצוא - ארה\"ב", oldPrice: 220, newPrice: 235, reason: "שער חליפין" },
  { date: "2026-03-01", product: "תריס חשמלי אלומיניום", list: "מחירון מבצעי אביב", oldPrice: 3200, newPrice: 2880, reason: "מחיר מבצע" },
  { date: "2026-02-28", product: "חלון הזזה תרמי", list: "מחירון ייצוא - אירופה", oldPrice: 950, newPrice: 1020, reason: "עדכון מחירון אירופי" },
];

export default function PriceListsManager() {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("lists");

  const activeLists = priceLists.filter((l) => l.status === "פעיל").length;
  const totalProducts = priceLists.filter((l) => l.status === "פעיל").reduce((s, l) => s + l.products, 0);
  const lastUpdate = "2026-04-01";
  const pendingApprovals = 3;
  const recentChanges = priceChanges.length;

  const kpis = [
    { label: "מחירונים פעילים", value: activeLists, icon: FileText, color: "text-blue-600" },
    { label: "מוצרים מכוסים", value: totalProducts, icon: Package, color: "text-green-600" },
    { label: "עדכון אחרון", value: lastUpdate, icon: CalendarDays, color: "text-purple-600" },
    { label: "ממתינים לאישור", value: pendingApprovals, icon: Clock, color: "text-orange-600" },
    { label: "שינויי מחיר", value: recentChanges, icon: TrendingUp, color: "text-red-600" },
  ];

  const filteredLists = priceLists.filter((l) => l.name.includes(search));

  return (
    <div dir="rtl" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">ניהול מחירונים</h1>
          <p className="text-muted-foreground mt-1">טכנו-כל עוזי - מחירונים ותמחור מוצרים</p>
        </div>
        <Button><Plus className="h-4 w-4 ml-2" />מחירון חדש</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-4 text-center">
              <kpi.icon className={`h-8 w-8 mx-auto mb-2 ${kpi.color}`} />
              <div className="text-2xl font-bold">{kpi.value}</div>
              <div className="text-xs text-muted-foreground">{kpi.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="lists">מחירונים</TabsTrigger>
          <TabsTrigger value="products">מוצרים</TabsTrigger>
          <TabsTrigger value="history">היסטוריה</TabsTrigger>
        </TabsList>

        <TabsContent value="lists" className="space-y-4">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="חיפוש מחירון..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-10" />
          </div>
          <div className="space-y-3">
            {filteredLists.map((list) => (
              <Card key={list.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="bg-blue-50 p-2 rounded"><FileText className="h-5 w-5 text-blue-600" /></div>
                      <div>
                        <div className="font-semibold">{list.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {list.type} | {list.currency} | עדכון: {list.lastUpdate}
                        </div>
                      </div>
                    </div>
                    <Badge className={list.status === "פעיל" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                      {list.status}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div className="text-center p-2 bg-gray-50 rounded">
                      <div className="font-bold">{list.products}</div>
                      <div className="text-xs text-muted-foreground">מוצרים</div>
                    </div>
                    <div className="text-center p-2 bg-gray-50 rounded">
                      <div className="font-bold">{list.validFrom}</div>
                      <div className="text-xs text-muted-foreground">תוקף מ-</div>
                    </div>
                    <div className="text-center p-2 bg-gray-50 rounded">
                      <div className="font-bold">{list.validTo}</div>
                      <div className="text-xs text-muted-foreground">תוקף עד</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="products" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5" />השוואת מחירים לפי מחירון</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-right py-2 font-bold">מוצר</th>
                      <th className="text-center py-2 font-bold">כללי</th>
                      <th className="text-center py-2 font-bold">קבלנים</th>
                      <th className="text-center py-2 font-bold">VIP</th>
                      <th className="text-center py-2 font-bold">פרויקטים</th>
                      <th className="text-center py-2 font-bold">הנחה מקסימלית</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sampleProducts.map((p, i) => {
                      const maxDiscount = (((p.general - p.project) / p.general) * 100).toFixed(0);
                      return (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-3 font-medium">{p.name}</td>
                          <td className="text-center">₪{p.general.toLocaleString()}</td>
                          <td className="text-center text-blue-600">₪{p.contractor.toLocaleString()}</td>
                          <td className="text-center text-purple-600">₪{p.vip.toLocaleString()}</td>
                          <td className="text-center text-green-600">₪{p.project.toLocaleString()}</td>
                          <td className="text-center"><Badge variant="outline">{maxDiscount}%</Badge></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-3">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><History className="h-5 w-5" />שינויי מחיר אחרונים</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {priceChanges.map((ch, i) => {
                const isIncrease = ch.newPrice > ch.oldPrice;
                const changePct = (((ch.newPrice - ch.oldPrice) / ch.oldPrice) * 100).toFixed(1);
                return (
                  <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded ${isIncrease ? "bg-red-50" : "bg-green-50"}`}>
                        {isIncrease ? <ArrowUpRight className="h-4 w-4 text-red-600" /> : <ArrowDownRight className="h-4 w-4 text-green-600" />}
                      </div>
                      <div>
                        <div className="font-medium">{ch.product}</div>
                        <div className="text-sm text-muted-foreground">{ch.list} | {ch.date}</div>
                        <div className="text-xs text-muted-foreground">{ch.reason}</div>
                      </div>
                    </div>
                    <div className="text-left">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground line-through">₪{ch.oldPrice}</span>
                        <span className="font-bold">₪{ch.newPrice}</span>
                      </div>
                      <Badge className={isIncrease ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"}>
                        {isIncrease ? "+" : ""}{changePct}%
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
