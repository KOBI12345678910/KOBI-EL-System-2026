import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Flame, CheckCircle, Activity, Gauge, Clock, AlertTriangle,
  Package, ShieldCheck, FlaskConical, Repeat2
} from "lucide-react";

/* ─── mock data: weld_jobs ─── */
const weldJobs = [
  { id: "WJ-1001", wo: "WO-4420", product: "מסגרת פלדה 2.5מ", weldType: "MIG", welder: "אורי דהן", station: "עמדה 1", pieces: 24, done: 20, quality: "תקין" },
  { id: "WJ-1002", wo: "WO-4421", product: "קורת תמיכה H200", weldType: "TIG", welder: "משה ביטון", station: "עמדה 2", pieces: 16, done: 16, quality: "תקין" },
  { id: "WJ-1003", wo: "WO-4422", product: "צינור נירוסטה DN50", weldType: "TIG", welder: "יוסף חדד", station: "עמדה 3", pieces: 40, done: 28, quality: "חריגה" },
  { id: "WJ-1004", wo: "WO-4423", product: "שלדת מכונה תעשייתית", weldType: "שלד", welder: "רונן אוחיון", station: "עמדה 1", pieces: 8, done: 5, quality: "תקין" },
  { id: "WJ-1005", wo: "WO-4424", product: "גדר אלומיניום 3מ", weldType: "MIG", welder: "אבי מזרחי", station: "עמדה 4", pieces: 32, done: 32, quality: "תקין" },
  { id: "WJ-1006", wo: "WO-4425", product: "מיכל לחץ 500L", weldType: "TIG", welder: "דוד פרץ", station: "עמדה 2", pieces: 6, done: 2, quality: "ממתין" },
  { id: "WJ-1007", wo: "WO-4426", product: "מעקה בטיחות", weldType: "שלד", welder: "שמעון לוי", station: "עמדה 5", pieces: 18, done: 14, quality: "תקין" },
  { id: "WJ-1008", wo: "WO-4427", product: "תושבת מנוע", weldType: "MIG", welder: "איתן כהן", station: "עמדה 3", pieces: 12, done: 0, quality: "ממתין" },
];

/* ─── mock data: weld_quality_checks ─── */
const qualityChecks = [
  { id: "QC-501", job: "WJ-1001", type: "בדיקה חזותית", result: "עבר", defects: 0, inspector: "מיכל ברק" },
  { id: "QC-502", job: "WJ-1002", type: "צילום רנטגן", result: "עבר", defects: 0, inspector: "נועה פרידמן" },
  { id: "QC-503", job: "WJ-1003", type: "מבחן כיפוף", result: "נכשל", defects: 2, inspector: "מיכל ברק" },
  { id: "QC-504", job: "WJ-1004", type: "בדיקה חזותית", result: "עבר", defects: 0, inspector: "תמר שלום" },
  { id: "QC-505", job: "WJ-1005", type: "צילום רנטגן", result: "עבר", defects: 0, inspector: "נועה פרידמן" },
  { id: "QC-506", job: "WJ-1003", type: "בדיקה חזותית", result: "נכשל", defects: 3, inspector: "תמר שלום" },
  { id: "QC-507", job: "WJ-1007", type: "מבחן כיפוף", result: "עבר", defects: 0, inspector: "מיכל ברק" },
  { id: "QC-508", job: "WJ-1006", type: "צילום רנטגן", result: "ממתין", defects: 0, inspector: "נועה פרידמן" },
];

/* ─── mock data: welding_consumables_tracking ─── */
const consumables = [
  { id: "C-01", wire: "ER70S-6 (1.0mm)", gas: "CO2 + Argon", usedToday: 4.2, stock: 120, reorder: false },
  { id: "C-02", wire: "ER308L (0.8mm)", gas: "Argon 100%", usedToday: 2.8, stock: 45, reorder: true },
  { id: "C-03", wire: "ER70S-6 (1.2mm)", gas: "CO2 + Argon", usedToday: 5.1, stock: 98, reorder: false },
  { id: "C-04", wire: "ER316L (1.0mm)", gas: "Argon 100%", usedToday: 1.5, stock: 22, reorder: true },
  { id: "C-05", wire: "E7018 (3.2mm)", gas: "---", usedToday: 3.0, stock: 200, reorder: false },
  { id: "C-06", wire: "ER4043 (1.0mm)", gas: "Argon 100%", usedToday: 1.8, stock: 60, reorder: false },
  { id: "C-07", wire: "ER70S-6 (0.8mm)", gas: "CO2 80/20", usedToday: 6.3, stock: 15, reorder: true },
  { id: "C-08", wire: "ER309L (1.2mm)", gas: "Argon 100%", usedToday: 0.9, stock: 35, reorder: false },
];

/* ─── helpers ─── */
const qualityBadge = (q: string) => {
  if (q === "תקין" || q === "עבר") return "bg-green-500/20 text-green-400";
  if (q === "חריגה" || q === "נכשל") return "bg-red-500/20 text-red-400";
  return "bg-yellow-500/20 text-yellow-400";
};

const weldTypeBadge = (t: string) => {
  if (t === "MIG") return "bg-blue-500/20 text-blue-400";
  if (t === "TIG") return "bg-purple-500/20 text-purple-400";
  return "bg-orange-500/20 text-orange-400";
};

/* ─── KPI computation ─── */
const activeJobs = weldJobs.filter(j => j.done < j.pieces).length;
const completedToday = weldJobs.filter(j => j.done === j.pieces).length;
const totalChecks = qualityChecks.filter(q => q.result !== "ממתין").length;
const passedChecks = qualityChecks.filter(q => q.result === "עבר").length;
const passRate = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 0;
const consumablesUsed = consumables.reduce((s, c) => s + c.usedToday, 0).toFixed(1);
const avgJobTime = "47 דק'";
const reworkCount = qualityChecks.filter(q => q.result === "נכשל").length;

const kpis = [
  { label: "עבודות ריתוך פעילות", value: activeJobs, icon: Flame, color: "text-orange-400" },
  { label: "הושלמו היום", value: completedToday, icon: CheckCircle, color: "text-green-400" },
  { label: "אחוז עמידה באיכות", value: `${passRate}%`, icon: ShieldCheck, color: "text-cyan-400" },
  { label: 'מתכלים (ק"ג)', value: consumablesUsed, icon: Package, color: "text-yellow-400" },
  { label: "זמן ממוצע לעבודה", value: avgJobTime, icon: Clock, color: "text-blue-400" },
  { label: "עבודות חוזרות", value: reworkCount, icon: Repeat2, color: "text-red-400" },
];

export default function WeldingJobs() {
  const [tab, setTab] = useState("jobs");

  return (
    <div dir="rtl" className="min-h-screen bg-[#0a0a0f] text-gray-100 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-orange-500/20 rounded-lg">
          <Flame className="w-6 h-6 text-orange-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">עבודות ריתוך</h1>
          <p className="text-sm text-gray-400">טכנו-כל עוזי — ניהול ריתוך, בדיקות איכות ומתכלים</p>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map(k => (
          <Card key={k.label} className="bg-[#111118] border-[#1e1e2e]">
            <CardContent className="p-4 flex flex-col items-center gap-1">
              <k.icon className={`w-5 h-5 ${k.color}`} />
              <span className="text-xl font-bold">{k.value}</span>
              <span className="text-xs text-gray-400 text-center">{k.label}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="bg-[#111118] border border-[#1e1e2e]">
          <TabsTrigger value="jobs">עבודות</TabsTrigger>
          <TabsTrigger value="quality">בדיקות איכות</TabsTrigger>
          <TabsTrigger value="consumables">מתכלים</TabsTrigger>
        </TabsList>

        {/* ── Tab: weld_jobs ── */}
        <TabsContent value="jobs" className="space-y-4">
          {/* jobs summary row */}
          <div className="grid grid-cols-3 gap-4">
            <Card className="bg-[#111118] border-[#1e1e2e]">
              <CardContent className="p-3 flex items-center gap-3">
                <Activity className="w-5 h-5 text-blue-400" />
                <div>
                  <p className="text-xs text-gray-400">MIG</p>
                  <p className="font-bold">{weldJobs.filter(j => j.weldType === "MIG").length} עבודות</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-[#111118] border-[#1e1e2e]">
              <CardContent className="p-3 flex items-center gap-3">
                <FlaskConical className="w-5 h-5 text-purple-400" />
                <div>
                  <p className="text-xs text-gray-400">TIG</p>
                  <p className="font-bold">{weldJobs.filter(j => j.weldType === "TIG").length} עבודות</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-[#111118] border-[#1e1e2e]">
              <CardContent className="p-3 flex items-center gap-3">
                <Gauge className="w-5 h-5 text-orange-400" />
                <div>
                  <p className="text-xs text-gray-400">שלד</p>
                  <p className="font-bold">{weldJobs.filter(j => j.weldType === "שלד").length} עבודות</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-[#111118] border-[#1e1e2e]">
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#1e1e2e] text-gray-400">
                    <th className="p-3 text-right">מזהה</th>
                    <th className="p-3 text-right">הפניית WO</th>
                    <th className="p-3 text-right">מוצר</th>
                    <th className="p-3 text-right">סוג ריתוך</th>
                    <th className="p-3 text-right">רתך</th>
                    <th className="p-3 text-right">עמדה</th>
                    <th className="p-3 text-center">יחידות</th>
                    <th className="p-3 text-center">התקדמות</th>
                    <th className="p-3 text-center">איכות</th>
                  </tr>
                </thead>
                <tbody>
                  {weldJobs.map(j => {
                    const pct = Math.round((j.done / j.pieces) * 100);
                    return (
                      <tr key={j.id} className="border-b border-[#1e1e2e]/50 hover:bg-[#1a1a25]">
                        <td className="p-3 font-mono text-xs">{j.id}</td>
                        <td className="p-3 font-mono text-xs">{j.wo}</td>
                        <td className="p-3">{j.product}</td>
                        <td className="p-3"><Badge className={weldTypeBadge(j.weldType)}>{j.weldType}</Badge></td>
                        <td className="p-3">{j.welder}</td>
                        <td className="p-3">{j.station}</td>
                        <td className="p-3 text-center">{j.done}/{j.pieces}</td>
                        <td className="p-3 w-36">
                          <div className="flex items-center gap-2">
                            <Progress value={pct} className="h-2 flex-1" />
                            <span className="text-xs text-gray-400 w-10 text-left">{pct}%</span>
                          </div>
                        </td>
                        <td className="p-3 text-center"><Badge className={qualityBadge(j.quality)}>{j.quality}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: weld_quality_checks ── */}
        <TabsContent value="quality" className="space-y-4">
          {/* quality summary row */}
          <div className="grid grid-cols-3 gap-4">
            <Card className="bg-[#111118] border-[#1e1e2e]">
              <CardContent className="p-3 flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-400" />
                <div>
                  <p className="text-xs text-gray-400">עברו בדיקה</p>
                  <p className="font-bold text-green-400">{passedChecks}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-[#111118] border-[#1e1e2e]">
              <CardContent className="p-3 flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-red-400" />
                <div>
                  <p className="text-xs text-gray-400">נכשלו</p>
                  <p className="font-bold text-red-400">{reworkCount}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-[#111118] border-[#1e1e2e]">
              <CardContent className="p-3 flex items-center gap-3">
                <Clock className="w-5 h-5 text-yellow-400" />
                <div>
                  <p className="text-xs text-gray-400">ממתינות</p>
                  <p className="font-bold text-yellow-400">{qualityChecks.filter(q => q.result === "ממתין").length}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-[#111118] border-[#1e1e2e]">
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#1e1e2e] text-gray-400">
                    <th className="p-3 text-right">מזהה</th>
                    <th className="p-3 text-right">עבודה</th>
                    <th className="p-3 text-right">סוג בדיקה</th>
                    <th className="p-3 text-center">תוצאה</th>
                    <th className="p-3 text-center">ליקויים</th>
                    <th className="p-3 text-right">בודק</th>
                  </tr>
                </thead>
                <tbody>
                  {qualityChecks.map(q => (
                    <tr key={q.id} className="border-b border-[#1e1e2e]/50 hover:bg-[#1a1a25]">
                      <td className="p-3 font-mono text-xs">{q.id}</td>
                      <td className="p-3 font-mono text-xs">{q.job}</td>
                      <td className="p-3">{q.type}</td>
                      <td className="p-3 text-center"><Badge className={qualityBadge(q.result)}>{q.result}</Badge></td>
                      <td className="p-3 text-center">{q.defects > 0 ? <span className="text-red-400 font-bold">{q.defects}</span> : <span className="text-gray-500">0</span>}</td>
                      <td className="p-3">{q.inspector}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: welding_consumables_tracking ── */}
        <TabsContent value="consumables" className="space-y-4">
          {/* low-stock alert banner */}
          {consumables.some(c => c.reorder) && (
            <Card className="bg-red-500/10 border-red-500/30">
              <CardContent className="p-3 flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
                <span className="text-sm text-red-300">
                  {consumables.filter(c => c.reorder).length} פריטי מתכלים דורשים הזמנה מחדש
                </span>
              </CardContent>
            </Card>
          )}

          <Card className="bg-[#111118] border-[#1e1e2e]">
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#1e1e2e] text-gray-400">
                    <th className="p-3 text-right">מזהה</th>
                    <th className="p-3 text-right">סוג חוט</th>
                    <th className="p-3 text-right">סוג גז</th>
                    <th className="p-3 text-center">שימוש היום (ק"ג)</th>
                    <th className="p-3 text-center">מלאי נותר (ק"ג)</th>
                    <th className="p-3 text-center">דרוש הזמנה</th>
                  </tr>
                </thead>
                <tbody>
                  {consumables.map(c => (
                    <tr key={c.id} className="border-b border-[#1e1e2e]/50 hover:bg-[#1a1a25]">
                      <td className="p-3 font-mono text-xs">{c.id}</td>
                      <td className="p-3">{c.wire}</td>
                      <td className="p-3">{c.gas}</td>
                      <td className="p-3 text-center">{c.usedToday}</td>
                      <td className="p-3 text-center">{c.stock}</td>
                      <td className="p-3 text-center">
                        {c.reorder
                          ? <Badge className="bg-red-500/20 text-red-400">דרוש הזמנה</Badge>
                          : <Badge className="bg-green-500/20 text-green-400">תקין</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
