import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Wallet, Search, Download, Printer, Users, FileText, Filter,
  ChevronDown, ChevronLeft, Eye, MoreVertical, ArrowUpDown
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { authJson } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";

const API = "/api";
function fmt(n: number) { return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(n); }

const DEBT_DOC_TYPES = [
  { value: "all", label: "הכל" },
  { value: "tax-invoice", label: "חשבונית מס" },
  { value: "tax-invoice-receipt", label: "חשבונית מס / קבלה" },
  { value: "transaction-invoice", label: "חשבונית עסקה" },
  { value: "payment-request", label: "דרישת תשלום" },
  { value: "delivery-note", label: "תעודת משלוח" },
];

const CLOSING_DOC_TYPES = [
  { value: "all", label: "הכל" },
  { value: "receipt", label: "קבלה" },
  { value: "tax-invoice-receipt", label: "חשבונית מס / קבלה" },
  { value: "credit-note", label: "חשבונית זיכוי" },
];

export default function DebtorsBalancesPage() {
  const [debtDocType, setDebtDocType] = useState("all");
  const [closingDocType, setClosingDocType] = useState("all");
  const [customerSearch, setCustomerSearch] = useState("");
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 12); return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [sortField, setSortField] = useState("balance");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["debtors-balances", debtDocType, closingDocType, customerSearch, dateFrom, dateTo],
    queryFn: () => authJson(`${API}/finance/debtors-balances?debt_doc_type=${debtDocType}&closing_doc_type=${closingDocType}&customer=${encodeURIComponent(customerSearch)}&from=${dateFrom}&to=${dateTo}`),
  });

  const debtors = Array.isArray(data?.debtors) ? data.debtors : (data?.data || []);
  const summary = data?.summary || {};

  const sorted = [...debtors].sort((a: any, b: any) => {
    const av = Number(a[sortField] || 0);
    const bv = Number(b[sortField] || 0);
    return sortDir === "asc" ? av - bv : bv - av;
  });

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };

  return (
    <div className="space-y-4 sm:space-y-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <Wallet className="w-6 h-6 text-red-400" /> חייבים / יתרות
          </h1>
          <p className="text-muted-foreground mt-1">דוח יתרות חייבים ופירוט חובות לקוחות</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="border-slate-600" onClick={() => window.print()}>
            <Printer className="w-4 h-4 ml-2" />הדפסה
          </Button>
          <Button variant="outline" className="border-slate-600">
            <Download className="w-4 h-4 ml-2" />ייצוא
          </Button>
        </div>
      </div>

      <Card className="bg-slate-900/50 border-slate-700/50">
        <CardHeader>
          <CardTitle className="text-sm text-slate-300 flex items-center gap-2">
            <Filter className="w-4 h-4 text-blue-400" /> פילטרים
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">מסמך יוצר חוב</label>
              <Select value={debtDocType} onValueChange={setDebtDocType}>
                <SelectTrigger className="bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {DEBT_DOC_TYPES.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">מסמך סוגר חוב</label>
              <Select value={closingDocType} onValueChange={setClosingDocType}>
                <SelectTrigger className="bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {CLOSING_DOC_TYPES.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">לקוח</label>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input type="text" value={customerSearch} onChange={e => setCustomerSearch(e.target.value)}
                  placeholder="חיפוש לקוח..."
                  className="w-full pr-9 pl-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-foreground placeholder:text-muted-foreground" />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">מתאריך</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-foreground" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">עד תאריך</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-foreground" />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-500/20">
          <CardContent className="p-4 text-center">
            <div className="text-xs text-muted-foreground mb-1">סה"כ חובות</div>
            <div className="text-xl font-bold text-red-400">{fmt(Number(summary.total_debt || 0))}</div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
          <CardContent className="p-4 text-center">
            <div className="text-xs text-muted-foreground mb-1">לקוחות חייבים</div>
            <div className="text-xl font-bold text-blue-400">{summary.debtor_count || debtors.length}</div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-yellow-500/10 to-yellow-600/5 border-yellow-500/20">
          <CardContent className="p-4 text-center">
            <div className="text-xs text-muted-foreground mb-1">באיחור 30+</div>
            <div className="text-xl font-bold text-yellow-400">{fmt(Number(summary.overdue_30 || 0))}</div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-orange-500/10 to-orange-600/5 border-orange-500/20">
          <CardContent className="p-4 text-center">
            <div className="text-xs text-muted-foreground mb-1">באיחור 90+</div>
            <div className="text-xl font-bold text-orange-400">{fmt(Number(summary.overdue_90 || 0))}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-slate-900/50 border-slate-700/50">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">טוען נתוני חייבים...</div>
          ) : sorted.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <div>לא נמצאו חייבים בתקופה הנבחרת</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50 bg-slate-800/30">
                    <th className="p-3 text-right text-muted-foreground font-medium w-8"></th>
                    <th className="p-3 text-right text-muted-foreground font-medium">לקוח</th>
                    <th className="p-3 text-right text-muted-foreground font-medium">ח.פ / ת.ז</th>
                    <th className="p-3 text-center text-muted-foreground font-medium cursor-pointer hover:text-foreground" onClick={() => toggleSort("total_invoiced")}>
                      <span className="flex items-center justify-center gap-1">סה"כ חשבוניות <ArrowUpDown className="w-3 h-3" /></span>
                    </th>
                    <th className="p-3 text-center text-muted-foreground font-medium cursor-pointer hover:text-foreground" onClick={() => toggleSort("total_paid")}>
                      <span className="flex items-center justify-center gap-1">שולם <ArrowUpDown className="w-3 h-3" /></span>
                    </th>
                    <th className="p-3 text-center text-muted-foreground font-medium cursor-pointer hover:text-foreground" onClick={() => toggleSort("balance")}>
                      <span className="flex items-center justify-center gap-1">יתרה <ArrowUpDown className="w-3 h-3" /></span>
                    </th>
                    <th className="p-3 text-center text-muted-foreground font-medium">ימי איחור</th>
                    <th className="p-3 text-center text-muted-foreground font-medium">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((d: any) => {
                    const isExpanded = expandedCustomer === d.customer_id;
                    const balance = Number(d.balance || 0);
                    return (
                      <>
                        <tr key={d.customer_id} className="border-b border-slate-800/50 hover:bg-slate-800/30 cursor-pointer"
                          onClick={() => setExpandedCustomer(isExpanded ? null : d.customer_id)}>
                          <td className="p-3">
                            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                          </td>
                          <td className="p-3 text-foreground font-medium">{d.customer_name || d.name}</td>
                          <td className="p-3 text-muted-foreground">{d.tax_id || d.id_number || "—"}</td>
                          <td className="p-3 text-center text-slate-300">{fmt(Number(d.total_invoiced || 0))}</td>
                          <td className="p-3 text-center text-green-400">{fmt(Number(d.total_paid || 0))}</td>
                          <td className="p-3 text-center">
                            <span className={`font-bold ${balance > 0 ? 'text-red-400' : balance < 0 ? 'text-green-400' : 'text-muted-foreground'}`}>
                              {fmt(balance)}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            {Number(d.overdue_days || 0) > 0 ? (
                              <Badge variant="outline" className={`${Number(d.overdue_days) > 90 ? 'border-red-500 text-red-400' : Number(d.overdue_days) > 30 ? 'border-yellow-500 text-yellow-400' : 'border-slate-500 text-muted-foreground'}`}>
                                {d.overdue_days} ימים
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground">
                              <Eye className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${d.customer_id}-details`}>
                            <td colSpan={8} className="p-0">
                              <div className="bg-slate-800/40 p-4 border-b border-slate-700">
                                <h4 className="text-sm font-bold text-slate-300 mb-3">מסמכים פתוחים — {d.customer_name || d.name}</h4>
                                {(d.open_documents || []).length === 0 ? (
                                  <div className="text-sm text-muted-foreground">אין מסמכים פתוחים</div>
                                ) : (
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="border-b border-slate-700">
                                        <th className="p-2 text-right text-muted-foreground">מסמך</th>
                                        <th className="p-2 text-right text-muted-foreground">תאריך</th>
                                        <th className="p-2 text-center text-muted-foreground">סכום</th>
                                        <th className="p-2 text-center text-muted-foreground">שולם</th>
                                        <th className="p-2 text-center text-muted-foreground">יתרה</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {(d.open_documents || []).map((doc: any, idx: number) => (
                                        <tr key={idx} className="border-b border-slate-700/50">
                                          <td className="p-2 text-foreground">{doc.doc_type} #{doc.doc_number}</td>
                                          <td className="p-2 text-muted-foreground">{doc.date}</td>
                                          <td className="p-2 text-center text-slate-300">{fmt(Number(doc.amount || 0))}</td>
                                          <td className="p-2 text-center text-green-400">{fmt(Number(doc.paid || 0))}</td>
                                          <td className="p-2 text-center text-red-400 font-medium">{fmt(Number(doc.balance || 0))}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <Card className="bg-card border-border">
          <CardHeader><CardTitle className="text-sm text-foreground">רשומות קשורות</CardTitle></CardHeader>
          <CardContent><RelatedRecords entityType="debtors-balances" entityId="dashboard" /></CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardHeader><CardTitle className="text-sm text-foreground">היסטוריה</CardTitle></CardHeader>
          <CardContent><ActivityLog entityType="debtors-balances" entityId="dashboard" /></CardContent>
        </Card>
      </div>
    </div>
  );
}
