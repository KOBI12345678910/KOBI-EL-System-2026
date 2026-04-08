import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import {
  AlertTriangle, ShieldAlert, Trash2, Recycle, Scissors,
  Package, DollarSign, TrendingUp, Clock, User, MapPin,
  Ruler, CheckCircle2, XCircle,
} from "lucide-react";

const API = "/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";

const fmt = (v: number) => "₪" + v.toLocaleString("he-IL");

const FALLBACK_DAMAGED = [
  { id: 1, item: "מנוע חשמלי 3HP", sku: "MTR-3HP-01", qty: 4, reason: "נפילה בהעברה", reportedDate: "2026-03-28", reportedBy: "יוסי כהן", disposition: "תיקון", valueLoss: 3200 },
  { id: 2, item: "לוח בקרה PLC S7", sku: "PLC-S7-200", qty: 2, reason: "קצר חשמלי", reportedDate: "2026-04-01", reportedBy: "דנה לוי", disposition: "גרוטאות", valueLoss: 8900 },
  { id: 3, item: "משאבה צנטריפוגלית", sku: "PMP-CF-150", qty: 1, reason: "סדק בגוף המשאבה", reportedDate: "2026-04-03", reportedBy: "אבי מזרחי", disposition: "החזרה לספק", valueLoss: 5600 },
  { id: 4, item: "שסתום פנאומטי DN50", sku: "VLV-PN-50", qty: 6, reason: "חלודה / קורוזיה", reportedDate: "2026-03-15", reportedBy: "רון אברהם", disposition: "גרוטאות", valueLoss: 1800 },
  { id: 5, item: "מסוע רצועה 2m", sku: "CNV-BLT-2M", qty: 1, reason: "שחיקה מוגזמת", reportedDate: "2026-04-05", reportedBy: "מיכל שטרן", disposition: "תיקון", valueLoss: 4200 },
  { id: 6, item: "חיישן לחץ 0-10bar", sku: "SNS-PRS-10", qty: 8, reason: "כיול שגוי / נזק פנימי", reportedDate: "2026-03-20", reportedBy: "עומר בן דוד", disposition: "גרוטאות", valueLoss: 2400 },
  { id: 7, item: "גלגל שיניים פלדה", sku: "GER-STL-40", qty: 3, reason: "שבר שיניים", reportedDate: "2026-04-06", reportedBy: "נועה פרידמן", disposition: "החזרה לספק", valueLoss: 1950 },
];

const FALLBACK_QUARANTINE = [
  { id: 1, item: "פלדת אל-חלד 316L", sku: "STL-316L-R", qty: 120, unit: "ק\"ג", reason: "בדיקת QC", entryDate: "2026-04-02", expectedRelease: "2026-04-10", status: "בבדיקה" },
  { id: 2, item: "חומר איטום סיליקון", sku: "SLN-HT-500", qty: 48, unit: "יח'", reason: "תביעה מול ספק", entryDate: "2026-03-25", expectedRelease: "2026-04-15", status: "ממתין לספק" },
  { id: 3, item: "רכיב אלקטרוני IC", sku: "IC-MCU-32F", qty: 500, unit: "יח'", reason: "חשד זיוף", entryDate: "2026-04-01", expectedRelease: "2026-04-20", status: "בדיקת מעבדה" },
  { id: 4, item: "צינור נחושת 22mm", sku: "PPE-CU-22", qty: 60, unit: "מטר", reason: "בדיקת QC", entryDate: "2026-04-04", expectedRelease: "2026-04-08", status: "אושר לשחרור" },
  { id: 5, item: "שמן הידראולי ISO 46", sku: "OIL-HYD-46", qty: 200, unit: "ליטר", reason: "ממתין לבדיקה", entryDate: "2026-03-30", expectedRelease: "2026-04-12", status: "בבדיקה" },
  { id: 6, item: "אטם מכני כפול", sku: "SEL-MC-DL", qty: 15, unit: "יח'", reason: "תביעה מול ספק", entryDate: "2026-03-18", expectedRelease: "2026-04-09", status: "ממתין לספק" },
  { id: 7, item: "ברגים M12 גרייד 8.8", sku: "BLT-M12-88", qty: 300, unit: "יח'", reason: "בדיקת QC", entryDate: "2026-04-06", expectedRelease: "2026-04-11", status: "בבדיקה" },
];

const FALLBACK_SCRAP = [
  { id: 1, material: "פלדה פחמנית", qty: 850, unit: "ק\"ג", recoveryValue: 2.8, buyer: "מתכות הצפון בע\"מ", status: "ממתין לאיסוף" },
  { id: 2, material: "נחושת טהורה", qty: 120, unit: "ק\"ג", recoveryValue: 28.5, buyer: "רויכמן מיחזור", status: "נמכר" },
  { id: 3, material: "אלומיניום 6061", qty: 340, unit: "ק\"ג", recoveryValue: 5.2, buyer: "אקו-מטל", status: "ממתין להצעות" },
  { id: 4, material: "פלסטיק הנדסי (POM)", qty: 95, unit: "ק\"ג", recoveryValue: 1.5, buyer: "—", status: "ממתין להצעות" },
  { id: 5, material: "כבלי נחושת משומשים", qty: 200, unit: "ק\"ג", recoveryValue: 18.0, buyer: "חשמל-ירוק מיחזור", status: "בתהליך מכירה" },
  { id: 6, material: "ברזל יציקה", qty: 1200, unit: "ק\"ג", recoveryValue: 1.2, buyer: "מתכות הצפון בע\"מ", status: "נמכר" },
  { id: 7, material: "שבבי פליז", qty: 180, unit: "ק\"ג", recoveryValue: 15.0, buyer: "רויכמן מיחזור", status: "ממתין לאיסוף" },
];

const FALLBACK_REMNANTS = [
  { id: 1, material: "פלדת אל-חלד 304 פלטה", dimensions: "1200x350x6mm", usable: true, location: "מחסן A-R3", value: 420 },
  { id: 2, material: "אלומיניום 5083 גיליון", dimensions: "800x200x4mm", usable: true, location: "מחסן B-R1", value: 185 },
  { id: 3, material: "צינור פלדה 4\" SCH40", dimensions: "L=1.3m", usable: true, location: "חצר חיצונית", value: 95 },
  { id: 4, material: "פרופיל U 100x50", dimensions: "L=0.6m", usable: false, location: "מחסן A-R5", value: 35 },
  { id: 5, material: "נחושת פלטה C110", dimensions: "300x150x3mm", usable: true, location: "מחסן B-R2", value: 310 },
  { id: 6, material: "טפלון (PTFE) גליל", dimensions: "D=80mm, L=120mm", usable: true, location: "מחסן A-R4", value: 275 },
  { id: 7, material: "PVC לוח אפור", dimensions: "500x400x10mm", usable: false, location: "מחסן C-R1", value: 45 },
  { id: 8, material: "פליז עגול CW614N", dimensions: "D=25mm, L=0.9m", usable: true, location: "מחסן B-R3", value: 160 },
];

const dispositionColor: Record<string, string> = {
  "תיקון": "bg-blue-500/20 text-blue-400 border-blue-500/30",
  "גרוטאות": "bg-red-500/20 text-red-400 border-red-500/30",
  "החזרה לספק": "bg-amber-500/20 text-amber-400 border-amber-500/30",
};

const qStatusColor: Record<string, string> = {
  "בבדיקה": "bg-amber-500/20 text-amber-400 border-amber-500/30",
  "ממתין לספק": "bg-purple-500/20 text-purple-400 border-purple-500/30",
  "בדיקת מעבדה": "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  "אושר לשחרור": "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
};

const scrapStatusColor: Record<string, string> = {
  "נמכר": "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  "ממתין לאיסוף": "bg-blue-500/20 text-blue-400 border-blue-500/30",
  "ממתין להצעות": "bg-amber-500/20 text-amber-400 border-amber-500/30",
  "בתהליך מכירה": "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
};

export default function DamagedQuarantine() {
  const [tab, setTab] = useState("damaged");

  const { data: apiData } = useQuery({
    queryKey: ["inventory-damaged-quarantine"],
    queryFn: async () => {
      const res = await authFetch(`${API}/inventory/items?type=damaged`);
      if (!res.ok) throw new Error("Failed to fetch damaged/quarantine data");
      return res.json();
    },
  });

  const damagedItems = apiData?.damaged ?? FALLBACK_DAMAGED;
  const quarantineItems = apiData?.quarantine ?? FALLBACK_QUARANTINE;
  const scrapItems = apiData?.scrap ?? FALLBACK_SCRAP;
  const remnantItems = apiData?.remnants ?? FALLBACK_REMNANTS;

  const totalDamagedValue = damagedItems.reduce((s: number, i: any) => s + i.valueLoss, 0);
  const totalScrapRecovery = scrapItems.reduce((s: number, i: any) => s + i.qty * i.recoveryValue, 0);
  const recoveryRate = Math.round((totalScrapRecovery / (totalDamagedValue + totalScrapRecovery)) * 100);

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center">
          <AlertTriangle className="w-5 h-5 text-red-400" />
        </div>
        <div>
          <h1 className="text-lg sm:text-2xl font-bold">מלאי פגום, הסגר וגרוטאות</h1>
          <p className="text-sm text-muted-foreground">ניהול מלאי פגום, בהסגר, גרוטאות ושאריות — טכנו-כל עוזי</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard icon={AlertTriangle} label="פריטים פגומים" value={damagedItems.length} color="text-red-400" bg="bg-red-500/10" />
        <KpiCard icon={ShieldAlert} label="פריטים בהסגר" value={quarantineItems.length} color="text-amber-400" bg="bg-amber-500/10" />
        <KpiCard icon={Trash2} label="גרוטאות" value={scrapItems.length} color="text-orange-400" bg="bg-orange-500/10" />
        <KpiCard icon={Scissors} label="שאריות" value={remnantItems.length} color="text-cyan-400" bg="bg-cyan-500/10" />
        <KpiCard icon={DollarSign} label="שווי נזק כולל" value={fmt(totalDamagedValue)} color="text-red-400" bg="bg-red-500/10" />
        <KpiCard icon={TrendingUp} label="שיעור השבה" value={`${recoveryRate}%`} color="text-emerald-400" bg="bg-emerald-500/10" suffix={<Progress value={recoveryRate} className="h-1.5 mt-1" />} />
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} dir="rtl">
        <TabsList className="bg-card border border-border/50 h-auto p-1 flex-wrap">
          <TabsTrigger value="damaged" className="gap-1.5 data-[state=active]:bg-red-500/20 data-[state=active]:text-red-400">
            <AlertTriangle size={14} /> פגום ({damagedItems.length})
          </TabsTrigger>
          <TabsTrigger value="quarantine" className="gap-1.5 data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">
            <ShieldAlert size={14} /> הסגר ({quarantineItems.length})
          </TabsTrigger>
          <TabsTrigger value="scrap" className="gap-1.5 data-[state=active]:bg-orange-500/20 data-[state=active]:text-orange-400">
            <Trash2 size={14} /> גרוטאות ({scrapItems.length})
          </TabsTrigger>
          <TabsTrigger value="remnants" className="gap-1.5 data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400">
            <Scissors size={14} /> שאריות ({remnantItems.length})
          </TabsTrigger>
        </TabsList>

        {/* Damaged Tab */}
        <TabsContent value="damaged">
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <AlertTriangle size={16} className="text-red-400" /> מלאי פגום — פריטים שנפגעו ודורשים טיפול
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs">
                      <TableHead className="text-right">פריט</TableHead>
                      <TableHead className="text-right">מק״ט</TableHead>
                      <TableHead className="text-center">כמות</TableHead>
                      <TableHead className="text-right">סיבת פגם</TableHead>
                      <TableHead className="text-right">תאריך דיווח</TableHead>
                      <TableHead className="text-right">מדווח</TableHead>
                      <TableHead className="text-center">החלטה</TableHead>
                      <TableHead className="text-left">הפסד ₪</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {damagedItems.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.item}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{r.sku}</TableCell>
                        <TableCell className="text-center font-bold text-red-400">{r.qty}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">{r.reason}</TableCell>
                        <TableCell className="text-xs">{r.reportedDate}</TableCell>
                        <TableCell className="text-xs"><span className="inline-flex items-center gap-1"><User size={12} />{r.reportedBy}</span></TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={dispositionColor[r.disposition]}>{r.disposition}</Badge>
                        </TableCell>
                        <TableCell className="text-left font-bold text-red-400">{fmt(r.valueLoss)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Quarantine Tab */}
        <TabsContent value="quarantine">
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <ShieldAlert size={16} className="text-amber-400" /> מלאי בהסגר — חומרים בהמתנה לאישור / בדיקה
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs">
                      <TableHead className="text-right">פריט</TableHead>
                      <TableHead className="text-right">מק״ט</TableHead>
                      <TableHead className="text-center">כמות</TableHead>
                      <TableHead className="text-right">סיבת הסגר</TableHead>
                      <TableHead className="text-right">תאריך כניסה</TableHead>
                      <TableHead className="text-right">שחרור צפוי</TableHead>
                      <TableHead className="text-center">סטטוס</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {quarantineItems.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.item}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{r.sku}</TableCell>
                        <TableCell className="text-center font-bold">{r.qty} {r.unit}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">{r.reason}</TableCell>
                        <TableCell className="text-xs">{r.entryDate}</TableCell>
                        <TableCell className="text-xs">
                          <span className="inline-flex items-center gap-1"><Clock size={12} />{r.expectedRelease}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={qStatusColor[r.status] || ""}>{r.status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Scrap Tab */}
        <TabsContent value="scrap">
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Recycle size={16} className="text-orange-400" /> גרוטאות ומיחזור — חומרים למכירה / השבה
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs">
                      <TableHead className="text-right">סוג חומר</TableHead>
                      <TableHead className="text-center">כמות (ק״ג)</TableHead>
                      <TableHead className="text-left">ערך השבה ₪/ק״ג</TableHead>
                      <TableHead className="text-left">סה״כ ₪</TableHead>
                      <TableHead className="text-right">קונה</TableHead>
                      <TableHead className="text-center">סטטוס</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scrapItems.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.material}</TableCell>
                        <TableCell className="text-center font-bold">{r.qty.toLocaleString("he-IL")}</TableCell>
                        <TableCell className="text-left text-emerald-400">{fmt(r.recoveryValue)}</TableCell>
                        <TableCell className="text-left font-bold text-emerald-400">{fmt(r.qty * r.recoveryValue)}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">{r.buyer}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={scrapStatusColor[r.status] || ""}>{r.status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Remnants Tab */}
        <TabsContent value="remnants">
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Scissors size={16} className="text-cyan-400" /> שאריות — חומרי גלם חתוכים שנותרו
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs">
                      <TableHead className="text-right">חומר</TableHead>
                      <TableHead className="text-right">מידות</TableHead>
                      <TableHead className="text-center">שמיש?</TableHead>
                      <TableHead className="text-right">מיקום</TableHead>
                      <TableHead className="text-left">שווי ₪</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {remnantItems.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.material}</TableCell>
                        <TableCell className="font-mono text-xs"><span className="inline-flex items-center gap-1"><Ruler size={12} />{r.dimensions}</span></TableCell>
                        <TableCell className="text-center">
                          {r.usable
                            ? <Badge variant="outline" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30"><CheckCircle2 size={12} className="ml-1" />כן</Badge>
                            : <Badge variant="outline" className="bg-red-500/20 text-red-400 border-red-500/30"><XCircle size={12} className="ml-1" />לא</Badge>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground"><span className="inline-flex items-center gap-1"><MapPin size={12} />{r.location}</span></TableCell>
                        <TableCell className="text-left font-bold">{fmt(r.value)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, color, bg, suffix }: {
  icon: any; label: string; value: string | number; color: string; bg: string; suffix?: React.ReactNode;
}) {
  return (
    <Card className="border-border/50">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className={`p-1.5 rounded-lg ${bg}`}><Icon className={`w-4 h-4 ${color}`} /></div>
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <div className={`text-lg sm:text-2xl font-bold ${color}`}>{value}</div>
        {suffix}
      </CardContent>
    </Card>
  );
}
