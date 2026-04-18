/**
 * InvoicePrint — דף הדפסת חשבונית A4
 * Route: /invoice/:id/print
 * Auto-triggers window.print() after 1 second
 */

import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface Invoice {
  id: string | number;
  number: string;
  date: string;
  dueDate: string;
  client: { name: string; address: string; taxId: string };
  items: InvoiceItem[];
  subtotal: number;
  vat: number;
  total: number;
  notes: string;
  status: string;
}

const MOCK_INVOICE: Invoice = {
  id: 1,
  number: 'INV-2026-0042',
  date: new Date().toISOString().split('T')[0],
  dueDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
  client: {
    name: 'חברת אלפא בע"מ',
    address: 'רחוב הרצל 12, תל אביב 6812345',
    taxId: '514123456',
  },
  items: [
    { description: 'שירותי ייעוץ הנדסי — ינואר 2026', quantity: 40, unitPrice: 350, total: 14000 },
    { description: 'ניהול פרויקט בניה', quantity: 20, unitPrice: 500, total: 10000 },
    { description: 'ביקורת שטח וסקר', quantity: 3, unitPrice: 1200, total: 3600 },
  ],
  subtotal: 27600,
  vat: 4692,
  total: 32292,
  notes: 'תשלום תוך 30 יום ממועד הוצאת החשבונית. פרטי בנק: בנק הפועלים סניף 123 חשבון 456789.',
  status: 'issued',
};

const PRINT_STYLE = `
  @media print {
    body { margin: 0 !important; }
    .no-print { display: none !important; }
    .invoice-page { box-shadow: none !important; margin: 0 !important; }
  }
  @page { size: A4; margin: 0; }
`;

const fmtMoney = (n: number) =>
  '₪ ' + Number(n || 0).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function InvoicePrint() {
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Attempt to fetch from API; fall back to mock data
    const load = async () => {
      try {
        const res = await fetch(`/api/invoices/${id}`, {
          headers: { 'X-API-Key': localStorage.getItem('ONYX_API_KEY') || '' },
        });
        if (res.ok) {
          const data = await res.json();
          setInvoice(data);
        } else {
          setInvoice({ ...MOCK_INVOICE, id: id || 1, number: `INV-2026-${String(id).padStart(4, '0')}` });
        }
      } catch {
        setInvoice({ ...MOCK_INVOICE, id: id || 1, number: `INV-2026-${String(id).padStart(4, '0')}` });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  useEffect(() => {
    if (!loading && invoice) {
      const timer = setTimeout(() => window.print(), 1000);
      return () => clearTimeout(timer);
    }
  }, [loading, invoice]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'sans-serif', color: '#333' }}>
        <div>טוען חשבונית...</div>
      </div>
    );
  }

  if (!invoice) return null;

  return (
    <>
      <style>{PRINT_STYLE}</style>

      {/* Print button — hidden on print */}
      <div className="no-print" style={{ padding: 16, background: '#f0f0f0', display: 'flex', gap: 10, alignItems: 'center', fontFamily: 'sans-serif' }}>
        <button
          onClick={() => window.print()}
          style={{ padding: '8px 18px', background: '#2B6CB0', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 14 }}
        >
          🖨️ הדפס / שמור PDF
        </button>
        <button
          onClick={() => window.close()}
          style={{ padding: '8px 14px', background: '#fff', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer', fontSize: 14 }}
        >
          סגור
        </button>
        <span style={{ fontSize: 12, color: '#666' }}>הדפסה תתחיל אוטומטית תוך שנייה...</span>
      </div>

      {/* A4 Invoice */}
      <div
        className="invoice-page"
        style={{
          width: 794, minHeight: 1123,
          margin: '0 auto',
          background: '#fff',
          color: '#1a1a1a',
          fontFamily: '-apple-system, "Segoe UI", Arial, Helvetica, sans-serif',
          direction: 'rtl',
          boxShadow: '0 0 20px rgba(0,0,0,0.15)',
          padding: '40px 48px',
          boxSizing: 'border-box',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32, borderBottom: '2px solid #1a365d', paddingBottom: 24 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 40, height: 40, background: '#1a365d', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14, borderRadius: 4 }}>TK</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 18, color: '#1a365d' }}>טכנו-קול אופס בע"מ</div>
                <div style={{ fontSize: 11, color: '#666' }}>ח.פ. 512345678 | מע"מ 512345678</div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: '#444', lineHeight: 1.8 }}>
              <div>רחוב המלאכה 5, תל אביב</div>
              <div>טל: 03-1234567 | info@techno-kol.co.il</div>
            </div>
          </div>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: '#1a365d', marginBottom: 6 }}>חשבונית מס</div>
            <table style={{ fontSize: 12, borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  <td style={{ color: '#666', padding: '2px 0 2px 16px' }}>מספר חשבונית:</td>
                  <td style={{ fontWeight: 700 }}>{invoice.number}</td>
                </tr>
                <tr>
                  <td style={{ color: '#666', padding: '2px 0 2px 16px' }}>תאריך הוצאה:</td>
                  <td>{invoice.date}</td>
                </tr>
                <tr>
                  <td style={{ color: '#666', padding: '2px 0 2px 16px' }}>תאריך פירעון:</td>
                  <td style={{ color: '#c53030', fontWeight: 600 }}>{invoice.dueDate}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Client info */}
        <div style={{ marginBottom: 32, background: '#f7fafc', padding: 16, borderRadius: 6, borderRight: '4px solid #1a365d' }}>
          <div style={{ fontSize: 11, color: '#666', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.1em' }}>לכבוד</div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{invoice.client.name}</div>
          <div style={{ fontSize: 12, color: '#444' }}>{invoice.client.address}</div>
          <div style={{ fontSize: 12, color: '#444' }}>ח.פ. / ע.מ.: {invoice.client.taxId}</div>
        </div>

        {/* Items table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24 }}>
          <thead>
            <tr style={{ background: '#1a365d', color: '#fff' }}>
              {['תיאור', 'כמות', 'מחיר יחידה', 'סה"כ'].map((h, i) => (
                <th key={h} style={{
                  padding: '10px 12px', textAlign: i === 0 ? 'right' : 'center',
                  fontSize: 12, fontWeight: 600, letterSpacing: '0.05em',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item, idx) => (
              <tr key={idx} style={{ background: idx % 2 === 0 ? '#fff' : '#f7fafc', borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '10px 12px', fontSize: 13 }}>{item.description}</td>
                <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 13 }}>{item.quantity}</td>
                <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 13 }}>{fmtMoney(item.unitPrice)}</td>
                <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 13, fontWeight: 600 }}>{fmtMoney(item.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
          <table style={{ borderCollapse: 'collapse', minWidth: 260 }}>
            <tbody>
              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '8px 16px', color: '#666', fontSize: 13 }}>סכום לפני מע"מ:</td>
                <td style={{ padding: '8px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600 }}>{fmtMoney(invoice.subtotal)}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '8px 16px', color: '#666', fontSize: 13 }}>מע"מ 18%:</td>
                <td style={{ padding: '8px 16px', textAlign: 'left', fontSize: 13 }}>{fmtMoney(invoice.vat)}</td>
              </tr>
              <tr style={{ background: '#1a365d', color: '#fff' }}>
                <td style={{ padding: '12px 16px', fontSize: 15, fontWeight: 700 }}>סה"כ לתשלום:</td>
                <td style={{ padding: '12px 16px', textAlign: 'left', fontSize: 16, fontWeight: 800 }}>{fmtMoney(invoice.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Notes */}
        {invoice.notes && (
          <div style={{ marginTop: 32, padding: 16, background: '#fffbeb', borderRadius: 6, border: '1px solid #f6d860' }}>
            <div style={{ fontSize: 11, color: '#744210', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase' }}>הערות</div>
            <div style={{ fontSize: 12, color: '#5D4037', lineHeight: 1.7 }}>{invoice.notes}</div>
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: 40, paddingTop: 16, borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, color: '#999' }}>
          <div>הופק באמצעות מערכת טכנו-קול אופס 2026</div>
          <div>{invoice.number} | עמוד 1 מתוך 1</div>
        </div>
      </div>
    </>
  );
}

export default InvoicePrint;
