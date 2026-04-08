import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import {
  Scale, Building2, AlertTriangle, TrendingUp, ChevronDown, ChevronLeft,
  Download, Printer, FileSpreadsheet, X, ArrowLeft
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { exportToExcel, exportToPDF } from "@/lib/export-utils";
import { printPage } from "@/lib/print-utils";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";

const API = "";
const token = () => localStorage.getItem("erp_token") || localStorage.getItem("token") || "";
const headers = () => ({ Authorization: `Bearer ${token()}`, "Content-Type": "application/json" });

function fmt(n: number) {
  return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

function fmtChange(n: number) {
  const sign = n > 0 ? "+" : "";
  return sign + new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

interface AccountRow {
  account_number: string;
  account_name: string;
  account_type: string;
  account_subtype: string | null;
  balance: number;
  compare_balance?: number;
  change?: number;
}

interface BalanceSheetData {
  assets: AccountRow[];
  liabilities: AccountRow[];
  equity: AccountRow[];
  summary: {
    totalAssets: number;
    totalLiabilities: number;
    totalEquity: number;
    liabilitiesAndEquity: number;
    isBalanced: boolean;
    compare_year: number | null;
    cmpTotalAssets?: number;
    cmpTotalLiabilities?: number;
    cmpTotalEquity?: number;
  };
  period: { fiscal_year: number; compare_year: number | null };
}

interface DrilldownData {
  account_number: string;
  account: { account_name: string; account_type: string; account_subtype: string } | null;
  opening_balance: number;
  closing_balance: number;
  fiscal_year: number;
  transactions: {
    id: number;
    entry_date: string;
    entry_number: string;
    description: string;
    reference: string;
    source_type: string;
    debit: number;
    credit: number;
    net: number;
    running_balance: number;
  }[];
}

const SUBTYPE_LABELS: Record<string, string> = {
  current_assets: "נכסים שוטפים",
  fixed_assets: "רכוש קבוע",
  other_assets: "נכסים אחרים",
  intangible_assets: "נכסים בלתי מוחשיים",
  current_liabilities: "התחייבויות שוטפות",
  long_term_liabilities: "התחייבויות לזמן ארוך",
  other_liabilities: "התחייבויות אחרות",
  paid_in_capital: "הון מניות",
  retained_earnings: "עודפים",
  other_equity: "הון אחר",
};

function subtypeLabel(st: string | null) {
  if (!st) return "כללי";
  return SUBTYPE_LABELS[st] || st;
}

function groupBySubtype(rows: AccountRow[]): Record<string, AccountRow[]> {
  const groups: Record<string, AccountRow[]> = {};
  for (const row of rows) {
    const key = row.account_subtype || "other";
    if (!groups[key]) groups[key] = [];
    groups[key].push(row);
  }
  return groups;
}

interface AccountTableProps {
  title: string;
  colorClass: string;
  bgClass: string;
  rows: AccountRow[];
  total: number;
  compareYear: number | null;
  cmpTotal?: number;
  onDrilldown: (accountNumber: string) => void;
}

function AccountTable({ title, colorClass, bgClass, rows, total, compareYear, cmpTotal, onDrilldown }: AccountTableProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const groups = groupBySubtype(rows);

  const toggleGroup = (key: string) => {
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className={`${bgClass} border-b`}>
        <CardTitle className={`text-base flex items-center justify-between ${colorClass}`}>
          <span>{title}</span>
          <span className="text-lg font-bold">{fmt(total)}</span>
        </CardTitle>
        {compareYear && cmpTotal !== undefined && (
          <div className="text-xs text-muted-foreground flex justify-between mt-1">
            <span>השוואה {compareYear}: {fmt(cmpTotal)}</span>
            <span className={total - cmpTotal >= 0 ? "text-green-600" : "text-red-600"}>
              {fmtChange(total - cmpTotal)}
            </span>
          </div>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {Object.entries(groups).map(([subtype, accounts]) => {
          const subtypeTotal = accounts.reduce((s, a) => s + a.balance, 0);
          const cmpSubtypeTotal = accounts.reduce((s, a) => s + (a.compare_balance ?? 0), 0);
          const isCollapsed = collapsed[subtype];
          return (
            <div key={subtype}>
              <button
                onClick={() => toggleGroup(subtype)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/30 dark:bg-slate-800/50 hover:bg-muted/50 dark:hover:bg-slate-800 border-b border-border dark:border-slate-700 text-sm font-semibold"
              >
                <span className="flex items-center gap-2">
                  {isCollapsed ? <ChevronLeft size={14} /> : <ChevronDown size={14} />}
                  {subtypeLabel(subtype)}
                  <span className="text-xs font-normal text-muted-foreground">({accounts.length})</span>
                </span>
                <div className="flex items-center gap-3">
                  {compareYear && (
                    <span className={`text-xs ${subtypeTotal - cmpSubtypeTotal >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {fmtChange(subtypeTotal - cmpSubtypeTotal)}
                    </span>
                  )}
                  <span className={colorClass}>{fmt(subtypeTotal)}</span>
                </div>
              </button>

              {!isCollapsed && (
                <div>
                  {accounts.map((acct) => (
                    <div
                      key={acct.account_number}
                      className="flex items-center justify-between px-6 py-2 border-b border-slate-100 dark:border-slate-800 hover:bg-muted/30 dark:hover:bg-slate-800/30 cursor-pointer group text-sm"
                      onClick={() => onDrilldown(acct.account_number)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-mono text-xs text-muted-foreground shrink-0">{acct.account_number}</span>
                        <span className="text-foreground dark:text-slate-300 truncate group-hover:text-blue-600 transition-colors">
                          {acct.account_name}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        {compareYear && acct.change !== undefined && (
                          <span className={`text-xs w-24 text-left ${acct.change >= 0 ? "text-green-600" : "text-red-600"}`}>
                            {fmtChange(acct.change)}
                          </span>
                        )}
                        {compareYear && acct.compare_balance !== undefined && (
                          <span className="text-xs text-muted-foreground w-28 text-left">{fmt(acct.compare_balance)}</span>
                        )}
                        <span className={`font-semibold w-28 text-left ${colorClass}`}>{fmt(acct.balance)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <div className={`flex justify-between px-4 py-3 font-bold text-sm border-t-2 ${bgClass}`}>
          <span>סה"כ {title}</span>
          <span className={colorClass}>{fmt(total)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

interface DrilldownPanelProps {
  accountNumber: string;
  fiscalYear: number;
  onClose: () => void;
}

function DrilldownPanel({ accountNumber, fiscalYear, onClose }: DrilldownPanelProps) {
  const { data, isLoading } = useQuery<DrilldownData>({
    queryKey: ["balance-sheet-drilldown", accountNumber, fiscalYear],
    queryFn: async () => {
      const res = await fetch(
        `${API}/financial-reports/balance-sheet/account-transactions?account_number=${encodeURIComponent(accountNumber)}&fiscal_year=${fiscalYear}`,
        { headers: headers() }
      );
      if (!res.ok) throw new Error("שגיאה בטעינת תנועות");
      return res.json();
    },
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center pt-8" onClick={onClose}>
      <div
        className="bg-card border border-border text-foreground rounded-xl shadow-2xl w-full max-w-4xl mx-4 max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="font-bold text-lg flex items-center gap-2">
              <ArrowLeft size={18} className="text-blue-500" />
              {data?.account?.account_name || accountNumber}
            </h2>
            <p className="text-sm text-muted-foreground">
              שנת {fiscalYear} | {data?.transactions?.length ?? "—"} תנועות
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted/50 dark:hover:bg-slate-800 rounded-lg">
            <X size={18} />
          </button>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
          </div>
        ) : (
          <div className="flex-1 overflow-auto">
            <div className="grid grid-cols-2 gap-4 p-4 border-b bg-muted/30 dark:bg-slate-800/50">
              <div>
                <p className="text-xs text-muted-foreground">יתרת פתיחה</p>
                <p className="font-bold text-lg">{fmt(data?.opening_balance ?? 0)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">יתרת סגירה</p>
                <p className="font-bold text-lg">{fmt(data?.closing_balance ?? 0)}</p>
              </div>
            </div>

            {(!data?.transactions || data.transactions.length === 0) ? (
              <div className="py-12 text-center text-muted-foreground">אין תנועות בשנה זו</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/30 dark:bg-slate-800 border-b">
                  <tr>
                    <th className="px-3 py-2 text-right text-muted-foreground font-medium">תאריך</th>
                    <th className="px-3 py-2 text-right text-muted-foreground font-medium">מספר</th>
                    <th className="px-3 py-2 text-right text-muted-foreground font-medium">תיאור</th>
                    <th className="px-3 py-2 text-right text-muted-foreground font-medium">חובה</th>
                    <th className="px-3 py-2 text-right text-muted-foreground font-medium">זכות</th>
                    <th className="px-3 py-2 text-right text-muted-foreground font-medium">יתרה שוטפת</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.transactions.map((tx, i) => (
                    <tr key={tx.id || i} className="border-b hover:bg-muted/30 dark:hover:bg-slate-800/30">
                      <td className="px-3 py-2 text-muted-foreground text-xs whitespace-nowrap">{tx.entry_date}</td>
                      <td className="px-3 py-2 font-mono text-xs text-blue-600">{tx.entry_number}</td>
                      <td className="px-3 py-2 max-w-xs truncate text-foreground dark:text-slate-300">
                        {tx.description || tx.reference}
                      </td>
                      <td className="px-3 py-2 text-blue-600">{tx.debit > 0 ? fmt(tx.debit) : ""}</td>
                      <td className="px-3 py-2 text-red-600">{tx.credit > 0 ? fmt(tx.credit) : ""}</td>
                      <td className={`px-3 py-2 font-semibold ${tx.running_balance >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {fmt(tx.running_balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function BalanceSheetPage() {
  const currentYear = new Date().getFullYear();
  const [fiscalYear, setFiscalYear] = useState(currentYear);
  const [compareYear, setCompareYear] = useState<number | null>(null);
  const [drilldownAccount, setDrilldownAccount] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<BalanceSheetData>({
    queryKey: ["balance-sheet", fiscalYear, compareYear],
    queryFn: async () => {
      const params = new URLSearchParams({ fiscal_year: String(fiscalYear) });
      if (compareYear) params.set("compare_year", String(compareYear));
      const res = await authFetch(`${API}/financial-reports/balance-sheet?${params}`, { headers: headers() });
      if (!res.ok) throw new Error("שגיאה בטעינת מאזן");
      return res.json();
    },
  });

  const getExportHeaders = () => ({
    section: "סעיף",
    account_number: "מספר חשבון",
    account_name: "שם חשבון",
    account_subtype: "תת-סוג",
    balance: `יתרה ${fiscalYear}`,
    ...(compareYear ? { compare_balance: `יתרה ${compareYear}`, change: "שינוי" } : {}),
  });

  const getExportRows = () => {
    if (!data) return [];
    return [
      ...(Array.isArray(data.assets) ? data.assets : []).map(a => ({ ...a, section: "נכסים" })),
      ...(Array.isArray(data.liabilities) ? data.liabilities : []).map(l => ({ ...l, section: "התחייבויות" })),
      ...(Array.isArray(data.equity) ? data.equity : []).map(e => ({ ...e, section: "הון עצמי" })),
    ];
  };

  const handleExportExcel = () => {
    if (!data) return;
    exportToExcel(getExportRows(), getExportHeaders(), `מאזן-${fiscalYear}`);
  };

  const handleExportPDF = () => {
    if (!data) return;
    exportToPDF(getExportRows(), getExportHeaders(), `מאזן - שנת ${fiscalYear}`);
  };

  const handlePrint = () => {
    printPage(`מאזן - שנת ${fiscalYear}`);
  };

  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-64 text-red-500">
        <AlertTriangle className="w-5 h-5 mr-2" /> שגיאה בטעינת נתוני המאזן
      </div>
    );
  }

  const { summary } = data;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Scale className="w-6 h-6 text-yellow-500" />
            מאזן
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            נכסים, התחייבויות והון עצמי לפי לוח חשבונות — שנת {fiscalYear}
            {compareYear ? ` | השוואה ל-${compareYear}` : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 no-print">
          <div className="flex items-center gap-1.5 text-sm">
            <label className="text-muted-foreground">שנה:</label>
            <select
              value={fiscalYear}
              onChange={e => setFiscalYear(Number(e.target.value))}
              className="border rounded-lg px-2 py-1.5 text-sm bg-card dark:bg-slate-800 dark:border-slate-600"
            >
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            <label className="text-muted-foreground">השוואה:</label>
            <select
              value={compareYear ?? ""}
              onChange={e => setCompareYear(e.target.value ? Number(e.target.value) : null)}
              className="border rounded-lg px-2 py-1.5 text-sm bg-card dark:bg-slate-800 dark:border-slate-600"
            >
              <option value="">ללא</option>
              {years.filter(y => y !== fiscalYear).map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-foreground px-3 py-1.5 rounded-lg text-sm transition-colors"
            >
              <FileSpreadsheet size={15} /> Excel
            </button>
            <button
              onClick={handleExportPDF}
              className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-foreground px-3 py-1.5 rounded-lg text-sm transition-colors"
            >
              <Download size={15} /> PDF
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 bg-slate-600 hover:bg-slate-700 text-foreground px-3 py-1.5 rounded-lg text-sm transition-colors"
            >
              <Printer size={15} /> הדפסה
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-400/30">
          <CardContent className="p-4">
            <TrendingUp className="w-5 h-5 text-blue-500 mb-1.5" />
            <p className="text-xl font-bold">{fmt(summary.totalAssets)}</p>
            <p className="text-xs text-blue-500/70 mt-0.5">סה"כ נכסים</p>
            {compareYear && summary.cmpTotalAssets !== undefined && (
              <p className={`text-xs mt-1 ${summary.totalAssets - summary.cmpTotalAssets >= 0 ? "text-green-600" : "text-red-600"}`}>
                {fmtChange(summary.totalAssets - summary.cmpTotalAssets)}
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-400/30">
          <CardContent className="p-4">
            <AlertTriangle className="w-5 h-5 text-red-500 mb-1.5" />
            <p className="text-xl font-bold">{fmt(summary.totalLiabilities)}</p>
            <p className="text-xs text-red-500/70 mt-0.5">סה"כ התחייבויות</p>
            {compareYear && summary.cmpTotalLiabilities !== undefined && (
              <p className={`text-xs mt-1 ${summary.totalLiabilities - summary.cmpTotalLiabilities <= 0 ? "text-green-600" : "text-red-600"}`}>
                {fmtChange(summary.totalLiabilities - summary.cmpTotalLiabilities)}
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-400/30">
          <CardContent className="p-4">
            <Building2 className="w-5 h-5 text-purple-500 mb-1.5" />
            <p className="text-xl font-bold">{fmt(summary.totalEquity)}</p>
            <p className="text-xs text-purple-500/70 mt-0.5">הון עצמי</p>
            {compareYear && summary.cmpTotalEquity !== undefined && (
              <p className={`text-xs mt-1 ${summary.totalEquity - summary.cmpTotalEquity >= 0 ? "text-green-600" : "text-red-600"}`}>
                {fmtChange(summary.totalEquity - summary.cmpTotalEquity)}
              </p>
            )}
          </CardContent>
        </Card>
        <Card className={`${summary.isBalanced ? "bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-400/30" : "bg-gradient-to-br from-orange-500/10 to-orange-600/5 border-orange-400/30"}`}>
          <CardContent className="p-4">
            <Scale className={`w-5 h-5 mb-1.5 ${summary.isBalanced ? "text-green-500" : "text-orange-500"}`} />
            <p className={`text-xl font-bold ${summary.isBalanced ? "text-green-600" : "text-orange-600"}`}>
              {summary.isBalanced ? "מאוזן ✓" : "לא מאוזן ✗"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              הפרש: {fmt(Math.abs(summary.totalAssets - summary.liabilitiesAndEquity))}
            </p>
          </CardContent>
        </Card>
      </div>

      {compareYear && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-2.5 text-sm text-blue-700 dark:text-blue-300 flex items-center gap-2">
          <Download size={14} />
          מצב השוואה: {fiscalYear} לעומת {compareYear} — לחץ על חשבון לראיית תנועות
        </div>
      )}

      <div className="space-y-4">
        <AccountTable
          title="נכסים"
          colorClass="text-blue-600 dark:text-blue-400"
          bgClass="bg-blue-50/50 dark:bg-blue-900/10"
          rows={data.assets}
          total={summary.totalAssets}
          compareYear={compareYear}
          cmpTotal={summary.cmpTotalAssets}
          onDrilldown={setDrilldownAccount}
        />
        <AccountTable
          title="התחייבויות"
          colorClass="text-red-600 dark:text-red-400"
          bgClass="bg-red-50/50 dark:bg-red-900/10"
          rows={data.liabilities}
          total={summary.totalLiabilities}
          compareYear={compareYear}
          cmpTotal={summary.cmpTotalLiabilities}
          onDrilldown={setDrilldownAccount}
        />
        <AccountTable
          title="הון עצמי"
          colorClass="text-purple-600 dark:text-purple-400"
          bgClass="bg-purple-50/50 dark:bg-purple-900/10"
          rows={data.equity}
          total={summary.totalEquity}
          compareYear={compareYear}
          cmpTotal={summary.cmpTotalEquity}
          onDrilldown={setDrilldownAccount}
        />
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex justify-between items-center text-sm font-bold">
            <span>סה"כ התחייבויות + הון עצמי</span>
            <span className={summary.isBalanced ? "text-green-600" : "text-orange-600"}>
              {fmt(summary.liabilitiesAndEquity)}
            </span>
          </div>
          <div className="flex justify-between items-center text-xs text-muted-foreground mt-1">
            <span>סה"כ נכסים</span>
            <span>{fmt(summary.totalAssets)}</span>
          </div>
          {!summary.isBalanced && (
            <div className="mt-2 text-xs text-orange-600 bg-orange-50 dark:bg-orange-900/20 rounded p-2">
              אזהרה: המאזן אינו מאוזן. הפרש: {fmt(Math.abs(summary.totalAssets - summary.liabilitiesAndEquity))}
            </div>
          )}
        </CardContent>
      </Card>

      {drilldownAccount && (
        <DrilldownPanel
          accountNumber={drilldownAccount}
          fiscalYear={fiscalYear}
          onClose={() => setDrilldownAccount(null)}
        />
      )}

      <div className="mt-8 space-y-6">
        <RelatedRecords
          tabs={[
            {
              key: "accounts",
              label: "חשבונות פעילים",
              icon: "payments",
              endpoint: "/api/chart-of-accounts?limit=5",
              columns: [
                { key: "account_number", label: "מספר חשבון" },
                { key: "account_name", label: "שם" },
                { key: "account_type", label: "סוג" },
                { key: "balance", label: "יתרה" },
              ],
            },
            {
              key: "journal_entries",
              label: "פקודות יומן",
              icon: "documents",
              endpoint: "/api/journal-entries?limit=5",
              columns: [
                { key: "entry_number", label: "מספר" },
                { key: "date", label: "תאריך" },
                { key: "description", label: "תיאור" },
                { key: "amount", label: "סכום" },
              ],
            },
          ]}
        />
        <ActivityLog entityType="balance-sheet" />
      </div>
    </div>
  );
}
