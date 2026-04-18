import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Sparkles, Loader2, X, ArrowLeft, Database,
  FileText, Package, Truck, ShoppingCart, Users, BarChart3,
  FolderKanban, ClipboardList, Receipt, UserCircle, Briefcase
} from "lucide-react";
import { authFetch } from "@/lib/utils";

const API = "/api";

interface SearchResult {
  type: string;
  title: string;
  description?: string;
  href?: string;
  icon?: string;
  id?: number | string;
}

const MODULE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  customers: Users,
  suppliers: Truck,
  employees: UserCircle,
  materials: Package,
  sales_orders: ShoppingCart,
  purchase_orders: ClipboardList,
  projects: FolderKanban,
  invoices: FileText,
  quotes: Receipt,
  records: Database,
  reports: BarChart3,
  default: Briefcase,
};

const TYPE_LABELS: Record<string, string> = {
  customers: "לקוחות",
  suppliers: "ספקים",
  employees: "עובדים",
  materials: "חומרי גלם",
  sales_orders: "הזמנות מכירה",
  purchase_orders: "הזמנות רכש",
  projects: "פרויקטים",
  invoices: "חשבוניות",
  quotes: "הצעות מחיר",
  records: "רשומות",
};

const NAV_SHORTCUTS = [
  { label: "לקוחות", href: "/customers", icon: "customers" },
  { label: "ספקים", href: "/suppliers", icon: "suppliers" },
  { label: "הזמנות מכירה", href: "/sales/orders", icon: "sales_orders" },
  { label: "הזמנות רכש", href: "/purchase-orders", icon: "purchase_orders" },
  { label: "חומרי גלם", href: "/raw-materials", icon: "materials" },
  { label: "עובדים", href: "/hr", icon: "employees" },
  { label: "פרויקטים", href: "/projects", icon: "projects" },
  { label: "חשבוניות", href: "/finance/ar", icon: "invoices" },
  { label: "הצעות מחיר", href: "/price-quotes", icon: "quotes" },
  { label: "דשבורד", href: "/", icon: "reports" },
  { label: "דוחות", href: "/reports/center", icon: "reports" },
  { label: "ייצור", href: "/production/work-orders", icon: "default" },
  { label: "CRM", href: "/crm", icon: "default" },
  { label: "פיננסים", href: "/finance", icon: "default" },
  { label: "משאבי אנוש", href: "/hr", icon: "employees" },
  { label: "תקציבים", href: "/budgets", icon: "default" },
  { label: "לוח שנה", href: "/calendar", icon: "default" },
  { label: "מסמכים", href: "/documents", icon: "default" },
];

export default function AISmartSearch() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [dbResults, setDbResults] = useState<SearchResult[]>([]);
  const [navResults, setNavResults] = useState<typeof NAV_SHORTCUTS>([]);
  const [aiSummary, setAiSummary] = useState("");
  const [aiResults, setAiResults] = useState<SearchResult[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const [, setLocation] = useLocation();

  const doDbSearch = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 2) { setDbResults([]); return; }
    try {
      const res = await authFetch(`${API}/global-search?q=${encodeURIComponent(searchQuery)}`);
      if (res.ok) {
        const data = await res.json();
        setDbResults(data.results || []);
      }
    } catch { setDbResults([]); }
  }, []);

  const doNavSearch = useCallback((searchQuery: string) => {
    if (!searchQuery) { setNavResults([]); return; }
    const q = searchQuery.toLowerCase();
    const matched = NAV_SHORTCUTS.filter(n => n.label.includes(q) || n.href.includes(q));
    setNavResults(matched.slice(0, 5));
  }, []);

  const aiSearchMutation = useMutation({
    mutationFn: async (searchQuery: string) => {
      const [modulesRes, aiRes] = await Promise.all([
        authFetch(`${API}/platform/modules`).then(r => r.ok ? r.json() : []),
        authFetch(`${API}/claude/chat/send`, {
          method: "POST",
          body: JSON.stringify({
            message: `[חיפוש בשפה טבעית]\nהמשתמש מחפש: "${searchQuery}"\n\nאנא ענה בפורמט הבא:\n1. שורת סיכום קצרה של מה שמצאת\n2. רשימת תוצאות רלוונטיות (אם יש)\n\nענה בעברית בקצרה.`,
            channel: "support",
          }),
        }).then(r => r.ok ? r.json() : null),
      ]);

      const modules = Array.isArray(modulesRes) ? modulesRes : [];
      const allEntities: Array<{ id: number; name: string; nameHe: string; slug: string; moduleId: number; moduleName: string }> = [];
      for (const mod of modules) {
        try {
          const entRes = await authFetch(`${API}/platform/modules/${mod.id}/entities`);
          if (entRes.ok) {
            const ents = await entRes.json();
            for (const e of (Array.isArray(ents) ? ents : [])) {
              allEntities.push({ id: e.id, name: e.name, nameHe: e.nameHe, slug: e.slug, moduleId: mod.id, moduleName: mod.nameHe || mod.name });
            }
          }
        } catch {}
      }

      const matchedEntities = allEntities.filter(e => {
        const lq = searchQuery.toLowerCase();
        return (e.nameHe && e.nameHe.includes(lq)) || (e.name && e.name.toLowerCase().includes(lq)) || (e.slug && e.slug.toLowerCase().includes(lq));
      });

      const recordSearches: SearchResult[] = [];
      const entitiesToSearch = matchedEntities.length > 0 ? matchedEntities.slice(0, 3) : allEntities.slice(0, 5);
      await Promise.all(entitiesToSearch.map(async (entity) => {
        try {
          const recRes = await authFetch(`${API}/platform/entities/${entity.id}/records?search=${encodeURIComponent(searchQuery)}&limit=3`);
          if (recRes.ok) {
            const recData = await recRes.json();
            const records = recData.data || recData || [];
            for (const rec of (Array.isArray(records) ? records.slice(0, 3) : [])) {
              const data = rec.data || {};
              const title = data.name || data.title || data.nameHe || data.description || `רשומה #${rec.id}`;
              recordSearches.push({ type: "records", title: String(title).slice(0, 80), description: `${entity.nameHe || entity.name} | ${rec.status || ""}`, href: `/builder/data/${entity.id}/${rec.id}` });
            }
          }
        } catch {}
      }));

      const entityNavResults: SearchResult[] = matchedEntities.slice(0, 5).map(e => ({
        type: "records", title: e.nameHe || e.name, description: `${e.moduleName} — צפה ברשימה`, href: `/builder/data/${e.id}`,
      }));

      return { response: aiRes?.response || aiRes?.message || "", entityResults: entityNavResults, recordResults: recordSearches };
    },
    onSuccess: (data) => {
      setAiSummary(data.response);
      setAiResults([...data.recordResults, ...data.entityResults]);
    },
  });

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    }
    if (isOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setIsOpen(true); }
      if (e.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSelectedIdx(-1);
    if (query.trim().length >= 2) {
      doNavSearch(query.trim());
      debounceRef.current = setTimeout(() => doDbSearch(query.trim()), 300);
    } else {
      setDbResults([]);
      doNavSearch(query.trim());
    }
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, doDbSearch, doNavSearch]);

  const allResults = [
    ...navResults.map(n => ({ type: "nav", title: n.label, href: n.href, icon: n.icon } as SearchResult)),
    ...dbResults,
    ...aiResults,
  ];

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIdx >= 0 && selectedIdx < allResults.length && allResults[selectedIdx].href) {
        navigateTo(allResults[selectedIdx].href!);
      } else if (query.trim()) {
        aiSearchMutation.mutate(query.trim());
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx(prev => Math.min(prev + 1, allResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx(prev => Math.max(prev - 1, -1));
    }
  };

  const navigateTo = (href: string) => {
    setIsOpen(false);
    setQuery("");
    setDbResults([]);
    setAiResults([]);
    setAiSummary("");
    setNavResults([]);
    setLocation(href);
  };

  const groupedResults = allResults.reduce<Record<string, SearchResult[]>>((acc, r) => {
    const key = r.type || "other";
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 bg-card/5 hover:bg-card/10 border border-border/50 rounded-xl text-sm text-muted-foreground transition-colors"
      >
        <Search className="w-4 h-4" />
        <span className="hidden sm:inline">חיפוש גלובלי...</span>
        <kbd className="hidden md:inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-muted/50 rounded text-[10px] font-mono text-muted-foreground">
          ⌘K
        </kbd>
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
              onClick={() => setIsOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              className="fixed top-[12%] left-1/2 -translate-x-1/2 w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl z-50 overflow-hidden"
              dir="rtl"
            >
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50">
                <Search className="w-5 h-5 text-blue-400 flex-shrink-0" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder='חיפוש לקוחות, ספקים, הזמנות, חומרים, עובדים...'
                  className="flex-1 bg-transparent text-foreground placeholder-muted-foreground text-sm focus:outline-none"
                />
                {aiSearchMutation.isPending ? (
                  <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />
                ) : query.trim() ? (
                  <button onClick={() => aiSearchMutation.mutate(query.trim())} className="p-1.5 text-violet-400 hover:text-violet-300 hover:bg-violet-500/10 rounded-lg transition-colors" title="חיפוש חכם AI">
                    <Sparkles className="w-4 h-4" />
                  </button>
                ) : null}
                <button onClick={() => setIsOpen(false)} className="p-1 text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="max-h-[60vh] overflow-y-auto">
                {aiSummary && (
                  <div className="px-4 py-3 bg-violet-500/5 border-b border-border/30">
                    <div className="flex items-start gap-2">
                      <Sparkles className="w-4 h-4 text-violet-400 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{aiSummary.slice(0, 400)}{aiSummary.length > 400 ? "..." : ""}</p>
                    </div>
                  </div>
                )}

                {Object.keys(groupedResults).length > 0 && (
                  <div className="py-1">
                    {Object.entries(groupedResults).map(([type, items]) => (
                      <div key={type}>
                        <div className="px-4 py-1.5 flex items-center gap-2">
                          <span className="text-[10px] font-semibold text-muted-foreground tracking-wider uppercase">
                            {type === "nav" ? "ניווט מהיר" : TYPE_LABELS[type] || type}
                          </span>
                          <span className="text-[10px] text-muted-foreground">({items.length})</span>
                        </div>
                        {items.map((result, i) => {
                          const globalIdx = allResults.indexOf(result);
                          const Icon = MODULE_ICONS[result.icon || result.type] || MODULE_ICONS.default;
                          const isNav = result.type === "nav";
                          return (
                            <button
                              key={`${type}-${i}`}
                              onClick={() => result.href && navigateTo(result.href)}
                              className={`w-full flex items-center gap-3 px-4 py-2 hover:bg-card/5 transition-colors text-right ${globalIdx === selectedIdx ? "bg-blue-500/10 border-r-2 border-blue-500" : ""}`}
                            >
                              <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${isNav ? "bg-slate-500/10" : "bg-primary/10"}`}>
                                <Icon className={`w-3.5 h-3.5 ${isNav ? "text-muted-foreground" : "text-primary"}`} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">{result.title}</p>
                                {result.description && <p className="text-xs text-muted-foreground truncate">{result.description}</p>}
                              </div>
                              <ArrowLeft className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}

                {!query.trim() && !aiSummary && allResults.length === 0 && (
                  <div className="px-4 py-5 text-center">
                    <p className="text-xs text-muted-foreground mb-3">הקלד לחיפוש מיידי או לחץ <Sparkles className="w-3 h-3 inline text-violet-400" /> לחיפוש חכם AI</p>
                    <div className="flex flex-wrap gap-1.5 justify-center">
                      {["הזמנות פתוחות", "ספקים פעילים", "מלאי נמוך", "דוח רווחיות", "לקוחות חדשים"].map(s => (
                        <button
                          key={s}
                          onClick={() => { setQuery(s); aiSearchMutation.mutate(s); }}
                          className="px-2.5 py-1 bg-muted/30 hover:bg-muted/50 rounded-lg text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {query.trim().length >= 2 && allResults.length === 0 && !aiSearchMutation.isPending && (
                  <div className="px-4 py-6 text-center">
                    <p className="text-sm text-muted-foreground">לא נמצאו תוצאות עבור "{query}"</p>
                    <button
                      onClick={() => aiSearchMutation.mutate(query.trim())}
                      className="mt-2 px-3 py-1.5 bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 rounded-lg text-xs transition-colors inline-flex items-center gap-1.5"
                    >
                      <Sparkles className="w-3 h-3" />
                      נסה חיפוש חכם AI
                    </button>
                  </div>
                )}
              </div>

              <div className="px-4 py-2 border-t border-border/30 flex items-center justify-between text-[10px] text-muted-foreground">
                <div className="flex items-center gap-3">
                  <span>↑↓ ניווט</span>
                  <span>↵ בחירה</span>
                  <span>ESC סגירה</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-violet-400" />
                  <span>חיפוש חכם AI</span>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
