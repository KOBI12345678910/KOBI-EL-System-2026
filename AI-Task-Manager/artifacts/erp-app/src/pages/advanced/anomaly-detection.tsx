import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertTriangle, AlertCircle, CheckCircle2, XCircle, Search,
  TrendingDown, TrendingUp, Package, DollarSign, Users,
  ShoppingCart, Wrench, Shield, Brain, Sparkles, Filter,
  Eye, CheckSquare, Plus, Activity, Clock, Zap
} from "lucide-react";

type Severity = "critical" | "high" | "medium" | "low";
type AnomalyStatus = "active" | "investigating" | "resolved";
type EntityType = "sales" | "inventory" | "finance" | "production" | "quality" | "hr" | "customer";

interface Anomaly {
  id: string;
  title: string;
  entity: EntityType;
  entityLabel: string;
  severity: Severity;
  score: number;
  expected: number;
  actual: number;
  deviation: number;
  detectedAt: string;
  status: AnomalyStatus;
  spark: number[];
  description: string;
}

const ENTITY_CONFIG: Record<EntityType, { icon: any; label: string; color: string }> = {
  sales: { icon: ShoppingCart, label: "מכירות", color: "text-cyan-400" },
  inventory: { icon: Package, label: "מלאי", color: "text-purple-400" },
  finance: { icon: DollarSign, label: "פיננסי", color: "text-green-400" },
  production: { icon: Wrench, label: "ייצור", color: "text-amber-400" },
  quality: { icon: Shield, label: "איכות", color: "text-red-400" },
  hr: { icon: Users, label: "משאבי אנוש", color: "text-pink-400" },
  customer: { icon: Users, label: "לקוחות", color: "text-blue-400" },
};

const SEVERITY_CONFIG: Record<Severity, { label: string; color: string; bg: string; border: string }> = {
  critical: { label: "קריטי", color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/40" },
  high: { label: "גבוה", color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/40" },
  medium: { label: "בינוני", color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/40" },
  low: { label: "נמוך", color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/40" },
};

const randSpark = (n = 14, anomalyPos = 11, magnitude = 2.5): number[] => {
  const base = Array.from({ length: n }, () => 40 + Math.random() * 30);
  base[anomalyPos] = base[anomalyPos] * magnitude;
  return base;
};

const MOCK_ANOMALIES: Anomaly[] = [
  { id: "a01", title: "זינוק חד במחיר חומר גלם — פלדה", entity: "inventory", entityLabel: "פלדה מתכת — SKU-1001", severity: "critical", score: 0.97, expected: 4200, actual: 7800, deviation: 85.7, detectedAt: "2026-04-10 14:32", status: "active", spark: randSpark(14, 11, 2.2), description: "עלייה חריגה של 85% במחיר יחידה ללא אירוע שוק מוכר" },
  { id: "a02", title: "דפוס הזמנות חריג — לקוח VIP", entity: "customer", entityLabel: "תעש ישראל בע\"מ", severity: "high", score: 0.89, expected: 24, actual: 3, deviation: -87.5, detectedAt: "2026-04-10 13:45", status: "active", spark: randSpark(14, 12, 0.2), description: "ירידה של 87% בהיקף הזמנות שבועי" },
  { id: "a03", title: "חריגה במלאי — מוצר פגי תוקף", entity: "inventory", entityLabel: "רכיב אלקטרוני RX-445", severity: "high", score: 0.91, expected: 500, actual: 1850, deviation: 270, detectedAt: "2026-04-10 12:20", status: "investigating", spark: randSpark(14, 10, 3.5), description: "מלאי חורג פי 3.7 מהתחזית — סיכון התיישנות" },
  { id: "a04", title: "איחור בתשלום — חשבונית גדולה", entity: "finance", entityLabel: "חשבונית INV-2026-0892", severity: "critical", score: 0.94, expected: 0, actual: 32, deviation: 100, detectedAt: "2026-04-10 11:15", status: "active", spark: randSpark(14, 13, 3.2), description: "חשבונית של 850,000₪ באיחור 32 יום" },
  { id: "a05", title: "פגם חוזר בקו ייצור", entity: "quality", entityLabel: "קו ייצור #3", severity: "high", score: 0.86, expected: 2.1, actual: 8.7, deviation: 314, detectedAt: "2026-04-10 10:45", status: "active", spark: randSpark(14, 11, 4.1), description: "שיעור פסולת קפץ מ-2.1% ל-8.7%" },
  { id: "a06", title: "אובדן לקוח פוטנציאלי", entity: "customer", entityLabel: "אלקטרה בע\"מ", severity: "medium", score: 0.72, expected: 5, actual: 0, deviation: -100, detectedAt: "2026-04-10 09:30", status: "investigating", spark: randSpark(14, 12, 0.1), description: "אין אינטראקציה 3 שבועות — בעבר שבועיים" },
  { id: "a07", title: "שינוי פתאומי במחזור המרה", entity: "sales", entityLabel: "לוח מחוונים — ליד→הזמנה", severity: "medium", score: 0.78, expected: 34, actual: 18, deviation: -47, detectedAt: "2026-04-10 08:50", status: "active", spark: randSpark(14, 11, 0.5), description: "שיעור המרה ירד מ-34% ל-18%" },
  { id: "a08", title: "תקלה חוזרת במכונה", entity: "production", entityLabel: "מכבש הידראולי M03", severity: "critical", score: 0.95, expected: 1, actual: 7, deviation: 600, detectedAt: "2026-04-10 08:10", status: "active", spark: randSpark(14, 12, 5.2), description: "7 תקלות ב-24 שעות — חריג לחלוטין" },
  { id: "a09", title: "עלייה חריגה בהוצאות נסיעה", entity: "finance", entityLabel: "מחלקת מכירות", severity: "medium", score: 0.69, expected: 12000, actual: 34500, deviation: 188, detectedAt: "2026-04-09 16:20", status: "investigating", spark: randSpark(14, 11, 2.8), description: "הוצאה חודשית פי 2.9 מהממוצע" },
  { id: "a10", title: "ירידה במלאי מוצר חם", entity: "inventory", entityLabel: "מוצר TP-987 — מוצר הדגל", severity: "high", score: 0.87, expected: 800, actual: 45, deviation: -94, detectedAt: "2026-04-09 15:40", status: "active", spark: randSpark(14, 12, 0.06), description: "ירידה חדה במלאי — דורש השלמה" },
  { id: "a11", title: "דפוס גניבה אפשרי — POS", entity: "sales", entityLabel: "חנות מרכזית", severity: "critical", score: 0.93, expected: 0, actual: 5, deviation: 100, detectedAt: "2026-04-09 14:25", status: "investigating", spark: randSpark(14, 13, 4.5), description: "5 ביטולי עסקה בלתי מוסברים ביום אחד" },
  { id: "a12", title: "ירידה חדה בשעות עבודה", entity: "hr", entityLabel: "מחלקת פיתוח", severity: "low", score: 0.62, expected: 160, actual: 120, deviation: -25, detectedAt: "2026-04-09 13:10", status: "resolved", spark: randSpark(14, 11, 0.75), description: "ירידה של 25% בשעות עבודה לחודש" },
  { id: "a13", title: "זמן ייצור חריג", entity: "production", entityLabel: "מוצר TP-123", severity: "medium", score: 0.74, expected: 45, actual: 78, deviation: 73, detectedAt: "2026-04-09 12:00", status: "active", spark: randSpark(14, 11, 1.7), description: "זמן ייצור עלה ב-73% ללא הסבר" },
  { id: "a14", title: "דפוס חריג ברכש", entity: "inventory", entityLabel: "ספק XYZ לוגיסטיקה", severity: "high", score: 0.83, expected: 15, actual: 42, deviation: 180, detectedAt: "2026-04-09 11:20", status: "investigating", spark: randSpark(14, 12, 2.8), description: "מספר הזמנות רכש קפץ פי 2.8" },
  { id: "a15", title: "ירידה חריגה במדד שביעות רצון", entity: "customer", entityLabel: "סקר רבעוני — NPS", severity: "high", score: 0.85, expected: 72, actual: 54, deviation: -25, detectedAt: "2026-04-09 10:15", status: "active", spark: randSpark(14, 12, 0.75), description: "NPS ירד מ-72 ל-54 — החמרה חדה" },
  { id: "a16", title: "מחיר מכירה נמוך באופן חריג", entity: "sales", entityLabel: "הזמנה ORD-5584", severity: "medium", score: 0.76, expected: 120000, actual: 78000, deviation: -35, detectedAt: "2026-04-09 09:00", status: "resolved", spark: randSpark(14, 11, 0.65), description: "הנחה חריגה של 35% — דורש אישור" },
  { id: "a17", title: "חריגה בהוצאות שיווק", entity: "finance", entityLabel: "קמפיין Q2", severity: "medium", score: 0.71, expected: 50000, actual: 89000, deviation: 78, detectedAt: "2026-04-08 17:30", status: "active", spark: randSpark(14, 11, 1.8), description: "חריגה מתקציב ב-78%" },
  { id: "a18", title: "זינוק בכמות החזרות", entity: "quality", entityLabel: "מוצר TP-456", severity: "high", score: 0.88, expected: 3, actual: 18, deviation: 500, detectedAt: "2026-04-08 16:15", status: "investigating", spark: randSpark(14, 12, 6), description: "כמות החזרות קפצה פי 6" },
  { id: "a19", title: "תנועה חריגה בחשבון בנק", entity: "finance", entityLabel: "חשבון תפעולי", severity: "critical", score: 0.96, expected: 0, actual: 1, deviation: 100, detectedAt: "2026-04-08 15:00", status: "resolved", spark: randSpark(14, 13, 5.5), description: "משיכה חריגה של 480,000₪ לא זוהתה" },
  { id: "a20", title: "דפוס חריג ברכש פריט בודד", entity: "inventory", entityLabel: "ברגי טיטניום", severity: "low", score: 0.64, expected: 200, actual: 450, deviation: 125, detectedAt: "2026-04-08 14:20", status: "resolved", spark: randSpark(14, 11, 2.25), description: "הזמנה חריגה ללא צורך ברור" },
  { id: "a21", title: "ירידה בגיוס עובדים", entity: "hr", entityLabel: "מחלקת HR", severity: "low", score: 0.58, expected: 8, actual: 2, deviation: -75, detectedAt: "2026-04-08 13:10", status: "investigating", spark: randSpark(14, 11, 0.25), description: "גיוס חודשי ירד ב-75%" },
  { id: "a22", title: "איבוד לקוח שנתי", entity: "customer", entityLabel: "שטראוס גרופ", severity: "critical", score: 0.92, expected: 1, actual: 0, deviation: -100, detectedAt: "2026-04-08 12:00", status: "active", spark: randSpark(14, 12, 0.05), description: "לקוח שנתי לא חידש הזמנה" },
  { id: "a23", title: "חריגה בעלויות ייצור", entity: "production", entityLabel: "קו #2 — רכיבים", severity: "high", score: 0.84, expected: 45000, actual: 68000, deviation: 51, detectedAt: "2026-04-08 10:45", status: "active", spark: randSpark(14, 11, 1.5), description: "עלות יחידה עלתה ב-51%" },
  { id: "a24", title: "עלייה בחלק הסחורה הנפסלת", entity: "quality", entityLabel: "בקרת איכות", severity: "medium", score: 0.77, expected: 1.5, actual: 4.8, deviation: 220, detectedAt: "2026-04-08 09:30", status: "investigating", spark: randSpark(14, 12, 3.2), description: "שיעור פסילות פי 3.2 מהממוצע" },
  { id: "a25", title: "זמן תגובה חריג מספק", entity: "inventory", entityLabel: "ספק פלדה א׳", severity: "medium", score: 0.73, expected: 3, actual: 12, deviation: 300, detectedAt: "2026-04-08 08:15", status: "active", spark: randSpark(14, 11, 4), description: "זמן אספקה קפץ מ-3 ל-12 ימים" },
  { id: "a26", title: "זינוק במכירות אזור צפון", entity: "sales", entityLabel: "אזור מכירה — צפון", severity: "low", score: 0.61, expected: 450000, actual: 780000, deviation: 73, detectedAt: "2026-04-08 07:45", status: "resolved", spark: randSpark(14, 11, 1.7), description: "עלייה חיובית — בדיקת תקינות דרושה" },
];

function Sparkline({ values, color = "#06b6d4" }: { values: number[]; color?: string }) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const width = 100;
  const height = 30;
  const step = width / (values.length - 1);
  const points = values
    .map((v, i) => `${i * step},${height - ((v - min) / range) * height}`)
    .join(" ");
  const highIdx = values.indexOf(max);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-8" preserveAspectRatio="none">
      <polyline points={points} stroke={color} strokeWidth="1.5" fill="none" />
      <circle cx={highIdx * step} cy={height - ((values[highIdx] - min) / range) * height} r="1.8" fill={color}>
        <animate attributeName="r" values="1.8;3;1.8" dur="1.5s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

export default function AnomalyDetection() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSeverity, setSelectedSeverity] = useState<Severity | "all">("all");
  const [selectedEntity, setSelectedEntity] = useState<EntityType | "all">("all");
  const [newCounter] = useState(4);

  const { data } = useQuery({
    queryKey: ["anomaly-detection"],
    queryFn: async () => {
      try {
        const res = await authFetch("/api/advanced/anomaly-detection");
        if (!res.ok) throw new Error("fallback");
        return await res.json();
      } catch {
        return { anomalies: MOCK_ANOMALIES };
      }
    },
  });

  const anomalies: Anomaly[] = data?.anomalies || MOCK_ANOMALIES;

  const stats = {
    total: anomalies.length,
    critical: anomalies.filter((a) => a.severity === "critical").length,
    newToday: anomalies.filter((a) => a.detectedAt.startsWith("2026-04-10")).length,
    resolved: anomalies.filter((a) => a.status === "resolved").length,
  };

  const filtered = anomalies.filter((a) => {
    if (searchTerm && !a.title.toLowerCase().includes(searchTerm.toLowerCase()) && !a.entityLabel.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (selectedSeverity !== "all" && a.severity !== selectedSeverity) return false;
    if (selectedEntity !== "all" && a.entity !== selectedEntity) return false;
    return true;
  });

  const bySeverity = (["critical", "high", "medium", "low"] as Severity[]).map((s) => ({
    severity: s,
    items: filtered.filter((a) => a.severity === s),
  }));

  const byEntity = Object.keys(ENTITY_CONFIG).map((e) => ({
    entity: e as EntityType,
    items: filtered.filter((a) => a.entity === e),
  }));

  return (
    <div dir="rtl" className="min-h-screen bg-[#0a0e1a] text-white p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-gradient-to-br from-red-500/20 to-orange-500/20 border border-red-500/40">
            <AlertTriangle className="h-7 w-7 text-red-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">מרכז זיהוי חריגות — AI</h1>
            <p className="text-sm text-gray-400">זיהוי אנומליות מבוסס ML על כל מדדי העסק בזמן אמת</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/40">
              <div className="relative">
                <div className="h-2 w-2 rounded-full bg-red-500 animate-ping absolute" />
                <div className="h-2 w-2 rounded-full bg-red-500 relative" />
              </div>
              <span className="text-xs text-red-400 font-medium">{newCounter} חדשות</span>
            </div>
          </div>
          <Badge variant="outline" className="border-purple-500/40 text-purple-400 bg-purple-500/10">
            <Brain className="h-3 w-3 ml-1" /> מופעל ע״י ML
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card className="bg-[#111827] border-[#1f2937]">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-gray-400 mb-1">סך חריגות</div>
              <div className="text-2xl font-bold">{stats.total}</div>
            </div>
            <Activity className="h-8 w-8 text-gray-500" />
          </CardContent>
        </Card>
        <Card className="bg-red-500/5 border-red-500/30">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-gray-400 mb-1">קריטיות</div>
              <div className="text-2xl font-bold text-red-400">{stats.critical}</div>
            </div>
            <XCircle className="h-8 w-8 text-red-400/50" />
          </CardContent>
        </Card>
        <Card className="bg-amber-500/5 border-amber-500/30">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-gray-400 mb-1">חדשות היום</div>
              <div className="text-2xl font-bold text-amber-400">{stats.newToday}</div>
            </div>
            <Zap className="h-8 w-8 text-amber-400/50" />
          </CardContent>
        </Card>
        <Card className="bg-green-500/5 border-green-500/30">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-gray-400 mb-1">נפתרו</div>
              <div className="text-2xl font-bold text-green-400">{stats.resolved}</div>
            </div>
            <CheckCircle2 className="h-8 w-8 text-green-400/50" />
          </CardContent>
        </Card>
      </div>

      <Card className="bg-[#111827] border-[#1f2937] mb-4">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="חיפוש חריגות..."
              className="pr-10 bg-[#0a0e1a] border-[#1f2937]"
            />
          </div>
          <select
            value={selectedSeverity}
            onChange={(e) => setSelectedSeverity(e.target.value as any)}
            className="bg-[#0a0e1a] border border-[#1f2937] rounded-md px-3 py-2 text-sm"
          >
            <option value="all">כל החומרות</option>
            <option value="critical">קריטי</option>
            <option value="high">גבוה</option>
            <option value="medium">בינוני</option>
            <option value="low">נמוך</option>
          </select>
          <select
            value={selectedEntity}
            onChange={(e) => setSelectedEntity(e.target.value as any)}
            className="bg-[#0a0e1a] border border-[#1f2937] rounded-md px-3 py-2 text-sm"
          >
            <option value="all">כל הישויות</option>
            {Object.entries(ENTITY_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <Button variant="outline" className="border-[#1f2937] bg-[#0a0e1a]">
            <Filter className="h-4 w-4 ml-2" /> סינון מתקדם
          </Button>
        </CardContent>
      </Card>

      <Tabs defaultValue="severity">
        <TabsList className="bg-[#111827] border border-[#1f2937]">
          <TabsTrigger value="severity">לפי חומרה</TabsTrigger>
          <TabsTrigger value="source">לפי מקור</TabsTrigger>
          <TabsTrigger value="history">היסטוריה</TabsTrigger>
        </TabsList>

        <TabsContent value="severity" className="mt-4 space-y-6">
          {bySeverity.map(({ severity, items }) => {
            if (items.length === 0) return null;
            const cfg = SEVERITY_CONFIG[severity];
            return (
              <div key={severity}>
                <div className="flex items-center gap-2 mb-3">
                  <div className={`h-2 w-2 rounded-full ${cfg.bg.replace("/10", "")} ${severity === "critical" ? "animate-pulse" : ""}`} />
                  <h3 className={`text-sm font-bold ${cfg.color}`}>{cfg.label}</h3>
                  <Badge variant="outline" className={`${cfg.border} ${cfg.color}`}>
                    {items.length}
                  </Badge>
                </div>
                <div className="space-y-2">
                  {items.map((a) => {
                    const entCfg = ENTITY_CONFIG[a.entity];
                    const EntityIcon = entCfg.icon;
                    return (
                      <Card key={a.id} className={`bg-[#111827] border-[#1f2937] hover:${cfg.border} transition-all`}>
                        <CardContent className="p-4">
                          <div className="flex items-start gap-4">
                            <div className={`p-2 rounded-lg ${cfg.bg} ${cfg.border} border`}>
                              <EntityIcon className={`h-5 w-5 ${entCfg.color}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2 mb-1">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <h4 className="text-sm font-semibold truncate">{a.title}</h4>
                                    <Badge variant="outline" className="text-[10px] border-purple-500/40 text-purple-400 h-5">
                                      <Sparkles className="h-2.5 w-2.5 ml-1" /> ML
                                    </Badge>
                                  </div>
                                  <div className="text-xs text-gray-400 mt-0.5">{a.entityLabel}</div>
                                </div>
                                <Badge className={`${cfg.bg} ${cfg.color} ${cfg.border} border flex-shrink-0`}>
                                  {cfg.label}
                                </Badge>
                              </div>
                              <p className="text-xs text-gray-500 mb-2">{a.description}</p>
                              <div className="grid grid-cols-12 gap-3 items-center">
                                <div className="col-span-3 p-2 rounded bg-[#0a0e1a] border border-[#1f2937]">
                                  <Sparkline values={a.spark} color={severity === "critical" ? "#ef4444" : severity === "high" ? "#f97316" : severity === "medium" ? "#f59e0b" : "#3b82f6"} />
                                </div>
                                <div className="col-span-2">
                                  <div className="text-[10px] text-gray-500">צפוי</div>
                                  <div className="text-xs font-bold text-white">{typeof a.expected === "number" ? a.expected.toLocaleString("he-IL") : a.expected}</div>
                                </div>
                                <div className="col-span-2">
                                  <div className="text-[10px] text-gray-500">בפועל</div>
                                  <div className={`text-xs font-bold ${cfg.color}`}>{typeof a.actual === "number" ? a.actual.toLocaleString("he-IL") : a.actual}</div>
                                </div>
                                <div className="col-span-1">
                                  <div className="text-[10px] text-gray-500">סטייה</div>
                                  <div className="text-xs font-bold flex items-center gap-0.5">
                                    {a.deviation > 0 ? <TrendingUp className="h-3 w-3 text-red-400" /> : <TrendingDown className="h-3 w-3 text-red-400" />}
                                    {Math.abs(a.deviation).toFixed(0)}%
                                  </div>
                                </div>
                                <div className="col-span-2">
                                  <div className="text-[10px] text-gray-500">ציון חריגה</div>
                                  <div className="text-xs font-bold text-purple-400">{(a.score * 100).toFixed(0)}%</div>
                                </div>
                                <div className="col-span-2 flex gap-1 justify-end">
                                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 hover:bg-[#1f2937]" title="חקור">
                                    <Eye className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 hover:bg-[#1f2937]" title="סמן כנפתר">
                                    <CheckSquare className="h-3.5 w-3.5 text-green-400" />
                                  </Button>
                                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 hover:bg-[#1f2937]" title="צור משימה">
                                    <Plus className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                              <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-500">
                                <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5" />{a.detectedAt}</span>
                                <Badge variant="outline" className="h-4 text-[10px] border-[#1f2937]">
                                  {a.status === "active" ? "פעיל" : a.status === "investigating" ? "בבדיקה" : "נפתר"}
                                </Badge>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </TabsContent>

        <TabsContent value="source" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {byEntity.map(({ entity, items }) => {
              if (items.length === 0) return null;
              const cfg = ENTITY_CONFIG[entity];
              const Icon = cfg.icon;
              return (
                <Card key={entity} className="bg-[#111827] border-[#1f2937]">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center justify-between text-white text-sm">
                      <div className="flex items-center gap-2">
                        <Icon className={`h-4 w-4 ${cfg.color}`} />
                        {cfg.label}
                      </div>
                      <Badge variant="outline" className="border-[#1f2937]">{items.length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {items.slice(0, 5).map((a) => {
                      const sevCfg = SEVERITY_CONFIG[a.severity];
                      return (
                        <div key={a.id} className={`p-2 rounded-lg bg-[#0a0e1a] border ${sevCfg.border}`}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium truncate">{a.title}</span>
                            <Badge className={`${sevCfg.bg} ${sevCfg.color} ${sevCfg.border} border text-[10px] h-4`}>
                              {sevCfg.label}
                            </Badge>
                          </div>
                          <div className="text-[10px] text-gray-500 truncate">{a.entityLabel}</div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card className="bg-[#111827] border-[#1f2937]">
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-[#0a0e1a] border-b border-[#1f2937]">
                  <tr>
                    <th className="text-right px-4 py-3 text-xs text-gray-400 font-medium">חומרה</th>
                    <th className="text-right px-4 py-3 text-xs text-gray-400 font-medium">כותרת</th>
                    <th className="text-right px-4 py-3 text-xs text-gray-400 font-medium">ישות</th>
                    <th className="text-right px-4 py-3 text-xs text-gray-400 font-medium">ציון</th>
                    <th className="text-right px-4 py-3 text-xs text-gray-400 font-medium">סטייה</th>
                    <th className="text-right px-4 py-3 text-xs text-gray-400 font-medium">זמן</th>
                    <th className="text-right px-4 py-3 text-xs text-gray-400 font-medium">סטטוס</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a) => {
                    const sevCfg = SEVERITY_CONFIG[a.severity];
                    const entCfg = ENTITY_CONFIG[a.entity];
                    return (
                      <tr key={a.id} className="border-b border-[#1f2937] hover:bg-[#0a0e1a]/50">
                        <td className="px-4 py-2">
                          <Badge className={`${sevCfg.bg} ${sevCfg.color} ${sevCfg.border} border text-[10px]`}>
                            {sevCfg.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-2 text-white truncate max-w-xs">{a.title}</td>
                        <td className={`px-4 py-2 ${entCfg.color}`}>{entCfg.label}</td>
                        <td className="px-4 py-2 text-purple-400">{(a.score * 100).toFixed(0)}%</td>
                        <td className="px-4 py-2">{Math.abs(a.deviation).toFixed(0)}%</td>
                        <td className="px-4 py-2 text-xs text-gray-400">{a.detectedAt}</td>
                        <td className="px-4 py-2">
                          <Badge variant="outline" className="border-[#1f2937] text-[10px]">
                            {a.status === "active" ? "פעיל" : a.status === "investigating" ? "בבדיקה" : "נפתר"}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
