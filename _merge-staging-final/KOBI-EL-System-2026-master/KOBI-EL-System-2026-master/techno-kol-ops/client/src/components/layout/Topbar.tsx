import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";

const NAV = [
  { path: '/', label: 'דשבורד' },
  { path: '/situation', label: 'תמונת מצב' },
  { path: '/data-flow', label: 'זרימת נתונים' },
  { path: '/project-analysis', label: 'ניתוח פרויקטים AI' },
  { path: '/supply-chain', label: 'שרשרת אספקה' },
  { path: '/intelligence', label: 'Intelligence AI' },
  { path: '/pipeline', label: 'פרוייקטים' },
  { path: '/map', label: 'מפה חיה' },
  { path: '/documents', label: 'מסמכים וחתימות' },
  { path: '/document-management', label: 'DMS — ניהול מסמכים' },
  { path: '/mobile', label: 'Mobile Preview' },
  { path: '/work-orders', label: 'הזמנות עבודה' },
  { path: '/production', label: 'ריצפת ייצור' },
  { path: '/procurement', label: 'רכש היפר-אינטליגנטי' },
  { path: '/purchasing', label: 'רכש · חומרי גלם · מוצרים' },
  { path: '/materials', label: 'מחסן' },
  { path: '/employees', label: 'עובדים' },
  { path: '/hr-autonomy', label: 'HR אוטונומי' },
  { path: '/hours', label: 'שעות וחופשות' },
  { path: '/clients', label: 'לקוחות' },
  { path: '/finance', label: 'כספים' },
  { path: '/financial-autonomy', label: 'פיננסים אוטונומיים (FAE)' },
  { path: '/alerts', label: 'התראות' },
  { path: '/alerts-intel', label: 'התראות חכמות (IAS v2)' },
  { path: '/control-room/operations', label: 'חדר בקרה תפעולי' },
  { path: '/control-room/procurement', label: 'חדר בקרה רכש' },
  { path: '/control-room/workforce', label: 'חדר בקרה כוח אדם' },
];

function useCurrentTime() {
  const [time, setTime] = useState<string>(() =>
    new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  );
  useEffect(() => {
    const id = setInterval(() => {
      setTime(new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }, 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

function useServerStatus() {
  const [connected, setConnected] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function ping() {
      try {
        const res = await fetch('/health', { method: 'GET', cache: 'no-store' });
        if (!cancelled) setConnected(res.ok);
      } catch {
        if (!cancelled) setConnected(false);
      }
    }
    ping();
    const id = setInterval(ping, 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);
  return connected;
}

export const Topbar: React.FC = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const time = useCurrentTime();
  const connected = useServerStatus();

  const pageLabel =
    NAV.find(n => n.path === location.pathname)?.label ?? 'מרכז בקרה';

  const dotColor =
    connected === null ? '#6B7280' : connected ? '#22C55E' : '#EF4444';
  const dotTitle =
    connected === null ? 'בודק חיבור...' : connected ? 'מחובר לשרת' : 'מנותק מהשרת';

  return (
    <header
      className="h-14 bg-[#1f2937] flex items-center justify-between px-4 border-b border-gray-700/50 shrink-0"
      role="banner"
      aria-label="פס עליון"
    >
      {/* Left: page title */}
      <div className="flex items-center gap-3">
        <div className="font-semibold text-sm tracking-wide text-white">
          {pageLabel}
        </div>
        <span className="text-[11px] text-gray-500 hidden sm:block">
          מרכז בקרה — טכנו-קול עוזי
        </span>
      </div>

      {/* Right: time, server status, user, logout */}
      <div className="flex items-center gap-3">
        {/* Clock */}
        <span
          className="text-xs text-gray-400 font-mono tabular-nums"
          dir="ltr"
          title="שעון מקומי"
        >
          {time}
        </span>

        {/* Server status */}
        <span
          className="flex items-center gap-1 text-[11px] text-gray-400 cursor-default"
          title={dotTitle}
        >
          <span
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: dotColor,
              boxShadow: connected ? `0 0 6px ${dotColor}` : 'none',
            }}
          />
          חיבור לשרת
        </span>

        {user?.role && (
          <span className="text-[10px] px-2 py-0.5 rounded bg-blue-600/20 text-blue-300 uppercase tracking-wider">
            {user.role}
          </span>
        )}
        <span className="text-sm text-gray-300">{user?.email ?? user?.username}</span>
        <button
          onClick={logout}
          className="bg-red-600/80 hover:bg-red-600 px-3 py-1 rounded text-xs font-medium transition-colors"
          aria-label="יציאה מהמערכת"
        >
          יציאה
        </button>
      </div>
    </header>
  );
};
