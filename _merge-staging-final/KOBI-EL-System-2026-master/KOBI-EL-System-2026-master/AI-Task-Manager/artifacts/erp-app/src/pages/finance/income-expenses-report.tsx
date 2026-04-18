import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3, Download, Eye, MoreVertical, FileText, FileSpreadsheet,
  Archive, FileDown, X, Printer, File
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { authJson } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";

const API = "/api";
function fmt(n: number) { return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(n); }

const MONTHS_HE = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
const MONTHS_SHORT = ["ינו", "פבר", "מרץ", "אפר", "מאי", "יוני", "יולי", "אוג", "ספט", "אוק", "נוב", "דצמ"];

const PERIOD_OPTIONS = [
  { value: "monthly", label: "חודשי" },
  { value: "bimonthly", label: "דו-חודשי" },
  { value: "yearly", label: "שנתי" },
];

export default function IncomeExpensesReportPage() {
  const [period, setPeriod] = useState("monthly");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [fromMonth, setFromMonth] = useState("1");
  const [toMonth, setToMonth] = useState("12");
  const [showDownloadDialog, setShowDownloadDialog] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  const { data: reportData } = useQuery({
    queryKey: ["income-expenses-report", year, period, fromMonth, toMonth],
    queryFn: () => authJson(`${API}/finance/reports/income-expenses?year=${year}&period=${period}&from_month=${fromMonth}&to_month=${toMonth}`),
  });

  const monthsToShow: number[] = [];
  const from = parseInt(fromMonth);
  const to = parseInt(toMonth);
  for (let i = from; i <= to; i++) {
    monthsToShow.push(i);
  }

  const incomeData = reportData?.income || {};
  const expenseData = reportData?.expenses || {};
  const filesData = reportData?.files || {};

  const totalIncomeTaxableVat = monthsToShow.reduce((s, m) => s + (Number(incomeData[m]?.taxable_with_vat) || 0), 0);
  const totalIncomeTaxable = monthsToShow.reduce((s, m) => s + (Number(incomeData[m]?.taxable) || 0), 0);
  const totalVat = monthsToShow.reduce((s, m) => s + (Number(incomeData[m]?.vat) || 0), 0);
  const totalRetroactive = monthsToShow.reduce((s, m) => s + (Number(incomeData[m]?.retroactive) || 0), 0);
  const totalExpenses = monthsToShow.reduce((s, m) => s + (Number(expenseData[m]?.total) || 0), 0);
  const totalExpensesNoVat = monthsToShow.reduce((s, m) => s + (Number(expenseData[m]?.without_vat) || 0), 0);
  const totalExpensesVat = monthsToShow.reduce((s, m) => s + (Number(expenseData[m]?.vat) || 0), 0);

  const handleDownload = (type: string) => {
    setShowDownloadDialog(false);
    const url = `${API}/finance/reports/income-expenses/download?year=${year}&period=${period}&from_month=${fromMonth}&to_month=${toMonth}&format=${type}`;
    const token = localStorage.getItem("erp_token") || "";
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        if (r.ok) return r.blob();
        throw new Error("Download failed");
      })
      .then(blob => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `income-expenses-${year}.${type === "xlsx" ? "xlsx" : type === "zip" ? "zip" : "pdf"}`;
        a.click();
      })
      .catch(() => {});
  };

  const handleExport = (type: string) => {
    setShowExportMenu(false);
    const url = `${API}/finance/reports/income-expenses/export?year=${year}&period=${period}&from_month=${fromMonth}&to_month=${toMonth}&type=${type}`;
    const token = localStorage.getItem("erp_token") || "";
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        if (r.ok) return r.blob();
        throw new Error("Export failed");
      })
      .then(blob => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `export-${type}-${year}.txt`;
        a.click();
      })
      .catch(() => {});
  };

  return (
    <div className="space-y-4 sm:space-y-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-emerald-400" /> דוח הכנסות והוצאות
          </h1>
          <p className="text-muted-foreground mt-1">דוח מפורט לפי חודשים — שנת {year}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="border-slate-600" onClick={() => setShowDownloadDialog(true)}>
            <Download className="w-4 h-4 ml-2" />הורדת חומרים
          </Button>
          <div className="relative" ref={exportMenuRef}>
            <Button variant="outline" className="border-slate-600 px-2" onClick={() => setShowExportMenu(!showExportMenu)}>
              <MoreVertical className="w-4 h-4" />
            </Button>
            {showExportMenu && (
              <div className="absolute left-0 top-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-50 min-w-0 sm:min-w-[200px]">
                <button onClick={() => handleExport("hashbeshbet")}
                  className="w-full text-right px-4 py-3 text-sm text-foreground hover:bg-slate-700 flex items-center gap-2 rounded-t-lg">
                  <FileSpreadsheet className="w-4 h-4 text-green-400" />
                  יצוא לחשבשבת
                </button>
                <button onClick={() => handleExport("unified")}
                  className="w-full text-right px-4 py-3 text-sm text-foreground hover:bg-slate-700 flex items-center gap-2 rounded-b-lg border-t border-slate-700">
                  <Archive className="w-4 h-4 text-blue-400" />
                  יצוא מאוחד
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {showDownloadDialog && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowDownloadDialog(false)}>
          <div className="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-700">
              <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Download className="w-5 h-5 text-blue-400" /> הורדת חומרים
              </h3>
              <button onClick={() => setShowDownloadDialog(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-muted-foreground mb-4">בחר את פורמט ההורדה הרצוי:</p>
              <button onClick={() => handleDownload("pdf")}
                className="w-full flex items-center gap-3 p-4 bg-slate-700/50 hover:bg-slate-700 rounded-lg border border-slate-600 transition-all group">
                <div className="p-2 bg-red-500/20 rounded-lg group-hover:bg-red-500/30">
                  <FileText className="w-6 h-6 text-red-400" />
                </div>
                <div className="text-right">
                  <div className="text-foreground font-medium">PDF</div>
                  <div className="text-xs text-muted-foreground">הורדת הדוח כקובץ PDF</div>
                </div>
              </button>
              <button onClick={() => handleDownload("xlsx")}
                className="w-full flex items-center gap-3 p-4 bg-slate-700/50 hover:bg-slate-700 rounded-lg border border-slate-600 transition-all group">
                <div className="p-2 bg-green-500/20 rounded-lg group-hover:bg-green-500/30">
                  <FileSpreadsheet className="w-6 h-6 text-green-400" />
                </div>
                <div className="text-right">
                  <div className="text-foreground font-medium">XLSX (אקסל)</div>
                  <div className="text-xs text-muted-foreground">הורדת הדוח כגיליון אלקטרוני</div>
                </div>
              </button>
              <button onClick={() => handleDownload("zip")}
                className="w-full flex items-center gap-3 p-4 bg-slate-700/50 hover:bg-slate-700 rounded-lg border border-slate-600 transition-all group">
                <div className="p-2 bg-yellow-500/20 rounded-lg group-hover:bg-yellow-500/30">
                  <Archive className="w-6 h-6 text-yellow-400" />
                </div>
                <div className="text-right">
                  <div className="text-foreground font-medium">ZIP (קבצי הוצאות)</div>
                  <div className="text-xs text-muted-foreground">הורדת כל קבצי ההוצאות בארכיון ZIP</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      <Card className="bg-slate-900/50 border-slate-700/50">
        <CardContent className="p-4">
          <div className="flex gap-3 items-end flex-wrap">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">תקופה</label>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="w-32 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {PERIOD_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">שנה</label>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger className="w-24 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {[2024, 2025, 2026].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">מחודש</label>
              <Select value={fromMonth} onValueChange={setFromMonth}>
                <SelectTrigger className="w-28 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {MONTHS_HE.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">עד חודש</label>
              <Select value={toMonth} onValueChange={setToMonth}>
                <SelectTrigger className="w-28 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {MONTHS_HE.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button className="bg-blue-600 hover:bg-blue-700">
              <Eye className="w-4 h-4 ml-2" />הצגה
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-900/50 border-slate-700/50">
        <CardHeader>
          <CardTitle className="text-base text-green-400">מסמכי הכנסות — לפי תאריך מסמך</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="p-3 text-right text-muted-foreground font-medium sticky right-0 bg-slate-900 min-w-[180px]">סוג</th>
                  {monthsToShow.map(m => (
                    <th key={m} className="p-3 text-center text-muted-foreground font-medium min-w-[100px]">{MONTHS_SHORT[m - 1]}</th>
                  ))}
                  <th className="p-3 text-center text-muted-foreground font-medium min-w-[110px] bg-slate-800/50">סה"כ</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-800/50">
                  <td className="p-3 text-foreground font-medium sticky right-0 bg-slate-900">הכנסות חייבות כולל מע"מ</td>
                  {monthsToShow.map(m => {
                    const val = Number(incomeData[m]?.taxable_with_vat) || 0;
                    return <td key={m} className="p-3 text-center text-foreground">{fmt(val)}</td>;
                  })}
                  <td className="p-3 text-center text-green-400 font-bold bg-slate-800/30">{fmt(totalIncomeTaxableVat)}</td>
                </tr>
                <tr className="border-b border-slate-800/50">
                  <td className="p-3 text-slate-300 sticky right-0 bg-slate-900">הכנסות חייבות</td>
                  {monthsToShow.map(m => {
                    const val = Number(incomeData[m]?.taxable) || 0;
                    return <td key={m} className="p-3 text-center text-slate-300">{fmt(val)}</td>;
                  })}
                  <td className="p-3 text-center text-slate-300 font-medium bg-slate-800/30">{fmt(totalIncomeTaxable)}</td>
                </tr>
                <tr className="border-b border-slate-800/50 bg-slate-800/20">
                  <td className="p-3 text-muted-foreground sticky right-0 bg-slate-900">17% מע"מ</td>
                  {monthsToShow.map(m => {
                    const val = Number(incomeData[m]?.vat) || 0;
                    return <td key={m} className="p-3 text-center text-muted-foreground">{fmt(val)}</td>;
                  })}
                  <td className="p-3 text-center text-muted-foreground font-medium bg-slate-800/30">{fmt(totalVat)}</td>
                </tr>
                <tr className="border-b border-slate-700/50 bg-blue-500/5">
                  <td className="p-3 text-blue-400 font-medium sticky right-0 bg-slate-900">הכנסות רטרואקטיביות</td>
                  {monthsToShow.map(m => {
                    const val = incomeData[m]?.retroactive || 0;
                    return <td key={m} className="p-3 text-center text-blue-400">{fmt(val)}</td>;
                  })}
                  <td className="p-3 text-center text-blue-400 font-medium bg-slate-800/30">{fmt(totalRetroactive)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-900/50 border-slate-700/50">
        <CardHeader>
          <CardTitle className="text-base text-red-400">הוצאות</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="p-3 text-right text-muted-foreground font-medium sticky right-0 bg-slate-900 min-w-[180px]">סוג</th>
                  {monthsToShow.map(m => (
                    <th key={m} className="p-3 text-center text-muted-foreground font-medium min-w-[100px]">{MONTHS_SHORT[m - 1]}</th>
                  ))}
                  <th className="p-3 text-center text-muted-foreground font-medium min-w-[110px] bg-slate-800/50">סה"כ</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-800/50">
                  <td className="p-3 text-foreground font-medium sticky right-0 bg-slate-900">הוצאות כולל מע"מ</td>
                  {monthsToShow.map(m => {
                    const val = Number(expenseData[m]?.total) || 0;
                    return <td key={m} className="p-3 text-center text-red-400">{fmt(val)}</td>;
                  })}
                  <td className="p-3 text-center text-red-400 font-bold bg-slate-800/30">{fmt(totalExpenses)}</td>
                </tr>
                <tr className="border-b border-slate-800/50">
                  <td className="p-3 text-slate-300 sticky right-0 bg-slate-900">הוצאות ללא מע"מ</td>
                  {monthsToShow.map(m => {
                    const val = Number(expenseData[m]?.without_vat) || 0;
                    return <td key={m} className="p-3 text-center text-slate-300">{fmt(val)}</td>;
                  })}
                  <td className="p-3 text-center text-slate-300 font-medium bg-slate-800/30">{fmt(totalExpensesNoVat)}</td>
                </tr>
                <tr className="border-b border-slate-800/50 bg-slate-800/20">
                  <td className="p-3 text-muted-foreground sticky right-0 bg-slate-900">17% מע"מ תשומות</td>
                  {monthsToShow.map(m => {
                    const val = Number(expenseData[m]?.vat) || 0;
                    return <td key={m} className="p-3 text-center text-muted-foreground">{fmt(val)}</td>;
                  })}
                  <td className="p-3 text-center text-muted-foreground font-medium bg-slate-800/30">{fmt(totalExpensesVat)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-900/50 border-slate-700/50">
        <CardHeader><CardTitle className="text-base text-orange-400">קבצי הוצאות — כמות לפי חודש</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="p-3 text-right text-muted-foreground font-medium sticky right-0 bg-slate-900 min-w-[180px]">חודש</th>
                  {monthsToShow.map(m => (
                    <th key={m} className="p-3 text-center text-muted-foreground font-medium min-w-[100px]">{MONTHS_SHORT[m - 1]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-800/50">
                  <td className="p-3 text-foreground font-medium sticky right-0 bg-slate-900">כמות קבצים</td>
                  {monthsToShow.map(m => {
                    const count = Number(filesData[m]?.count) || 0;
                    return (
                      <td key={m} className="p-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <span className="text-foreground">{count}</span>
                          {count > 0 && (
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground">
                              <Download className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-gradient-to-r from-green-900/20 to-red-900/20 border-slate-700/50">
        <CardContent className="p-5">
          <h3 className="text-base font-bold text-foreground mb-4">סיכום תקופה</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-3 bg-slate-800/50 rounded-lg">
              <div className="text-xs text-muted-foreground mb-1">הכנסות חייבות</div>
              <div className="text-lg font-bold text-green-400">{fmt(totalIncomeTaxable)}</div>
            </div>
            <div className="text-center p-3 bg-slate-800/50 rounded-lg">
              <div className="text-xs text-muted-foreground mb-1">הוצאות</div>
              <div className="text-lg font-bold text-red-400">{fmt(totalExpenses)}</div>
            </div>
            <div className="text-center p-3 bg-slate-800/50 rounded-lg">
              <div className="text-xs text-muted-foreground mb-1">מע"מ נטו</div>
              <div className="text-lg font-bold text-yellow-400">{fmt(totalVat - totalExpensesVat)}</div>
            </div>
            <div className="text-center p-3 bg-slate-800/50 rounded-lg">
              <div className="text-xs text-muted-foreground mb-1">רווח גולמי</div>
              <div className={`text-lg font-bold ${totalIncomeTaxable - totalExpensesNoVat >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {fmt(totalIncomeTaxable - totalExpensesNoVat)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <Card className="bg-card border-border">
          <CardHeader><CardTitle className="text-sm text-foreground">רשומות קשורות</CardTitle></CardHeader>
          <CardContent><RelatedRecords entityType="income-expenses-report" entityId="dashboard" /></CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardHeader><CardTitle className="text-sm text-foreground">היסטוריה</CardTitle></CardHeader>
          <CardContent><ActivityLog entityType="income-expenses-report" entityId="dashboard" /></CardContent>
        </Card>
      </div>
    </div>
  );
}
