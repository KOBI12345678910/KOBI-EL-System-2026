import React from 'react';
import { useNavigate } from 'react-router-dom';

const REPORT_CARDS = [
  {
    path: '/reports/payroll',
    icon: '💰',
    title: 'דוח שכר',
    description: 'דוח שכר חודשי מפורט — ברוטו, ניכויים, נטו לכל עובד עם סיכומים',
    color: '#4a9eff',
  },
  {
    path: '/reports/projects',
    icon: '📋',
    title: 'דוח פרויקטים',
    description: 'סטטוס פרויקטים, תקציב מול ביצוע, תאריכי התחלה וסיום ולקוחות',
    color: '#3fb950',
  },
  {
    path: '/reports/suppliers',
    icon: '🏭',
    title: 'דוח ספקים',
    description: 'ספקים ממוינים לפי נפח רכישות, זמן אספקה וציון ביצועים',
    color: '#d29922',
  },
];

export function Reports() {
  const navigate = useNavigate();

  return (
    <div style={{ direction: 'rtl', fontFamily: '-apple-system, "Segoe UI", Heebo, Arial, sans-serif', padding: 24 }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: '#F6F7F9' }}>📊 מרכז דוחות</h1>
        <p style={{ margin: '6px 0 0', color: '#5C7080', fontSize: 14 }}>
          הפקת דוחות מקצועיים, ייצוא PDF וCSV לכל מודולי המערכת
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
        {REPORT_CARDS.map(card => (
          <div
            key={card.path}
            onClick={() => navigate(card.path)}
            style={{
              background: '#2F343C',
              border: `1px solid rgba(255,255,255,0.08)`,
              borderRadius: 8,
              padding: 24,
              cursor: 'pointer',
              transition: 'all 0.15s',
              borderTop: `3px solid ${card.color}`,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#383E47')}
            onMouseLeave={e => (e.currentTarget.style.background = '#2F343C')}
          >
            <div style={{ fontSize: 32, marginBottom: 12 }}>{card.icon}</div>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: '#F6F7F9' }}>{card.title}</h3>
            <p style={{ margin: 0, fontSize: 13, color: '#5C7080', lineHeight: 1.6 }}>{card.description}</p>
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 6, color: card.color, fontSize: 13 }}>
              <span>פתח דוח</span>
              <span>←</span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 40, background: '#2F343C', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 24 }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 600, color: '#F6F7F9' }}>💡 טיפ: הורדת PDF</h3>
        <p style={{ margin: 0, fontSize: 13, color: '#5C7080', lineHeight: 1.6 }}>
          בכל דוח תמצא כפתורי "הדפס" ו"הורד PDF" — לחץ עליהם כדי לפתוח את דיאלוג ההדפסה של הדפדפן.
          בחר "שמור כ-PDF" כיעד ההדפסה לקבלת קובץ PDF נקי ומקצועי.
        </p>
      </div>
    </div>
  );
}

export default Reports;
