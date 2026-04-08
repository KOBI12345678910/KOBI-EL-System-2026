import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Moon, Sun, Clock } from "lucide-react";

type ThemeMode = "dark" | "light" | "auto";

function applyTheme(dark: boolean) {
  const root = document.documentElement;
  if (dark) {
    root.classList.remove("light-theme");
    root.setAttribute("data-theme", "dark");
  } else {
    root.classList.add("light-theme");
    root.setAttribute("data-theme", "light");
  }
}

function saveThemePreference(mode: ThemeMode) {
  try { localStorage.setItem("theme", mode); } catch {}
}

function getThemePreference(): ThemeMode {
  try {
    const saved = localStorage.getItem("theme");
    if (saved === "auto" || saved === "light" || saved === "dark") return saved;
    return "dark";
  } catch {
    return "dark";
  }
}

function isDarkByTime(): boolean {
  const hour = new Date().getHours();
  return hour < 6 || hour >= 19;
}

function resolveTheme(mode: ThemeMode): boolean {
  if (mode === "auto") return isDarkByTime();
  return mode === "dark";
}

export function toggleTheme() {
  const isDark = !document.documentElement.classList.contains("light-theme");
  applyTheme(!isDark);
  saveThemePreference(!isDark ? "dark" : "light");
  window.dispatchEvent(new CustomEvent("theme-changed"));
}

export function cycleThemeMode() {
  const current = getThemePreference();
  let next: ThemeMode;
  if (current === "dark") next = "light";
  else if (current === "light") next = "auto";
  else next = "dark";
  const dark = resolveTheme(next);
  applyTheme(dark);
  saveThemePreference(next);
  window.dispatchEvent(new CustomEvent("theme-changed"));
}

export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(getThemePreference);
  const [isDark, setIsDark] = useState(() => resolveTheme(getThemePreference()));
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const syncFromDom = useCallback(() => {
    setIsDark(!document.documentElement.classList.contains("light-theme"));
  }, []);

  useEffect(() => {
    const dark = resolveTheme(mode);
    setIsDark(dark);
    applyTheme(dark);
    saveThemePreference(mode);
  }, [mode]);

  useEffect(() => {
    if (mode === "auto") {
      timerRef.current = setInterval(() => {
        const dark = isDarkByTime();
        setIsDark(dark);
        applyTheme(dark);
      }, 60_000);
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }
  }, [mode]);

  useEffect(() => {
    window.addEventListener("theme-changed", syncFromDom);
    return () => window.removeEventListener("theme-changed", syncFromDom);
  }, [syncFromDom]);

  function cycleMode() {
    setMode(prev => {
      if (prev === "dark") return "light";
      if (prev === "light") return "auto";
      return "dark";
    });
    window.dispatchEvent(new CustomEvent("theme-changed"));
  }

  const labels: Record<ThemeMode, string> = {
    dark: "מצב כהה",
    light: "מצב בהיר",
    auto: "אוטומטי לפי שעה (06:00-19:00 בהיר)"
  };

  return (
    <button
      onClick={cycleMode}
      className="relative p-2 rounded-lg hover:bg-card/10 text-muted-foreground hover:text-foreground transition-all"
      title={labels[mode]}
      aria-label={labels[mode]}
    >
      <AnimatePresence mode="wait" initial={false}>
        {mode === "auto" ? (
          <motion.div
            key="auto"
            initial={{ rotate: -90, scale: 0, opacity: 0 }}
            animate={{ rotate: 0, scale: 1, opacity: 1 }}
            exit={{ rotate: 90, scale: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
          >
            <Clock className="w-4.5 h-4.5" />
          </motion.div>
        ) : isDark ? (
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
