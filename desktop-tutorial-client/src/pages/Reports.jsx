import { useState, useEffect } from 'react';
import api from '../api/client';
import ExportButtons from '../components/ui/ExportButtons';

export default function Reports() {
  const [costs, setCosts] = useState({ byCategory: [], monthlyTrend: [], topSuppliers: [] });
  const [debts, setDebts] = useState({ bySupplier: [], totals: {} });
  const [comparison, setComparison] = useState([]);

  useEffect(() => {
    const now = new Date();
    Promise.all([
      api.get('/reports/costs').then(r => setCosts(r.data)),
      api.get('/reports/debts').then(r => setDebts(r.data)),
      api.get(`/budgets/vs-actual?year=${now.getFullYear()}&month=${now.getMonth() + 1}`).then(r => setComparison(r.data.comparison || [])),
    ]).catch(() => {});
  }, []);

  const maxCost = Math.max(...costs.topSuppliers.map(s => s.total), 1);
  const maxMonthly = Math.max(...costs.monthlyTrend.map(m => m.total), 1);

  // VAT summary
  const totalVAT = costs.monthlyTrend.reduce((s, m) => s + m.total, 0) * 0.18 / 1.18;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">דוחות וניתוח</h1>
        <div className="flex gap-2">
          <ExportButtons csvUrl="/api/export/csv/invoices" pdfUrl="/api/export/pdf/invoices" />
          <ExportButtons csvUrl="/api/export/csv/debts" pdfUrl="/api/export/pdf/debts" />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500">סה״כ חוב פתוח</p>
          <p className="text-3xl font-bold text-red-600 mt-2">₪{(debts.totals.total_debt || 0).toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">{debts.totals.total_invoices || 0} חשבוניות</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500">סכום באיחור</p>
          <p className="text-3xl font-bold text-orange-600 mt-2">₪{(debts.totals.overdue_amount || 0).toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">{debts.totals.overdue_count || 0} חשבוניות באיחור</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500">מע״מ (הערכה שנתית)</p>
          <p className="text-3xl font-bold text-purple-600 mt-2">₪{Math.round(totalVAT).toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">18% מתוך הוצאות</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500">קטגוריות פעילות</p>
          <p className="text-3xl font-bold text-primary-600 mt-2">{costs.byCategory.length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly trend */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800">מגמה חודשית (12 חודשים)</h2>
          </div>
          {costs.monthlyTrend.length === 0 ? (
            <p className="text-gray-400 text-sm">אין נתונים</p>
          ) : (
            <div className="space-y-2">
              {costs.monthlyTrend.map(m => (
                <div key={m.month} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-16">{m.month}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                    <div className="bg-primary-500 h-full rounded-full flex items-center justify-end px-2"
                      style={{ width: `${(m.total / maxMonthly) * 100}%`, minWidth: '40px' }}>
                      <span className="text-xs text-white font-medium">₪{m.total.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* By category */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">עלויות לפי קטגוריה</h2>
          {costs.byCategory.length === 0 ? (
            <p className="text-gray-400 text-sm">אין נתונים</p>
          ) : (
            <div className="space-y-3">
              {costs.byCategory.map(c => {
                const total = costs.byCategory.reduce((s, x) => s + x.total, 0);
                const pct = total > 0 ? ((c.total / total) * 100).toFixed(1) : 0;
                return (
                  <div key={c.category} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: c.color || '#6b7280' }} />
                      <span className="text-sm text-gray-700">{c.category || 'ללא קטגוריה'}</span>
                    </div>
                    <div className="text-sm">
                      <span className="font-semibold text-gray-800">₪{c.total.toLocaleString()}</span>
                      <span className="text-gray-400 mr-2">({pct}%)</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Budget vs Actual */}
        {comparison.filter(c => c.budget_amount > 0 || c.actual_amount > 0).length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">תקציב מול בפועל (החודש)</h2>
            <div className="space-y-3">
              {comparison.filter(c => c.budget_amount > 0 || c.actual_amount > 0).map(c => {
                const pct = c.percentage;
                const over = pct > 100;
                return (
                  <div key={c.category_id}>
                    <div className="flex items-center justify-between mb-1 text-sm">
                      <span className="text-gray-700">{c.category_name}</span>
                      <span className={over ? 'text-red-600 font-semibold' : 'text-gray-600'}>
                        ₪{c.actual_amount.toLocaleString()} / ₪{c.budget_amount.toLocaleString()} ({pct}%)
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                      <div className={`h-2.5 rounded-full ${over ? 'bg-red-500' : pct > 80 ? 'bg-yellow-500' : 'bg-green-500'}`}
                        style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Top suppliers */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 lg:col-span-2">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">10 ספקים גדולים</h2>
          {costs.topSuppliers.length === 0 ? (
            <p className="text-gray-400 text-sm">אין נתונים</p>
          ) : (
            <div className="space-y-2">
              {costs.topSuppliers.map((s, i) => (
                <div key={s.name} className="flex items-center gap-3">
                  <span className="text-sm text-gray-400 w-6">{i + 1}.</span>
                  <span className="text-sm text-gray-700 w-32 truncate">{s.name}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                    <div className="bg-indigo-500 h-full rounded-full" style={{ width: `${(s.total / maxCost) * 100}%` }} />
                  </div>
                  <span className="text-sm font-semibold text-gray-800 w-28 text-left">₪{s.total.toLocaleString()}</span>
                  <span className="text-xs text-gray-400">({s.count})</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
