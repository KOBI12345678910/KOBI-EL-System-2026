import { LoadingOverlay } from "@/components/ui/unified-states";
import { useState, useEffect, useMemo } from "react";
import { Link } from "wouter";
import {
  DollarSign, Search, Scale, TrendingUp, Droplets, BookOpen,
  BookMarked, Users, Truck, Receipt, CalendarRange, FileText,
  BarChart3, Star, ArrowUpRight, Hash, Eye, X, ArrowUpDown, AlertTriangle
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ExportDropdown from "@/components/export-dropdown";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { Badge } from "@/components/ui/badge";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import RelatedRecords from "@/components/related-records";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");

const DetailField = ({ label, value, children }: any) => (
  <div><span className="text-xs text-muted-foreground">{label}</span><div className="text-sm text-foreground mt-0.5">{children || value || "—"}</div></div>
);

interface ReportLink {
  label: string;
  href: string;
  icon: React.ElementType;
  description: string;
  category: string;
  categoryColor: string;
}

const ALL_REPORTS: ReportLink[] = [
  { label: "מאזן (Balance Sheet)", href: "/finance/balance-sheet", icon: Scale, description: "נכסים, התחייבויות והון עצמי", category: "דוחות כספיים", categoryColor: "bg-green-500/20 text-green-400" },
  { label: "רווח והפסד (P&L)", href: "/finance/financial-reports", icon: TrendingUp, description: "מאזן בוחן, רווח והפסד", category: "דוחות כספיים", categoryColor: "bg-green-500/20 text-green-400" },
  { label: "תזרים מזומנים", href: "/finance/cash-flow", icon: Droplets, description: "מעקב תזרים, תחזיות ונזילות", category: "דוחות כספיים", categoryColor: "bg-green-500/20 text-green-400" },
  { label: "מאזן בוחן (Trial Balance)", href: "/finance/financial-reports", icon: Scale, description: "בדיקת יתרות חשבון", category: "Ledgers", categoryColor: "bg-indigo-500/20 text-indigo-400" },
  { label: "ספר ראשי (General Ledger)", href: "/finance/general-ledger", icon: BookOpen, description: "כל תנועות החשבונאות", category: "Ledgers", categoryColor: "bg-indigo-500/20 text-indigo-400" },
  { label: "ספר ראשי לקוח/ספק", href: "/reports/financial/customer-vendor-ledger", icon: BookMarked, description: "תנועות לפי לקוח או ספק", category: "לקוחות/ספקים", categoryColor: "bg-blue-500/20 text-blue-400" },
  { label: "גיול לקוחות (AR Aging)", href: "/reports/financial/customer-aging", icon: Users, description: "חובות לקוחות לפי טווחי ימים", category: "לקוחות/ספקים", categoryColor: "bg-blue-500/20 text-blue-400" },
  { label: "גיול ספקים (AP Aging)", href: "/reports/financial/vendor-aging", icon: Truck, description: "חובות לספקים לפי טווחי ימים", category: "לקוחות/ספקים", categoryColor: "bg-blue-500/20 text-blue-400" },
  { label: 'דוח מע"מ (VAT Report)', href: "/reports/financial/vat-report", icon: Receipt, description: 'מע"מ עסקאות, תשומות ונטו', category: "מיסים", categoryColor: "bg-orange-500/20 text-orange-400" },
  { label: "Fiscal Report", href: "/reports/financial/fiscal-report", icon: CalendarRange, description: "סיכום פיסקלי שנתי/רבעוני", category: "מיסים", categoryColor: "bg-orange-500/20 text-orange-400" },
  { label: "ניהול מיסים", href: "/finance/tax-management", icon: Receipt, description: "מס הכנסה, ניכוי במקור ומועדים", category: "מיסים", categoryColor: "bg-orange-500/20 text-orange-400" },
  { label: "ניתוח חשבוניות", href: "/reports/financial/invoice-analysis", icon: FileText, description: "התפלגות, סטטוסים ומגמות", category: "ניהול", categoryColor: "bg-violet-500/20 text-violet-400" },
  { label: "דוחות אנליטיים", href: "/reports/financial/analytics", icon: BarChart3, description: "גרפים ומדדים כספיים מתקדמים", category: "ניהול", categoryColor: "bg-violet-500/20 text-violet-400" },
  { label: "תקציר מנהלים", href: "/reports/financial/executive-summary", icon: Star, description: "KPIs עיקריים בתצוגה ניהולית", category: "ניהול", categoryColor: "bg-violet-500/20 text-violet-400" },
];

const categories = [...new Set(ALL_REPORTS.map(r => r.category))];

export default function FinancialReports() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summaryData, setSummaryData] = useState<any>({});
  const [viewDetail, setViewDetail] = useState<ReportLink | null>(null);
  const [sortField, setSortField] = useState("label");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [detailTab, setDetailTab] = useState("details");
  const pagination = useSmartPagination(25);
  const { selectedIds, setSelectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await authFetch(`${API}/reports/financial-summary`);
      if (res.ok) setSummaryData(await res.json());
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("asc"); } };

  const filtered = useMemo(() => {
    let data = ALL_REPORTS.filter(r =>
      (filterCategory === "all" || r.category === filterCategory) &&
      (!search || [r.label, r.description, r.category].some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? ""; const vb = b[sortField] ?? "";
      const cmp = String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    pagination.setTotalItems(data.length);
    return data;
  }, [search, filterCategory, sortField, sortDir]);

  const kpis = [
    { label: 'סה"כ דוחות', value: String(ALL_REPORTS.length), icon: Hash, color: "text-blue-400" },
    { label: "קטגוריות", value: String(categories.length), icon: BarChart3, color: "text-purple-400" },
    { label: "דוחות כספיים", value: String(ALL_REPORTS.filter(r => r.category === "דוחות כספיים").length), icon: DollarSign, color: "text-green-400" },
    { label: "דוחות ניהול", value: String(ALL_REPORTS.filter(r => r.category === "ניהול").length), icon: Star, color: "text-violet-400" },
    { label: "מיסים", value: String(ALL_REPORTS.filter(r => r.category === "מיסים").length), icon: Receipt, color: "text-orange-400" },
  ];

  const exportData = filtered.map(r => ({ label: r.label, description: r.description, category: r.category, href: r.href }));

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <DollarSign className="text-green-400 w-6 h-6" /> דוחות כספיים — Financial Hub
          </h1>
          <p className="text-sm text-muted-foreground mt-1">כל הדוחות הכספיים מאורגנים בקטגוריות — בחר דוח להצגה</p>
        </div>
        <ExportDropdown
          data={exportData}
          headers={{ label: "דוח", description: "תיאור", category: "קטגוריה" }}
          filename="financial_reports_hub"
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
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
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש דוח..."
            className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
          className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הקטגוריות</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="text-sm text-muted-foreground">{filtered.length} דוחות</span>
      </div>

      {loading ? (
        <LoadingOverlay className="min-h-[200px]" />
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">אין דוחות תואמים</p>
          <p className="text-sm mt-1">נסה לשנות את החיפוש או הסינון</p>
        </div>
      ) : (
        <div className="space-y-5">
          {(filterCategory === "all" ? categories : [filterCategory]).map(cat => {
            const catReports = filtered.filter(r => r.category === cat);
            if (catReports.length === 0) return null;
            return (
              <div key={cat}>
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="text-base font-bold text-foreground">{cat}</h2>
                  <Badge className={`text-[10px] ${catReports[0]?.categoryColor}`}>{catReports.length} דוחות</Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {catReports.map(report => (
                    <motion.div key={report.href + report.label}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-card border border-border/50 rounded-2xl p-4 hover:border-primary/50 transition-all cursor-pointer group h-full"
                    >
                      <Link href={report.href}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <div className="p-2 rounded-xl bg-muted/50 mt-0.5 flex-shrink-0">
                              <report.icon className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-foreground leading-tight">{report.label}</p>
                              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{report.description}</p>
                            </div>
                          </div>
                          <ArrowUpRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5" />
                        </div>
                      </Link>
                      <div className="mt-3 flex justify-between items-center">
                        <Badge className={`text-[10px] ${report.categoryColor}`}>{report.category}</Badge>
                        <button onClick={e => { e.preventDefault(); e.stopPropagation(); setViewDetail(report); }} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {viewDetail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setViewDetail(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><DollarSign className="w-5 h-5 text-green-400" />{viewDetail.label}</h2>
                <button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 grid grid-cols-2 gap-4">
                <DetailField label="שם הדוח" value={viewDetail.label} />
                <DetailField label="קטגוריה"><Badge className={viewDetail.categoryColor}>{viewDetail.category}</Badge></DetailField>
                <div className="col-span-2"><DetailField label="תיאור" value={viewDetail.description} /></div>
                <DetailField label="נתיב" value={viewDetail.href} />
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <Link href={viewDetail.href}>
                  <button className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 flex items-center gap-2"><Eye className="w-4 h-4" /> פתח דוח</button>
                </Link>
                <button onClick={() => setViewDetail(null)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">סגור</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="financial-reports" entityId="all" />
        <RelatedRecords entityType="financial-reports" entityId="all" />
      </div>
    </div>
  );
}