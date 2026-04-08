import { useEffect, useState, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Keyboard, X } from "lucide-react";
import { cycleThemeMode } from "@/components/theme-toggle";
import { getModifierKey } from "@/lib/utils";

interface Shortcut {
  keys: string[];
  label: string;
  action?: () => void;
}

export function useGlobalKeyboardShortcuts() {
  const [, navigate] = useLocation();
  const [showCheatSheet, setShowCheatSheet] = useState(false);

  const mod = useMemo(() => getModifierKey(), []);

  const shortcuts: Shortcut[] = [
    { keys: [mod, "K"], label: "חיפוש מהיר" },
    { keys: [mod, "N"], label: "יצירה מהירה", action: () => {
      const fab = document.querySelector('[data-quick-add-fab]') as HTMLButtonElement;
      if (fab) fab.click();
    }},
    { keys: [mod, "S"], label: "שמור טופס פעיל", action: () => {
      const saveBtn = document.querySelector('[data-save-btn], button[type="submit"], form button:last-of-type') as HTMLButtonElement;
      if (saveBtn) saveBtn.click();
    }},
    { keys: [mod, "/"], label: "קיצורי מקלדת", action: () => setShowCheatSheet(prev => !prev) },
    { keys: ["Esc"], label: "סגירת חלון / ביטול" },
    { keys: ["Alt", "H"], label: "דף הבית", action: () => navigate("/") },
    { keys: ["Alt", "S"], label: "הגדרות", action: () => navigate("/settings") },
    { keys: ["Alt", "T"], label: "החלפת ערכת נושא (כהה/בהיר/אוטומטי)" },
  ];

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

    if (e.key === "Escape") {
      const modals = document.querySelectorAll('[role="dialog"]');
      if (modals.length > 0) return;
      setShowCheatSheet(false);
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      const saveBtn = document.querySelector('[data-save-btn], button[type="submit"]') as HTMLButtonElement;
      if (saveBtn) saveBtn.click();
      return;
    }

    if (isInput) return;

    if ((e.ctrlKey || e.metaKey) && e.key === "n") {
      e.preventDefault();
      const fab = document.querySelector('[data-quick-add-fab]') as HTMLButtonElement;
      if (fab) fab.click();
    }

    if ((e.ctrlKey || e.metaKey) && e.key === "/") {
      e.preventDefault();
      setShowCheatSheet(prev => !prev);
    }

    if (e.altKey && e.key === "h") {
      e.preventDefault();
      navigate("/");
    }

    if (e.altKey && e.key === "s") {
      e.preventDefault();
      navigate("/settings");
    }

    if (e.altKey && e.key === "t") {
      e.preventDefault();
      cycleThemeMode();
    }
  }, [navigate]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return { showCheatSheet, setShowCheatSheet, shortcuts };
}

export function KeyboardShortcutCheatSheet({
  open,
  onClose,
  shortcuts,
}: {
  open: boolean;
  onClose: () => void;
  shortcuts: { keys: string[]; label: string }[];
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ duration: 0.2 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md"
           
          >
            <div className="bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
                <div className="flex items-center gap-2">
                  <Keyboard className="w-5 h-5 text-primary" />
                  <h3 className="font-semibold text-foreground">קיצורי מקלדת</h3>
                </div>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg hover:bg-card/10 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto">
                {shortcuts.map((s, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-card/30 hover:bg-card/50 transition-colors"
                  >
                    <span className="text-sm text-foreground">{s.label}</span>
                    <div className="flex items-center gap-1">
                      {s.keys.map((key, j) => (
                        <span key={j}>
                          <kbd className="px-2 py-1 rounded-md bg-background border border-border text-xs font-mono text-muted-foreground min-w-[28px] text-center inline-block">
                            {key}
                          </kbd>
                          {j < s.keys.length - 1 && <span className="text-muted-foreground/40 mx-0.5">+</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-5 py-3 border-t border-border/50 text-center">
                <span className="text-xs text-muted-foreground">
                  לחץ <kbd className="px-1.5 py-0.5 rounded bg-background border border-border text-[10px] font-mono mx-1">Esc</kbd> לסגירה
                </span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
