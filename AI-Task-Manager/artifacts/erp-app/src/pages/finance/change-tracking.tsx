import { useState, useEffect, useMemo } from "react";
import {
  History, Search, AlertTriangle, ArrowUpDown, Hash, Eye, X,
  Clock, FileText, Users
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ExportDropdown from "@/components/export-dropdown";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/utils";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import AttachmentsSection from "@/components/attachments-section";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");

interface ChangeItem {
  id: number;
  entity_type: string;
  entity_id: string;
  field_name: string;
  old_value: string;
  new_value: string;
  changed_by: string;
  changed_at: string;
  action: string;
  ip_address: string;
  notes: string;
}

const actionMap: Record<string, { label: string; color: string }> = {
  create: { label: "יצירה", color: "bg-green-500/20 text-green-400" },
  update: { label: "עדכון", color: "bg-blue-500/20 text-blue-400" },
  delete: { label: "מחיקה", color: "bg-red-500/20 text-red-400" },
  approve: { label: "אישור", color: "bg-purple-500/20 text-purple-400" },
};

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      {children || <div className="text-sm text-foreground font-medium">{value || "—"}</div>}
    </div>
  );
}

export default function ChangeTrackingPage() {
  const [items, setItems] = useState<ChangeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState("all");
  const [sortField, setSortField] = useState("changed_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [viewDetail, setViewDetail] = useState<ChangeItem | null>(null);
  const pagination = useSmartPagination(25);
  const { selectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();
  const [detailTab, setDetailTab] = useState("details");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`${API}/change-tracking`);
      if (res.ok) setItems(safeArray(await res.json()));
      else setError("שגיאה בטעינת נתונים");
    } catch (e: any) {
      setError(e.message || "שגיאה");
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };

  const filtered = useMemo(() => {
    let data = items.filter(i =>
      (filterAction === "all" || i.action === filterAction) &&
      (!search || [i.entity_type, i.field_name, i.changed_by, i.old_value, i.new_value]
        .some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? "";
      const vb = b[sortField] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return data;
  }, [items, search, filterAction, sortField, sortDir]);

  const kpis = [
    { label: "שינויים", value: fmt(items.length), icon: Hash, color: "text-blue-400" },
    { label: "יצירות", value: fmt(items.filter(i => i.action === "create").length), icon: FileText, color: "text-green-400" },
    { label: "עדכונים", value: fmt(items.filter(i => i.action === "update").length), icon: History, color: "text-blue-400" },
    { label: "מחיקות", value: fmt(items.filter(i => i.action === "delete").length), icon: AlertTriangle, color: "text-red-400" },
    { label: "משתמשים", value: fmt(new Set(items.map(i => i.changed_by)).size), icon: Users, color: "text-purple-400" },
  ];

  const columns = [
    { key: "changed_at", label: "תאריך" },
    { key: "action", label: "פעולה" },
    { key: "entity_type", label: "ישות" },
    { key: "field_name", label: "שדה" },
    { key: "old_value", label: "ערך ישן" },
    { key: "new_value", label: "ערך חדש" },
    { key: "changed_by", label: "שונה ע\"י" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <History className="text-amber-400 w-6 h-6" />
            מעקב שינויים
          </h1>
          <p className="text-sm text-muted-foreground mt-1">יומן שינויים ופעולות במערכת</p>
        </div>
        <ExportDropdown
          data={filtered}
          headers={{
            changed_at: "תאריך", action: "פעולה", entity_type: "ישות",
            field_name: "שדה", changed_by: "שונה ע\"י",
          }}
          filename="change_tracking"
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpis.map((kpi, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-card border border-border/50 rounded-2xl p-4"
          >
            <kpi.icon className={`${kpi.color} w-5 h-5 mb-2`} />
            <div className="text-xl font-bold text-foreground">{kpi.value}</div>
            <div className="text-xs text-muted-foreground">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="חיפוש לפי ישות, שדה, משתמש..."
            className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        <select
          value={filterAction}
          onChange={e => setFilterAction(e.target.value)}
          className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm"
        >
          <option value="all">כל הפעולות</option>
          {Object.entries(actionMap).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
      </div>

      {loading ? (
        <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : error ? (
        <div className="text-center py-16 text-red-400">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="font-medium">שגיאה בטעינה</p>
          <p className="text-sm mt-1">{error}</p>
          <button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">
            נסה שנית
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">אין שינויים</p>
          <p className="text-sm mt-1">
            {search || filterAction !== "all" ? "נסה לשנות את הסינון" : "טרם נרשמו שינויים במערכת"}
          </p>
        </div>
      ) : (<>
        <BulkActions selectedIds={selectedIds} onClear={clear} entityName="items" actions={defaultBulkActions(selectedIds, clear, load, `${API}/change-tracking`)} />
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border/50">
                <tr>
                  <th className="px-4 py-3 w-10"><BulkCheckbox checked={selectedIds.length === filtered.length && filtered.length > 0} onChange={() => toggleAll(filtered.map(r => r.id))} /></th>
                  {columns.map(col => (
                    <th
                      key={col.key}
                      onClick={() => toggleSort(col.key)}
                      className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                    >
                      <div className="flex items-center gap-1">
                        {col.label}
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {pagination.paginate(filtered).map(r => (
                  <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 w-10"><BulkCheckbox checked={isSelected(r.id)} onChange={() => toggle(r.id)} /></td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {r.changed_at?.slice(0, 16).replace("T", " ")}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={`text-[10px] ${actionMap[r.action]?.color || "bg-muted/20 text-muted-foreground"}`}>
                        {actionMap[r.action]?.label || r.action}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-foreground">{r.entity_type}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.field_name}</td>
                    <td className="px-4 py-3 text-red-400 text-xs line-through">
                      {r.old_value?.slice(0, 30) || "—"}
                    </td>
                    <td className="px-4 py-3 text-green-400 text-xs">
                      {r.new_value?.slice(0, 30) || "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{r.changed_by}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => { setDetailTab("details"); setViewDetail(r); }}
                        className="p-1.5 hover:bg-muted rounded-lg"
                        title="צפייה"
                      >
                        <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
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
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setViewDetail(null)}
          >
            <motion.div
              initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <History className="w-5 h-5 text-amber-400" />
                  פרטי שינוי
                </h2>
                <button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>

                <div className="flex gap-1 p-3 border-b border-border bg-muted/20">
                  {[
                    { id: "details", label: "פרטים" },
                    { id: "related", label: "רשומות קשורות" },
                    { id: "attachments", label: "מסמכים" },
                    { id: "activity", label: "היסטוריה" },
                  ].map(tab => (
                    <button key={tab.id} onClick={() => setDetailTab(tab.id)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${detailTab === tab.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{tab.label}</button>
                  ))}
                </div>
              {detailTab === "details" ? (
                            <div className="p-5 grid grid-cols-2 gap-4">
                <DetailField label="תאריך" value={viewDetail.changed_at?.slice(0, 16).replace("T", " ")} />
                <DetailField label="פעולה">
                  <Badge className={actionMap[viewDetail.action]?.color}>
                    {actionMap[viewDetail.action]?.label || viewDetail.action}
                  </Badge>
                </DetailField>
                <DetailField label="סוג ישות" value={viewDetail.entity_type} />
                <DetailField label="מזהה ישות" value={viewDetail.entity_id} />
                <DetailField label="שדה" value={viewDetail.field_name} />
                <DetailField label={'שונה ע"י'} value={viewDetail.changed_by} />
                <DetailField label="ערך ישן" value={viewDetail.old_value} />
                <DetailField label="ערך חדש" value={viewDetail.new_value} />
                <DetailField label="כתובת IP" value={viewDetail.ip_address} />
                <div className="col-span-2">
                  <DetailField label="הערות" value={viewDetail.notes} />
                </div>
              </div>
                            ) : detailTab === "related" ? (
                <div className="p-5"><RelatedRecords entityType="changes" entityId={viewDetail?.id} /></div>
                ) : detailTab === "attachments" ? (
                <div className="p-5"><AttachmentsSection entityType="changes" entityId={viewDetail?.id} /></div>
                ) : (
                <div className="p-5"><ActivityLog entityType="changes" entityId={viewDetail?.id} /></div>
                )}
                <div className="p-5 border-t border-border flex justify-end">
                <button
                  onClick={() => setViewDetail(null)}
                  className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm"
                >
                  סגור
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
