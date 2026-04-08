import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Paintbrush, Sparkles, Droplets, Flame, CheckCircle, Clock,
  TrendingUp, TrendingDown, Activity, Layers, ThermometerSun, Eye
} from "lucide-react";

/* ── Fallback grinding_jobs ── */
const FALLBACK_GRINDING = [
  { wo: "WO-4801", product: "מסגרת אלומיניום 180x90", operator: "יוסי כהן", station: "STN-301", progress: 85, quality: "תקין", grainSize: "P120", method: "שטוח" },
  { wo: "WO-4802", product: "דלת פלדה מחוזקת", operator: "דוד מזרחי", station: "STN-302", progress: 60, quality: "תקין", grainSize: "P80", method: "סרט" },
  { wo: "WO-4803", product: "מעקה נירוסטה מעוגל", operator: "אלון גולדשטיין", station: "STN-301", progress: 100, quality: "מצוין", grainSize: "P220", method: "שטוח" },
  { wo: "WO-4804", product: "פרופיל ברזל 60x40", operator: "עומר חדד", station: "STN-302", progress: 40, quality: "דורש תיקון", grainSize: "P60", method: "סרט" },
  { wo: "WO-4805", product: "מדף תלוי מתכת", operator: "יוסי כהן", station: "STN-301", progress: 95, quality: "תקין", grainSize: "P180", method: "שטוח" },
  { wo: "WO-4806", product: "חלון אלומיניום דו-כנפי", operator: "דוד מזרחי", station: "STN-302", progress: 20, quality: "ממתין לבדיקה", grainSize: "P120", method: "סרט" },
  { wo: "WO-4807", product: "שער חניה מגולוון", operator: "אלון גולדשטיין", station: "STN-301", progress: 70, quality: "תקין", grainSize: "P100", method: "שטוח" },
  { wo: "WO-4808", product: "תריס גלילה פלדה", operator: "עומר חדד", station: "STN-302", progress: 55, quality: "תקין", grainSize: "P150", method: "סרט" },
];

/* ── Fallback galvanization_queue ── */
const FALLBACK_GALVANIZATION = [
  { batch: "GAL-1201", items: 24, weightKg: 186, source: "פנימי", status: "בטבילה", expected: "14:30", zincLayer: "85 מיקרון" },
  { batch: "GAL-1202", items: 12, weightKg: 340, source: "ספק - מתכת בע\"מ", status: "ממתין", expected: "16:00", zincLayer: "70 מיקרון" },
  { batch: "GAL-1203", items: 36, weightKg: 95, source: "פנימי", status: "ייבוש", expected: "13:00", zincLayer: "100 מיקרון" },
  { batch: "GAL-1204", items: 8, weightKg: 520, source: "ספק - גלוון ישראל", status: "הושלם", expected: "11:30", zincLayer: "90 מיקרון" },
  { batch: "GAL-1205", items: 18, weightKg: 210, source: "פנימי", status: "בטבילה", expected: "15:15", zincLayer: "80 מיקרון" },
  { batch: "GAL-1206", items: 42, weightKg: 155, source: "ספק - מתכת בע\"מ", status: "ממתין", expected: "17:30", zincLayer: "75 מיקרון" },
  { batch: "GAL-1207", items: 6, weightKg: 680, source: "פנימי", status: "בדיקת עובי", expected: "12:45", zincLayer: "110 מיקרון" },
  { batch: "GAL-1208", items: 30, weightKg: 270, source: "פנימי", status: "הושלם", expected: "10:00", zincLayer: "85 מיקרון" },
];

/* ── Fallback powder_coating_queue ── */
const FALLBACK_POWDER_COATING = [
  { batch: "PC-3301", colorCode: "RAL-9005", colorName: "שחור עמוק", items: 16, thicknessSpec: "60-80", ovenTemp: 190, status: "באפייה" },
  { batch: "PC-3302", colorCode: "RAL-9010", colorName: "לבן טהור", items: 28, thicknessSpec: "50-70", ovenTemp: 185, status: "ריסוס" },
  { batch: "PC-3303", colorCode: "RAL-7016", colorName: "אפור אנתרציט", items: 10, thicknessSpec: "70-90", ovenTemp: 200, status: "הושלם" },
  { batch: "PC-3304", colorCode: "RAL-3020", colorName: "אדום תעבורה", items: 8, thicknessSpec: "55-75", ovenTemp: 195, status: "ממתין" },
  { batch: "PC-3305", colorCode: "RAL-5015", colorName: "כחול שמיים", items: 20, thicknessSpec: "60-80", ovenTemp: 190, status: "באפייה" },
  { batch: "PC-3306", colorCode: "RAL-6005", colorName: "ירוק אזוב", items: 14, thicknessSpec: "65-85", ovenTemp: 195, status: "ריסוס" },
  { batch: "PC-3307", colorCode: "RAL-8017", colorName: "חום שוקולד", items: 22, thicknessSpec: "50-70", ovenTemp: 185, status: "הושלם" },
  { batch: "PC-3308", colorCode: "RAL-1015", colorName: "שנהב בהיר", items: 18, thicknessSpec: "55-75", ovenTemp: 190, status: "צינון" },
];

/* ── Fallback painting_status_tracking ── */
const FALLBACK_PAINTING = [
  { item: "מסגרת דלת D-220", color: "לבן מאט", coats: 2, dryingStatus: "יבש", qc: "עבר" },
  { item: "שער כניסה G-150", color: "שחור מבריק", coats: 3, dryingStatus: "בייבוש", qc: "ממתין" },
  { item: "מעקה מדרגות R-88", color: "אפור מטאלי", coats: 2, dryingStatus: "יבש", qc: "עבר" },
  { item: "ארון חשמל CB-40", color: "RAL-7035 אפור", coats: 1, dryingStatus: "שכבה ראשונה", qc: "ממתין" },
  { item: "פרגולה PG-300", color: "חום עץ", coats: 3, dryingStatus: "יבש", qc: "עבר" },
  { item: "תריס אלומיניום SH-60", color: "לבן מבריק", coats: 2, dryingStatus: "בייבוש", qc: "נכשל" },
  { item: "גדר פלדה FN-180", color: "ירוק כהה", coats: 2, dryingStatus: "יבש", qc: "עבר" },
  { item: "דלת מחסן WD-90", color: "כתום בטיחות", coats: 3, dryingStatus: "בייבוש", qc: "ממתין" },
];

const statusColor: Record<string, string> = {
  "בטבילה": "bg-blue-500/20 text-blue-300",
  "ממתין": "bg-gray-500/20 text-gray-300",
  "ייבוש": "bg-yellow-500/20 text-yellow-300",
  "הושלם": "bg-green-500/20 text-green-300",
  "בדיקת עובי": "bg-purple-500/20 text-purple-300",
  "באפייה": "bg-orange-500/20 text-orange-300",
  "ריסוס": "bg-cyan-500/20 text-cyan-300",
  "צינון": "bg-teal-500/20 text-teal-300",
  "בייבוש": "bg-yellow-500/20 text-yellow-300",
  "שכבה ראשונה": "bg-amber-500/20 text-amber-300",
  "יבש": "bg-green-500/20 text-green-300",
};

const qcColor: Record<string, string> = {
  "עבר": "bg-green-500/20 text-green-300",
  "ממתין": "bg-gray-500/20 text-gray-300",
  "נכשל": "bg-red-500/20 text-red-300",
  "ממתין לבדיקה": "bg-gray-500/20 text-gray-300",
};

const qualityColor: Record<string, string> = {
  "תקין": "bg-green-500/20 text-green-300",
  "מצוין": "bg-emerald-500/20 text-emerald-300",
  "דורש תיקון": "bg-red-500/20 text-red-300",
  "ממתין לבדיקה": "bg-gray-500/20 text-gray-300",
};

const progressColor = (v: number) => v === 100 ? "bg-green-500" : v >= 70 ? "bg-blue-500" : v >= 40 ? "bg-yellow-500" : "bg-red-500";

export default function FinishingJobs() {
  const [tab, setTab] = useState("grinding");

  const { data: apiData } = useQuery({
    queryKey: ["production-finishing-jobs"],
    queryFn: () => authFetch("/api/production/work-orders?type=finishing").then(r => r.json()),
  });
  const safeArr = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
  const raw = safeArr(apiData);
  const grindingJobs = raw.length > 0 ? raw.filter((r: any) => r.stage === "grinding") : FALLBACK_GRINDING;
  const galvanizationQueue = raw.length > 0 ? raw.filter((r: any) => r.stage === "galvanization") : FALLBACK_GALVANIZATION;
  const powderCoatingQueue = raw.length > 0 ? raw.filter((r: any) => r.stage === "powder_coating") : FALLBACK_POWDER_COATING;
  const paintingStatus = raw.length > 0 ? raw.filter((r: any) => r.stage === "painting") : FALLBACK_PAINTING;

  const kpis = [
    { label: "עבודות פעילות", value: "34", icon: Activity, color: "text-blue-400", trend: "+4", up: true },
    { label: "תור שיוף", value: "8", icon: Sparkles, color: "text-purple-400", trend: "-2", up: true },
    { label: "תור גלוון", value: "6", icon: Droplets, color: "text-cyan-400", trend: "+1", up: false },
    { label: "תור אבקה", value: "5", icon: Flame, color: "text-orange-400", trend: "0", up: true },
    { label: "הושלמו היום", value: "12", icon: CheckCircle, color: "text-green-400", trend: "+3", up: true },
    { label: "זמן ייבוש ממוצע", value: "42 דק׳", icon: Clock, color: "text-yellow-400", trend: "-8 דק׳", up: true },
  ];

  return (
    <div className="p-6 space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Paintbrush className="h-6 w-6 text-pink-400" />
            עבודות גימור וציפוי
          </h1>
          <p className="text-sm text-muted-foreground mt-1">שיוף, גלוון, ציפוי אבקה וצביעה - טכנו-כל עוזי</p>
        </div>
      </div>

      {/* KPI Cards */}
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

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="grinding" className="data-[state=active]:bg-purple-600/30 data-[state=active]:text-purple-300 gap-1.5">
            <Sparkles className="h-4 w-4" />שיוף
          </TabsTrigger>
          <TabsTrigger value="galvanization" className="data-[state=active]:bg-cyan-600/30 data-[state=active]:text-cyan-300 gap-1.5">
            <Droplets className="h-4 w-4" />גלוון
          </TabsTrigger>
          <TabsTrigger value="powder" className="data-[state=active]:bg-orange-600/30 data-[state=active]:text-orange-300 gap-1.5">
            <Flame className="h-4 w-4" />אבקה
          </TabsTrigger>
          <TabsTrigger value="painting" className="data-[state=active]:bg-pink-600/30 data-[state=active]:text-pink-300 gap-1.5">
            <Paintbrush className="h-4 w-4" />צבע
          </TabsTrigger>
        </TabsList>

        {/* ── grinding_jobs ── */}
        <TabsContent value="grinding">
          <Card className="bg-card/80 border-border">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-border bg-background/50">
                    <TableHead className="text-right text-muted-foreground">הזמנת עבודה</TableHead>
                    <TableHead className="text-right text-muted-foreground">מוצר</TableHead>
                    <TableHead className="text-right text-muted-foreground">מפעיל</TableHead>
                    <TableHead className="text-right text-muted-foreground">עמדה</TableHead>
                    <TableHead className="text-right text-muted-foreground">גרעין / שיטה</TableHead>
                    <TableHead className="text-right text-muted-foreground">התקדמות</TableHead>
                    <TableHead className="text-right text-muted-foreground">איכות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grindingJobs.map((r) => (
                    <TableRow key={r.wo} className="border-border/50 hover:bg-muted/30">
                      <TableCell className="font-mono text-xs text-blue-400">{r.wo}</TableCell>
                      <TableCell className="font-medium text-foreground">{r.product}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{r.operator}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{r.station}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.grainSize} / {r.method}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 min-w-[120px]">
                          <Progress value={r.progress} className={`h-2 flex-1 [&>div]:${progressColor(r.progress)}`} />
                          <span className="text-xs font-mono text-muted-foreground w-9 text-left">{r.progress}%</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={`${qualityColor[r.quality] || "bg-gray-500/20 text-gray-300"} border-0 text-xs`}>{r.quality}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── galvanization_queue ── */}
        <TabsContent value="galvanization">
          <Card className="bg-card/80 border-border">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-border bg-background/50">
                    <TableHead className="text-right text-muted-foreground">אצוות</TableHead>
                    <TableHead className="text-right text-muted-foreground">פריטים</TableHead>
                    <TableHead className="text-right text-muted-foreground">משקל (ק״ג)</TableHead>
                    <TableHead className="text-right text-muted-foreground">מקור</TableHead>
                    <TableHead className="text-right text-muted-foreground">שכבת אבץ</TableHead>
                    <TableHead className="text-right text-muted-foreground">סטטוס</TableHead>
                    <TableHead className="text-right text-muted-foreground">סיום צפוי</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {galvanizationQueue.map((r) => (
                    <TableRow key={r.batch} className="border-border/50 hover:bg-muted/30">
                      <TableCell className="font-mono text-xs text-cyan-400">{r.batch}</TableCell>
                      <TableCell className="font-mono text-foreground">{r.items}</TableCell>
                      <TableCell className="font-mono text-muted-foreground">{r.weightKg.toLocaleString("he-IL")}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.source}</TableCell>
                      <TableCell className="text-xs font-mono text-amber-400">{r.zincLayer}</TableCell>
                      <TableCell>
                        <Badge className={`${statusColor[r.status] || "bg-gray-500/20 text-gray-300"} border-0 text-xs`}>{r.status}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{r.expected}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── powder_coating_queue ── */}
        <TabsContent value="powder">
          <Card className="bg-card/80 border-border">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-border bg-background/50">
                    <TableHead className="text-right text-muted-foreground">אצוות</TableHead>
                    <TableHead className="text-right text-muted-foreground">קוד צבע</TableHead>
                    <TableHead className="text-right text-muted-foreground">שם צבע</TableHead>
                    <TableHead className="text-right text-muted-foreground">פריטים</TableHead>
                    <TableHead className="text-right text-muted-foreground">עובי (μm)</TableHead>
                    <TableHead className="text-right text-muted-foreground">טמפ׳ תנור (C°)</TableHead>
                    <TableHead className="text-right text-muted-foreground">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {powderCoatingQueue.map((r) => (
                    <TableRow key={r.batch} className="border-border/50 hover:bg-muted/30">
                      <TableCell className="font-mono text-xs text-orange-400">{r.batch}</TableCell>
                      <TableCell className="font-mono text-xs text-purple-400">{r.colorCode}</TableCell>
                      <TableCell className="text-sm text-foreground">{r.colorName}</TableCell>
                      <TableCell className="font-mono text-foreground">{r.items}</TableCell>
                      <TableCell className="font-mono text-xs text-cyan-400">{r.thicknessSpec}</TableCell>
                      <TableCell>
                        <span className={`font-mono text-xs ${r.ovenTemp >= 200 ? "text-red-400" : r.ovenTemp >= 190 ? "text-orange-400" : "text-yellow-400"}`}>
                          {r.ovenTemp}°C
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge className={`${statusColor[r.status] || "bg-gray-500/20 text-gray-300"} border-0 text-xs`}>{r.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── painting_status_tracking ── */}
        <TabsContent value="painting">
          <Card className="bg-card/80 border-border">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-border bg-background/50">
                    <TableHead className="text-right text-muted-foreground">פריט</TableHead>
                    <TableHead className="text-right text-muted-foreground">צבע</TableHead>
                    <TableHead className="text-right text-muted-foreground">שכבות</TableHead>
                    <TableHead className="text-right text-muted-foreground">סטטוס ייבוש</TableHead>
                    <TableHead className="text-right text-muted-foreground">בקרת איכות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paintingStatus.map((r, idx) => (
                    <TableRow key={idx} className="border-border/50 hover:bg-muted/30">
                      <TableCell className="font-medium text-foreground">{r.item}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.color}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {Array.from({ length: r.coats }).map((_, ci) => (
                            <Layers key={ci} className="h-3.5 w-3.5 text-pink-400" />
                          ))}
                          <span className="text-xs font-mono text-muted-foreground mr-1">{r.coats}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={`${statusColor[r.dryingStatus] || "bg-gray-500/20 text-gray-300"} border-0 text-xs`}>{r.dryingStatus}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={`${qcColor[r.qc] || "bg-gray-500/20 text-gray-300"} border-0 text-xs`}>{r.qc}</Badge>
                      </TableCell>
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
