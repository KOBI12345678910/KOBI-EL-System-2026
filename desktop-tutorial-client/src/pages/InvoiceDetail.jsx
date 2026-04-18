import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../api/client';
import Modal from '../components/ui/Modal';

const statusLabels = {
  pending: { label: 'ממתין לאישור', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  approved: { label: 'מאושר', color: 'bg-green-100 text-green-800 border-green-300' },
  rejected: { label: 'נדחה', color: 'bg-red-100 text-red-800 border-red-300' },
  paid: { label: 'שולם', color: 'bg-blue-100 text-blue-800 border-blue-300' },
};

export default function InvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState(null);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ amount: '', payment_date: '', payment_method: '', reference: '', notes: '' });
  const [tags, setTags] = useState([]);
  const [allTags, setAllTags] = useState([]);

  useEffect(() => { load(); }, [id]);

  async function load() {
    const [inv, tagRes] = await Promise.all([
      api.get(`/invoices/${id}`),
      api.get('/invoices/meta/tags'),
    ]);
    setInvoice(inv.data);
    setTags(inv.data.tags?.map(t => t.id) || []);
    setAllTags(tagRes.data);
  }

  async function approve() {
    await api.patch(`/invoices/${id}/approve`);
    load();
  }

  async function reject() {
    await api.patch(`/invoices/${id}/reject`);
    load();
  }

  async function confirmReceipt() {
    const { data } = await api.post(`/invoices/${id}/confirm-receipt`);
    alert(data.success ? 'אישור קבלה נשלח לספק' : data.reason);
  }

  async function addPayment(e) {
    e.preventDefault();
    await api.post('/payments', { invoice_id: parseInt(id), ...paymentForm, amount: parseFloat(paymentForm.amount) });
    setShowPayment(false);
    setPaymentForm({ amount: '', payment_date: '', payment_method: '', reference: '', notes: '' });
    load();
  }

  async function toggleTag(tagId) {
    const newTags = tags.includes(tagId) ? tags.filter(t => t !== tagId) : [...tags, tagId];
    setTags(newTags);
    await api.post(`/invoices/${id}/tags`, { tag_ids: newTags });
  }

  function openPDF() {
    window.open(`/api/export/pdf/invoices?supplier_id=${invoice.supplier_id}`, '_blank');
  }

  if (!invoice) return <div className="text-center py-20 text-gray-400">טוען...</div>;

  const status = statusLabels[invoice.status] || {};
  const progressPct = invoice.amount > 0 ? Math.min((invoice.total_paid / invoice.amount) * 100, 100) : 0;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/invoices')} className="p-2 rounded-lg hover:bg-gray-100">
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-800">
            חשבונית {invoice.invoice_number ? `#${invoice.invoice_number}` : `מס׳ ${invoice.id}`}
          </h1>
          <p className="text-sm text-gray-500">
            <Link to={`/suppliers/${invoice.supplier_id}`} className="text-primary-600 hover:underline">{invoice.supplier_name}</Link>
            {invoice.category_name && <span className="mr-2">• {invoice.category_name}</span>}
          </p>
        </div>
        <span className={`px-4 py-2 rounded-full text-sm font-medium border ${status.color}`}>{status.label}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Amount card */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="grid grid-cols-3 gap-6 mb-4">
              <div>
                <p className="text-xs text-gray-500">סכום כולל מע״מ</p>
                <p className="text-3xl font-bold text-gray-800 mt-1">₪{invoice.amount.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">לפני מע״מ</p>
                <p className="text-xl font-semibold text-gray-600 mt-1">₪{(invoice.amount_before_vat || 0).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">מע״מ</p>
                <p className="text-xl font-semibold text-gray-600 mt-1">₪{(invoice.vat_amount || 0).toLocaleString()}</p>
              </div>
            </div>

            {/* Payment progress */}
            <div className="mt-4">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-500">שולם: ₪{invoice.total_paid.toLocaleString()}</span>
                <span className="text-gray-500">יתרה: ₪{invoice.remaining.toLocaleString()}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div className={`h-3 rounded-full transition-all ${progressPct >= 100 ? 'bg-green-500' : 'bg-primary-500'}`}
                  style={{ width: `${progressPct}%` }} />
              </div>
            </div>
          </div>

          {/* Details */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-800 mb-4">פרטים</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-gray-500">תאריך חשבונית:</span> <span className="font-medium">{invoice.invoice_date}</span></div>
              <div><span className="text-gray-500">לתשלום עד:</span> <span className="font-medium">{invoice.due_date || 'לא נקבע'}</span></div>
              <div><span className="text-gray-500">מקור:</span> <span className="font-medium">{invoice.source}</span></div>
              <div><span className="text-gray-500">מטבע:</span> <span className="font-medium">{invoice.currency}</span></div>
              {invoice.approved_by && <div><span className="text-gray-500">אושר ע״י:</span> <span className="font-medium">{invoice.approved_by}</span></div>}
              {invoice.approved_at && <div><span className="text-gray-500">תאריך אישור:</span> <span className="font-medium">{new Date(invoice.approved_at).toLocaleDateString('he-IL')}</span></div>}
              <div><span className="text-gray-500">נשלח לרו״ח:</span> <span className="font-medium">{invoice.forwarded_to_accountant ? 'כן' : 'לא'}</span></div>
            </div>
            {invoice.notes && <p className="mt-3 text-sm text-gray-600 bg-gray-50 rounded-lg p-3">{invoice.notes}</p>}
            {invoice.file_path && (
              <a href={invoice.file_path} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                צפה בקובץ
              </a>
            )}
          </div>

          {/* Payments */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800">תשלומים ({invoice.payments.length})</h3>
              {invoice.status !== 'paid' && invoice.status !== 'rejected' && (
                <button onClick={() => setShowPayment(true)} className="px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-xs">
                  + רשום תשלום
                </button>
              )}
            </div>
            {invoice.payments.length === 0 ? (
              <p className="text-sm text-gray-400">אין תשלומים רשומים</p>
            ) : (
              <table className="w-full text-sm">
                <thead><tr className="border-b border-gray-200">
                  <th className="text-right pb-2 text-gray-500 font-medium">תאריך</th>
                  <th className="text-right pb-2 text-gray-500 font-medium">סכום</th>
                  <th className="text-right pb-2 text-gray-500 font-medium">אמצעי</th>
                  <th className="text-right pb-2 text-gray-500 font-medium">אסמכתא</th>
                </tr></thead>
                <tbody>
                  {invoice.payments.map(p => (
                    <tr key={p.id} className="border-b border-gray-100">
                      <td className="py-2">{new Date(p.payment_date).toLocaleDateString('he-IL')}</td>
                      <td className="py-2 font-semibold">₪{p.amount.toLocaleString()}</td>
                      <td className="py-2 text-gray-600">{p.payment_method || '-'}</td>
                      <td className="py-2 text-gray-600">{p.reference || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Audit log */}
          {invoice.audit && invoice.audit.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="font-semibold text-gray-800 mb-4">היסטוריית פעולות</h3>
              <div className="space-y-2">
                {invoice.audit.map(a => (
                  <div key={a.id} className="flex items-center gap-3 text-sm">
                    <span className="text-xs text-gray-400 w-32">{new Date(a.created_at).toLocaleString('he-IL')}</span>
                    <span className="text-gray-600">{a.details}</span>
                    <span className="text-xs text-gray-400">{a.performed_by}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Actions */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-800 mb-3">פעולות</h3>
            <div className="space-y-2">
              {invoice.status === 'pending' && (
                <>
                  <button onClick={approve} className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm">אשר חשבונית</button>
                  <button onClick={reject} className="w-full px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 text-sm">דחה חשבונית</button>
                </>
              )}
              <button onClick={confirmReceipt} className="w-full px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 text-sm">
                שלח אישור קבלה לספק
              </button>
              <button onClick={openPDF} className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm">
                ייצוא PDF
              </button>
            </div>
          </div>

          {/* Supplier info */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-800 mb-3">פרטי ספק</h3>
            <Link to={`/suppliers/${invoice.supplier_id}`} className="text-primary-600 hover:underline font-medium">{invoice.supplier_name}</Link>
            <div className="text-sm text-gray-500 mt-2 space-y-1">
              {invoice.supplier_email && <p>{invoice.supplier_email}</p>}
              {invoice.supplier_phone && <p>{invoice.supplier_phone}</p>}
              {invoice.supplier_contact && <p>{invoice.supplier_contact}</p>}
              <p>תנאי תשלום: {invoice.payment_terms}</p>
            </div>
          </div>

          {/* Tags */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-800 mb-3">תגיות</h3>
            <div className="flex flex-wrap gap-2">
              {allTags.map(t => (
                <button key={t.id} onClick={() => toggleTag(t.id)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                    tags.includes(t.id)
                      ? 'text-white border-transparent'
                      : 'text-gray-500 border-gray-200 bg-white hover:bg-gray-50'
                  }`}
                  style={tags.includes(t.id) ? { backgroundColor: t.color } : {}}>
                  {t.name}
                </button>
              ))}
              {allTags.length === 0 && <p className="text-xs text-gray-400">אין תגיות. צור תגיות בהגדרות.</p>}
            </div>
          </div>
        </div>
      </div>

      {/* Payment modal */}
      <Modal open={showPayment} onClose={() => setShowPayment(false)} title="רישום תשלום">
        <form onSubmit={addPayment} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">סכום *</label>
            <input type="number" step="0.01" required value={paymentForm.amount}
              onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })}
              placeholder={`יתרה: ₪${invoice.remaining.toLocaleString()}`}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">תאריך תשלום *</label>
            <input type="date" required value={paymentForm.payment_date}
              onChange={e => setPaymentForm({ ...paymentForm, payment_date: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">אמצעי תשלום</label>
            <select value={paymentForm.payment_method} onChange={e => setPaymentForm({ ...paymentForm, payment_method: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="">בחר...</option>
              <option value="העברה">העברה בנקאית</option>
              <option value="צ׳ק">צ׳ק</option>
              <option value="מזומן">מזומן</option>
              <option value="אשראי">כרטיס אשראי</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">אסמכתא</label>
            <input type="text" value={paymentForm.reference}
              onChange={e => setPaymentForm({ ...paymentForm, reference: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <button type="submit" className="w-full px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm">
            רשום תשלום
          </button>
        </form>
      </Modal>
    </div>
  );
}
