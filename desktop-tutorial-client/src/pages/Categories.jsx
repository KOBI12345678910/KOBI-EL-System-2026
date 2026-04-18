import { useState, useEffect } from 'react';
import api from '../api/client';

export default function Categories() {
  const [categories, setCategories] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [comparison, setComparison] = useState([]);
  const [newCat, setNewCat] = useState({ name: '', color: '#6366f1' });
  const [budgetForm, setBudgetForm] = useState({ category_id: '', month: new Date().getMonth() + 1, year: new Date().getFullYear(), amount: '' });

  useEffect(() => { load(); }, []);

  async function load() {
    const [c, b, comp] = await Promise.all([
      api.get('/categories'),
      api.get(`/budgets?year=${new Date().getFullYear()}`),
      api.get(`/budgets/vs-actual?year=${new Date().getFullYear()}&month=${new Date().getMonth() + 1}`),
    ]);
    setCategories(c.data);
    setBudgets(b.data);
    setComparison(comp.data.comparison || []);
  }

  async function addCategory(e) {
    e.preventDefault();
    await api.post('/categories', newCat);
    setNewCat({ name: '', color: '#6366f1' });
    load();
  }

  async function deleteCategory(id) {
    if (!confirm('למחוק קטגוריה?')) return;
    await api.delete(`/categories/${id}`);
    load();
  }

  async function saveBudget(e) {
    e.preventDefault();
    await api.post('/budgets', { ...budgetForm, amount: parseFloat(budgetForm.amount) });
    setBudgetForm({ ...budgetForm, amount: '' });
    load();
  }

  const monthNames = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">קטגוריות ותקציבים</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Categories */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">קטגוריות</h2>
          <form onSubmit={addCategory} className="flex gap-2 mb-4">
            <input type="text" required value={newCat.name} onChange={e => setNewCat({ ...newCat, name: e.target.value })}
              placeholder="שם קטגוריה חדשה" className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <input type="color" value={newCat.color} onChange={e => setNewCat({ ...newCat, color: e.target.value })}
              className="w-10 h-10 rounded-lg border border-gray-300 cursor-pointer" />
            <button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm">הוסף</button>
          </form>
          <div className="space-y-2">
            {categories.map(c => (
              <div key={c.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: c.color }} />
                  <span className="font-medium text-gray-800">{c.name}</span>
                </div>
                <button onClick={() => deleteCategory(c.id)} className="text-xs text-red-500 hover:text-red-700">מחק</button>
              </div>
            ))}
          </div>
        </div>

        {/* Budget form */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">הגדרת תקציב</h2>
          <form onSubmit={saveBudget} className="space-y-3">
            <select required value={budgetForm.category_id} onChange={e => setBudgetForm({ ...budgetForm, category_id: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="">בחר קטגוריה</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <select value={budgetForm.month} onChange={e => setBudgetForm({ ...budgetForm, month: parseInt(e.target.value) })}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
                {monthNames.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
              <input type="number" value={budgetForm.year} onChange={e => setBudgetForm({ ...budgetForm, year: parseInt(e.target.value) })}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <input type="number" step="0.01" required value={budgetForm.amount} onChange={e => setBudgetForm({ ...budgetForm, amount: e.target.value })}
              placeholder="סכום תקציב" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <button type="submit" className="w-full px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm">
              שמור תקציב
            </button>
          </form>
        </div>

        {/* Budget vs Actual */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 lg:col-span-2">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">
            תקציב מול בפועל - {monthNames[new Date().getMonth()]} {new Date().getFullYear()}
          </h2>
          {comparison.length === 0 ? (
            <p className="text-gray-400 text-sm">אין נתונים. הגדר תקציבים למעלה.</p>
          ) : (
            <div className="space-y-4">
              {comparison.filter(c => c.budget_amount > 0 || c.actual_amount > 0).map(c => {
                const pct = c.percentage;
                const overBudget = pct > 100;
                return (
                  <div key={c.category_id}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: c.category_color || '#6b7280' }} />
                        <span className="text-sm font-medium text-gray-700">{c.category_name || 'ללא קטגוריה'}</span>
                      </div>
                      <div className="text-sm text-left">
                        <span className={`font-semibold ${overBudget ? 'text-red-600' : 'text-gray-800'}`}>
                          ₪{c.actual_amount.toLocaleString()}
                        </span>
                        <span className="text-gray-400"> / ₪{c.budget_amount.toLocaleString()}</span>
                        <span className={`text-xs mr-2 ${overBudget ? 'text-red-600' : 'text-green-600'}`}>
                          ({pct}%)
                        </span>
                      </div>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div className={`h-3 rounded-full transition-all ${overBudget ? 'bg-red-500' : pct > 80 ? 'bg-yellow-500' : 'bg-green-500'}`}
                        style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
