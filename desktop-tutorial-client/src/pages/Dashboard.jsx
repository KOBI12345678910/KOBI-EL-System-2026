import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import SearchBar from '../components/ui/SearchBar';
import PaymentCalendar from '../components/ui/PaymentCalendar';
import ExportButtons from '../components/ui/ExportButtons';

function StatCard({ title, value, subtitle, color, onClick }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
  };
  return (
    <div className={`rounded-xl border p-5 ${colors[color]} ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`} onClick={onClick}>
      <p className="text-sm font-medium opacity-75">{title}</p>
      <p className="text-3xl font-bold mt-2">{value}</p>
      {subtitle && <p className="text-xs mt-1 opacity-60">{subtitle}</p>}
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [upcoming, setUpcoming] = useState([]);
  const [missing, setMissing] = useState([]);
  const [debts, setDebts] = useState({ bySupplier: [], totals: {} });

  useEffect(() => {
    Promise.all([
      api.get('/reports/dashboard').then(r => setStats(r.data)),
      api.get('/reports/upcoming').then(r => setUpcoming(r.data)),
      api.get('/reports/missing').then(r => setMissing(r.data)),
      api.get('/reports/debts').then(r => setDebts(r.data)),
    ]).catch(() => {});
  }, []);

  if (!stats) return <div className="text-center py-20 text-gray-400">טוען...</div>;

  return (
    <div>
      {/* Search + Title */}
      <div className="flex items-center justify-between mb-6 gap-4">
        <h1 className="text-2xl font-bold text-gray-800">דשבורד</h1>
        <div className="w-80">
          <SearchBar />
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex gap-2 mb-6">
        <button onClick={() => navigate('/invoices')} className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm">+ חשבונית חדשה</button>
        <button onClick={() => navigate('/suppliers')} className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 text-sm">+ ספק חדש</button>
        <button onClick={() => navigate('/payments')} className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 text-sm">רשום תשלום</button>
        <ExportButtons csvUrl="/api/export/csv/debts" pdfUrl="/api/export/pdf/debts" />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <StatCard title="סה״כ חוב" value={`₪${stats.totalDebt.toLocaleString()}`} color="red" onClick={() => navigate('/reports')} />
        <StatCard title="ממתינות לאישור" value={stats.pendingApproval} color="yellow" onClick={() => navigate('/approvals')} />
        <StatCard title="באיחור תשלום" value={stats.overduePayments} color="red" subtitle="חשבוניות שעבר מועד" />
        <StatCard title="חשבוניות החודש" value={stats.invoicesThisMonth} color="blue" subtitle={`שולם: ₪${stats.paidThisMonth.toLocaleString()}`} />
        <StatCard title="התראות" value={stats.unreadNotifications} color="purple" subtitle="לא נקראו" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upcoming payments */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800">תשלומים קרובים</h2>
            <ExportButtons pdfUrl="/api/export/pdf/debts" />
          </div>
          {upcoming.length === 0 ? (
            <p className="text-gray-400 text-sm">אין תשלומים קרובים</p>
          ) : (
            <div className="space-y-3">
              {upcoming.slice(0, 10).map(inv => (
                <div key={inv.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 cursor-pointer hover:bg-gray-100"
                  onClick={() => navigate(`/invoices/${inv.id}`)}>
                  <div>
                    <p className="font-medium text-gray-800">{inv.supplier_name}</p>
                    <p className="text-xs text-gray-500">
                      {inv.invoice_number && `חשבונית ${inv.invoice_number} • `}
                      לתשלום עד {new Date(inv.due_date).toLocaleDateString('he-IL')}
                    </p>
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-gray-800">₪{inv.amount.toLocaleString()}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      inv.urgency === 'overdue' ? 'bg-red-100 text-red-700' :
                      inv.urgency === 'soon' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-green-100 text-green-700'
                    }`}>
                      {inv.urgency === 'overdue' ? 'באיחור' : inv.urgency === 'soon' ? 'בקרוב' : 'עתידי'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Calendar */}
        <div>
          <PaymentCalendar />
        </div>

        {/* Debt by supplier */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">חוב לפי ספק</h2>
          {debts.bySupplier.length === 0 ? (
            <p className="text-gray-400 text-sm">אין חובות פתוחים</p>
          ) : (
            <div className="space-y-3">
              {debts.bySupplier.slice(0, 8).map(s => (
                <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 cursor-pointer hover:bg-gray-100"
                  onClick={() => navigate(`/suppliers/${s.id}`)}>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.category_color || '#6b7280' }} />
                    <div>
                      <p className="font-medium text-gray-800">{s.supplier_name}</p>
                      <p className="text-xs text-gray-500">{s.invoice_count} חשבוניות • {s.category_name || 'ללא קטגוריה'}</p>
                    </div>
                  </div>
                  <p className="font-bold text-red-600">₪{s.remaining_debt.toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Missing invoices */}
        {missing.length > 0 && (
          <div className="bg-white rounded-xl border border-red-200 p-5">
            <h2 className="text-lg font-semibold text-red-700 mb-4">חשבוניות חסרות</h2>
            <div className="space-y-2">
              {missing.map(s => (
                <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-red-50 cursor-pointer hover:bg-red-100"
                  onClick={() => navigate(`/suppliers/${s.id}`)}>
                  <div>
                    <p className="font-medium text-red-800">{s.name}</p>
                    <p className="text-xs text-red-600">{s.email || s.phone || 'אין פרטי קשר'}</p>
                  </div>
                  <span className="text-xs bg-red-200 text-red-800 px-2 py-1 rounded-full">חסר</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
