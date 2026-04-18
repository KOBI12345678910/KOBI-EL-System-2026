import { useState, useEffect, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import {
  LayoutDashboard, Search, Settings, Users, Factory, Receipt,
  ShoppingCart, Briefcase, BarChart3, Package, Brain, Truck,
  Building2, Wrench, FileText, Clock, Target, Shield,
  Keyboard, ArrowRight, Plus, Home, Bell, MessageSquare,
  Download, Upload, Zap, Star, User, LogOut,
} from "lucide-react";

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

export function CommandPalette({ navItems }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();

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
  ], [navigate]);

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

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card/30 border border-border/50 text-muted-foreground hover:text-foreground hover:bg-card/50 transition-all text-sm group"
      >
        <Search className="w-3.5 h-3.5" />
        <span className="text-xs">חיפוש מהיר...</span>
        <kbd className="hidden lg:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-card/50 border border-border/50 text-[10px] font-mono text-muted-foreground/70 mr-2">
          Ctrl+K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="חפש עמוד, פעולה או כלי..." dir="rtl" className="text-right" />
        <CommandList className="max-h-[400px]" dir="rtl">
          <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">
            לא נמצאו תוצאות
          </CommandEmpty>

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
              <kbd className="px-1.5 py-0.5 rounded bg-card/50 border border-border/50 text-[10px] font-mono ml-2">Ctrl+K</kbd>
              <span>חיפוש מהיר</span>
            </CommandItem>
            <CommandItem disabled className="text-xs text-muted-foreground cursor-default opacity-70">
              <kbd className="px-1.5 py-0.5 rounded bg-card/50 border border-border/50 text-[10px] font-mono ml-2">Ctrl+N</kbd>
              <span>יצירה מהירה</span>
            </CommandItem>
            <CommandItem disabled className="text-xs text-muted-foreground cursor-default opacity-70">
              <kbd className="px-1.5 py-0.5 rounded bg-card/50 border border-border/50 text-[10px] font-mono ml-2">Ctrl+/</kbd>
              <span>קיצורי מקלדת</span>
            </CommandItem>
            <CommandItem disabled className="text-xs text-muted-foreground cursor-default opacity-70">
              <kbd className="px-1.5 py-0.5 rounded bg-card/50 border border-border/50 text-[10px] font-mono ml-2">Esc</kbd>
              <span>סגירה</span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
