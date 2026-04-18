import { useState, useEffect } from "react";
import { BarChart3, DollarSign, Scale, FileText, TrendingUp, TrendingDown, Clock, CheckCircle2, AlertTriangle, Layers } from "lucide-react";
import { motion } from "framer-motion";
import { Download, Printer, Send } from "lucide-react";
import ExportDropdown from "@/components/export-dropdown";
import { printPage, sendByEmail, generateEmailBody } from "@/lib/print-utils";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";

const API = "/api";
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

type ReportType = "trial-balance" | "profit-loss" | "aging";

export default function FinancialReportsPage() {
  const [report, setReport] = useState<ReportType>("trial-balance");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear());
  const [periodFrom, setPeriodFrom] = useState(1);
  const [periodTo, setPeriodTo] = useState(12);
  const token = localStorage.getItem("erp_token") || "";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const loadReport = async () => {
    setLoading(true);
    let url = "";
    switch (report) {
      case "trial-balance": url = `${API}/financial-reports/trial-balance?fiscal_year=${fiscalYear}`; break;
      case "profit-loss": url = `${API}/financial-reports/profit-loss?fiscal_year=${fiscalYear}&period_from=${periodFrom}&period_to=${periodTo}`; break;
      case "aging": url = `${API}/financial-reports/aging`; break;
    }
    try {
      const res = await authFetch(url, { headers });
      const d = await res.json();
      setData(d);
    } catch { setData(null); }
    setLoading(false);
  };
  useEffect(() => { loadReport(); }, [report, fiscalYear, periodFrom, periodTo]);

  const reports = [
    { id: "trial-balance" as ReportType, label: "מאזן בוחן", icon: Scale },
    { id: "profit-loss" as ReportType, label: "רווח והפסד", icon: TrendingUp },
    { id: "aging" as ReportType, label: "דוח גיול", icon: Clock },
  ];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold flex items-center gap-2"><BarChart3 className="text-indigo-600" /> דוחות כספיים (Financial Reports)</h1>
          <p className="text-muted-foreground mt-1">מאזן בוחן, רווח והפסד, מאזן, דוח גיול חובות</p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <div className="flex items-center gap-2 text-sm">
            <label>שנה:</label>
            <select value={fiscalYear} onChange={e => setFiscalYear(Number(e.target.value))} className="border rounded-lg px-3 py-2">
              {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          {report === "profit-loss" && (<>
            <div className="flex items-center gap-2 text-sm">
              <label>מ:</label>
              <select value={periodFrom} onChange={e => setPeriodFrom(Number(e.target.value))} className="border rounded-lg px-2 py-2">
                {Array.from({ length: 12 }, (_, i) => <option key={i+1} value={i+1}>{i+1}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <label>עד:</label>
              <select value={periodTo} onChange={e => setPeriodTo(Number(e.target.value))} className="border rounded-lg px-2 py-2">
                {Array.from({ length: 12 }, (_, i) => <option key={i+1} value={i+1}>{i+1}</option>)}
              </select>
            </div>
          </>)}
          <button onClick={() => printPage("דוחות כספיים")} className="flex items-center gap-1.5 bg-muted text-foreground px-3 py-2 rounded-lg hover:bg-slate-600 text-sm"><Printer size={16} /> הדפסה</button>
        </div>
      </div>

      <div className="flex gap-2 border-b">
        {reports.map(r => (
          <button key={r.id} onClick={() => setReport(r.id)} className={`px-4 py-2 text-sm font-medium border-b-2 flex items-center gap-2 ${report === r.id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            <r.icon size={16} />{r.label}
          </button>
        ))}
      </div>

      {loading && <div className="text-center py-8 text-muted-foreground">טוען דוח...</div>}

      {!loading && report === "trial-balance" && data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-blue-50 rounded-xl border border-blue-200 p-4 text-center"><div className="text-xs text-muted-foreground">סה"כ חובה</div><div className="text-xl font-bold text-blue-600">₪{fmt(data.summary?.totalDebit)}</div></div>
            <div className="bg-red-50 rounded-xl border border-red-200 p-4 text-center"><div className="text-xs text-muted-foreground">סה"כ זכות</div><div className="text-xl font-bold text-red-600">₪{fmt(data.summary?.totalCredit)}</div></div>
            <div className="bg-purple-50 rounded-xl border border-purple-200 p-4 text-center"><div className="text-xs text-muted-foreground">הפרש</div><div className={`text-xl font-bold ${data.summary?.isBalanced ? 'text-green-600' : 'text-red-600'}`}>₪{fmt(data.summary?.difference)}</div></div>
            <div className={`rounded-xl border p-4 text-center ${data.summary?.isBalanced ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}><div className="text-xs text-muted-foreground">סטטוס</div><div className={`text-xl font-bold ${data.summary?.isBalanced ? 'text-green-600' : 'text-red-600'}`}>{data.summary?.isBalanced ? "מאוזן ✓" : "לא מאוזן ✗"}</div></div>
          </div>
          <div className="bg-card rounded-xl shadow-sm border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b"><tr>
                <th className="px-3 py-3 text-right">מספר חשבון</th><th className="px-3 py-3 text-right">שם חשבון</th>
                <th className="px-3 py-3 text-right">סוג</th><th className="px-3 py-3 text-right">יתרת פתיחה</th>
                <th className="px-3 py-3 text-right text-blue-600">חובה</th><th className="px-3 py-3 text-right text-red-600">זכות</th>
                <th className="px-3 py-3 text-right">יתרה</th>
              </tr></thead>
              <tbody>
                {(data.accounts || []).length === 0 ? <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">אין חשבונות</td></tr> :
                (data.accounts || []).map((a: any, i: number) => (
                  <tr key={i} className="border-b hover:bg-muted/30">
                    <td className="px-3 py-2 font-mono text-indigo-600">{a.account_number}</td>
                    <td className="px-3 py-2 font-medium">{a.account_name_he || a.account_name}</td>
                    <td className="px-3 py-2 text-xs">{a.account_type}</td>
                    <td className="px-3 py-2">₪{fmt(a.opening_balance)}</td>
                    <td className="px-3 py-2 text-blue-600 font-bold">{Number(a.period_debit || a.debit_total) > 0 ? `₪${fmt(a.period_debit || a.debit_total)}` : ""}</td>
                    <td className="px-3 py-2 text-red-600 font-bold">{Number(a.period_credit || a.credit_total) > 0 ? `₪${fmt(a.period_credit || a.credit_total)}` : ""}</td>
                    <td className={`px-3 py-2 font-bold ${Number(a.current_balance) >= 0 ? 'text-green-600' : 'text-red-600'}`}>₪{fmt(a.current_balance)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="bg-muted/50 font-bold">
                <td colSpan={4} className="px-3 py-2">סה"כ</td>
                <td className="px-3 py-2 text-blue-700">₪{fmt(data.summary?.totalDebit)}</td>
                <td className="px-3 py-2 text-red-700">₪{fmt(data.summary?.totalCredit)}</td>
                <td className="px-3 py-2">₪{fmt(data.summary?.difference)}</td>
              </tr></tfoot>
            </table>
          </div>
        </div>
      )}

      {!loading && report === "profit-loss" && data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-green-50 rounded-xl border border-green-200 p-4 text-center"><div className="text-xs text-muted-foreground">סה"כ הכנסות</div><div className="text-xl font-bold text-green-600">₪{fmt(data.summary?.totalRevenue)}</div></div>
            <div className="bg-red-50 rounded-xl border border-red-200 p-4 text-center"><div className="text-xs text-muted-foreground">סה"כ הוצאות</div><div className="text-xl font-bold text-red-600">₪{fmt(data.summary?.totalExpenses)}</div></div>
            <div className={`rounded-xl border p-4 text-center ${Number(data.summary?.netIncome) >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}><div className="text-xs text-muted-foreground">רווח/הפסד נקי</div><div className={`text-xl font-bold ${Number(data.summary?.netIncome) >= 0 ? 'text-green-600' : 'text-red-600'}`}>₪{fmt(data.summary?.netIncome)}</div></div>
            <div className="bg-purple-50 rounded-xl border border-purple-200 p-4 text-center"><div className="text-xs text-muted-foreground">שיעור רווח</div><div className="text-xl font-bold text-purple-600">{Number(data.summary?.margin || 0).toFixed(1)}%</div></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-card rounded-xl shadow-sm border p-4">
              <h3 className="text-sm font-bold text-green-600 mb-3 flex items-center gap-1"><TrendingUp size={16} /> הכנסות</h3>
              {(data.revenues || []).length === 0 ? <div className="text-muted-foreground text-sm">אין חשבונות הכנסה</div> :
              <table className="w-full text-sm"><tbody>
                {(data.revenues || []).map((r: any, i: number) => (
                  <tr key={i} className="border-b border-green-100/50">
                    <td className="py-1 font-mono text-xs text-green-600">{r.account_number}</td>
                    <td className="py-1">{r.account_name}</td>
                    <td className="py-1 text-left font-bold text-green-600">₪{fmt(Math.abs(r.amount))}</td>
                  </tr>
                ))}
                <tr className="font-bold"><td colSpan={2} className="py-2">סה"כ הכנסות</td><td className="py-2 text-left text-green-700">₪{fmt(data.summary?.totalRevenue)}</td></tr>
              </tbody></table>}
            </div>
            <div className="bg-card rounded-xl shadow-sm border p-4">
              <h3 className="text-sm font-bold text-red-600 mb-3 flex items-center gap-1"><TrendingDown size={16} /> הוצאות</h3>
              {(data.expenses || []).length === 0 ? <div className="text-muted-foreground text-sm">אין חשבונות הוצאה</div> :
              <table className="w-full text-sm"><tbody>
                {(data.expenses || []).map((r: any, i: number) => (
                  <tr key={i} className="border-b border-red-100/50">
                    <td className="py-1 font-mono text-xs text-red-600">{r.account_number}</td>
                    <td className="py-1">{r.account_name}</td>
                    <td className="py-1 text-left font-bold text-red-600">₪{fmt(Math.abs(r.amount))}</td>
                  </tr>
                ))}
                <tr className="font-bold"><td colSpan={2} className="py-2">סה"כ הוצאות</td><td className="py-2 text-left text-red-700">₪{fmt(data.summary?.totalExpenses)}</td></tr>
              </tbody></table>}
            </div>
          </div>
        </div>
      )}

      {!loading && report === "balance-sheet" && data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-blue-50 rounded-xl border border-blue-200 p-4 text-center"><div className="text-xs text-muted-foreground">סה"כ נכסים</div><div className="text-xl font-bold text-blue-600">₪{fmt(data.summary?.totalAssets)}</div></div>
            <div className="bg-red-50 rounded-xl border border-red-200 p-4 text-center"><div className="text-xs text-muted-foreground">סה"כ התחייבויות</div><div className="text-xl font-bold text-red-600">₪{fmt(data.summary?.totalLiabilities)}</div></div>
            <div className="bg-purple-50 rounded-xl border border-purple-200 p-4 text-center"><div className="text-xs text-muted-foreground">הון עצמי</div><div className="text-xl font-bold text-purple-600">₪{fmt(data.summary?.totalEquity)}</div></div>
            <div className={`rounded-xl border p-4 text-center ${data.summary?.isBalanced ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}><div className="text-xs text-muted-foreground">סטטוס</div><div className={`text-xl font-bold ${data.summary?.isBalanced ? 'text-green-600' : 'text-red-600'}`}>{data.summary?.isBalanced ? "מאוזן ✓" : "לא מאוזן ✗"}</div></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-card rounded-xl shadow-sm border p-4">
              <h3 className="text-sm font-bold text-blue-600 mb-3">נכסים</h3>
              {(data.assets || []).length === 0 ? <div className="text-muted-foreground text-sm">אין חשבונות</div> :
              <table className="w-full text-sm"><tbody>
                {(data.assets || []).map((a: any, i: number) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="py-1 font-mono text-xs">{a.account_number}</td>
                    <td className="py-1 text-xs">{a.account_name}</td>
                    <td className="py-1 text-left font-bold text-blue-600">₪{fmt(a.balance)}</td>
                  </tr>
                ))}
                <tr className="font-bold"><td colSpan={2} className="py-2">סה"כ</td><td className="py-2 text-left text-blue-700">₪{fmt(data.summary?.totalAssets)}</td></tr>
              </tbody></table>}
            </div>
            <div className="bg-card rounded-xl shadow-sm border p-4">
              <h3 className="text-sm font-bold text-red-600 mb-3">התחייבויות</h3>
              {(data.liabilities || []).length === 0 ? <div className="text-muted-foreground text-sm">אין חשבונות</div> :
              <table className="w-full text-sm"><tbody>
                {(data.liabilities || []).map((a: any, i: number) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="py-1 font-mono text-xs">{a.account_number}</td>
                    <td className="py-1 text-xs">{a.account_name}</td>
                    <td className="py-1 text-left font-bold text-red-600">₪{fmt(a.balance)}</td>
                  </tr>
                ))}
                <tr className="font-bold"><td colSpan={2} className="py-2">סה"כ</td><td className="py-2 text-left text-red-700">₪{fmt(data.summary?.totalLiabilities)}</td></tr>
              </tbody></table>}
            </div>
            <div className="bg-card rounded-xl shadow-sm border p-4">
              <h3 className="text-sm font-bold text-purple-600 mb-3">הון עצמי</h3>
              {(data.equity || []).length === 0 ? <div className="text-muted-foreground text-sm">אין חשבונות</div> :
              <table className="w-full text-sm"><tbody>
                {(data.equity || []).map((a: any, i: number) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="py-1 font-mono text-xs">{a.account_number}</td>
                    <td className="py-1 text-xs">{a.account_name}</td>
                    <td className="py-1 text-left font-bold text-purple-600">₪{fmt(a.balance)}</td>
                  </tr>
                ))}
                <tr className="font-bold"><td colSpan={2} className="py-2">סה"כ</td><td className="py-2 text-left text-purple-700">₪{fmt(data.summary?.totalEquity)}</td></tr>
              </tbody></table>}
            </div>
          </div>
        </div>
      )}

      {!loading && report === "aging" && data && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-red-50 rounded-xl border border-red-200 p-4 text-center"><div className="text-xs text-muted-foreground">חוב ספקים (AP)</div><div className="text-xl font-bold text-red-600">₪{fmt(data.summary?.apTotal)}</div></div>
            <div className="bg-green-50 rounded-xl border border-green-200 p-4 text-center"><div className="text-xs text-muted-foreground">חוב לקוחות (AR)</div><div className="text-xl font-bold text-green-600">₪{fmt(data.summary?.arTotal)}</div></div>
            <div className={`rounded-xl border p-4 text-center ${Number(data.summary?.netPosition) >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}><div className="text-xs text-muted-foreground">מצב נטו</div><div className={`text-xl font-bold ${Number(data.summary?.netPosition) >= 0 ? 'text-green-600' : 'text-red-600'}`}>₪{fmt(data.summary?.netPosition)}</div></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-card rounded-xl shadow-sm border overflow-x-auto">
              <div className="px-4 py-3 border-b bg-red-50">
                <h3 className="text-sm font-bold text-red-600">גיול חובות ספקים (AP)</h3>
              </div>
              <table className="w-full text-xs">
                <thead className="bg-muted/30"><tr>
                  <th className="px-2 py-2 text-right">שם</th><th className="px-2 py-2 text-right">חשבוניות</th>
                  <th className="px-2 py-2 text-right">סה"כ</th><th className="px-2 py-2 text-right text-green-600">שוטף</th>
                  <th className="px-2 py-2 text-right text-yellow-600">30</th><th className="px-2 py-2 text-right text-orange-600">60</th>
                  <th className="px-2 py-2 text-right text-red-600">90</th><th className="px-2 py-2 text-right text-red-700">90+</th>
                </tr></thead>
                <tbody>
                  {(data.accountsPayable || []).length === 0 ? <tr><td colSpan={8} className="text-center py-6 text-muted-foreground">אין נתונים</td></tr> :
                  (data.accountsPayable || []).map((r: any, i: number) => (
                    <tr key={i} className="border-b hover:bg-muted/30">
                      <td className="px-2 py-1.5 font-medium">{r.name}</td>
                      <td className="px-2 py-1.5 text-center">{r.invoice_count}</td>
                      <td className="px-2 py-1.5 font-bold text-red-600">₪{fmt(r.total_balance)}</td>
                      <td className="px-2 py-1.5 text-green-600">{Number(r.current_amount) > 0 ? `₪${fmt(r.current_amount)}` : "-"}</td>
                      <td className="px-2 py-1.5 text-yellow-600">{Number(r.days_30) > 0 ? `₪${fmt(r.days_30)}` : "-"}</td>
                      <td className="px-2 py-1.5 text-orange-600">{Number(r.days_60) > 0 ? `₪${fmt(r.days_60)}` : "-"}</td>
                      <td className="px-2 py-1.5 text-red-600">{Number(r.days_90) > 0 ? `₪${fmt(r.days_90)}` : "-"}</td>
                      <td className="px-2 py-1.5 text-red-700 font-bold">{Number(r.days_90_plus) > 0 ? `₪${fmt(r.days_90_plus)}` : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="bg-card rounded-xl shadow-sm border overflow-x-auto">
              <div className="px-4 py-3 border-b bg-green-50">
                <h3 className="text-sm font-bold text-green-600">גיול חובות לקוחות (AR)</h3>
              </div>
              <table className="w-full text-xs">
                <thead className="bg-muted/30"><tr>
                  <th className="px-2 py-2 text-right">שם</th><th className="px-2 py-2 text-right">חשבוניות</th>
                  <th className="px-2 py-2 text-right">סה"כ</th><th className="px-2 py-2 text-right text-green-600">שוטף</th>
                  <th className="px-2 py-2 text-right text-yellow-600">30</th><th className="px-2 py-2 text-right text-orange-600">60</th>
                  <th className="px-2 py-2 text-right text-red-600">90</th><th className="px-2 py-2 text-right text-red-700">90+</th>
                </tr></thead>
                <tbody>
                  {(data.accountsReceivable || []).length === 0 ? <tr><td colSpan={8} className="text-center py-6 text-muted-foreground">אין נתונים</td></tr> :
                  (data.accountsReceivable || []).map((r: any, i: number) => (
                    <tr key={i} className="border-b hover:bg-muted/30">
                      <td className="px-2 py-1.5 font-medium">{r.name}</td>
                      <td className="px-2 py-1.5 text-center">{r.invoice_count}</td>
                      <td className="px-2 py-1.5 font-bold text-green-600">₪{fmt(r.total_balance)}</td>
                      <td className="px-2 py-1.5 text-green-600">{Number(r.current_amount) > 0 ? `₪${fmt(r.current_amount)}` : "-"}</td>
                      <td className="px-2 py-1.5 text-yellow-600">{Number(r.days_30) > 0 ? `₪${fmt(r.days_30)}` : "-"}</td>
                      <td className="px-2 py-1.5 text-orange-600">{Number(r.days_60) > 0 ? `₪${fmt(r.days_60)}` : "-"}</td>
                      <td className="px-2 py-1.5 text-red-600">{Number(r.days_90) > 0 ? `₪${fmt(r.days_90)}` : "-"}</td>
                      <td className="px-2 py-1.5 text-red-700 font-bold">{Number(r.days_90_plus) > 0 ? `₪${fmt(r.days_90_plus)}` : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <div className="bg-card border border-border/50 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-foreground mb-3">רשומות קשורות</h3>
          <RelatedRecords entityType="financial-reports" entityId="dashboard" />
        </div>
        <div className="bg-card border border-border/50 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-foreground mb-3">היסטוריה</h3>
          <ActivityLog entityType="financial-reports" entityId="dashboard" />
        </div>
      </div>
    </div>
  );
}
