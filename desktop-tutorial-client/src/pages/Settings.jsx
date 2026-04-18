import { useState, useEffect } from 'react';
import api from '../api/client';
import Modal from '../components/ui/Modal';

export default function Settings() {
  const [gmailStatus, setGmailStatus] = useState({ connected: false });
  const [whatsappPending, setWhatsappPending] = useState([]);
  const [recurring, setRecurring] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [tags, setTags] = useState([]);
  const [showRecurring, setShowRecurring] = useState(false);
  const [newTag, setNewTag] = useState({ name: '', color: '#6366f1' });
  const [recurringForm, setRecurringForm] = useState({ supplier_id: '', description: '', expected_amount: '', frequency: 'monthly', day_of_month: '1' });

  useEffect(() => {
    Promise.all([
      api.get('/gmail/status').then(r => setGmailStatus(r.data)).catch(() => {}),
      api.get('/whatsapp/pending').then(r => setWhatsappPending(r.data)).catch(() => {}),
      api.get('/recurring').then(r => setRecurring(r.data)).catch(() => {}),
      api.get('/suppliers').then(r => setSuppliers(r.data)).catch(() => {}),
      api.get('/invoices/meta/tags').then(r => setTags(r.data)).catch(() => {}),
    ]);
  }, []);

  async function connectGmail() {
    const { data } = await api.get('/gmail/auth');
    if (data.auth_url) window.open(data.auth_url, '_blank');
    else alert(data.error);
  }

  async function fetchGmail() {
    const { data } = await api.post('/gmail/fetch');
    alert(`נמצאו ${data.count} הודעות עם חשבוניות`);
  }

  async function addTag(e) {
    e.preventDefault();
    await api.post('/invoices/meta/tags', newTag);
    setNewTag({ name: '', color: '#6366f1' });
    const { data } = await api.get('/invoices/meta/tags');
    setTags(data);
  }

  async function addRecurring(e) {
    e.preventDefault();
    await api.post('/recurring', { ...recurringForm, expected_amount: parseFloat(recurringForm.expected_amount), day_of_month: parseInt(recurringForm.day_of_month) });
    setShowRecurring(false);
    setRecurringForm({ supplier_id: '', description: '', expected_amount: '', frequency: 'monthly', day_of_month: '1' });
    const { data } = await api.get('/recurring');
    setRecurring(data);
  }

  async function toggleRecurring(id, isActive) {
    await api.patch(`/recurring/${id}`, { is_active: isActive ? 0 : 1 });
    const { data } = await api.get('/recurring');
    setRecurring(data);
  }

  async function sendBulkReminders() {
    const { data } = await api.post('/reminders/bulk');
    alert(`נשלחו ${data.sent} תזכורות, ${data.failed} נכשלו`);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">הגדרות</h1>

      <div className="space-y-6">
        {/* Gmail Integration */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">חיבור Gmail</h2>
          <p className="text-sm text-gray-500 mb-4">חבר את ה-Gmail לאיסוף חשבוניות אוטומטי ממיילים.</p>
          <div className="flex items-center gap-4">
            <span className={`text-sm px-3 py-1 rounded-full ${gmailStatus.connected ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {gmailStatus.connected ? 'מחובר' : 'לא מחובר'}
            </span>
            {gmailStatus.connected ? (
              <button onClick={fetchGmail} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
                שלוף חשבוניות עכשיו
              </button>
            ) : (
              <button onClick={connectGmail} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm">
                חבר Gmail
              </button>
            )}
          </div>
        </div>

        {/* WhatsApp */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">WhatsApp Business</h2>
          <p className="text-sm text-gray-500 mb-4">קבל חשבוניות דרך WhatsApp Business API.</p>
          <div className="bg-gray-50 rounded-lg p-3 text-sm">
            <p className="font-medium text-gray-700">Webhook URL:</p>
            <code className="text-xs text-gray-500 break-all">{window.location.origin}/api/whatsapp/webhook</code>
          </div>
          {whatsappPending.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-medium text-gray-700 mb-2">ממתינות ({whatsappPending.length}):</p>
              {whatsappPending.map(p => (
                <div key={p.key} className="text-xs text-gray-500 bg-yellow-50 p-2 rounded mb-1">
                  מ: {p.from} • {p.filename} • {new Date(p.received_at).toLocaleString('he-IL')}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Auto-reminders */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">תזכורות אוטומטיות</h2>
          <p className="text-sm text-gray-500 mb-4">שלח תזכורות לספקים שלא שלחו חשבונית החודש.</p>
          <div className="flex gap-3">
            <button onClick={sendBulkReminders} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
              שלח תזכורות עכשיו
            </button>
            <p className="text-xs text-gray-400 self-center">תזכורות אוטומטיות נשלחות ב-1 בכל חודש בשעה 09:00</p>
          </div>
        </div>

        {/* Recurring invoices */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-800">חשבוניות חוזרות</h2>
            <button onClick={() => setShowRecurring(true)} className="px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-xs">
              + חדשה
            </button>
          </div>
          <p className="text-sm text-gray-500 mb-4">הגדר חשבוניות שחוזרות כל חודש. המערכת תיצור אותן אוטומטית.</p>
          {recurring.length === 0 ? (
            <p className="text-sm text-gray-400">אין חשבוניות חוזרות</p>
          ) : (
            <div className="space-y-2">
              {recurring.map(r => (
                <div key={r.id} className={`flex items-center justify-between p-3 rounded-lg ${r.is_active ? 'bg-green-50' : 'bg-gray-50'}`}>
                  <div>
                    <p className="font-medium text-gray-800">{r.supplier_name}</p>
                    <p className="text-xs text-gray-500">{r.description || 'חשבונית חוזרת'} • ₪{r.expected_amount.toLocaleString()} • יום {r.day_of_month}</p>
                  </div>
                  <button onClick={() => toggleRecurring(r.id, r.is_active)}
                    className={`text-xs px-3 py-1 rounded-full ${r.is_active ? 'bg-green-200 text-green-800' : 'bg-gray-200 text-gray-600'}`}>
                    {r.is_active ? 'פעיל' : 'מושבת'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tags */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">תגיות</h2>
          <form onSubmit={addTag} className="flex gap-2 mb-4">
            <input type="text" required value={newTag.name} onChange={e => setNewTag({ ...newTag, name: e.target.value })}
              placeholder="שם תגית" className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <input type="color" value={newTag.color} onChange={e => setNewTag({ ...newTag, color: e.target.value })}
              className="w-10 h-10 rounded-lg border border-gray-300 cursor-pointer" />
            <button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm">הוסף</button>
          </form>
          <div className="flex flex-wrap gap-2">
            {tags.map(t => (
              <span key={t.id} className="px-3 py-1 rounded-full text-white text-xs" style={{ backgroundColor: t.color }}>{t.name}</span>
            ))}
          </div>
        </div>

        {/* Email Settings */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">העברה לרואה חשבון</h2>
          <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600 space-y-1">
            <p><span className="font-medium">ACCOUNTANT_EMAIL</span> - כתובת מייל רו״ח</p>
            <p><span className="font-medium">SMTP_HOST</span> - שרת מייל יוצא</p>
            <p><span className="font-medium">SMTP_USER / SMTP_PASS</span> - פרטי כניסה</p>
            <p><span className="font-medium">NOTIFICATION_EMAIL</span> - מייל בעלים לסיכום יומי</p>
          </div>
        </div>
      </div>

      {/* Recurring modal */}
      <Modal open={showRecurring} onClose={() => setShowRecurring(false)} title="חשבונית חוזרת חדשה">
        <form onSubmit={addRecurring} className="space-y-4">
          <select required value={recurringForm.supplier_id} onChange={e => setRecurringForm({ ...recurringForm, supplier_id: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="">בחר ספק *</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input type="text" value={recurringForm.description} onChange={e => setRecurringForm({ ...recurringForm, description: e.target.value })}
            placeholder="תיאור (לדוגמה: שכירות חודשית)" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <input type="number" step="0.01" required value={recurringForm.expected_amount}
            onChange={e => setRecurringForm({ ...recurringForm, expected_amount: e.target.value })}
            placeholder="סכום צפוי *" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <input type="number" min="1" max="28" value={recurringForm.day_of_month}
            onChange={e => setRecurringForm({ ...recurringForm, day_of_month: e.target.value })}
            placeholder="יום בחודש" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <button type="submit" className="w-full px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
            הוסף חשבונית חוזרת
          </button>
        </form>
      </Modal>
    </div>
  );
}
