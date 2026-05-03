import React from 'react';

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export interface InvoiceData {
  invoice_number: string;
  invoice_date: string;
  due_date?: string;
  customer_name: string;
  customer_address?: string;
  customer_id?: string;
  items: InvoiceLineItem[];
  notes?: string;
}

const VAT_RATE = 0.18;

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(n || 0);
}

export default function InvoicePrintTemplate({ invoice }: { invoice: InvoiceData }) {
  const subtotal = invoice.items.reduce((sum, item) => sum + item.total, 0);
  const vat = subtotal * VAT_RATE;
  const grandTotal = subtotal + vat;

  return (
    <div style={styles.page} className="invoice-print-template">
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.companyBlock}>
          <div style={styles.companyName}>טכנו כל עוזי בע"מ</div>
          <div style={styles.companyDetail}>ע.מ 514XXXXXX</div>
          <div style={styles.companyDetail}>רחוב הדוגמה 1, תל אביב</div>
          <div style={styles.companyDetail}>טל: 03-0000000</div>
        </div>
        <div style={styles.invoiceTitleBlock}>
          <div style={styles.invoiceTitle}>חשבונית מס</div>
          <div style={styles.invoiceMeta}>מספר: {invoice.invoice_number}</div>
          <div style={styles.invoiceMeta}>תאריך: {invoice.invoice_date}</div>
          {invoice.due_date && <div style={styles.invoiceMeta}>לתשלום עד: {invoice.due_date}</div>}
        </div>
      </div>

      <hr style={styles.divider} />

      {/* Customer */}
      <div style={styles.customerBlock}>
        <div style={styles.sectionLabel}>לכבוד:</div>
        <div style={styles.customerName}>{invoice.customer_name}</div>
        {invoice.customer_address && <div>{invoice.customer_address}</div>}
        {invoice.customer_id && <div>ח.פ / ת.ז: {invoice.customer_id}</div>}
      </div>

      {/* Line items table */}
      <table style={styles.table}>
        <thead>
          <tr style={styles.tableHeaderRow}>
            <th style={{ ...styles.th, width: '50%' }}>תיאור</th>
            <th style={styles.th}>כמות</th>
            <th style={styles.th}>מחיר יחידה</th>
            <th style={styles.th}>סה"כ</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((item, idx) => (
            <tr key={idx} style={idx % 2 === 0 ? styles.trEven : styles.trOdd}>
              <td style={styles.td}>{item.description}</td>
              <td style={{ ...styles.td, textAlign: 'center' }}>{item.quantity}</td>
              <td style={{ ...styles.td, textAlign: 'start' }}>{fmtMoney(item.unit_price)}</td>
              <td style={{ ...styles.td, textAlign: 'start' }}>{fmtMoney(item.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div style={styles.totalsBlock}>
        <table style={styles.totalsTable}>
          <tbody>
            <tr>
              <td style={styles.totalLabel}>סכום לפני מע"מ:</td>
              <td style={styles.totalValue}>{fmtMoney(subtotal)}</td>
            </tr>
            <tr>
              <td style={styles.totalLabel}>מע"מ (18%):</td>
              <td style={styles.totalValue}>{fmtMoney(vat)}</td>
            </tr>
            <tr style={styles.grandTotalRow}>
              <td style={styles.totalLabel}>סה"כ לתשלום:</td>
              <td style={styles.totalValue}>{fmtMoney(grandTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Payment terms */}
      <div style={styles.paymentTerms}>
        <strong>תנאי תשלום:</strong> שוטף + 30 יום
      </div>

      {invoice.notes && (
        <div style={styles.notes}>
          <strong>הערות:</strong> {invoice.notes}
        </div>
      )}

      {/* Print button — hidden when printing */}
      <div style={styles.printBtnRow} className="no-print">
        <button
          onClick={() => window.print()}
          style={styles.printBtn}
        >
          הדפס / שמור PDF
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    direction: 'rtl',
    fontFamily: 'Arial, sans-serif',
    maxWidth: 800,
    margin: '0 auto',
    padding: 32,
    background: '#fff',
    color: '#000',
    fontSize: 14,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  companyBlock: { textAlign: 'end' },
  companyName: { fontSize: 22, fontWeight: 700, marginBottom: 4 },
  companyDetail: { fontSize: 13, color: '#444' },
  invoiceTitleBlock: { textAlign: 'start' },
  invoiceTitle: { fontSize: 28, fontWeight: 700, color: '#1a1a6e', marginBottom: 6 },
  invoiceMeta: { fontSize: 13, marginBottom: 2 },
  divider: { border: 'none', borderTop: '2px solid #1a1a6e', margin: '16px 0' },
  customerBlock: { marginBottom: 24, padding: 12, background: '#f5f5f5', borderRadius: 4 },
  sectionLabel: { fontWeight: 700, marginBottom: 4 },
  customerName: { fontSize: 16, fontWeight: 700 },
  table: { width: '100%', borderCollapse: 'collapse', marginBottom: 24 },
  tableHeaderRow: { background: '#1a1a6e', color: '#fff' },
  th: { padding: '10px 12px', textAlign: 'end', fontWeight: 700 },
  td: { padding: '8px 12px', borderBottom: '1px solid #ddd' },
  trEven: { background: '#fff' },
  trOdd: { background: '#f9f9f9' },
  totalsBlock: { display: 'flex', justifyContent: 'flex-start', marginBottom: 24 },
  totalsTable: { borderCollapse: 'collapse', minWidth: 300 },
  totalLabel: { padding: '6px 16px', textAlign: 'end', fontWeight: 600 },
  totalValue: { padding: '6px 16px', textAlign: 'start', minWidth: 120 },
  grandTotalRow: { background: '#1a1a6e', color: '#fff', fontSize: 16, fontWeight: 700 },
  paymentTerms: { padding: '10px 12px', background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 4, marginBottom: 16 },
  notes: { padding: '10px 12px', background: '#f0f0f0', borderRadius: 4, marginBottom: 16, fontSize: 13 },
  printBtnRow: { textAlign: 'center', marginTop: 24 },
  printBtn: {
    background: '#1a1a6e', color: '#fff', border: 'none',
    padding: '10px 28px', borderRadius: 4, fontSize: 15, cursor: 'pointer',
  },
};
