import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import {
  PiggyBank, Plus, Search, TrendingUp, TrendingDown, Building2, Grid3X3,
  BarChart3, X, AlertTriangle, CheckCircle2
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { authJson, authFetch } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const API = "/api";
function fmt(n: number) { return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(n); }
function fmtNum(n: number) { return new Intl.NumberFormat("he-IL").format(Math.round(n)); }
function fmtK(n: number) { return n >= 1000 ? `${Math.round(n / 1000)}K` : String(Math.round(n)); }

const DEPARTMENTS = ["ייצור", "רכש", "מכירות", "הנהלה", "תחזוקה", "הובלה", "שיווק", "כללי"];
const CATEGORIES = ["חומרי גלם", "שכר עבודה", "שכירות", "חשמל ומים", "ביטוח", "תחזוקה", "ציוד", "שיווק", "הובלה", "אחר"];
const MONTHS: Record<number, string> = { 1: "ינואר", 2: "פברואר", 3: "מרץ", 4: "אפריל", 5: "מאי", 6: "יוני", 7: "יולי", 8: "אוגוסט", 9: "ספטמבר", 10: "אוקטובר", 11: "נובמבר", 12: "דצמבר" };
const MONTH_SHORT: Record<number, string> = { 1: "ינו", 2: "פבר", 3: "מרץ", 4: "אפר", 5: "מאי", 6: "יוני", 7: "יולי", 8: "אוג", 9: "ספט", 10: "אוק", 11: "נוב", 12: "דצמ" };

type ViewTab = "list" | "departments" | "monthly-grid";

function VarianceKPI({ label, value, budget, actual, icon: Icon, color }: { label: string; value: string; budget?: number; actual?: number; icon: any; color: string }) {
  const pct = budget && budget > 0 && actual !== undefined ? Math.round((actual / budget) * 100) : null;
  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg bg-slate-700/50 ${color}`}><Icon className="w-4 h-4" /></div>
          <div className="flex-1 min-w-0">
            <p className="text-muted-foreground text-xs">{label}</p>
            <p className="text-lg font-bold text-foreground truncate">{value}</p>
            {pct !== null && (
              <div className="mt-1">
                <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${pct > 100 ? "bg-red-500" : pct > 80 ? "bg-yellow-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                </div>
                <p className={`text-[10px] mt-0.5 ${pct > 100 ? "text-red-400" : pct > 80 ? "text-yellow-400" : "text-emerald-400"}`}>{pct}% ניצול</p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DepartmentView({ items }: { items: any[] }) {
  const deptMap = useMemo(() => {
    const m: Record<string, { budgeted: number; actual: number; count: number }> = {};
    for (const r of items) {
      const dept = r.department || "כללי";
      if (!m[dept]) m[dept] = { budgeted: 0, actual: 0, count: 0 };
      m[dept].budgeted += Number(r.budgeted_amount || 0);
      m[dept].actual += Number(r.actual_amount || 0);
      m[dept].count++;
    }
    return Object.entries(m)
      .map(([dept, v]) => ({ dept, ...v, variance: v.budgeted - v.actual, pct: v.budgeted > 0 ? Math.round((v.actual / v.budgeted) * 100) : 0 }))
      .sort((a, b) => b.budgeted - a.budgeted);
  }, [items]);

  const totalBudgeted = deptMap.reduce((s, d) => s + d.budgeted, 0);

  if (deptMap.length === 0) return <div className="p-8 text-center text-muted-foreground">אין נתוני מחלקות</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {deptMap.map(d => (
          <Card key={d.dept} className="bg-slate-800/50 border-slate-700 hover:border-amber-500/40 transition-colors">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-amber-400" />
                  <span className="font-semibold text-foreground text-sm">{d.dept}</span>
                  <Badge className="text-[10px] bg-slate-700 text-muted-foreground">{d.count} פריטים</Badge>
                </div>
                <span className={`text-xs font-bold ${d.pct > 100 ? "text-red-400" : d.pct > 80 ? "text-yellow-400" : "text-emerald-400"}`}>{d.pct}%</span>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div><p className="text-[10px] text-muted-foreground">מתוקצב</p><p className="text-xs font-bold text-foreground">₪{fmtK(d.budgeted)}</p></div>
                <div><p className="text-[10px] text-muted-foreground">בפועל</p><p className="text-xs font-bold text-amber-400">₪{fmtK(d.actual)}</p></div>
                <div><p className="text-[10px] text-muted-foreground">סטייה</p><p className={`text-xs font-bold ${d.variance >= 0 ? "text-emerald-400" : "text-red-400"}`}>{d.variance >= 0 ? "+" : ""}₪{fmtK(Math.abs(d.variance))}</p></div>
              </div>
              <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${d.pct > 100 ? "bg-red-500" : d.pct > 80 ? "bg-yellow-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(d.pct, 100)}%` }} />
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                {totalBudgeted > 0 ? `${Math.round((d.budgeted / totalBudgeted) * 100)}% מהתקציב הכולל` : ""}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-4">
          <div className="text-sm font-bold text-gray-300 mb-3 flex items-center gap-2"><Building2 className="w-4 h-4 text-amber-400" />הקצאה לפי מחלקה</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={deptMap} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="dept" tick={{ fill: "#94a3b8", fontSize: 11 }} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={v => `₪${fmtK(v)}`} />
              <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569", borderRadius: 8, color: "#fff" }} formatter={(v: number, name: string) => [fmt(v), name === "budgeted" ? "מתוקצב" : "בפועל"]} />
              <Legend formatter={v => v === "budgeted" ? "מתוקצב" : "בפועל"} />
              <Bar dataKey="budgeted" fill="#f59e0b" radius={[4, 4, 0, 0]} name="budgeted" />
              <Bar dataKey="actual" fill="#3b82f6" radius={[4, 4, 0, 0]} name="actual" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

function MonthlyGrid({ items, year }: { items: any[]; year: string }) {
  const yearItems = useMemo(() => {
    if (year === "all") return items;
    return items.filter((r: any) => String(r.fiscal_year) === year);
  }, [items, year]);

  const rows = useMemo(() => {
    const map: Record<string, { name: string; dept: string; months: Record<number, { budgeted: number; actual: number }> }> = {};
    for (const r of yearItems) {
      const key = `${r.department || "כללי"}___${r.category || r.budget_name || "כללי"}`;
      if (!map[key]) map[key] = { name: r.budget_name || r.category || "—", dept: r.department || "כללי", months: {} };
      const mo = Number(r.fiscal_month);
      if (!map[key].months[mo]) map[key].months[mo] = { budgeted: 0, actual: 0 };
      map[key].months[mo].budgeted += Number(r.budgeted_amount || 0);
      map[key].months[mo].actual += Number(r.actual_amount || 0);
    }
    return Object.values(map);
  }, [yearItems]);

  if (rows.length === 0) return <div className="p-8 text-center text-muted-foreground">אין נתונים לשנה {year}</div>;

  const monthTotals = Array.from({ length: 12 }, (_, i) => {
    const mo = i + 1;
    const budgeted = rows.reduce((s, r) => s + (r.months[mo]?.budgeted || 0), 0);
    const actual = rows.reduce((s, r) => s + (r.months[mo]?.actual || 0), 0);
    return { budgeted, actual };
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs min-w-[900px]">
        <thead>
          <tr className="bg-slate-800/60 border-b border-slate-700">
            <th className="px-3 py-2.5 text-right text-muted-foreground font-medium sticky right-0 bg-slate-800/60 min-w-[120px]">מחלקה / קטגוריה</th>
            {Array.from({ length: 12 }, (_, i) => (
              <th key={i} className="px-2 py-2.5 text-center text-muted-foreground font-medium min-w-[70px]">{MONTH_SHORT[i + 1]}</th>
            ))}
            <th className="px-3 py-2.5 text-right text-amber-400 font-medium min-w-[90px]">סה״כ שנתי</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const yearBudgeted = Object.values(row.months).reduce((s, m) => s + m.budgeted, 0);
            const yearActual = Object.values(row.months).reduce((s, m) => s + m.actual, 0);
            const yearPct = yearBudgeted > 0 ? Math.round((yearActual / yearBudgeted) * 100) : 0;
            return (
              <tr key={idx} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                <td className="px-3 py-2 sticky right-0 bg-card">
                  <div className="font-medium text-foreground truncate max-w-[110px]" title={row.name}>{row.name}</div>
                  <div className="text-[10px] text-muted-foreground">{row.dept}</div>
                </td>
                {Array.from({ length: 12 }, (_, i) => {
                  const mo = i + 1;
                  const m = row.months[mo];
                  if (!m) return <td key={i} className="px-2 py-2 text-center text-muted-foreground/30">—</td>;
                  const pct = m.budgeted > 0 ? Math.round((m.actual / m.budgeted) * 100) : 0;
                  return (
                    <td key={i} className="px-2 py-1 text-center">
                      <div className="font-mono text-[10px] text-foreground">₪{fmtK(m.budgeted)}</div>
                      <div className={`font-mono text-[10px] ${pct > 100 ? "text-red-400" : "text-amber-400"}`}>₪{fmtK(m.actual)}</div>
                      <div className="w-full h-1 bg-slate-700 rounded-full mt-0.5 overflow-hidden">
                        <div className={`h-full rounded-full ${pct > 100 ? "bg-red-500" : pct > 80 ? "bg-yellow-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-right">
                  <div className="font-mono text-foreground font-bold text-[11px]">₪{fmtK(yearBudgeted)}</div>
                  <div className={`font-mono text-[11px] ${yearPct > 100 ? "text-red-400" : "text-amber-400"}`}>₪{fmtK(yearActual)} ({yearPct}%)</div>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-amber-600/50 bg-slate-800/80">
            <td className="px-3 py-2.5 text-amber-400 font-bold sticky right-0 bg-slate-800/80">סה״כ</td>
            {monthTotals.map((mt, i) => (
              <td key={i} className="px-2 py-2.5 text-center">
                <div className="font-mono text-[10px] text-amber-400 font-bold">₪{fmtK(mt.budgeted)}</div>
                <div className="font-mono text-[10px] text-blue-400">₪{fmtK(mt.actual)}</div>
              </td>
            ))}
            <td className="px-3 py-2.5 text-right">
              <div className="font-mono text-amber-400 font-bold text-[11px]">₪{fmtK(monthTotals.reduce((s, m) => s + m.budgeted, 0))}</div>
              <div className="font-mono text-blue-400 text-[11px]">₪{fmtK(monthTotals.reduce((s, m) => s + m.actual, 0))}</div>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default function BudgetsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const currentYear = new Date().getFullYear();
  const [yearFilter, setYearFilter] = useState(String(currentYear));
  const [deptFilter, setDeptFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailTab, setDetailTab] = useState("details");
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [viewTab, setViewTab] = useState<ViewTab>("list");
  const { selectedIds, setSelectedIds, toggle, toggleAll, isSelected } = useBulkSelection();
  const validationBudget = useFormValidation({ budget_name: { required: true }, budgeted_amount: { required: true, min: 0 } });
  const [form, setForm] = useState({
    budget_name: "", fiscal_year: String(currentYear), fiscal_month: "1",
    category: "", department: "", budgeted_amount: "", notes: "",
  });

  const { data } = useQuery({
    queryKey: ["budgets", yearFilter, deptFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (yearFilter !== "all") params.set("fiscal_year", yearFilter);
      if (deptFilter !== "all") params.set("department", deptFilter);
      return authJson(`${API}/finance/budgets?${params}`);
    },
  });

  const createMutation = useMutation({
    mutationFn: (body: any) => authJson(`${API}/finance/budgets`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["budgets"] }); setDialogOpen(false); toast({ title: "תקציב נוצר בהצלחה" }); },
  });

  const items = Array.isArray(data) ? data : data?.data || [];
  const rows = items.filter((r: any) => !search || r.budget_name?.includes(search) || r.category?.includes(search) || r.department?.includes(search));
  const totalBudgeted = rows.reduce((s: number, r: any) => s + Number(r.budgeted_amount || 0), 0);
  const totalActual = rows.reduce((s: number, r: any) => s + Number(r.actual_amount || 0), 0);
  const totalVariance = totalBudgeted - totalActual;
  const avgUtilization = totalBudgeted > 0 ? Math.round((totalActual / totalBudgeted) * 100) : 0;

  const overBudgetItems = rows.filter((r: any) => Number(r.actual_amount || 0) > Number(r.budgeted_amount || 0));
  const nearLimitItems = rows.filter((r: any) => {
    const b = Number(r.budgeted_amount || 0);
    const a = Number(r.actual_amount || 0);
    const pct = b > 0 ? (a / b) * 100 : 0;
    return pct >= 80 && pct <= 100;
  });

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-600/20 rounded-xl flex items-center justify-center">
            <PiggyBank className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-lg sm:text-2xl font-bold text-foreground">תקציבים</h1>
            <p className="text-muted-foreground text-sm">{rows.length} שורות תקציב — ניהול הקצאות מחלקתיות</p>
          </div>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-amber-600 hover:bg-amber-500"><Plus className="w-4 h-4 ml-2" />תקציב חדש</Button>
          </DialogTrigger>
          <DialogContent className="bg-slate-900 border-slate-700 text-foreground max-w-lg" dir="rtl">
            <DialogHeader><DialogTitle>תקציב חדש</DialogTitle></DialogHeader>
            <div className="grid gap-4 py-4">
              <div><Label>שם התקציב <RequiredMark /></Label><Input value={form.budget_name} onChange={e => setForm({...form, budget_name: e.target.value})} className="bg-slate-800 border-slate-600" placeholder="תקציב חומרי גלם Q1..." /><FormFieldError validation={validationBudget} field="budget_name" /></div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div><Label>שנה</Label><Input type="number" value={form.fiscal_year} onChange={e => setForm({...form, fiscal_year: e.target.value})} className="bg-slate-800 border-slate-600" /></div>
                <div><Label>חודש</Label>
                  <Select value={form.fiscal_month} onValueChange={v => setForm({...form, fiscal_month: v})}>
                    <SelectTrigger className="bg-slate-800 border-slate-600"><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(MONTHS).map(([k,v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>סכום מתוקצב <RequiredMark /></Label><Input type="number" value={form.budgeted_amount} onChange={e => setForm({...form, budgeted_amount: e.target.value})} className="bg-slate-800 border-slate-600" /><FormFieldError validation={validationBudget} field="budgeted_amount" /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><Label>קטגוריה</Label>
                  <Select value={form.category} onValueChange={v => setForm({...form, category: v})}>
                    <SelectTrigger className="bg-slate-800 border-slate-600"><SelectValue placeholder="בחר..." /></SelectTrigger>
                    <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>מחלקה</Label>
                  <Select value={form.department} onValueChange={v => setForm({...form, department: v})}>
                    <SelectTrigger className="bg-slate-800 border-slate-600"><SelectValue placeholder="בחר..." /></SelectTrigger>
                    <SelectContent>{DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>הערות</Label><Input value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} className="bg-slate-800 border-slate-600" /></div>
              <Button onClick={() => { if (!validationBudget.validate(form)) return; createMutation.mutate({ ...form, fiscal_year: parseInt(form.fiscal_year), fiscal_month: parseInt(form.fiscal_month), budgeted_amount: parseFloat(form.budgeted_amount), actual_amount: 0, variance: parseFloat(form.budgeted_amount) }); }} disabled={createMutation.isPending} className="bg-amber-600 hover:bg-amber-500">
                {createMutation.isPending ? "שומר..." : "שמור תקציב"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <VarianceKPI label="מתוקצב" value={fmt(totalBudgeted)} icon={PiggyBank} color="text-amber-400" />
        <VarianceKPI label="בפועל" value={fmt(totalActual)} budget={totalBudgeted} actual={totalActual} icon={BarChart3} color="text-blue-400" />
        <VarianceKPI label="סטייה" value={(totalVariance >= 0 ? "+" : "") + fmt(totalVariance)} icon={totalVariance >= 0 ? TrendingUp : TrendingDown} color={totalVariance >= 0 ? "text-emerald-400" : "text-red-400"} />
        <VarianceKPI label="ניצול ממוצע" value={`${avgUtilization}%`} icon={CheckCircle2} color={avgUtilization > 100 ? "text-red-400" : avgUtilization > 80 ? "text-yellow-400" : "text-emerald-400"} />
      </div>

      {(overBudgetItems.length > 0 || nearLimitItems.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {overBudgetItems.length > 0 && (
            <Card className="bg-red-900/20 border-red-700/50">
              <CardContent className="p-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-red-400 text-xs font-bold">{overBudgetItems.length} פריטים חרגו מהתקציב</p>
                  <p className="text-red-300/70 text-[10px] mt-0.5 truncate">{overBudgetItems.slice(0,3).map((r: any) => r.budget_name).join(", ")}{overBudgetItems.length > 3 ? "..." : ""}</p>
                </div>
              </CardContent>
            </Card>
          )}
          {nearLimitItems.length > 0 && (
            <Card className="bg-yellow-900/20 border-yellow-700/50">
              <CardContent className="p-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-yellow-400 text-xs font-bold">{nearLimitItems.length} פריטים קרובים לגבול (80%-100%)</p>
                  <p className="text-yellow-300/70 text-[10px] mt-0.5 truncate">{nearLimitItems.slice(0,3).map((r: any) => r.budget_name).join(", ")}{nearLimitItems.length > 3 ? "..." : ""}</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {items.length > 1 && (() => {
        const now = new Date();
        const curMonth = now.getMonth() + 1;
        const curYear2 = now.getFullYear();
        const prevMonth = curMonth === 1 ? 12 : curMonth - 1;
        const prevMonthYear = curMonth === 1 ? curYear2 - 1 : curYear2;
        const curQuarter = Math.ceil(curMonth / 3);
        const prevQuarter = curQuarter === 1 ? 4 : curQuarter - 1;
        const prevQuarterYear = curQuarter === 1 ? curYear2 - 1 : curYear2;
        const qMonths = (q: number) => [(q-1)*3+1, (q-1)*3+2, (q-1)*3+3];
        const sumPeriod = (months: number[], year: number) => items.filter((b: any) => months.includes(Number(b.fiscal_month)) && Number(b.fiscal_year) === year).reduce((a: any, b: any) => ({ budgeted: a.budgeted + Number(b.budgeted_amount||0), actual: a.actual + Number(b.actual_amount||0), count: a.count+1 }), { budgeted: 0, actual: 0, count: 0 });
        const curM = sumPeriod([curMonth], curYear2), prevM = sumPeriod([prevMonth], prevMonthYear);
        const curQ = sumPeriod(qMonths(curQuarter), curYear2), prevQ = sumPeriod(qMonths(prevQuarter), prevQuarterYear);
        const pctChange = (c: number, p: number) => p === 0 ? (c > 0 ? 100 : 0) : Math.round(((c-p)/p)*100);
        const Arrow = ({ val }: { val: number }) => val > 0 ? <span className="text-emerald-400 text-xs font-bold">▲ +{val}%</span> : val < 0 ? <span className="text-red-400 text-xs font-bold">▼ {val}%</span> : <span className="text-muted-foreground text-xs">—</span>;
        return (
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-4">
              <div className="text-sm font-bold text-gray-300 mb-3 flex items-center gap-2">📊 השוואת תקופות</div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-emerald-900/30 rounded-lg p-3 border border-emerald-700/50"><div className="text-[10px] text-muted-foreground mb-1">מתוקצב: חודש נוכחי מול קודם</div><div className="text-lg font-bold text-foreground">{fmt(curM.budgeted)}</div><div className="text-xs text-muted-foreground">מול {fmt(prevM.budgeted)}</div><Arrow val={pctChange(curM.budgeted, prevM.budgeted)} /></div>
                <div className="bg-blue-900/30 rounded-lg p-3 border border-blue-700/50"><div className="text-[10px] text-muted-foreground mb-1">בפועל: חודש נוכחי מול קודם</div><div className="text-lg font-bold text-amber-400">{fmt(curM.actual)}</div><div className="text-xs text-muted-foreground">מול {fmt(prevM.actual)}</div><Arrow val={pctChange(curM.actual, prevM.actual)} /></div>
                <div className="bg-purple-900/30 rounded-lg p-3 border border-purple-700/50"><div className="text-[10px] text-muted-foreground mb-1">מתוקצב: רבעון נוכחי מול קודם</div><div className="text-lg font-bold text-foreground">{fmt(curQ.budgeted)}</div><div className="text-xs text-muted-foreground">מול {fmt(prevQ.budgeted)}</div><Arrow val={pctChange(curQ.budgeted, prevQ.budgeted)} /></div>
                <div className="bg-orange-900/30 rounded-lg p-3 border border-orange-700/50"><div className="text-[10px] text-muted-foreground mb-1">שורות: חודש נוכחי מול קודם</div><div className="text-lg font-bold text-foreground">{curM.count}</div><div className="text-xs text-muted-foreground">מול {prevM.count}</div><Arrow val={pctChange(curM.count, prevM.count)} /></div>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..." className="pr-10 bg-slate-800/50 border-slate-700" />
        </div>
        <Select value={yearFilter} onValueChange={setYearFilter}>
          <SelectTrigger className="w-32 bg-slate-800/50 border-slate-700"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל השנים</SelectItem>
            {[currentYear, currentYear-1, currentYear-2].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="w-40 bg-slate-800/50 border-slate-700"><SelectValue placeholder="מחלקה" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל המחלקות</SelectItem>
            {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2 border-b border-slate-700">
        {([
          ["list", "רשימה", BarChart3],
          ["departments", "לפי מחלקה", Building2],
          ["monthly-grid", "רשת חודשית 12M", Grid3X3],
        ] as [ViewTab, string, any][]).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setViewTab(key)} className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 ${viewTab === key ? "border-amber-500 text-amber-400" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {viewTab === "list" && (<>
        <BulkActions items={rows} selectedIds={selectedIds} onSelectionChange={setSelectedIds} actions={[
          defaultBulkActions.delete(async (ids) => { await Promise.allSettled(ids.map(id => authFetch(`${API}/finance/budgets/${id}`, { method: "DELETE" }))); qc.invalidateQueries({ queryKey: ["budgets"] }); }),
          defaultBulkActions.export(async (ids) => { const csv = rows.filter((r: any) => ids.includes(String(r.id))).map((r: any) => `${r.budget_name},${r.department},${r.budgeted_amount},${r.actual_amount}`).join("\n"); const blob = new Blob([csv], { type: "text/csv" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "budgets.csv"; a.click(); }),
        ]} />

        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-700 text-muted-foreground">
                <th className="p-3"><BulkCheckbox items={rows} selectedIds={selectedIds} onToggleAll={(ids) => toggleAll(ids)} type="header" /></th>
                <th className="p-3 text-right">שם</th>
                <th className="p-3 text-right">תקופה</th>
                <th className="p-3 text-right">מחלקה</th>
                <th className="p-3 text-right">קטגוריה</th>
                <th className="p-3 text-right">מתוקצב</th>
                <th className="p-3 text-right">בפועל</th>
                <th className="p-3 text-right">סטייה</th>
                <th className="p-3 text-right">ניצול</th>
              </tr></thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">אין תקציבים</td></tr>
                ) : rows.map((r: any) => {
                  const budgeted = Number(r.budgeted_amount || 0);
                  const actual = Number(r.actual_amount || 0);
                  const variance = budgeted - actual;
                  const pct = budgeted > 0 ? Math.round((actual / budgeted) * 100) : 0;
                  return (
                    <tr key={r.id} className="border-b border-slate-700/50 hover:bg-slate-700/30 cursor-pointer" onClick={() => { setSelectedItem(r); setDetailTab("details"); }}>
                      <td className="p-3" onClick={e => e.stopPropagation()}><BulkCheckbox id={String(r.id)} isSelected={isSelected(String(r.id))} onToggle={() => toggle(String(r.id))} type="row" /></td>
                      <td className="p-3 text-foreground font-medium">{r.budget_name || "-"}</td>
                      <td className="p-3 text-gray-300">{MONTHS[r.fiscal_month] || r.fiscal_month} {r.fiscal_year}</td>
                      <td className="p-3 text-gray-300">{r.department || "-"}</td>
                      <td className="p-3 text-gray-300">{r.category || "-"}</td>
                      <td className="p-3 font-mono text-foreground">{fmt(budgeted)}</td>
                      <td className="p-3 font-mono text-foreground">{fmt(actual)}</td>
                      <td className={`p-3 font-mono ${variance >= 0 ? "text-emerald-400" : "text-red-400"}`}>{variance >= 0 ? "+" : ""}{fmt(variance)}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${pct > 100 ? "bg-red-500" : pct > 80 ? "bg-yellow-500" : "bg-green-500"}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                          </div>
                          <span className="text-xs text-muted-foreground w-10 text-left">{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-amber-600/50 bg-slate-800/80 font-bold">
                    <td className="p-3"></td>
                    <td className="p-3 text-amber-400" colSpan={4}>סה״כ ({rows.length} שורות)</td>
                    <td className="p-3 font-mono text-amber-400">{fmt(totalBudgeted)}</td>
                    <td className="p-3 font-mono text-amber-400">{fmt(totalActual)}</td>
                    <td className={`p-3 font-mono ${totalVariance >= 0 ? "text-emerald-400" : "text-red-400"}`}>{totalVariance >= 0 ? "+" : ""}{fmt(totalVariance)}</td>
                    <td className="p-3"><span className={`font-mono ${avgUtilization > 100 ? "text-red-400" : avgUtilization > 80 ? "text-yellow-400" : "text-emerald-400"}`}>{avgUtilization}%</span></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </CardContent>
        </Card>
      </>)}

      {viewTab === "departments" && (
        <DepartmentView items={rows} />
      )}

      {viewTab === "monthly-grid" && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-0">
            <MonthlyGrid items={items} year={yearFilter} />
          </CardContent>
        </Card>
      )}

      {items.length > 0 && viewTab === "list" && (() => {
        const monthMap: Record<string, { label: string; budgeted: number; actual: number }> = {};
        items.forEach((r: any) => {
          const key = `${r.fiscal_year}-${String(r.fiscal_month).padStart(2, "0")}`;
          const label = `${MONTHS[Number(r.fiscal_month)] || r.fiscal_month}`;
          if (!monthMap[key]) monthMap[key] = { label, budgeted: 0, actual: 0 };
          monthMap[key].budgeted += Number(r.budgeted_amount || 0);
          monthMap[key].actual += Number(r.actual_amount || 0);
        });
        const trendData = Object.entries(monthMap).sort(([a], [b]) => a.localeCompare(b)).slice(-12).map(([, v]) => v);
        return trendData.length > 1 ? (
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-4">
              <div className="text-sm font-bold text-gray-300 mb-3">📈 מגמת תקציב חודשית — מתוקצב מול בפועל</div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={trendData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 12 }} />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={v => `₪${fmtNum(v)}`} />
                  <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569", borderRadius: 8, color: "#fff" }} formatter={(v: number, name: string) => [fmt(v), name === "budgeted" ? "מתוקצב" : "בפועל"]} labelStyle={{ color: "#94a3b8" }} />
                  <Legend formatter={v => v === "budgeted" ? "מתוקצב" : "בפועל"} />
                  <Bar dataKey="budgeted" fill="#f59e0b" radius={[4, 4, 0, 0]} name="budgeted" />
                  <Bar dataKey="actual" fill="#3b82f6" radius={[4, 4, 0, 0]} name="actual" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        ) : null;
      })()}

      {selectedItem && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setSelectedItem(null)}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-6 border-b border-slate-700">
              <h2 className="text-xl font-bold text-foreground">תקציב: {selectedItem.budget_name}</h2>
              <button onClick={() => setSelectedItem(null)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="flex border-b border-border/50">
              {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
              ))}
            </div>
            <div className="p-6">
              {detailTab === "details" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <div><div className="text-xs text-muted-foreground mb-1">שם</div><div className="text-sm text-foreground font-medium">{selectedItem.budget_name}</div></div>
                    <div><div className="text-xs text-muted-foreground mb-1">תקופה</div><div className="text-sm text-foreground">{MONTHS[selectedItem.fiscal_month]} {selectedItem.fiscal_year}</div></div>
                    <div><div className="text-xs text-muted-foreground mb-1">מחלקה</div><div className="text-sm text-foreground">{selectedItem.department || "-"}</div></div>
                    <div><div className="text-xs text-muted-foreground mb-1">קטגוריה</div><div className="text-sm text-foreground">{selectedItem.category || "-"}</div></div>
                    <div><div className="text-xs text-muted-foreground mb-1">מתוקצב</div><div className="text-sm text-foreground font-bold">{fmt(Number(selectedItem.budgeted_amount || 0))}</div></div>
                    <div><div className="text-xs text-muted-foreground mb-1">בפועל</div><div className="text-sm text-foreground font-bold">{fmt(Number(selectedItem.actual_amount || 0))}</div></div>
                  </div>
                  {(() => {
                    const b = Number(selectedItem.budgeted_amount || 0);
                    const a = Number(selectedItem.actual_amount || 0);
                    const v = b - a;
                    const p = b > 0 ? Math.round((a / b) * 100) : 0;
                    return (
                      <div className="bg-slate-700/40 rounded-lg p-4 space-y-2">
                        <div className="flex justify-between text-sm"><span className="text-muted-foreground">סטייה</span><span className={v >= 0 ? "text-emerald-400" : "text-red-400"}>{v >= 0 ? "+" : ""}{fmt(v)}</span></div>
                        <div className="flex justify-between text-sm"><span className="text-muted-foreground">ניצול</span><span className={p > 100 ? "text-red-400" : p > 80 ? "text-yellow-400" : "text-emerald-400"}>{p}%</span></div>
                        <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden"><div className={`h-full rounded-full ${p > 100 ? "bg-red-500" : p > 80 ? "bg-yellow-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(p, 100)}%` }} /></div>
                      </div>
                    );
                  })()}
                </div>
              )}
              {detailTab === "related" && <RelatedRecords entityType="budgets" entityId={selectedItem.id} tabs={[{ key: "expenses", label: "הוצאות", endpoint: `${API}/expenses?budget_id=${selectedItem.id}` }, { key: "departments", label: "מחלקות", endpoint: `${API}/departments?budget_id=${selectedItem.id}` }]} />}
              {detailTab === "docs" && <AttachmentsSection entityType="budgets" entityId={selectedItem.id} />}
              {detailTab === "history" && <ActivityLog entityType="budgets" entityId={selectedItem.id} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
