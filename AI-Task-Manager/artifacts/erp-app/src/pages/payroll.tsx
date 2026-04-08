import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { authFetch } from "@/lib/utils";
import {
  DollarSign, Users, Building2, Calculator, FileText, Play,
  Download, RefreshCw, TrendingUp, Banknote, Receipt, ChevronDown, ChevronUp,
} from "lucide-react";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Legend, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";

const API = "/api/payroll-engine";
const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-500/20 text-gray-400",
  calculated: "bg-blue-500/20 text-blue-400",
  approved: "bg-green-500/20 text-green-400",
  paid: "bg-emerald-500/20 text-emerald-400",
  cancelled: "bg-red-500/20 text-red-400",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "טיוטה",
  calculated: "חושב",
  approved: "מאושר",
  paid: "שולם",
  cancelled: "בוטל",
};

interface PayrollDashboard {
  total_payroll_this_month: number;
  avg_salary: number;
  total_employer_cost: number;
  total_employees: number;
  by_department: { department: string; total: number; count: number }[];
}

interface PayrollRun {
  id: number;
  period: string;
  total_employees: number;
  total_gross: number;
  total_net: number;
  total_employer_cost: number;
  status: string;
  created_at: string;
  approved_at: string | null;
}

interface Payslip {
  id: number;
  payroll_run_id: number;
  employee_id: number;
  employee_name: string;
  department: string;
  base_salary: number;
  overtime_pay: number;
  bonuses: number;
  gross_salary: number;
  income_tax: number;
  national_insurance: number;
  health_insurance: number;
  pension_employee: number;
  total_deductions: number;
  net_salary: number;
  employer_pension: number;
  employer_national_insurance: number;
  severance_fund: number;
  total_employer_cost: number;
}

interface SalaryStructure {
  id: number;
  name: string;
  description: string;
  base_component: string;
  components: { name: string; type: string; percentage: number; fixed_amount: number }[];
}

interface AnnualSummary {
  employee_id: number;
  employee_name: string;
  year: number;
  total_gross: number;
  total_income_tax: number;
  total_national_insurance: number;
  total_pension: number;
  total_net: number;
  months_worked: number;
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await authFetch(url, options);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

function formatCurrency(amount: number | undefined | null): string {
  if (amount == null) return "—";
  return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(amount);
}

export default function PayrollPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("runs");
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [expandedPayslip, setExpandedPayslip] = useState<number | null>(null);
  const [calcPeriod, setCalcPeriod] = useState("");
  const [calcDialogOpen, setCalcDialogOpen] = useState(false);
  const [annualYear, setAnnualYear] = useState(String(new Date().getFullYear()));

  const { data: dashboard } = useQuery<PayrollDashboard>({
    queryKey: ["payroll-dashboard"],
    queryFn: () => apiFetch(`${API}/dashboard`),
  });

  const { data: runs = [], isLoading: loadingRuns } = useQuery<PayrollRun[]>({
    queryKey: ["payroll-runs"],
    queryFn: () => apiFetch(`${API}/runs`),
  });

  const { data: payslips = [] } = useQuery<Payslip[]>({
    queryKey: ["payroll-payslips", selectedRunId],
    queryFn: () => apiFetch(`${API}/runs/${selectedRunId}/payslips`),
    enabled: !!selectedRunId,
  });

  const { data: structures = [] } = useQuery<SalaryStructure[]>({
    queryKey: ["payroll-structures"],
    queryFn: () => apiFetch(`${API}/salary-structures`),
  });

  const { data: annualSummaries = [] } = useQuery<AnnualSummary[]>({
    queryKey: ["payroll-annual", annualYear],
    queryFn: () => apiFetch(`${API}/annual-summary/${annualYear}`),
  });

  const calculateMutation = useMutation({
    mutationFn: (period: string) =>
      apiFetch(`${API}/calculate/${period}`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-dashboard"] });
      setCalcDialogOpen(false);
      setCalcPeriod("");
    },
  });

  const approveMutation = useMutation({
    mutationFn: (runId: number) =>
      apiFetch(`${API}/runs/${runId}/approve`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-runs"] });
    },
  });

  const departmentData = dashboard?.by_department?.map((d) => ({
    name: d.department,
    value: d.total,
  })) || [];

  const departmentComparisonData = dashboard?.by_department?.map((d) => ({
    department: d.department,
    total: d.total,
    avg: d.count > 0 ? Math.round(d.total / d.count) : 0,
    employees: d.count,
  })) || [];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Banknote className="h-7 w-7 text-green-400" />
            ניהול שכר ומשכורות
          </h1>
          <p className="text-sm text-gray-400 mt-1">חישוב שכר, תלושים, מבני שכר וסיכום שנתי</p>
        </div>
        <Dialog open={calcDialogOpen} onOpenChange={setCalcDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 bg-green-600 hover:bg-green-700">
              <Calculator className="h-4 w-4" />
              חשב משכורת
            </Button>
          </DialogTrigger>
          <DialogContent dir="rtl">
            <DialogHeader>
              <DialogTitle>חישוב משכורת לתקופה</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">תקופה (YYYY-MM)</label>
                <Input
                  placeholder="2026-03"
                  value={calcPeriod}
                  onChange={(e) => setCalcPeriod(e.target.value)}
                />
              </div>
              <Button
                className="w-full bg-green-600 hover:bg-green-700"
                onClick={() => {
                  if (calcPeriod) calculateMutation.mutate(calcPeriod);
                }}
                disabled={calculateMutation.isPending || !calcPeriod}
              >
                {calculateMutation.isPending ? (
                  <span className="flex items-center gap-2"><Play className="h-4 w-4 animate-spin" /> מחשב...</span>
                ) : (
                  <span className="flex items-center gap-2"><Play className="h-4 w-4" /> הפעל חישוב</span>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-muted/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">סה״כ משכורת החודש</p>
                <p className="text-2xl font-bold text-green-400">{formatCurrency(dashboard?.total_payroll_this_month)}</p>
              </div>
              <DollarSign className="h-8 w-8 text-green-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-muted/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">שכר ממוצע</p>
                <p className="text-2xl font-bold text-blue-400">{formatCurrency(dashboard?.avg_salary)}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-blue-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-muted/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">עלות מעסיק כוללת</p>
                <p className="text-2xl font-bold text-orange-400">{formatCurrency(dashboard?.total_employer_cost)}</p>
              </div>
              <Building2 className="h-8 w-8 text-orange-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-muted/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">עובדים</p>
                <p className="text-2xl font-bold text-purple-400">{dashboard?.total_employees || 0}</p>
              </div>
              <Users className="h-8 w-8 text-purple-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Department Pie */}
      {departmentData.length > 0 && (
        <Card className="bg-muted/50 border-border/50">
          <CardHeader>
            <CardTitle className="text-base text-foreground flex items-center gap-2">
              <Building2 className="h-5 w-5 text-blue-400" />
              התפלגות עלות לפי מחלקה
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={departmentData}
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {departmentData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: "8px" }}
                    formatter={(value: number) => formatCurrency(value)}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted/50">
          <TabsTrigger value="runs">ריצות שכר</TabsTrigger>
          <TabsTrigger value="payslips">תלושי שכר</TabsTrigger>
          <TabsTrigger value="structures">מבני שכר</TabsTrigger>
          <TabsTrigger value="annual">סיכום שנתי (106)</TabsTrigger>
          <TabsTrigger value="departments">השוואת מחלקות</TabsTrigger>
        </TabsList>

        {/* Payroll Runs Tab */}
        <TabsContent value="runs" className="space-y-4">
          {loadingRuns ? (
            <div className="text-center py-12 text-gray-400">טוען ריצות שכר...</div>
          ) : (
            <div className="rounded-xl border border-border/50 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 border-border">
                    <TableHead className="text-right text-gray-300">תקופה</TableHead>
                    <TableHead className="text-center text-gray-300">עובדים</TableHead>
                    <TableHead className="text-center text-gray-300">ברוטו כולל</TableHead>
                    <TableHead className="text-center text-gray-300">נטו כולל</TableHead>
                    <TableHead className="text-center text-gray-300">עלות מעסיק</TableHead>
                    <TableHead className="text-center text-gray-300">סטטוס</TableHead>
                    <TableHead className="text-center text-gray-300">פעולות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((run) => (
                    <TableRow key={run.id} className="border-border/50 hover:bg-muted/30">
                      <TableCell className="font-medium text-foreground">{run.period}</TableCell>
                      <TableCell className="text-center text-gray-300">{run.total_employees}</TableCell>
                      <TableCell className="text-center text-gray-300 font-mono">{formatCurrency(run.total_gross)}</TableCell>
                      <TableCell className="text-center text-green-400 font-mono">{formatCurrency(run.total_net)}</TableCell>
                      <TableCell className="text-center text-orange-400 font-mono">{formatCurrency(run.total_employer_cost)}</TableCell>
                      <TableCell className="text-center">
                        <Badge className={STATUS_COLORS[run.status] || STATUS_COLORS.draft}>
                          {STATUS_LABELS[run.status] || run.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => { setSelectedRunId(run.id); setActiveTab("payslips"); }}
                          >
                            <FileText className="h-3 w-3 ml-1" />
                            תלושים
                          </Button>
                          {run.status === "calculated" && (
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-700"
                              onClick={() => approveMutation.mutate(run.id)}
                              disabled={approveMutation.isPending}
                            >
                              אשר
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {runs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-gray-500">אין ריצות שכר</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* Payslips Tab */}
        <TabsContent value="payslips" className="space-y-4">
          {!selectedRunId ? (
            <div className="text-center py-12 text-gray-500">
              <FileText className="h-12 w-12 mx-auto mb-3 text-gray-600" />
              <p>בחר ריצת שכר מהטאב ״ריצות שכר״ לצפייה בתלושים</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground">תלושי שכר - ריצה #{selectedRunId}</h2>
                <Button variant="outline" size="sm" onClick={() => setSelectedRunId(null)}>
                  חזור לריצות
                </Button>
              </div>
              <div className="space-y-3">
                {payslips.map((slip) => (
                  <Card key={slip.id} className="bg-muted/50 border-border/50">
                    <CardContent className="p-4">
                      <div
                        className="flex items-center justify-between cursor-pointer"
                        onClick={() => setExpandedPayslip(expandedPayslip === slip.id ? null : slip.id)}
                      >
                        <div className="flex items-center gap-4">
                          <div>
                            <p className="font-medium text-foreground">{slip.employee_name}</p>
                            <p className="text-xs text-gray-500">{slip.department}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-6 text-sm">
                          <div className="text-center">
                            <p className="text-gray-500 text-xs">בסיס</p>
                            <p className="text-gray-300 font-mono">{formatCurrency(slip.base_salary)}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-gray-500 text-xs">ברוטו</p>
                            <p className="text-foreground font-mono font-medium">{formatCurrency(slip.gross_salary)}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-gray-500 text-xs">ניכויים</p>
                            <p className="text-red-400 font-mono">{formatCurrency(slip.total_deductions)}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-gray-500 text-xs">נטו</p>
                            <p className="text-green-400 font-mono font-bold">{formatCurrency(slip.net_salary)}</p>
                          </div>
                          {expandedPayslip === slip.id ? <ChevronUp className="h-5 w-5 text-gray-500" /> : <ChevronDown className="h-5 w-5 text-gray-500" />}
                        </div>
                      </div>

                      {expandedPayslip === slip.id && (
                        <div className="mt-4 pt-4 border-t border-border/50">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div className="space-y-2">
                              <h4 className="font-medium text-gray-300 text-xs uppercase">הכנסות</h4>
                              <div className="flex justify-between"><span className="text-gray-400">שכר בסיס</span><span className="text-foreground font-mono">{formatCurrency(slip.base_salary)}</span></div>
                              <div className="flex justify-between"><span className="text-gray-400">שעות נוספות</span><span className="text-foreground font-mono">{formatCurrency(slip.overtime_pay)}</span></div>
                              <div className="flex justify-between"><span className="text-gray-400">בונוסים</span><span className="text-foreground font-mono">{formatCurrency(slip.bonuses)}</span></div>
                              <div className="flex justify-between border-t border-border pt-1"><span className="text-gray-300 font-medium">ברוטו</span><span className="text-foreground font-mono font-bold">{formatCurrency(slip.gross_salary)}</span></div>
                            </div>
                            <div className="space-y-2">
                              <h4 className="font-medium text-gray-300 text-xs uppercase">ניכויים</h4>
                              <div className="flex justify-between"><span className="text-gray-400">מס הכנסה</span><span className="text-red-400 font-mono">{formatCurrency(slip.income_tax)}</span></div>
                              <div className="flex justify-between"><span className="text-gray-400">ביטוח לאומי</span><span className="text-red-400 font-mono">{formatCurrency(slip.national_insurance)}</span></div>
                              <div className="flex justify-between"><span className="text-gray-400">ביטוח בריאות</span><span className="text-red-400 font-mono">{formatCurrency(slip.health_insurance)}</span></div>
                              <div className="flex justify-between"><span className="text-gray-400">פנסיה עובד</span><span className="text-red-400 font-mono">{formatCurrency(slip.pension_employee)}</span></div>
                              <div className="flex justify-between border-t border-border pt-1"><span className="text-gray-300 font-medium">סה״כ ניכויים</span><span className="text-red-300 font-mono font-bold">{formatCurrency(slip.total_deductions)}</span></div>
                            </div>
                            <div className="space-y-2">
                              <h4 className="font-medium text-gray-300 text-xs uppercase">עלות מעסיק</h4>
                              <div className="flex justify-between"><span className="text-gray-400">פנסיה מעסיק</span><span className="text-orange-400 font-mono">{formatCurrency(slip.employer_pension)}</span></div>
                              <div className="flex justify-between"><span className="text-gray-400">ביטוח לאומי מעסיק</span><span className="text-orange-400 font-mono">{formatCurrency(slip.employer_national_insurance)}</span></div>
                              <div className="flex justify-between"><span className="text-gray-400">קרן פיצויים</span><span className="text-orange-400 font-mono">{formatCurrency(slip.severance_fund)}</span></div>
                              <div className="flex justify-between border-t border-border pt-1"><span className="text-gray-300 font-medium">סה״כ עלות מעסיק</span><span className="text-orange-300 font-mono font-bold">{formatCurrency(slip.total_employer_cost)}</span></div>
                            </div>
                            <div className="flex flex-col items-center justify-center bg-green-500/10 rounded-lg p-4 border border-green-500/20">
                              <p className="text-sm text-gray-400 mb-1">נטו לתשלום</p>
                              <p className="text-3xl font-bold text-green-400">{formatCurrency(slip.net_salary)}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
                {payslips.length === 0 && (
                  <div className="text-center py-8 text-gray-500">אין תלושים לריצה זו</div>
                )}
              </div>
            </>
          )}
        </TabsContent>

        {/* Salary Structures Tab */}
        <TabsContent value="structures" className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">מבני שכר</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {structures.map((structure) => (
              <Card key={structure.id} className="bg-muted/50 border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base text-foreground">{structure.name}</CardTitle>
                  <p className="text-xs text-gray-500">{structure.description}</p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {structure.components?.map((comp, i) => (
                      <div key={i} className="flex items-center justify-between text-sm py-1 border-b border-border/30 last:border-0">
                        <span className="text-gray-300">{comp.name}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={comp.type === "earning" ? "bg-green-500/10 text-green-400 border-green-500/30" : "bg-red-500/10 text-red-400 border-red-500/30"}>
                            {comp.type === "earning" ? "הכנסה" : "ניכוי"}
                          </Badge>
                          <span className="text-gray-400 font-mono text-xs">
                            {comp.percentage ? `${comp.percentage}%` : formatCurrency(comp.fixed_amount)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
            {structures.length === 0 && (
              <div className="col-span-2 text-center py-8 text-gray-500">אין מבני שכר</div>
            )}
          </div>
        </TabsContent>

        {/* Annual Summary Tab */}
        <TabsContent value="annual" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">סיכום שנתי - טופס 106</h2>
            <Select value={annualYear} onValueChange={setAnnualYear}>
              <SelectTrigger className="w-[120px] bg-muted/50 border-border">
                <SelectValue placeholder="שנה" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2026">2026</SelectItem>
                <SelectItem value="2025">2025</SelectItem>
                <SelectItem value="2024">2024</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-xl border border-border/50 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 border-border">
                  <TableHead className="text-right text-gray-300">עובד</TableHead>
                  <TableHead className="text-center text-gray-300">חודשי עבודה</TableHead>
                  <TableHead className="text-center text-gray-300">ברוטו שנתי</TableHead>
                  <TableHead className="text-center text-gray-300">מס הכנסה</TableHead>
                  <TableHead className="text-center text-gray-300">ביטוח לאומי</TableHead>
                  <TableHead className="text-center text-gray-300">פנסיה</TableHead>
                  <TableHead className="text-center text-gray-300">נטו שנתי</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {annualSummaries.map((summary) => (
                  <TableRow key={summary.employee_id} className="border-border/50 hover:bg-muted/30">
                    <TableCell className="font-medium text-foreground">{summary.employee_name}</TableCell>
                    <TableCell className="text-center text-gray-300">{summary.months_worked}</TableCell>
                    <TableCell className="text-center text-gray-300 font-mono">{formatCurrency(summary.total_gross)}</TableCell>
                    <TableCell className="text-center text-red-400 font-mono">{formatCurrency(summary.total_income_tax)}</TableCell>
                    <TableCell className="text-center text-red-400 font-mono">{formatCurrency(summary.total_national_insurance)}</TableCell>
                    <TableCell className="text-center text-blue-400 font-mono">{formatCurrency(summary.total_pension)}</TableCell>
                    <TableCell className="text-center text-green-400 font-mono font-bold">{formatCurrency(summary.total_net)}</TableCell>
                  </TableRow>
                ))}
                {annualSummaries.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-gray-500">אין נתונים לשנה {annualYear}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Department Comparison Tab */}
        <TabsContent value="departments" className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">השוואת עלויות לפי מחלקה</h2>
          {departmentComparisonData.length > 0 ? (
            <>
              <Card className="bg-muted/50 border-border/50">
                <CardContent className="pt-6">
                  <div className="h-[350px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={departmentComparisonData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="department" stroke="#9ca3af" fontSize={12} />
                        <YAxis stroke="#9ca3af" fontSize={12} tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} />
                        <Tooltip
                          contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: "8px" }}
                          formatter={(value: number) => formatCurrency(value)}
                        />
                        <Bar dataKey="total" fill="#3b82f6" name="סה״כ עלות" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="avg" fill="#10b981" name="ממוצע לעובד" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
              <div className="rounded-xl border border-border/50 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 border-border">
                      <TableHead className="text-right text-gray-300">מחלקה</TableHead>
                      <TableHead className="text-center text-gray-300">עובדים</TableHead>
                      <TableHead className="text-center text-gray-300">סה״כ עלות</TableHead>
                      <TableHead className="text-center text-gray-300">ממוצע לעובד</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {departmentComparisonData.map((dept, i) => (
                      <TableRow key={i} className="border-border/50">
                        <TableCell className="font-medium text-foreground">{dept.department}</TableCell>
                        <TableCell className="text-center text-gray-300">{dept.employees}</TableCell>
                        <TableCell className="text-center text-blue-400 font-mono">{formatCurrency(dept.total)}</TableCell>
                        <TableCell className="text-center text-green-400 font-mono">{formatCurrency(dept.avg)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : (
            <div className="text-center py-12 text-gray-500">אין נתוני מחלקות</div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
