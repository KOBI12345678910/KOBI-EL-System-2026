import React, { useState } from 'react';

interface WorkOrder {
  name: string;
}

interface Template {
  id: string;
  icon: string;
  name: string;
  duration: number;
  costMin: number;
  costMax: number;
  workOrders: WorkOrder[];
  materials: string[];
  milestones: string[];
}

const TEMPLATES: Template[] = [
  {
    id: 'iron-railing-apt',
    icon: '🔩',
    name: 'מעקות ברזל — דירה',
    duration: 5,
    costMin: 3000,
    costMax: 6000,
    workOrders: [
      { name: 'מדידה' },
      { name: 'ייצור מפעל' },
      { name: 'התקנה' },
      { name: 'גמר' },
    ],
    materials: ['פרופיל 40×40', 'תפסנים', 'ברגים', 'אבקה שחורה'],
    milestones: ['מדידה', 'ייצור', 'התקנה', 'מסירה'],
  },
  {
    id: 'aluminum-railing-building',
    icon: '🪟',
    name: 'מעקה אלומיניום — בניין',
    duration: 7,
    costMin: 5000,
    costMax: 12000,
    workOrders: [
      { name: 'מדידה' },
      { name: 'ייצור' },
      { name: 'אנודייז' },
      { name: 'התקנה' },
    ],
    materials: ['פרופיל אלומיניום', 'מחברים'],
    milestones: ['מדידה', 'ייצור', 'אנודייז', 'התקנה', 'מסירה'],
  },
  {
    id: 'electric-gate',
    icon: '🚪',
    name: 'שער כניסה חשמלי',
    duration: 10,
    costMin: 8000,
    costMax: 20000,
    workOrders: [
      { name: 'תכנון' },
      { name: 'ייצור' },
      { name: 'חשמל' },
      { name: 'התקנה' },
    ],
    materials: ['פרופיל 60×60', 'מנוע', 'שלט', 'מגע'],
    milestones: ['תכנון', 'ייצור', 'חשמל', 'התקנה', 'מסירה'],
  },
  {
    id: 'pergola',
    icon: '🌿',
    name: 'פרגולה',
    duration: 6,
    costMin: 4000,
    costMax: 15000,
    workOrders: [
      { name: 'מדידה' },
      { name: 'עיצוב' },
      { name: 'ייצור' },
      { name: 'התקנה' },
    ],
    materials: ['פרופיל אלומיניום', 'לוחות גג', 'ברגים', 'אנקרים'],
    milestones: ['מדידה', 'עיצוב', 'ייצור', 'התקנה', 'מסירה'],
  },
  {
    id: 'security-fence-factory',
    icon: '🏗️',
    name: 'גדר ביטחון — מפעל',
    duration: 14,
    costMin: 15000,
    costMax: 50000,
    workOrders: [
      { name: 'תכנון' },
      { name: 'ייצור עמודים' },
      { name: 'ייצור פאנלים' },
      { name: 'התקנה' },
    ],
    materials: ['עמודי פלדה', 'רשת גדר', 'בטון', 'אנקרים'],
    milestones: ['תכנון', 'ייצור', 'יציקה', 'התקנה', 'מסירה'],
  },
  {
    id: 'glass-railing-balcony',
    icon: '🪞',
    name: 'מעקה זכוכית — מרפסת',
    duration: 5,
    costMin: 6000,
    costMax: 18000,
    workOrders: [
      { name: 'מדידה' },
      { name: 'הזמנת זכוכית' },
      { name: 'ייצור מסגרת' },
      { name: 'התקנה' },
    ],
    materials: ['זכוכית מחוסמת', 'פרופיל אלומיניום', 'קיבועים', 'סיליקון'],
    milestones: ['מדידה', 'הזמנה', 'ייצור', 'התקנה', 'מסירה'],
  },
  {
    id: 'window-bars',
    icon: '🔒',
    name: 'סורגים — חלונות',
    duration: 3,
    costMin: 1500,
    costMax: 5000,
    workOrders: [
      { name: 'מדידה' },
      { name: 'ייצור' },
      { name: 'התקנה' },
    ],
    materials: ['פרופיל ברזל', 'ברגי עיגון', 'צבע אנטי-חלודה'],
    milestones: ['מדידה', 'ייצור', 'התקנה', 'מסירה'],
  },
  {
    id: 'field-fence',
    icon: '🚧',
    name: 'גדר שדה',
    duration: 7,
    costMin: 5000,
    costMax: 25000,
    workOrders: [
      { name: 'סימון' },
      { name: 'יציקת עמודים' },
      { name: 'הרכבת גדר' },
      { name: 'שערים' },
    ],
    materials: ['עמודי שדה', 'רשת תיל', 'בטון', 'שערי כניסה'],
    milestones: ['סימון', 'עמודים', 'גדר', 'שערים', 'מסירה'],
  },
];

interface FormState {
  customerName: string;
  startDate: string;
  lengthM: number;
  heightM: number;
}

export default function ProjectTemplates() {
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [showNewTemplateForm, setShowNewTemplateForm] = useState(false);
  const [form, setForm] = useState<FormState>({
    customerName: '',
    startDate: new Date().toISOString().split('T')[0],
    lengthM: 1,
    heightM: 1,
  });
  const [creating, setCreating] = useState(false);
  const [success, setSuccess] = useState('');

  const endDate = selectedTemplate
    ? new Date(
        new Date(form.startDate).getTime() + selectedTemplate.duration * 24 * 60 * 60 * 1000
      )
        .toISOString()
        .split('T')[0]
    : '';

  const quantity = Math.ceil(form.lengthM * form.heightM);

  async function handleCreate() {
    if (!selectedTemplate) return;
    setCreating(true);
    try {
      await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${selectedTemplate.name} — ${form.customerName}`,
          customer_name: form.customerName,
          template_id: selectedTemplate.id,
          start_date: form.startDate,
          end_date: endDate,
          work_orders: selectedTemplate.workOrders.map((wo, i) => ({
            name: wo.name,
            order: i + 1,
            materials: selectedTemplate.materials.map(m => ({ name: m, quantity })),
          })),
          milestones: selectedTemplate.milestones,
          dimensions: { length: form.lengthM, height: form.heightM },
        }),
      });
      setSuccess(`פרויקט "${selectedTemplate.name}" נוצר בהצלחה!`);
      setSelectedTemplate(null);
      setForm({ customerName: '', startDate: new Date().toISOString().split('T')[0], lengthM: 1, heightM: 1 });
    } catch {
      alert('שגיאה ביצירת הפרויקט');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={{ padding: 24, direction: 'rtl', fontFamily: 'Segoe UI, Arial, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>תבניות פרויקטים</h2>
        <button
          onClick={() => setShowNewTemplateForm(true)}
          style={{
            padding: '8px 16px', background: '#2563eb', color: '#fff',
            border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600,
          }}
        >
          + תבנית חדשה
        </button>
      </div>

      {success && (
        <div style={{
          background: '#d1fae5', border: '1px solid #6ee7b7', borderRadius: 8,
          padding: '12px 16px', marginBottom: 20, color: '#065f46', fontWeight: 600,
        }}>
          ✅ {success}
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: 16,
      }}>
        {TEMPLATES.map(t => (
          <div key={t.id} style={{
            background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12,
            padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>{t.icon}</div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{t.name}</div>
            <div style={{ color: '#6b7280', fontSize: 13, marginBottom: 12 }}>
              <span style={{ marginLeft: 12 }}>⏱ {t.duration} ימי עבודה</span>
              <span>₪{t.costMin.toLocaleString()}–{t.costMax.toLocaleString()}</span>
            </div>
            <div style={{ fontSize: 12, color: '#374151', marginBottom: 12 }}>
              <strong>{t.workOrders.length} הזמנות עבודה:</strong>{' '}
              {t.workOrders.map(wo => wo.name).join(' · ')}
            </div>
            <button
              onClick={() => { setSelectedTemplate(t); setSuccess(''); }}
              style={{
                width: '100%', padding: '8px 0', background: '#eff6ff',
                color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: 8,
                cursor: 'pointer', fontWeight: 600, fontSize: 13,
              }}
            >
              📋 השתמש בתבנית
            </button>
          </div>
        ))}
      </div>

      {/* Create from template modal */}
      {selectedTemplate && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: '#fff', borderRadius: 16, padding: 32, width: 480, maxWidth: '90vw',
            maxHeight: '90vh', overflowY: 'auto', direction: 'rtl',
          }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 18 }}>
              {selectedTemplate.icon} צור פרויקט מתבנית — {selectedTemplate.name}
            </h3>

            <label style={{ display: 'block', marginBottom: 16 }}>
              <span style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>לקוח</span>
              <input
                value={form.customerName}
                onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))}
                placeholder="שם הלקוח"
                style={{
                  display: 'block', width: '100%', marginTop: 4, padding: '8px 12px',
                  border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, boxSizing: 'border-box',
                }}
              />
            </label>

            <label style={{ display: 'block', marginBottom: 16 }}>
              <span style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>תאריך התחלה</span>
              <input
                type="date"
                value={form.startDate}
                onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                style={{
                  display: 'block', width: '100%', marginTop: 4, padding: '8px 12px',
                  border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, boxSizing: 'border-box',
                }}
              />
            </label>

            {endDate && (
              <div style={{
                background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8,
                padding: '8px 12px', marginBottom: 16, fontSize: 13, color: '#166534',
              }}>
                תאריך סיום מחושב: <strong>{endDate}</strong> ({selectedTemplate.duration} ימים)
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              <label style={{ flex: 1 }}>
                <span style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>אורך (מ׳)</span>
                <input
                  type="number" min={0.1} step={0.1}
                  value={form.lengthM}
                  onChange={e => setForm(f => ({ ...f, lengthM: parseFloat(e.target.value) || 1 }))}
                  style={{
                    display: 'block', width: '100%', marginTop: 4, padding: '8px 12px',
                    border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, boxSizing: 'border-box',
                  }}
                />
              </label>
              <label style={{ flex: 1 }}>
                <span style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>גובה (מ׳)</span>
                <input
                  type="number" min={0.1} step={0.1}
                  value={form.heightM}
                  onChange={e => setForm(f => ({ ...f, heightM: parseFloat(e.target.value) || 1 }))}
                  style={{
                    display: 'block', width: '100%', marginTop: 4, padding: '8px 12px',
                    border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, boxSizing: 'border-box',
                  }}
                />
              </label>
            </div>

            <div style={{
              background: '#f9fafb', borderRadius: 8, padding: 12, marginBottom: 20, fontSize: 13,
            }}>
              <strong>חומרים ({quantity} יח׳):</strong>{' '}
              {selectedTemplate.materials.join(', ')}
              <div style={{ marginTop: 6 }}>
                <strong>עבודות:</strong>{' '}
                {selectedTemplate.workOrders.map(wo => wo.name).join(' → ')}
              </div>
              <div style={{ marginTop: 6 }}>
                <strong>אבני דרך:</strong>{' '}
                {selectedTemplate.milestones.join(' → ')}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={handleCreate}
                disabled={creating || !form.customerName}
                style={{
                  flex: 1, padding: '10px 0', background: creating ? '#9ca3af' : '#16a34a',
                  color: '#fff', border: 'none', borderRadius: 8, cursor: creating ? 'not-allowed' : 'pointer',
                  fontWeight: 700, fontSize: 14,
                }}
              >
                {creating ? 'יוצר...' : '✅ צור פרויקט'}
              </button>
              <button
                onClick={() => setSelectedTemplate(null)}
                style={{
                  flex: 1, padding: '10px 0', background: '#f3f4f6',
                  color: '#374151', border: '1px solid #d1d5db', borderRadius: 8,
                  cursor: 'pointer', fontWeight: 600, fontSize: 14,
                }}
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New custom template modal */}
      {showNewTemplateForm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: '#fff', borderRadius: 16, padding: 32, width: 480, maxWidth: '90vw',
            direction: 'rtl',
          }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 18 }}>+ תבנית חדשה</h3>
            <p style={{ color: '#6b7280', fontSize: 14 }}>
              יצירת תבניות מותאמות אישית — בפיתוח. בינתיים ניתן להשתמש ב-8 התבניות הקיימות.
            </p>
            <button
              onClick={() => setShowNewTemplateForm(false)}
              style={{
                padding: '8px 20px', background: '#f3f4f6', border: '1px solid #d1d5db',
                borderRadius: 8, cursor: 'pointer', fontWeight: 600,
              }}
            >
              סגור
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
