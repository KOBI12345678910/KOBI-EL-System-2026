import { useState, useEffect, useMemo } from "react";
import {
  BookOpen, Search, ArrowUpDown, AlertTriangle, DollarSign,
  Hash, Eye, X, Users, Building2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ExportDropdown from "@/components/export-dropdown";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/utils";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");
const fmtCurrency = (v: any) => Number(v || 0).toLocaleString("he-IL", { style: "currency", currency: "ILS" });

interface LedgerAccount {
  id: number;
  account_number: string;
  account_name: string;
  entry_count: number;
  total_debit: number;
  total_credit: number;
  balance: number;
  last_entry: string;
  entity_type: string;
}

const typeMap: Record<string, { label: string; color: string }> = {
  customer: { label: "לקוח", color: "bg-blue-500/20 text-blue-400" },
  vendor: { label: "ספק", color: "bg-purple-500/20 text-purple-400" },
};

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (<div><div className="text-xs text-muted-foreground mb-1">{label}</div>{children || <div className="text-sm text-foreground font-medium">{value || "—"}</div>}</div>);
}

export default function CustomerVendorLedgerPage() {
  const [items, setItems] = useState<LedgerAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [entityType, setEntityType] = useState<"customer" | "vendor">("customer");
  const [sortField, setSortField] = useState("balance");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [viewDetail, setViewDetail] = useState<LedgerAccount | null>(null);
  const pagination = useSmartPagination(25);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ type: entityType });
      const res = await authFetch(`${API}/general-ledger/by-account?${params}`);
      if (res.ok) {
        const raw = safeArray(await res.json());
        setItems(raw.map((r: any, i: number) => ({ ...r, id: r.id || i + 1, entity_type: entityType })));
      } else {
        setError("שגיאה בטעינת נתונים");
      }
    } catch (e: any) {
      setError(e.message || "שגיאה");
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [entityType]);

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };

  const filtered = useMemo(() => {
    let data = items.filter(i =>
      (!search || [i.account_name, i.account_number].some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? "";
      const vb = b[sortField] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return data;
  }, [items, search, sortField, sortDir]);

  const totalDebit = items.reduce((s, i) => s + Number(i.total_debit || 0), 0);
  const totalCredit = items.reduce((s, i) => s + Number(i.total_credit || 0), 0);
  const totalBalance = items.reduce((s, i) => s + Number(i.balance || 0), 0);

  const kpis = [
    { label: "סה\"כ חשבונות", value: fmt(items.length), icon: Hash, color: "text-blue-400" },
    { label: "סה\"כ חובה", value: fmtCurrency(totalDebit), icon: Users, color: "text-green-400" },
    { label: "סה\"כ זכות", value: fmtCurrency(totalCredit), icon: Building2, color: "text-red-400" },
    { label: "יתרה", value: fmtCurrency(totalBalance), icon: DollarSign, color: totalBalance >= 0 ? "text-emerald-400" : "text-red-400" },
  ];

  const columns = [
    { key: "account_number", label: "מספר חשבון" },
    { key: "account_name", label: "שם" },
    { key: "entry_count", label: "תנועות" },
    { key: "total_debit", label: "חובה" },
    { key: "total_credit", label: "זכות" },
    { key: "balance", label: "יתרה" },
    { key: "last_entry", label: "תנועה אחרונה" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <BookOpen className="text-indigo-400 w-6 h-6" /> ספר ראשי לקוח/ספק
          </h1>
          <p className="text-sm text-muted-foreground mt-1">תנועות חשבון לפי לקוח או ספק נבחר</p>
        </div>
        <ExportDropdown
          data={filtered}
          headers={{ account_number: "מספר", account_name: "שם", entry_count: "תנועות", total_debit: "חובה", total_credit: "זכות", balance: "יתרה" }}
          filename="customer_vendor_ledger"
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="bg-card border border-border/50 rounded-2xl p-4">
            <kpi.icon className={`${kpi.color} w-5 h-5 mb-2`} />
            <div className="text-xl font-bold text-foreground">{kpi.value}</div>
            <div className="text-xs text-muted-foreground">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <div className="flex gap-1 bg-card border border-border/50 rounded-xl p-1">
          <button onClick={() => setEntityType("customer")}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${entityType === "customer" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            לקוחות
          </button>
          <button onClick={() => setEntityType("vendor")}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${entityType === "vendor" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            ספקים
          </button>
        </div>
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי שם או מספר חשבון..."
            className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
      </div>

      {loading ? (
        <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : error ? (
        <div className="text-center py-16 text-red-400">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="font-medium">שגיאה בטעינה</p>
          <p className="text-sm mt-1">{error}</p>
          <button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">אין נתונים להצגה</p>
          <p className="text-sm mt-1">{search ? "נסה לשנות את החיפוש" : "אין תנועות רשומות"}</p>
        </div>
      ) : (<>
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border/50">
                <tr>
                  {columns.map(col => (
                    <th key={col.key} onClick={() => toggleSort(col.key)}
                      className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground">
                      <div className="flex items-center gap-1">{col.label}<ArrowUpDown className="w-3 h-3" /></div>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {pagination.paginate(filtered).map(r => (
                  <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-mono text-indigo-400 text-xs">{r.account_number || "—"}</td>
                    <td className="px-4 py-3 text-foreground font-medium">{r.account_name || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground text-center">{r.entry_count || 0}</td>
                    <td className="px-4 py-3 text-blue-400 font-bold">{fmtCurrency(r.total_debit)}</td>
                    <td className="px-4 py-3 text-red-400 font-bold">{fmtCurrency(r.total_credit)}</td>
                    <td className={`px-4 py-3 font-bold ${Number(r.balance) >= 0 ? "text-green-400" : "text-red-400"}`}>{fmtCurrency(r.balance)}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{r.last_entry?.slice(0, 10) || "—"}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <SmartPagination pagination={pagination} />
      </>)}

      <AnimatePresence>
        {viewDetail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setViewDetail(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><BookOpen className="w-5 h-5 text-indigo-400" /> {viewDetail.account_name}</h2>
                <button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 grid grid-cols-2 gap-4">
                <DetailField label="מספר חשבון" value={viewDetail.account_number} />
                <DetailField label="שם" value={viewDetail.account_name} />
                <DetailField label="מספר תנועות" value={fmt(viewDetail.entry_count)} />
                <DetailField label="תנועה אחרונה" value={viewDetail.last_entry?.slice(0, 10)} />
                <DetailField label={'סה"כ חובה'} value={fmtCurrency(viewDetail.total_debit)} />
                <DetailField label={'סה"כ זכות'} value={fmtCurrency(viewDetail.total_credit)} />
                <DetailField label="יתרה" value={fmtCurrency(viewDetail.balance)} />
                <DetailField label="סוג"><Badge className={typeMap[viewDetail.entity_type]?.color}>{typeMap[viewDetail.entity_type]?.label || entityType}</Badge></DetailField>
              </div>
              <div className="p-5 border-t border-border flex justify-end">
                <button onClick={() => setViewDetail(null)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">סגור</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
