import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  LayoutDashboard, Search, Settings, Users, Factory, Receipt,
  ShoppingCart, Briefcase, BarChart3, Package, Brain, Truck,
  Building2, Wrench, FileText, Clock, Target, Shield,
  Keyboard, ArrowRight, Plus, Home, Bell, MessageSquare,
  Download, Upload, Zap, Star, User, LogOut, Sparkles, Loader2,
  Database, FolderKanban, ClipboardList, UserCircle,
} from "lucide-react";
import { authFetch, getModifierKey } from "@/lib/utils";
import { usePlatformModules } from "@/hooks/usePlatformModules";

const SECTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "ראשי": LayoutDashboard,
  "לקוחות ומכירות": Building2,
  "כספים": Receipt,
  "רכש ושרשרת אספקה": Truck,
  "מלאי ולוגיסטיקה": Package,
  "ייצור": Factory,
  "ניהול פרויקטים": Briefcase,
  "משאבי אנוש": Users,
  "מנוע בינה מלאכותית — AI": Brain,
  "שולחן שליטה מנהלי": BarChart3,
  "הגדרות מערכת": Settings,
  "אסטרטגיה וחזון": Target,
  "בונה מערכת": Wrench,
  "מסמכים וחוזים": FileText,
  "תקשורת ושיתוף פעולה": Clock,
  "דוחות": BarChart3,
  "שיווק": Target,
  "מתקנים והתקנות": Wrench,
};

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

interface DbSearchResult {
  type: string;
  title: string;
  description?: string;
  href?: string;
  icon?: string;
  id?: number | string;
}

interface QuickAction {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  action: () => void;
  keywords: string;
}

interface NavItemForPalette {
  href: string;
  label: string;
  section: string;
  subSection?: string;
  icon?: React.ComponentType<{ className?: string }>;
}

interface CommandPaletteProps {
  navItems: NavItemForPalette[];
}

interface ApiSearchResultRaw {
  type: string;
  title: string;
  description?: string;
  href?: string;
  icon?: string;
  id?: number | string;
  aiReason?: string;
}

function getShortcutLabel(): string {
  return `${getModifierKey()}+K`;
}

const API = "/api";

function commandFilter(value: string, search: string): number {
  if (value.startsWith("db-result-") || value.startsWith("ai-result-")) return 1;
  const v = value.toLowerCase();
  const s = search.toLowerCase();
  if (v.includes(s)) return 1;
  return 0;
}

export function CommandPalette({ navItems }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [dbResults, setDbResults] = useState<DbSearchResult[]>([]);
  const [dbLoading, setDbLoading] = useState(false);
  const [dbError, setDbError] = useState(false);
  const [aiEnhanced, setAiEnhanced] = useState(false);
  const [aiSummary, setAiSummary] = useState("");
  const [aiResults, setAiResults] = useState<DbSearchResult[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const [, navigate] = useLocation();
  const { modules: cachedModules } = usePlatformModules();

  const shortcutLabel = useMemo(() => getShortcutLabel(), []);
  const modKey = useMemo(() => getModifierKey(), []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const doDbSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setDbResults([]); setAiEnhanced(false); setDbError(false); return; }
    setDbLoading(true);
    setDbError(false);
    try {
      const res = await authFetch(`${API}/global-search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        const rawResults: ApiSearchResultRaw[] = data.results || [];
        setDbResults(rawResults.map((r) => ({
          type: r.type,
          title: r.title,
          description: r.description,
          href: r.href || `/${r.type}`,
          icon: r.icon,
          id: r.id,
        })));
        setAiEnhanced(false);
      } else {
        setDbError(true);
        setDbResults([]);
      }
    } catch (err) {
      console.warn("[CommandPalette] DB search failed:", err);
      setDbError(true);
      setDbResults([]);
    } finally {
      setDbLoading(false);
    }
  }, []);

  const aiSearchMutation = useMutation({
    mutationFn: async (q: string) => {
      const aiRes = await authFetch(`${API}/claude/chat/send`, {
        method: "POST",
        body: JSON.stringify({
          message: `[חיפוש בשפה טבעית]\nהמשתמש מחפש: "${q}"\n\nאנא ענה בפורמט הבא:\n1. שורת סיכום קצרה של מה שמצאת\n2. רשימת תוצאות רלוונטיות (אם יש)\n\nענה בעברית בקצרה.`,
          channel: "support",
        }),
      }).then(r => r.ok ? r.json() : null);

      const modules = cachedModules;
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
        } catch (err) {
          console.warn(`[CommandPalette] Failed to load entities for module ${mod.id}:`, err);
        }
      }

      const matchedEntities = allEntities.filter(e => {
        const lq = q.toLowerCase();
        return (e.nameHe && e.nameHe.includes(lq)) || (e.name && e.name.toLowerCase().includes(lq)) || (e.slug && e.slug.toLowerCase().includes(lq));
      });

      const recordSearches: DbSearchResult[] = [];
      const entitiesToSearch = matchedEntities.length > 0 ? matchedEntities.slice(0, 3) : allEntities.slice(0, 5);
      await Promise.all(entitiesToSearch.map(async (entity) => {
        try {
          const recRes = await authFetch(`${API}/platform/entities/${entity.id}/records?search=${encodeURIComponent(q)}&limit=3`);
          if (recRes.ok) {
            const recData = await recRes.json();
            const records = recData.data || recData || [];
            for (const rec of (Array.isArray(records) ? records.slice(0, 3) : [])) {
              const data = rec.data || {};
              const title = data.name || data.title || data.nameHe || data.description || `רשומה #${rec.id}`;
              recordSearches.push({ type: "records", title: String(title).slice(0, 80), description: `${entity.nameHe || entity.name} | ${rec.status || ""}`, href: `/builder/data/${entity.id}/${rec.id}` });
            }
          }
        } catch (err) {
          console.warn(`[CommandPalette] Failed to search records for entity ${entity.id}:`, err);
        }
      }));

      const entityNavResults: DbSearchResult[] = matchedEntities.slice(0, 5).map(e => ({
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
    if (!open) {
      setSearchValue("");
      setDbResults([]);
      setDbLoading(false);
      setDbError(false);
      setAiResults([]);
      setAiSummary("");
      setAiEnhanced(false);
    }
  }, [open]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setAiResults([]);
    setAiSummary("");
    setAiEnhanced(false);
    if (searchValue.trim().length >= 2) {
      debounceRef.current = setTimeout(() => doDbSearch(searchValue.trim()), 300);
    } else {
      setDbResults([]);
      setDbError(false);
      setDbLoading(false);
    }
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchValue, doDbSearch]);

  const quickActions: QuickAction[] = useMemo(() => [
    { id: "home", label: "חזור לדף הבית", icon: Home, action: () => { setOpen(false); navigate("/"); }, keywords: "בית ראשי דשבורד home" },
    { id: "new-record", label: "יצירת רשומה חדשה", icon: Plus, action: () => { setOpen(false); const fab = document.querySelector('[data-quick-add-fab]') as HTMLButtonElement; if (fab) fab.click(); }, keywords: "חדש יצירה הוספה create new add" },
    { id: "notifications", label: "הצג התראות", icon: Bell, action: () => { setOpen(false); navigate("/notifications"); }, keywords: "התראות notifications alerts" },
    { id: "chat", label: "צאט ארגוני", icon: MessageSquare, action: () => { setOpen(false); navigate("/chat"); }, keywords: "צאט הודעות chat messages" },
    { id: "settings", label: "הגדרות מערכת", icon: Settings, action: () => { setOpen(false); navigate("/settings"); }, keywords: "הגדרות settings" },
    { id: "profile", label: "פרופיל משתמש", icon: User, action: () => { setOpen(false); navigate("/settings?tab=profile"); }, keywords: "פרופיל משתמש profile user" },
    { id: "import", label: "ייבוא נתונים", icon: Upload, action: () => { setOpen(false); navigate("/settings/import-export"); }, keywords: "ייבוא נתונים import data" },
    { id: "export", label: "ייצוא נתונים", icon: Download, action: () => { setOpen(false); navigate("/settings/import-export"); }, keywords: "ייצוא נתונים export data" },
    { id: "audit", label: "יומן ביקורת", icon: Shield, action: () => { setOpen(false); navigate("/audit-log"); }, keywords: "ביקורת יומן audit log" },
    { id: "kobi", label: "קובי AI — סוכן אוטונומי", icon: Zap, action: () => { setOpen(false); const kobi = document.querySelector('[title*="קובי"]') as HTMLButtonElement; if (kobi) kobi.click(); }, keywords: "קובי ai סוכן kobi agent" },
    { id: "ai-search", label: "חיפוש חכם AI", icon: Sparkles, action: () => { if (searchValue.trim()) { aiSearchMutation.mutate(searchValue.trim()); } }, keywords: "חיפוש AI חכם smart search" },
  ], [navigate, searchValue, aiSearchMutation]);

  const grouped = useMemo(() => {
    const map = new Map<string, NavItemForPalette[]>();
    for (const item of navItems) {
      if (!item.href) continue;
      const group = item.section;
      if (!map.has(group)) map.set(group, []);
      map.get(group)!.push(item);
    }
    return map;
  }, [navItems]);

  const handleSelect = useCallback((href: string) => {
    setOpen(false);
    navigate(href);
  }, [navigate]);

  const hasDbResults = dbResults.length > 0;
  const hasAiResults = aiResults.length > 0;
  const isSearching = searchValue.trim().length >= 2;
  const showDbSection = hasDbResults;
  const showAiSection = hasAiResults || aiSummary;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-2 py-1.5 md:px-3 rounded-lg bg-card/30 border border-border/50 text-muted-foreground hover:text-foreground hover:bg-card/50 transition-all text-sm group min-h-[36px]"
        aria-label="פתח חיפוש"
      >
        <Search className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="hidden md:inline text-xs">חיפוש...</span>
        <kbd className="hidden lg:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-card/50 border border-border/50 text-[10px] font-mono text-muted-foreground/70 mr-2">
          {shortcutLabel}
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="overflow-hidden p-0 max-w-2xl">
          <DialogTitle className="sr-only">חיפוש גלובלי</DialogTitle>
          <Command
            filter={commandFilter}
            className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5"
          >
          <div className="flex items-center border-b border-border/50">
          <CommandInput
            placeholder="חפש עמוד, רשומה, פעולה..."
            className="text-right flex-1"
            value={searchValue}
            onValueChange={setSearchValue}
          />
          {dbLoading && (
            <Loader2 className="w-4 h-4 text-primary/70 animate-spin mx-2 flex-shrink-0" />
          )}
          {aiSearchMutation.isPending ? (
            <Loader2 className="w-4 h-4 text-violet-400 animate-spin mx-3 flex-shrink-0" />
          ) : searchValue.trim() ? (
            <button
              onMouseDown={(e) => { e.preventDefault(); aiSearchMutation.mutate(searchValue.trim()); }}
              className="p-1.5 text-violet-400 hover:text-violet-300 hover:bg-violet-500/10 rounded-lg transition-colors mx-2 flex-shrink-0"
              title="חיפוש חכם AI"
            >
              <Sparkles className="w-4 h-4" />
            </button>
          ) : null}
        </div>

        {aiSummary && (
          <div className="px-4 py-3 bg-violet-500/5 border-b border-border/30">
            <div className="flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-violet-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                {aiSummary.slice(0, 400)}{aiSummary.length > 400 ? "..." : ""}
              </p>
            </div>
          </div>
        )}

        <CommandList className="max-h-[400px]">
          <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">
            {dbLoading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                מחפש...
              </span>
            ) : dbError ? (
              <span className="text-destructive/70">שגיאה בחיפוש — נסה שנית</span>
            ) : isSearching ? (
              "לא נמצאו תוצאות"
            ) : (
              "הקלד לחיפוש..."
            )}
          </CommandEmpty>

          {showDbSection && (
            <>
              <CommandGroup heading={
                <span className="flex items-center gap-1.5 text-xs">
                  <Database className="w-3 h-3" />
                  תוצאות מהמסד
                  {aiEnhanced && <Sparkles className="w-3 h-3 text-violet-400" />}
                </span>
              }>
                {dbResults.map((result, i) => {
                  const Icon = MODULE_ICONS[result.icon || result.type] || MODULE_ICONS.default;
                  return (
                    <CommandItem
                      key={`db-${i}`}
                      value={`db-result-${result.title}-${i}`}
                      onSelect={() => result.href && handleSelect(result.href)}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <div className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0 bg-primary/10">
                        <Icon className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <div className="flex-1 text-right min-w-0">
                        <p className="text-sm font-medium truncate">{result.title}</p>
                        {result.description && <p className="text-xs text-muted-foreground truncate">{result.description}</p>}
                      </div>
                      <span className="text-[10px] text-muted-foreground/60 px-1.5 py-0.5 rounded bg-card/30 flex-shrink-0">
                        {TYPE_LABELS[result.type] || result.type}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
              <CommandSeparator />
            </>
          )}

          {showAiSection && (
            <>
              <CommandGroup heading={<span className="flex items-center gap-1.5 text-xs"><Sparkles className="w-3 h-3 text-violet-400" />תוצאות AI</span>}>
                {aiResults.map((result, i) => {
                  const Icon = MODULE_ICONS[result.icon || result.type] || MODULE_ICONS.default;
                  return (
                    <CommandItem
                      key={`ai-${i}`}
                      value={`ai-result-${result.title}-${i}`}
                      onSelect={() => result.href && handleSelect(result.href)}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <div className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0 bg-violet-500/10">
                        <Icon className="w-3.5 h-3.5 text-violet-400" />
                      </div>
                      <div className="flex-1 text-right min-w-0">
                        <p className="text-sm font-medium truncate">{result.title}</p>
                        {result.description && <p className="text-xs text-muted-foreground truncate">{result.description}</p>}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
              <CommandSeparator />
            </>
          )}

          <CommandGroup heading={<span className="flex items-center gap-1.5 text-xs"><Zap className="w-3 h-3" />פעולות מהירות</span>}>
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <CommandItem
                  key={action.id}
                  value={`${action.label} ${action.keywords}`}
                  onSelect={action.action}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Icon className="w-4 h-4 text-primary/70 flex-shrink-0" />
                  <span className="flex-1 text-right">{action.label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>

          <CommandSeparator />

          {Array.from(grouped.entries()).map(([section, items]) => {
            const SectionIcon = SECTION_ICONS[section] || LayoutDashboard;
            return (
              <CommandGroup
                key={section}
                heading={
                  <span className="flex items-center gap-1.5 text-xs">
                    <SectionIcon className="w-3 h-3" />
                    {section}
                  </span>
                }
              >
                {items.map((item) => {
                  const Icon = item.icon || LayoutDashboard;
                  return (
                    <CommandItem
                      key={item.href}
                      value={`${item.label} ${item.section} ${item.subSection || ""}`}
                      onSelect={() => handleSelect(item.href)}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <span className="flex-1 text-right">{item.label}</span>
                      {item.subSection && (
                        <span className="text-[10px] text-muted-foreground/60 px-1.5 py-0.5 rounded bg-card/30">
                          {item.subSection}
                        </span>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            );
          })}

          <CommandSeparator />
          <CommandGroup heading={<span className="flex items-center gap-1.5 text-xs"><Keyboard className="w-3 h-3" />קיצורי מקלדת</span>}>
            <CommandItem disabled className="text-xs text-muted-foreground cursor-default opacity-70">
              <kbd className="px-1.5 py-0.5 rounded bg-card/50 border border-border/50 text-[10px] font-mono ml-2">{shortcutLabel}</kbd>
              <span>חיפוש מהיר</span>
            </CommandItem>
            <CommandItem disabled className="text-xs text-muted-foreground cursor-default opacity-70">
              <kbd className="px-1.5 py-0.5 rounded bg-card/50 border border-border/50 text-[10px] font-mono ml-2">{modKey}+N</kbd>
              <span>יצירה מהירה</span>
            </CommandItem>
            <CommandItem disabled className="text-xs text-muted-foreground cursor-default opacity-70">
              <kbd className="px-1.5 py-0.5 rounded bg-card/50 border border-border/50 text-[10px] font-mono ml-2">{modKey}+/</kbd>
              <span>קיצורי מקלדת</span>
            </CommandItem>
            <CommandItem disabled className="text-xs text-muted-foreground cursor-default opacity-70">
              <kbd className="px-1.5 py-0.5 rounded bg-card/50 border border-border/50 text-[10px] font-mono ml-2">Esc</kbd>
              <span>סגירה</span>
            </CommandItem>
          </CommandGroup>
          </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
