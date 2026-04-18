import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';

export default function ApprovalQueue() {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState([]);

  useEffect(() => { loadPending(); }, []);

  async function loadPending() {
    const { data } = await api.get('/invoices?status=pending');
    setInvoices(data);
  }

  async function approve(id) {
    await api.patch(`/invoices/${id}/approve`);
    loadPending();
  }

  async function reject(id) {
    await api.patch(`/invoices/${id}/reject`);
    loadPending();
  }

  async function bulkApproveAll() {
    if (!confirm(`לאשר ${invoices.length} חשבוניות?`)) return;
    await api.post('/invoices/bulk-approve', { invoice_ids: invoices.map(i => i.id) });
    loadPending();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">
          אישור חשבוניות
          {invoices.length > 0 && <span className="text-sm font-normal text-gray-400 mr-2">({invoices.length} ממתינות)</span>}
        </h1>
        {invoices.length > 1 && (
          <button onClick={bulkApproveAll} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm">
            אשר הכל ({invoices.length})
          </button>
        )}
      </div>

      {invoices.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-400 text-lg">אין חשבוניות ממתינות לאישור</p>
          <p className="text-gray-300 text-sm mt-2">כל החשבוניות אושרו</p>
        </div>
      ) : (
        <div className="space-y-4">
          {invoices.map(inv => (
            <div key={inv.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="cursor-pointer" onClick={() => navigate(`/invoices/${inv.id}`)}>
                  <h3 className="font-bold text-gray-800 text-lg hover:text-primary-600">{inv.supplier_name}</h3>
                  <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                    {inv.invoice_number && <span>חשבונית #{inv.invoice_number}</span>}
                    <span>{new Date(inv.invoice_date).toLocaleDateString('he-IL')}</span>
                    {inv.category_name && (
                      <span className="px-2 py-0.5 rounded-full text-xs text-white" style={{ backgroundColor: inv.category_color }}>
                        {inv.category_name}
                      </span>
                    )}
                    {inv.source !== 'manual' && <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">{inv.source}</span>}
                  </div>
                  {inv.notes && <p className="text-sm text-gray-400 mt-2">{inv.notes}</p>}
                  {inv.tags?.length > 0 && (
                    <div className="flex gap-1 mt-2">
                      {inv.tags.map(t => (
                        <span key={t.name} className="text-xs px-1.5 py-0.5 rounded text-white" style={{ backgroundColor: t.color }}>{t.name}</span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="text-left">
                  <p className="text-2xl font-bold text-gray-800">₪{inv.amount.toLocaleString()}</p>
                  {inv.amount_before_vat && (
                    <p className="text-xs text-gray-400">לפני מע"מ: ₪{inv.amount_before_vat.toLocaleString()}</p>
                  )}
                  {inv.due_date && (
                    <p className="text-xs text-gray-400 mt-1">לתשלום עד {new Date(inv.due_date).toLocaleDateString('he-IL')}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 mt-4 pt-4 border-t border-gray-100">
                <button onClick={() => approve(inv.id)}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium">
                  אשר חשבונית
                </button>
                <button onClick={() => reject(inv.id)}
                  className="px-6 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 text-sm font-medium">
                  דחה
                </button>
                {inv.file_path && (
                  <a href={inv.file_path} target="_blank" rel="noreferrer"
                    className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 text-sm">
                    צפה בקובץ
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
