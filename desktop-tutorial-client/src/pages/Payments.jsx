import { useState, useEffect } from 'react';
import api from '../api/client';
import { useNavigate } from 'react-router-dom';
import Modal from '../components/ui/Modal';
import PaymentCalendar from '../components/ui/PaymentCalendar';

const methodLabels = { 'העברה': 'העברה בנקאית', 'צ׳ק': 'צ׳ק', 'מזומן': 'מזומן', 'אשראי': 'כרטיס אשראי' };

export default function Payments() {
  const navigate = useNavigate();
  const [payments, setPayments] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ invoice_id: '', amount: '', payment_date: '', payment_method: '', reference: '', notes: '' });

  useEffect(() => {
    loadPayments();
    api.get('/invoices?status=approved').then(r => setInvoices(r.data)).catch(() => {});
  }, []);

  async function loadPayments() {
    const { data } = await api.get('/payments');
    setPayments(data);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    await api.post('/payments', { ...form, invoice_id: parseInt(form.invoice_id), amount: parseFloat(form.amount) });
    setShowForm(false);
    setForm({ invoice_id: '', amount: '', payment_date: '', payment_method: '', reference: '', notes: '' });
    loadPayments();
  }

  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">תשלומים</h1>
          <p className="text-sm text-gray-500">סה״כ שולם: ₪{totalPaid.toLocaleString()} ({payments.length} תשלומים)</p>
        </div>
        <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm">
          + רשום תשלום
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="p-3 text-right font-medium text-gray-600">תאריך</th>
                  <th className="p-3 text-right font-medium text-gray-600">ספק</th>
                  <th className="p-3 text-right font-medium text-gray-600">חשבונית</th>
                  <th className="p-3 text-right font-medium text-gray-600">סכום</th>
                  <th className="p-3 text-right font-medium text-gray-600">אמצעי</th>
                  <th className="p-3 text-right font-medium text-gray-600">אסמכתא</th>
                </tr>
              </thead>
              <tbody>
                {payments.length === 0 ? (
                  <tr><td colSpan={6} className="p-8 text-center text-gray-400">אין תשלומים רשומים</td></tr>
                ) : (
                  payments.map(p => (
                    <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="p-3">{new Date(p.payment_date).toLocaleDateString('he-IL')}</td>
                      <td className="p-3 font-medium text-gray-800">{p.supplier_name}</td>
                      <td className="p-3 text-gray-600">{p.invoice_number || '-'}</td>
                      <td className="p-3 font-semibold text-green-700">₪{p.amount.toLocaleString()}</td>
                      <td className="p-3 text-gray-500">{p.payment_method || '-'}</td>
                      <td className="p-3 text-gray-500">{p.reference || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <PaymentCalendar />
        </div>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="רישום תשלום חדש">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">חשבונית *</label>
            <select required value={form.invoice_id} onChange={e => setForm({ ...form, invoice_id: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="">בחר חשבונית...</option>
              {invoices.map(i => (
                <option key={i.id} value={i.id}>
                  {i.supplier_name} - {i.invoice_number || `#${i.id}`} - ₪{i.amount.toLocaleString()}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-600 mb-1">סכום *</label>
              <input type="number" step="0.01" required value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">תאריך *</label>
              <input type="date" required value={form.payment_date}
                onChange={e => setForm({ ...form, payment_date: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-600 mb-1">אמצעי תשלום</label>
              <select value={form.payment_method} onChange={e => setForm({ ...form, payment_method: e.target.value })}
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
              <input type="text" value={form.reference}
                onChange={e => setForm({ ...form, reference: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <button type="submit" className="w-full px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
            רשום תשלום
          </button>
        </form>
      </Modal>
    </div>
  );
}
