import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Database, FileText, Filter, Search, Download, Share2,
  Eye, Calendar, User, Tag, Lock, Globe, Building2,
  BarChart3, PieChart, TrendingUp, ChevronLeft, History,
  Link2, Clock, ShieldCheck, FileType,
} from "lucide-react";

/* ── mock data: 20 documents ── */

const FALLBACK_DOCUMENTS = [
  { id: "DOC-10201", name: "הזמנת רכש PO-2456", type: "הזמנה", dept: "רכש", version: "v1.0", status: "מאושר", author: "יוסי כהן", created: "2026-01-12", updated: "2026-01-12", size: "245 KB", format: "PDF", access: "מחלקתי", tags: ["רכש", "ספקים"] },
  { id: "DOC-10202", name: "תעודת משלוח DN-1234", type: "תעודה", dept: "ייצור", version: "v1.2", status: "פעיל", author: "שרה מזרחי", created: "2026-01-18", updated: "2026-02-05", size: "132 KB", format: "PDF", access: "ציבורי", tags: ["משלוח", "לוגיסטיקה"] },
  { id: "DOC-10203", name: "פרוטוקול בדיקת איכות QC-890", type: "פרוטוקול", dept: "איכות", version: "v2.3", status: "מאושר", author: "דוד מזרחי", created: "2025-11-03", updated: "2026-03-20", size: "1.8 MB", format: "PDF", access: "מוגבל", tags: ["איכות", "בדיקה", "ISO"] },
  { id: "DOC-10204", name: "שרטוט הנדסי DWG-345", type: "שרטוט", dept: "הנדסה", version: "v4.1", status: "בבדיקה", author: "אלון גולדשטיין", created: "2025-09-22", updated: "2026-04-01", size: "12.4 MB", format: "DWG", access: "מוגבל", tags: ["הנדסה", "מכני"] },
  { id: "DOC-10205", name: "חוזה לקוח CNT-567", type: "חוזה", dept: "כספים", version: "v1.0", status: "פעיל", author: "רחל אברהם", created: "2026-02-01", updated: "2026-02-01", size: "520 KB", format: "DOCX", access: "סודי", tags: ["חוזה", "לקוח"] },
  { id: "DOC-10206", name: 'דו"ח ייצור חודשי RPT-0326', type: 'דו"ח', dept: "ייצור", version: "v1.0", status: "מאושר", author: "מיכל ברק", created: "2026-03-31", updated: "2026-04-02", size: "3.2 MB", format: "XLSX", access: "מחלקתי", tags: ["ייצור", "חודשי"] },
  { id: "DOC-10207", name: "טופס בקשת חומרים FRM-112", type: "טופס", dept: "ייצור", version: "v2.0", status: "טיוטה", author: "עומר חדד", created: "2026-04-03", updated: "2026-04-05", size: "87 KB", format: "PDF", access: "מחלקתי", tags: ["ייצור", "חומרים"] },
  { id: "DOC-10208", name: "מפרט טכני חומרים SPC-220", type: "מפרט", dept: "הנדסה", version: "v3.0", status: "מאושר", author: "אלון גולדשטיין", created: "2025-08-15", updated: "2026-01-10", size: "890 KB", format: "PDF", access: "מוגבל", tags: ["מפרט", "חומרים", "הנדסה"] },
  { id: "DOC-10209", name: "הנחיית בטיחות GDL-055", type: "הנחיה", dept: "איכות", version: "v5.2", status: "פעיל", author: "נועה פרידמן", created: "2025-06-01", updated: "2026-03-15", size: "1.1 MB", format: "PDF", access: "ציבורי", tags: ["בטיחות", "נהלים"] },
  { id: "DOC-10210", name: "אישור ספק חדש APR-789", type: "אישור", dept: "רכש", version: "v1.0", status: "בבדיקה", author: "יוסי כהן", created: "2026-04-06", updated: "2026-04-07", size: "310 KB", format: "PDF", access: "סודי", tags: ["רכש", "ספקים", "אישור"] },
  { id: "DOC-10211", name: "הזמנת רכש PO-2501", type: "הזמנה", dept: "רכש", version: "v1.1", status: "פעיל", author: "שרה לוי", created: "2026-03-20", updated: "2026-03-28", size: "198 KB", format: "PDF", access: "מחלקתי", tags: ["רכש", "חומרי גלם"] },
  { id: "DOC-10212", name: "שרטוט מסגרת T-400 DWG-401", type: "שרטוט", dept: "הנדסה", version: "v2.0", status: "מאושר", author: "דוד לוי", created: "2025-10-10", updated: "2026-02-18", size: "8.7 MB", format: "DWG", access: "מוגבל", tags: ["הנדסה", "מסגרת"] },
  { id: "DOC-10213", name: "חוזה שכירות מחסן CNT-890", type: "חוזה", dept: "הנהלה", version: "v2.1", status: "פג תוקף", author: "נועה פרידמן", created: "2024-04-01", updated: "2026-03-01", size: "670 KB", format: "DOCX", access: "סודי", tags: ["חוזה", "נדל\"ן"] },
  { id: "DOC-10214", name: "פרוטוקול ישיבת הנהלה PTL-0326", type: "פרוטוקול", dept: "הנהלה", version: "v1.0", status: "מאושר", author: "רחל אברהם", created: "2026-03-30", updated: "2026-03-31", size: "156 KB", format: "DOCX", access: "סודי", tags: ["הנהלה", "ישיבה"] },
  { id: "DOC-10215", name: "תעודת כיול ציוד CLB-044", type: "תעודה", dept: "איכות", version: "v1.0", status: "פעיל", author: "דוד מזרחי", created: "2026-02-20", updated: "2026-02-20", size: "420 KB", format: "PDF", access: "מחלקתי", tags: ["איכות", "כיול"] },
  { id: "DOC-10216", name: 'דו"ח התקנה שטח RPT-INS-78', type: 'דו"ח', dept: "התקנות", version: "v1.0", status: "טיוטה", author: "עומר חדד", created: "2026-04-04", updated: "2026-04-06", size: "5.6 MB", format: "PDF", access: "מחלקתי", tags: ["התקנה", "שטח", "צילומים"] },
  { id: "DOC-10217", name: "טופס קבלת סחורה FRM-210", type: "טופס", dept: "רכש", version: "v3.1", status: "פעיל", author: "שרה לוי", created: "2025-07-12", updated: "2026-01-22", size: "95 KB", format: "PDF", access: "ציבורי", tags: ["רכש", "קבלה"] },
  { id: "DOC-10218", name: "מפרט התקנה SPC-INS-33", type: "מפרט", dept: "התקנות", version: "v2.0", status: "מאושר", author: "מיכל ברק", created: "2025-12-01", updated: "2026-03-10", size: "2.3 MB", format: "PDF", access: "מחלקתי", tags: ["התקנה", "מפרט"] },
  { id: "DOC-10219", name: "הנחיית עבודה בגובה GDL-088", type: "הנחיה", dept: "שירות", version: "v1.4", status: "פעיל", author: "נועה פרידמן", created: "2025-05-20", updated: "2026-02-28", size: "780 KB", format: "PDF", access: "ציבורי", tags: ["בטיחות", "שירות"] },
  { id: "DOC-10220", name: "אישור תקציב פרויקט APR-BDG-12", type: "אישור", dept: "כספים", version: "v1.0", status: "מבוטל", author: "דוד לוי", created: "2026-03-15", updated: "2026-04-01", size: "210 KB", format: "XLSX", access: "סודי", tags: ["תקציב", "כספים", "פרויקט"] },
];

/* ── version history for selected doc ── */

const FALLBACK_VERSION_HISTORY = [
  { version: "v2.3", date: "2026-03-20", author: "דוד מזרחי", notes: "עדכון קריטריוני בדיקה לפי ISO 9001:2025" },
  { version: "v2.2", date: "2026-01-15", author: "דוד מזרחי", notes: "הוספת בדיקת חוזק מתיחה לחומרי גלם" },
  { version: "v2.1", date: "2025-11-28", author: "מיכל ברק", notes: "תיקון סף דחייה ל-0.02 מ\"מ" },
];

const FALLBACK_LINKED_ENTITIES = [
  { type: "פרויקט", id: "PRJ-2026-015", name: "פרויקט מסגרת דלתא" },
  { type: "הזמנה", id: "PO-2456", name: "הזמנת חומרי גלם פלדה" },
  { type: "התקנה", id: "INS-078", name: "התקנת קו ייצור 4" },
];

/* ── statistics data ── */

const FALLBACK_DOCS_BY_TYPE = [
  { type: "הזמנה", count: 342, color: "bg-blue-500" },
  { type: "תעודה", count: 218, color: "bg-emerald-500" },
  { type: "פרוטוקול", count: 156, color: "bg-purple-500" },
  { type: "שרטוט", count: 134, color: "bg-orange-500" },
  { type: "חוזה", count: 98, color: "bg-red-500" },
  { type: 'דו"ח', count: 112, color: "bg-cyan-500" },
  { type: "טופס", count: 87, color: "bg-amber-500" },
  { type: "מפרט", count: 65, color: "bg-indigo-500" },
  { type: "הנחיה", count: 42, color: "bg-pink-500" },
  { type: "אישור", count: 30, color: "bg-teal-500" },
];
const totalDocs = FALLBACK_DOCS_BY_TYPE.reduce((s, d) => s + d.count, 0);

const FALLBACK_DOCS_BY_DEPT = [
  { dept: "ייצור", count: 310 },
  { dept: "רכש", count: 245 },
  { dept: "כספים", count: 198 },
  { dept: "הנדסה", count: 176 },
  { dept: "איכות", count: 152 },
  { dept: "התקנות", count: 98 },
  { dept: "שירות", count: 67 },
  { dept: "הנהלה", count: 38 },
];
const maxDept = Math.max(...FALLBACK_DOCS_BY_DEPT.map((d) => d.count));

const FALLBACK_MONTHLY_UPLOADS = [
  { month: "אוק 25", count: 78 },
  { month: "נוב 25", count: 92 },
  { month: "דצמ 25", count: 64 },
  { month: "ינו 26", count: 105 },
  { month: "פבר 26", count: 118 },
  { month: "מרץ 26", count: 134 },
];
const maxUpload = Math.max(...FALLBACK_MONTHLY_UPLOADS.map((m) => m.count));

/* ── helpers ── */

const statusColor: Record<string, string> = {
  "טיוטה": "bg-slate-700 text-slate-300",
  "פעיל": "bg-blue-900/60 text-blue-300",
  "בבדיקה": "bg-amber-900/60 text-amber-300",
  "מאושר": "bg-emerald-900/60 text-emerald-300",
  "פג תוקף": "bg-red-900/60 text-red-300",
  "מבוטל": "bg-rose-900/60 text-rose-400",
};

const accessColor: Record<string, string> = {
  "ציבורי": "bg-green-900/50 text-green-300",
  "מחלקתי": "bg-blue-900/50 text-blue-300",
  "מוגבל": "bg-amber-900/50 text-amber-300",
  "סודי": "bg-red-900/50 text-red-300",
};

const accessIcon: Record<string, JSX.Element> = {
  "ציבורי": <Globe className="w-3 h-3 inline mr-1" />,
  "מחלקתי": <Building2 className="w-3 h-3 inline mr-1" />,
  "מוגבל": <ShieldCheck className="w-3 h-3 inline mr-1" />,
  "סודי": <Lock className="w-3 h-3 inline mr-1" />,
};

/* ── filters state type ── */

type Filters = {
  type: string;
  dept: string;
  status: string;
  author: string;
  search: string;
};

/* ── component ── */

export default function DocumentRegistry() {

  const { data: apiData } = useQuery({
    queryKey: ["document_registry"],
    queryFn: () => authFetch("/api/documents/document-registry").then(r => r.json()),
    staleTime: 60_000,
    retry: 1,
  });
  const documents = apiData?.documents ?? FALLBACK_DOCUMENTS;
  const versionHistory = apiData?.versionHistory ?? FALLBACK_VERSION_HISTORY;
  const linkedEntities = apiData?.linkedEntities ?? FALLBACK_LINKED_ENTITIES;
  const docsByType = apiData?.docsByType ?? FALLBACK_DOCS_BY_TYPE;
  const docsByDept = apiData?.docsByDept ?? FALLBACK_DOCS_BY_DEPT;
  const monthlyUploads = apiData?.monthlyUploads ?? FALLBACK_MONTHLY_UPLOADS;
  const [tab, setTab] = useState("table");
  const [selectedDoc, setSelectedDoc] = useState(documents[2]); // QC-890 as default
  const [filters, setFilters] = useState<Filters>({
    type: "",
    dept: "",
    status: "",
    author: "",
    search: "",
  });

  const uniqueTypes = [...new Set(documents.map((d) => d.type))];
  const uniqueDepts = [...new Set(documents.map((d) => d.dept))];
  const uniqueStatuses = [...new Set(documents.map((d) => d.status))];
  const uniqueAuthors = [...new Set(documents.map((d) => d.author))];

  const filtered = documents.filter((d) => {
    if (filters.type && d.type !== filters.type) return false;
    if (filters.dept && d.dept !== filters.dept) return false;
    if (filters.status && d.status !== filters.status) return false;
    if (filters.author && d.author !== filters.author) return false;
    if (filters.search && !d.name.includes(filters.search) && !d.id.includes(filters.search)) return false;
    return true;
  });

  return (
    <div dir="rtl" className="min-h-screen bg-[#0a0a0f] text-white p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Database className="w-7 h-7 text-indigo-400" />
        <h1 className="text-2xl font-bold tracking-tight">רישום מסמכים מרכזי</h1>
        <Badge className="bg-indigo-900/50 text-indigo-300 mr-auto">טכנו-כל עוזי</Badge>
      </div>

      {/* Filter bar */}
      <Card className="bg-[#12121a] border-[#1e1e2e]">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-slate-400" />
            <span className="text-sm text-slate-400 font-medium">סינון מסמכים</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute right-3 top-2.5 text-slate-500" />
              <input
                type="text"
                placeholder="חיפוש..."
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                className="w-full bg-[#0a0a0f] border border-[#2a2a3e] rounded-md pr-9 pl-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })} className="bg-[#0a0a0f] border border-[#2a2a3e] rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
              <option value="">סוג מסמך - הכל</option>
              {uniqueTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={filters.dept} onChange={(e) => setFilters({ ...filters, dept: e.target.value })} className="bg-[#0a0a0f] border border-[#2a2a3e] rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
              <option value="">מחלקה - הכל</option>
              {uniqueDepts.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className="bg-[#0a0a0f] border border-[#2a2a3e] rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
              <option value="">סטטוס - הכל</option>
              {uniqueStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={filters.author} onChange={(e) => setFilters({ ...filters, author: e.target.value })} className="bg-[#0a0a0f] border border-[#2a2a3e] rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
              <option value="">מחבר - הכל</option>
              {uniqueAuthors.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <button
              onClick={() => setFilters({ type: "", dept: "", status: "", author: "", search: "" })}
              className="bg-[#1e1e2e] hover:bg-[#2a2a3e] border border-[#2a2a3e] rounded-md px-3 py-2 text-sm text-slate-300 transition-colors"
            >
              נקה סינון
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="bg-[#12121a] border border-[#1e1e2e] flex-wrap">
          <TabsTrigger value="table">טבלת מסמכים</TabsTrigger>
          <TabsTrigger value="preview">תצוגת מסמך</TabsTrigger>
          <TabsTrigger value="stats">סטטיסטיקות</TabsTrigger>
        </TabsList>

        {/* ── Master Document Table ── */}
        <TabsContent value="table">
          <Card className="bg-[#12121a] border-[#1e1e2e]">
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#1e1e2e]">
                    <TableHead className="text-right text-slate-400">מזהה</TableHead>
                    <TableHead className="text-right text-slate-400">שם מסמך</TableHead>
                    <TableHead className="text-right text-slate-400">סוג</TableHead>
                    <TableHead className="text-right text-slate-400">מחלקה</TableHead>
                    <TableHead className="text-right text-slate-400">גרסה</TableHead>
                    <TableHead className="text-right text-slate-400">מצב</TableHead>
                    <TableHead className="text-right text-slate-400">מחבר</TableHead>
                    <TableHead className="text-right text-slate-400">יצירה</TableHead>
                    <TableHead className="text-right text-slate-400">עדכון</TableHead>
                    <TableHead className="text-right text-slate-400">גודל</TableHead>
                    <TableHead className="text-right text-slate-400">פורמט</TableHead>
                    <TableHead className="text-right text-slate-400">הרשאות</TableHead>
                    <TableHead className="text-right text-slate-400">תגיות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((d) => (
                    <TableRow
                      key={d.id}
                      className="border-[#1e1e2e] hover:bg-[#1a1a2e] cursor-pointer"
                      onClick={() => { setSelectedDoc(d); setTab("preview"); }}
                    >
                      <TableCell className="font-mono text-indigo-400 text-xs">{d.id}</TableCell>
                      <TableCell className="font-medium max-w-[200px] truncate">{d.name}</TableCell>
                      <TableCell><Badge variant="outline" className="text-slate-300 border-slate-600 text-xs">{d.type}</Badge></TableCell>
                      <TableCell className="text-slate-400 text-xs">{d.dept}</TableCell>
                      <TableCell className="font-mono text-xs">{d.version}</TableCell>
                      <TableCell><Badge className={`text-xs ${statusColor[d.status] || "bg-slate-700 text-slate-300"}`}>{d.status}</Badge></TableCell>
                      <TableCell className="text-xs">{d.author}</TableCell>
                      <TableCell className="text-slate-400 text-xs">{d.created}</TableCell>
                      <TableCell className="text-slate-400 text-xs">{d.updated}</TableCell>
                      <TableCell className="text-xs font-mono">{d.size}</TableCell>
                      <TableCell><Badge className="bg-[#1e1e2e] text-slate-300 text-xs">{d.format}</Badge></TableCell>
                      <TableCell><Badge className={`text-xs ${accessColor[d.access] || ""}`}>{accessIcon[d.access]}{d.access}</Badge></TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {d.tags.map((t) => (
                            <Badge key={t} className="bg-[#1a1a2e] text-slate-400 text-[10px] border border-[#2a2a3e]">{t}</Badge>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="p-3 border-t border-[#1e1e2e] text-xs text-slate-500 flex justify-between">
                <span>מציג {filtered.length} מתוך {documents.length} מסמכים</span>
                <span>לחץ על שורה לתצוגת פרטים</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Document Preview Card ── */}
        <TabsContent value="preview">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Main metadata */}
            <Card className="lg:col-span-2 bg-[#12121a] border-[#1e1e2e]">
              <CardContent className="p-6 space-y-5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <FileText className="w-5 h-5 text-indigo-400" />
                      <span className="font-mono text-indigo-400 text-sm">{selectedDoc.id}</span>
                      <Badge className={`text-xs ${statusColor[selectedDoc.status]}`}>{selectedDoc.status}</Badge>
                      <Badge className={`text-xs ${accessColor[selectedDoc.access]}`}>{accessIcon[selectedDoc.access]}{selectedDoc.access}</Badge>
                    </div>
                    <h2 className="text-xl font-bold">{selectedDoc.name}</h2>
                  </div>
                  <div className="flex gap-2">
                    <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-md text-sm flex items-center gap-1.5 transition-colors">
                      <Download className="w-4 h-4" /> הורדה
                    </button>
                    <button className="bg-[#1e1e2e] hover:bg-[#2a2a3e] text-white px-3 py-1.5 rounded-md text-sm flex items-center gap-1.5 border border-[#2a2a3e] transition-colors">
                      <Share2 className="w-4 h-4" /> שיתוף
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: "סוג", value: selectedDoc.type, icon: <FileType className="w-4 h-4 text-slate-500" /> },
                    { label: "מחלקה", value: selectedDoc.dept, icon: <Building2 className="w-4 h-4 text-slate-500" /> },
                    { label: "גרסה", value: selectedDoc.version, icon: <History className="w-4 h-4 text-slate-500" /> },
                    { label: "פורמט", value: selectedDoc.format, icon: <FileText className="w-4 h-4 text-slate-500" /> },
                    { label: "מחבר", value: selectedDoc.author, icon: <User className="w-4 h-4 text-slate-500" /> },
                    { label: "תאריך יצירה", value: selectedDoc.created, icon: <Calendar className="w-4 h-4 text-slate-500" /> },
                    { label: "עדכון אחרון", value: selectedDoc.updated, icon: <Clock className="w-4 h-4 text-slate-500" /> },
                    { label: "גודל קובץ", value: selectedDoc.size, icon: <Database className="w-4 h-4 text-slate-500" /> },
                  ].map((f) => (
                    <div key={f.label} className="bg-[#0a0a0f] rounded-lg p-3 border border-[#1e1e2e]">
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">{f.icon}{f.label}</div>
                      <div className="text-sm font-medium">{f.value}</div>
                    </div>
                  ))}
                </div>

                <div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-2"><Tag className="w-4 h-4" />תגיות</div>
                  <div className="flex gap-2 flex-wrap">
                    {selectedDoc.tags.map((t) => (
                      <Badge key={t} className="bg-indigo-900/30 text-indigo-300 border border-indigo-800/50">{t}</Badge>
                    ))}
                  </div>
                </div>

                {/* Version History */}
                <div>
                  <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-1.5">
                    <History className="w-4 h-4 text-purple-400" /> היסטוריית גרסאות
                  </h3>
                  <div className="space-y-2">
                    {versionHistory.map((v, i) => (
                      <div key={i} className="bg-[#0a0a0f] rounded-lg p-3 border border-[#1e1e2e] flex items-start gap-3">
                        <Badge className={i === 0 ? "bg-emerald-900/60 text-emerald-300 mt-0.5" : "bg-slate-700 text-slate-300 mt-0.5"}>{v.version}</Badge>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span>{v.date}</span>
                            <span className="text-slate-600">|</span>
                            <span>{v.author}</span>
                          </div>
                          <p className="text-sm text-slate-300 mt-0.5">{v.notes}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Sidebar: Linked Entities */}
            <div className="space-y-4">
              <Card className="bg-[#12121a] border-[#1e1e2e]">
                <CardContent className="p-5 space-y-4">
                  <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-1.5">
                    <Link2 className="w-4 h-4 text-cyan-400" /> ישויות מקושרות
                  </h3>
                  {linkedEntities.map((e, i) => (
                    <div key={i} className="bg-[#0a0a0f] rounded-lg p-3 border border-[#1e1e2e]">
                      <Badge variant="outline" className="text-cyan-400 border-cyan-800 text-[10px] mb-1.5">{e.type}</Badge>
                      <div className="text-sm font-medium">{e.name}</div>
                      <div className="text-xs text-slate-500 font-mono">{e.id}</div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="bg-[#12121a] border-[#1e1e2e]">
                <CardContent className="p-5 space-y-3">
                  <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-1.5">
                    <Eye className="w-4 h-4 text-amber-400" /> פעולות מהירות
                  </h3>
                  <button className="w-full bg-[#1e1e2e] hover:bg-[#2a2a3e] border border-[#2a2a3e] rounded-md px-3 py-2.5 text-sm text-slate-300 flex items-center gap-2 transition-colors">
                    <Eye className="w-4 h-4" /> תצוגה מקדימה
                  </button>
                  <button className="w-full bg-[#1e1e2e] hover:bg-[#2a2a3e] border border-[#2a2a3e] rounded-md px-3 py-2.5 text-sm text-slate-300 flex items-center gap-2 transition-colors">
                    <Download className="w-4 h-4" /> הורד עותק
                  </button>
                  <button className="w-full bg-[#1e1e2e] hover:bg-[#2a2a3e] border border-[#2a2a3e] rounded-md px-3 py-2.5 text-sm text-slate-300 flex items-center gap-2 transition-colors">
                    <Share2 className="w-4 h-4" /> שתף קישור
                  </button>
                  <button
                    onClick={() => setTab("table")}
                    className="w-full bg-[#1e1e2e] hover:bg-[#2a2a3e] border border-[#2a2a3e] rounded-md px-3 py-2.5 text-sm text-slate-300 flex items-center gap-2 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" /> חזרה לטבלה
                  </button>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ── Statistics ── */}
        <TabsContent value="stats">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Docs by Type (pie-like) */}
            <Card className="bg-[#12121a] border-[#1e1e2e]">
              <CardContent className="p-5 space-y-4">
                <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-1.5">
                  <PieChart className="w-4 h-4 text-purple-400" /> מסמכים לפי סוג
                </h3>
                <div className="space-y-2.5">
                  {docsByType.map((d) => (
                    <div key={d.type} className="flex items-center gap-3">
                      <span className="text-xs text-slate-400 w-16 text-left">{d.type}</span>
                      <div className="flex-1 bg-[#0a0a0f] rounded-full h-5 overflow-hidden">
                        <div
                          className={`${d.color} h-full rounded-full flex items-center justify-end px-2 transition-all`}
                          style={{ width: `${(d.count / totalDocs) * 100}%` }}
                        >
                          <span className="text-[10px] font-bold text-white">{d.count}</span>
                        </div>
                      </div>
                      <span className="text-[10px] text-slate-500 w-10 text-left">{((d.count / totalDocs) * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
                <div className="text-center pt-2 border-t border-[#1e1e2e]">
                  <span className="text-xs text-slate-500">סה"כ: </span>
                  <span className="text-sm font-bold text-indigo-400">{totalDocs.toLocaleString("he-IL")}</span>
                  <span className="text-xs text-slate-500"> מסמכים</span>
                </div>
              </CardContent>
            </Card>

            {/* Docs by Department (bar) */}
            <Card className="bg-[#12121a] border-[#1e1e2e]">
              <CardContent className="p-5 space-y-4">
                <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-1.5">
                  <BarChart3 className="w-4 h-4 text-blue-400" /> מסמכים לפי מחלקה
                </h3>
                <div className="space-y-3">
                  {docsByDept.map((d) => (
                    <div key={d.dept}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-400">{d.dept}</span>
                        <span className="text-slate-300 font-mono">{d.count}</span>
                      </div>
                      <Progress value={(d.count / maxDept) * 100} className="h-3" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Monthly Upload Trend */}
            <Card className="bg-[#12121a] border-[#1e1e2e]">
              <CardContent className="p-5 space-y-4">
                <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-emerald-400" /> מגמת העלאות חודשית
                </h3>
                <div className="flex items-end gap-3 h-48 pt-4">
                  {monthlyUploads.map((m) => (
                    <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-xs font-mono text-slate-300">{m.count}</span>
                      <div
                        className="w-full bg-gradient-to-t from-emerald-600 to-emerald-400 rounded-t-md transition-all"
                        style={{ height: `${(m.count / maxUpload) * 160}px` }}
                      />
                      <span className="text-[10px] text-slate-500 whitespace-nowrap">{m.month}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-[#1e1e2e]">
                  <span className="text-xs text-slate-500">ממוצע חודשי</span>
                  <span className="text-sm font-bold text-emerald-400">
                    {Math.round(monthlyUploads.reduce((s, m) => s + m.count, 0) / monthlyUploads.length)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
