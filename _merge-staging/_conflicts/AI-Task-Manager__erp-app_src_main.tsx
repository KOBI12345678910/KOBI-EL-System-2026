import { createRoot } from "react-dom/client";
import { useEffect } from "react";
import App from "./App";
import "./index.css";
import { initSentry } from "./lib/sentry";
import { startPeriodicSync, enqueueMutation } from "./lib/sync-manager";
import { getCachedCustomers, getCachedProducts, getCachedPriceLists } from "./lib/offline-db";
import { registerOfflineReadFallback, registerOfflineMutationQueue } from "./lib/utils";

function showStaticErrorFallback(message: string) {
  const existing = document.getElementById("global-error-fallback");
  if (existing) return;
  const el = document.createElement("div");
  el.id = "global-error-fallback";
  el.setAttribute("dir", "rtl");
  el.style.cssText = [
    "position:fixed", "inset:0", "z-index:99999",
    "display:flex", "flex-direction:column", "align-items:center", "justify-content:center",
    "gap:16px", "padding:32px", "text-align:center",
    "background:#fff", "font-family:system-ui,sans-serif",
  ].join(";");
  el.innerHTML = `
    <div style="width:56px;height:56px;border-radius:16px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2);display:flex;align-items:center;justify-content:center;font-size:28px">⚠️</div>
    <div>
      <p style="font-weight:600;font-size:18px;margin:0 0 6px">אירעה שגיאה בהפעלת האפליקציה</p>
      <p style="font-size:13px;color:#6b7280;max-width:320px;margin:0">${message}</p>
    </div>
    <button onclick="window.location.reload()" style="padding:10px 20px;border-radius:8px;border:1px solid #d1d5db;background:#f9fafb;cursor:pointer;font-size:14px">🔄 נסה שוב</button>
  `;
  document.body.appendChild(el);
}

window.onerror = (_msg, _src, _line, _col, err) => {
  const message = err instanceof Error ? err.message : String(_msg);
  console.error("[GlobalErrorHandler] Uncaught error:", message);
  showStaticErrorFallback(message || "שגיאה לא צפויה");
  return false;
};

window.onunhandledrejection = (event: PromiseRejectionEvent) => {
  const reason = event.reason instanceof Error ? event.reason.message : String(event.reason ?? "");
  console.error("[GlobalErrorHandler] Unhandled rejection:", reason);
  if (reason && !reason.includes("ResizeObserver") && !reason.includes("Non-Error")) {
    showStaticErrorFallback(reason || "שגיאה לא צפויה");
  }
};

const VITE_API_URL = import.meta.env.VITE_API_URL;
if (VITE_API_URL !== undefined && !VITE_API_URL) {
  console.error("[Startup] VITE_API_URL is set but empty. API calls may fail.");
}

function dismissAppLoader() {
  const loader = document.getElementById("app-loader");
  if (!loader) return;
  loader.style.transition = "opacity 0.3s ease";
  loader.style.opacity = "0";
  setTimeout(() => loader.remove(), 300);
}

function Root() {
  useEffect(() => {
    dismissAppLoader();
  }, []);
  return <App />;
}

initSentry();

if ("serviceWorker" in navigator) {
  registerOfflineMutationQueue(enqueueMutation);

  registerOfflineReadFallback(/\/api\/customers(\?.*)?$/, getCachedCustomers);
  registerOfflineReadFallback(/\/api\/products(\?.*)?$/, getCachedProducts);
  registerOfflineReadFallback(/\/api\/price-lists(\?.*)?$/, getCachedPriceLists);

  startPeriodicSync();
}

createRoot(document.getElementById("root")!).render(<Root />);
