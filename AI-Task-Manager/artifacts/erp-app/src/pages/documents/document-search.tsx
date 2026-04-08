import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Search, FileText, FileSpreadsheet, FileImage, PenTool,
  Filter, Clock, Star, Download, Eye, Share2, Tag,
  Building2, Calendar, User, HardDrive, Link2, Shield,
  X, ChevronDown, BookmarkPlus, History, ScanSearch,
} from "lucide-react";

/* ── mock: search results ── */

const FALLBACK_SEARCH_RESULTS = [
  { id: "DOC-1042", name: "מפרט טכני מסגרת T-400", snippet: "...תכנון <mark>מסגרת</mark> פלדה עם חתכים מיוחדים לפי תקן ISO 2768...", type: "PDF", dept: "הנדסה", date: "2026-03-28", size: "4.2 MB", version: "2.0", relevance: 98, format: "pdf", module: "ייצור" },
  { id: "DOC-0877", name: "חוזה ספק מתכת-פרו בע\"מ", snippet: "...תנאי תשלום שוטף+60, אספקת <mark>מתכת</mark> גולמית לפי מפרט...", type: "DOCX", dept: "רכש", date: "2026-04-05", size: "1.8 MB", version: "3.1", relevance: 94, format: "docx", module: "רכש" },
  { id: "DOC-0653", name: "שרטוט ציר הנעה SH-40", snippet: "...טולרנס סובבים ±0.02 מ\"מ, <mark>ציר</mark> מפלדת 4140...", type: "DWG", dept: "הנדסה", date: "2026-03-20", size: "12.7 MB", version: "4.3", relevance: 91, format: "dwg", module: "ייצור" },
  { id: "DOC-1201", name: "הצעת מחיר פרויקט דלתא", snippet: "...סה\"כ <mark>הצעה</mark> ₪2,450,000 כולל אחריות מורחבת 24 חודש...", type: "XLSX", dept: "מכירות", date: "2026-04-06", size: "890 KB", version: "1.2", relevance: 88, format: "xlsx", module: "מכירות" },
  { id: "DOC-0445", name: "נוהל בטיחות עבודה בחום", snippet: "...עובדים בסביבת <mark>בטיחות</mark> חשופים לטמפרטורות מעל 40°C...", type: "PDF", dept: "בטיחות", date: "2026-04-03", size: "2.1 MB", version: "5.4", relevance: 85, format: "pdf", module: "תפעול" },
  { id: "DOC-0990", name: "דוח ביקורת איכות Q1-2026", snippet: "...ממצאי <mark>ביקורת</mark> פנימית: 3 אי-התאמות קלות, 0 קריטיות...", type: "PDF", dept: "איכות", date: "2026-04-01", size: "5.4 MB", version: "1.0", relevance: 82, format: "pdf", module: "איכות" },
  { id: "DOC-0312", name: "אישור יבוא מכס 2026-44", snippet: "...רישיון <mark>יבוא</mark> זמני לציוד אלקטרוני מדגם PCB-8L...", type: "PDF", dept: "לוגיסטיקה", date: "2026-03-15", size: "1.3 MB", version: "1.0", relevance: 79, format: "pdf", module: "לוגיסטיקה" },
  { id: "DOC-1155", name: "חשבונית רכש 78120", snippet: "...חשבונית מס מספר 78120, סה\"כ <mark>₪45,200</mark> כולל מע\"מ...", type: "PDF", dept: "כספים", date: "2026-04-02", size: "320 KB", version: "1.0", relevance: 76, format: "pdf", module: "רכש" },
  { id: "DOC-0788", name: "תעודת כיול מכשיר M-22", snippet: "...תוצאות <mark>כיול</mark> בטווח: סטייה מקסימלית 0.003%...", type: "PDF", dept: "איכות", date: "2026-03-25", size: "680 KB", version: "1.0", relevance: 73, format: "pdf", module: "איכות" },
  { id: "DOC-1310", name: "חוזה שכירות מחסן צפון", snippet: "...חידוש <mark>חוזה</mark> שכירות + הרחבת שטח ל-2,400 מ\"ר...", type: "DOCX", dept: "תפעול", date: "2026-03-15", size: "2.5 MB", version: "2.0", relevance: 70, format: "docx", module: "תפעול" },
  { id: "DOC-0520", name: "מפרט טכני PCB-8L Rev C", snippet: "...הוספת שכבת נחושת חמישית, עובי <mark>PCB</mark> סופי 1.6 מ\"מ...", type: "PDF", dept: "הנדסה", date: "2026-04-07", size: "3.8 MB", version: "Rev C", relevance: 67, format: "pdf", module: "ייצור" },
  { id: "DOC-0199", name: "רישיון עסק טכנו-כל 2026", snippet: "...חידוש <mark>רישיון</mark> עסק תקף עד 30/04/2026...", type: "PDF", dept: "מנהלה", date: "2026-01-10", size: "450 KB", version: "1.0", relevance: 64, format: "pdf", module: "מנהלה" },
];

const FALLBACK_RECENT_SEARCHES = [
  { term: "מסגרת T-400 שרטוט", date: "08/04/2026 09:14", results: 7 },
  { term: "חוזה ספק מתכת", date: "08/04/2026 08:42", results: 12 },
  { term: "חשבונית רכש 2026", date: "07/04/2026 16:30", results: 34 },
  { term: "ISO 9001 תעודה", date: "07/04/2026 14:55", results: 5 },
  { term: "PCB-8L מפרט", date: "07/04/2026 11:20", results: 9 },
];

const FALLBACK_SAVED_SEARCHES = [
  { name: "חוזים שפג תוקפם", filters: "סוג: חוזה | סטטוס: פג תוקף | מחלקה: הכל", count: 4, updated: "05/04/2026" },
  { name: "שרטוטים הנדסה - גרסה אחרונה", filters: "סוג: שרטוט | מחלקה: הנדסה | גרסה: אחרונה", count: 28, updated: "03/04/2026" },
  { name: "מסמכי רכש ממתינים", filters: "מודול: רכש | סטטוס: ממתין | פורמט: PDF,XLSX", count: 11, updated: "07/04/2026" },
];

/* ── helpers ── */

const formatColors: Record<string, string> = {
  pdf: "bg-red-900/60 text-red-300",
  docx: "bg-blue-900/60 text-blue-300",
  xlsx: "bg-emerald-900/60 text-emerald-300",
  dwg: "bg-purple-900/60 text-purple-300",
};

const FormatIcon = ({ format }: { format: string }) => {
  switch (format) {
    case "pdf": return <FileText className="w-5 h-5 text-red-400" />;
    case "docx": return <FileText className="w-5 h-5 text-blue-400" />;
    case "xlsx": return <FileSpreadsheet className="w-5 h-5 text-emerald-400" />;
    case "dwg": return <PenTool className="w-5 h-5 text-purple-400" />;
    default: return <FileImage className="w-5 h-5 text-slate-400" />;
  }
};

function relevanceBar(score: number) {
  const color = score >= 90 ? "bg-emerald-500" : score >= 75 ? "bg-blue-500" : score >= 60 ? "bg-amber-500" : "bg-slate-500";
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-2 bg-[#1e1e2e] rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-mono text-slate-400 w-8 text-left">{score}%</span>
    </div>
  );
}

/* ── filters config ── */

const FALLBACK_FILTER_SECTIONS = [
  { label: "סוג מסמך", icon: <FileText className="w-4 h-4" />, options: ["חוזה", "שרטוט", "מפרט", "הצעה", "חשבונית", "תעודה", "נוהל", "דוח"] },
  { label: "מחלקה", icon: <Building2 className="w-4 h-4" />, options: ["הנדסה", "רכש", "מכירות", "כספים", "איכות", "לוגיסטיקה", "בטיחות", "תפעול", "מנהלה"] },
  { label: "סטטוס", icon: <Shield className="w-4 h-4" />, options: ["מאושר", "ממתין", "טיוטה", "פעיל", "פג תוקף", "מבוטל"] },
  { label: "פורמט קובץ", icon: <HardDrive className="w-4 h-4" />, options: ["PDF", "DOCX", "XLSX", "DWG", "TIFF", "JPG"] },
  { label: "מודול מקושר", icon: <Link2 className="w-4 h-4" />, options: ["ייצור", "רכש", "התקנות", "מכירות", "איכות", "לוגיסטיקה", "תפעול", "מנהלה"] },
  { label: "הרשאות", icon: <Shield className="w-4 h-4" />, options: ["ציבורי", "פנימי", "מוגבל", "סודי"] },
];

/* ── component ── */

export default function DocumentSearchPage() {

  const { data: apiData } = useQuery({
    queryKey: ["document_search"],
    queryFn: () => authFetch("/api/documents/document-search").then(r => r.json()),
    staleTime: 60_000,
    retry: 1,
  });
  const searchResults = apiData?.searchResults ?? FALLBACK_SEARCH_RESULTS;
  const recentSearches = apiData?.recentSearches ?? FALLBACK_RECENT_SEARCHES;
  const savedSearches = apiData?.savedSearches ?? FALLBACK_SAVED_SEARCHES;
  const filterSections = apiData?.filterSections ?? FALLBACK_FILTER_SECTIONS;
  const [tab, setTab] = useState("results");
  const [query, setQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [activeFilters, setActiveFilters] = useState<Record<string, string[]>>({});

  const toggleFilter = (section: string, value: string) => {
    setActiveFilters((prev) => {
      const current = prev[section] || [];
      return { ...prev, [section]: current.includes(value) ? current.filter((v) => v !== value) : [...current, value] };
    });
  };

  const totalActive = Object.values(activeFilters).reduce((s, a) => s + a.length, 0);

  return (
    <div dir="rtl" className="min-h-screen bg-[#0a0a0f] text-white p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Search className="w-7 h-7 text-blue-400" />
        <h1 className="text-2xl font-bold tracking-tight">חיפוש מסמכים מתקדם</h1>
        <Badge className="bg-blue-900/50 text-blue-300 mr-auto">טכנו-כל עוזי</Badge>
      </div>

      {/* Search Box */}
      <Card className="bg-[#12121a] border-[#1e1e2e]">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder='חפש לפי שם, תוכן, מספר מסמך, תגית...'
                className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg pr-10 pl-4 py-3 text-lg text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600/50 focus:border-blue-600"
              />
              {query && (
                <button onClick={() => setQuery("")} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium flex items-center gap-2 transition-colors">
              <ScanSearch className="w-5 h-5" />
              חפש
            </button>
          </div>

          {/* Filter Toggle */}
          <div className="flex items-center gap-2">
            <button onClick={() => setShowFilters(!showFilters)} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-blue-400 transition-colors">
              <Filter className="w-4 h-4" />
              סינון מתקדם
              <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? "rotate-180" : ""}`} />
            </button>
            {totalActive > 0 && <Badge className="bg-blue-900/50 text-blue-300">{totalActive} פילטרים פעילים</Badge>}
            <div className="flex-1" />
            <span className="text-sm text-slate-500">נמצאו <span className="text-white font-bold">{searchResults.length}</span> תוצאות</span>
          </div>

          {/* Advanced Filters Panel */}
          {showFilters && (
            <div className="border-t border-[#1e1e2e] pt-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filterSections.map((fs) => (
                  <div key={fs.label} className="space-y-2">
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase">{fs.icon}{fs.label}</label>
                    <div className="flex flex-wrap gap-1.5">
                      {fs.options.map((opt) => {
                        const active = (activeFilters[fs.label] || []).includes(opt);
                        return (
                          <button key={opt} onClick={() => toggleFilter(fs.label, opt)} className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${active ? "bg-blue-600 border-blue-500 text-white" : "bg-[#0a0a0f] border-[#1e1e2e] text-slate-400 hover:border-slate-500"}`}>
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Date & Size Ranges */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-400"><Calendar className="w-4 h-4" />תאריך: מ-</label>
                  <input type="date" className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded px-3 py-1.5 text-sm text-white" />
                </div>
                <div className="space-y-1">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-400"><Calendar className="w-4 h-4" />תאריך: עד-</label>
                  <input type="date" className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded px-3 py-1.5 text-sm text-white" />
                </div>
                <div className="space-y-1">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-400"><HardDrive className="w-4 h-4" />גודל קובץ: מ-</label>
                  <input placeholder="0 KB" className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded px-3 py-1.5 text-sm text-white placeholder:text-slate-600" />
                </div>
                <div className="space-y-1">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-400"><HardDrive className="w-4 h-4" />גודל קובץ: עד-</label>
                  <input placeholder="100 MB" className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded px-3 py-1.5 text-sm text-white placeholder:text-slate-600" />
                </div>
              </div>

              {/* Author & Tags */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-400"><User className="w-4 h-4" />מחבר</label>
                  <input placeholder="שם מחבר..." className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded px-3 py-1.5 text-sm text-white placeholder:text-slate-600" />
                </div>
                <div className="space-y-1">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-400"><Tag className="w-4 h-4" />תגיות</label>
                  <input placeholder='למשל: ISO, דחוף, סודי...' className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded px-3 py-1.5 text-sm text-white placeholder:text-slate-600" />
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent + Saved Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Searches */}
        <Card className="bg-[#12121a] border-[#1e1e2e]">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-300">
              <History className="w-4 h-4 text-slate-400" />חיפושים אחרונים
            </div>
            <div className="space-y-2">
              {recentSearches.map((rs) => (
                <div key={rs.term} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[#0a0a0f] hover:bg-[#1a1a2e] transition-colors cursor-pointer group">
                  <Clock className="w-4 h-4 text-slate-500" />
                  <span className="text-sm flex-1 group-hover:text-blue-400 transition-colors">{rs.term}</span>
                  <span className="text-xs text-slate-500">{rs.results} תוצאות</span>
                  <span className="text-xs text-slate-600">{rs.date}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Saved Searches */}
        <Card className="bg-[#12121a] border-[#1e1e2e]">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-300">
              <Star className="w-4 h-4 text-amber-400" />חיפושים שמורים
            </div>
            <div className="space-y-2">
              {savedSearches.map((ss) => (
                <div key={ss.name} className="px-3 py-2.5 rounded-lg bg-[#0a0a0f] hover:bg-[#1a1a2e] transition-colors cursor-pointer group">
                  <div className="flex items-center gap-2">
                    <BookmarkPlus className="w-4 h-4 text-amber-500" />
                    <span className="text-sm font-medium flex-1 group-hover:text-amber-400 transition-colors">{ss.name}</span>
                    <Badge className="bg-slate-800 text-slate-400">{ss.count} תוצאות</Badge>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 mr-6">{ss.filters}</p>
                  <p className="text-xs text-slate-600 mt-0.5 mr-6">עודכן: {ss.updated}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="bg-[#12121a] border border-[#1e1e2e] flex-wrap">
          <TabsTrigger value="results">תוצאות</TabsTrigger>
          <TabsTrigger value="saved">חיפושים שמורים</TabsTrigger>
          <TabsTrigger value="fulltext">חיפוש בתוכן (Full-Text)</TabsTrigger>
        </TabsList>

        {/* ── Results ── */}
        <TabsContent value="results">
          <Card className="bg-[#12121a] border-[#1e1e2e]">
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#1e1e2e]">
                    <TableHead className="text-right text-slate-400 w-10" />
                    <TableHead className="text-right text-slate-400">מסמך</TableHead>
                    <TableHead className="text-right text-slate-400">סוג</TableHead>
                    <TableHead className="text-right text-slate-400">מחלקה</TableHead>
                    <TableHead className="text-right text-slate-400">תאריך</TableHead>
                    <TableHead className="text-right text-slate-400">גודל</TableHead>
                    <TableHead className="text-right text-slate-400">גרסה</TableHead>
                    <TableHead className="text-right text-slate-400">רלוונטיות</TableHead>
                    <TableHead className="text-right text-slate-400">פעולות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {searchResults.map((r) => (
                    <TableRow key={r.id} className="border-[#1e1e2e] hover:bg-[#1a1a2e]">
                      <TableCell><FormatIcon format={r.format} /></TableCell>
                      <TableCell>
                        <div>
                          <span className="font-medium text-white">{r.name}</span>
                          <span className="text-xs text-slate-500 mr-2 font-mono">{r.id}</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5" dangerouslySetInnerHTML={{ __html: r.snippet }} />
                      </TableCell>
                      <TableCell><Badge className={formatColors[r.format] || "bg-slate-700 text-slate-300"}>{r.type}</Badge></TableCell>
                      <TableCell className="text-sm text-slate-300">{r.dept}</TableCell>
                      <TableCell className="text-sm text-slate-400">{r.date}</TableCell>
                      <TableCell className="text-sm text-slate-400 font-mono">{r.size}</TableCell>
                      <TableCell className="font-mono text-sm">{r.version}</TableCell>
                      <TableCell>{relevanceBar(r.relevance)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <button className="p-1.5 rounded hover:bg-[#1e1e2e] text-slate-400 hover:text-blue-400 transition-colors" title="תצוגה מקדימה"><Eye className="w-4 h-4" /></button>
                          <button className="p-1.5 rounded hover:bg-[#1e1e2e] text-slate-400 hover:text-emerald-400 transition-colors" title="הורדה"><Download className="w-4 h-4" /></button>
                          <button className="p-1.5 rounded hover:bg-[#1e1e2e] text-slate-400 hover:text-amber-400 transition-colors" title="שיתוף"><Share2 className="w-4 h-4" /></button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Saved Searches (full view) ── */}
        <TabsContent value="saved">
          <Card className="bg-[#12121a] border-[#1e1e2e]">
            <CardContent className="p-4 space-y-4">
              <p className="text-sm text-slate-400">חיפושים שנשמרו לשימוש חוזר. לחץ להפעלה מחדש או עריכה.</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {savedSearches.map((ss) => (
                  <Card key={ss.name} className="bg-[#0a0a0f] border-[#1e1e2e] hover:border-blue-600/50 transition-colors cursor-pointer">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <Star className="w-4 h-4 text-amber-400" />
                        <span className="font-medium">{ss.name}</span>
                      </div>
                      <p className="text-xs text-slate-500">{ss.filters}</p>
                      <div className="flex items-center justify-between">
                        <Badge className="bg-blue-900/50 text-blue-300">{ss.count} תוצאות</Badge>
                        <span className="text-xs text-slate-600">עודכן: {ss.updated}</span>
                      </div>
                      <Progress value={ss.count * 3} className="h-1" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Full-Text Search ── */}
        <TabsContent value="fulltext">
          <Card className="bg-[#12121a] border-[#1e1e2e]">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center gap-2 text-lg font-semibold">
                <ScanSearch className="w-5 h-5 text-purple-400" />
                חיפוש בתוכן מסמכים (Full-Text OCR)
              </div>
              <p className="text-sm text-slate-400">מנוע חיפוש מתקדם הסורק את תוכן כל המסמכים במערכת, כולל קבצים סרוקים (OCR). תומך בחיפוש מדויק, ביטויים, ו-Wildcards.</p>
              <div className="relative">
                <ScanSearch className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-purple-400" />
                <input placeholder='הזן ביטוי לחיפוש בתוכן: למשל "תנאי תשלום שוטף+60"' className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg pr-10 pl-4 py-3 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-600/50 focus:border-purple-600" />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card className="bg-[#0a0a0f] border-[#1e1e2e]">
                  <CardContent className="p-3 text-center">
                    <div className="text-2xl font-bold text-purple-400">1,284</div>
                    <div className="text-xs text-slate-500">מסמכים מאונדקסים</div>
                  </CardContent>
                </Card>
                <Card className="bg-[#0a0a0f] border-[#1e1e2e]">
                  <CardContent className="p-3 text-center">
                    <div className="text-2xl font-bold text-emerald-400">98.2%</div>
                    <div className="text-xs text-slate-500">כיסוי OCR</div>
                  </CardContent>
                </Card>
                <Card className="bg-[#0a0a0f] border-[#1e1e2e]">
                  <CardContent className="p-3 text-center">
                    <div className="text-2xl font-bold text-blue-400">~0.3s</div>
                    <div className="text-xs text-slate-500">זמן חיפוש ממוצע</div>
                  </CardContent>
                </Card>
                <Card className="bg-[#0a0a0f] border-[#1e1e2e]">
                  <CardContent className="p-3 text-center">
                    <div className="text-2xl font-bold text-amber-400">4.8GB</div>
                    <div className="text-xs text-slate-500">גודל אינדקס</div>
                  </CardContent>
                </Card>
              </div>
              <div className="text-xs text-slate-600 flex items-center gap-2">
                <Shield className="w-3 h-3" />
                חיפוש מכבד הרשאות: תוצאות מוצגות רק למסמכים שלמשתמש יש גישה אליהם
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
