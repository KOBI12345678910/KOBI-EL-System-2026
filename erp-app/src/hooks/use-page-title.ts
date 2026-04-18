import { useEffect } from "react";
import { useLocation } from "wouter";
import { NAV_ITEMS } from "@/components/layout";

const APP_NAME = "טכנו-כל עוזי";

const NAV_ROUTE_MAP: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const item of NAV_ITEMS) {
    if (item.href) {
      const path = item.href.split("?")[0].replace(/\/$/, "") || "/";
      if (!map[path]) {
        map[path] = item.label;
      }
    }
  }
  return map;
})();

const EXTRA_TITLES: Record<string, string> = {
  "/403": "אין הרשאה",
  "/login": "כניסה למערכת",
  "/forgot-password": "שחזור סיסמה",
  "/reset-password": "איפוס סיסמה",
};

function normalizePath(path: string): string {
  return path.split("?")[0].split("#")[0].replace(/\/$/, "") || "/";
}

const DYNAMIC_SEGMENT_RE = /^[0-9a-f-]{8,}$|^\d+$/i;

function pathToTitle(path: string): string {
  const normalized = normalizePath(path);

  const fromNav = NAV_ROUTE_MAP[normalized];
  if (fromNav) return fromNav;

  const fromExtra = EXTRA_TITLES[normalized];
  if (fromExtra) return fromExtra;

  const parts = normalized.split("/").filter(Boolean);
  if (parts.length === 0) return APP_NAME;

  const meaningfulParts = parts.filter((p) => !DYNAMIC_SEGMENT_RE.test(p));
  const label = meaningfulParts.length > 0
    ? meaningfulParts[meaningfulParts.length - 1]
    : parts[parts.length - 1];

  return label.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function usePageTitle() {
  const [location] = useLocation();

  useEffect(() => {
    const normalized = normalizePath(location);
    if (normalized === "/" || normalized === "") {
      document.title = APP_NAME;
    } else {
      const pageTitle = pathToTitle(location);
      document.title = `${pageTitle} | ${APP_NAME}`;
    }
  }, [location]);
}
