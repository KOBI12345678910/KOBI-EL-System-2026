import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Droplets, TrendingDown, TrendingUp, Fuel, AlertTriangle, Truck, Activity } from "lucide-react";

const fmt = (n: number) => "₪" + n.toLocaleString("he-IL");
const fmtL = (n: number) => n.toLocaleString("he-IL");

const kpis = [
  { label: "צריכת דלק החודש", value: "2,450 ליטר", icon: Droplets, color: "text-blue-400", bg: "bg-blue-500/10" },
  { label: "עלות דלק", value: "₪18,500", icon: Fuel, color: "text-amber-400", bg: "bg-amber-500/10" },
  { label: "ממוצע ל-100 ק\"מ", value: "18.5 ליטר", icon: Activity, color: "text-cyan-400", bg: "bg-cyan-500/10" },
  { label: "חיסכון מול חודש קודם", value: "-8%", icon: TrendingDown, color: "text-green-400", bg: "bg-green-500/10" },
];

const fuelLog = [
  { date: "2026-04-07", vehicle: "משאית 12-345-67", driver: "יוסי כהן", station: "פז - א.ת. חולון", liters: 180, pricePerLiter: 7.52, amount: 1353.6, odometer: 124500, kmSinceLast: 620, per100: 29.0 },
  { date: "2026-04-06", vehicle: "טנדר 23-456-78", driver: "אבי לוי", station: "סונול - ראשל\"צ", liters: 65, pricePerLiter: 7.48, amount: 486.2, odometer: 87230, kmSinceLast: 410, per100: 15.9 },
  { date: "2026-04-06", vehicle: "רכב 34-567-89", driver: "דני אברהם", station: "דלק - פ\"ת", liters: 42, pricePerLiter: 7.55, amount: 317.1, odometer: 45600, kmSinceLast: 350, per100: 12.0 },
  { date: "2026-04-05", vehicle: "משאית 45-678-90", driver: "משה דוד", station: "פז - נתניה", liters: 195, pricePerLiter: 7.50, amount: 1462.5, odometer: 198700, kmSinceLast: 580, per100: 33.6 },
  { date: "2026-04-05", vehicle: "ואן 56-789-01", driver: "רון שמעון", station: "סונול - ב\"ש", liters: 70, pricePerLiter: 7.53, amount: 527.1, odometer: 63100, kmSinceLast: 390, per100: 17.9 },
  { date: "2026-04-04", vehicle: "משאית 12-345-67", driver: "יוסי כהן", station: "דלק - ר\"ג", liters: 175, pricePerLiter: 7.49, amount: 1310.8, odometer: 123880, kmSinceLast: 600, per100: 29.2 },
  { date: "2026-04-04", vehicle: "רכב 67-890-12", driver: "עמית גולן", station: "פז - ת\"א", liters: 38, pricePerLiter: 7.56, amount: 287.3, odometer: 32400, kmSinceLast: 320, per100: 11.9 },
  { date: "2026-04-03", vehicle: "טנדר 78-901-23", driver: "אלון בר", station: "סונול - חיפה", liters: 60, pricePerLiter: 7.50, amount: 450.0, odometer: 71500, kmSinceLast: 380, per100: 15.8 },
  { date: "2026-04-03", vehicle: "ואן 56-789-01", driver: "רון שמעון", station: "דלק - אשדוד", liters: 68, pricePerLiter: 7.51, amount: 510.7, odometer: 62710, kmSinceLast: 400, per100: 17.0 },
  { date: "2026-04-02", vehicle: "משאית 45-678-90", driver: "משה דוד", station: "פז - הרצליה", liters: 190, pricePerLiter: 7.48, amount: 1421.2, odometer: 198120, kmSinceLast: 570, per100: 33.3 },
  { date: "2026-04-02", vehicle: "רכב 89-012-34", driver: "נועם ישראלי", station: "סונול - כ\"ס", liters: 45, pricePerLiter: 7.54, amount: 339.3, odometer: 55200, kmSinceLast: 340, per100: 13.2 },
  { date: "2026-04-01", vehicle: "טנדר 23-456-78", driver: "אבי לוי", station: "דלק - לוד", liters: 62, pricePerLiter: 7.50, amount: 465.0, odometer: 86820, kmSinceLast: 420, per100: 14.8 },
  { date: "2026-04-01", vehicle: "משאית 12-345-67", driver: "יוסי כהן", station: "פז - חולון", liters: 185, pricePerLiter: 7.52, amount: 1391.2, odometer: 123280, kmSinceLast: 610, per100: 30.3 },
  { date: "2026-03-31", vehicle: "רכב 34-567-89", driver: "דני אברהם", station: "סונול - פ\"ת", liters: 40, pricePerLiter: 7.47, amount: 298.8, odometer: 45250, kmSinceLast: 360, per100: 11.1 },
  { date: "2026-03-31", vehicle: "ואן 90-123-45", driver: "גיל מזרחי", station: "פז - ירושלים", liters: 72, pricePerLiter: 7.55, amount: 543.6, odometer: 48900, kmSinceLast: 370, per100: 19.5 },
];

const vehicleComparison = [
  { vehicle: "משאית 12-345-67", type: "משאית", avgPer100: 29.5, totalCost: 4055, totalLiters: 540, rating: "אדום" },
  { vehicle: "משאית 45-678-90", type: "משאית", avgPer100: 33.5, totalCost: 2884, totalLiters: 385, rating: "אדום" },
  { vehicle: "טנדר 23-456-78", type: "טנדר", avgPer100: 15.4, totalCost: 951, totalLiters: 127, rating: "ירוק" },
  { vehicle: "טנדר 78-901-23", type: "טנדר", avgPer100: 15.8, totalCost: 450, totalLiters: 60, rating: "ירוק" },
  { vehicle: "רכב 34-567-89", type: "רכב", avgPer100: 11.6, totalCost: 616, totalLiters: 82, rating: "ירוק" },
  { vehicle: "רכב 67-890-12", type: "רכב", avgPer100: 11.9, totalCost: 287, totalLiters: 38, rating: "ירוק" },
  { vehicle: "ואן 56-789-01", type: "ואן", avgPer100: 17.5, totalCost: 1038, totalLiters: 138, rating: "צהוב" },
  { vehicle: "ואן 90-123-45", type: "ואן", avgPer100: 19.5, totalCost: 544, totalLiters: 72, rating: "צהוב" },
];

const monthlyTrend = [
  { month: "נובמבר 2025", liters: 2780, cost: 20572, avgPrice: 7.40 },
  { month: "דצמבר 2025", liters: 2900, cost: 21605, avgPrice: 7.45 },
  { month: "ינואר 2026", liters: 2820, cost: 21150, avgPrice: 7.50 },
  { month: "פברואר 2026", liters: 2690, cost: 20310, avgPrice: 7.55 },
  { month: "מרץ 2026", liters: 2660, cost: 19817, avgPrice: 7.45 },
  { month: "אפריל 2026", liters: 2450, cost: 18500, avgPrice: 7.55 },
];

const anomalies = [
  {
    severity: "high",
    title: "צריכה חריגה - משאית 45-678-90",
    description: "צריכת דלק של 33.5 ליטר/100 ק\"מ חורגת ב-18% מהממוצע לרכב מסוג זה. יש לבדוק מצב מנוע ולחץ צמיגים.",
    date: "2026-04-05",
  },
  {
    severity: "medium",
    title: "חשד לדליפת דלק - ואן 90-123-45",
    description: "הפער בין כמות הדלק שנרשמה לבין הקילומטרים שנסעו מצביע על אובדן דלק לא מוסבר של כ-8 ליטר. מומלץ בדיקה במוסך.",
    date: "2026-04-02",
  },
  {
    severity: "medium",
    title: "תדלוק בתדירות גבוהה - משאית 12-345-67",
    description: "3 תדלוקים ב-6 ימים. התדירות גבוהה ב-40% מהרגיל. יש לוודא שהרכב אינו מבצע נסיעות מיותרות או שאין בעיה מכנית.",
    date: "2026-04-07",
  },
];

const ratingColor = (r: string) => {
  if (r === "ירוק") return "bg-green-500/20 text-green-300 border-green-500/40";
  if (r === "צהוב") return "bg-yellow-500/20 text-yellow-300 border-yellow-500/40";
  return "bg-red-500/20 text-red-300 border-red-500/40";
};

const severityColor = (s: string) => {
  if (s === "high") return "border-red-500/50 bg-red-500/5";
  return "border-yellow-500/50 bg-yellow-500/5";
};

const severityBadge = (s: string) => {
  if (s === "high") return "bg-red-500/20 text-red-300 border-red-500/40";
  return "bg-yellow-500/20 text-yellow-300 border-yellow-500/40";
};

const maxLiters = Math.max(...monthlyTrend.map(m => m.liters));

export default function FuelManagement() {
  const [tab, setTab] = useState("log");

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-blue-500/10">
          <Droplets className="w-7 h-7 text-blue-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">ניהול דלק</h1>
          <p className="text-sm text-muted-foreground">טכנו-כל עוזי — מעקב צריכה, עלויות וחריגות</p>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <Card key={k.label} className="border-border/50">
            <CardContent className="p-4 flex items-center gap-4">
              <div className={`p-3 rounded-lg ${k.bg}`}>
                <k.icon className={`w-6 h-6 ${k.color}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <p className={`text-xl font-bold ${k.color}`}>{k.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-muted/50">
          <TabsTrigger value="log">יומן תדלוקים</TabsTrigger>
          <TabsTrigger value="vehicles">השוואת רכבים</TabsTrigger>
          <TabsTrigger value="trend">מגמה חודשית</TabsTrigger>
          <TabsTrigger value="anomalies">זיהוי חריגות</TabsTrigger>
        </TabsList>

        {/* Fuel Log Table */}
        <TabsContent value="log">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Fuel className="w-5 h-5 text-amber-400" />
                יומן תדלוקים — 15 רשומות אחרונות
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">תאריך</TableHead>
                    <TableHead className="text-right">רכב</TableHead>
                    <TableHead className="text-right">נהג</TableHead>
                    <TableHead className="text-right">תחנת דלק</TableHead>
                    <TableHead className="text-right">ליטרים</TableHead>
                    <TableHead className="text-right">מחיר/ליטר</TableHead>
                    <TableHead className="text-right">סכום</TableHead>
                    <TableHead className="text-right">קילומטרז׳</TableHead>
                    <TableHead className="text-right">ק״מ מאז קודם</TableHead>
                    <TableHead className="text-right">ל-100 ק״מ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fuelLog.map((row, i) => (
                    <TableRow key={i} className="hover:bg-muted/30">
                      <TableCell className="text-sm">{row.date}</TableCell>
                      <TableCell className="text-sm font-medium">{row.vehicle}</TableCell>
                      <TableCell className="text-sm">{row.driver}</TableCell>
                      <TableCell className="text-sm">{row.station}</TableCell>
                      <TableCell className="text-sm">{fmtL(row.liters)}</TableCell>
                      <TableCell className="text-sm">{fmt(row.pricePerLiter)}</TableCell>
                      <TableCell className="text-sm font-semibold">{fmt(row.amount)}</TableCell>
                      <TableCell className="text-sm">{fmtL(row.odometer)}</TableCell>
                      <TableCell className="text-sm">{fmtL(row.kmSinceLast)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={row.per100 > 25 ? "bg-red-500/20 text-red-300 border-red-500/40" : row.per100 > 16 ? "bg-yellow-500/20 text-yellow-300 border-yellow-500/40" : "bg-green-500/20 text-green-300 border-green-500/40"}>
                          {row.per100}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Vehicle Fuel Comparison */}
        <TabsContent value="vehicles">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Truck className="w-5 h-5 text-cyan-400" />
                השוואת צריכת דלק לפי רכב
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {vehicleComparison.map((v) => (
                  <div key={v.vehicle} className={`p-4 rounded-lg border ${ratingColor(v.rating).replace(/text-\S+/, "").trim()} space-y-3`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-foreground">{v.vehicle}</p>
                        <p className="text-xs text-muted-foreground">{v.type}</p>
                      </div>
                      <Badge variant="outline" className={ratingColor(v.rating)}>
                        {v.rating === "ירוק" ? "יעיל" : v.rating === "צהוב" ? "בינוני" : "בזבזני"}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div>
                        <p className="text-xs text-muted-foreground">ממוצע ל-100 ק״מ</p>
                        <p className="text-lg font-bold text-foreground">{v.avgPer100}</p>
                        <p className="text-xs text-muted-foreground">ליטר</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">עלות כוללת</p>
                        <p className="text-lg font-bold text-foreground">{fmt(v.totalCost)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">סה״כ ליטרים</p>
                        <p className="text-lg font-bold text-foreground">{fmtL(v.totalLiters)}</p>
                      </div>
                    </div>
                    <Progress
                      value={Math.min((v.avgPer100 / 40) * 100, 100)}
                      className="h-2"
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Monthly Trend */}
        <TabsContent value="trend">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <TrendingUp className="w-5 h-5 text-purple-400" />
                מגמה חודשית — 6 חודשים אחרונים
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">חודש</TableHead>
                    <TableHead className="text-right">ליטרים</TableHead>
                    <TableHead className="text-right">עלות</TableHead>
                    <TableHead className="text-right">מחיר ממוצע/ליטר</TableHead>
                    <TableHead className="text-right">גרף צריכה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlyTrend.map((m) => (
                    <TableRow key={m.month} className="hover:bg-muted/30">
                      <TableCell className="font-medium">{m.month}</TableCell>
                      <TableCell>{fmtL(m.liters)}</TableCell>
                      <TableCell className="font-semibold">{fmt(m.cost)}</TableCell>
                      <TableCell>{fmt(m.avgPrice)}</TableCell>
                      <TableCell className="w-48">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-muted/30 rounded-full h-3 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-l from-blue-400 to-blue-600 transition-all"
                              style={{ width: `${(m.liters / maxLiters) * 100}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground w-8">{fmtL(m.liters)}</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-4 flex gap-6 text-sm text-muted-foreground border-t border-border pt-4">
                <div>שינוי צריכה (6 חודשים): <span className="text-green-400 font-semibold">-11.9%</span></div>
                <div>שינוי מחיר ממוצע: <span className="text-yellow-400 font-semibold">+2.0%</span></div>
                <div>חיסכון כולל: <span className="text-green-400 font-semibold">{fmt(2072)}</span></div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Anomaly Detection */}
        <TabsContent value="anomalies">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <AlertTriangle className="w-5 h-5 text-red-400" />
                זיהוי חריגות — התראות פעילות
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {anomalies.map((a, i) => (
                <div key={i} className={`p-4 rounded-lg border-2 ${severityColor(a.severity)} space-y-2`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className={`w-5 h-5 ${a.severity === "high" ? "text-red-400" : "text-yellow-400"}`} />
                      <h3 className="font-semibold text-foreground">{a.title}</h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={severityBadge(a.severity)}>
                        {a.severity === "high" ? "חומרה גבוהה" : "חומרה בינונית"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{a.date}</span>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{a.description}</p>
                </div>
              ))}
              <div className="pt-2 border-t border-border text-sm text-muted-foreground">
                סה״כ 3 התראות פעילות — 1 חומרה גבוהה, 2 חומרה בינונית
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}