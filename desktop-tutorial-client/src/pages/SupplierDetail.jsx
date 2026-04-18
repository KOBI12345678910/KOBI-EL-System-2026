import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../api/client';
import ExportButtons from '../components/ui/ExportButtons';

const statusLabels = { pending: 'ממתין', approved: 'מאושר', rejected: 'נדחה', paid: 'שולם' };
const statusColors = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  paid: 'bg-blue-100 text-blue-800',
};
const termsLabels = { immediate: 'מיידי', shotef_plus_0: 'שוטף', shotef_plus_30: 'שוטף+30', shotef_plus_60: 'שוטף+60', shotef_plus_90: 'שוטף+90' };

export default function SupplierDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [supplier, setSupplier] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [reminding, setReminding] = useState(false);

  useEffect(() => { load(); }, [id]);

  async function load() {
    const [s, inv] = await Promise.all([
      api.get(`/suppliers/${id}`),
      api.get(`/invoices?supplier_id=${id}`),
    ]);
    setSupplier(s.data);
    setInvoices(inv.data);
  }

  async function sendReminder(method) {
    setReminding(true);
    try {
      const { data } = await api.post(`/reminders/send/${id}`, { method });
      alert(data.success ? `תזכורת נשלחה ל-${supplier.name}` : data.error);
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה בשליחת תזכורת');
    }
    setReminding(false);
  }

  if (!supplier) return <div className="text-center py-20 text-gray-400">טוען...</div>;

  const totalInvoiced = invoices.reduce((s, i) => s + i.amount, 0);
  const totalPending = invoices.filter(i => i.status !== 'paid' && i.status !== 'rejected').reduce((s, i) => s + i.amount, 0);
  const totalPaid = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.amount, 0);
  const monthlyData = {};
  invoices.forEach(i => {
    const month = i.invoice_date?.substring(0, 7);
    if (month) monthlyData[month] = (monthlyData[month] || 0) + i.amount;
  });
  const months = Object.entries(monthlyData).sort((a, b) => a[0].localeCompare(b[0])).slice(-12);
  const maxMonth = Math.max(...months.map(m => m[1]), 1);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/suppliers')} className="p-2 rounded-lg hover:bg-gray-100">
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-800">{supplier.name}</h1>
          <p className="text-sm text-gray-500">
            {supplier.category_name && <span className="px-2 py-0.5 rounded-full text-xs text-white ml-2" style={{ backgroundColor: supplier.category_color }}>{supplier.category_name}</span>}
            {supplier.contact_name}
          </p>
        </div>
        <ExportButtons pdfUrl={`/api/export/pdf/supplier/${id}`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Stats */}
        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border p-5">
              <p className="text-xs text-gray-500">סה״כ חיובים</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">₪{totalInvoiced.toLocaleString()}</p>
              <p className="text-xs text-gray-400">{invoices.length} חשבוניות</p>
            </div>
            <div className="bg-white rounded-xl border p-5">
              <p className="text-xs text-gray-500">חוב פתוח</p>
              <p className="text-2xl font-bold text-red-600 mt-1">₪{totalPending.toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-xl border p-5">
              <p className="text-xs text-gray-500">שולם</p>
              <p className="text-2xl font-bold text-green-600 mt-1">₪{totalPaid.toLocaleString()}</p>
            </div>
          </div>

          {/* Monthly chart */}
          {months.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-800 mb-4">מגמה חודשית</h3>
              <div className="space-y-2">
                {months.map(([month, amount]) => (
                  <div key={month} className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 w-16">{month}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                      <div className="bg-primary-500 h-full rounded-full flex items-center justify-end px-2"
                        style={{ width: `${(amount / maxMonth) * 100}%`, minWidth: '50px' }}>
                        <span className="text-xs text-white font-medium">₪{amount.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Invoice history */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-800 mb-4">חשבוניות ({invoices.length})</h3>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-200">
                <th className="text-right pb-2 text-gray-500 font-medium">מס׳</th>
                <th className="text-right pb-2 text-gray-500 font-medium">תאריך</th>
                <th className="text-right pb-2 text-gray-500 font-medium">סכום</th>
                <th className="text-right pb-2 text-gray-500 font-medium">לתשלום</th>
                <th className="text-right pb-2 text-gray-500 font-medium">סטטוס</th>
              </tr></thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                    onClick={() => navigate(`/invoices/${inv.id}`)}>
                    <td className="py-2">{inv.invoice_number || '-'}</td>
                    <td className="py-2">{new Date(inv.invoice_date).toLocaleDateString('he-IL')}</td>
                    <td className="py-2 font-semibold">₪{inv.amount.toLocaleString()}</td>
                    <td className="py-2 text-gray-600">{inv.due_date ? new Date(inv.due_date).toLocaleDateString('he-IL') : '-'}</td>
                    <td className="py-2"><span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[inv.status]}`}>{statusLabels[inv.status]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-800 mb-3">פרטי קשר</h3>
            <div className="text-sm space-y-2">
              {supplier.contact_name && <p><span className="text-gray-500">איש קשר:</span> {supplier.contact_name}</p>}
              {supplier.email && <p><span className="text-gray-500">אימייל:</span> {supplier.email}</p>}
              {supplier.phone && <p><span className="text-gray-500">טלפון:</span> {supplier.phone}</p>}
              <p><span className="text-gray-500">תנאי תשלום:</span> {termsLabels[supplier.payment_terms] || supplier.payment_terms}</p>
              {supplier.expected_invoice_day && <p><span className="text-gray-500">יום חשבונית:</span> {supplier.expected_invoice_day} בחודש</p>}
              {supplier.notes && <p className="bg-gray-50 rounded-lg p-2 text-gray-600 mt-2">{supplier.notes}</p>}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-800 mb-3">פעולות</h3>
            <div className="space-y-2">
              {supplier.email && (
                <button onClick={() => sendReminder('email')} disabled={reminding}
                  className="w-full px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 text-sm disabled:opacity-50">
                  {reminding ? 'שולח...' : 'שלח תזכורת באימייל'}
                </button>
              )}
              {supplier.phone && (
                <button onClick={() => sendReminder('whatsapp')} disabled={reminding}
                  className="w-full px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 text-sm disabled:opacity-50">
                  {reminding ? 'שולח...' : 'שלח תזכורת ב-WhatsApp'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
