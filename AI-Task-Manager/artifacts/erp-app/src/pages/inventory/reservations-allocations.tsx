import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Lock, ShieldCheck, Package, FolderKanban, AlertTriangle,
  Clock, CalendarX, ArrowLeftRight, History, CheckCircle2
} from "lucide-react";

const reservations = [
  { id: "RSV-001", item: "פרופיל אלומיניום Pro-X 100mm", sku: "ALU-PRO-X100", qty: 80, forProject: "פרויקט מגדלי חולון", wo: "WO-1120", reservedBy: "יוסי לוי", date: "2026-04-01", expiry: "2026-04-15", status: "active" },
  { id: "RSV-002", item: "זכוכית מחוסמת 8mm", sku: "GLS-TMP-8MM", qty: 50, forProject: "פרויקט מלון הרצליה", wo: "WO-1124", reservedBy: "דוד כהן", date: "2026-04-02", expiry: "2026-04-18", status: "active" },
  { id: "RSV-003", item: "ציר premium", sku: "ACC-HNG-PRE", qty: 200, forProject: "פרויקט בית ספר נתניה", wo: "WO-1098", reservedBy: "שרה מזרחי", date: "2026-03-28", expiry: "2026-04-10", status: "expiring" },
  { id: "RSV-004", item: "מוט ברזל 16mm", sku: "BRZ-BAR-16", qty: 30, forProject: "פרויקט מגדלי חולון", wo: "WO-1121", reservedBy: "יוסי לוי", date: "2026-04-03", expiry: "2026-04-20", status: "active" },
  { id: "RSV-005", item: "סיליקון שחור", sku: "SLN-SIL-BLK", qty: 24, forProject: "פרויקט מלון הרצליה", wo: "WO-1125", reservedBy: "דוד כהן", date: "2026-04-05", expiry: "2026-04-12", status: "expiring" },
  { id: "RSV-006", item: "בורג נירוסטה M10", sku: "FAS-BLT-M10", qty: 500, forProject: "פרויקט בית ספר נתניה", wo: "WO-1099", reservedBy: "שרה מזרחי", date: "2026-04-04", expiry: "2026-04-25", status: "active" },
  { id: "RSV-007", item: "פרופיל Pro-X 60mm", sku: "ALU-PRO-X60", qty: 120, forProject: "פרויקט קניון ראשון", wo: "WO-1130", reservedBy: "אבי גולן", date: "2026-04-06", expiry: "2026-04-22", status: "active" },
  { id: "RSV-008", item: "אטם EPDM 12mm", sku: "SEL-EPDM-12", qty: 60, forProject: "פרויקט קניון ראשון", wo: "WO-1131", reservedBy: "אבי גולן", date: "2026-04-07", expiry: "2026-04-28", status: "active" },
];

const allocations = [
  { project: "פרויקט מגדלי חולון", items: 8, totalValue: 245000, consumption: 62, remaining: 93100 },
  { project: "פרויקט מלון הרצליה", items: 5, totalValue: 182000, consumption: 45, remaining: 100100 },
  { project: "פרויקט בית ספר נתניה", items: 6, totalValue: 128000, consumption: 78, remaining: 28160 },
  { project: "פרויקט קניון ראשון", items: 4, totalValue: 310000, consumption: 22, remaining: 241800 },
  { project: "פרויקט משרדי הייטק ת\"א", items: 7, totalValue: 198000, consumption: 55, remaining: 89100 },
  { project: "פרויקט בית חולים אשדוד", items: 9, totalValue: 420000, consumption: 35, remaining: 273000 },
  { project: "פרויקט מגורי יוקרה נתניה", items: 3, totalValue: 95000, consumption: 88, remaining: 11400 },
  { project: "פרויקט מפעל לוד", items: 5, totalValue: 156000, consumption: 12, remaining: 137280 },
];

const conflicts = [
  { item: "פרופיל אלומיניום Pro-X 100mm", sku: "ALU-PRO-X100", projects: ["מגדלי חולון", "קניון ראשון", "משרדי הייטק ת\"א"], totalDemand: 280, available: 165, gap: 115, severity: "high" },
  { item: "זכוכית מחוסמת 8mm", sku: "GLS-TMP-8MM", projects: ["מלון הרצליה", "בית ספר נתניה"], totalDemand: 130, available: 82, gap: 48, severity: "medium" },
  { item: "ציר premium", sku: "ACC-HNG-PRE", projects: ["בית ספר נתניה", "מגורי יוקרה נתניה"], totalDemand: 320, available: 180, gap: 140, severity: "high" },
  { item: "סיליקון שחור", sku: "SLN-SIL-BLK", projects: ["מלון הרצליה", "מפעל לוד"], totalDemand: 48, available: 12, gap: 36, severity: "critical" },
  { item: "מוט ברזל 16mm", sku: "BRZ-BAR-16", projects: ["מגדלי חולון", "בית חולים אשדוד"], totalDemand: 90, available: 58, gap: 32, severity: "medium" },
  { item: "בורג נירוסטה M10", sku: "FAS-BLT-M10", projects: ["בית ספר נתניה", "קניון ראשון", "מפעל לוד"], totalDemand: 1200, available: 800, gap: 400, severity: "high" },
  { item: "פרופיל Pro-X 60mm", sku: "ALU-PRO-X60", projects: ["קניון ראשון", "משרדי הייטק ת\"א"], totalDemand: 350, available: 260, gap: 90, severity: "medium" },
  { item: "אטם EPDM 12mm", sku: "SEL-EPDM-12", projects: ["קניון ראשון", "בית חולים אשדוד"], totalDemand: 140, available: 95, gap: 45, severity: "medium" },
];

const history = [
  { id: "RSV-091", item: "פלדה מגולוונת 2mm", project: "פרויקט מרכז לוגיסטי", qty: 150, releasedDate: "2026-03-25", reason: "consumed", by: "יוסי לוי" },
  { id: "RSV-088", item: "אלומיניום 6063-T5", project: "פרויקט מגדל עזריאלי", qty: 300, releasedDate: "2026-03-20", reason: "expired", by: "מערכת" },
  { id: "RSV-085", item: "זכוכית למינציה 10mm", project: "פרויקט מרכז לוגיסטי", qty: 45, releasedDate: "2026-03-18", reason: "consumed", by: "דוד כהן" },
  { id: "RSV-082", item: "ברגים M8 נירוסטה", project: "פרויקט מגדל עזריאלי", qty: 800, releasedDate: "2026-03-15", reason: "released", by: "שרה מזרחי" },
  { id: "RSV-079", item: "פרופיל תרמי TB-24", project: "פרויקט בניין עיריית חיפה", qty: 90, releasedDate: "2026-03-12", reason: "consumed", by: "אבי גולן" },
  { id: "RSV-076", item: "אטם גומי 8mm", project: "פרויקט בניין עיריית חיפה", qty: 200, releasedDate: "2026-03-10", reason: "expired", by: "מערכת" },
  { id: "RSV-073", item: "ידית נסתרת שחור מט", project: "פרויקט מגורי יוקרה", qty: 60, releasedDate: "2026-03-08", reason: "released", by: "יוסי לוי" },
  { id: "RSV-070", item: "סיליקון שקוף UV", project: "פרויקט מרכז לוגיסטי", qty: 35, releasedDate: "2026-03-05", reason: "consumed", by: "דוד כהן" },
];

const fmt = (v: number) => `₪${v.toLocaleString("he-IL")}`;

const statusMap: Record<string, { label: string; cls: string }> = {
  active: { label: "פעיל", cls: "bg-green-500/20 text-green-300" },
  expiring: { label: "פג בקרוב", cls: "bg-amber-500/20 text-amber-300" },
  expired: { label: "פג תוקף", cls: "bg-red-500/20 text-red-300" },
};

const reasonMap: Record<string, { label: string; cls: string }> = {
  consumed: { label: "נוצל", cls: "bg-green-500/20 text-green-300" },
  expired: { label: "פג תוקף", cls: "bg-red-500/20 text-red-300" },
  released: { label: "שוחרר", cls: "bg-blue-500/20 text-blue-300" },
};

const severityMap: Record<string, { label: string; cls: string }> = {
  critical: { label: "קריטי", cls: "bg-red-500/20 text-red-300" },
  high: { label: "גבוה", cls: "bg-orange-500/20 text-orange-300" },
  medium: { label: "בינוני", cls: "bg-yellow-500/20 text-yellow-300" },
};

export default function ReservationsAllocations() {
  const [tab, setTab] = useState("reservations");

  const kpis = [
    { label: "שריונות פעילים", value: reservations.filter(r => r.status === "active").length + reservations.filter(r => r.status === "expiring").length, icon: ShieldCheck, color: "text-blue-400" },
    { label: "פריטים משוריינים", value: reservations.reduce((s, r) => s + r.qty, 0).toLocaleString(), icon: Package, color: "text-cyan-400" },
    { label: "שווי שריונות", value: fmt(1734000), icon: Lock, color: "text-emerald-400" },
    { label: "הקצאות לפרויקטים", value: allocations.length, icon: FolderKanban, color: "text-violet-400" },
    { label: "פג תוקף בקרוב", value: reservations.filter(r => r.status === "expiring").length, icon: Clock, color: "text-amber-400" },
    { label: "התנגשויות", value: conflicts.length, icon: AlertTriangle, color: "text-red-400" },
  ];

  return (
    <div className="p-6 space-y-5" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Lock className="h-7 w-7 text-primary" /> שריונות והקצאות לפרויקטים
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">ניהול שריונות מלאי, הקצאות לפרויקטים, זיהוי התנגשויות ומעקב תפוגה</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k, i) => {
          const Icon = k.icon;
          return (
            <Card key={i} className="bg-card/80 border-border">
              <CardContent className="p-4 text-center">
                <Icon className={`h-5 w-5 mx-auto ${k.color} mb-1`} />
                <p className="text-[11px] text-muted-foreground">{k.label}</p>
                <p className={`text-xl font-bold font-mono mt-1 ${k.color}`}>{k.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="reservations" className="text-xs gap-1"><ShieldCheck className="h-3.5 w-3.5" /> שריונות</TabsTrigger>
          <TabsTrigger value="allocations" className="text-xs gap-1"><FolderKanban className="h-3.5 w-3.5" /> הקצאות</TabsTrigger>
          <TabsTrigger value="conflicts" className="text-xs gap-1"><AlertTriangle className="h-3.5 w-3.5" /> התנגשויות</TabsTrigger>
          <TabsTrigger value="history" className="text-xs gap-1"><History className="h-3.5 w-3.5" /> היסטוריה</TabsTrigger>
        </TabsList>

        <TabsContent value="reservations">
          <Card className="bg-card/80 border-border">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-border bg-background/50">
                    <TableHead className="text-right">מס׳ שריון</TableHead>
                    <TableHead className="text-right">פריט</TableHead>
                    <TableHead className="text-right">כמות</TableHead>
                    <TableHead className="text-right">עבור פרויקט / WO</TableHead>
                    <TableHead className="text-right">שוריין ע״י</TableHead>
                    <TableHead className="text-right">תאריך</TableHead>
                    <TableHead className="text-right">תפוגה</TableHead>
                    <TableHead className="text-right">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reservations.map(r => (
                    <TableRow key={r.id} className="border-border/50 hover:bg-muted/30">
                      <TableCell className="font-mono text-xs text-cyan-400">{r.id}</TableCell>
                      <TableCell><span className="text-foreground text-sm">{r.item}</span><br /><span className="text-[10px] text-muted-foreground font-mono">{r.sku}</span></TableCell>
                      <TableCell className="font-mono font-bold text-foreground">{r.qty.toLocaleString()}</TableCell>
                      <TableCell><span className="text-sm text-foreground">{r.forProject}</span><br /><span className="text-[10px] text-muted-foreground font-mono">{r.wo}</span></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.reservedBy}</TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">{r.date}</TableCell>
                      <TableCell className="text-xs font-mono">{r.expiry}</TableCell>
                      <TableCell><Badge className={`border-0 text-xs ${statusMap[r.status].cls}`}>{statusMap[r.status].label}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="allocations">
          <Card className="bg-card/80 border-border">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-border bg-background/50">
                    <TableHead className="text-right">פרויקט</TableHead>
                    <TableHead className="text-right">פריטים מוקצים</TableHead>
                    <TableHead className="text-right">שווי כולל</TableHead>
                    <TableHead className="text-right w-[180px]">צריכה %</TableHead>
                    <TableHead className="text-right">יתרה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allocations.map((a, i) => (
                    <TableRow key={i} className="border-border/50 hover:bg-muted/30">
                      <TableCell className="text-sm font-medium text-foreground">{a.project}</TableCell>
                      <TableCell className="font-mono text-sm text-cyan-400">{a.items}</TableCell>
                      <TableCell className="font-mono text-sm text-emerald-400">{fmt(a.totalValue)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={a.consumption} className="h-2 flex-1" />
                          <span className={`text-xs font-mono w-10 text-left ${a.consumption >= 80 ? "text-red-400" : a.consumption >= 50 ? "text-amber-400" : "text-green-400"}`}>{a.consumption}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">{fmt(a.remaining)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="conflicts">
          <Card className="bg-card/80 border-border">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-border bg-background/50">
                    <TableHead className="text-right">פריט</TableHead>
                    <TableHead className="text-right">פרויקטים מתחרים</TableHead>
                    <TableHead className="text-right">ביקוש כולל</TableHead>
                    <TableHead className="text-right">זמין</TableHead>
                    <TableHead className="text-right">פער</TableHead>
                    <TableHead className="text-right">חומרה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {conflicts.map((c, i) => (
                    <TableRow key={i} className="border-border/50 hover:bg-muted/30">
                      <TableCell><span className="text-sm text-foreground">{c.item}</span><br /><span className="text-[10px] text-muted-foreground font-mono">{c.sku}</span></TableCell>
                      <TableCell><div className="flex flex-wrap gap-1">{c.projects.map((p, j) => <Badge key={j} className="bg-slate-500/20 text-slate-300 border-0 text-[10px]">{p}</Badge>)}</div></TableCell>
                      <TableCell className="font-mono text-sm text-foreground">{c.totalDemand.toLocaleString()}</TableCell>
                      <TableCell className="font-mono text-sm text-green-400">{c.available.toLocaleString()}</TableCell>
                      <TableCell className="font-mono text-sm text-red-400">-{c.gap.toLocaleString()}</TableCell>
                      <TableCell><Badge className={`border-0 text-xs ${severityMap[c.severity].cls}`}>{severityMap[c.severity].label}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card className="bg-card/80 border-border">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-border bg-background/50">
                    <TableHead className="text-right">מס׳ שריון</TableHead>
                    <TableHead className="text-right">פריט</TableHead>
                    <TableHead className="text-right">פרויקט</TableHead>
                    <TableHead className="text-right">כמות</TableHead>
                    <TableHead className="text-right">תאריך שחרור</TableHead>
                    <TableHead className="text-right">סיבה</TableHead>
                    <TableHead className="text-right">ע״י</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map(h => (
                    <TableRow key={h.id} className="border-border/50 hover:bg-muted/30">
                      <TableCell className="font-mono text-xs text-cyan-400">{h.id}</TableCell>
                      <TableCell className="text-sm text-foreground">{h.item}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{h.project}</TableCell>
                      <TableCell className="font-mono text-sm text-foreground">{h.qty.toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">{h.releasedDate}</TableCell>
                      <TableCell><Badge className={`border-0 text-xs ${reasonMap[h.reason].cls}`}>{reasonMap[h.reason].label}</Badge></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{h.by}</TableCell>
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
