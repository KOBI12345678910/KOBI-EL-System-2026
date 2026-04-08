import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  ShoppingCart, ClipboardList, PackageCheck, Truck, AlertTriangle, Banknote,
  Search, Filter, Clock, CheckCircle, FileText, ArrowUpDown, Package,
  BarChart3, Building2, CircleDollarSign, CalendarClock
} from "lucide-react";

/* ─── static data ─── */
type ProcStatus = "draft" | "requested" | "quoted" | "approved" | "ordered" | "received" | "partial" | "cancelled";

interface ProcRequest {
  id: string;
  project: string;
  projectId: string;
  category: string;
  item: string;
  qty: number;
  unit: string;
  requiredDate: string;
  urgency: number;
  status: ProcStatus;
  linkedTask: string;
  unitPrice: number;
  supplier?: string;
  eta?: string;
  receivedQty?: number;
}

const FALLBACK_PROC_REQUESTS: ProcRequest[] = [
  { id: "PR-2001", projectId: "EX-1001", project: "חלונות אלומיניום — מגדל הים חיפה", category: "אלומיניום", item: "פרופיל אלומיניום 6060 T5", qty: 480, unit: "מטר", requiredDate: "2026-04-18", urgency: 5, status: "ordered", linkedTask: "ייצור חלונות קומות 8-14", unitPrice: 85, supplier: "אלופרופיל בע\"מ", eta: "2026-04-15", receivedQty: 320 },
  { id: "PR-2002", projectId: "EX-1001", project: "חלונות אלומיניום — מגדל הים חיפה", category: "זכוכית", item: "זכוכית מחוסמת 8 מ\"מ שקופה", qty: 120, unit: "יח׳", requiredDate: "2026-04-20", urgency: 4, status: "received", linkedTask: "הרכבת זכוכיות קומות 8-14", unitPrice: 320, supplier: "פניציה זכוכית", eta: "2026-04-12", receivedQty: 120 },
  { id: "PR-2003", projectId: "EX-1002", project: "זכוכית חזיתית — קניון עזריאלי", category: "זכוכית", item: "זכוכית למינציה 12+12 כחול", qty: 85, unit: "יח׳", requiredDate: "2026-05-10", urgency: 4, status: "approved", linkedTask: "הרכבת חזית בלוק A", unitPrice: 980, supplier: "גארדיאן ישראל", eta: "2026-05-05" },
  { id: "PR-2004", projectId: "EX-1002", project: "זכוכית חזיתית — קניון עזריאלי", category: "אלומיניום", item: "מולטים תרמיים 60 מ\"מ", qty: 200, unit: "מטר", requiredDate: "2026-05-01", urgency: 3, status: "ordered", linkedTask: "הרכבת שלד חזית", unitPrice: 145, supplier: "אלופרופיל בע\"מ", eta: "2026-04-28", receivedQty: 0 },
  { id: "PR-2005", projectId: "EX-1003", project: "דלתות פלדה — בית ספר אורט", category: "פלדה", item: "פלדת גלוון 1.5 מ\"מ", qty: 60, unit: "גיליון", requiredDate: "2026-05-15", urgency: 3, status: "quoted", linkedTask: "חיתוך דלתות אש", unitPrice: 420 },
  { id: "PR-2006", projectId: "EX-1003", project: "דלתות פלדה — בית ספר אורט", category: "אביזרים", item: "צירי כבדים — דלת אש", qty: 180, unit: "יח׳", requiredDate: "2026-05-20", urgency: 2, status: "requested", linkedTask: "הרכבת דלתות", unitPrice: 65 },
  { id: "PR-2007", projectId: "EX-1004", project: "מעקות בטיחות — שיכון נוף", category: "פלדה", item: "צינור נירוסטה 42 מ\"מ", qty: 350, unit: "מטר", requiredDate: "2026-06-01", urgency: 2, status: "draft", linkedTask: "ייצור מעקות", unitPrice: 110 },
  { id: "PR-2008", projectId: "EX-1004", project: "מעקות בטיחות — שיכון נוף", category: "זכוכית", item: "זכוכית מחוסמת 10 מ\"מ ליפוף", qty: 90, unit: "יח׳", requiredDate: "2026-06-10", urgency: 2, status: "draft", linkedTask: "הרכבת זכוכית מעקות", unitPrice: 450 },
  { id: "PR-2009", projectId: "EX-1005", project: "פרגולות מתכת — סינמה סיטי", category: "פלדה", item: "קורות IPE 140", qty: 24, unit: "יח׳", requiredDate: "2026-04-10", urgency: 5, status: "received", linkedTask: "הרכבת שלד פרגולה", unitPrice: 780, supplier: "ברזל עוז", eta: "2026-04-08", receivedQty: 24 },
  { id: "PR-2010", projectId: "EX-1005", project: "פרגולות מתכת — סינמה סיטי", category: "אביזרים", item: "בורגי עוגן M16", qty: 96, unit: "יח׳", requiredDate: "2026-04-12", urgency: 4, status: "partial", linkedTask: "עיגון פרגולה", unitPrice: 28, supplier: "מחסני ברגים", eta: "2026-04-11", receivedQty: 64 },
  { id: "PR-2011", projectId: "EX-1006", project: "שערי חניון — מגדל רמת גן", category: "אלומיניום", item: "לוחות אלומיניום 3 מ\"מ", qty: 40, unit: "גיליון", requiredDate: "2026-04-05", urgency: 5, status: "received", linkedTask: "חיפוי שערים", unitPrice: 350, supplier: "אלונירים", eta: "2026-04-03", receivedQty: 40 },
  { id: "PR-2012", projectId: "EX-1006", project: "שערי חניון — מגדל רמת גן", category: "אלקטרוניקה", item: "מנוע שער חשמלי 1.5HP", qty: 4, unit: "יח׳", requiredDate: "2026-04-04", urgency: 5, status: "received", linkedTask: "התקנת מנוע שער", unitPrice: 4200, supplier: "FAAC ישראל", eta: "2026-04-02", receivedQty: 4 },
  { id: "PR-2013", projectId: "EX-1008", project: "קירות מסך — משרדים הרצליה", category: "אלומיניום", item: "מערכת קירות מסך SG-50", qty: 600, unit: "מטר", requiredDate: "2026-05-20", urgency: 4, status: "ordered", linkedTask: "הרכבת שלד קירות מסך", unitPrice: 210, supplier: "שוקו אלומיניום", eta: "2026-05-18", receivedQty: 0 },
  { id: "PR-2014", projectId: "EX-1008", project: "קירות מסך — משרדים הרצליה", category: "זכוכית", item: "זכוכית Low-E בידוד 6+12+6", qty: 280, unit: "יח׳", requiredDate: "2026-05-25", urgency: 3, status: "quoted", linkedTask: "הרכבת זכוכית מסך", unitPrice: 650 },
  { id: "PR-2015", projectId: "EX-1007", project: "חלונות עץ-אלומיניום — וילה פרטית", category: "עץ", item: "עץ אורן מעובד לחלונות", qty: 45, unit: "מטר", requiredDate: "2026-07-01", urgency: 1, status: "draft", linkedTask: "ייצור מסגרות עץ", unitPrice: 190, supplier: undefined, eta: undefined, receivedQty: undefined },
];

/* budget by project */
const FALLBACK_PROJECT_BUDGETS: Record<string, { budget: number }> = {
  "EX-1001": { budget: 920000 },
  "EX-1002": { budget: 1450000 },
  "EX-1003": { budget: 380000 },
  "EX-1004": { budget: 260000 },
  "EX-1005": { budget: 185000 },
  "EX-1006": { budget: 410000 },
  "EX-1007": { budget: 145000 },
  "EX-1008": { budget: 2100000 },
};

/* helpers */
const fmt = (n: number) => "₪" + new Intl.NumberFormat("he-IL").format(n);
const fmtNum = (n: number) => new Intl.NumberFormat("he-IL").format(n);

const statusLabels: Record<ProcStatus, string> = {
  draft: "טיוטה", requested: "נדרש", quoted: "הוצעה הצעה", approved: "מאושר",
  ordered: "הוזמן", received: "התקבל", partial: "התקבל חלקית", cancelled: "בוטל",
};
const statusColors: Record<ProcStatus, string> = {
  draft: "bg-slate-500/20 text-slate-400",
  requested: "bg-blue-500/20 text-blue-400",
  quoted: "bg-purple-500/20 text-purple-400",
  approved: "bg-cyan-500/20 text-cyan-400",
  ordered: "bg-amber-500/20 text-amber-400",
  received: "bg-emerald-500/20 text-emerald-400",
  partial: "bg-yellow-500/20 text-yellow-400",
  cancelled: "bg-red-500/20 text-red-400",
};
const urgencyColors = ["", "text-slate-400", "text-blue-400", "text-yellow-400", "text-orange-400", "text-red-400"];
const urgencyLabels = ["", "נמוכה מאוד", "נמוכה", "בינונית", "גבוהה", "דחופה"];

export default function ProjectProcurementHub() {
  const [tab, setTab] = useState("requests");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProcStatus | "all">("all");

  const { data: apiProc } = useQuery({
    queryKey: ["project-procurement-hub"],
    queryFn: async () => { const r = await authFetch("/api/projects/procurement"); return r.json(); },
  });
  const requests: ProcRequest[] = apiProc?.requests ?? apiProc?.data?.requests ?? FALLBACK_PROC_REQUESTS;
  const projectBudgets: Record<string, { budget: number }> = apiProc?.projectBudgets ?? apiProc?.data?.projectBudgets ?? FALLBACK_PROJECT_BUDGETS;

  /* KPIs */
  const totalRequests = requests.length;
  const pendingApproval = requests.filter(r => ["draft", "requested", "quoted"].includes(r.status)).length;
  const ordered = requests.filter(r => r.status === "ordered").length;
  const received = requests.filter(r => r.status === "received").length;
  const overdue = requests.filter(r => {
    if (["received", "cancelled"].includes(r.status)) return false;
    return new Date(r.requiredDate) < new Date("2026-04-08");
  }).length;
  const totalValue = requests.reduce((s, r) => s + r.qty * r.unitPrice, 0);

  const kpis = [
    { label: "סה\"כ בקשות", value: fmtNum(totalRequests), icon: ClipboardList, color: "text-blue-400" },
    { label: "ממתינות לאישור", value: fmtNum(pendingApproval), icon: Clock, color: "text-purple-400" },
    { label: "הוזמנו", value: fmtNum(ordered), icon: ShoppingCart, color: "text-amber-400" },
    { label: "התקבלו", value: fmtNum(received), icon: PackageCheck, color: "text-emerald-400" },
    { label: "באיחור", value: fmtNum(overdue), icon: AlertTriangle, color: "text-red-400" },
    { label: "ערך כולל", value: fmt(totalValue), icon: Banknote, color: "text-cyan-400" },
  ];

  /* filtered requests */
  const filtered = useMemo(() => {
    let res = requests;
    if (statusFilter !== "all") res = res.filter(r => r.status === statusFilter);
    if (search) {
      const s = search.toLowerCase();
      res = res.filter(r =>
        r.id.toLowerCase().includes(s) || r.project.includes(s) || r.item.includes(s) ||
        r.category.includes(s) || r.linkedTask.includes(s) || (r.supplier || "").includes(s)
      );
    }
    return res;
  }, [search, statusFilter]);

  /* grouped by project */
  const byProject = useMemo(() => {
    const map = new Map<string, { projectId: string; project: string; items: ProcRequest[]; totalValue: number; count: number }>();
    requests.forEach(r => {
      if (!map.has(r.projectId)) map.set(r.projectId, { projectId: r.projectId, project: r.project, items: [], totalValue: 0, count: 0 });
      const g = map.get(r.projectId)!;
      g.items.push(r);
      g.totalValue += r.qty * r.unitPrice;
      g.count++;
    });
    return Array.from(map.values()).sort((a, b) => b.totalValue - a.totalValue);
  }, []);

  /* delivery tracking */
  const deliveries = useMemo(() =>
    requests.filter(r => ["ordered", "partial"].includes(r.status)).sort((a, b) =>
      (a.eta || "").localeCompare(b.eta || "")
    ), []);

  /* budget impact */
  const budgetImpact = useMemo(() => {
    const map = new Map<string, { projectId: string; project: string; budget: number; procSpend: number }>();
    requests.forEach(r => {
      if (!map.has(r.projectId)) {
        const b = projectBudgets[r.projectId]?.budget || 0;
        map.set(r.projectId, { projectId: r.projectId, project: r.project, budget: b, procSpend: 0 });
      }
      if (!["cancelled", "draft"].includes(r.status)) {
        map.get(r.projectId)!.procSpend += r.qty * r.unitPrice;
      }
    });
    return Array.from(map.values()).sort((a, b) => (b.procSpend / b.budget) - (a.procSpend / a.budget));
  }, []);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <ShoppingCart className="w-7 h-7 text-blue-400" /> מרכז רכש פרויקטים
        </h1>
        <p className="text-sm text-slate-400 mt-1">טכנו-כל עוזי — ניהול בקשות רכש, מעקב הזמנות ותקציב חומרים</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map(k => (
          <Card key={k.label} className="bg-[#1e293b] border-slate-700">
            <CardContent className="p-4 flex items-center gap-3">
              <k.icon className={`w-8 h-8 ${k.color}`} />
              <div>
                <p className="text-2xl font-bold text-white">{k.value}</p>
                <p className="text-xs text-slate-400">{k.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-[#1e293b] border border-slate-700">
          <TabsTrigger value="requests">בקשות רכש</TabsTrigger>
          <TabsTrigger value="byProject">לפי פרויקט</TabsTrigger>
          <TabsTrigger value="delivery">מעקב אספקה</TabsTrigger>
          <TabsTrigger value="budget">השפעת תקציב</TabsTrigger>
        </TabsList>

        {/* ─── Tab 1: Procurement Requests ─── */}
        <TabsContent value="requests" className="space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
                placeholder="חיפוש לפי פריט, פרויקט, ספק..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pr-10 bg-[#1e293b] border-slate-700 text-white"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400" />
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as ProcStatus | "all")}
                className="bg-[#1e293b] border border-slate-700 text-white text-sm rounded px-3 py-2"
              >
                <option value="all">כל הסטטוסים</option>
                {Object.entries(statusLabels).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <Button variant="outline" size="sm" className="border-slate-600 text-slate-300">
              <FileText className="w-4 h-4 ml-1" /> ייצוא
            </Button>
          </div>

          <Card className="bg-[#1e293b] border-slate-700">
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-400 text-xs">
                    {["מס׳", "פרויקט", "קטגוריה", "פריט", "כמות", "יח׳", "תאריך נדרש", "דחיפות", "סטטוס", "ערך", "משימה"].map(h => (
                      <th key={h} className="px-3 py-3 text-right font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => {
                    const isOverdue = !["received", "cancelled"].includes(r.status) && new Date(r.requiredDate) < new Date("2026-04-08");
                    return (
                      <tr key={r.id} className="border-b border-slate-700/50 hover:bg-slate-800/40 transition-colors">
                        <td className="px-3 py-2.5 text-slate-300 font-mono text-xs">{r.id}</td>
                        <td className="px-3 py-2.5 text-white font-medium text-xs max-w-[180px] truncate">{r.project}</td>
                        <td className="px-3 py-2.5 text-slate-300 text-xs">{r.category}</td>
                        <td className="px-3 py-2.5 text-white text-xs">{r.item}</td>
                        <td className="px-3 py-2.5 text-slate-300 text-xs">{fmtNum(r.qty)}</td>
                        <td className="px-3 py-2.5 text-slate-400 text-xs">{r.unit}</td>
                        <td className={`px-3 py-2.5 text-xs ${isOverdue ? "text-red-400 font-bold" : "text-slate-300"}`}>
                          {r.requiredDate}{isOverdue && " ⚠"}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`text-xs font-bold ${urgencyColors[r.urgency]}`}>
                            {"●".repeat(r.urgency)} {urgencyLabels[r.urgency]}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge className={`${statusColors[r.status]} text-xs`}>{statusLabels[r.status]}</Badge>
                        </td>
                        <td className="px-3 py-2.5 text-slate-300 text-xs">{fmt(r.qty * r.unitPrice)}</td>
                        <td className="px-3 py-2.5 text-slate-400 text-xs max-w-[140px] truncate">{r.linkedTask}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <p className="text-center text-slate-500 py-8">לא נמצאו בקשות רכש</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Tab 2: By Project ─── */}
        <TabsContent value="byProject" className="space-y-4">
          {byProject.map(g => {
            const statusCounts = g.items.reduce((acc, r) => {
              acc[r.status] = (acc[r.status] || 0) + 1;
              return acc;
            }, {} as Record<string, number>);
            const receivedCount = g.items.filter(r => r.status === "received").length;
            const pct = Math.round((receivedCount / g.count) * 100);

            return (
              <Card key={g.projectId} className="bg-[#1e293b] border-slate-700">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-white text-base flex items-center gap-2">
                      <Building2 className="w-5 h-5 text-blue-400" />
                      {g.projectId} — {g.project}
                    </CardTitle>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-slate-400">{g.count} בקשות</span>
                      <span className="text-cyan-400 font-bold">{fmt(g.totalValue)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    <Progress value={pct} className="h-2 flex-1" />
                    <span className="text-xs text-slate-400">{pct}% התקבלו</span>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {Object.entries(statusCounts).map(([st, cnt]) => (
                      <Badge key={st} className={`${statusColors[st as ProcStatus]} text-xs`}>
                        {statusLabels[st as ProcStatus]} ({cnt})
                      </Badge>
                    ))}
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-700/50 text-slate-500">
                        {["מס׳", "קטגוריה", "פריט", "כמות", "דחיפות", "סטטוס", "ערך"].map(h => (
                          <th key={h} className="px-2 py-2 text-right font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {g.items.map(r => (
                        <tr key={r.id} className="border-b border-slate-800/50">
                          <td className="px-2 py-2 text-slate-400 font-mono">{r.id}</td>
                          <td className="px-2 py-2 text-slate-300">{r.category}</td>
                          <td className="px-2 py-2 text-white">{r.item}</td>
                          <td className="px-2 py-2 text-slate-300">{fmtNum(r.qty)} {r.unit}</td>
                          <td className="px-2 py-2">
                            <span className={`font-bold ${urgencyColors[r.urgency]}`}>{"●".repeat(r.urgency)}</span>
                          </td>
                          <td className="px-2 py-2">
                            <Badge className={`${statusColors[r.status]} text-[10px]`}>{statusLabels[r.status]}</Badge>
                          </td>
                          <td className="px-2 py-2 text-slate-300">{fmt(r.qty * r.unitPrice)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        {/* ─── Tab 3: Delivery Tracking ─── */}
        <TabsContent value="delivery" className="space-y-4">
          <Card className="bg-[#1e293b] border-slate-700">
            <CardHeader>
              <CardTitle className="text-white text-base flex items-center gap-2">
                <Truck className="w-5 h-5 text-amber-400" /> מעקב אספקת הזמנות
              </CardTitle>
            </CardHeader>
            <CardContent>
              {deliveries.length === 0 ? (
                <p className="text-center text-slate-500 py-8">אין הזמנות פתוחות לאספקה</p>
              ) : (
                <div className="space-y-3">
                  {deliveries.map(r => {
                    const recPct = r.receivedQty !== undefined ? Math.round((r.receivedQty / r.qty) * 100) : 0;
                    const etaDate = r.eta ? new Date(r.eta) : null;
                    const isLate = etaDate && etaDate < new Date("2026-04-08") && recPct < 100;

                    return (
                      <div key={r.id} className="bg-slate-800/60 rounded-lg p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-white font-bold text-sm">{r.id}</span>
                              <Badge className={`${statusColors[r.status]} text-xs`}>{statusLabels[r.status]}</Badge>
                              {isLate && <Badge className="bg-red-500/20 text-red-400 text-xs">באיחור</Badge>}
                            </div>
                            <p className="text-slate-300 text-sm mt-1">{r.item}</p>
                            <p className="text-slate-500 text-xs mt-0.5">{r.project}</p>
                          </div>
                          <div className="text-left">
                            <p className="text-xs text-slate-400">ספק</p>
                            <p className="text-sm text-white font-medium">{r.supplier || "—"}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                          <div>
                            <span className="text-slate-500">הוזמן</span>
                            <p className="text-white font-medium">{fmtNum(r.qty)} {r.unit}</p>
                          </div>
                          <div>
                            <span className="text-slate-500">התקבל</span>
                            <p className={`font-medium ${recPct === 100 ? "text-emerald-400" : "text-amber-400"}`}>
                              {fmtNum(r.receivedQty || 0)} {r.unit}
                            </p>
                          </div>
                          <div>
                            <span className="text-slate-500">ETA</span>
                            <p className={`font-medium ${isLate ? "text-red-400" : "text-white"}`}>{r.eta || "—"}</p>
                          </div>
                          <div>
                            <span className="text-slate-500">ערך</span>
                            <p className="text-cyan-400 font-medium">{fmt(r.qty * r.unitPrice)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Progress value={recPct} className="h-2 flex-1" />
                          <span className={`text-xs font-bold ${recPct === 100 ? "text-emerald-400" : recPct > 0 ? "text-amber-400" : "text-slate-400"}`}>
                            {recPct}%
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* delivery summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-[#1e293b] border-slate-700">
              <CardContent className="p-4 text-center">
                <Package className="w-8 h-8 text-amber-400 mx-auto mb-2" />
                <p className="text-2xl font-bold text-white">{deliveries.length}</p>
                <p className="text-xs text-slate-400">הזמנות בדרך</p>
              </CardContent>
            </Card>
            <Card className="bg-[#1e293b] border-slate-700">
              <CardContent className="p-4 text-center">
                <CalendarClock className="w-8 h-8 text-red-400 mx-auto mb-2" />
                <p className="text-2xl font-bold text-white">{deliveries.filter(r => r.eta && new Date(r.eta) < new Date("2026-04-08") && (r.receivedQty || 0) < r.qty).length}</p>
                <p className="text-xs text-slate-400">באיחור</p>
              </CardContent>
            </Card>
            <Card className="bg-[#1e293b] border-slate-700">
              <CardContent className="p-4 text-center">
                <CircleDollarSign className="w-8 h-8 text-cyan-400 mx-auto mb-2" />
                <p className="text-2xl font-bold text-white">{fmt(deliveries.reduce((s, r) => s + r.qty * r.unitPrice, 0))}</p>
                <p className="text-xs text-slate-400">ערך הזמנות פתוחות</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ─── Tab 4: Budget Impact ─── */}
        <TabsContent value="budget" className="space-y-4">
          <Card className="bg-[#1e293b] border-slate-700">
            <CardHeader>
              <CardTitle className="text-white text-base flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-cyan-400" /> השפעת רכש על תקציב פרויקטים
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {budgetImpact.map(b => {
                const pct = b.budget > 0 ? Math.round((b.procSpend / b.budget) * 100) : 0;
                const remaining = b.budget - b.procSpend;
                const isOver = remaining < 0;
                const barColor = pct > 90 ? "bg-red-500" : pct > 70 ? "bg-amber-500" : "bg-emerald-500";
                const textColor = pct > 90 ? "text-red-400" : pct > 70 ? "text-amber-400" : "text-emerald-400";

                return (
                  <div key={b.projectId} className="bg-slate-800/60 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-white font-bold text-sm">{b.projectId} — {b.project}</p>
                      </div>
                      <Badge className={`${pct > 90 ? "bg-red-500/20 text-red-400" : pct > 70 ? "bg-amber-500/20 text-amber-400" : "bg-emerald-500/20 text-emerald-400"} text-xs`}>
                        {pct}% ניצול
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-xs">
                      <div>
                        <span className="text-slate-500">תקציב פרויקט</span>
                        <p className="text-white font-medium">{fmt(b.budget)}</p>
                      </div>
                      <div>
                        <span className="text-slate-500">הוצאות רכש</span>
                        <p className="text-cyan-400 font-medium">{fmt(b.procSpend)}</p>
                      </div>
                      <div>
                        <span className="text-slate-500">יתרה</span>
                        <p className={`font-medium ${isOver ? "text-red-400" : "text-emerald-400"}`}>
                          {isOver ? "-" : ""}{fmt(Math.abs(remaining))}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-3 bg-slate-700 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                      <span className={`text-xs font-bold ${textColor}`}>{pct}%</span>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* budget summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-[#1e293b] border-slate-700">
              <CardContent className="p-4 text-center">
                <Banknote className="w-8 h-8 text-blue-400 mx-auto mb-2" />
                <p className="text-2xl font-bold text-white">
                  {fmt(budgetImpact.reduce((s, b) => s + b.budget, 0))}
                </p>
                <p className="text-xs text-slate-400">סה״כ תקציב כל הפרויקטים</p>
              </CardContent>
            </Card>
            <Card className="bg-[#1e293b] border-slate-700">
              <CardContent className="p-4 text-center">
                <ShoppingCart className="w-8 h-8 text-cyan-400 mx-auto mb-2" />
                <p className="text-2xl font-bold text-white">
                  {fmt(budgetImpact.reduce((s, b) => s + b.procSpend, 0))}
                </p>
                <p className="text-xs text-slate-400">סה״כ הוצאות רכש</p>
              </CardContent>
            </Card>
            <Card className="bg-[#1e293b] border-slate-700">
              <CardContent className="p-4 text-center">
                <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                <p className="text-2xl font-bold text-white">
                  {Math.round(budgetImpact.reduce((s, b) => s + b.procSpend, 0) / budgetImpact.reduce((s, b) => s + b.budget, 0) * 100)}%
                </p>
                <p className="text-xs text-slate-400">ממוצע ניצול תקציב רכש</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
