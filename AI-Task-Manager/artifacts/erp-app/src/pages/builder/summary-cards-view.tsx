import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ExportDropdown from "@/components/export-dropdown";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { Badge } from "@/components/ui/badge";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { authFetch } from "@/lib/utils";
import {
  Eye, Edit2, Trash2, Search, ArrowUpDown, LayoutGrid,
  Hash, CheckCircle2, AlertTriangle, X, Filter, BarChart3
} from "lucide-react";
import { STATUS_COLORS } from "./field-type-registry";

const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");

const DetailField = ({ label, value, children }: any) => (
  <div><span className="text-xs text-muted-foreground">{label}</span><div className="text-sm text-foreground mt-0.5">{children || value || "—"}</div></div>
);

interface SummaryCardsViewProps {
  records: any[];
  fields: any[];
  statuses: any[];
  entity: any;
  activeView: any;
  entityId: number;
  onViewRecord: (record: any) => void;
  onEditRecord: (record: any) => void;
  onDeleteRecord: (id: number) => void;
  canEdit?: boolean;
  canDelete?: boolean;
}

export default function SummaryCardsView({
  records, fields, statuses, entity, activeView, entityId,
  onViewRecord, onEditRecord, onDeleteRecord, canEdit = true, canDelete = true,
}: SummaryCardsViewProps) {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortField, setSortField] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [viewDetail, setViewDetail] = useState<any>(null);
  const pagination = useSmartPagination(12);

  const headerField = useMemo(() => {
    const slug = activeView?.settings?.cardHeaderField;
    if (slug) return fields.find((f: any) => f.slug === slug);
    return fields.find((f: any) => f.showInList) || fields[0];
  }, [fields, activeView]);

  const subtitleField = useMemo(() => {
    const slug = activeView?.settings?.cardSubtitleField;
    if (slug) return fields.find((f: any) => f.slug === slug);
    return fields.filter((f: any) => f.showInList)[1] || null;
  }, [fields, activeView]);

  const bodyFields = useMemo(() => {
    const slugs = activeView?.settings?.cardBodyFields;
    if (slugs && Array.isArray(slugs)) {
      return slugs.map((s: string) => fields.find((f: any) => f.slug === s)).filter(Boolean);
    }
    return fields.filter((f: any) => f.showInList).slice(2, 6);
  }, [fields, activeView]);

  const colorField = activeView?.settings?.cardColorField;

  const cardColors = [
    "#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#ef4444",
    "#06b6d4", "#ec4899", "#14b8a6", "#f97316", "#6366f1",
  ];

  const columns = activeView?.settings?.cardColumns || 3;
  const gridClass = columns === 2 ? "grid-cols-1 md:grid-cols-2" :
                    columns === 4 ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-4" :
                    "grid-cols-1 md:grid-cols-2 lg:grid-cols-3";

  const filtered = useMemo(() => {
    let data = records.filter(rec => {
      const d = rec.data || {};
      if (filterStatus !== "all" && rec.status !== filterStatus) return false;
      if (search) {
        const searchLower = search.toLowerCase();
        const match = fields.some((f: any) => {
          const val = d[f.slug];
          return val && String(val).toLowerCase().includes(searchLower);
        }) || String(rec.id).includes(searchLower);
        if (!match) return false;
      }
      return true;
    });
    if (sortField) {
      data.sort((a: any, b: any) => {
        const va = (a.data || {})[sortField] ?? "";
        const vb = (b.data || {})[sortField] ?? "";
        const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    pagination.setTotalItems(data.length);
    return data;
  }, [records, search, filterStatus, sortField, sortDir, fields]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    records.forEach(r => {
      const s = r.status || "unknown";
      counts[s] = (counts[s] || 0) + 1;
    });
    return counts;
  }, [records]);

  const exportData = useMemo(() => {
    return filtered.map(rec => {
      const row: any = { id: rec.id, status: rec.status };
      fields.forEach((f: any) => { row[f.slug] = (rec.data || {})[f.slug] || ""; });
      return row;
    });
  }, [filtered, fields]);

  const exportHeaders = useMemo(() => {
    const h: Record<string, string> = { id: "מזהה", status: "סטטוס" };
    fields.forEach((f: any) => { h[f.slug] = f.name; });
    return h;
  }, [fields]);

  const kpis = [
    { label: `סה"כ רשומות`, value: fmt(records.length), icon: Hash, color: "text-blue-400" },
    { label: "מוצגות", value: fmt(filtered.length), icon: LayoutGrid, color: "text-emerald-400" },
    { label: "סטטוסים", value: fmt(Object.keys(statusCounts).length), icon: BarChart3, color: "text-amber-400" },
    { label: "שדות בכרטיס", value: fmt(bodyFields.length + (headerField ? 1 : 0) + (subtitleField ? 1 : 0)), icon: CheckCircle2, color: "text-purple-400" },
  ];

  const toggleSort = (slug: string) => {
    if (sortField === slug) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(slug); setSortDir("asc"); }
  };

  return (
    <div className="space-y-4" dir="rtl">
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
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש ברשומות..."
            className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הסטטוסים</option>
          {statuses.map((s: any) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
        </select>
        {fields.filter((f: any) => f.showInList).length > 0 && (
          <select value={sortField} onChange={e => toggleSort(e.target.value)}
            className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
            <option value="">מיון לפי...</option>
            {fields.filter((f: any) => f.showInList).map((f: any) => <option key={f.slug} value={f.slug}>{f.name}</option>)}
          </select>
        )}
        {sortField && (
          <button onClick={() => setSortDir(d => d === "asc" ? "desc" : "asc")} className="p-2 bg-card border border-border rounded-xl hover:bg-muted/30">
            <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
        <ExportDropdown data={exportData} headers={exportHeaders} filename={`cards_${entityId}`} />
        <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <LayoutGrid className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">אין רשומות להצגה</p>
          <p className="text-sm mt-1">{search || filterStatus !== "all" ? "נסה לשנות את הסינון" : "אין רשומות בישות זו"}</p>
        </div>
      ) : (<>
        <div className={`grid ${gridClass} gap-4`}>
          {pagination.paginate(filtered).map((rec: any, i: number) => {
            const data = rec.data || {};
            const statusDef = statuses.find((s: any) => s.slug === rec.status);
            const statusColorDef = STATUS_COLORS.find(c => c.key === statusDef?.color);

            let cardAccentColor = cardColors[i % cardColors.length];
            if (colorField) {
              const colorVal = data[colorField];
              if (colorVal && typeof colorVal === "string" && colorVal.startsWith("#")) {
                cardAccentColor = colorVal;
              } else if (colorVal) {
                const idx = Math.abs(String(colorVal).split("").reduce((a, c) => a + c.charCodeAt(0), 0)) % cardColors.length;
                cardAccentColor = cardColors[idx];
              }
            }

            return (
              <motion.div
                key={rec.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="bg-card border border-border rounded-2xl overflow-hidden hover:border-primary/30 transition-all group"
              >
                <div className="h-1" style={{ backgroundColor: cardAccentColor }} />

                <div className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm truncate text-foreground">
                        {headerField ? (data[headerField.slug] || `#${rec.id}`) : `#${rec.id}`}
                      </h3>
                      {subtitleField && data[subtitleField.slug] && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {String(data[subtitleField.slug])}
                        </p>
                      )}
                    </div>
                    {statusDef && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0 mr-2"
                        style={{ backgroundColor: `${statusColorDef?.hex || "#6b7280"}20`, color: statusColorDef?.hex || "#6b7280" }}>
                        {statusDef.name}
                      </span>
                    )}
                  </div>

                  {bodyFields.length > 0 && (
                    <div className="space-y-1.5 mb-3">
                      {bodyFields.map((f: any) => {
                        const val = data[f.slug];
                        if (val === undefined || val === null || val === "") return null;
                        return (
                          <div key={f.slug} className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">{f.name}</span>
                            <span className="font-medium truncate max-w-[60%] text-left text-foreground">
                              {formatValue(val, f)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="flex items-center gap-1 pt-2 border-t border-border/50 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => { setViewDetail(rec); onViewRecord(rec); }} className="flex-1 flex items-center justify-center gap-1 p-1.5 hover:bg-muted rounded-lg text-xs text-muted-foreground">
                      <Eye className="w-3.5 h-3.5" /> צפייה
                    </button>
                    {canEdit && (
                      <button onClick={() => onEditRecord(rec)} className="flex-1 flex items-center justify-center gap-1 p-1.5 hover:bg-muted rounded-lg text-xs text-muted-foreground">
                        <Edit2 className="w-3.5 h-3.5" /> עריכה
                      </button>
                    )}
                    {canDelete && (
                      <button onClick={async () => { if (await globalConfirm("למחוק רשומה זו?")) onDeleteRecord(rec.id); }}
                        className="p-1.5 hover:bg-destructive/10 rounded-lg">
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
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
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <LayoutGrid className="w-5 h-5 text-blue-400" />
                  רשומה #{viewDetail.id}
                </h2>
                <button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 grid grid-cols-2 gap-4">
                <DetailField label="מזהה" value={`#${viewDetail.id}`} />
                <DetailField label="סטטוס">
                  {(() => {
                    const sd = statuses.find((s: any) => s.slug === viewDetail.status);
                    const sc = STATUS_COLORS.find(c => c.key === sd?.color);
                    return sd ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                        style={{ backgroundColor: `${sc?.hex || "#6b7280"}20`, color: sc?.hex || "#6b7280" }}>
                        {sd.name}
                      </span>
                    ) : <span className="text-muted-foreground">{viewDetail.status || "—"}</span>;
                  })()}
                </DetailField>
                {fields.map((f: any) => {
                  const val = (viewDetail.data || {})[f.slug];
                  if (val === undefined || val === null || val === "") return null;
                  return <DetailField key={f.slug} label={f.name} value={formatValue(val, f)} />;
                })}
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                {canEdit && (
                  <button onClick={() => { setViewDetail(null); onEditRecord(viewDetail); }} className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm hover:bg-blue-500/30">
                    <Edit2 className="w-3.5 h-3.5 inline ml-1" /> עריכה
                  </button>
                )}
                <button onClick={() => setViewDetail(null)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">סגור</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function formatValue(value: any, field: any): string {
  if (value === null || value === undefined) return "-";
  const type = field.fieldType;
  if (type === "boolean" || type === "checkbox") return value ? "✓" : "✗";
  if (type === "date") return new Date(value).toLocaleDateString("he-IL");
  if (type === "datetime") return new Date(value).toLocaleString("he-IL");
  if (type === "currency") return `₪${Number(value).toLocaleString()}`;
  if (type === "percent") return `${value}%`;
  if (type === "tags" || type === "multi_select") return Array.isArray(value) ? value.join(", ") : String(value);
  const str = String(value);
  return str.length > 50 ? str.slice(0, 50) + "..." : str;
}
