import { useState, useEffect } from "react";
import { History, Search, Filter, ChevronLeft, ChevronRight, Eye, Clock, Plus, Edit2, Trash2, BarChart3, Users, Database, Calendar, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ExportDropdown from "@/components/export-dropdown";
import { Download } from "lucide-react";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";

const API = "/api";

const TABLE_NAMES_HE: Record<string, string> = {
  employees: "עובדים", suppliers: "ספקים", sales_customers: "לקוחות", products: "מוצרים",
  raw_materials: "חומרי גלם", purchase_orders: "הזמנות רכש", sales_orders: "הזמנות מכירה",
  work_orders: "הוראות עבודה", fixed_assets: "רכוש קבוע", customer_invoices: "חשבוניות לקוח",
  supplier_invoices: "חשבוניות ספק", price_quotes: "הצעות מחיר", projects: "פרויקטים",
  inventory_transactions: "תנועות מלאי", bank_accounts: "חשבונות בנק", expense_claims: "תביעות הוצאות",
  quality_inspections: "בדיקות איכות", maintenance_orders: "הוראות תחזוקה", budgets: "תקציבים",
  leave_requests: "בקשות חופשה", attendance_records: "נוכחות", payroll_records: "משכורות",
  training_records: "הכשרות", recruitment_records: "גיוס", shift_assignments: "משמרות",
  onboarding_tasks: "קליטת עובדים", support_tickets: "פניות תמיכה", standing_orders: "הוראות קבע",
  compliance_certificates: "תעודות תאימות", safety_incidents: "אירועי בטיחות", contractors: "קבלנים",
  bom_headers: "עץ מוצר", accounts_receivable: "חייבים", accounts_payable: "זכאים",
  general_ledger: "ספר חשבונות", chart_of_accounts: "תרשים חשבונות", journal_entries: "פקודות יומן",
  petty_cash: "קופה קטנה", letters_of_credit: "מכתבי אשראי", import_orders: "הזמנות יבוא",
  customs_clearances: "שחרור מכס", shipment_tracking: "מעקב משלוחים", crm_leads: "לידים",
  crm_opportunities: "הזדמנויות", competitors: "מתחרים",
};

const ACTION_ICONS: Record<string, any> = {
  INSERT: { icon: Plus, color: "text-green-400", bg: "bg-green-500/20", label: "יצירה" },
  UPDATE: { icon: Edit2, color: "text-blue-400", bg: "bg-blue-500/20", label: "עדכון" },
  DELETE: { icon: Trash2, color: "text-red-400", bg: "bg-red-500/20", label: "מחיקה" },
  VIEW: { icon: Eye, color: "text-muted-foreground", bg: "bg-muted/20", label: "צפייה" },
  EXPORT: { icon: Download, color: "text-purple-400", bg: "bg-purple-500/20", label: "ייצוא" },
};

export default function AuditLogPage() {
  const [items, setItems] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 0 });
  const [search, setSearch] = useState("");
  const [filterTable, setFilterTable] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [filterUser, setFilterUser] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [tablesList, setTablesList] = useState<any[]>([]);
  const [usersList, setUsersList] = useState<any[]>([]);

  const token = localStorage.getItem("token") || "";
  const headers: any = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const load = async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "50");
      if (search) params.set("search", search);
      if (filterTable) params.set("table_name", filterTable);
      if (filterAction) params.set("action", filterAction);
      if (filterUser) params.set("user_name", filterUser);
      if (fromDate) params.set("from_date", fromDate);
      if (toDate) params.set("to_date", toDate);

      const res = await authFetch(`${API}/audit-log?${params}`, { headers });
      const data = await res.json();
      setItems(data.data || []);
      setPagination(data.pagination || { page: 1, limit: 50, total: 0, pages: 0 });
    } catch { setItems([]); }
    setLoading(false);
  };

  const loadStats = async () => {
    try {
      const res = await authFetch(`${API}/audit-log/stats`, { headers });
      setStats(await res.json());
    } catch { setStats({}); }
  };

  const loadMeta = async () => {
    try {
      const [tablesRes, usersRes] = await Promise.all([
        authFetch(`${API}/audit-log/tables`, { headers }),
        authFetch(`${API}/audit-log/users`, { headers }),
      ]);
      setTablesList(await tablesRes.json());
      setUsersList(await usersRes.json());
    } catch {}
  };

  useEffect(() => { load(); loadStats(); loadMeta(); }, []);

  const applyFilters = () => { load(1); };

  const clearFilters = () => {
    setSearch(""); setFilterTable(""); setFilterAction(""); setFilterUser("");
    setFromDate(""); setToDate("");
    setTimeout(() => load(1), 50);
  };

  const formatDate = (d: string) => {
    if (!d) return "-";
    const date = new Date(d);
    return date.toLocaleDateString("he-IL") + " " + date.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  const renderChanges = (item: any) => {
    if (!item.old_values && !item.new_values) return null;

    if (item.action === "INSERT" && item.new_values) {
      const entries = Object.entries(item.new_values).filter(([k]) => !["created_at", "updated_at", "id"].includes(k));
      return (
        <div className="space-y-1">
          <div className="text-xs font-medium text-green-400 mb-2">ערכים חדשים:</div>
          {entries.map(([k, v]) => (
            <div key={k} className="flex gap-2 text-xs">
              <span className="text-muted-foreground min-w-[120px]">{k}:</span>
              <span className="text-green-300">{String(v ?? "-")}</span>
            </div>
          ))}
        </div>
      );
    }

    if (item.action === "DELETE" && item.old_values) {
      const entries = Object.entries(item.old_values).filter(([k]) => !["created_at", "updated_at"].includes(k));
      return (
        <div className="space-y-1">
          <div className="text-xs font-medium text-red-400 mb-2">ערכים שנמחקו:</div>
          {entries.map(([k, v]) => (
            <div key={k} className="flex gap-2 text-xs">
              <span className="text-muted-foreground min-w-[120px]">{k}:</span>
              <span className="text-red-300 line-through">{String(v ?? "-")}</span>
            </div>
          ))}
        </div>
      );
    }

    if (item.action === "UPDATE" && item.old_values && item.new_values) {
      const changedKeys = item.changed_fields || Object.keys(item.new_values).filter(k =>
        JSON.stringify(item.old_values[k]) !== JSON.stringify(item.new_values[k]) && k !== "updated_at"
      );
      return (
        <div className="space-y-2">
          <div className="text-xs font-medium text-blue-400 mb-2">שדות שהשתנו ({changedKeys.length}):</div>
          {changedKeys.map((k: string) => (
            <div key={k} className="bg-background/50 rounded p-2 text-xs">
              <div className="font-medium text-muted-foreground mb-1">{k}</div>
              <div className="flex gap-2 items-center">
                <span className="text-red-300 line-through">{String(item.old_values[k] ?? "(ריק)")}</span>
                <span className="text-muted-foreground">→</span>
                <span className="text-green-300">{String(item.new_values[k] ?? "(ריק)")}</span>
              </div>
            </div>
          ))}
        </div>
      );
    }

    return null;
  };

  return (
    <div className="p-4 md:p-6 space-y-6" dir="rtl">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold flex items-center gap-2"><History className="text-primary" /> היסטוריית שינויים</h1>
          <p className="text-sm text-muted-foreground mt-1">מעקב אחר כל השינויים במערכת — יצירה, עדכון, מחיקה</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown data={items} headers={{}} filename="audit-log" buttonClassName="btn-ghost text-xs flex items-center gap-1" compact />
          <button onClick={() => { load(); loadStats(); }} className="btn-ghost text-xs flex items-center gap-1"><RefreshCw size={14} /> רענון</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "סה\"כ רשומות", value: stats.total || 0, icon: Database, color: "text-blue-400" },
          { label: "יצירות", value: stats.inserts || 0, icon: Plus, color: "text-green-400" },
          { label: "עדכונים", value: stats.updates || 0, icon: Edit2, color: "text-yellow-400" },
          { label: "מחיקות", value: stats.deletes || 0, icon: Trash2, color: "text-red-400" },
          { label: "שעה אחרונה", value: stats.last_hour || 0, icon: Clock, color: "text-purple-400" },
        ].map((s, i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-4 text-center">
            <s.icon className={`mx-auto mb-1 ${s.color}`} size={20} />
            <div className="text-lg sm:text-2xl font-bold">{s.value}</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium"><Filter size={16} /> סינון מתקדם</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש חופשי..." className="w-full pr-9 pl-3 py-2 bg-background border border-border rounded-lg text-sm" />
          </div>
          <select value={filterTable} onChange={e => setFilterTable(e.target.value)} className="bg-background border border-border rounded-lg px-3 py-2 text-sm">
            <option value="">כל המודלים</option>
            {tablesList.map((t: any) => (
              <option key={t.table_name} value={t.table_name}>{TABLE_NAMES_HE[t.table_name] || t.table_name} ({t.count})</option>
            ))}
          </select>
          <select value={filterAction} onChange={e => setFilterAction(e.target.value)} className="bg-background border border-border rounded-lg px-3 py-2 text-sm">
            <option value="">כל הפעולות</option>
            <option value="INSERT">יצירה</option>
            <option value="UPDATE">עדכון</option>
            <option value="DELETE">מחיקה</option>
          </select>
          <input value={filterUser} onChange={e => setFilterUser(e.target.value)} placeholder="שם משתמש..." className="bg-background border border-border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><label className="text-xs text-muted-foreground">מתאריך</label><input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" /></div>
          <div><label className="text-xs text-muted-foreground">עד תאריך</label><input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" /></div>
          <div className="flex items-end gap-2">
            <button onClick={applyFilters} className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg text-sm flex-1">חפש</button>
            <button onClick={clearFilters} className="px-4 py-2 border border-border rounded-lg hover:bg-muted text-sm">נקה</button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="text-right p-3 w-[140px]">תאריך</th>
              <th className="text-right p-3">פעולה</th>
              <th className="text-right p-3">מודל</th>
              <th className="text-right p-3">מזהה</th>
              <th className="text-right p-3">משתמש</th>
              <th className="text-right p-3">תיאור</th>
              <th className="text-right p-3">פרטים</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center p-8 text-muted-foreground">טוען...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={7} className="text-center p-8 text-muted-foreground">אין רשומות</td></tr>
            ) : items.map(item => {
              const actionInfo = ACTION_ICONS[item.action] || ACTION_ICONS.VIEW;
              const Icon = actionInfo.icon;
              return (
                <tr key={item.id} className="border-b border-border/50 hover:bg-muted/30 cursor-pointer" onClick={() => setSelectedItem(item)}>
                  <td className="p-3 text-xs font-mono">{formatDate(item.created_at)}</td>
                  <td className="p-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${actionInfo.bg} ${actionInfo.color}`}>
                      <Icon size={12} /> {actionInfo.label}
                    </span>
                  </td>
                  <td className="p-3 text-xs">{TABLE_NAMES_HE[item.table_name] || item.table_name}</td>
                  <td className="p-3 text-xs font-mono">{item.record_id || "-"}</td>
                  <td className="p-3 text-xs">{item.user_name || "-"}</td>
                  <td className="p-3 text-xs max-w-[250px] truncate">{item.description || "-"}</td>
                  <td className="p-3">
                    <button onClick={(e) => { e.stopPropagation(); setSelectedItem(item); }} className="p-1.5 hover:bg-muted rounded"><Eye size={14} /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pagination.pages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            מציג {((pagination.page - 1) * pagination.limit) + 1}-{Math.min(pagination.page * pagination.limit, pagination.total)} מתוך {pagination.total}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => load(pagination.page - 1)} disabled={pagination.page <= 1} className="p-2 rounded hover:bg-muted disabled:opacity-30"><ChevronRight size={16} /></button>
            <span className="text-sm">עמוד {pagination.page} מתוך {pagination.pages}</span>
            <button onClick={() => load(pagination.page + 1)} disabled={pagination.page >= pagination.pages} className="p-2 rounded hover:bg-muted disabled:opacity-30"><ChevronLeft size={16} /></button>
          </div>
        </div>
      )}

      <AnimatePresence>
        {selectedItem && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setSelectedItem(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <History size={20} className="text-primary" /> פרטי שינוי #{selectedItem.id}
                </h2>
                <button onClick={() => setSelectedItem(null)} className="p-1 hover:bg-muted rounded text-lg">&times;</button>
              </div>
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-background rounded-lg p-3">
                    <div className="text-xs text-muted-foreground">תאריך</div>
                    <div className="text-sm font-medium">{formatDate(selectedItem.created_at)}</div>
                  </div>
                  <div className="bg-background rounded-lg p-3">
                    <div className="text-xs text-muted-foreground">פעולה</div>
                    <div className="text-sm font-medium">{(() => { const a = ACTION_ICONS[selectedItem.action]; const I = a?.icon || Eye; return <span className={`inline-flex items-center gap-1 ${a?.color || ""}`}><I size={14} /> {a?.label || selectedItem.action}</span>; })()}</div>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-background rounded-lg p-3">
                    <div className="text-xs text-muted-foreground">מודל</div>
                    <div className="text-sm font-medium">{TABLE_NAMES_HE[selectedItem.table_name] || selectedItem.table_name}</div>
                  </div>
                  <div className="bg-background rounded-lg p-3">
                    <div className="text-xs text-muted-foreground">מזהה רשומה</div>
                    <div className="text-sm font-medium font-mono">{selectedItem.record_id || "-"}</div>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-background rounded-lg p-3">
                    <div className="text-xs text-muted-foreground">משתמש</div>
                    <div className="text-sm font-medium">{selectedItem.user_name || "-"}</div>
                  </div>
                  <div className="bg-background rounded-lg p-3">
                    <div className="text-xs text-muted-foreground">כתובת IP</div>
                    <div className="text-sm font-medium font-mono">{selectedItem.ip_address || "-"}</div>
                  </div>
                </div>
                {selectedItem.description && (
                  <div className="bg-background rounded-lg p-3">
                    <div className="text-xs text-muted-foreground">תיאור</div>
                    <div className="text-sm">{selectedItem.description}</div>
                  </div>
                )}
                <div className="border-t border-border pt-3">
                  {renderChanges(selectedItem)}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ActivityLog entityType="audit-log" compact />
    </div>
  );
}
