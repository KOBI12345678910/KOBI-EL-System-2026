import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Ship, Users, Truck, Briefcase, DollarSign, Clock, Award, Star, TrendingUp, TrendingDown } from "lucide-react";

const submodules = [
  "forwarders_list", "profiles", "carriers", "customs_brokers",
  "shipping_quotes", "route_comparisons", "freight_cost_history", "performance",
] as const;

const fmt = (v: number) => "$" + v.toLocaleString("en-US");

const forwarders = [
  { id: "FWD-001", name: "גלובל לוגיסטיקה בע\"מ", country: "ישראל", routes: "אסיה, אירופה", shipments: 42, rating: 4.7, avgCost: 3800, onTime: 94, status: "active" },
  { id: "FWD-002", name: "MSC Israel", country: "שוויץ/ישראל", routes: "אסיה, אמריקה", shipments: 38, rating: 4.5, avgCost: 4200, onTime: 91, status: "active" },
  { id: "FWD-003", name: "Maersk Logistics", country: "דנמרק", routes: "עולמי", shipments: 56, rating: 4.8, avgCost: 4600, onTime: 96, status: "preferred" },
  { id: "FWD-004", name: "ZIM Integrated", country: "ישראל", routes: "אסיה, אירופה, אמריקה", shipments: 64, rating: 4.6, avgCost: 3900, onTime: 93, status: "preferred" },
  { id: "FWD-005", name: "Kuehne+Nagel IL", country: "שוויץ", routes: "אירופה, אסיה", shipments: 28, rating: 4.3, avgCost: 4400, onTime: 88, status: "active" },
  { id: "FWD-006", name: "DB Schenker Israel", country: "גרמניה", routes: "אירופה", shipments: 22, rating: 4.1, avgCost: 3500, onTime: 85, status: "active" },
  { id: "FWD-007", name: "DHL Global Forwarding", country: "גרמניה", routes: "עולמי", shipments: 31, rating: 4.4, avgCost: 5100, onTime: 90, status: "active" },
  { id: "FWD-008", name: "Orian Group", country: "ישראל", routes: "אסיה, אירופה", shipments: 35, rating: 4.2, avgCost: 3600, onTime: 87, status: "active" },
];

const carriers = [
  { id: "CRR-001", name: "MSC Mediterranean", type: "ימי", vessels: 12, routes: "Far East - Ashdod", transitDays: 22, reliability: 92, cost: 3200 },
  { id: "CRR-002", name: "Maersk Line", type: "ימי", vessels: 18, routes: "EU - Haifa", transitDays: 14, reliability: 96, cost: 3800 },
  { id: "CRR-003", name: "ZIM Shipping", type: "ימי", vessels: 8, routes: "Asia - Ashdod", transitDays: 20, reliability: 93, cost: 2900 },
  { id: "CRR-004", name: "Hapag-Lloyd", type: "ימי", vessels: 10, routes: "EU/US - Haifa", transitDays: 16, reliability: 94, cost: 3500 },
  { id: "CRR-005", name: "CMA CGM", type: "ימי", vessels: 14, routes: "Global - Ashdod", transitDays: 24, reliability: 90, cost: 3100 },
  { id: "CRR-006", name: "Turkish Airlines Cargo", type: "אווירי", vessels: 0, routes: "IST - TLV", transitDays: 1, reliability: 97, cost: 8200 },
  { id: "CRR-007", name: "El Al Cargo", type: "אווירי", vessels: 0, routes: "EU/US - TLV", transitDays: 1, reliability: 95, cost: 9500 },
  { id: "CRR-008", name: "Evergreen Marine", type: "ימי", vessels: 6, routes: "Asia - Haifa", transitDays: 25, reliability: 88, cost: 2700 },
];

const brokers = [
  { id: "BRK-001", name: "שמעון סחר בע\"מ", license: "IL-5521", specialization: "אלומיניום, זכוכית", activeEntries: 12, avgClearTime: 3.2, successRate: 98, monthlyFee: 4500 },
  { id: "BRK-002", name: "גלובל קלירנס", license: "IL-4418", specialization: "כימיקלים, חומרי גלם", activeEntries: 8, avgClearTime: 4.1, successRate: 95, monthlyFee: 3800 },
  { id: "BRK-003", name: "יבוא ישיר בע\"מ", license: "IL-6632", specialization: "מערכות, מכונות", activeEntries: 6, avgClearTime: 3.8, successRate: 96, monthlyFee: 4200 },
  { id: "BRK-004", name: "אל-עמיל מכס", license: "IL-3307", specialization: "כל סוגי המטענים", activeEntries: 15, avgClearTime: 2.9, successRate: 99, monthlyFee: 5200 },
  { id: "BRK-005", name: "פורט סרוויס", license: "IL-7745", specialization: "חומרי בניין", activeEntries: 9, avgClearTime: 3.5, successRate: 97, monthlyFee: 3900 },
  { id: "BRK-006", name: "מכס פלוס בע\"מ", license: "IL-2291", specialization: "אלקטרוניקה, רכיבים", activeEntries: 5, avgClearTime: 4.5, successRate: 93, monthlyFee: 3500 },
];

const performanceData = [
  { name: "Maersk Logistics", type: "ספדיטור", onTime: 96, costScore: 78, reliability: 97, communication: 95, overall: 94, rank: 1, trend: "up" },
  { name: "ZIM Integrated", type: "ספדיטור", onTime: 93, costScore: 88, reliability: 94, communication: 90, overall: 92, rank: 2, trend: "up" },
  { name: "אל-עמיל מכס", type: "עמיל", onTime: 99, costScore: 72, reliability: 98, communication: 93, overall: 91, rank: 3, trend: "stable" },
  { name: "גלובל לוגיסטיקה בע\"מ", type: "ספדיטור", onTime: 94, costScore: 85, reliability: 91, communication: 88, overall: 90, rank: 4, trend: "down" },
  { name: "MSC Israel", type: "ספדיטור", onTime: 91, costScore: 82, reliability: 93, communication: 86, overall: 88, rank: 5, trend: "stable" },
  { name: "שמעון סחר בע\"מ", type: "עמיל", onTime: 98, costScore: 80, reliability: 95, communication: 85, overall: 87, rank: 6, trend: "up" },
  { name: "DHL Global Forwarding", type: "ספדיטור", onTime: 90, costScore: 65, reliability: 92, communication: 89, overall: 84, rank: 7, trend: "down" },
  { name: "Kuehne+Nagel IL", type: "ספדיטור", onTime: 88, costScore: 70, reliability: 89, communication: 84, overall: 82, rank: 8, trend: "stable" },
];

const ratingStars = (r: number) => {
  const full = Math.floor(r);
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: full }).map((_, i) => <Star key={i} className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />)}
      <span className="text-xs text-slate-400 mr-1">{r.toFixed(1)}</span>
    </span>
  );
};

const onTimeBadge = (pct: number) => {
  if (pct >= 95) return <Badge className="bg-green-500/20 text-green-400">{pct}%</Badge>;
  if (pct >= 90) return <Badge className="bg-blue-500/20 text-blue-400">{pct}%</Badge>;
  if (pct >= 85) return <Badge className="bg-amber-500/20 text-amber-400">{pct}%</Badge>;
  return <Badge className="bg-red-500/20 text-red-400">{pct}%</Badge>;
};

const trendIcon = (t: string) => {
  switch (t) {
    case "up": return <TrendingUp className="h-4 w-4 text-green-400" />;
    case "down": return <TrendingDown className="h-4 w-4 text-red-400" />;
    default: return <span className="text-slate-500">-</span>;
  }
};

const rankBadge = (r: number) => {
  if (r === 1) return <Badge className="bg-yellow-500/20 text-yellow-400 font-bold">#{r}</Badge>;
  if (r <= 3) return <Badge className="bg-blue-500/20 text-blue-400">#{r}</Badge>;
  return <Badge className="bg-slate-500/20 text-slate-400">#{r}</Badge>;
};

export default function ShippingForwarders() {
  const [tab, setTab] = useState("forwarders");

  const activeForwarders = forwarders.filter(f => f.status === "active" || f.status === "preferred").length;
  const carrierCount = carriers.length;
  const brokerCount = brokers.length;
  const avgFreight = Math.round(forwarders.reduce((s, f) => s + f.avgCost, 0) / forwarders.length);
  const avgOnTime = Math.round(forwarders.reduce((s, f) => s + f.onTime, 0) / forwarders.length);
  const bestPerformer = performanceData[0].name;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <Ship className="h-7 w-7 text-blue-400" />
        <h1 className="text-2xl font-bold">ספדיטורים ומובילים</h1>
        <Badge variant="outline" className="mr-auto text-xs text-muted-foreground">טכנו-כל עוזי</Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="bg-slate-900 border-slate-700">
          <CardContent className="pt-5 text-center">
            <Users className="h-5 w-5 mx-auto text-blue-400 mb-1" />
            <p className="text-xs text-slate-400">ספדיטורים פעילים</p>
            <p className="text-2xl font-bold text-blue-400">{activeForwarders}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-700">
          <CardContent className="pt-5 text-center">
            <Truck className="h-5 w-5 mx-auto text-cyan-400 mb-1" />
            <p className="text-xs text-slate-400">מובילים</p>
            <p className="text-2xl font-bold text-cyan-400">{carrierCount}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-700">
          <CardContent className="pt-5 text-center">
            <Briefcase className="h-5 w-5 mx-auto text-purple-400 mb-1" />
            <p className="text-xs text-slate-400">עמילי מכס</p>
            <p className="text-2xl font-bold text-purple-400">{brokerCount}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-700">
          <CardContent className="pt-5 text-center">
            <DollarSign className="h-5 w-5 mx-auto text-amber-400 mb-1" />
            <p className="text-xs text-slate-400">עלות הובלה ממוצעת</p>
            <p className="text-xl font-bold text-amber-400">{fmt(avgFreight)}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-700">
          <CardContent className="pt-5 text-center">
            <Clock className="h-5 w-5 mx-auto text-green-400 mb-1" />
            <p className="text-xs text-slate-400">On-Time Rate</p>
            <p className="text-2xl font-bold text-green-400">{avgOnTime}%</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-700">
          <CardContent className="pt-5 text-center">
            <Award className="h-5 w-5 mx-auto text-yellow-400 mb-1" />
            <p className="text-xs text-slate-400">ביצועים מובילים</p>
            <p className="text-sm font-bold text-yellow-400 truncate">{bestPerformer}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-slate-800">
          <TabsTrigger value="forwarders">ספדיטורים</TabsTrigger>
          <TabsTrigger value="carriers">מובילים</TabsTrigger>
          <TabsTrigger value="brokers">עמילים</TabsTrigger>
          <TabsTrigger value="performance">ביצועים</TabsTrigger>
        </TabsList>

        <TabsContent value="forwarders">
          <Card className="bg-slate-900 border-slate-700">
            <CardHeader><CardTitle className="text-base">פרופילי ספדיטורים</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-right text-slate-400">קוד</TableHead>
                    <TableHead className="text-right text-slate-400">שם</TableHead>
                    <TableHead className="text-right text-slate-400">מדינה</TableHead>
                    <TableHead className="text-right text-slate-400">מסלולים</TableHead>
                    <TableHead className="text-right text-slate-400">משלוחים</TableHead>
                    <TableHead className="text-right text-slate-400">דירוג</TableHead>
                    <TableHead className="text-right text-slate-400">עלות ממוצעת</TableHead>
                    <TableHead className="text-right text-slate-400">בזמן</TableHead>
                    <TableHead className="text-right text-slate-400">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {forwarders.map(f => (
                    <TableRow key={f.id} className="border-slate-800 hover:bg-slate-800/50">
                      <TableCell className="font-mono text-sm">{f.id}</TableCell>
                      <TableCell className="text-sm font-medium">{f.name}</TableCell>
                      <TableCell className="text-sm">{f.country}</TableCell>
                      <TableCell className="text-sm max-w-[160px] truncate">{f.routes}</TableCell>
                      <TableCell className="text-sm font-bold">{f.shipments}</TableCell>
                      <TableCell>{ratingStars(f.rating)}</TableCell>
                      <TableCell className="text-sm">{fmt(f.avgCost)}</TableCell>
                      <TableCell>{onTimeBadge(f.onTime)}</TableCell>
                      <TableCell>
                        {f.status === "preferred"
                          ? <Badge className="bg-emerald-500/20 text-emerald-400">מועדף</Badge>
                          : <Badge className="bg-blue-500/20 text-blue-400">פעיל</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="carriers">
          <Card className="bg-slate-900 border-slate-700">
            <CardHeader><CardTitle className="text-base">מובילים וחברות שילוח</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-right text-slate-400">קוד</TableHead>
                    <TableHead className="text-right text-slate-400">שם</TableHead>
                    <TableHead className="text-right text-slate-400">סוג</TableHead>
                    <TableHead className="text-right text-slate-400">כלי שיט</TableHead>
                    <TableHead className="text-right text-slate-400">מסלול</TableHead>
                    <TableHead className="text-right text-slate-400">ימי מעבר</TableHead>
                    <TableHead className="text-right text-slate-400">אמינות</TableHead>
                    <TableHead className="text-right text-slate-400">עלות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {carriers.map(c => (
                    <TableRow key={c.id} className="border-slate-800 hover:bg-slate-800/50">
                      <TableCell className="font-mono text-sm">{c.id}</TableCell>
                      <TableCell className="text-sm font-medium">{c.name}</TableCell>
                      <TableCell>
                        {c.type === "ימי"
                          ? <Badge className="bg-blue-500/20 text-blue-400">ימי</Badge>
                          : <Badge className="bg-purple-500/20 text-purple-400">אווירי</Badge>}
                      </TableCell>
                      <TableCell className="text-sm">{c.vessels > 0 ? c.vessels : "-"}</TableCell>
                      <TableCell className="text-sm max-w-[160px] truncate">{c.routes}</TableCell>
                      <TableCell className="text-sm font-medium">{c.transitDays} ימים</TableCell>
                      <TableCell>{onTimeBadge(c.reliability)}</TableCell>
                      <TableCell className="text-sm">{fmt(c.cost)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="brokers">
          <Card className="bg-slate-900 border-slate-700">
            <CardHeader><CardTitle className="text-base">עמילי מכס</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-right text-slate-400">קוד</TableHead>
                    <TableHead className="text-right text-slate-400">שם</TableHead>
                    <TableHead className="text-right text-slate-400">רישיון</TableHead>
                    <TableHead className="text-right text-slate-400">התמחות</TableHead>
                    <TableHead className="text-right text-slate-400">רשומות פעילות</TableHead>
                    <TableHead className="text-right text-slate-400">זמן שחרור ממוצע</TableHead>
                    <TableHead className="text-right text-slate-400">הצלחה</TableHead>
                    <TableHead className="text-right text-slate-400">עלות חודשית</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {brokers.map(b => (
                    <TableRow key={b.id} className="border-slate-800 hover:bg-slate-800/50">
                      <TableCell className="font-mono text-sm">{b.id}</TableCell>
                      <TableCell className="text-sm font-medium">{b.name}</TableCell>
                      <TableCell><Badge variant="outline" className="border-slate-600 text-slate-300">{b.license}</Badge></TableCell>
                      <TableCell className="text-sm max-w-[160px] truncate">{b.specialization}</TableCell>
                      <TableCell className="text-sm font-bold">{b.activeEntries}</TableCell>
                      <TableCell className="text-sm">{b.avgClearTime} ימים</TableCell>
                      <TableCell>{onTimeBadge(b.successRate)}</TableCell>
                      <TableCell className="text-sm">{"\u20AA" + b.monthlyFee.toLocaleString("he-IL")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance">
          <Card className="bg-slate-900 border-slate-700">
            <CardHeader><CardTitle className="text-base">השוואת ביצועים - דירוג כללי</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-right text-slate-400">דירוג</TableHead>
                    <TableHead className="text-right text-slate-400">שם</TableHead>
                    <TableHead className="text-right text-slate-400">סוג</TableHead>
                    <TableHead className="text-right text-slate-400">בזמן</TableHead>
                    <TableHead className="text-right text-slate-400">עלות</TableHead>
                    <TableHead className="text-right text-slate-400">אמינות</TableHead>
                    <TableHead className="text-right text-slate-400">תקשורת</TableHead>
                    <TableHead className="text-right text-slate-400">ציון כולל</TableHead>
                    <TableHead className="text-right text-slate-400">מגמה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {performanceData.map(p => (
                    <TableRow key={p.name} className="border-slate-800 hover:bg-slate-800/50">
                      <TableCell>{rankBadge(p.rank)}</TableCell>
                      <TableCell className="text-sm font-medium">{p.name}</TableCell>
                      <TableCell>
                        {p.type === "ספדיטור"
                          ? <Badge className="bg-blue-500/20 text-blue-400">ספדיטור</Badge>
                          : <Badge className="bg-purple-500/20 text-purple-400">עמיל</Badge>}
                      </TableCell>
                      <TableCell className="text-sm">{p.onTime}%</TableCell>
                      <TableCell className="text-sm">{p.costScore}</TableCell>
                      <TableCell className="text-sm">{p.reliability}%</TableCell>
                      <TableCell className="text-sm">{p.communication}</TableCell>
                      <TableCell className="text-sm font-bold text-amber-400">{p.overall}</TableCell>
                      <TableCell>{trendIcon(p.trend)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
