import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Wrench, Layers, Package, CheckCircle2, Clock, AlertTriangle,
  DoorOpen, Lock, Grip, Cog, User, ClipboardCheck, XCircle,
  ArrowRight, Activity,
} from "lucide-react";

/* ── Types ── */
type TabKey = "pre_assembly" | "final_assembly" | "hardware_installation" | "final_fit_check";

interface PreAssemblyRow {
  wo: string; product: string; componentsReady: number; missingParts: string; station: string; status: "מוכן" | "חלקי" | "ממתין לחלקים";
}
interface FinalAssemblyRow {
  wo: string; product: string; assembler: string; startTime: string; progress: number; qcStatus: "עבר" | "נכשל" | "ממתין";
}
interface HardwareRow {
  wo: string; product: string; hinges: boolean; locks: boolean; handles: boolean; motors: boolean; installer: string;
}
interface FitCheckRow {
  wo: string; product: string; dimensionsOk: boolean; operationOk: boolean; finishOk: boolean; overall: "עובר" | "נכשל"; inspector: string;
}

/* ── Fallback Data ── */
const FALLBACK_PRE_ASSEMBLY: PreAssemblyRow[] = [
  { wo: "WO-7201", product: 'שער חשמלי 4.0m', componentsReady: 100, missingParts: "—", station: "הכנה 1", status: "מוכן" },
  { wo: "WO-7202", product: 'חלון אלומיניום 1.2×1.5m', componentsReady: 85, missingParts: "אטם גומי (×12)", station: "הכנה 2", status: "חלקי" },
  { wo: "WO-7203", product: "מעקה בטיחות נירוסטה", componentsReady: 100, missingParts: "—", station: "הכנה 1", status: "מוכן" },
  { wo: "WO-7204", product: 'דלת כניסה פלדה 1.0×2.1m', componentsReady: 60, missingParts: "צירים כבדים (×3)", station: "הכנה 3", status: "ממתין לחלקים" },
  { wo: "WO-7205", product: "שער הזזה 5.0m", componentsReady: 92, missingParts: "מנוע הזזה (×1)", station: "הכנה 2", status: "חלקי" },
  { wo: "WO-7206", product: 'תריס גלילה 2.0×2.5m', componentsReady: 100, missingParts: "—", station: "הכנה 4", status: "מוכן" },
  { wo: "WO-7207", product: "פרגולה אלומיניום 3×4m", componentsReady: 78, missingParts: "ברגים M8 (×40)", station: "הכנה 1", status: "חלקי" },
];

const FALLBACK_FINAL_ASSEMBLY: FinalAssemblyRow[] = [
  { wo: "WO-7101", product: 'שער חשמלי 3.5m', assembler: "אלי ביטון", startTime: "07:30", progress: 90, qcStatus: "עבר" },
  { wo: "WO-7102", product: 'חלון הזזה 1.8×1.2m', assembler: "רועי כהן", startTime: "08:15", progress: 65, qcStatus: "ממתין" },
  { wo: "WO-7103", product: "מעקה מרפסת פלדה", assembler: "דני אברהם", startTime: "07:45", progress: 100, qcStatus: "עבר" },
  { wo: "WO-7104", product: 'דלת פנים אלומיניום 0.9×2.1m', assembler: "מוחמד חסן", startTime: "09:00", progress: 40, qcStatus: "ממתין" },
  { wo: "WO-7105", product: "שער כנף כפולה 3.0m", assembler: "יוסי מזרחי", startTime: "08:00", progress: 78, qcStatus: "ממתין" },
  { wo: "WO-7106", product: 'תריס חשמלי 1.5×1.8m', assembler: "אמיר לוי", startTime: "10:00", progress: 25, qcStatus: "ממתין" },
  { wo: "WO-7107", product: "פרגולה חשמלית 4×5m", assembler: "אלי ביטון", startTime: "06:45", progress: 100, qcStatus: "עבר" },
  { wo: "WO-7108", product: "גדר פרופילים 12m", assembler: "רועי כהן", startTime: "11:00", progress: 15, qcStatus: "ממתין" },
];

const FALLBACK_HARDWARE: HardwareRow[] = [
  { wo: "WO-7301", product: 'שער חשמלי 4.0m', hinges: true, locks: true, handles: true, motors: true, installer: "דני אברהם" },
  { wo: "WO-7302", product: 'דלת כניסה פלדה 1.0×2.1m', hinges: true, locks: true, handles: false, motors: false, installer: "אמיר לוי" },
  { wo: "WO-7303", product: 'חלון ציר 0.6×1.0m', hinges: true, locks: true, handles: true, motors: false, installer: "יוסי מזרחי" },
  { wo: "WO-7304", product: "שער הזזה חשמלי 5.0m", hinges: false, locks: false, handles: false, motors: true, installer: "מוחמד חסן" },
  { wo: "WO-7305", product: 'תריס גלילה 2.0×2.5m', hinges: false, locks: true, handles: false, motors: true, installer: "דני אברהם" },
  { wo: "WO-7306", product: 'דלת פנים 0.8×2.1m', hinges: true, locks: true, handles: true, motors: false, installer: "אמיר לוי" },
  { wo: "WO-7307", product: "שער כנף כפולה 3.0m", hinges: true, locks: true, handles: true, motors: false, installer: "יוסי מזרחי" },
];

const FALLBACK_FIT_CHECK: FitCheckRow[] = [
  { wo: "WO-7401", product: 'שער חשמלי 3.5m', dimensionsOk: true, operationOk: true, finishOk: true, overall: "עובר", inspector: "עמית שרון" },
  { wo: "WO-7402", product: "מעקה מרפסת פלדה", dimensionsOk: true, operationOk: true, finishOk: false, overall: "נכשל", inspector: "עמית שרון" },
  { wo: "WO-7403", product: 'חלון הזזה 1.8×1.2m', dimensionsOk: true, operationOk: true, finishOk: true, overall: "עובר", inspector: "נועה דוד" },
  { wo: "WO-7404", product: "פרגולה חשמלית 4×5m", dimensionsOk: true, operationOk: false, finishOk: true, overall: "נכשל", inspector: "נועה דוד" },
  { wo: "WO-7405", product: 'דלת כניסה 1.0×2.1m', dimensionsOk: true, operationOk: true, finishOk: true, overall: "עובר", inspector: "עמית שרון" },
  { wo: "WO-7406", product: 'תריס חשמלי 1.5×1.8m', dimensionsOk: true, operationOk: true, finishOk: true, overall: "עובר", inspector: "נועה דוד" },
  { wo: "WO-7407", product: "גדר פרופילים 12m", dimensionsOk: false, operationOk: true, finishOk: true, overall: "נכשל", inspector: "עמית שרון" },
  { wo: "WO-7408", product: "שער כנף כפולה 3.0m", dimensionsOk: true, operationOk: true, finishOk: true, overall: "עובר", inspector: "נועה דוד" },
];

/* ── Tab configuration ── */
const tabs: { key: TabKey; label: string; icon: typeof Wrench }[] = [
  { key: "pre_assembly", label: "טרום-הרכבה", icon: Layers },
  { key: "final_assembly", label: "הרכבה סופית", icon: Package },
  { key: "hardware_installation", label: "פרזול", icon: Lock },
  { key: "final_fit_check", label: "בדיקה סופית", icon: ClipboardCheck },
];

/* ── KPI data ── */
const kpis = [
  { label: "הרכבות פעילות", value: 14, icon: Activity, color: "text-blue-400", bg: "bg-blue-500/15" },
  { label: "תור טרום-הרכבה", value: 7, icon: Layers, color: "text-purple-400", bg: "bg-purple-500/15" },
  { label: "הרכבה סופית", value: 8, icon: Package, color: "text-cyan-400", bg: "bg-cyan-500/15" },
  { label: "התקנת פרזול", value: 7, icon: Lock, color: "text-amber-400", bg: "bg-amber-500/15" },
  { label: "בדיקות ממתינות", value: 3, icon: ClipboardCheck, color: "text-orange-400", bg: "bg-orange-500/15" },
  { label: "הושלמו היום", value: 5, icon: CheckCircle2, color: "text-green-400", bg: "bg-green-500/15" },
];

/* ── Helpers ── */
const BoolIcon = ({ val }: { val: boolean }) =>
  val ? <CheckCircle2 className="w-4 h-4 text-green-400 mx-auto" /> : <XCircle className="w-4 h-4 text-red-400 mx-auto" />;

const preAssemblyStatusBadge = (s: PreAssemblyRow["status"]) => {
  const m: Record<string, string> = { "מוכן": "bg-green-500/20 text-green-400 border-green-500/40", "חלקי": "bg-amber-500/20 text-amber-400 border-amber-500/40", "ממתין לחלקים": "bg-red-500/20 text-red-400 border-red-500/40" };
  return <Badge variant="outline" className={`text-xs ${m[s]}`}>{s}</Badge>;
};

const qcBadge = (s: FinalAssemblyRow["qcStatus"]) => {
  const m: Record<string, string> = { "עבר": "bg-green-500/20 text-green-400 border-green-500/40", "נכשל": "bg-red-500/20 text-red-400 border-red-500/40", "ממתין": "bg-gray-500/20 text-gray-400 border-gray-500/40" };
  return <Badge variant="outline" className={`text-xs ${m[s]}`}>{s}</Badge>;
};

const overallBadge = (s: FitCheckRow["overall"]) => {
  const m: Record<string, string> = { "עובר": "bg-green-500/20 text-green-400 border-green-500/40", "נכשל": "bg-red-500/20 text-red-400 border-red-500/40" };
  return <Badge variant="outline" className={`text-xs font-bold ${m[s]}`}>{s}</Badge>;
};

const thCls = "px-3 py-2 text-right text-xs font-semibold text-gray-400 border-b border-white/10";
const tdCls = "px-3 py-2 text-sm text-gray-200 border-b border-white/5";

/* ══════════════════════════ Component ══════════════════════════ */
export default function AssemblyJobs() {
  const [activeTab, setActiveTab] = useState<TabKey>("pre_assembly");

  const { data: apiData } = useQuery({
    queryKey: ["production-assembly-jobs"],
    queryFn: () => authFetch("/api/production/work-orders?type=assembly").then(r => r.json()),
  });
  const safeArr = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
  const preAssemblyData = safeArr(apiData).length > 0 ? safeArr(apiData).filter((r: any) => r.stage === "pre_assembly") : FALLBACK_PRE_ASSEMBLY;
  const finalAssemblyData = safeArr(apiData).length > 0 ? safeArr(apiData).filter((r: any) => r.stage === "final_assembly") : FALLBACK_FINAL_ASSEMBLY;
  const hardwareData = safeArr(apiData).length > 0 ? safeArr(apiData).filter((r: any) => r.stage === "hardware") : FALLBACK_HARDWARE;
  const fitCheckData = safeArr(apiData).length > 0 ? safeArr(apiData).filter((r: any) => r.stage === "fit_check") : FALLBACK_FIT_CHECK;

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-br from-[#0a0e1a] to-[#101829] text-white p-6 space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-indigo-500/20"><Wrench className="w-6 h-6 text-indigo-400" /></div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">עבודות הרכבה</h1>
          <p className="text-sm text-gray-400">טכנו-כל עוזי — ניהול תהליך הרכבה מלא</p>
        </div>
      </div>

      {/* ── KPI Row ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k) => (
          <Card key={k.label} className="bg-[#121a2d] border border-white/10">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${k.bg}`}><k.icon className={`w-5 h-5 ${k.color}`} /></div>
              <div>
                <p className="text-[22px] font-bold text-white leading-none">{k.value}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{k.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-[#121a2d] p-1 rounded-lg border border-white/10 w-fit">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === t.key ? "bg-indigo-600 text-white shadow" : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab Content ── */}
      <Card className="bg-[#121a2d] border border-white/10">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-gray-200">
            {tabs.find((t) => t.key === activeTab)?.label}
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {activeTab === "pre_assembly" && (
            <table className="w-full text-right">
              <thead><tr>
                <th className={thCls}>הזמנת עבודה</th><th className={thCls}>מוצר</th>
                <th className={thCls}>מוכנות רכיבים</th><th className={thCls}>חלקים חסרים</th>
                <th className={thCls}>תחנה</th><th className={thCls}>סטטוס</th>
              </tr></thead>
              <tbody>
                {preAssemblyData.map((r) => (
                  <tr key={r.wo} className="hover:bg-white/5 transition-colors">
                    <td className={`${tdCls} font-mono font-semibold text-indigo-300`}>{r.wo}</td>
                    <td className={tdCls}>{r.product}</td>
                    <td className={tdCls}>
                      <div className="flex items-center gap-2">
                        <Progress value={r.componentsReady} className="h-2 w-20 bg-white/10" />
                        <span className="text-xs text-gray-400">{r.componentsReady}%</span>
                      </div>
                    </td>
                    <td className={`${tdCls} text-xs ${r.missingParts === "—" ? "text-gray-500" : "text-amber-400"}`}>
                      {r.missingParts !== "—" && <AlertTriangle className="w-3 h-3 inline ml-1" />}{r.missingParts}
                    </td>
                    <td className={tdCls}>{r.station}</td>
                    <td className={tdCls}>{preAssemblyStatusBadge(r.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeTab === "final_assembly" && (
            <table className="w-full text-right">
              <thead><tr>
                <th className={thCls}>הזמנת עבודה</th><th className={thCls}>מוצר</th>
                <th className={thCls}>מרכיב</th><th className={thCls}>שעת התחלה</th>
                <th className={thCls}>התקדמות</th><th className={thCls}>סטטוס QC</th>
              </tr></thead>
              <tbody>
                {finalAssemblyData.map((r) => (
                  <tr key={r.wo} className="hover:bg-white/5 transition-colors">
                    <td className={`${tdCls} font-mono font-semibold text-indigo-300`}>{r.wo}</td>
                    <td className={tdCls}>{r.product}</td>
                    <td className={tdCls}><span className="flex items-center gap-1"><User className="w-3.5 h-3.5 text-gray-400" />{r.assembler}</span></td>
                    <td className={tdCls}><span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-gray-400" />{r.startTime}</span></td>
                    <td className={tdCls}>
                      <div className="flex items-center gap-2">
                        <Progress value={r.progress} className="h-2 w-20 bg-white/10" />
                        <span className={`text-xs font-semibold ${r.progress === 100 ? "text-green-400" : "text-gray-300"}`}>{r.progress}%</span>
                      </div>
                    </td>
                    <td className={tdCls}>{qcBadge(r.qcStatus)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeTab === "hardware_installation" && (
            <table className="w-full text-right">
              <thead><tr>
                <th className={thCls}>הזמנת עבודה</th><th className={thCls}>מוצר</th>
                <th className={`${thCls} text-center`}>צירים</th><th className={`${thCls} text-center`}>מנעולים</th>
                <th className={`${thCls} text-center`}>ידיות</th><th className={`${thCls} text-center`}>מנועים</th>
                <th className={thCls}>מתקין</th>
              </tr></thead>
              <tbody>
                {hardwareData.map((r) => (
                  <tr key={r.wo} className="hover:bg-white/5 transition-colors">
                    <td className={`${tdCls} font-mono font-semibold text-indigo-300`}>{r.wo}</td>
                    <td className={tdCls}>{r.product}</td>
                    <td className={tdCls}><BoolIcon val={r.hinges} /></td>
                    <td className={tdCls}><BoolIcon val={r.locks} /></td>
                    <td className={tdCls}><BoolIcon val={r.handles} /></td>
                    <td className={tdCls}><BoolIcon val={r.motors} /></td>
                    <td className={tdCls}><span className="flex items-center gap-1"><User className="w-3.5 h-3.5 text-gray-400" />{r.installer}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeTab === "final_fit_check" && (
            <table className="w-full text-right">
              <thead><tr>
                <th className={thCls}>הזמנת עבודה</th><th className={thCls}>מוצר</th>
                <th className={`${thCls} text-center`}>מידות תקינות</th><th className={`${thCls} text-center`}>פעולה תקינה</th>
                <th className={`${thCls} text-center`}>גימור תקין</th><th className={thCls}>תוצאה כוללת</th>
                <th className={thCls}>בודק</th>
              </tr></thead>
              <tbody>
                {fitCheckData.map((r) => (
                  <tr key={r.wo} className="hover:bg-white/5 transition-colors">
                    <td className={`${tdCls} font-mono font-semibold text-indigo-300`}>{r.wo}</td>
                    <td className={tdCls}>{r.product}</td>
                    <td className={tdCls}><BoolIcon val={r.dimensionsOk} /></td>
                    <td className={tdCls}><BoolIcon val={r.operationOk} /></td>
                    <td className={tdCls}><BoolIcon val={r.finishOk} /></td>
                    <td className={tdCls}>{overallBadge(r.overall)}</td>
                    <td className={tdCls}><span className="flex items-center gap-1"><User className="w-3.5 h-3.5 text-gray-400" />{r.inspector}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
