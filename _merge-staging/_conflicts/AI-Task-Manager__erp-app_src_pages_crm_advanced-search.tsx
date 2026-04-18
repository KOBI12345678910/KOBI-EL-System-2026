import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Filter, Users, Mail, FileText, Target, Building2, X, ChevronDown } from "lucide-react";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import ActivityLog from "@/components/activity-log";
import { authFetch } from "@/lib/utils";

const fmtC = (n: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(n);

type ResultType = "lead" | "customer" | "deal" | "email" | "document";

interface SearchResult {
  id: number;
  type: ResultType;
  title: string;
  subtitle: string;
  meta?: string;
  value?: number;
  date?: string;
  status?: string;
}

const FALLBACK_DATA: SearchResult[] = [
  { id: 1, type: "lead", title: "דוד כהן", subtitle: "Tech Corp — ליד חדש", meta: "הפניה", value: 320000, date: "2026-03-17", status: "qualified" },
  { id: 2, type: "lead", title: "רחל לוי", subtitle: "Build Co — הצעה נשלחה", meta: "טלפון", value: 180000, date: "2026-03-16", status: "proposal" },
  { id: 3, type: "customer", title: "משה ישראלי", subtitle: "Construct Ltd — לקוח פעיל", meta: "רמת השרון", value: 650000, date: "2026-01-10", status: "active" },
  { id: 4, type: "customer", title: "שרה גולדברג", subtitle: "Arch Studio — לקוחה מ-2023", meta: "תל אביב", value: 230000, date: "2026-02-28", status: "active" },
  { id: 5, type: "deal", title: "חלונות אלומיניום — Tech Corp", subtitle: "320,000 ₪ • שלב: משא ומתן", meta: "סגירה: 15 אפריל", value: 320000, date: "2026-04-15", status: "negotiation" },
  { id: 6, type: "deal", title: "מערכת זגוגית — Build Co", subtitle: "180,000 ₪ • שלב: הצעה", meta: "סגירה: 28 אפריל", value: 180000, date: "2026-04-28", status: "proposal" },
  { id: 7, type: "email", title: "RE: הצעת מחיר למערכת זגוגית", subtitle: "מאת: אני → Build Co", meta: "16 מרץ 2026", date: "2026-03-16", status: "" },
  { id: 8, type: "email", title: "בקשה להצעת מחיר — חלונות אלומיניום", subtitle: "מאת: דוד כהן", meta: "17 מרץ 2026", date: "2026-03-17", status: "" },
  { id: 9, type: "document", title: "הצעת מחיר #2026-145", subtitle: "לקוח: Tech Corp", meta: "שמור כ-PDF", value: 320000, date: "2026-03-15", status: "" },
  { id: 10, type: "document", title: "חוזה שירות — Arch Studio", subtitle: "חוזה שנתי 2026", meta: "חתום", value: 230000, date: "2026-01-01", status: "" },
  { id: 11, type: "lead", title: "נועם ברכה", subtitle: "Industrial Works — ליד חם", meta: "הפניה", value: 580000, date: "2026-03-15", status: "qualified" },
  { id: 12, type: "customer", title: "יוסי מזרחי", subtitle: "Contractor Plus — לקוח ותיק", meta: "ירושלים", value: 1200000, date: "2025-06-01", status: "active" },
];

const TYPE_CONFIG: Record<ResultType, { label: string; icon: any; color: string }> = {
  lead: { label: "לידים", icon: Users, color: "text-blue-400" },
  customer: { label: "לקוחות", icon: Building2, color: "text-green-400" },
  deal: { label: "עסקאות", icon: Target, color: "text-purple-400" },
  email: { label: "אימיילים", icon: Mail, color: "text-amber-400" },
  document: { label: "מסמכים", icon: FileText, color: "text-cyan-400" },
};

export default function AdvancedSearchPage() {
  const { data: apiData } = useQuery<SearchResult[]>({
    queryKey: ["crm-advanced-search"],
    queryFn: async () => { const res = await authFetch("/api/crm/advanced-search"); if (!res.ok) throw new Error("API error"); return res.json(); },
  });
  const ALL_DATA = apiData ?? FALLBACK_DATA;

  const [query, setQuery] = useState("");
  const [filterType, setFilterType] = useState<ResultType | "all">("all");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterValueMin, setFilterValueMin] = useState("");
  const [filterValueMax, setFilterValueMax] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [searched, setSearched] = useState(false);
  const { selectedIds, setSelectedIds, toggle, toggleAll, isSelected } = useBulkSelection();

  const results = ALL_DATA.filter(item => {
    if (query && !`${item.title} ${item.subtitle} ${item.meta}`.toLowerCase().includes(query.toLowerCase())) return false;
    if (filterType !== "all" && item.type !== filterType) return false;
    if (filterStatus && item.status !== filterStatus) return false;
    if (filterValueMin && (item.value || 0) < Number(filterValueMin)) return false;
    if (filterValueMax && (item.value || 0) > Number(filterValueMax)) return false;
    if (filterDateFrom && item.date && item.date < filterDateFrom) return false;
    if (filterDateTo && item.date && item.date > filterDateTo) return false;
    return true;
  });

  const doSearch = () => setSearched(true);
  const clearFilters = () => {
    setFilterType("all");
    setFilterStatus("");
    setFilterValueMin("");
    setFilterValueMax("");
    setFilterDateFrom("");
    setFilterDateTo("");
  };

  const countByType = (type: ResultType) => results.filter(r => r.type === type).length;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div>
        <h1 className="text-lg sm:text-2xl font-bold flex items-center gap-2"><Search className="w-6 h-6 text-indigo-400" />Advanced Search</h1>
        <p className="text-sm text-muted-foreground">חיפוש מתקדם חוצה-מודולים — לידים, לקוחות, עסקאות, מיילים ומסמכים</p>
      </div>

      <div className="bg-card border rounded-xl p-5 space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute right-4 top-3 w-5 h-5 text-muted-foreground" />
            <input
              className="input input-bordered w-full pr-12 h-12 text-base"
              placeholder="חפש בכל מודולי ה-CRM..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && doSearch()}
              dir="rtl"
            />
            {query && <button onClick={() => { setQuery(""); setSearched(false); }} className="absolute left-3 top-3 text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>}
          </div>
          <button onClick={doSearch} className="btn btn-primary h-12 px-6">חפש</button>
          <button onClick={() => setShowFilters(!showFilters)} className={`btn h-12 px-4 flex items-center gap-1 ${showFilters ? "btn-primary" : "btn-outline"}`}>
            <Filter className="w-4 h-4" />פילטרים
            <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? "rotate-180" : ""}`} />
          </button>
        </div>

        {showFilters && (
          <div className="pt-3 border-t space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">סוג תוצאה</label>
                <select className="select select-bordered w-full select-sm mt-1" value={filterType} onChange={e => setFilterType(e.target.value as any)}>
                  <option value="all">הכל</option>
                  {Object.entries(TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">סטטוס</label>
                <select className="select select-bordered w-full select-sm mt-1" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                  <option value="">כל הסטטוסים</option>
                  <option value="active">פעיל</option>
                  <option value="qualified">מוסמך</option>
                  <option value="proposal">הצעה</option>
                  <option value="negotiation">משא ומתן</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">ערך מינימלי (₪)</label>
                <input type="number" className="input input-bordered w-full h-9 text-sm mt-1" placeholder="0" value={filterValueMin} onChange={e => setFilterValueMin(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">ערך מקסימלי (₪)</label>
                <input type="number" className="input input-bordered w-full h-9 text-sm mt-1" placeholder="ללא הגבלה" value={filterValueMax} onChange={e => setFilterValueMax(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">תאריך מ-</label>
                <input type="date" className="input input-bordered w-full h-9 text-sm mt-1" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">תאריך עד</label>
                <input type="date" className="input input-bordered w-full h-9 text-sm mt-1" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
              </div>
            </div>
            <button onClick={clearFilters} className="btn btn-outline btn-sm flex items-center gap-1"><X className="w-4 h-4" />נקה פילטרים</button>
          </div>
        )}
      </div>

      {(searched || query) && (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm text-muted-foreground">{results.length} תוצאות</span>
            {Object.entries(TYPE_CONFIG).map(([k, v]) => {
              const count = countByType(k as ResultType);
              if (!count) return null;
              return (
                <button key={k} onClick={() => setFilterType(filterType === k ? "all" : k as any)} className={`flex items-center gap-1 text-xs px-3 py-1 rounded-full border transition-colors ${filterType === k ? "bg-primary/20 border-primary/50 text-primary" : "border-border hover:bg-muted/50"}`}>
                  <v.icon className={`w-3 h-3 ${v.color}`} />{v.label} ({count})
                </button>
              );
            })}
          </div>

          <BulkActions items={results} selectedIds={selectedIds} onSelectionChange={setSelectedIds} actions={[
            defaultBulkActions.export(async (ids) => { const rows = results.filter(r => ids.has(r.id)); const csv = ["כותרת,סוג,ערך", ...rows.map(r => `${r.title},${r.type},${r.value||""}`)].join("\n"); const b = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "search_results.csv"; a.click(); }),
          ]} />
          <div className="space-y-2">
            {results.length === 0 ? (
              <div className="text-center py-12 border rounded-xl text-muted-foreground">
                <Search className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>לא נמצאו תוצאות</p>
                <p className="text-xs mt-1">נסה מחרוזת חיפוש אחרת או שנה פילטרים</p>
              </div>
            ) : (
              results.map(r => {
                const typeConf = TYPE_CONFIG[r.type];
                return (
                  <div key={`${r.type}-${r.id}`} className={`flex items-start gap-4 p-4 border rounded-xl bg-card hover:shadow-md transition-all cursor-pointer hover:border-primary/30 ${isSelected(r.id) ? "border-primary/50 bg-primary/5" : ""}`}>
                    <div className="flex-shrink-0 pt-1"><BulkCheckbox id={r.id} selectedIds={selectedIds} onToggle={toggle} mode="single" /></div>
                    <div className={`w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center flex-shrink-0`}>
                      <typeConf.icon className={`w-5 h-5 ${typeConf.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-medium">{r.title}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full bg-muted ${typeConf.color}`}>{typeConf.label}</span>
                        {r.status && <span className="text-xs bg-muted px-2 py-0.5 rounded">{r.status}</span>}
                      </div>
                      <div className="text-sm text-muted-foreground">{r.subtitle}</div>
                      {r.meta && <div className="text-xs text-muted-foreground/70 mt-0.5">{r.meta}</div>}
                    </div>
                    <div className="text-right flex-shrink-0">
                      {r.value && <div className="font-bold text-sm">{fmtC(r.value)}</div>}
                      {r.date && <div className="text-xs text-muted-foreground">{r.date}</div>}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {!searched && !query && (
        <div className="text-center py-16 text-muted-foreground">
          <Search className="w-16 h-16 mx-auto mb-4 opacity-20" />
          <p className="text-lg font-medium">חיפוש מתקדם</p>
          <p className="text-sm mt-1">הקלד מחרוזת חיפוש כדי לחפש בכל מודולי ה-CRM</p>
          <div className="flex gap-2 justify-center mt-4 flex-wrap">
            {["דוד כהן", "Tech Corp", "הצעת מחיר", "חלונות"].map(s => (
              <button key={s} onClick={() => { setQuery(s); setSearched(true); }} className="text-xs border rounded-full px-3 py-1 hover:bg-muted/50">{s}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
