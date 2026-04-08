import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Scissors, Clock, Play, CheckCircle2, Recycle, Trash2, BarChart3,
  TrendingUp, AlertTriangle, Package, Ruler, MapPin
} from "lucide-react";

const tabs = ["תור חיתוך", "ביצוע", "שאריות", "גרוטאות"] as const;
type Tab = typeof tabs[number];

const SB: Record<string, string> = {
  "ממתין": "bg-gray-500/20 text-gray-300", "בתור": "bg-blue-500/20 text-blue-300",
  "בחיתוך": "bg-amber-500/20 text-amber-300", "הושלם": "bg-green-500/20 text-green-300",
  "דחוף": "bg-red-500/20 text-red-300", "רגיל": "bg-slate-500/20 text-slate-300",
  "גבוה": "bg-orange-500/20 text-orange-300", "עבר": "bg-green-500/20 text-green-300",
  "נכשל": "bg-red-500/20 text-red-300", "כן": "bg-green-500/20 text-green-300",
  "לא": "bg-red-500/20 text-red-300",
};

const queueData = [
  { id: "CJ-1001", wo: "WO-4420", material: "פלדה ST-37", profile: "IPE 200", qty: 24, length: 28.8, station: "מסור סרט A1", priority: "דחוף", status: "בחיתוך" },
  { id: "CJ-1002", wo: "WO-4421", material: "אלומיניום 6063", profile: "קורה U 80", qty: 16, length: 19.2, station: "מסור דיסק B2", priority: "גבוה", status: "בתור" },
  { id: "CJ-1003", wo: "WO-4418", material: "נירוסטה 304", profile: "צינור 50x3", qty: 32, length: 38.4, station: "לייזר CNC", priority: "רגיל", status: "ממתין" },
  { id: "CJ-1004", wo: "WO-4425", material: "פלדה ST-52", profile: "זוויתן 60x60", qty: 48, length: 14.4, station: "מסור סרט A1", priority: "גבוה", status: "בתור" },
  { id: "CJ-1005", wo: "WO-4419", material: "אלומיניום 6082", profile: "פרופיל T 40", qty: 20, length: 24.0, station: "מסור דיסק B2", priority: "רגיל", status: "ממתין" },
  { id: "CJ-1006", wo: "WO-4430", material: "נירוסטה 316L", profile: "פלטה 10mm", qty: 12, length: 7.2, station: "פלזמה CNC", priority: "דחוף", status: "בחיתוך" },
  { id: "CJ-1007", wo: "WO-4422", material: "פלדה ST-37", profile: "קורה H 120", qty: 8, length: 48.0, station: "מסור סרט A2", priority: "רגיל", status: "ממתין" },
  { id: "CJ-1008", wo: "WO-4428", material: "אלומיניום 6063", profile: "מוט עגול 25", qty: 60, length: 36.0, station: "מסור דיסק B1", priority: "גבוה", status: "בתור" },
];

const executionData = [
  { job: "CJ-0990", operator: "יוסי כהן", start: "07:15", end: "08:42", pieces: 24, scrap: 1.8, qc: "עבר" },
  { job: "CJ-0991", operator: "שרה לוי", start: "07:30", end: "09:10", pieces: 32, scrap: 2.4, qc: "עבר" },
  { job: "CJ-0992", operator: "דוד מזרחי", start: "08:00", end: "09:55", pieces: 16, scrap: 3.1, qc: "נכשל" },
  { job: "CJ-0993", operator: "רחל אברהם", start: "08:20", end: "10:30", pieces: 48, scrap: 1.2, qc: "עבר" },
  { job: "CJ-0994", operator: "אלון גולדשטיין", start: "09:00", end: "11:15", pieces: 20, scrap: 0.9, qc: "עבר" },
  { job: "CJ-0995", operator: "מיכל ברק", start: "09:45", end: "12:00", pieces: 12, scrap: 4.5, qc: "נכשל" },
  { job: "CJ-0996", operator: "עומר חדד", start: "10:00", end: "12:30", pieces: 36, scrap: 1.6, qc: "עבר" },
  { job: "CJ-0997", operator: "נועה פרידמן", start: "10:30", end: "13:00", pieces: 8, scrap: 0.5, qc: "עבר" },
];

const remnantData = [
  { id: "REM-301", material: "פלדה ST-37", profile: "IPE 200", length: 1.45, usable: "כן", location: "מדף A3-7" },
  { id: "REM-302", material: "אלומיניום 6063", profile: "קורה U 80", length: 0.82, usable: "כן", location: "מדף B1-2" },
  { id: "REM-303", material: "נירוסטה 304", profile: "צינור 50x3", length: 0.35, usable: "לא", location: "מדף C2-5" },
  { id: "REM-304", material: "פלדה ST-52", profile: "זוויתן 60x60", length: 2.10, usable: "כן", location: "מדף A1-3" },
  { id: "REM-305", material: "אלומיניום 6082", profile: "פרופיל T 40", length: 0.60, usable: "לא", location: "מדף B2-8" },
  { id: "REM-306", material: "נירוסטה 316L", profile: "פלטה 10mm", length: 1.20, usable: "כן", location: "מדף C1-1" },
  { id: "REM-307", material: "פלדה ST-37", profile: "קורה H 120", length: 0.90, usable: "כן", location: "מדף A2-4" },
  { id: "REM-308", material: "אלומיניום 6063", profile: "מוט עגול 25", length: 0.45, usable: "לא", location: "מדף B3-6" },
];

const scrapData = [
  { material: "פלדה ST-37", pieces: 34, weight: 48.2, cost: 1205, pct: 3.2 },
  { material: "פלדה ST-52", pieces: 18, weight: 31.5, cost: 945, pct: 2.8 },
  { material: "אלומיניום 6063", pieces: 22, weight: 12.8, cost: 1536, pct: 4.1 },
  { material: "אלומיניום 6082", pieces: 14, weight: 9.2, cost: 1196, pct: 3.5 },
  { material: "נירוסטה 304", pieces: 11, weight: 15.6, cost: 3432, pct: 5.2 },
  { material: "נירוסטה 316L", pieces: 8, weight: 10.4, cost: 3120, pct: 4.8 },
  { material: "פלדה מגולוונת", pieces: 6, weight: 7.8, cost: 234, pct: 1.9 },
  { material: "אלומיניום 7075", pieces: 4, weight: 3.1, cost: 620, pct: 6.1 },
];

const scrapTotals = {
  pieces: scrapData.reduce((s, r) => s + r.pieces, 0),
  weight: scrapData.reduce((s, r) => s + r.weight, 0),
  cost: scrapData.reduce((s, r) => s + r.cost, 0),
};

export default function CutJobs() {
  const [tab, setTab] = useState<Tab>("תור חיתוך");

  const kpis = [
    { label: "עבודות בתור", value: "14", icon: Clock, color: "text-blue-400", trend: "+3" },
    { label: "חיתוכים פעילים", value: "4", icon: Play, color: "text-amber-400", trend: "0" },
    { label: "הושלמו היום", value: "23", icon: CheckCircle2, color: "text-green-400", trend: "+5" },
    { label: 'שאריות שנשמרו (ק"ג)', value: "186", icon: Recycle, color: "text-cyan-400", trend: "+12" },
    { label: "אחוז גרוטאות", value: "3.7%", icon: Trash2, color: "text-red-400", trend: "-0.4%" },
    { label: "ניצולת חומר", value: "91.2%", icon: BarChart3, color: "text-emerald-400", trend: "+1.1%" },
  ];

  return (
    <div className="p-6 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Scissors className="h-6 w-6 text-orange-400" />
            עבודות חיתוך ורשימות חיתוך
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול תור חיתוך, ביצוע, שאריות וגרוטאות &mdash; טכנו-כל עוזי</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k, i) => (
          <Card key={i} className="bg-card/80 border-border hover:border-border transition-colors">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] text-muted-foreground">{k.label}</p>
                  <p className={`text-lg font-bold font-mono mt-1 ${k.color}`}>{k.value}</p>
                  <div className="flex items-center gap-1 mt-1">
                    <TrendingUp className="h-3 w-3 text-green-400" />
                    <span className="text-[10px] text-green-400">{k.trend}</span>
                  </div>
                </div>
                <k.icon className={`h-5 w-5 ${k.color} opacity-60`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex gap-1 border-b border-border">
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ${
              tab === t ? "border-blue-500 text-blue-400" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
            {t}
          </button>
        ))}
      </div>

      {tab === "תור חיתוך" && (
        <Card className="bg-card/80 border-border">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-background/50">
                    <th className="p-3 text-right text-muted-foreground font-medium">מזהה עבודה</th>
                    <th className="p-3 text-right text-muted-foreground font-medium">הזמנת עבודה</th>
                    <th className="p-3 text-right text-muted-foreground font-medium">חומר</th>
                    <th className="p-3 text-right text-muted-foreground font-medium">סוג פרופיל</th>
                    <th className="p-3 text-right text-muted-foreground font-medium">כמות חלקים</th>
                    <th className="p-3 text-right text-muted-foreground font-medium">אורך כולל (מ')</th>
                    <th className="p-3 text-right text-muted-foreground font-medium">תחנה</th>
                    <th className="p-3 text-right text-muted-foreground font-medium">עדיפות</th>
                    <th className="p-3 text-right text-muted-foreground font-medium">סטטוס</th>
                  </tr>
                </thead>
                <tbody>
                  {queueData.map(r => (
                    <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="p-3 font-mono text-xs text-blue-400">{r.id}</td>
                      <td className="p-3 font-mono text-xs text-purple-400">{r.wo}</td>
                      <td className="p-3 text-foreground">{r.material}</td>
                      <td className="p-3 text-muted-foreground">{r.profile}</td>
                      <td className="p-3 font-mono text-foreground text-center">{r.qty}</td>
                      <td className="p-3 font-mono text-orange-400 text-center">{r.length.toFixed(1)}</td>
                      <td className="p-3 text-muted-foreground text-xs">{r.station}</td>
                      <td className="p-3"><Badge className={`${SB[r.priority]} border-0 text-xs`}>{r.priority}</Badge></td>
                      <td className="p-3"><Badge className={`${SB[r.status]} border-0 text-xs`}>{r.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "ביצוע" && (
        <Card className="bg-card/80 border-border">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-background/50">
                    <th className="p-3 text-right text-muted-foreground font-medium">עבודה</th>
                    <th className="p-3 text-right text-muted-foreground font-medium">מפעיל</th>
                    <th className="p-3 text-right text-muted-foreground font-medium">שעת התחלה</th>
                    <th className="p-3 text-right text-muted-foreground font-medium">שעת סיום</th>
                    <th className="p-3 text-right text-muted-foreground font-medium">חלקים שנחתכו</th>
                    <th className="p-3 text-right text-muted-foreground font-medium">גרוטאות (ק"ג)</th>
                    <th className="p-3 text-right text-muted-foreground font-medium">בדיקת איכות</th>
                  </tr>
                </thead>
                <tbody>
                  {executionData.map((r, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="p-3 font-mono text-xs text-blue-400">{r.job}</td>
                      <td className="p-3 text-foreground">{r.operator}</td>
                      <td className="p-3 font-mono text-muted-foreground">{r.start}</td>
                      <td className="p-3 font-mono text-muted-foreground">{r.end}</td>
                      <td className="p-3 font-mono text-foreground text-center">{r.pieces}</td>
                      <td className="p-3 font-mono text-red-400 text-center">{r.scrap.toFixed(1)}</td>
                      <td className="p-3">
                        <Badge className={`${SB[r.qc]} border-0 text-xs`}>
                          {r.qc === "עבר" ? <CheckCircle2 className="h-3 w-3 mr-1 inline" /> : <AlertTriangle className="h-3 w-3 mr-1 inline" />}
                          {r.qc}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "שאריות" && (
        <Card className="bg-card/80 border-border">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-background/50">
                    <th className="p-3 text-right text-muted-foreground font-medium">מזהה שארית</th>
                    <th className="p-3 text-right text-muted-foreground font-medium">חומר</th>
                    <th className="p-3 text-right text-muted-foreground font-medium">פרופיל</th>
                    <th className="p-3 text-right text-muted-foreground font-medium">אורך נותר (מ')</th>
                    <th className="p-3 text-right text-muted-foreground font-medium">ניצולת</th>
                    <th className="p-3 text-right text-muted-foreground font-medium">שימושי</th>
                    <th className="p-3 text-right text-muted-foreground font-medium">מיקום</th>
                  </tr>
                </thead>
                <tbody>
                  {remnantData.map(r => (
                    <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="p-3 font-mono text-xs text-cyan-400">{r.id}</td>
                      <td className="p-3 text-foreground">{r.material}</td>
                      <td className="p-3 text-muted-foreground">{r.profile}</td>
                      <td className="p-3 font-mono text-orange-400 text-center">{r.length.toFixed(2)}</td>
                      <td className="p-3 w-32">
                        <Progress value={r.length > 1.5 ? 75 : r.length > 0.8 ? 50 : 25}
                          className="h-2 bg-muted" />
                      </td>
                      <td className="p-3">
                        <Badge className={`${SB[r.usable]} border-0 text-xs`}>
                          {r.usable === "כן" ? <Package className="h-3 w-3 mr-1 inline" /> : <Trash2 className="h-3 w-3 mr-1 inline" />}
                          {r.usable}
                        </Badge>
                      </td>
                      <td className="p-3 text-muted-foreground text-xs flex items-center gap-1">
                        <MapPin className="h-3 w-3" />{r.location}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "גרוטאות" && (
        <Card className="bg-card/80 border-border">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-background/50">
                    <th className="p-3 text-right text-muted-foreground font-medium">סוג חומר</th>
                    <th className="p-3 text-right text-muted-foreground font-medium">חתיכות</th>
                    <th className="p-3 text-right text-muted-foreground font-medium">משקל (ק"ג)</th>
                    <th className="p-3 text-right text-muted-foreground font-medium">עלות (₪)</th>
                    <th className="p-3 text-right text-muted-foreground font-medium">אחוז גרוטאות</th>
                    <th className="p-3 text-right text-muted-foreground font-medium">מגמה</th>
                  </tr>
                </thead>
                <tbody>
                  {scrapData.map((r, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="p-3 text-foreground font-medium">{r.material}</td>
                      <td className="p-3 font-mono text-foreground text-center">{r.pieces}</td>
                      <td className="p-3 font-mono text-orange-400 text-center">{r.weight.toFixed(1)}</td>
                      <td className="p-3 font-mono text-red-400 text-center">₪{r.cost.toLocaleString()}</td>
                      <td className="p-3 text-center">
                        <span className={`font-mono ${r.pct > 5 ? "text-red-400" : r.pct > 3.5 ? "text-amber-400" : "text-green-400"}`}>
                          {r.pct.toFixed(1)}%
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        {r.pct > 4 ? <TrendingUp className="h-4 w-4 text-red-400 inline" /> : <TrendingUp className="h-4 w-4 text-green-400 inline rotate-180" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-background/70 font-bold">
                    <td className="p-3 text-foreground">סה"כ</td>
                    <td className="p-3 font-mono text-foreground text-center">{scrapTotals.pieces}</td>
                    <td className="p-3 font-mono text-orange-400 text-center">{scrapTotals.weight.toFixed(1)}</td>
                    <td className="p-3 font-mono text-red-400 text-center">₪{scrapTotals.cost.toLocaleString()}</td>
                    <td className="p-3 font-mono text-amber-400 text-center">3.7%</td>
                    <td className="p-3" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
