import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp, Scale, Droplets, BookOpen, ChevronLeft, ChevronDown, ChevronRight,
  DollarSign, ArrowUpRight, ArrowDownRight, FileDown, Printer
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { authJson } from "@/lib/utils";
import PeriodFilter, { usePeriodFilter, exportPDF } from "./components/period-filter";
import { LoadingOverlay } from "@/components/ui/unified-states";

function exportCSV(data: any[], filename: string) {
  if (!data?.length) return;
  const keys = Object.keys(data[0]);
  const rows = [keys.join(","), ...data.map(r => keys.map(k => JSON.stringify(r[k] ?? "")).join(","))];
  const blob = new Blob(["\uFEFF" + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

const API = "/api";
const fmt = (v: number) => Math.abs(v).toLocaleString("he-IL", { minimumFractionDigits: 0 });
const fmtSign = (v: number) => (v < 0 ? "-" : "") + "₪" + fmt(v);
const pct = (v: number) => (v > 0 ? "+" : "") + v.toFixed(1) + "%";

type ReportTab = "pl" | "balance" | "cashflow" | "trial";

function StatCard({ label, value, change, color = "blue" }: { label: string; value: number; change?: number; color?: string }) {
  const colors: Record<string, string> = {
    blue: "from-blue-500/10 to-blue-600/5 border-blue-500/20 text-blue-400",
    green: "from-green-500/10 to-green-600/5 border-green-500/20 text-green-400",
    red: "from-red-500/10 to-red-600/5 border-red-500/20 text-red-400",
    amber: "from-amber-500/10 to-amber-600/5 border-amber-500/20 text-amber-400",
  };
  return (
    <Card className={`bg-gradient-to-br ${colors[color]} border`}>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <p className="text-xl font-bold text-foreground">{fmtSign(value)}</p>
        {change !== undefined && (
          <div className="flex items-center gap-1 mt-1">
            {change >= 0 ? <ArrowUpRight className="w-3 h-3 text-green-400" /> : <ArrowDownRight className="w-3 h-3 text-red-400" />}
            <span className={`text-xs ${change >= 0 ? "text-green-400" : "text-red-400"}`}>{pct(change)} לעומת תקופה מקבילה</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ExpandableSection({ title, lines, total, priorTotal, onDrillDown, prevYear }: {
  title: string; lines: any[]; total: number; priorTotal: number; onDrillDown: (line: any) => void; prevYear?: string;
}) {
  const [expanded, setExpanded] = useState(true);
  const change = priorTotal > 0 ? Math.round(((total - priorTotal) / priorTotal) * 1000) / 10 : 0;
  const showPrior = lines.some((l: any) => l.prior > 0) || priorTotal > 0;

  return (
    <div className="border border-slate-700/50 rounded-xl overflow-hidden mb-3">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-800/60 hover:bg-slate-800/80 transition-colors"
      >
        <span className="font-semibold text-foreground text-sm">{title}</span>
        <div className="flex items-center gap-4">
          {showPrior && <span className="text-xs text-slate-500">₪{fmt(priorTotal)}</span>}
          <span className="text-sm font-bold text-foreground">₪{fmt(total)}</span>
          {priorTotal > 0 && (
            <Badge className={`text-[10px] ${change >= 0 ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
              {pct(change)}
            </Badge>
          )}
          {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>
      {expanded && (
        <>
          {showPrior && (
            <div className="grid grid-cols-3 text-xs text-muted-foreground px-4 py-1.5 bg-slate-900/40 border-b border-slate-700/30">
              <span>שורה</span>
              <span className="text-right">{prevYear || "שנה קודמת"}</span>
              <span className="text-right">שנה נוכחית</span>
            </div>
          )}
          <div className="divide-y divide-slate-700/30">
            {lines.map((line, idx) => {
              const lineChange = line.prior > 0 ? Math.round(((line.current - line.prior) / line.prior) * 1000) / 10 : null;
              return (
                <div key={idx} className="grid grid-cols-3 items-center px-4 py-2.5 hover:bg-slate-800/30 transition-colors group">
                  <button
                    onClick={() => onDrillDown(line)}
                    className="text-sm text-slate-300 hover:text-foreground flex items-center gap-1 text-right col-span-1"
                  >
                    {line.label}
                    <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 text-primary transition-opacity" />
                  </button>
                  <span className="text-sm text-slate-500 text-right">{line.prior > 0 ? `₪${fmt(line.prior)}` : "—"}</span>
                  <div className="flex items-center justify-end gap-2">
                    <span className="text-sm font-medium text-foreground">₪{fmt(line.current)}</span>
                    {lineChange !== null && (
                      <Badge className={`text-[10px] ${lineChange >= 0 ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                        {pct(lineChange)}
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function PLReport() {
  const pf = usePeriodFilter();
  const [drillDown, setDrillDown] = useState<any>(null);
  const [drillData, setDrillData] = useState<any>(null);
  const [drillLoading, setDrillLoading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["bi-pl", ...pf.queryKey],
    queryFn: () => authJson(`${API}/reports-center/bi/profit-loss?${pf.buildQueryParams()}`).catch(() => null),
  });

  const handleDrillDown = async (line: any) => {
    setDrillDown(line);
    setDrillLoading(true);
    try {
      const url = line.drillDown.replace("/reports-center", `${API}/reports-center`);
      const result = await authJson(url);
      setDrillData(result);
    } catch { setDrillData(null); }
    setDrillLoading(false);
  };

  if (isLoading) return <LoadingOverlay className="min-h-[200px]" />;

  const s = data?.summary || {};

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label={'סה"כ הכנסות'} value={s.totalIncome || 0} change={s.incomeChange} color="green" />
        <StatCard label={'סה"כ הוצאות'} value={s.totalExpenses || 0} change={s.expenseChange} color="red" />
        <StatCard label="רווח גולמי" value={s.grossProfit || 0} change={s.profitChange} color={s.grossProfit >= 0 ? "green" : "red"} />
        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20 border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">שולי רווח</p>
            <p className="text-xl font-bold text-foreground">{(s.profitMargin || 0).toFixed(1)}%</p>
          </CardContent>
        </Card>
      </div>

      {data?.sections?.map((section: any, idx: number) => (
        <ExpandableSection
          key={idx}
          title={section.title}
          lines={section.lines}
          total={section.total}
          priorTotal={section.priorTotal}
          onDrillDown={handleDrillDown}
          prevYear={data?.startDate ? String(parseInt(data.startDate.slice(0, 4)) - 1) : undefined}
        />
      ))}

      <div className="border border-slate-600/50 rounded-xl p-4 bg-slate-800/30">
        <div className="flex items-center justify-between">
          <span className="font-bold text-foreground text-base">רווח נקי</span>
          <span className={`text-xl font-bold ${(s.grossProfit || 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
            {fmtSign(s.grossProfit || 0)}
          </span>
        </div>
      </div>

      {drillDown && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setDrillDown(null)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-700 flex justify-between items-center">
              <h3 className="font-bold text-foreground">פירוט: {drillDown.label}</h3>
              <button onClick={() => setDrillDown(null)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="p-4">
              {drillLoading ? <LoadingOverlay className="min-h-[80px]" /> :
                drillData?.rows?.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-700 text-muted-foreground text-xs">
                          <th className="text-right py-2 px-3">תאריך</th>
                          <th className="text-right py-2 px-3">לקוח/ספק</th>
                          <th className="text-right py-2 px-3">מספר מסמך</th>
                          <th className="text-right py-2 px-3">סכום</th>
                          <th className="text-right py-2 px-3">סטטוס</th>
                        </tr>
                      </thead>
                      <tbody>
                        {drillData.rows.map((row: any, i: number) => (
                          <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                            <td className="py-2 px-3 text-slate-300">{row.invoice_date || row.expense_date || "—"}</td>
                            <td className="py-2 px-3 text-foreground">{row.customer_name || row.supplier_name || "—"}</td>
                            <td className="py-2 px-3 text-slate-400">{row.invoice_number || row.expense_number || "—"}</td>
                            <td className="py-2 px-3 text-foreground font-medium">₪{fmt(Number(row.amount || 0))}</td>
                            <td className="py-2 px-3"><Badge className="text-[10px]">{row.status}</Badge></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <p className="text-center text-muted-foreground py-8">אין נתונים לפירוט</p>
              }
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BalanceSheetReport() {
  const pf = usePeriodFilter();
  const [drillSection, setDrillSection] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["bi-balance", ...pf.queryKey],
    queryFn: () => authJson(`${API}/reports-center/bi/balance-sheet?${pf.buildQueryParams()}`).catch(() => null),
  });
  const { data: drillData, isLoading: drillLoading } = useQuery({
    queryKey: ["bi-balance-drill", drillSection],
    queryFn: () => drillSection ? authJson(`${API}/reports-center/bi/drill-down/balance-sheet?section=${drillSection}`).catch(() => null) : null,
    enabled: !!drillSection,
  });

  if (isLoading) return <LoadingOverlay className="min-h-[200px]" />;

  const a = data?.assets || {};
  const l = data?.liabilities || {};
  const e = data?.equity || {};
  const prevYear = data?.prevYear || "";

  const drillLabel: Record<string, string> = { ar: "חייבים (AR)", ap: "ספקים (AP)", cash: "מזומן", fixed_assets: "רכוש קבוע" };

  return (
    <div className="space-y-4">
      {drillSection && (
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
          <div className="flex justify-between items-center mb-3">
            <h4 className="font-semibold text-foreground">פירוט: {drillLabel[drillSection]}</h4>
            <button onClick={() => setDrillSection(null)} className="text-xs text-muted-foreground hover:text-foreground">✕ סגור</button>
          </div>
          {drillLoading ? <LoadingOverlay className="min-h-[80px]" /> : (
            <div className="overflow-x-auto max-h-60">
              <table className="w-full text-xs">
                <tbody>
                  {(drillData?.rows || []).slice(0, 50).map((row: any, i: number) => (
                    <tr key={i} className="border-b border-slate-800/50">
                      {Object.entries(row).slice(0, 6).map(([k, v]) => (
                        <td key={k} className="py-1.5 px-2 text-slate-300">{String(v ?? "—")}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Scale className="w-5 h-5 text-blue-400" />
            <h3 className="font-bold text-foreground">נכסים</h3>
            <Badge className="bg-blue-500/20 text-blue-400 text-[10px]">₪{fmt(a.total || 0)}</Badge>
            {prevYear && <Badge className="bg-slate-700/50 text-slate-400 text-[10px]">השוואה {prevYear}</Badge>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-slate-700/50">
                  <th className="text-right py-2 px-2">שם</th>
                  <th className="text-right py-2 px-2">שנה נוכחית</th>
                  <th className="text-right py-2 px-2">{prevYear || "שנה קודמת"}</th>
                </tr>
              </thead>
              <tbody>
                <tr><td colSpan={3} className="py-1.5 px-2 text-xs text-muted-foreground font-medium">נכסים שוטפים</td></tr>
                {a.current?.map((item: any, i: number) => (
                  <tr key={i} className="border-b border-slate-800/40 hover:bg-slate-800/20">
                    <td className="py-2 px-2">
                      <button
                        onClick={() => setDrillSection(item.label?.includes("AR") || item.label?.includes("חייבים") ? "ar" : item.label?.includes("מזומן") ? "cash" : null!)}
                        className="text-slate-300 hover:text-blue-400 hover:underline text-right"
                      >{item.label}</button>
                    </td>
                    <td className="py-2 px-2 text-foreground font-medium">₪{fmt(item.amount)}</td>
                    <td className="py-2 px-2 text-slate-400">{item.prior > 0 ? `₪${fmt(item.prior)}` : "—"}</td>
                  </tr>
                ))}
                <tr className="bg-blue-500/10 font-semibold">
                  <td className="py-2 px-2 text-blue-400">סה"כ שוטף</td>
                  <td className="py-2 px-2 text-foreground">₪{fmt(a.totalCurrent || 0)}</td>
                  <td className="py-2 px-2 text-slate-400">{a.prevTotalCurrent > 0 ? `₪${fmt(a.prevTotalCurrent)}` : "—"}</td>
                </tr>
                <tr><td colSpan={3} className="py-1.5 px-2 text-xs text-muted-foreground font-medium">נכסים קבועים</td></tr>
                {a.nonCurrent?.map((item: any, i: number) => (
                  <tr key={i} className="border-b border-slate-800/40 hover:bg-slate-800/20">
                    <td className="py-2 px-2">
                      <button onClick={() => setDrillSection("fixed_assets")} className="text-slate-300 hover:text-blue-400 hover:underline text-right">{item.label}</button>
                    </td>
                    <td className="py-2 px-2 text-foreground font-medium">₪{fmt(item.amount)}</td>
                    <td className="py-2 px-2 text-slate-400">{item.prior > 0 ? `₪${fmt(item.prior)}` : "—"}</td>
                  </tr>
                ))}
                <tr className="bg-blue-500/20 font-bold">
                  <td className="py-2 px-2 text-blue-300">סה"כ נכסים</td>
                  <td className="py-2 px-2 text-foreground">₪{fmt(a.total || 0)}</td>
                  <td className="py-2 px-2 text-slate-400">—</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-3">
            <Scale className="w-5 h-5 text-red-400" />
            <h3 className="font-bold text-foreground">התחייבויות והון עצמי</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-slate-700/50">
                  <th className="text-right py-2 px-2">שם</th>
                  <th className="text-right py-2 px-2">שנה נוכחית</th>
                  <th className="text-right py-2 px-2">{prevYear || "שנה קודמת"}</th>
                </tr>
              </thead>
              <tbody>
                <tr><td colSpan={3} className="py-1.5 px-2 text-xs text-muted-foreground font-medium">התחייבויות שוטפות</td></tr>
                {l.current?.map((item: any, i: number) => (
                  <tr key={i} className="border-b border-slate-800/40 hover:bg-slate-800/20">
                    <td className="py-2 px-2">
                      <button onClick={() => setDrillSection("ap")} className="text-slate-300 hover:text-red-400 hover:underline text-right">{item.label}</button>
                    </td>
                    <td className="py-2 px-2 text-foreground font-medium">₪{fmt(item.amount)}</td>
                    <td className="py-2 px-2 text-slate-400">{item.prior > 0 ? `₪${fmt(item.prior)}` : "—"}</td>
                  </tr>
                ))}
                <tr className="bg-red-500/10 font-semibold">
                  <td className="py-2 px-2 text-red-400">סה"כ שוטף</td>
                  <td className="py-2 px-2 text-foreground">₪{fmt(l.totalCurrent || 0)}</td>
                  <td className="py-2 px-2 text-slate-400">{l.prevTotalCurrent > 0 ? `₪${fmt(l.prevTotalCurrent)}` : "—"}</td>
                </tr>
                <tr><td colSpan={3} className="py-1.5 px-2 text-xs text-muted-foreground font-medium">התחייבויות ל"א</td></tr>
                {l.longTerm?.map((item: any, i: number) => (
                  <tr key={i} className="border-b border-slate-800/40">
                    <td className="py-2 px-2 text-slate-300">{item.label}</td>
                    <td className="py-2 px-2 text-foreground font-medium">₪{fmt(item.amount)}</td>
                    <td className="py-2 px-2 text-slate-400">{item.prior > 0 ? `₪${fmt(item.prior)}` : "—"}</td>
                  </tr>
                ))}
                <tr className="bg-red-500/10 font-semibold">
                  <td className="py-2 px-2 text-red-400">סה"כ התחייבויות</td>
                  <td className="py-2 px-2 text-foreground">₪{fmt(l.total || 0)}</td>
                  <td className="py-2 px-2 text-slate-400">—</td>
                </tr>
                <tr><td colSpan={3} className="py-1.5 px-2 text-xs text-muted-foreground font-medium">הון עצמי</td></tr>
                {e.lines?.map((item: any, i: number) => (
                  <tr key={i} className="border-b border-slate-800/40">
                    <td className="py-2 px-2 text-slate-300">{item.label}</td>
                    <td className="py-2 px-2 text-foreground font-medium">₪{fmt(item.amount)}</td>
                    <td className="py-2 px-2 text-slate-400">{item.prior > 0 ? `₪${fmt(item.prior)}` : "—"}</td>
                  </tr>
                ))}
                <tr className="border-b border-slate-800/40">
                  <td className="py-2 px-2 text-slate-300">רווחים שמורים</td>
                  <td className="py-2 px-2 text-foreground font-medium">₪{fmt(e.retainedEarnings || 0)}</td>
                  <td className="py-2 px-2 text-slate-400">₪{fmt(e.prevRetainedEarnings || 0)}</td>
                </tr>
                <tr className="bg-green-500/10 font-semibold">
                  <td className="py-2 px-2 text-green-400">סה"כ הון עצמי</td>
                  <td className="py-2 px-2 text-foreground">₪{fmt(e.total || 0)}</td>
                  <td className="py-2 px-2 text-slate-400">—</td>
                </tr>
                <tr className={`font-bold ${data?.balanced ? "bg-green-500/20" : "bg-red-500/20"}`}>
                  <td className={`py-2 px-2 ${data?.balanced ? "text-green-300" : "text-red-300"}`}>
                    {data?.balanced ? "✓ מאוזן" : "⚠ לא מאוזן"} — סה"כ
                  </td>
                  <td className="py-2 px-2 text-foreground">₪{fmt(data?.totalLiabilitiesAndEquity || 0)}</td>
                  <td className="py-2 px-2 text-slate-400">—</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function CashFlowReport() {
  const pf = usePeriodFilter();
  const { data, isLoading } = useQuery({
    queryKey: ["bi-cashflow", ...pf.queryKey],
    queryFn: () => authJson(`${API}/reports-center/bi/cash-flow?${pf.buildQueryParams()}`).catch(() => null),
  });

  if (isLoading) return <LoadingOverlay className="min-h-[200px]" />;

  const op = data?.operating || {};
  const monthly = data?.monthlyFlow || [];
  const wc = data?.workingCapital || {};

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="תקבולים מפעילות" value={op.cashIn || 0} color="green" />
        <StatCard label="תשלומים מפעילות" value={op.cashOut || 0} color="red" />
        <StatCard label="נטו מפעילות" value={op.net || 0} color={op.net >= 0 ? "green" : "red"} />
        <StatCard label="יתרת מזומן נוכחית" value={data?.closingBalance || 0} color="blue" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          { title: "פעילות שוטפת", cashIn: op.cashIn || 0, cashOut: op.cashOut || 0, net: op.net || 0, icon: DollarSign, color: "blue" },
          { title: "פעילות השקעה", cashIn: data?.investing?.assetDisposals || 0, cashOut: data?.investing?.assetPurchases || 0, net: data?.investing?.net || 0, icon: TrendingUp, color: "amber" },
          { title: "פעילות מימון", cashIn: data?.financing?.loanProceeds || 0, cashOut: data?.financing?.loanRepayments || 0, net: data?.financing?.net || 0, icon: Scale, color: "purple" },
        ].map((section, idx) => (
          <Card key={idx} className="bg-slate-900/50 border-slate-700/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <section.icon className="w-4 h-4 text-muted-foreground" />
                {section.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">תקבולים</span><span className="text-green-400">+₪{fmt(section.cashIn)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">תשלומים</span><span className="text-red-400">-₪{fmt(section.cashOut)}</span></div>
              <div className="flex justify-between text-sm font-bold border-t border-slate-700/50 pt-2">
                <span className="text-foreground">נטו</span>
                <span className={section.net >= 0 ? "text-green-400" : "text-red-400"}>{fmtSign(section.net)}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-slate-900/50 border-slate-700/50">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            תזרים חודשי
            {data?.prevYear && <Badge className="bg-slate-700/50 text-slate-400 text-[10px]">השוואה ל-{data.prevYear}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-700/50 text-muted-foreground">
                  <th className="text-right py-2 px-3">חודש</th>
                  <th className="text-right py-2 px-3">הכנסות</th>
                  <th className="text-right py-2 px-3">הוצאות</th>
                  <th className="text-right py-2 px-3">נטו</th>
                  <th className="text-right py-2 px-3 text-slate-500">נטו {data?.prevYear || "קודם"}</th>
                  <th className="text-right py-2 px-3 text-slate-500">שינוי</th>
                </tr>
              </thead>
              <tbody>
                {monthly.filter((m: any) => m.inflow > 0 || m.outflow > 0 || m.prevInflow > 0).map((m: any, i: number) => {
                  const change = m.prevNet !== 0 ? Math.round(((m.net - m.prevNet) / Math.abs(m.prevNet)) * 1000) / 10 : 0;
                  return (
                    <tr key={i} className="border-b border-slate-800/50">
                      <td className="py-2 px-3 text-slate-400">חודש {m.month}</td>
                      <td className="py-2 px-3 text-green-400">₪{fmt(m.inflow)}</td>
                      <td className="py-2 px-3 text-red-400">₪{fmt(m.outflow)}</td>
                      <td className={`py-2 px-3 font-medium ${m.net >= 0 ? "text-green-400" : "text-red-400"}`}>{fmtSign(m.net)}</td>
                      <td className="py-2 px-3 text-slate-500">{fmtSign(m.prevNet || 0)}</td>
                      <td className={`py-2 px-3 text-xs ${change >= 0 ? "text-green-500" : "text-red-500"}`}>{m.prevNet ? pct(change) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card className="bg-slate-900/50 border-slate-700/50">
          <CardHeader className="pb-2"><CardTitle className="text-sm">פעילות שוטפת — השוואה שנתית</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="grid grid-cols-3 text-xs text-muted-foreground border-b border-slate-700/50 pb-1">
              <span>סעיף</span><span className="text-right">שנה נוכחית</span><span className="text-right">{data?.prevYear || "שנה קודמת"}</span>
            </div>
            <div className="grid grid-cols-3">
              <span className="text-muted-foreground">תקבולים</span>
              <span className="text-right text-green-400">₪{fmt(op.cashIn || 0)}</span>
              <span className="text-right text-slate-400">₪{fmt(op.prevCashIn || 0)}</span>
            </div>
            <div className="grid grid-cols-3">
              <span className="text-muted-foreground">תשלומים</span>
              <span className="text-right text-red-400">₪{fmt(op.cashOut || 0)}</span>
              <span className="text-right text-slate-400">₪{fmt(op.prevCashOut || 0)}</span>
            </div>
            <div className="grid grid-cols-3 font-bold border-t border-slate-700/50 pt-1">
              <span className="text-foreground">נטו</span>
              <span className={`text-right ${(op.net || 0) >= 0 ? "text-green-400" : "text-red-400"}`}>{fmtSign(op.net || 0)}</span>
              <span className="text-right text-slate-400">{fmtSign(op.prevNet || 0)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="text-center p-4 bg-slate-800/40 rounded-xl">
          <p className="text-xs text-muted-foreground">זכאים (AR)</p>
          <p className="text-lg font-bold text-blue-400">₪{fmt(wc.ar || 0)}</p>
        </div>
        <div className="text-center p-4 bg-slate-800/40 rounded-xl">
          <p className="text-xs text-muted-foreground">חייבים (AP)</p>
          <p className="text-lg font-bold text-red-400">₪{fmt(wc.ap || 0)}</p>
        </div>
        <div className="text-center p-4 bg-slate-800/40 rounded-xl">
          <p className="text-xs text-muted-foreground">הון חוזר נטו</p>
          <p className={`text-lg font-bold ${(wc.net || 0) >= 0 ? "text-green-400" : "text-red-400"}`}>{fmtSign(wc.net || 0)}</p>
        </div>
      </div>
    </div>
  );
}

function TrialBalanceReport() {
  const pf = usePeriodFilter();
  const [search, setSearch] = useState("");
  const [drillAcct, setDrillAcct] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["bi-trial", ...pf.queryKey],
    queryFn: () => authJson(`${API}/reports-center/bi/trial-balance?${pf.buildQueryParams()}`).catch(() => null),
  });
  const { data: drillData, isLoading: drillLoading } = useQuery({
    queryKey: ["bi-trial-drill", drillAcct, ...pf.queryKey],
    queryFn: () => drillAcct ? authJson(`${API}/reports-center/bi/drill-down/trial-balance?${pf.buildQueryParams()}&accountNumber=${encodeURIComponent(drillAcct)}`).catch(() => null) : null,
    enabled: !!drillAcct,
  });

  if (isLoading) return <LoadingOverlay className="min-h-[200px]" />;

  const accounts = (data?.accounts || []).filter((a: any) =>
    !search || a.accountName?.includes(search) || a.accountNumber?.includes(search)
  );
  const totals = data?.totals || {};
  const prevYear = data?.prevYear || "";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="text-center p-4 bg-slate-800/40 rounded-xl">
          <p className="text-xs text-muted-foreground">חובה</p>
          <p className="text-lg font-bold text-foreground">₪{fmt(totals.debit || 0)}</p>
        </div>
        <div className="text-center p-4 bg-slate-800/40 rounded-xl">
          <p className="text-xs text-muted-foreground">זכות</p>
          <p className="text-lg font-bold text-foreground">₪{fmt(totals.credit || 0)}</p>
        </div>
        <div className={`text-center p-4 rounded-xl ${data?.balanced ? "bg-green-500/20" : "bg-red-500/20"}`}>
          <p className="text-xs text-muted-foreground">{data?.balanced ? "✓ מאוזן" : "⚠ לא מאוזן"}</p>
          <p className={`text-lg font-bold ${data?.balanced ? "text-green-400" : "text-red-400"}`}>
            ₪{fmt(Math.abs(totals.difference || 0))}
          </p>
        </div>
      </div>

      {drillAcct && (
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
          <div className="flex justify-between items-center mb-3">
            <h4 className="font-semibold text-foreground">יומן חשבון: {drillAcct}</h4>
            <button onClick={() => setDrillAcct(null)} className="text-xs text-muted-foreground hover:text-foreground">✕ סגור</button>
          </div>
          {drillLoading ? <LoadingOverlay className="min-h-[80px]" /> : (
            <div className="overflow-x-auto max-h-64">
              <table className="w-full text-xs">
                <thead className="bg-slate-900/60">
                  <tr className="text-muted-foreground">
                    <th className="text-right py-1.5 px-2">תאריך</th>
                    <th className="text-right py-1.5 px-2">תיאור</th>
                    <th className="text-right py-1.5 px-2">חובה</th>
                    <th className="text-right py-1.5 px-2">זכות</th>
                  </tr>
                </thead>
                <tbody>
                  {(drillData?.rows || []).slice(0, 100).map((row: any, i: number) => (
                    <tr key={i} className="border-b border-slate-800/50">
                      <td className="py-1.5 px-2 text-slate-400">{row.entry_date?.slice(0, 10) || "—"}</td>
                      <td className="py-1.5 px-2 text-slate-300">{row.description || "—"}</td>
                      <td className="py-1.5 px-2 text-green-400">{row.debit_amount > 0 ? `₪${fmt(row.debit_amount)}` : "—"}</td>
                      <td className="py-1.5 px-2 text-red-400">{row.credit_amount > 0 ? `₪${fmt(row.credit_amount)}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="חפש חשבון..."
        className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
      />

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-800/60">
            <tr className="text-muted-foreground text-xs">
              <th className="text-right py-3 px-4">מספר חשבון</th>
              <th className="text-right py-3 px-4">שם חשבון</th>
              <th className="text-right py-3 px-4">סוג</th>
              <th className="text-right py-3 px-4">חובה</th>
              <th className="text-right py-3 px-4">זכות</th>
              <th className="text-right py-3 px-4">יתרה</th>
              <th className="text-right py-3 px-4 text-slate-500">יתרה {prevYear || "קודם"}</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((acc: any, i: number) => (
              <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                <td className="py-2 px-4">
                  <button onClick={() => setDrillAcct(acc.accountNumber)} className="text-blue-400 hover:underline">{acc.accountNumber || "—"}</button>
                </td>
                <td className="py-2 px-4 text-foreground">{acc.accountName}</td>
                <td className="py-2 px-4"><Badge className="text-[10px] bg-slate-700/50 text-slate-300">{acc.accountType}</Badge></td>
                <td className="py-2 px-4 text-slate-300">₪{fmt(acc.debit)}</td>
                <td className="py-2 px-4 text-slate-300">₪{fmt(acc.credit)}</td>
                <td className={`py-2 px-4 font-medium ${acc.balance >= 0 ? "text-green-400" : "text-red-400"}`}>{fmtSign(acc.balance)}</td>
                <td className="py-2 px-4 text-slate-500">{acc.prevBalance !== undefined ? fmtSign(acc.prevBalance) : "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-800/60">
            <tr className="text-xs font-bold">
              <td colSpan={3} className="py-3 px-4 text-foreground">סה"כ</td>
              <td className="py-3 px-4 text-foreground">₪{fmt(totals.debit || 0)}</td>
              <td className="py-3 px-4 text-foreground">₪{fmt(totals.credit || 0)}</td>
              <td className={`py-3 px-4 ${data?.balanced ? "text-green-400" : "text-red-400"}`}>{fmtSign(totals.difference || 0)}</td>
              <td className="py-3 px-4 text-slate-500">—</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

const TABS: { id: ReportTab; label: string; icon: any }[] = [
  { id: "pl", label: "רווח והפסד", icon: TrendingUp },
  { id: "balance", label: "מאזן", icon: Scale },
  { id: "cashflow", label: "תזרים מזומנים", icon: Droplets },
  { id: "trial", label: "מאזן בוחן", icon: BookOpen },
];

export default function BIFinancialStatements() {
  const [activeTab, setActiveTab] = useState<ReportTab>("pl");
  const pf = usePeriodFilter();

  // Fetch P&L data at parent level for CSV export
  const { data: plData } = useQuery({
    queryKey: ["bi-pl-export", ...pf.queryKey],
    queryFn: () => authJson(`${API}/reports-center/bi/profit-loss?${pf.buildQueryParams()}`).catch(() => null),
  });

  const handleExportCSV = () => {
    if (!plData) return;
    const rows: any[] = [];
    const s = plData.summary || {};
    const prevYear = plData.startDate ? parseInt(plData.startDate.slice(0, 4)) - 1 : "";
    rows.push({ section: "סיכום", item: "סה\"כ הכנסות", current: s.totalIncome || 0, [`prior_${prevYear}`]: s.prevIncome || 0, change_pct: s.incomeChange || 0 });
    rows.push({ section: "סיכום", item: "סה\"כ הוצאות", current: s.totalExpenses || 0, [`prior_${prevYear}`]: s.prevExpenses || 0, change_pct: s.expenseChange || 0 });
    rows.push({ section: "סיכום", item: "רווח גולמי", current: s.grossProfit || 0, [`prior_${prevYear}`]: s.prevGrossProfit || 0, change_pct: s.profitChange || 0 });
    (plData.sections || []).forEach((sec: any) => {
      (sec.lines || []).forEach((l: any) => {
        const lineChange = l.prior > 0 ? Math.round(((l.current - l.prior) / l.prior) * 1000) / 10 : 0;
        rows.push({ section: sec.title, item: l.label, current: l.current || 0, [`prior_${prevYear}`]: l.prior || 0, change_pct: lineChange });
      });
      rows.push({ section: sec.title, item: `סה"כ ${sec.title}`, current: sec.total || 0, [`prior_${prevYear}`]: sec.priorTotal || 0, change_pct: "" });
    });
    exportCSV(rows, `financial-pl-${pf.year}.csv`);
  };

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Link href="/reports"><span className="flex items-center gap-1 hover:text-foreground cursor-pointer"><ChevronLeft className="w-4 h-4" />מרכז דוחות</span></Link>
        <span>/</span>
        <span className="text-foreground">דוחות כספיים מתקדמים</span>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-green-400" /> דוחות כספיים — BI
          </h1>
          <p className="text-sm text-muted-foreground mt-1">דוחות P&L, מאזן, תזרים ומאזן בוחן עם השוואה לתקופה קודמת וקידוח לרשומות</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="flex items-center gap-2 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm hover:bg-slate-700">
            <Printer className="w-4 h-4" /> הדפסה
          </button>
        </div>
      </div>

      <PeriodFilter
        period={pf.period} onPeriodChange={pf.setPeriod}
        year={pf.year} onYearChange={pf.setYear}
        month={pf.month} onMonthChange={pf.setMonth}
        quarter={pf.quarter} onQuarterChange={pf.setQuarter}
        customStart={pf.customStart} onCustomStartChange={pf.setCustomStart}
        customEnd={pf.customEnd} onCustomEndChange={pf.setCustomEnd}
        onExportCSV={handleExportCSV}
        onExportPDF={() => exportPDF("דוחות כספיים — P&L, מאזן, תזרים")}
      />

      <div className="flex gap-2 flex-wrap">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${activeTab === tab.id ? "bg-primary text-primary-foreground" : "bg-slate-800/50 text-slate-300 hover:bg-slate-700/50"}`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      <Card className="bg-slate-900/50 border-slate-700/50">
        <CardContent className="p-5">
          <div data-report-content>
            {activeTab === "pl" && <PLReport />}
            {activeTab === "balance" && <BalanceSheetReport />}
            {activeTab === "cashflow" && <CashFlowReport />}
            {activeTab === "trial" && <TrialBalanceReport />}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
