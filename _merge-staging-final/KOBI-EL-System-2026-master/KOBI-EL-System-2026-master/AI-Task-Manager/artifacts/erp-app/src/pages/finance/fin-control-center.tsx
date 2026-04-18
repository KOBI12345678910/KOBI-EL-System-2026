import { useState, useMemo, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Download, Eye, Edit2, ChevronRight, ChevronLeft, AlertCircle, RefreshCw, Loader2 } from "lucide-react";
import { authFetch } from "@/lib/utils";

const STATUSES = ["תקין", "אזהרה", "קריטי", "בבדיקה"] as const;
const SC: Record<string, string> = { "תקין": "bg-green-500/20 text-green-300", "אזהרה": "bg-blue-500/20 text-blue-300", "קריטי": "bg-yellow-500/20 text-yellow-300", "בבדיקה": "bg-purple-500/20 text-purple-300" };
const COLS = [
    { key: "metric", label: "מדד" },
    { key: "value", label: "ערך" },
    { key: "target", label: "יעד" },
    { key: "trend", label: "מגמה" },
    { key: "status", label: "סטטוס" }
];

function buildMetrics(d: any): Record<string, string>[] {
  if (!d || typeof d !== "object") return [];
  const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const rows: Record<string, string>[] = [];

  const revenue = d.revenue || {};
  const expenses = d.expenses || {};
  const receivable = d.receivable || {};
  const payable = d.payable || {};
  const budget = d.budgetSummary || {};
  const cashflow = d.cashflow || {};

  const totalRevenue = Number(revenue.total_revenue || 0);
  const totalExpenses = Number(expenses.total_expenses || 0);
  const netIncome = Number(d.netIncome || 0);
  const totalAR = Number(receivable.total_ar || 0);
  const overdueAR = Number(receivable.overdue_ar || 0);
  const totalAP = Number(payable.total_ap || 0);
  const overdueAP = Number(payable.overdue_ap || 0);
  const totalBudget = Number(budget.total_budget || 0);
  const totalSpent = Number(budget.total_spent || 0);

  if (totalRevenue > 0 || totalExpenses > 0 || netIncome !== 0 || totalAR > 0 || totalAP > 0) {
    rows.push(
      { metric: "הכנסות", value: `₪${fmt(totalRevenue)}`, target: "-", trend: revenue.monthly_revenue ? `₪${fmt(revenue.monthly_revenue)} החודש` : "-", status: totalRevenue > 0 ? "תקין" : "בבדיקה" },
      { metric: "הוצאות", value: `₪${fmt(totalExpenses)}`, target: "-", trend: expenses.monthly_expenses ? `₪${fmt(expenses.monthly_expenses)} החודש` : "-", status: totalExpenses > totalRevenue && totalRevenue > 0 ? "אזהרה" : "תקין" },
      { metric: "רווח נקי", value: `₪${fmt(netIncome)}`, target: "-", trend: "-", status: netIncome >= 0 ? "תקין" : "קריטי" },
      { metric: "חייבים (AR)", value: `₪${fmt(totalAR)}`, target: "-", trend: overdueAR > 0 ? `₪${fmt(overdueAR)} באיחור` : "אין איחורים", status: overdueAR > 0 ? "אזהרה" : "תקין" },
      { metric: "זכאים (AP)", value: `₪${fmt(totalAP)}`, target: "-", trend: overdueAP > 0 ? `₪${fmt(overdueAP)} באיחור` : "אין איחורים", status: overdueAP > 0 ? "אזהרה" : "תקין" },
      { metric: "תקציב", value: `₪${fmt(totalBudget)}`, target: `₪${fmt(totalSpent)} נוצל`, trend: totalBudget > 0 ? `${Math.round((totalSpent / totalBudget) * 100)}%` : "-", status: totalSpent > totalBudget ? "קריטי" : "תקין" },
      { metric: "תזרים כניסות", value: `₪${fmt(cashflow.total_inflow || 0)}`, target: "-", trend: "-", status: "תקין" },
      { metric: "תזרים יציאות", value: `₪${fmt(cashflow.total_outflow || 0)}`, target: "-", trend: "-", status: "תקין" },
    );
  }

  return rows;
}

export default function FinControlCenter() {
  const [data, setData] = useState<Record<string, string>[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const perPage = 25;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/finance-control/dashboard");
      if (res.ok) {
        const json = await res.json();
        setData(buildMetrics(json));
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return data.filter(r => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (search && !Object.values(r).some(v => String(v).includes(search))) return false;
      return true;
    });
  }, [data, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageData = filtered.slice((page - 1) * perPage, page * perPage);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">מרכז בקרה פיננסי</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 ml-1" />}רענון</Button>
          <Button variant="outline" size="sm"><Download className="w-4 h-4 ml-1" />יצוא</Button>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {STATUSES.map(s => (
          <Card key={s} className="bg-card/50 border-border/50">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-foreground">{loading ? "..." : data.filter(r => r.status === s).length}</div>
              <Badge className={SC[s] + " mt-1"}>{s}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input placeholder="חיפוש..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 bg-background/50" />
            </div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
              <option value="all">כל הסטטוסים</option>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {loading ? (
            <div className="text-center py-16 text-muted-foreground">
              <Loader2 className="w-12 h-12 mx-auto mb-3 animate-spin opacity-50" />
              <p className="text-lg font-medium">טוען נתונים...</p>
            </div>
          ) : pageData.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-lg font-medium">אין נתונים להצגה</p>
              <p className="text-sm mt-1">לא נמצאו מדדים פיננסיים</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border/50">
                  {COLS.map(c => <th key={c.key} className="text-right p-3 text-muted-foreground font-medium">{c.label}</th>)}
                  <th className="text-center p-3 text-muted-foreground font-medium w-24">פעולות</th>
                </tr></thead>
                <tbody>{pageData.map((row, idx) => (
                  <tr key={idx} className="border-b border-border/30 hover:bg-card/30">
                    {COLS.map(c => <td key={c.key} className="p-3 text-foreground">{c.key === "status" ? <Badge className={SC[row[c.key]] || ""}>{row[c.key]}</Badge> : row[c.key]}</td>)}
                    <td className="p-3 text-center"><div className="flex items-center justify-center gap-1">
                      <Button variant="ghost" size="sm"><Eye className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="sm"><Edit2 className="w-3.5 h-3.5" /></Button>
                    </div></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
          <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
            <span>מציג {Math.min(filtered.length,(page-1)*perPage+1)}-{Math.min(filtered.length,page*perPage)} מתוך {filtered.length}</span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page<=1} onClick={() => setPage(p=>p-1)}><ChevronRight className="w-4 h-4" /></Button>
              <span className="px-3 py-1">{page}/{totalPages}</span>
              <Button variant="outline" size="sm" disabled={page>=totalPages} onClick={() => setPage(p=>p+1)}><ChevronLeft className="w-4 h-4" /></Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
