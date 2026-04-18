import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import VATCalculator from '../components/ui/VATCalculator';
import DuplicateWarning from '../components/ui/DuplicateWarning';
import ExportButtons from '../components/ui/ExportButtons';

const statusLabels = {
  pending: { label: 'ממתין', color: 'bg-yellow-100 text-yellow-800' },
  approved: { label: 'מאושר', color: 'bg-green-100 text-green-800' },
  rejected: { label: 'נדחה', color: 'bg-red-100 text-red-800' },
  paid: { label: 'שולם', color: 'bg-blue-100 text-blue-800' },
};

const sourceLabels = { manual: 'ידני', upload: 'העלאה', gmail: 'Gmail', whatsapp: 'WhatsApp', recurring: 'חוזרת' };

export default function Invoices() {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [filter, setFilter] = useState({ status: '', supplier_id: '', from_date: '', to_date: '' });
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState([]);
  const [duplicates, setDuplicates] = useState(null);
  const [form, setForm] = useState({
    supplier_id: '', invoice_number: '', invoice_date: '', amount: '', amount_before_vat: '', vat_amount: 0, notes: '',
  });
  const fileRef = useRef();

  useEffect(() => {
    loadInvoices();
    api.get('/suppliers').then(r => setSuppliers(r.data));
  }, [filter]);

  async function loadInvoices() {
    const params = {};
    if (filter.status) params.status = filter.status;
    if (filter.supplier_id) params.supplier_id = filter.supplier_id;
    if (filter.from_date) params.from_date = filter.from_date;
    if (filter.to_date) params.to_date = filter.to_date;
    const { data } = await api.get('/invoices', { params });
    setInvoices(data);
  }

  async function handleSubmit(e, force = false) {
    e?.preventDefault();
    let file_path = null;

    if (fileRef.current?.files[0]) {
      const formData = new FormData();
      formData.append('file', fileRef.current.files[0]);
      const { data } = await api.post('/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      file_path = data.file_path;
    }

    try {
      await api.post('/invoices', {
        ...form,
        amount: parseFloat(form.amount),
        amount_before_vat: form.amount_before_vat ? parseFloat(form.amount_before_vat) : null,
        vat_amount: form.vat_amount || null,
        file_path,
        source: file_path ? 'upload' : 'manual',
        force,
      });

      setShowForm(false);
      setDuplicates(null);
      setForm({ supplier_id: '', invoice_number: '', invoice_date: '', amount: '', amount_before_vat: '', vat_amount: 0, notes: '' });
      loadInvoices();
    } catch (err) {
      if (err.response?.status === 409 && err.response.data.duplicates) {
        setDuplicates(err.response.data.duplicates);
      } else {
        alert(err.response?.data?.error || 'שגיאה');
      }
    }
  }

  async function handleBulkApprove() {
    if (selected.length === 0) return;
    await api.post('/invoices/bulk-approve', { invoice_ids: selected });
    setSelected([]);
    loadInvoices();
  }

  async function handleForwardToAccountant() {
    if (selected.length === 0) return alert('יש לבחור חשבוניות');
    try {
      await api.post('/accountant/forward', { invoice_ids: selected });
      alert('חשבוניות הועברו לרואה חשבון');
      setSelected([]);
      loadInvoices();
    } catch (err) {
      alert(err.response?.data?.error || 'שגיאה');
    }
  }

  function toggleSelect(id) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function handleVATChange(values) {
    setForm({ ...form, amount: values.amount, amount_before_vat: values.amount_before_vat, vat_amount: values.vat_amount });
  }

  // Build CSV url with current filters
  const csvParams = new URLSearchParams(filter).toString();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">חשבוניות</h1>
        <div className="flex gap-2">
          <ExportButtons csvUrl={`/api/export/csv/invoices?${csvParams}`} pdfUrl={`/api/export/pdf/invoices?${csvParams}`} />
          {selected.length > 0 && (
            <>
              <button onClick={handleBulkApprove} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm">
                אשר ({selected.length})
              </button>
              <button onClick={handleForwardToAccountant} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
                שלח לרו״ח ({selected.length})
              </button>
            </>
          )}
          <button onClick={() => { setShowForm(!showForm); setDuplicates(null); }}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm">
            + חשבונית חדשה
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select value={filter.status} onChange={e => setFilter({ ...filter, status: e.target.value })}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          <option value="">כל הסטטוסים</option>
          <option value="pending">ממתין</option>
          <option value="approved">מאושר</option>
          <option value="rejected">נדחה</option>
          <option value="paid">שולם</option>
        </select>
        <select value={filter.supplier_id} onChange={e => setFilter({ ...filter, supplier_id: e.target.value })}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          <option value="">כל הספקים</option>
          {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <input type="date" value={filter.from_date} onChange={e => setFilter({ ...filter, from_date: e.target.value })}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="מתאריך" />
        <input type="date" value={filter.to_date} onChange={e => setFilter({ ...filter, to_date: e.target.value })}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="עד תאריך" />
        {(filter.from_date || filter.to_date || filter.status || filter.supplier_id) && (
          <button onClick={() => setFilter({ status: '', supplier_id: '', from_date: '', to_date: '' })}
            className="text-xs text-gray-500 hover:text-gray-700">נקה פילטרים</button>
        )}
      </div>

      {/* Duplicate warning */}
      {duplicates && (
        <DuplicateWarning duplicates={duplicates}
          onForce={() => handleSubmit(null, true)}
          onCancel={() => setDuplicates(null)} />
      )}

      {/* Add invoice form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
          <h3 className="font-semibold text-gray-800 mb-4">חשבונית חדשה</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <select required value={form.supplier_id} onChange={e => setForm({ ...form, supplier_id: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="">בחר ספק *</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input type="text" placeholder="מספר חשבונית" value={form.invoice_number}
              onChange={e => setForm({ ...form, invoice_number: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <input type="date" required value={form.invoice_date}
              onChange={e => setForm({ ...form, invoice_date: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>

          {/* VAT Calculator */}
          <div className="mb-4">
            <VATCalculator amount={form.amount} amountBeforeVat={form.amount_before_vat} onChange={handleVATChange} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input type="file" ref={fileRef} accept=".pdf,.jpg,.jpeg,.png"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <input type="text" placeholder="הערות" value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm">
              שמור חשבונית
            </button>
          </div>
        </form>
      )}

      {/* Invoice table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="p-3 text-right w-10">
                <input type="checkbox"
                  onChange={e => setSelected(e.target.checked ? invoices.map(i => i.id) : [])}
                  checked={selected.length === invoices.length && invoices.length > 0} />
              </th>
              <th className="p-3 text-right font-medium text-gray-600">ספק</th>
              <th className="p-3 text-right font-medium text-gray-600">מס׳ חשבונית</th>
              <th className="p-3 text-right font-medium text-gray-600">תאריך</th>
              <th className="p-3 text-right font-medium text-gray-600">סכום</th>
              <th className="p-3 text-right font-medium text-gray-600">לתשלום עד</th>
              <th className="p-3 text-right font-medium text-gray-600">מקור</th>
              <th className="p-3 text-right font-medium text-gray-600">סטטוס</th>
              <th className="p-3 text-right font-medium text-gray-600">תגיות</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr><td colSpan={9} className="p-8 text-center text-gray-400">אין חשבוניות להצגה</td></tr>
            ) : (
              invoices.map(inv => (
                <tr key={inv.id} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/invoices/${inv.id}`)}>
                  <td className="p-3" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.includes(inv.id)} onChange={() => toggleSelect(inv.id)} />
                  </td>
                  <td className="p-3 font-medium text-gray-800">{inv.supplier_name}</td>
                  <td className="p-3 text-gray-600">{inv.invoice_number || '-'}</td>
                  <td className="p-3 text-gray-600">{new Date(inv.invoice_date).toLocaleDateString('he-IL')}</td>
                  <td className="p-3 font-semibold">₪{inv.amount.toLocaleString()}</td>
                  <td className="p-3 text-gray-600">{inv.due_date ? new Date(inv.due_date).toLocaleDateString('he-IL') : '-'}</td>
                  <td className="p-3 text-gray-500">{sourceLabels[inv.source] || inv.source}</td>
                  <td className="p-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${statusLabels[inv.status]?.color}`}>
                      {statusLabels[inv.status]?.label || inv.status}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      {inv.tags?.map(t => (
                        <span key={t.name} className="text-xs px-1.5 py-0.5 rounded text-white" style={{ backgroundColor: t.color }}>{t.name}</span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
