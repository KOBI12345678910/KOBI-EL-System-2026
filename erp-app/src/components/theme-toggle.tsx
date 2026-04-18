import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Moon, Sun } from "lucide-react";

function applyTheme(dark: boolean) {
  const root = document.documentElement;
  if (dark) {
    root.classList.remove("light-theme");
    root.setAttribute("data-theme", "dark");
  } else {
    root.classList.add("light-theme");
    root.setAttribute("data-theme", "light");
  }
  try { localStorage.setItem("theme", dark ? "dark" : "light"); } catch {}
}

export function toggleTheme() {
  const isDark = !document.documentElement.classList.contains("light-theme");
  applyTheme(!isDark);
  window.dispatchEvent(new CustomEvent("theme-changed"));
}

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(() => {
    try {
      return localStorage.getItem("theme") !== "light";
    } catch {
      return true;
    }
  });

  const syncFromDom = useCallback(() => {
    setIsDark(!document.documentElement.classList.contains("light-theme"));
  }, []);

  useEffect(() => {
    applyTheme(isDark);
  }, [isDark]);

  useEffect(() => {
    window.addEventListener("theme-changed", syncFromDom);
    return () => window.removeEventListener("theme-changed", syncFromDom);
  }, [syncFromDom]);

  return (
    <button
      onClick={() => { setIsDark(prev => { applyTheme(!prev); return !prev; }); }}
      className="relative p-2 rounded-lg hover:bg-card/10 text-muted-foreground hover:text-foreground transition-all"
      title={isDark ? "מצב בהיר" : "מצב כהה"}
    >
      <AnimatePresence mode="wait" initial={false}>
        {isDark ? (
          <motion.div
            key="moon"
            initial={{ rotate: -90, scale: 0, opacity: 0 }}
            animate={{ rotate: 0, scale: 1, opacity: 1 }}
            exit={{ rotate: 90, scale: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
          >
            <Moon className="w-4.5 h-4.5" />
          </motion.div>
        ) : (
          <motion.div
            key="sun"
            initial={{ rotate: 90, scale: 0, opacity: 0 }}
            animate={{ rotate: 0, scale: 1, opacity: 1 }}
            exit={{ rotate: -90, scale: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
          >
            <Sun className="w-4.5 h-4.5" />
          </motion.div>
        )}
      </AnimatePresence>
    </button>
  );
}
