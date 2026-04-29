import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useStore } from '../store/useStore';

const NAV = [
  { path: '/', label: 'דשבורד', icon: '⬛', section: 'מרכז פיקוד' },
  { path: '/situation', label: 'תמונת מצב', icon: '🎯', section: 'מרכז פיקוד' },
  { path: '/data-flow', label: 'זרימת נתונים', icon: '🌊', section: 'מרכז פיקוד' },
  { path: '/project-analysis', label: 'ניתוח פרויקטים AI', icon: '🎯', section: 'מרכז פיקוד' },
  { path: '/supply-chain', label: 'שרשרת אספקה', icon: '🔗', section: 'מרכז פיקוד' },
  { path: '/intelligence', label: 'Intelligence AI', icon: '🧠', section: 'מרכז פיקוד' },
  { path: '/pipeline', label: 'פרוייקטים', icon: '📋', section: 'מרכז פיקוד' },
  { path: '/map', label: 'מפה חיה', icon: '🗺️', section: 'מרכז פיקוד' },
  { path: '/documents', label: 'מסמכים וחתימות', icon: '✍️', section: 'מרכז פיקוד' },
  { path: '/document-management', label: 'DMS — ניהול מסמכים', icon: '📁', section: 'מרכז פיקוד' },
  { path: '/mobile', label: 'Mobile Preview', icon: '📱', section: 'מרכז פיקוד' },
  { path: '/work-orders', label: 'הזמנות עבודה', icon: '📋', section: 'ייצור' },
  { path: '/production', label: 'ריצפת ייצור', icon: '🏭', section: 'ייצור' },
  { path: '/procurement', label: 'רכש היפר-אינטליגנטי', icon: '🧬', section: 'חומרים' },
  { path: '/purchasing', label: 'רכש · חומרי גלם · מוצרים', icon: '🛒', section: 'חומרים' },
  { path: '/materials', label: 'מחסן', icon: '📦', section: 'חומרים' },
  { path: '/inventory-alerts', label: 'התראות מלאי', icon: '📦', section: 'חומרים' },
  { path: '/qr-generator', label: 'מחולל QR', icon: '📲', section: 'חומרים' },
  { path: '/employees', label: 'עובדים', icon: '👥', section: 'כוח אדם' },
  { path: '/hr-autonomy', label: 'HR אוטונומי', icon: '🤖', section: 'כוח אדם' },
  { path: '/hours', label: 'שעות וחופשות', icon: '⏱️', section: 'כוח אדם' },
  { path: '/schedule', label: 'סידור עבודה', icon: '📅', section: 'כוח אדם' },
  { path: '/clients', label: 'לקוחות', icon: '🤝', section: 'פיננסים' },
  { path: '/finance', label: 'כספים', icon: '💰', section: 'פיננסים' },
  { path: '/financial-autonomy', label: 'פיננסים אוטונומיים (FAE)', icon: '🧮', section: 'פיננסים' },
  { path: '/reports', label: 'מרכז דוחות', icon: '📊', section: 'דוחות' },
  { path: '/reports/payroll', label: 'דוח שכר', icon: '💰', section: 'דוחות' },
  { path: '/reports/projects', label: 'דוח פרויקטים', icon: '📋', section: 'דוחות' },
  { path: '/alerts', label: 'התראות', icon: '🔔', section: 'מערכת' },
  { path: '/alerts-intel', label: 'התראות חכמות (IAS v2)', icon: '🧠', section: 'מערכת' },
  { path: '/control-room/operations', label: 'חדר בקרה תפעולי', icon: '🏗️', section: 'חדרי בקרה' },
  { path: '/control-room/procurement', label: 'חדר בקרה רכש', icon: '📦', section: 'חדרי בקרה' },
  { path: '/control-room/workforce', label: 'חדר בקרה כוח אדם', icon: '👷', section: 'חדרי בקרה' },
  // Master 360 — surfaces the 15 Master Flow detail-pages (CLAUDE.md: No Dead Pages).
  // Routes point to existing list pages (drill into 360 on row-click) or to /:type/1 sample detail
  // for entities without a list page yet. All 15 360s become reachable from the sidebar.
  { path: '/clients', label: 'לקוחות 360', icon: '🤝', section: 'מאסטר 360' },
  { path: '/quote/1', label: 'הצעות מחיר 360', icon: '📄', section: 'מאסטר 360' },
  { path: '/order/1', label: 'הזמנות 360', icon: '🛒', section: 'מאסטר 360' },
  { path: '/lead/1', label: 'לידים 360', icon: '📥', section: 'מאסטר 360' },
  { path: '/pipeline', label: 'פרויקטים 360', icon: '📋', section: 'מאסטר 360' },
  { path: '/work-orders', label: 'הוראות עבודה 360', icon: '🛠️', section: 'מאסטר 360' },
  { path: '/supplier/1', label: 'ספקים 360', icon: '🚚', section: 'מאסטר 360' },
  { path: '/rfq/1', label: 'בקשות הצעה 360', icon: '❓', section: 'מאסטר 360' },
  { path: '/po/1', label: 'הזמנות רכש 360', icon: '🛍️', section: 'מאסטר 360' },
  { path: '/materials', label: 'מלאי 360', icon: '📦', section: 'מאסטר 360' },
  { path: '/finance', label: 'פיננסי 360', icon: '💵', section: 'מאסטר 360' },
  { path: '/payment/1', label: 'תשלומים 360', icon: '💳', section: 'מאסטר 360' },
  { path: '/employees', label: 'עובדים 360', icon: '👤', section: 'מאסטר 360' },
  { path: '/delivery/1', label: 'משלוחים 360', icon: '🚛', section: 'מאסטר 360' },
  { path: '/project/1/closure', label: 'סגירת פרויקטים 360', icon: '✅', section: 'מאסטר 360' },
];

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { sidebarOpen, snapshot } = useStore();

  if (!sidebarOpen) return null;

  const sections = [...new Set(NAV.map(n => n.section))];

  return (
    <div
      role="navigation"
      aria-label="ניווט ראשי"
      style={{
      width: 240,
      background: '#1C2127',
      borderRight: '1px solid rgba(255,255,255,0.1)',
      position: 'fixed',
      top: 48, left: 0, bottom: 0,
      overflowY: 'auto',
      zIndex: 99,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    }}>
      {sections.map(section => (
        <div key={section} style={{ marginBottom: 8 }}>
          <div style={{
            padding: '12px 16px 4px',
            fontSize: 10,
            color: '#5C7080',
            letterSpacing: '0.15em',
            fontWeight: 600,
            textTransform: 'uppercase'
          }}>
            {section}
          </div>
          {NAV.filter(n => n.section === section).map(item => {
            const active = location.pathname === item.path;
            const isAlerts = item.path === '/alerts';
            const alertCount = snapshot?.openAlerts.filter(a => !a.is_resolved).length || 0;

            return (
              <div
                key={item.path}
                onClick={() => navigate(item.path)}
                tabIndex={0}
                aria-current={active ? 'page' : undefined}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(item.path); } }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 16px',
                  cursor: 'pointer',
                  background: active ? 'rgba(255,165,0,0.1)' : 'transparent',
                  borderLeft: active ? '2px solid #FFA500' : '2px solid transparent',
                  color: active ? '#FFA500' : '#ABB3BF',
                  fontSize: 13,
                  transition: 'all 0.1s',
                  userSelect: 'none',
                }}
                onMouseEnter={e => {
                  if (!active) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.05)';
                }}
                onMouseLeave={e => {
                  if (!active) (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                }}
              >
                <span style={{ fontSize: 12 }}>{item.icon}</span>
                <span style={{ flex: 1 }}>{item.label}</span>
                {isAlerts && alertCount > 0 && (
                  <span style={{
                    background: '#FC8585', color: '#fff',
                    fontSize: 9, padding: '1px 5px', borderRadius: 2, fontWeight: 600
                  }}>
                    {alertCount}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default Sidebar;
