import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Search, Filter, LayoutGrid, Table2, Clock, ChevronDown, ChevronRight,
  Users, Truck, Package, ShoppingCart, Briefcase, FileText, Warehouse,
  Star, Bookmark, X, Eye, ExternalLink, SlidersHorizontal,
  Calendar, Tag, Building2, Sparkles, ArrowUpRight, Check,
  MapPin, Phone, Mail, TrendingUp, AlertCircle, CheckCircle2,
} from "lucide-react";

type ObjectEntity = {
  id: string;
  type: "customer" | "supplier" | "order" | "project" | "invoice" | "item";
  title: string;
  subtitle: string;
  status: "active" | "pending" | "critical" | "closed" | "draft";
  tags: string[];
  updatedAt: string;
  createdAt: string;
  score?: number;
  properties: Record<string, string | number>;
  activity: number;
};

const ICON_MAP: Record<string, any> = {
  customer: Users,
  supplier: Truck,
  order: ShoppingCart,
  project: Briefcase,
  invoice: FileText,
  item: Package,
};

const COLOR_MAP: Record<string, string> = {
  customer: "text-blue-400 bg-blue-500/10 border-blue-500/30",
  supplier: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  order: "text-violet-400 bg-violet-500/10 border-violet-500/30",
  project: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30",
  invoice: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  item: "text-pink-400 bg-pink-500/10 border-pink-500/30",
};

const STATUS_COLOR: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  pending: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  critical: "bg-red-500/15 text-red-400 border-red-500/30",
  closed: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  draft: "bg-blue-500/15 text-blue-400 border-blue-500/30",
};

const STATUS_LABEL: Record<string, string> = {
  active: "פעיל",
  pending: "ממתין",
  critical: "קריטי",
  closed: "סגור",
  draft: "טיוטה",
};

const FALLBACK_OBJECTS: ObjectEntity[] = [
  { id: "C-10021", type: "customer", title: "אלקטרה בנייה בע״מ", subtitle: "לקוח Gold · שוטף 45", status: "active", tags: ["VIP", "בנייה", "תל-אביב"], updatedAt: "2026-04-08", createdAt: "2023-02-14", score: 94, activity: 47, properties: { "הכנסות": "₪12.4M", "הזמנות": 48, "מסגרת אשראי": "₪2.5M", "מנהל תיק": "דני כהן", "טלפון": "03-6123456" } },
  { id: "C-10045", type: "customer", title: "שיכון ובינוי נדל״ן", subtitle: "לקוח Gold · שוטף 60", status: "active", tags: ["VIP", "נדל״ן", "גוש דן"], updatedAt: "2026-04-07", createdAt: "2022-08-21", score: 91, activity: 62, properties: { "הכנסות": "₪28.7M", "הזמנות": 84, "מסגרת אשראי": "₪5M", "מנהל תיק": "רונית לוי" } },
  { id: "C-10089", type: "customer", title: "אפריקה ישראל", subtitle: "לקוח Silver", status: "pending", tags: ["נדל״ן"], updatedAt: "2026-04-05", createdAt: "2024-01-08", score: 76, activity: 12, properties: { "הכנסות": "₪4.2M", "הזמנות": 21, "יתרה פתוחה": "₪340K" } },
  { id: "C-10156", type: "customer", title: "ישראמקו נגב", subtitle: "לקוח Silver", status: "critical", tags: ["אנרגיה", "דרום"], updatedAt: "2026-04-01", createdAt: "2023-11-03", score: 42, activity: 8, properties: { "הכנסות": "₪2.1M", "ימי פיגור": 67 } },
  { id: "C-10234", type: "customer", title: "טבע תעשיות בע״מ", subtitle: "לקוח Gold", status: "active", tags: ["פארמה", "VIP"], updatedAt: "2026-04-09", createdAt: "2021-06-15", score: 96, activity: 89, properties: { "הכנסות": "₪45.3M", "הזמנות": 134 } },
  { id: "C-10312", type: "customer", title: "דלק מוטורס", subtitle: "לקוח Silver", status: "active", tags: ["רכב"], updatedAt: "2026-04-03", createdAt: "2024-03-22", score: 78, activity: 24, properties: { "הכנסות": "₪6.8M", "הזמנות": 32 } },
  { id: "C-10456", type: "customer", title: "בנק הפועלים", subtitle: "לקוח Gold", status: "active", tags: ["פיננסים", "VIP"], updatedAt: "2026-04-08", createdAt: "2020-04-11", score: 98, activity: 112, properties: { "הכנסות": "₪68.2M", "הזמנות": 241 } },
  { id: "S-2011", type: "supplier", title: "אל-יוניון פלדות", subtitle: "ספק חומרי גלם · שוטף 30", status: "active", tags: ["פלדה", "אסטרטגי"], updatedAt: "2026-04-06", createdAt: "2019-07-22", score: 92, activity: 38, properties: { "דירוג": "4.8/5", "עמידה בלו״ז": "96%", "הזמנות": 124 } },
  { id: "S-2034", type: "supplier", title: "קלאפ עבודות ברזל", subtitle: "ספק חומרי גלם", status: "active", tags: ["ברזל"], updatedAt: "2026-04-04", createdAt: "2021-03-18", score: 85, activity: 22, properties: { "דירוג": "4.5/5", "עמידה בלו״ז": "92%" } },
  { id: "S-2067", type: "supplier", title: "ט.מ.ל טכנולוגיות", subtitle: "ספק רכיבים · אסטרטגי", status: "active", tags: ["רכיבים", "VIP"], updatedAt: "2026-04-09", createdAt: "2018-11-04", score: 97, activity: 56, properties: { "דירוג": "4.9/5", "עמידה בלו״ז": "98%" } },
  { id: "S-2112", type: "supplier", title: "יבוא גלובל בע״מ", subtitle: "ספק יבוא", status: "pending", tags: ["יבוא", "סין"], updatedAt: "2026-03-28", createdAt: "2023-09-12", score: 68, activity: 14, properties: { "דירוג": "3.8/5", "עמידה בלו״ז": "81%" } },
  { id: "S-2178", type: "supplier", title: "אלומיניום הנגב", subtitle: "ספק חומרי גלם", status: "active", tags: ["אלומיניום"], updatedAt: "2026-04-07", createdAt: "2022-05-01", score: 88, activity: 31, properties: { "דירוג": "4.6/5", "עמידה בלו״ז": "94%" } },
  { id: "PO-4521", type: "order", title: "הזמנה #PO-4521", subtitle: "אל-יוניון פלדות · ₪245,000", status: "pending", tags: ["רכש", "פלדה"], updatedAt: "2026-04-08", createdAt: "2026-04-08", score: 88, activity: 5, properties: { "סכום": "₪245,000", "פריטים": 23, "אספקה": "2026-04-20" } },
  { id: "PO-4534", type: "order", title: "הזמנה #PO-4534", subtitle: "ט.מ.ל טכנולוגיות · ₪89,400", status: "active", tags: ["רכש"], updatedAt: "2026-04-07", createdAt: "2026-04-07", score: 92, activity: 3, properties: { "סכום": "₪89,400", "פריטים": 12 } },
  { id: "PO-4567", type: "order", title: "הזמנה #PO-4567", subtitle: "קלאפ ברזל · ₪178,200", status: "closed", tags: ["רכש"], updatedAt: "2026-03-30", createdAt: "2026-03-22", score: 78, activity: 8, properties: { "סכום": "₪178,200", "פריטים": 34 } },
  { id: "PO-4598", type: "order", title: "הזמנה #PO-4598", subtitle: "יבוא גלובל · ₪412,000", status: "critical", tags: ["יבוא", "דחוף"], updatedAt: "2026-04-02", createdAt: "2026-03-18", score: 54, activity: 12, properties: { "סכום": "₪412,000", "ימי עיכוב": 14 } },
  { id: "PO-4612", type: "order", title: "הזמנה #PO-4612", subtitle: "אלומיניום הנגב · ₪320,000", status: "active", tags: ["רכש"], updatedAt: "2026-04-09", createdAt: "2026-04-06", score: 90, activity: 4, properties: { "סכום": "₪320,000", "פריטים": 45 } },
  { id: "PRJ-2024-A", type: "project", title: "מגדלי תל-אביב מתחם 7", subtitle: "אלקטרה בנייה · ₪4.2M", status: "active", tags: ["בנייה", "תל-אביב", "גדול"], updatedAt: "2026-04-08", createdAt: "2024-02-01", score: 85, activity: 124, properties: { "תקציב": "₪4.2M", "התקדמות": "64%", "מנהל": "יוסי אברהם", "צוות": 12 } },
  { id: "PRJ-2024-B", type: "project", title: "בית מלון רמת-גן", subtitle: "שיכון ובינוי · ₪8.7M", status: "active", tags: ["בנייה", "גוש דן", "גדול"], updatedAt: "2026-04-07", createdAt: "2024-05-15", score: 82, activity: 156, properties: { "תקציב": "₪8.7M", "התקדמות": "47%", "צוות": 18 } },
  { id: "PRJ-2025-A", type: "project", title: "חדש - מרכז מסחרי חולון", subtitle: "אפריקה ישראל · ₪6.1M", status: "draft", tags: ["בנייה", "מסחרי"], updatedAt: "2026-04-05", createdAt: "2026-03-15", score: 72, activity: 18, properties: { "תקציב": "₪6.1M", "התקדמות": "8%" } },
  { id: "PRJ-2023-C", type: "project", title: "מתחם מגורים פתח-תקווה", subtitle: "שיכון ובינוי · ₪12.5M", status: "closed", tags: ["בנייה", "מגורים"], updatedAt: "2026-01-28", createdAt: "2022-09-10", score: 94, activity: 287, properties: { "תקציב": "₪12.5M", "התקדמות": "100%" } },
  { id: "PRJ-2024-D", type: "project", title: "שיפוץ בנק הפועלים אולם ראשי", subtitle: "בנק הפועלים · ₪2.8M", status: "pending", tags: ["שיפוץ"], updatedAt: "2026-04-01", createdAt: "2026-02-20", score: 79, activity: 42, properties: { "תקציב": "₪2.8M" } },
  { id: "INV-7821", type: "invoice", title: "חשבונית #INV-7821", subtitle: "אלקטרה בנייה · ₪325,000", status: "pending", tags: ["חייבים"], updatedAt: "2026-04-05", createdAt: "2026-03-06", score: 85, activity: 3, properties: { "סכום": "₪325,000", "ימי פתיחה": 30, "פרעון": "2026-04-15" } },
  { id: "INV-7834", type: "invoice", title: "חשבונית #INV-7834", subtitle: "שיכון ובינוי · ₪780,000", status: "active", tags: ["חייבים", "גדול"], updatedAt: "2026-04-03", createdAt: "2026-03-18", score: 92, activity: 5, properties: { "סכום": "₪780,000", "פרעון": "2026-05-02" } },
  { id: "INV-7856", type: "invoice", title: "חשבונית #INV-7856", subtitle: "ישראמקו · ₪142,000", status: "critical", tags: ["חייבים", "איחור"], updatedAt: "2026-04-02", createdAt: "2026-01-22", score: 32, activity: 8, properties: { "סכום": "₪142,000", "ימי איחור": 47 } },
  { id: "INV-7891", type: "invoice", title: "חשבונית #INV-7891", subtitle: "טבע תעשיות · ₪1,240,000", status: "active", tags: ["חייבים", "VIP"], updatedAt: "2026-04-08", createdAt: "2026-04-01", score: 96, activity: 2, properties: { "סכום": "₪1,240,000" } },
  { id: "INV-7901", type: "invoice", title: "חשבונית #INV-7901", subtitle: "דלק מוטורס · ₪93,500", status: "closed", tags: ["חייבים", "שולמה"], updatedAt: "2026-04-09", createdAt: "2026-03-10", score: 88, activity: 4, properties: { "סכום": "₪93,500" } },
  { id: "ITM-4521", type: "item", title: "פרופיל אלומיניום 6063-T5", subtitle: "מק״ט ITM-4521 · במלאי 2,340", status: "active", tags: ["חומרי גלם", "אלומיניום"], updatedAt: "2026-04-09", createdAt: "2020-03-15", score: 88, activity: 156, properties: { "מלאי": 2340, "עלות": "₪48", "מינימום": 500 } },
  { id: "ITM-8812", type: "item", title: "בורג פילוט 8mm נירוסטה", subtitle: "מק״ט ITM-8812 · במלאי 45,000", status: "active", tags: ["חומרי גלם"], updatedAt: "2026-04-08", createdAt: "2019-11-02", score: 94, activity: 234, properties: { "מלאי": 45000, "עלות": "₪1.8" } },
  { id: "ITM-1023", type: "item", title: "זכוכית בידודית 24mm", subtitle: "מק״ט ITM-1023 · במלאי 180", status: "pending", tags: ["חומרי גלם", "זכוכית"], updatedAt: "2026-04-06", createdAt: "2022-01-20", score: 72, activity: 34, properties: { "מלאי": 180, "עלות": "₪320" } },
  { id: "ITM-2245", type: "item", title: "קצף PU בידוד 30mm", subtitle: "מק״ט ITM-2245 · במלאי 25", status: "critical", tags: ["חומרי גלם", "חוסר"], updatedAt: "2026-04-07", createdAt: "2023-05-08", score: 28, activity: 18, properties: { "מלאי": 25, "מינימום": 100 } },
  { id: "ITM-3398", type: "item", title: "צירים כבדים נירוסטה", subtitle: "מק״ט ITM-3398 · במלאי 890", status: "active", tags: ["רכיבים"], updatedAt: "2026-04-05", createdAt: "2021-07-14", score: 86, activity: 67, properties: { "מלאי": 890, "עלות": "₪12" } },
  { id: "C-10578", type: "customer", title: "חברת חשמל לישראל", subtitle: "לקוח Gold · ממשלתי", status: "active", tags: ["VIP", "ממשלתי"], updatedAt: "2026-04-09", createdAt: "2018-09-01", score: 99, activity: 198, properties: { "הכנסות": "₪92.1M", "הזמנות": 412 } },
  { id: "C-10645", type: "customer", title: "נסים קבלנות", subtitle: "לקוח Bronze", status: "pending", tags: ["קבלנות"], updatedAt: "2026-03-25", createdAt: "2025-01-12", score: 58, activity: 6, properties: { "הכנסות": "₪420K" } },
  { id: "C-10712", type: "customer", title: "גלובל אירוספייס", subtitle: "לקוח Gold", status: "active", tags: ["תעופה", "VIP"], updatedAt: "2026-04-08", createdAt: "2020-12-03", score: 95, activity: 78, properties: { "הכנסות": "₪18.5M", "הזמנות": 64 } },
  { id: "S-2234", type: "supplier", title: "פלסטיק ישראל", subtitle: "ספק חומרי גלם", status: "active", tags: ["פלסטיק"], updatedAt: "2026-04-06", createdAt: "2021-08-19", score: 82, activity: 28, properties: { "דירוג": "4.4/5" } },
  { id: "S-2289", type: "supplier", title: "לוגיסטיקה בזק", subtitle: "ספק שירותים", status: "active", tags: ["לוגיסטיקה"], updatedAt: "2026-04-09", createdAt: "2022-02-07", score: 89, activity: 45, properties: { "דירוג": "4.7/5" } },
  { id: "PO-4645", type: "order", title: "הזמנה #PO-4645", subtitle: "פלסטיק ישראל · ₪56,300", status: "active", tags: ["רכש"], updatedAt: "2026-04-08", createdAt: "2026-04-04", score: 87, activity: 2, properties: { "סכום": "₪56,300" } },
  { id: "PO-4678", type: "order", title: "הזמנה #PO-4678", subtitle: "לוגיסטיקה בזק · ₪12,800", status: "active", tags: ["שירות"], updatedAt: "2026-04-09", createdAt: "2026-04-09", score: 91, activity: 1, properties: { "סכום": "₪12,800" } },
  { id: "PRJ-2024-E", type: "project", title: "מרכז מחקר טבע", subtitle: "טבע תעשיות · ₪15.8M", status: "active", tags: ["R&D", "VIP"], updatedAt: "2026-04-09", createdAt: "2024-08-12", score: 91, activity: 234, properties: { "תקציב": "₪15.8M", "התקדמות": "52%" } },
  { id: "INV-7945", type: "invoice", title: "חשבונית #INV-7945", subtitle: "גלובל אירוספייס · ₪480,000", status: "active", tags: ["חייבים"], updatedAt: "2026-04-07", createdAt: "2026-03-28", score: 90, activity: 3, properties: { "סכום": "₪480,000" } },
];

type ViewMode = "grid" | "table" | "timeline";

export default function ObjectExplorer() {
  const [search, setSearch] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [selectedObject, setSelectedObject] = useState<ObjectEntity | null>(null);
  const [expandedFilters, setExpandedFilters] = useState<Set<string>>(new Set(["type", "status", "date"]));
  const [savedView, setSavedView] = useState("default");

  const { data } = useQuery({
    queryKey: ["palantir-objects"],
    queryFn: async () => {
      try {
        const res = await authFetch("/api/palantir/objects");
        if (!res.ok) throw new Error();
        return await res.json();
      } catch {
        return { objects: FALLBACK_OBJECTS };
      }
    },
  });

  const objects: ObjectEntity[] = data?.objects || FALLBACK_OBJECTS;

  const filtered = useMemo(() => {
    return objects.filter((o) => {
      if (search && !o.title.toLowerCase().includes(search.toLowerCase()) && !o.id.toLowerCase().includes(search.toLowerCase())) return false;
      if (selectedTypes.size > 0 && !selectedTypes.has(o.type)) return false;
      if (selectedStatuses.size > 0 && !selectedStatuses.has(o.status)) return false;
      return true;
    });
  }, [objects, search, selectedTypes, selectedStatuses]);

  const toggleType = (t: string) => {
    const n = new Set(selectedTypes);
    n.has(t) ? n.delete(t) : n.add(t);
    setSelectedTypes(n);
  };
  const toggleStatus = (s: string) => {
    const n = new Set(selectedStatuses);
    n.has(s) ? n.delete(s) : n.add(s);
    setSelectedStatuses(n);
  };
  const toggleFilter = (f: string) => {
    const n = new Set(expandedFilters);
    n.has(f) ? n.delete(f) : n.add(f);
    setExpandedFilters(n);
  };

  const typeCounts = objects.reduce((acc, o) => { acc[o.type] = (acc[o.type] || 0) + 1; return acc; }, {} as Record<string, number>);
  const statusCounts = objects.reduce((acc, o) => { acc[o.status] = (acc[o.status] || 0) + 1; return acc; }, {} as Record<string, number>);
  const activeCount = filtered.filter((o) => o.status === "active").length;
  const criticalCount = filtered.filter((o) => o.status === "critical").length;

  const typeOptions = [
    { id: "customer", label: "לקוחות" },
    { id: "supplier", label: "ספקים" },
    { id: "order", label: "הזמנות" },
    { id: "project", label: "פרויקטים" },
    { id: "invoice", label: "חשבוניות" },
    { id: "item", label: "פריטים" },
  ];

  return (
    <div dir="rtl" className="min-h-screen bg-[#0a0e1a] text-slate-200">
      {/* TOP BAR */}
      <div className="border-b border-slate-800 bg-slate-900/50 backdrop-blur sticky top-0 z-10">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/20 border border-violet-500/30">
                <Search className="h-5 w-5 text-violet-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Object Explorer — חקר ישויות</h1>
                <p className="text-xs text-slate-400">חיפוש, סינון וחקר של {objects.length.toLocaleString()} ישויות במערכת</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={savedView}
                onChange={(e) => setSavedView(e.target.value)}
                className="h-9 rounded-md border border-slate-700 bg-slate-900/50 px-3 text-sm text-slate-200"
              >
                <option value="default">תצוגה רגילה</option>
                <option value="vip">רק VIP</option>
                <option value="critical">קריטיים</option>
                <option value="recent">עודכן השבוע</option>
                <option value="custom">תצוגה שלי</option>
              </select>
              <Button size="sm" variant="outline" className="h-9 border-slate-700 bg-slate-900/50 hover:bg-slate-800">
                <Bookmark className="ml-1.5 h-4 w-4" />
                שמור תצוגה
              </Button>
            </div>
          </div>

          {/* Prominent Search */}
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חפש ישויות לפי שם, מזהה, תג, מאפיין..."
              className="h-12 border-slate-700 bg-slate-900/60 pr-11 text-base placeholder:text-slate-500 focus-visible:ring-violet-500"
            />
            <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <kbd className="rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">⌘K</kbd>
            </div>
          </div>

          {/* Type Pills */}
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-500 ml-1">סוגים:</span>
            {typeOptions.map((t) => {
              const Icon = ICON_MAP[t.id];
              const active = selectedTypes.has(t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => toggleType(t.id)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-all ${
                    active ? COLOR_MAP[t.id] : "border-slate-700 bg-slate-900/40 text-slate-400 hover:bg-slate-800"
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  {t.label}
                  <span className="font-mono text-[10px] opacity-70">({typeCounts[t.id] || 0})</span>
                </button>
              );
            })}
            {(selectedTypes.size > 0 || selectedStatuses.size > 0 || search) && (
              <button
                onClick={() => { setSelectedTypes(new Set()); setSelectedStatuses(new Set()); setSearch(""); }}
                className="ml-auto flex items-center gap-1 text-xs text-slate-400 hover:text-white"
              >
                <X className="h-3 w-3" />
                נקה הכל
              </button>
            )}
          </div>
        </div>

        {/* Aggregation Bar */}
        <div className="flex items-center gap-6 border-t border-slate-800 bg-slate-900/30 px-6 py-2 text-xs">
          <span className="text-slate-400">מציג <span className="font-mono text-white font-semibold">{filtered.length}</span> מתוך <span className="font-mono text-slate-300">{objects.length}</span> ישויות</span>
          <span className="flex items-center gap-1 text-emerald-400"><CheckCircle2 className="h-3 w-3" /> {activeCount} פעילים</span>
          <span className="flex items-center gap-1 text-red-400"><AlertCircle className="h-3 w-3" /> {criticalCount} קריטיים</span>
          <span className="flex items-center gap-1 text-blue-400"><TrendingUp className="h-3 w-3" /> ציון ממוצע: {(filtered.reduce((a, b) => a + (b.score || 0), 0) / Math.max(1, filtered.length)).toFixed(0)}</span>

          <div className="mr-auto flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900/50 p-0.5">
            <button
              onClick={() => setViewMode("grid")}
              className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition-all ${
                viewMode === "grid" ? "bg-violet-500/20 text-violet-400" : "text-slate-400 hover:text-white"
              }`}
            >
              <LayoutGrid className="h-3 w-3" />
              Grid
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition-all ${
                viewMode === "table" ? "bg-violet-500/20 text-violet-400" : "text-slate-400 hover:text-white"
              }`}
            >
              <Table2 className="h-3 w-3" />
              Table
            </button>
            <button
              onClick={() => setViewMode("timeline")}
              className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition-all ${
                viewMode === "timeline" ? "bg-violet-500/20 text-violet-400" : "text-slate-400 hover:text-white"
              }`}
            >
              <Clock className="h-3 w-3" />
              Timeline
            </button>
          </div>
        </div>
      </div>

      <div className="flex h-[calc(100vh-180px)]">
        {/* LEFT SIDEBAR - Filters */}
        <aside className="w-64 flex-shrink-0 border-l border-slate-800 bg-slate-900/20 overflow-y-auto">
          <div className="border-b border-slate-800 p-3 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <SlidersHorizontal className="h-3 w-3" />
              מסננים
            </span>
            <Button size="sm" variant="ghost" className="h-6 text-[10px] text-slate-500 hover:text-white">איפוס</Button>
          </div>

          {/* Object Type filter */}
          <div className="border-b border-slate-800">
            <button onClick={() => toggleFilter("type")} className="flex w-full items-center justify-between px-3 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-800/40">
              <span>סוג ישות</span>
              {expandedFilters.has("type") ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
            {expandedFilters.has("type") && (
              <div className="px-3 pb-3 space-y-1">
                {typeOptions.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-xs text-slate-400 hover:bg-slate-800/60 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedTypes.has(t.id)}
                      onChange={() => toggleType(t.id)}
                      className="h-3 w-3 rounded border-slate-600 bg-slate-800 accent-violet-500"
                    />
                    {t.label}
                    <span className="mr-auto font-mono text-[10px] text-slate-600">{typeCounts[t.id] || 0}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Status filter */}
          <div className="border-b border-slate-800">
            <button onClick={() => toggleFilter("status")} className="flex w-full items-center justify-between px-3 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-800/40">
              <span>סטטוס</span>
              {expandedFilters.has("status") ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
            {expandedFilters.has("status") && (
              <div className="px-3 pb-3 space-y-1">
                {Object.keys(STATUS_LABEL).map((s) => (
                  <label key={s} className="flex items-center gap-2 rounded px-2 py-1.5 text-xs text-slate-400 hover:bg-slate-800/60 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedStatuses.has(s)}
                      onChange={() => toggleStatus(s)}
                      className="h-3 w-3 rounded border-slate-600 bg-slate-800 accent-violet-500"
                    />
                    {STATUS_LABEL[s]}
                    <span className="mr-auto font-mono text-[10px] text-slate-600">{statusCounts[s] || 0}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Date Range filter */}
          <div className="border-b border-slate-800">
            <button onClick={() => toggleFilter("date")} className="flex w-full items-center justify-between px-3 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-800/40">
              <span>טווח תאריכים</span>
              {expandedFilters.has("date") ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
            {expandedFilters.has("date") && (
              <div className="px-3 pb-3 space-y-2">
                <div>
                  <label className="text-[10px] text-slate-500">מ-</label>
                  <Input type="date" className="h-7 bg-slate-900 border-slate-700 text-xs" />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500">עד-</label>
                  <Input type="date" className="h-7 bg-slate-900 border-slate-700 text-xs" />
                </div>
                <div className="space-y-1 pt-1">
                  {["היום", "7 ימים", "30 ימים", "השנה"].map((o) => (
                    <button key={o} className="w-full rounded px-2 py-1 text-right text-[11px] text-slate-400 hover:bg-slate-800">{o}</button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Tags filter */}
          <div className="border-b border-slate-800">
            <button onClick={() => toggleFilter("tags")} className="flex w-full items-center justify-between px-3 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-800/40">
              <span>תגיות</span>
              {expandedFilters.has("tags") ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
            {expandedFilters.has("tags") && (
              <div className="px-3 pb-3 flex flex-wrap gap-1">
                {["VIP", "בנייה", "נדל״ן", "פלדה", "אלומיניום", "דחוף", "גדול", "ממשלתי"].map((tag) => (
                  <Badge key={tag} className="bg-slate-800 text-slate-300 border-slate-700 text-[10px] cursor-pointer hover:bg-slate-700">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Property Filters */}
          <div className="border-b border-slate-800">
            <button onClick={() => toggleFilter("props")} className="flex w-full items-center justify-between px-3 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-800/40">
              <span>מאפיינים</span>
              {expandedFilters.has("props") ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
            {expandedFilters.has("props") && (
              <div className="px-3 pb-3 space-y-2">
                <div>
                  <label className="text-[10px] text-slate-500">הכנסות מינ׳</label>
                  <Input placeholder="₪0" className="h-7 bg-slate-900 border-slate-700 text-xs" />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500">ציון מינ׳</label>
                  <Input placeholder="0-100" className="h-7 bg-slate-900 border-slate-700 text-xs" />
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* MAIN CONTENT */}
        <main className="flex-1 overflow-y-auto p-6">
          {viewMode === "grid" && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {filtered.map((obj) => {
                const Icon = ICON_MAP[obj.type];
                return (
                  <Card
                    key={obj.id}
                    className={`border-slate-800 bg-slate-900/40 hover:bg-slate-900/70 transition-all cursor-pointer ${
                      selectedObject?.id === obj.id ? "ring-1 ring-violet-500 border-violet-500/50" : ""
                    }`}
                    onClick={() => setSelectedObject(obj)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-lg border ${COLOR_MAP[obj.type]}`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <Badge className={`${STATUS_COLOR[obj.status]} text-[10px]`}>{STATUS_LABEL[obj.status]}</Badge>
                      </div>
                      <div className="font-mono text-[10px] text-slate-500">{obj.id}</div>
                      <h3 className="mt-0.5 text-sm font-semibold text-white truncate">{obj.title}</h3>
                      <p className="mt-0.5 text-xs text-slate-400 truncate">{obj.subtitle}</p>

                      <div className="mt-2.5 space-y-1">
                        {Object.entries(obj.properties).slice(0, 3).map(([k, v]) => (
                          <div key={k} className="flex items-center justify-between text-[11px]">
                            <span className="text-slate-500">{k}</span>
                            <span className="font-mono text-slate-300">{String(v)}</span>
                          </div>
                        ))}
                      </div>

                      <div className="mt-2 flex items-center gap-1 flex-wrap">
                        {obj.tags.slice(0, 3).map((t) => (
                          <Badge key={t} className="bg-slate-800 text-slate-400 border-slate-700 text-[9px]">{t}</Badge>
                        ))}
                      </div>

                      <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-2">
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                          <Calendar className="h-3 w-3" />
                          {obj.updatedAt}
                        </div>
                        {obj.score != null && (
                          <div className="flex items-center gap-1 text-[10px]">
                            <Star className={`h-3 w-3 ${obj.score >= 85 ? "text-emerald-400" : obj.score >= 60 ? "text-amber-400" : "text-red-400"}`} />
                            <span className="font-mono text-slate-300">{obj.score}</span>
                          </div>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="mt-2 h-7 w-full text-xs text-violet-400 hover:bg-violet-500/10 hover:text-violet-300"
                      >
                        <Eye className="ml-1 h-3 w-3" />
                        פתח Dossier
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {viewMode === "table" && (
            <Card className="border-slate-800 bg-slate-900/40">
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-500">
                      <th className="py-2 px-3 text-right font-medium">ID</th>
                      <th className="py-2 px-3 text-right font-medium">סוג</th>
                      <th className="py-2 px-3 text-right font-medium">כותרת</th>
                      <th className="py-2 px-3 text-right font-medium">סטטוס</th>
                      <th className="py-2 px-3 text-right font-medium">ציון</th>
                      <th className="py-2 px-3 text-right font-medium">פעילות</th>
                      <th className="py-2 px-3 text-right font-medium">עודכן</th>
                      <th className="py-2 px-3 text-center font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((obj) => {
                      const Icon = ICON_MAP[obj.type];
                      return (
                        <tr key={obj.id} className="border-b border-slate-800/60 hover:bg-slate-800/30 cursor-pointer" onClick={() => setSelectedObject(obj)}>
                          <td className="py-2.5 px-3 font-mono text-xs text-blue-400">{obj.id}</td>
                          <td className="py-2.5 px-3">
                            <div className={`inline-flex h-6 w-6 items-center justify-center rounded border ${COLOR_MAP[obj.type]}`}>
                              <Icon className="h-3 w-3" />
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="text-slate-100 font-medium">{obj.title}</div>
                            <div className="text-[10px] text-slate-500">{obj.subtitle}</div>
                          </td>
                          <td className="py-2.5 px-3"><Badge className={`${STATUS_COLOR[obj.status]} text-[10px]`}>{STATUS_LABEL[obj.status]}</Badge></td>
                          <td className="py-2.5 px-3 font-mono text-xs">{obj.score || "—"}</td>
                          <td className="py-2.5 px-3 font-mono text-xs text-slate-400">{obj.activity}</td>
                          <td className="py-2.5 px-3 text-xs text-slate-400">{obj.updatedAt}</td>
                          <td className="py-2.5 px-3 text-center">
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0"><ExternalLink className="h-3 w-3 text-violet-400" /></Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {viewMode === "timeline" && (
            <div className="space-y-2">
              {filtered.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((obj) => {
                const Icon = ICON_MAP[obj.type];
                return (
                  <div key={obj.id} className="flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-3 hover:bg-slate-900/70 cursor-pointer" onClick={() => setSelectedObject(obj)}>
                    <div className="flex flex-col items-center gap-1 pt-1">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-lg border ${COLOR_MAP[obj.type]}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="h-full w-px bg-slate-700"></div>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-[10px] text-blue-400">{obj.id}</span>
                        <h4 className="text-sm font-semibold text-white">{obj.title}</h4>
                        <Badge className={`${STATUS_COLOR[obj.status]} text-[10px]`}>{STATUS_LABEL[obj.status]}</Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-400">{obj.subtitle}</p>
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-500">
                        <Calendar className="h-3 w-3" />
                        {obj.updatedAt}
                        <span>·</span>
                        <span>{obj.activity} פעילויות</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Search className="h-12 w-12 text-slate-700 mb-3" />
              <h3 className="text-lg font-semibold text-slate-400">לא נמצאו ישויות</h3>
              <p className="text-sm text-slate-500">נסה לשנות את הסינונים או החיפוש</p>
            </div>
          )}
        </main>

        {/* RIGHT PANEL - Object Detail */}
        {selectedObject && (
          <aside className="w-80 flex-shrink-0 border-r border-slate-800 bg-slate-900/40 overflow-y-auto">
            <div className="border-b border-slate-800 p-4 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={`flex h-12 w-12 items-center justify-center rounded-lg border ${COLOR_MAP[selectedObject.type]}`}>
                  {(() => { const Icon = ICON_MAP[selectedObject.type]; return <Icon className="h-6 w-6" />; })()}
                </div>
                <div>
                  <div className="font-mono text-[10px] text-slate-500">{selectedObject.id}</div>
                  <h3 className="text-base font-bold text-white">{selectedObject.title}</h3>
                  <Badge className={`${STATUS_COLOR[selectedObject.status]} text-[10px] mt-1`}>{STATUS_LABEL[selectedObject.status]}</Badge>
                </div>
              </div>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setSelectedObject(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">תיאור</p>
                <p className="text-sm text-slate-300">{selectedObject.subtitle}</p>
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">מאפיינים</p>
                <div className="space-y-1 rounded-md border border-slate-800 bg-slate-900/60 p-3">
                  {Object.entries(selectedObject.properties).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between text-xs py-1 border-b border-slate-800/60 last:border-0">
                      <span className="text-slate-400">{k}</span>
                      <span className="font-mono text-slate-200">{String(v)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">תגיות</p>
                <div className="flex flex-wrap gap-1">
                  {selectedObject.tags.map((t) => (
                    <Badge key={t} className="bg-slate-800 text-slate-300 border-slate-700 text-[10px]">{t}</Badge>
                  ))}
                </div>
              </div>

              {selectedObject.score != null && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">ציון</p>
                  <div className="flex items-center gap-2">
                    <Progress value={selectedObject.score} className="h-1.5 flex-1" />
                    <span className="font-mono text-xs text-white">{selectedObject.score}/100</span>
                  </div>
                </div>
              )}

              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">מטה-דאטה</p>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between"><span className="text-slate-500">נוצר</span><span className="text-slate-300">{selectedObject.createdAt}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">עודכן</span><span className="text-slate-300">{selectedObject.updatedAt}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">פעילויות</span><span className="text-slate-300 font-mono">{selectedObject.activity}</span></div>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <Button className="w-full bg-violet-600 hover:bg-violet-700 h-9">
                  <Eye className="ml-2 h-4 w-4" />
                  פתח Dossier
                </Button>
                <Button variant="outline" className="w-full border-slate-700 bg-slate-900/50 h-9">
                  <Sparkles className="ml-2 h-4 w-4" />
                  נתח עם AI
                </Button>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
