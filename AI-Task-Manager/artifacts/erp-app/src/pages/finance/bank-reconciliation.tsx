import { useState, useEffect, useMemo } from "react";
import { authFetch } from "@/lib/utils";
import { usePermissions } from "@/hooks/use-permissions";
import {
  Landmark, Search, Plus, Edit2, Trash2, X, Save,
  Hash, Calendar, CheckCircle2, Clock, AlertTriangle,
  ArrowUpDown, FileText, RefreshCw, ChevronDown, ChevronUp,
  Check, XCircle, BarChart3, List, Link2,
  Loader2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Printer, Send } from "lucide-react";
import ExportDropdown from "@/components/export-dropdown";
import { globalConfirm } from "@/components/confirm-dialog";
import { printPage, sendByEmail, generateEmailBody } from "@/lib/print-utils";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { useApiAction } from "@/hooks/use-api-action";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";
import StatusTransition from "@/components/status-transition";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const statusMap: Record<string, { label: string; color: string }> = {
  in_progress: { label: "בביצוע", color: "bg-yellow-100 text-yellow-700" },
  completed: { label: "הושלם", color: "bg-green-100 text-green-700" },
  approved: { label: "מאושר", color: "bg-blue-100 text-blue-700" },
  reopened: { label: "נפתח מחדש", color: "bg-orange-100 text-orange-700" },
};

const itemTypeMap: Record<string, { label: string; color: string }> = {
  bank_only: { label: "בנק בלבד", color: "text-blue-600" },
  book_only: { label: "ספרים בלבד", color: "text-purple-600" },
  matched: { label: "מותאם", color: "text-green-600" },
  timing: { label: "תזמון", color: "text-orange-600" },
  error: { label: "טעות", color: "text-red-600" },
  adjustment: { label: "התאמה", color: "text-muted-foreground" },
};

const itemCategoryMap: Record<string, string> = {
  deposit: "הפקדה", check: "צ'ק", transfer: "העברה", fee: "עמלה",
  interest: "ריבית", payment: "תשלום", refund: "זיכוי", salary: "שכר",
  tax: "מס", other: "אחר",
};

type TabType = "reconciliations" | "items_overview" | "bank_accounts";

export default function BankReconciliationPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [recs, setRecs] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [detailTab, setDetailTab] = useState("details");
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const { selectedIds, setSelectedIds, toggle, toggleAll, isSelected } = useBulkSelection();
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortField, setSortField] = useState("statement_date");
  const [sortDir, setSortDir] = useState<"asc"|"desc">("desc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [tab, setTab] = useState<TabType>("reconciliations");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [recItems, setRecItems] = useState<any[]>([]);
  const [showItemForm, setShowItemForm] = useState(false);
  const [itemForm, setItemForm] = useState<any>({});
  const [itemRecId, setItemRecId] = useState<number | null>(null);
  const token = localStorage.getItem("erp_token") || "";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const [tableLoading, setTableLoading] = useState(true);
  const pagination = useSmartPagination(25);
  const { executeSave, executeDelete, execute, loading: actionLoading } = useApiAction();

  const load = () => {
    setTableLoading(true);
    Promise.all([
      authFetch(`${API}/bank-reconciliations`, { headers }).then(r => r.json()).then(d => setRecs(safeArray(d))),
      authFetch(`${API}/bank-reconciliations/stats`, { headers }).then(r => r.json()).then(d => setStats(d || {})),
      authFetch(`${API}/bank-accounts-list`, { headers }).then(r => r.json()).then(d => setBankAccounts(safeArray(d)))
    ]).finally(() => setTableLoading(false));
  };
  useEffect(load, []);

  const loadItems = async (recId: number) => {
    if (expandedId === recId) { setExpandedId(null); setRecItems([]); return; }
    const r = await authFetch(`${API}/bank-reconciliations/${recId}/items`, { headers });
    setRecItems(safeArray(await r.json()));
    setExpandedId(recId);
  };

  const filtered = useMemo(() => {
    let f = recs.filter(r =>
      (filterStatus === "all" || r.status === filterStatus) &&
      (!search || r.reconciliation_number?.toLowerCase().includes(search.toLowerCase()) || r.bank_account_name?.toLowerCase().includes(search.toLowerCase()))
    );
    f.sort((a: any, b: any) => { const av = a[sortField], bv = b[sortField]; const cmp = typeof av === "number" ? av - bv : String(av||"").localeCompare(String(bv||"")); return sortDir === "asc" ? cmp : -cmp; });
    return f;
  }, [recs, search, filterStatus, sortField, sortDir]);

  const openCreate = () => {
    setEditing(null);
    setForm({ statementDate: new Date().toISOString().slice(0,10), status: "in_progress", currency: "ILS" });
    setShowForm(true);
  };
  const openEdit = (r: any) => {
    setEditing(r);
    setForm({ bankAccountId: r.bank_account_id, bankAccountName: r.bank_account_name, statementDate: r.statement_date?.slice(0,10), statementStartDate: r.statement_start_date?.slice(0,10), statementEndDate: r.statement_end_date?.slice(0,10), openingBalanceBank: r.opening_balance_bank, closingBalanceBank: r.closing_balance_bank, openingBalanceBooks: r.opening_balance_books, closingBalanceBooks: r.closing_balance_books, depositsInTransit: r.deposits_in_transit, outstandingChecks: r.outstanding_checks, bankCharges: r.bank_charges, interestEarned: r.interest_earned, otherAdjustments: r.other_adjustments, difference: r.difference, status: r.status, reconciledItemsCount: r.reconciled_items_count, unreconciledItemsCount: r.unreconciled_items_count, notes: r.notes });
    setShowForm(true);
  };
  const save = async () => { const url = editing ? `${API}/bank-reconciliations/${editing.id}` : `${API}/bank-reconciliations`; await executeSave(url, editing ? "PUT" : "POST", form, editing ? "עודכן בהצלחה" : "נוצר בהצלחה", () => { setShowForm(false); load(); }); };
  const remove = async (id: number) => { await executeDelete(`${API}/bank-reconciliations/${id}`, "למחוק התאמה?", () => load()); };
  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("desc"); } };

  const openAddItem = (recId: number) => {
    setItemRecId(recId);
    setItemForm({ itemDate: new Date().toISOString().slice(0,10), itemType: "bank_only", source: "manual" });
    setShowItemForm(true);
  };
  const saveItem = async () => {
    if (!itemRecId) return;
    await authFetch(`${API}/bank-reconciliations/${itemRecId}/items`, { method: "POST", headers, body: JSON.stringify(itemForm) });
    setShowItemForm(false);
    loadItems(expandedId!);
    setExpandedId(null);
    setTimeout(() => loadItems(itemRecId!), 100);
    load();
  };
  const matchItem = async (recId: number, itemId: number) => {
    await authFetch(`${API}/bank-reconciliations/${recId}/match-item/${itemId}`, { method: "POST", headers });
    loadItems(expandedId!);
    setExpandedId(null);
    setTimeout(() => loadItems(recId), 100);
    load();
  };
  const deleteItem = async (itemId: number) => { await executeDelete(`${API}/bank-reconciliations/items/${itemId}`, "למחוק פריט?", async () => {
    if (expandedId) {
      loadItems(expandedId);
      setExpandedId(null);
      setTimeout(() => loadItems(expandedId!), 100);
    }
    load();
  }); };

  const handleBankAccountSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = Number(e.target.value);
    const acc = bankAccounts.find(a => a.id === id);
    if (acc) {
      setForm({ ...form, bankAccountId: acc.id, bankAccountName: `${acc.bank_name} - ${acc.account_number}` });
    } else {
      setForm({ ...form, bankAccountId: null, bankAccountName: "" });
    }
  };

  const kpis = [
    { label: "סה\"כ התאמות", value: fmt(stats.total || 0), icon: Landmark, color: "text-blue-600" },
    { label: "בביצוע", value: fmt(stats.in_progress || 0), icon: Clock, color: "text-yellow-600" },
    { label: "הושלמו", value: fmt(stats.completed || 0), icon: CheckCircle2, color: "text-green-600" },
    { label: "מאושרות", value: fmt(stats.approved || 0), icon: CheckCircle2, color: "text-indigo-600" },
    { label: "סה\"כ הפרשים", value: `₪${fmt(stats.total_differences || 0)}`, icon: AlertTriangle, color: "text-red-600" },
    { label: "פריטים מותאמים", value: fmt(stats.total_reconciled_items || 0), icon: Check, color: "text-emerald-600" },
    { label: "פריטים לא מותאמים", value: fmt(stats.total_unreconciled_items || 0), icon: XCircle, color: "text-orange-600" },
    { label: "חשבונות בנק", value: fmt(stats.accounts_count || 0), icon: Hash, color: "text-purple-600" },
  ];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold flex items-center gap-2"><Landmark className="text-blue-600" /> התאמות בנק Enterprise</h1>
          <p className="text-muted-foreground mt-1">התאמת יתרות בנק מול ספרים, פריטי התאמה, הפרשים, התאמה אוטומטית</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown data={recs} headers={{ reconciliation_number: "מספר", bank_account_name: "חשבון בנק", statement_date: "תאריך דף", closing_balance_bank: "יתרת בנק", closing_balance_books: "יתרת ספרים", deposits_in_transit: "הפקדות בדרך", outstanding_checks: "צ'קים עומדים", difference: "הפרש", status: "סטטוס", match_rate: "% התאמה" }} filename={"bank_reconciliations"} />
          <button onClick={() => printPage("התאמות בנק")} className="flex items-center gap-1.5 bg-muted text-foreground px-3 py-2 rounded-lg hover:bg-slate-600 text-sm"><Printer size={16} /> הדפסה</button>
          <button onClick={() => sendByEmail("התאמות בנק - טכנו-כל עוזי", generateEmailBody("התאמות בנק", recs, { reconciliation_number: "מספר", bank_account_name: "חשבון", difference: "הפרש", status: "סטטוס" }))} className="flex items-center gap-1.5 bg-muted text-foreground px-3 py-2 rounded-lg hover:bg-slate-600 text-sm"><Send size={16} /> שליחה</button>
          <button onClick={openCreate} className="flex items-center gap-2 bg-blue-600 text-foreground px-3 py-2 rounded-lg hover:bg-blue-700 shadow-lg text-sm"><Plus size={16} /> התאמה חדשה</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {kpis.map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-card rounded-xl shadow-sm border p-3">
            <kpi.icon className={`${kpi.color} mb-1`} size={20} />
            <div className="text-lg font-bold">{kpi.value}</div>
            <div className="text-xs text-muted-foreground">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="flex gap-2 border-b">
        {([["reconciliations", "התאמות"], ["bank_accounts", "חשבונות בנק"]] as [TabType, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === key ? 'border-blue-600 text-blue-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{label}</button>
        ))}
      </div>

      {tab === "reconciliations" && (<>
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-0 sm:min-w-[200px]"><Search className="absolute right-3 top-2.5 text-muted-foreground" size={18} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש מספר/חשבון..." className="w-full pr-10 pl-4 py-2 border rounded-lg" /></div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="border rounded-lg px-3 py-2"><option value="all">כל הסטטוסים</option>{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        </div>

        <div className="bg-card rounded-xl shadow-sm border overflow-x-auto relative">
        {tableLoading && (
          <div className="absolute inset-0 bg-card/60 backdrop-blur-[1px] flex items-center justify-center z-10">
            <div className="flex items-center gap-2 bg-card border rounded-lg px-4 py-2 shadow-lg"><Loader2 className="w-4 h-4 animate-spin text-amber-600" /><span className="text-sm">טוען נתונים...</span></div>
          </div>
        )}
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b"><tr>
              <th className="px-2 py-3 w-8"></th>
              {[
                { key: "reconciliation_number", label: "מספר" }, { key: "bank_account_name", label: "חשבון בנק" },
                { key: "statement_date", label: "תאריך דף" }, { key: "closing_balance_bank", label: "יתרת בנק" },
                { key: "closing_balance_books", label: "יתרת ספרים" }, { key: "deposits_in_transit", label: "הפקדות בדרך" },
                { key: "outstanding_checks", label: "צ'קים עומדים" }, { key: "difference", label: "הפרש" },
                { key: "match_rate", label: "% התאמה" }, { key: "status", label: "סטטוס" },
              ].map(col => (
                <th key={col.key} className="px-2 py-3 text-right cursor-pointer hover:bg-muted/50 text-xs" onClick={() => toggleSort(col.key)}>
                  <div className="flex items-center gap-1">{col.label} <ArrowUpDown size={10} /></div>
                </th>
              ))}
              <th className="px-2 py-3 text-right text-xs">פעולות</th>
            </tr></thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={12} className="text-center py-8 text-muted-foreground">אין התאמות בנק</td></tr>
              ) : pagination.paginate(filtered).map(r => (
                <tbody key={r.id}>
                  <tr className={`border-b hover:bg-blue-50/30 ${expandedId === r.id ? 'bg-blue-50/50' : ''}`}>
                    <td className="px-2 py-2"><button onClick={() => loadItems(r.id)} className="p-1 hover:bg-blue-500/10 rounded">{expandedId === r.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button></td>
                    <td className="px-2 py-2 font-mono text-blue-600 font-bold text-xs">{r.reconciliation_number}</td>
                    <td className="px-2 py-2 font-medium">{r.bank_account_name || "-"}</td>
                    <td className="px-2 py-2 text-xs">{r.statement_date?.slice(0, 10)}</td>
                    <td className="px-2 py-2 font-bold">₪{fmt(r.closing_balance_bank)}</td>
                    <td className="px-2 py-2 font-bold">₪{fmt(r.closing_balance_books)}</td>
                    <td className="px-2 py-2 text-orange-600">₪{fmt(r.deposits_in_transit)}</td>
                    <td className="px-2 py-2 text-purple-600">₪{fmt(r.outstanding_checks)}</td>
                    <td className={`px-2 py-2 font-bold ${Number(r.difference) !== 0 ? "text-red-600" : "text-green-600"}`}>₪{fmt(r.difference)}</td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1">
                        <div className="w-12 bg-muted/50 rounded-full h-1.5"><div className={`h-1.5 rounded-full ${Number(r.match_rate) >= 100 ? 'bg-green-500' : Number(r.match_rate) >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${Math.min(Number(r.match_rate || 0), 100)}%` }}></div></div>
                        <span className="text-xs">{Number(r.match_rate || 0).toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="px-2 py-2"><span className={`px-2 py-0.5 rounded-full text-xs ${statusMap[r.status]?.color || "bg-muted/50"}`}>{statusMap[r.status]?.label || r.status}</span></td>
                    <td className="px-2 py-2">
                      <div className="flex gap-1">
                        <button onClick={() => openAddItem(r.id)} className="p-1 hover:bg-green-100 rounded text-green-600" title="הוספת פריט"><Plus size={13} /></button>
                        <button onClick={() => openEdit(r)} className="p-1 hover:bg-blue-500/10 rounded"><Edit2 size={13} /></button>
                        {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.reconciled_by_name || r.id}'? פעולה זו אינה ניתנת לביטול.`))remove(r.id)}} className="p-1 hover:bg-red-500/10 rounded text-red-500"><Trash2 size={13} /></button>}
                      </div>
                    </td>
                  </tr>
                  {expandedId === r.id && (
                    <tr><td colSpan={12} className="p-0">
                      <div className="bg-blue-50/30 border-t border-blue-100 px-6 py-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mb-3">
                          {r.statement_start_date && <div><span className="text-muted-foreground">מ:</span> {r.statement_start_date.slice(0,10)}</div>}
                          {r.statement_end_date && <div><span className="text-muted-foreground">עד:</span> {r.statement_end_date.slice(0,10)}</div>}
                          <div><span className="text-muted-foreground">פתיחה בנק:</span> ₪{fmt(r.opening_balance_bank)}</div>
                          <div><span className="text-muted-foreground">פתיחה ספרים:</span> ₪{fmt(r.opening_balance_books)}</div>
                          {Number(r.bank_charges) > 0 && <div><span className="text-muted-foreground">עמלות:</span> ₪{fmt(r.bank_charges)}</div>}
                          {Number(r.interest_earned) > 0 && <div><span className="text-muted-foreground">ריבית:</span> ₪{fmt(r.interest_earned)}</div>}
                          {Number(r.other_adjustments) !== 0 && <div><span className="text-muted-foreground">התאמות:</span> ₪{fmt(r.other_adjustments)}</div>}
                          {r.reconciled_by_name && <div><span className="text-muted-foreground">בוצע ע"י:</span> {r.reconciled_by_name}</div>}
                        </div>

                        <div className="bg-blue-100/50 rounded-lg p-3 mb-3 grid grid-cols-4 gap-3 text-xs">
                          <div className="text-center"><div className="text-muted-foreground">יתרה מתואמת בנק</div><div className="text-lg font-bold text-blue-600">₪{fmt(r.adjusted_bank_balance)}</div></div>
                          <div className="text-center"><div className="text-muted-foreground">יתרה מתואמת ספרים</div><div className="text-lg font-bold text-purple-600">₪{fmt(r.adjusted_book_balance)}</div></div>
                          <div className="text-center"><div className="text-muted-foreground">הפרש</div><div className={`text-lg font-bold ${Number(r.difference) !== 0 ? 'text-red-600' : 'text-green-600'}`}>₪{fmt(r.difference)}</div></div>
                          <div className="text-center"><div className="text-muted-foreground">פריטים</div><div className="text-lg font-bold">{r.reconciled_items_count || 0} <span className="text-green-500 text-xs">מותאמים</span> / {r.unreconciled_items_count || 0} <span className="text-red-500 text-xs">פתוחים</span></div></div>
                        </div>

                        <div className="flex justify-between items-center mb-2">
                          <div className="text-xs font-bold text-blue-600 flex items-center gap-1"><List size={14} /> פריטי התאמה</div>
                          <button onClick={() => openAddItem(r.id)} className="flex items-center gap-1 text-xs bg-blue-600 text-foreground px-2 py-1 rounded hover:bg-blue-700"><Plus size={12} /> הוסף פריט</button>
                        </div>
                        {recItems.length === 0 ? <div className="text-xs text-muted-foreground py-2">אין פריטי התאמה</div> :
                        <table className="w-full text-xs">
                          <thead><tr className="border-b border-blue-200">
                            <th className="text-right py-1 px-2">מספר</th><th className="text-right py-1 px-2">תאריך</th>
                            <th className="text-right py-1 px-2">תיאור</th><th className="text-right py-1 px-2">סוג</th>
                            <th className="text-right py-1 px-2">סכום</th><th className="text-right py-1 px-2">בנק</th>
                            <th className="text-right py-1 px-2">ספרים</th><th className="text-right py-1 px-2">הפרש</th>
                            <th className="text-right py-1 px-2">סטטוס</th><th className="text-right py-1 px-2">פעולות</th>
                          </tr></thead>
                          <tbody>
                            {recItems.map(item => (
                              <tr key={item.id} className={`border-b border-blue-100/50 ${item.matched ? 'bg-green-50/30' : ''}`}>
                                <td className="py-1 px-2 font-mono text-blue-500">{item.item_number}</td>
                                <td className="py-1 px-2">{item.item_date?.slice(0,10)}</td>
                                <td className="py-1 px-2">{item.description}</td>
                                <td className="py-1 px-2"><span className={itemTypeMap[item.item_type]?.color || ''}>{itemTypeMap[item.item_type]?.label || item.item_type}</span></td>
                                <td className="py-1 px-2 font-bold">₪{fmt(item.amount)}</td>
                                <td className="py-1 px-2">₪{fmt(item.bank_amount)}</td>
                                <td className="py-1 px-2">₪{fmt(item.book_amount)}</td>
                                <td className={`py-1 px-2 font-bold ${Number(item.difference) !== 0 ? 'text-red-500' : 'text-green-500'}`}>₪{fmt(item.difference)}</td>
                                <td className="py-1 px-2">{item.matched ? <span className="text-green-600 flex items-center gap-0.5"><Check size={12} /> מותאם</span> : <span className="text-orange-500">פתוח</span>}</td>
                                <td className="py-1 px-2">
                                  <div className="flex gap-1">
                                    {!item.matched && <button onClick={() => matchItem(r.id, item.id)} className="p-0.5 hover:bg-green-100 rounded text-green-600" title="סמן כמותאם"><Link2 size={12} /></button>}
                                    <button onClick={() => deleteItem(item.id)} className="p-0.5 hover:bg-red-500/10 rounded text-red-500" title="מחק"><Trash2 size={12} /></button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>}
                      </div>
                    </td></tr>
                  )}
                </tbody>
              ))}
            </tbody>
          </table>
        </div>
      <SmartPagination pagination={pagination} />
        <div className="text-sm text-muted-foreground">סה"כ: {filtered.length} התאמות</div>
      </>)}

      {tab === "bank_accounts" && (
        <div className="bg-card rounded-xl shadow-sm border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b"><tr>
              <th className="px-3 py-3 text-right">בנק</th><th className="px-3 py-3 text-right">סניף</th>
              <th className="px-3 py-3 text-right">מספר חשבון</th><th className="px-3 py-3 text-right">סוג</th>
              <th className="px-3 py-3 text-right">יתרה נוכחית</th><th className="px-3 py-3 text-right">יתרה זמינה</th>
              <th className="px-3 py-3 text-right">מסגרת</th><th className="px-3 py-3 text-right">מטבע</th>
              <th className="px-3 py-3 text-right">התאמה אחרונה</th>
            </tr></thead>
            <tbody>
              {bankAccounts.length === 0 ? <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">אין חשבונות בנק</td></tr> :
              bankAccounts.map(a => (
                <tr key={a.id} className="border-b hover:bg-muted/30">
                  <td className="px-3 py-2 font-medium">{a.bank_name}</td>
                  <td className="px-3 py-2">{a.branch_number || "-"}</td>
                  <td className="px-3 py-2 font-mono text-blue-600">{a.account_number}</td>
                  <td className="px-3 py-2 text-xs">{a.account_type === 'checking' ? 'עו"ש' : a.account_type === 'savings' ? 'חיסכון' : a.account_type === 'credit_line' ? 'מסגרת' : a.account_type === 'deposit' ? 'פיקדון' : a.account_type}</td>
                  <td className={`px-3 py-2 font-bold ${Number(a.current_balance) < 0 ? 'text-red-600' : 'text-green-600'}`}>₪{fmt(a.current_balance)}</td>
                  <td className="px-3 py-2">₪{fmt(a.available_balance)}</td>
                  <td className="px-3 py-2">₪{fmt(a.credit_limit)}</td>
                  <td className="px-3 py-2">{a.currency}</td>
                  <td className="px-3 py-2 text-xs">{a.last_reconciled_at ? new Date(a.last_reconciled_at).toLocaleDateString("he-IL") : "לא בוצע"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-card border border-border text-foreground rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">{editing ? "עריכת התאמה" : "התאמת בנק חדשה"}</h2>
                <button onClick={() => setShowForm(false)}><X size={20} /></button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1">חשבון בנק *</label>
                  {bankAccounts.length > 0 ? (
                    <select value={form.bankAccountId || ""} onChange={handleBankAccountSelect} className="w-full border rounded-lg px-3 py-2">
                      <option value="">בחר חשבון...</option>
                      {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.bank_name} - {a.account_number} ({a.account_type === 'checking' ? 'עו"ש' : a.account_type})</option>)}
                    </select>
                  ) : (
                    <input value={form.bankAccountName || ""} onChange={e => setForm({ ...form, bankAccountName: e.target.value })} placeholder="שם חשבון בנק" className="w-full border rounded-lg px-3 py-2" />
                  )}
                </div>
                <div><label className="block text-sm font-medium mb-1">תאריך דף חשבון *</label><input type="date" value={form.statementDate || ""} onChange={e => setForm({ ...form, statementDate: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">סטטוס</label><select value={form.status || "in_progress"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full border rounded-lg px-3 py-2">{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                <div><label className="block text-sm font-medium mb-1">תאריך התחלה</label><input type="date" value={form.statementStartDate || ""} onChange={e => setForm({ ...form, statementStartDate: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">תאריך סיום</label><input type="date" value={form.statementEndDate || ""} onChange={e => setForm({ ...form, statementEndDate: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div className="col-span-2 border-t pt-3"><h3 className="text-sm font-bold text-blue-600 mb-2">יתרות</h3></div>
                <div><label className="block text-sm font-medium mb-1">יתרת פתיחה - בנק</label><input type="number" step="0.01" value={form.openingBalanceBank || ""} onChange={e => setForm({ ...form, openingBalanceBank: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">יתרת סגירה - בנק</label><input type="number" step="0.01" value={form.closingBalanceBank || ""} onChange={e => setForm({ ...form, closingBalanceBank: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">יתרת פתיחה - ספרים</label><input type="number" step="0.01" value={form.openingBalanceBooks || ""} onChange={e => setForm({ ...form, openingBalanceBooks: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">יתרת סגירה - ספרים</label><input type="number" step="0.01" value={form.closingBalanceBooks || ""} onChange={e => setForm({ ...form, closingBalanceBooks: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div className="col-span-2 border-t pt-3"><h3 className="text-sm font-bold text-orange-600 mb-2">פריטי התאמה</h3></div>
                <div><label className="block text-sm font-medium mb-1">הפקדות בדרך</label><input type="number" step="0.01" value={form.depositsInTransit || ""} onChange={e => setForm({ ...form, depositsInTransit: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">צ'קים עומדים</label><input type="number" step="0.01" value={form.outstandingChecks || ""} onChange={e => setForm({ ...form, outstandingChecks: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">עמלות בנק</label><input type="number" step="0.01" value={form.bankCharges || ""} onChange={e => setForm({ ...form, bankCharges: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">ריבית שהתקבלה</label><input type="number" step="0.01" value={form.interestEarned || ""} onChange={e => setForm({ ...form, interestEarned: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">התאמות אחרות</label><input type="number" step="0.01" value={form.otherAdjustments || ""} onChange={e => setForm({ ...form, otherAdjustments: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">הפרש</label><input type="number" step="0.01" value={form.difference || ""} onChange={e => setForm({ ...form, difference: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div className="col-span-2"><label className="block text-sm font-medium mb-1">הערות</label><textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full border rounded-lg px-3 py-2" /></div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={save} className="flex items-center gap-2 bg-blue-600 text-foreground px-6 py-2 rounded-lg hover:bg-blue-700"><Save size={16} /> {editing ? "עדכון" : "שמירה"}</button>
                <button onClick={() => setShowForm(false)} className="px-6 py-2 border rounded-lg hover:bg-muted/30">ביטול</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showItemForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowItemForm(false)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-card border border-border text-foreground rounded-2xl shadow-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold flex items-center gap-2"><FileText className="text-blue-600" /> פריט התאמה חדש</h2>
                <button onClick={() => setShowItemForm(false)}><X size={20} /></button>
              </div>
              <div className="space-y-4">
                <div><label className="block text-sm font-medium mb-1">תיאור *</label><input value={itemForm.description || ""} onChange={e => setItemForm({ ...itemForm, description: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><label className="block text-sm font-medium mb-1">תאריך</label><input type="date" value={itemForm.itemDate || ""} onChange={e => setItemForm({ ...itemForm, itemDate: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                  <div><label className="block text-sm font-medium mb-1">סוג</label><select value={itemForm.itemType || "bank_only"} onChange={e => setItemForm({ ...itemForm, itemType: e.target.value })} className="w-full border rounded-lg px-3 py-2">{Object.entries(itemTypeMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><label className="block text-sm font-medium mb-1">סכום</label><input type="number" step="0.01" value={itemForm.amount || ""} onChange={e => setItemForm({ ...itemForm, amount: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                  <div><label className="block text-sm font-medium mb-1">קטגוריה</label><select value={itemForm.category || ""} onChange={e => setItemForm({ ...itemForm, category: e.target.value })} className="w-full border rounded-lg px-3 py-2"><option value="">ללא</option>{Object.entries(itemCategoryMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><label className="block text-sm font-medium mb-1">סכום בנק</label><input type="number" step="0.01" value={itemForm.bankAmount || ""} onChange={e => setItemForm({ ...itemForm, bankAmount: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                  <div><label className="block text-sm font-medium mb-1">סכום ספרים</label><input type="number" step="0.01" value={itemForm.bookAmount || ""} onChange={e => setItemForm({ ...itemForm, bookAmount: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                </div>
                <div><label className="block text-sm font-medium mb-1">אסמכתא</label><input value={itemForm.reference || ""} onChange={e => setItemForm({ ...itemForm, reference: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">הערות</label><textarea value={itemForm.notes || ""} onChange={e => setItemForm({ ...itemForm, notes: e.target.value })} rows={2} className="w-full border rounded-lg px-3 py-2" /></div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={saveItem} className="flex items-center gap-2 bg-blue-600 text-foreground px-6 py-2 rounded-lg hover:bg-blue-700"><Save size={16} /> שמור פריט</button>
                <button onClick={() => setShowItemForm(false)} className="px-6 py-2 border rounded-lg hover:bg-muted/30">ביטול</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {selectedItem && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setSelectedItem(null)}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-6 border-b border-slate-700">
              <h2 className="text-xl font-bold text-foreground">התאמת בנק: {selectedItem.rec_number || `#${selectedItem.id}`}</h2>
              <button onClick={() => setSelectedItem(null)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="flex border-b border-border/50">
              {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
              ))}
            </div>
            <div className="p-6">
              {detailTab === "details" && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div><div className="text-xs text-muted-foreground mb-1">תאריך דף חשבון</div><div className="text-sm text-foreground">{selectedItem.statement_date}</div></div>
                  <div><div className="text-xs text-muted-foreground mb-1">חשבון בנק</div><div className="text-sm text-foreground">{selectedItem.bank_account_name || "-"}</div></div>
                  <div><div className="text-xs text-muted-foreground mb-1">יתרת דף חשבון</div><div className="text-sm text-foreground font-bold">₪{Number(selectedItem.statement_balance || 0).toLocaleString()}</div></div>
                  <div><div className="text-xs text-muted-foreground mb-1">יתרת ספרים</div><div className="text-sm text-foreground font-bold">₪{Number(selectedItem.book_balance || 0).toLocaleString()}</div></div>
                  <div><div className="text-xs text-muted-foreground mb-1">הפרש</div><div className="text-sm text-foreground">{selectedItem.difference || "0"}</div></div>
                  <div><div className="text-xs text-muted-foreground mb-1">סטטוס</div><div className="text-sm text-foreground">{selectedItem.status}</div></div>
                </div>
              )}
              {detailTab === "related" && <RelatedRecords entityType="bank-reconciliation" entityId={selectedItem.id} tabs={[{ key: "transactions", label: "תנועות", endpoint: `${API}/bank-reconciliation/${selectedItem.id}/items` }, { key: "statements", label: "דפי חשבון", endpoint: `${API}/bank-reconciliation?bank_account_id=${selectedItem.bank_account_id}` }]} />}
              {detailTab === "docs" && <AttachmentsSection entityType="bank-reconciliation" entityId={selectedItem.id} />}
              {detailTab === "history" && <ActivityLog entityType="bank-reconciliation" entityId={selectedItem.id} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
