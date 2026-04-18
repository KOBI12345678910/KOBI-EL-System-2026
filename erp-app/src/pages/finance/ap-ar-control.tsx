import { useState, useEffect, useCallback } from "react";
import { authFetch } from "@/lib/utils";
import {
  Landmark, ArrowUpRight, ArrowDownRight, Users, ShoppingCart, AlertTriangle,
  Phone, Mail, MessageCircle, Scale, Plus, Trash2, CheckCircle, Clock,
  TrendingUp, TrendingDown, DollarSign, BarChart3, RefreshCw
} from "lucide-react";

interface AREntry { id: number; customer_id: number; customer_name: string; current_amount: string; days_30: string; days_60: string; days_90: string; days_120_plus: string; total_outstanding: string; last_payment_date: string | null; credit_limit: string; risk_level: string; snapshot_date: string; }
interface APEntry { id: number; supplier_id: number; supplier_name: string; current_amount: string; days_30: string; days_60: string; days_90: string; total_outstanding: string; next_payment_date: string | null; snapshot_date: string; }
interface Promise_ { id: number; customer_id: number; customer_name: string; promised_date: string; promised_amount: string; actual_amount: string | null; status: string; notes: string; }
interface CollectionTask { id: number; customer_id: number; customer_name: string; assigned_to: string; task_type: string; due_date: string; notes: string; status: string; }
interface CashPosition { total_receivable: number; total_payable: number; net_position: number; liquidity_ratio: number; ar_at_risk: number; ar_overdue: number; }

const fmtILS = (v: number | string) => {
  const n = typeof v === "string" ? parseFloat(v) || 0 : v;
  return n.toLocaleString("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 });
};

const riskColors: Record<string, string> = { low: "bg-green-100 text-green-700", medium: "bg-yellow-100 text-yellow-700", high: "bg-orange-100 text-orange-700", critical: "bg-red-100 text-red-700" };
const riskLabels: Record<string, string> = { low: "נמוך", medium: "בינוני", high: "גבוה", critical: "קריטי" };
const taskTypeIcons: Record<string, any> = { call: Phone, email: Mail, whatsapp: MessageCircle, legal: Scale };
const taskTypeLabels: Record<string, string> = { call: "שיחה", email: "מייל", whatsapp: "ווטסאפ", legal: "משפטי" };
const statusLabels: Record<string, string> = { pending: "ממתין", kept: "קויים", broken: "הופר", completed: "הושלם", escalated: "הוסלם" };

export default function ApArControlPage() {
  const [tab, setTab] = useState<"ar" | "ap" | "cash" | "collections" | "promises">("ar");
  const [arData, setArData] = useState<AREntry[]>([]);
  const [apData, setApData] = useState<APEntry[]>([]);
  const [cashPos, setCashPos] = useState<CashPosition | null>(null);
  const [promises, setPromises] = useState<Promise_[]>([]);
  const [tasks, setTasks] = useState<CollectionTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewPromise, setShowNewPromise] = useState(false);
  const [showNewTask, setShowNewTask] = useState(false);

  const [promiseForm, setPromiseForm] = useState({ customer_name: "", promised_date: "", promised_amount: "", notes: "" });
  const [taskForm, setTaskForm] = useState({ customer_name: "", assigned_to: "", task_type: "call", due_date: "", notes: "" });

  const loadAll = useCallback(async () => {
    try {
      const [arRes, apRes, cashRes, promRes, taskRes] = await window.Promise.all([
        authFetch("/api/ap-ar/ar-aging"), authFetch("/api/ap-ar/ap-aging"),
        authFetch("/api/ap-ar/cash-position"), authFetch("/api/ap-ar/promises"),
        authFetch("/api/ap-ar/collection-tasks"),
      ]);
      setArData(await arRes.json());
      setApData(await apRes.json());
      setCashPos(await cashRes.json());
      setPromises(await promRes.json());
      setTasks(await taskRes.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const addPromise = async () => {
    await authFetch("/api/ap-ar/promises", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(promiseForm) });
    setShowNewPromise(false);
    setPromiseForm({ customer_name: "", promised_date: "", promised_amount: "", notes: "" });
    const r = await authFetch("/api/ap-ar/promises"); setPromises(await r.json());
  };

  const updatePromiseStatus = async (id: number, status: string) => {
    await authFetch(`/api/ap-ar/promises/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    const r = await authFetch("/api/ap-ar/promises"); setPromises(await r.json());
  };

  const addTask = async () => {
    await authFetch("/api/ap-ar/collection-tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(taskForm) });
    setShowNewTask(false);
    setTaskForm({ customer_name: "", assigned_to: "", task_type: "call", due_date: "", notes: "" });
    const r = await authFetch("/api/ap-ar/collection-tasks"); setTasks(await r.json());
  };

  const updateTaskStatus = async (id: number, status: string) => {
    await authFetch(`/api/ap-ar/collection-tasks/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    const r = await authFetch("/api/ap-ar/collection-tasks"); setTasks(await r.json());
  };

  const totalAR = arData.reduce((s, r) => s + parseFloat(r.total_outstanding || "0"), 0);
  const totalAP = apData.reduce((s, r) => s + parseFloat(r.total_outstanding || "0"), 0);

  if (loading) return <div className="p-8 text-center text-gray-400">טוען נתוני חייבים/זכאים...</div>;

  return (
    <div className="p-4 space-y-6" dir="rtl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Landmark className="w-7 h-7 text-indigo-600" />
          מרכז חייבים / זכאים
        </h1>
        <p className="text-sm text-gray-500 mt-1">ניהול גבייה, תשלומים, ומצב מזומנים</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1"><ArrowUpRight className="w-4 h-4 text-green-500" /> חייבים (AR)</div>
          <div className="text-2xl font-bold text-green-600">{fmtILS(totalAR)}</div>
          <div className="text-xs text-gray-400">{arData.length} לקוחות</div>
        </div>
        <div className="bg-white rounded-xl border p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1"><ArrowDownRight className="w-4 h-4 text-red-500" /> זכאים (AP)</div>
          <div className="text-2xl font-bold text-red-600">{fmtILS(totalAP)}</div>
          <div className="text-xs text-gray-400">{apData.length} ספקים</div>
        </div>
        <div className="bg-white rounded-xl border p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1"><DollarSign className="w-4 h-4" /> מצב נטו</div>
          <div className={`text-2xl font-bold ${(cashPos?.net_position || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>{fmtILS(cashPos?.net_position || 0)}</div>
        </div>
        <div className="bg-white rounded-xl border p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1"><AlertTriangle className="w-4 h-4 text-orange-500" /> AR בסיכון</div>
          <div className="text-2xl font-bold text-orange-600">{fmtILS(cashPos?.ar_at_risk || 0)}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b overflow-x-auto">
        {([["ar", "חייבים (AR)"], ["ap", "זכאים (AP)"], ["cash", "מצב מזומנים"], ["collections", "גבייה"], ["promises", "הבטחות"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap ${tab === key ? "border-indigo-600 text-indigo-600" : "border-transparent text-gray-500"}`}>{label}</button>
        ))}
      </div>

      {/* AR Aging */}
      {tab === "ar" && (
        <div className="bg-white rounded-xl border shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-right p-3">לקוח</th>
                <th className="text-right p-3">שוטף</th>
                <th className="text-right p-3 bg-green-50">30 יום</th>
                <th className="text-right p-3 bg-yellow-50">60 יום</th>
                <th className="text-right p-3 bg-orange-50">90 יום</th>
                <th className="text-right p-3 bg-red-50">120+ יום</th>
                <th className="text-right p-3 font-bold">סה"כ</th>
                <th className="text-right p-3">מגבלת אשראי</th>
                <th className="text-right p-3">סיכון</th>
              </tr>
            </thead>
            <tbody>
              {arData.map((r) => (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <td className="p-3 font-medium">{r.customer_name}</td>
                  <td className="p-3">{fmtILS(r.current_amount)}</td>
                  <td className="p-3 bg-green-50/50">{fmtILS(r.days_30)}</td>
                  <td className="p-3 bg-yellow-50/50">{fmtILS(r.days_60)}</td>
                  <td className="p-3 bg-orange-50/50">{fmtILS(r.days_90)}</td>
                  <td className="p-3 bg-red-50/50">{fmtILS(r.days_120_plus)}</td>
                  <td className="p-3 font-bold">{fmtILS(r.total_outstanding)}</td>
                  <td className="p-3 text-gray-500">{fmtILS(r.credit_limit)}</td>
                  <td className="p-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${riskColors[r.risk_level]}`}>{riskLabels[r.risk_level]}</span></td>
                </tr>
              ))}
              {arData.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-gray-400">אין נתוני חייבים</td></tr>}
            </tbody>
            {arData.length > 0 && (
              <tfoot className="bg-gray-100 font-bold">
                <tr>
                  <td className="p-3">סה"כ</td>
                  <td className="p-3">{fmtILS(arData.reduce((s, r) => s + parseFloat(r.current_amount || "0"), 0))}</td>
                  <td className="p-3">{fmtILS(arData.reduce((s, r) => s + parseFloat(r.days_30 || "0"), 0))}</td>
                  <td className="p-3">{fmtILS(arData.reduce((s, r) => s + parseFloat(r.days_60 || "0"), 0))}</td>
                  <td className="p-3">{fmtILS(arData.reduce((s, r) => s + parseFloat(r.days_90 || "0"), 0))}</td>
                  <td className="p-3">{fmtILS(arData.reduce((s, r) => s + parseFloat(r.days_120_plus || "0"), 0))}</td>
                  <td className="p-3">{fmtILS(totalAR)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* AP Aging */}
      {tab === "ap" && (
        <div className="bg-white rounded-xl border shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-right p-3">ספק</th>
                <th className="text-right p-3">שוטף</th>
                <th className="text-right p-3 bg-green-50">30 יום</th>
                <th className="text-right p-3 bg-yellow-50">60 יום</th>
                <th className="text-right p-3 bg-orange-50">90 יום</th>
                <th className="text-right p-3 font-bold">סה"כ</th>
                <th className="text-right p-3">תשלום הבא</th>
              </tr>
            </thead>
            <tbody>
              {apData.map((r) => (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <td className="p-3 font-medium">{r.supplier_name}</td>
                  <td className="p-3">{fmtILS(r.current_amount)}</td>
                  <td className="p-3 bg-green-50/50">{fmtILS(r.days_30)}</td>
                  <td className="p-3 bg-yellow-50/50">{fmtILS(r.days_60)}</td>
                  <td className="p-3 bg-orange-50/50">{fmtILS(r.days_90)}</td>
                  <td className="p-3 font-bold">{fmtILS(r.total_outstanding)}</td>
                  <td className="p-3 text-gray-500">{r.next_payment_date?.slice(0, 10) || "-"}</td>
                </tr>
              ))}
              {apData.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-gray-400">אין נתוני זכאים</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Cash Position */}
      {tab === "cash" && cashPos && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border p-6 shadow-sm space-y-4">
            <h3 className="text-lg font-semibold text-gray-800">מצב מזומנים נטו</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-gray-600">סה"כ חייבים (חייבים לנו)</span>
                <span className="text-green-600 font-bold text-lg">{fmtILS(cashPos.total_receivable)}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-gray-600">סה"כ זכאים (אנחנו חייבים)</span>
                <span className="text-red-600 font-bold text-lg">{fmtILS(cashPos.total_payable)}</span>
              </div>
              <div className="flex justify-between items-center py-3 bg-gray-50 rounded-lg px-3">
                <span className="text-gray-800 font-semibold">מצב נטו</span>
                <span className={`font-bold text-2xl ${cashPos.net_position >= 0 ? "text-green-600" : "text-red-600"}`}>{fmtILS(cashPos.net_position)}</span>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border p-6 shadow-sm space-y-4">
            <h3 className="text-lg font-semibold text-gray-800">מדדי נזילות</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-gray-600">יחס נזילות</span>
                <span className={`font-bold text-lg ${cashPos.liquidity_ratio >= 1.5 ? "text-green-600" : cashPos.liquidity_ratio >= 1 ? "text-yellow-600" : "text-red-600"}`}>{cashPos.liquidity_ratio.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-gray-600">AR בסיכון</span>
                <span className="text-orange-600 font-bold">{fmtILS(cashPos.ar_at_risk)}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-gray-600">AR באיחור (90+ יום)</span>
                <span className="text-red-600 font-bold">{fmtILS(cashPos.ar_overdue)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Collection Tasks */}
      {tab === "collections" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-gray-700">משימות גבייה</h3>
            <button onClick={() => setShowNewTask(true)} className="flex items-center gap-1 bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm"><Plus className="w-4 h-4" /> משימה חדשה</button>
          </div>
          {showNewTask && (
            <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-200 grid grid-cols-2 md:grid-cols-5 gap-3">
              <input placeholder="לקוח" value={taskForm.customer_name} onChange={(e) => setTaskForm({ ...taskForm, customer_name: e.target.value })} className="border rounded-lg px-3 py-2 text-sm" />
              <input placeholder="אחראי" value={taskForm.assigned_to} onChange={(e) => setTaskForm({ ...taskForm, assigned_to: e.target.value })} className="border rounded-lg px-3 py-2 text-sm" />
              <select value={taskForm.task_type} onChange={(e) => setTaskForm({ ...taskForm, task_type: e.target.value })} className="border rounded-lg px-3 py-2 text-sm">
                <option value="call">שיחה</option><option value="email">מייל</option><option value="whatsapp">ווטסאפ</option><option value="legal">משפטי</option>
              </select>
              <input type="date" value={taskForm.due_date} onChange={(e) => setTaskForm({ ...taskForm, due_date: e.target.value })} className="border rounded-lg px-3 py-2 text-sm" />
              <div className="flex gap-2">
                <button onClick={addTask} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm">הוסף</button>
                <button onClick={() => setShowNewTask(false)} className="text-gray-500 text-sm">ביטול</button>
              </div>
            </div>
          )}
          <div className="bg-white rounded-xl border shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50"><tr>
                <th className="text-right p-3">לקוח</th><th className="text-right p-3">סוג</th><th className="text-right p-3">אחראי</th><th className="text-right p-3">תאריך יעד</th><th className="text-right p-3">הערות</th><th className="text-right p-3">סטטוס</th><th className="p-3">פעולות</th>
              </tr></thead>
              <tbody>
                {tasks.map((t) => {
                  const Icon = taskTypeIcons[t.task_type] || Phone;
                  return (
                    <tr key={t.id} className="border-t hover:bg-gray-50">
                      <td className="p-3 font-medium">{t.customer_name}</td>
                      <td className="p-3"><span className="flex items-center gap-1"><Icon className="w-3.5 h-3.5" />{taskTypeLabels[t.task_type]}</span></td>
                      <td className="p-3">{t.assigned_to}</td>
                      <td className="p-3">{t.due_date?.slice(0, 10)}</td>
                      <td className="p-3 text-gray-500 max-w-[200px] truncate">{t.notes}</td>
                      <td className="p-3"><span className={`px-2 py-0.5 rounded-full text-xs ${t.status === "completed" ? "bg-green-100 text-green-700" : t.status === "escalated" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-700"}`}>{statusLabels[t.status]}</span></td>
                      <td className="p-3">
                        <div className="flex gap-1">
                          {t.status === "pending" && <button onClick={() => updateTaskStatus(t.id, "completed")} className="text-green-600 hover:bg-green-50 p-1 rounded"><CheckCircle className="w-4 h-4" /></button>}
                          {t.status === "pending" && <button onClick={() => updateTaskStatus(t.id, "escalated")} className="text-red-500 hover:bg-red-50 p-1 rounded"><AlertTriangle className="w-4 h-4" /></button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {tasks.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-gray-400">אין משימות גבייה</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Promises */}
      {tab === "promises" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-gray-700">הבטחות תשלום</h3>
            <button onClick={() => setShowNewPromise(true)} className="flex items-center gap-1 bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm"><Plus className="w-4 h-4" /> הבטחה חדשה</button>
          </div>
          {showNewPromise && (
            <div className="bg-purple-50 rounded-xl p-4 border border-purple-200 grid grid-cols-2 md:grid-cols-4 gap-3">
              <input placeholder="לקוח" value={promiseForm.customer_name} onChange={(e) => setPromiseForm({ ...promiseForm, customer_name: e.target.value })} className="border rounded-lg px-3 py-2 text-sm" />
              <input type="date" value={promiseForm.promised_date} onChange={(e) => setPromiseForm({ ...promiseForm, promised_date: e.target.value })} className="border rounded-lg px-3 py-2 text-sm" />
              <input type="number" placeholder="סכום" value={promiseForm.promised_amount} onChange={(e) => setPromiseForm({ ...promiseForm, promised_amount: e.target.value })} className="border rounded-lg px-3 py-2 text-sm" />
              <div className="flex gap-2">
                <button onClick={addPromise} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm">הוסף</button>
                <button onClick={() => setShowNewPromise(false)} className="text-gray-500 text-sm">ביטול</button>
              </div>
            </div>
          )}
          <div className="bg-white rounded-xl border shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50"><tr>
                <th className="text-right p-3">לקוח</th><th className="text-right p-3">תאריך הבטחה</th><th className="text-right p-3">סכום</th><th className="text-right p-3">סטטוס</th><th className="p-3">פעולות</th>
              </tr></thead>
              <tbody>
                {promises.map((p) => (
                  <tr key={p.id} className="border-t hover:bg-gray-50">
                    <td className="p-3 font-medium">{p.customer_name}</td>
                    <td className="p-3">{p.promised_date?.slice(0, 10)}</td>
                    <td className="p-3 font-bold">{fmtILS(p.promised_amount)}</td>
                    <td className="p-3"><span className={`px-2 py-0.5 rounded-full text-xs ${p.status === "kept" ? "bg-green-100 text-green-700" : p.status === "broken" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>{statusLabels[p.status]}</span></td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        {p.status === "pending" && <button onClick={() => updatePromiseStatus(p.id, "kept")} className="text-green-600 hover:bg-green-50 p-1 rounded text-xs">קויים</button>}
                        {p.status === "pending" && <button onClick={() => updatePromiseStatus(p.id, "broken")} className="text-red-500 hover:bg-red-50 p-1 rounded text-xs">הופר</button>}
                      </div>
                    </td>
                  </tr>
                ))}
                {promises.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-gray-400">אין הבטחות תשלום</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
