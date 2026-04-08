import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Bot, Zap, Send, ShieldCheck, Package, AlertTriangle, Clock,
  CheckCircle, PlayCircle, PauseCircle, Activity, Timer, FileText,
  Settings, TrendingUp, BarChart3
} from "lucide-react";

// ============================================================
// DATA — טכנו-כל עוזי — אוטומציות רכש
// ============================================================
const automations = [
  {
    id: "auto_send_rfq",
    name: "שליחת RFQ אוטומטית",
    description: "שליחה אוטומטית של בקשות הצעת מחיר לספקים מאושרים כאשר רמת מלאי חומר גלם יורדת מתחת לסף מינימום.",
    trigger: "מלאי חומר גלם < נקודת הזמנה",
    icon: Send,
    active: true,
    successRate: 96,
    runs: 142,
    lastTriggered: "2026-04-08T09:15:00",
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
  },
  {
    id: "auto_select_best_supplier",
    name: "בחירת ספק אופטימלי",
    description: "השוואה אוטומטית של הצעות מחיר לפי מחיר, זמן אספקה, דירוג איכות ואמינות — ובחירת הספק הטוב ביותר.",
    trigger: "התקבלו ≥2 הצעות מחיר ל-RFQ",
    icon: ShieldCheck,
    active: true,
    successRate: 89,
    runs: 87,
    lastTriggered: "2026-04-08T08:30:00",
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
  },
  {
    id: "auto_generate_order",
    name: "הפקת הזמנת רכש",
    description: "יצירה אוטומטית של הזמנת רכש (PO) מהספק שנבחר, כולל תנאי תשלום, כתובת משלוח ותאריך אספקה צפוי.",
    trigger: "ספק נבחר + אישור כלל תקציב",
    icon: FileText,
    active: true,
    successRate: 98,
    runs: 203,
    lastTriggered: "2026-04-08T10:05:00",
    color: "text-violet-400",
    bgColor: "bg-violet-500/10",
  },
  {
    id: "auto_approval_based_on_rules",
    name: "אישור אוטומטי לפי כללים",
    description: "אישור מיידי של הזמנות רכש שעומדות בכללי תקציב, סף סכום ורשימת ספקים מאושרים — ללא המתנה ידנית.",
    trigger: "סכום ≤ ₪50,000 + ספק מאושר + בתקציב",
    icon: CheckCircle,
    active: true,
    successRate: 94,
    runs: 178,
    lastTriggered: "2026-04-07T16:20:00",
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
  },
  {
    id: "auto_update_inventory",
    name: "עדכון מלאי אוטומטי",
    description: "עדכון אוטומטי של כמויות מלאי בעת קבלת סחורה — סריקת תעודת משלוח מול הזמנה ועדכון מערכת מלאי.",
    trigger: "קבלת סחורה — אישור GRN",
    icon: Package,
    active: false,
    successRate: 91,
    runs: 112,
    lastTriggered: "2026-04-07T14:45:00",
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/10",
  },
  {
    id: "auto_alert_on_delay",
    name: "התראת עיכוב אספקה",
    description: "זיהוי אוטומטי של עיכובים באספקה (מעל 2 ימי סטייה) ושליחת התראה למנהל רכש + ספק עם בקשת עדכון.",
    trigger: "תאריך אספקה צפוי < היום − 2 ימים",
    icon: AlertTriangle,
    active: true,
    successRate: 100,
    runs: 34,
    lastTriggered: "2026-04-08T07:00:00",
    color: "text-red-400",
    bgColor: "bg-red-500/10",
  },
];

const executionLog = [
  { id: 1, time: "2026-04-08T10:05:00", automation: "הפקת הזמנת רכש", trigger: "PO-000462 — Foshan Glass", result: "הצלחה", duration: "1.2s" },
  { id: 2, time: "2026-04-08T09:15:00", automation: "שליחת RFQ אוטומטית", trigger: "אלומיניום 6063 — מלאי 120 ק\"ג", result: "הצלחה", duration: "3.8s" },
  { id: 3, time: "2026-04-08T08:30:00", automation: "בחירת ספק אופטימלי", trigger: "RFQ-0087 — 3 הצעות", result: "הצלחה", duration: "2.1s" },
  { id: 4, time: "2026-04-08T07:00:00", automation: "התראת עיכוב אספקה", trigger: "PO-000455 — Alumil SA +3 ימים", result: "הצלחה", duration: "0.5s" },
  { id: 5, time: "2026-04-07T16:20:00", automation: "אישור אוטומטי לפי כללים", trigger: "PO-000461 — ₪38,000 — ספק מאושר", result: "הצלחה", duration: "0.3s" },
  { id: 6, time: "2026-04-07T14:45:00", automation: "עדכון מלאי אוטומטי", trigger: "GRN-0034 — מפעלי ברזל השרון", result: "הצלחה", duration: "1.8s" },
  { id: 7, time: "2026-04-07T11:10:00", automation: "שליחת RFQ אוטומטית", trigger: "זכוכית מחוסמת 10 מ\"מ — מלאי 45 יח'", result: "כשלון", duration: "5.2s" },
  { id: 8, time: "2026-04-07T09:00:00", automation: "התראת עיכוב אספקה", trigger: "PO-000450 — Schüco +1 יום", result: "הצלחה", duration: "0.4s" },
];

const rules = [
  { id: 1, rule: "אישור אוטומטי עד ₪50,000", scope: "כל הספקים המאושרים", condition: "סכום ≤ 50,000 ₪ + ספק ברשימה לבנה + קיים תקציב פנוי", status: "פעיל" },
  { id: 2, rule: "שליחת RFQ ל-3 ספקים לפחות", scope: "חומרי גלם", condition: "מלאי < נקודת הזמנה → שליחה ל-3 ספקים מדורגים", status: "פעיל" },
  { id: 3, rule: "בחירת ספק — משקלות", scope: "כל הקטגוריות", condition: "מחיר 40% | זמן אספקה 25% | איכות 20% | אמינות 15%", status: "פעיל" },
  { id: 4, rule: "התראת עיכוב — סף 2 ימים", scope: "הזמנות פתוחות", condition: "תאריך אספקה צפוי > היום + 2 → התראה + מייל לספק", status: "פעיל" },
  { id: 5, rule: "עדכון מלאי — GRN תואם", scope: "קבלת סחורה", condition: "כמות GRN תואמת PO (±5%) → עדכון אוטומטי", status: "מושהה" },
  { id: 6, rule: "חסימת הזמנה כפולה", scope: "כל ההזמנות", condition: "אותו ספק + אותו פריט + תוך 48 שעות → חסימה + התראה", status: "פעיל" },
];

const fmtDateTime = (d: string) => new Date(d).toLocaleString("he-IL");

// ============================================================
// COMPONENT
// ============================================================
export default function ProcurementAutomation() {
  const [toggles, setToggles] = useState<Record<string, boolean>>(
    Object.fromEntries(automations.map(a => [a.id, a.active]))
  );

  const activeCount = Object.values(toggles).filter(Boolean).length;
  const triggeredToday = executionLog.filter(l => l.time.startsWith("2026-04-08")).length;
  const ordersAutoGen = automations.find(a => a.id === "auto_generate_order")!.runs;
  const rfqsSent = automations.find(a => a.id === "auto_send_rfq")!.runs;
  const failCount = executionLog.filter(l => l.result === "כשלון").length;
  const errorRate = ((failCount / executionLog.length) * 100).toFixed(1);

  const kpis = [
    { label: "אוטומציות פעילות", value: `${activeCount} / ${automations.length}`, icon: Zap, color: "text-emerald-400" },
    { label: "הופעלו היום", value: triggeredToday, icon: Activity, color: "text-blue-400" },
    { label: "הזמנות שנוצרו אוטומטית", value: ordersAutoGen, icon: FileText, color: "text-violet-400" },
    { label: "RFQ נשלחו אוטומטית", value: rfqsSent, icon: Send, color: "text-cyan-400" },
    { label: "שעות שנחסכו", value: "128.5", icon: Timer, color: "text-amber-400" },
    { label: "אחוז שגיאות", value: `${errorRate}%`, icon: AlertTriangle, color: "text-red-400" },
  ];

  const toggle = (id: string) => setToggles(p => ({ ...p, [id]: !p[id] }));

  return (
    <div dir="rtl" className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-violet-500/20">
          <Bot className="w-6 h-6 text-violet-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">אוטומציות רכש</h1>
          <p className="text-sm text-slate-400">מנוע אוטומציה חכם — טכנו-כל עוזי</p>
        </div>
        <Badge className="mr-auto bg-emerald-500/20 text-emerald-300 border-emerald-500/30">{activeCount} פעילות</Badge>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map(k => (
          <Card key={k.label} className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-4 flex flex-col items-center text-center gap-1">
              <k.icon className={`w-5 h-5 ${k.color}`} />
              <span className="text-lg font-bold text-white">{k.value}</span>
              <span className="text-xs text-slate-400">{k.label}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="automations" className="space-y-4">
        <TabsList className="bg-slate-800/50 border border-slate-700">
          <TabsTrigger value="automations" className="data-[state=active]:bg-slate-700">אוטומציות</TabsTrigger>
          <TabsTrigger value="history" className="data-[state=active]:bg-slate-700">היסטוריית הפעלה</TabsTrigger>
          <TabsTrigger value="rules" className="data-[state=active]:bg-slate-700">כללים</TabsTrigger>
        </TabsList>

        {/* Tab 1 — Automation Cards */}
        <TabsContent value="automations">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {automations.map(a => {
              const isActive = toggles[a.id];
              const Icon = a.icon;
              return (
                <Card key={a.id} className={`bg-slate-800/50 border-slate-700 transition-opacity ${!isActive ? "opacity-60" : ""}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`p-2 rounded-lg ${a.bgColor}`}>
                          <Icon className={`w-5 h-5 ${a.color}`} />
                        </div>
                        <CardTitle className="text-sm font-semibold text-white leading-tight">{a.name}</CardTitle>
                      </div>
                      <button
                        onClick={() => toggle(a.id)}
                        className="focus:outline-none"
                        title={isActive ? "השהה" : "הפעל"}
                      >
                        {isActive
                          ? <PlayCircle className="w-6 h-6 text-emerald-400 hover:text-emerald-300" />
                          : <PauseCircle className="w-6 h-6 text-slate-500 hover:text-slate-400" />}
                      </button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-xs text-slate-400 leading-relaxed">{a.description}</p>
                    <div className="text-xs space-y-1">
                      <div className="flex justify-between">
                        <span className="text-slate-500">טריגר:</span>
                        <span className="text-slate-300 text-left max-w-[65%]">{a.trigger}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">הפעלה אחרונה:</span>
                        <span className="text-slate-300">{fmtDateTime(a.lastTriggered)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500">סטטוס:</span>
                        <Badge className={isActive ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "bg-slate-600/30 text-slate-400 border-slate-600/30"}>
                          {isActive ? "פעיל" : "מושהה"}
                        </Badge>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">אחוז הצלחה</span>
                        <span className="text-white font-medium">{a.successRate}%</span>
                      </div>
                      <Progress value={a.successRate} className="h-2" />
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">הרצות:</span>
                      <span className="text-slate-300 font-mono">{a.runs}</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* Tab 2 — Execution Log */}
        <TabsContent value="history">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white text-sm flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-400" /> היסטוריית הפעלות אחרונות
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-slate-400 text-xs">
                      <th className="py-2 px-3 text-right">זמן</th>
                      <th className="py-2 px-3 text-right">אוטומציה</th>
                      <th className="py-2 px-3 text-right">טריגר</th>
                      <th className="py-2 px-3 text-right">תוצאה</th>
                      <th className="py-2 px-3 text-right">משך</th>
                    </tr>
                  </thead>
                  <tbody>
                    {executionLog.map(l => (
                      <tr key={l.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                        <td className="py-2 px-3 text-slate-300 font-mono text-xs">{fmtDateTime(l.time)}</td>
                        <td className="py-2 px-3 text-white text-xs">{l.automation}</td>
                        <td className="py-2 px-3 text-slate-400 text-xs">{l.trigger}</td>
                        <td className="py-2 px-3">
                          <Badge className={l.result === "הצלחה" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "bg-red-500/20 text-red-300 border-red-500/30"}>
                            {l.result}
                          </Badge>
                        </td>
                        <td className="py-2 px-3 text-slate-400 font-mono text-xs">{l.duration}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3 — Rules */}
        <TabsContent value="rules">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white text-sm flex items-center gap-2">
                <Settings className="w-4 h-4 text-amber-400" /> כללים והגדרות אוטומציה
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {rules.map(r => (
                  <div key={r.id} className="p-3 rounded-lg bg-slate-900/50 border border-slate-700/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-white">{r.rule}</span>
                      <Badge className={r.status === "פעיל" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "bg-slate-600/30 text-slate-400 border-slate-600/30"}>
                        {r.status}
                      </Badge>
                    </div>
                    <div className="flex gap-4 text-xs">
                      <span className="text-slate-500">היקף: <span className="text-slate-300">{r.scope}</span></span>
                    </div>
                    <p className="text-xs text-slate-400">{r.condition}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
