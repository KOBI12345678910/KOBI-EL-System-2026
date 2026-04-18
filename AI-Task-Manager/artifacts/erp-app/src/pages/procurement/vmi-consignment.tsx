import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Package, Truck, AlertTriangle, RefreshCw, Plus, BarChart3,
  Gauge, FileText, Clock, CheckCircle2, DollarSign, Warehouse,
  ArrowDown, ArrowUp, Zap, Bell
} from "lucide-react";
import { authFetch } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area
} from "recharts";

const API = "/api";
const headers = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("erp_token") || ""}`
});

const COLORS = ["#6366f1","#f59e0b","#ef4444","#10b981","#8b5cf6","#ec4899"];
const fmtC = (n: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(n);

function StockGauge({ current, min, max, reorder, label }: { current: number; min: number; max: number; reorder: number; label: string }) {
  const pct = max > 0 ? Math.min((current / max) * 100, 100) : 0;
  const reorderPct = max > 0 ? (reorder / max) * 100 : 0;
  const color = current <= reorder ? '#ef4444' : current <= min ? '#f59e0b' : current >= max * 0.9 ? '#8b5cf6' : '#10b981';

  return (
    <div className="flex flex-col items-center">
      <span className="text-xs text-muted-foreground mb-1 text-center truncate max-w-[100px]">{label}</span>
      <div className="relative w-16 h-16">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
          <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none" stroke="#333" strokeWidth="3" />
          <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none" stroke={color} strokeWidth="3" strokeDasharray={`${pct}, 100`} />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold" style={{ color }}>{current}</span>
      </div>
    </div>
  );
}

export default function VmiConsignmentPage() {
  const [dashboard, setDashboard] = useState<any>(null);
  const [agreements, setAgreements] = useState<any[]>([]);
  const [stockLevels, setStockLevels] = useState<any[]>([]);
  const [triggers, setTriggers] = useState<any[]>([]);
  const [consignment, setConsignment] = useState<any[]>([]);
  const [tab, setTab] = useState<"dashboard"|"agreements"|"stock"|"consignment">("dashboard");
  const [loading, setLoading] = useState(true);
  const [showAddAgreement, setShowAddAgreement] = useState(false);
  const [newAgr, setNewAgr] = useState({ supplier_name: '', item_name: '', min_level: 10, max_level: 100, reorder_point: 20, lead_time_days: 7, review_frequency: 'weekly' });

  const load = async () => {
    setLoading(true);
    try {
      const [dRes, aRes, sRes, tRes, cRes] = await Promise.all([
        authFetch(`${API}/vmi/dashboard`, { headers: headers() }),
        authFetch(`${API}/vmi/agreements`, { headers: headers() }),
        authFetch(`${API}/vmi/stock-levels`, { headers: headers() }),
        authFetch(`${API}/vmi/replenishment-triggers`, { headers: headers() }),
        authFetch(`${API}/vmi/consignment-stock`, { headers: headers() })
      ]);
      setDashboard(await dRes.json());
      setAgreements(await aRes.json());
      setStockLevels(await sRes.json());
      setTriggers(await tRes.json());
      setConsignment(await cRes.json());
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const addAgreement = async () => {
    await authFetch(`${API}/vmi/agreements`, { method: "POST", headers: headers(), body: JSON.stringify(newAgr) });
    setShowAddAgreement(false);
    load();
  };

  const checkReplenishment = async () => {
    await authFetch(`${API}/vmi/check-replenishment`, { method: "POST", headers: headers() });
    load();
  };

  const reconcile = async (supplierId: number) => {
    await authFetch(`${API}/vmi/reconcile/${supplierId}`, { method: "POST", headers: headers() });
    load();
  };

  const tabs = [
    { key: "dashboard", label: "דשבורד", icon: BarChart3 },
    { key: "agreements", label: "הסכמי VMI", icon: FileText },
    { key: "stock", label: "מלאי וחידוש", icon: Package },
    { key: "consignment", label: "קונסיגנציה", icon: Warehouse }
  ] as const;

  const freqLabels: Record<string,string> = { daily: 'יומי', weekly: 'שבועי', biweekly: 'דו-שבועי', monthly: 'חודשי' };
  const statusLabels: Record<string,string> = { active: 'פעיל', suspended: 'מושעה', expired: 'פג תוקף', draft: 'טיוטה', triggered: 'נוצר', ordered: 'הוזמן', received: 'התקבל', cancelled: 'בוטל' };
  const stockStatusLabels: Record<string,string> = { critical: 'קריטי', low: 'נמוך', normal: 'תקין', overstocked: 'עודף' };
  const stockStatusColors: Record<string,string> = { critical: 'bg-red-500/20 text-red-300', low: 'bg-amber-500/20 text-amber-300', normal: 'bg-emerald-500/20 text-emerald-300', overstocked: 'bg-purple-500/20 text-purple-300' };

  if (loading) return <div className="flex items-center justify-center h-96"><RefreshCw className="w-8 h-8 animate-spin text-indigo-400" /></div>;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-l from-teal-400 to-cyan-400 bg-clip-text text-transparent">
            VMI וקונסיגנציה
          </h1>
          <p className="text-muted-foreground mt-1">ניהול מלאי ספק, חידוש אוטומטי וקונסיגנציה</p>
        </div>
        <div className="flex gap-2">
          <button onClick={checkReplenishment} className="flex items-center gap-1 px-3 py-2 bg-amber-500/20 text-amber-300 rounded-lg text-sm hover:bg-amber-500/30">
            <Zap className="w-4 h-4" />בדיקת חידוש
          </button>
          <button onClick={() => setShowAddAgreement(true)} className="flex items-center gap-1 px-3 py-2 bg-teal-500/20 text-teal-300 rounded-lg text-sm hover:bg-teal-500/30">
            <Plus className="w-4 h-4" />הסכם חדש
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: FileText, label: 'הסכמים פעילים', value: dashboard?.agreementStats?.find((a: any) => a.status === 'active')?.count || 0, color: 'from-teal-500/20 to-teal-600/5', ic: 'text-teal-400' },
          { icon: Bell, label: 'חידושים ממתינים', value: dashboard?.pendingReplenishments || 0, color: 'from-amber-500/20 to-amber-600/5', ic: 'text-amber-400' },
          { icon: AlertTriangle, label: 'התראות מלאי', value: dashboard?.stockAlerts?.length || 0, color: 'from-red-500/20 to-red-600/5', ic: 'text-red-400' },
          { icon: DollarSign, label: 'קונסיגנציה לא מחויבת', value: fmtC(dashboard?.uninvoicedConsignment || 0), color: 'from-indigo-500/20 to-indigo-600/5', ic: 'text-indigo-400' }
        ].map((s, i) => (
          <motion.div key={i} initial={{ opacity:0,y:10 }} animate={{ opacity:1,y:0 }} transition={{ delay:i*0.1 }}
            className={`bg-gradient-to-br ${s.color} border border-white/10 rounded-2xl p-5`}>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2"><s.icon className={`w-4 h-4 ${s.ic}`} />{s.label}</div>
            <div className="text-2xl font-bold">{s.value}</div>
          </motion.div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-white/10 pb-2">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition ${
              tab === t.key ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30' : 'text-muted-foreground hover:bg-white/5'
            }`}>
            <t.icon className="w-4 h-4" />{t.label}
          </button>
        ))}
      </div>

      {/* Dashboard */}
      {tab === "dashboard" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Stock Alerts */}
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} className="bg-card border border-white/10 rounded-2xl p-5">
            <h3 className="font-semibold mb-4 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-400" />התראות מלאי</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {(dashboard?.stockAlerts || []).map((a: any) => (
                <div key={a.id} className="flex items-center justify-between p-2 rounded-lg bg-red-500/5 border border-red-500/10 text-sm">
                  <div>
                    <span className="font-medium">{a.item_name}</span>
                    <span className="text-xs text-muted-foreground mr-2">{a.supplier_name}</span>
                  </div>
                  <div className="text-xs text-red-400">{Number(a.current_qty)} / {Number(a.min_level)}</div>
                </div>
              ))}
              {(dashboard?.stockAlerts || []).length === 0 && <p className="text-center text-muted-foreground py-4">אין התראות</p>}
            </div>
          </motion.div>

          {/* Consignment by Supplier */}
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} className="bg-card border border-white/10 rounded-2xl p-5">
            <h3 className="font-semibold mb-4 flex items-center gap-2"><Warehouse className="w-4 h-4 text-indigo-400" />קונסיגנציה לפי ספק</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={(dashboard?.consignmentBySupplier || []).map((s: any) => ({
                supplier: s.supplier_name, onHand: Number(s.on_hand_value), consumed: Number(s.consumed_value)
              }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="supplier" stroke="#666" tick={{ fontSize: 10 }} />
                <YAxis stroke="#666" />
                <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid #333' }} formatter={(v: number) => fmtC(v)} />
                <Bar dataKey="onHand" name="ביד" fill="#6366f1" radius={[4,4,0,0]} />
                <Bar dataKey="consumed" name="נצרך" fill="#f59e0b" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </motion.div>

          {/* Stock Level Gauges */}
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} className="bg-card border border-white/10 rounded-2xl p-5 lg:col-span-2">
            <h3 className="font-semibold mb-4 flex items-center gap-2"><Gauge className="w-4 h-4 text-teal-400" />מדדי מלאי VMI</h3>
            <div className="flex flex-wrap gap-4 justify-center">
              {stockLevels.slice(0, 12).map(s => (
                <StockGauge key={s.id} current={Number(s.current_qty)} min={Number(s.min_level || 0)}
                  max={Number(s.max_level || 100)} reorder={Number(s.reorder_point || 0)}
                  label={s.item_name || `פריט #${s.agreement_id}`} />
              ))}
            </div>
          </motion.div>
        </div>
      )}

      {/* Agreements Tab */}
      {tab === "agreements" && (
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} className="grid gap-3">
          {agreements.map(a => (
            <div key={a.id} className={`bg-card border rounded-xl p-4 ${a.status === 'active' ? 'border-teal-500/20' : 'border-white/10'}`}>
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium">{a.item_name || `פריט #${a.item_id}`}</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-teal-500/20 text-teal-300">{statusLabels[a.status]}</span>
                  </div>
                  <span className="text-sm text-muted-foreground">{a.supplier_name || `ספק #${a.supplier_id}`}</span>
                  <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                    <span>מינימום: {Number(a.min_level)}</span>
                    <span>מקסימום: {Number(a.max_level)}</span>
                    <span>נקודת הזמנה: {Number(a.reorder_point)}</span>
                    <span>זמן אספקה: {a.lead_time_days} ימים</span>
                    <span>תדירות: {freqLabels[a.review_frequency]}</span>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {a.start_date?.slice(0,10)} - {a.end_date?.slice(0,10) || 'ללא'}
                </div>
              </div>
            </div>
          ))}
          {agreements.length === 0 && <p className="text-center text-muted-foreground py-12">אין הסכמי VMI עדיין</p>}
        </motion.div>
      )}

      {/* Stock & Replenishment Tab */}
      {tab === "stock" && (
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} className="space-y-6">
          <div className="bg-card border border-white/10 rounded-2xl p-5">
            <h3 className="font-semibold mb-4">רמות מלאי VMI</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-muted-foreground text-xs">
                    <th className="text-right py-2 px-2">פריט</th>
                    <th className="text-right py-2 px-2">ספק</th>
                    <th className="text-center py-2 px-2">כמות</th>
                    <th className="text-center py-2 px-2">מצב</th>
                    <th className="text-center py-2 px-2">עדכון אחרון</th>
                  </tr>
                </thead>
                <tbody>
                  {stockLevels.map(s => (
                    <tr key={s.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                      <td className="py-2 px-2">{s.item_name || `פריט #${s.agreement_id}`}</td>
                      <td className="py-2 px-2 text-muted-foreground">{s.supplier_name}</td>
                      <td className="py-2 px-2 text-center font-medium">{Number(s.current_qty)}</td>
                      <td className="py-2 px-2 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded ${stockStatusColors[s.stock_status] || ''}`}>
                          {stockStatusLabels[s.stock_status] || s.stock_status}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-center text-xs text-muted-foreground">{s.last_updated?.slice(0,10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-card border border-white/10 rounded-2xl p-5">
            <h3 className="font-semibold mb-4 flex items-center gap-2"><Truck className="w-4 h-4 text-amber-400" />טריגרים לחידוש</h3>
            <div className="space-y-2">
              {triggers.map(t => (
                <div key={t.id} className="flex items-center justify-between p-3 rounded-lg border border-white/5 bg-white/[0.02]">
                  <div>
                    <span className="text-sm font-medium">{t.item_name || `הסכם #${t.agreement_id}`}</span>
                    <span className="text-xs text-muted-foreground mr-2">{t.supplier_name}</span>
                    <span className="text-xs text-muted-foreground mr-2">כמות: {Number(t.trigger_qty)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      t.status === 'received' ? 'bg-emerald-500/20 text-emerald-300' :
                      t.status === 'ordered' ? 'bg-indigo-500/20 text-indigo-300' :
                      'bg-amber-500/20 text-amber-300'
                    }`}>{statusLabels[t.status]}</span>
                    <span className="text-xs text-muted-foreground">{t.trigger_date?.slice(0,10)}</span>
                  </div>
                </div>
              ))}
              {triggers.length === 0 && <p className="text-center text-muted-foreground py-4">אין טריגרים</p>}
            </div>
          </div>
        </motion.div>
      )}

      {/* Consignment Tab */}
      {tab === "consignment" && (
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} className="space-y-4">
          <div className="overflow-x-auto bg-card border border-white/10 rounded-2xl p-5">
            <h3 className="font-semibold mb-4">מלאי קונסיגנציה</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-muted-foreground text-xs">
                  <th className="text-right py-2 px-2">ספק</th>
                  <th className="text-right py-2 px-2">פריט</th>
                  <th className="text-center py-2 px-2">ביד</th>
                  <th className="text-center py-2 px-2">נצרך</th>
                  <th className="text-center py-2 px-2">מחיר</th>
                  <th className="text-center py-2 px-2">שווי ביד</th>
                  <th className="text-center py-2 px-2">שווי נצרך</th>
                  <th className="text-center py-2 px-2">פעולה</th>
                </tr>
              </thead>
              <tbody>
                {consignment.map(c => (
                  <tr key={c.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="py-2 px-2">{c.supplier_name}</td>
                    <td className="py-2 px-2">{c.item_name}</td>
                    <td className="py-2 px-2 text-center">{Number(c.qty_on_hand)}</td>
                    <td className="py-2 px-2 text-center">{Number(c.qty_consumed)}</td>
                    <td className="py-2 px-2 text-center">{fmtC(Number(c.unit_price))}</td>
                    <td className="py-2 px-2 text-center">{fmtC(Number(c.on_hand_value || 0))}</td>
                    <td className="py-2 px-2 text-center text-amber-400">{fmtC(Number(c.consumed_value || 0))}</td>
                    <td className="py-2 px-2 text-center">
                      <button onClick={() => reconcile(c.supplier_id)}
                        className="text-xs px-2 py-1 bg-indigo-500/20 text-indigo-300 rounded hover:bg-indigo-500/30">התאמה</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {/* Add Agreement Modal */}
      {showAddAgreement && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAddAgreement(false)}>
          <div className="bg-card border border-white/10 rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold mb-4">הסכם VMI חדש</h3>
            <div className="space-y-3">
              <input placeholder="שם ספק" value={newAgr.supplier_name} onChange={e => setNewAgr(p => ({...p, supplier_name: e.target.value}))}
                className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm" />
              <input placeholder="שם פריט" value={newAgr.item_name} onChange={e => setNewAgr(p => ({...p, item_name: e.target.value}))}
                className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm" />
              <div className="grid grid-cols-3 gap-2">
                <div><label className="text-xs text-muted-foreground">מינימום</label>
                  <input type="number" value={newAgr.min_level} onChange={e => setNewAgr(p => ({...p, min_level: Number(e.target.value)}))}
                    className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm" /></div>
                <div><label className="text-xs text-muted-foreground">מקסימום</label>
                  <input type="number" value={newAgr.max_level} onChange={e => setNewAgr(p => ({...p, max_level: Number(e.target.value)}))}
                    className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm" /></div>
                <div><label className="text-xs text-muted-foreground">נק' הזמנה</label>
                  <input type="number" value={newAgr.reorder_point} onChange={e => setNewAgr(p => ({...p, reorder_point: Number(e.target.value)}))}
                    className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm" /></div>
              </div>
              <div className="flex gap-2">
                <div className="flex-1"><label className="text-xs text-muted-foreground">זמן אספקה (ימים)</label>
                  <input type="number" value={newAgr.lead_time_days} onChange={e => setNewAgr(p => ({...p, lead_time_days: Number(e.target.value)}))}
                    className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm" /></div>
                <div className="flex-1"><label className="text-xs text-muted-foreground">תדירות</label>
                  <select value={newAgr.review_frequency} onChange={e => setNewAgr(p => ({...p, review_frequency: e.target.value}))}
                    className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm">
                    {Object.entries(freqLabels).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                  </select></div>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowAddAgreement(false)} className="px-4 py-2 text-sm text-muted-foreground hover:bg-white/5 rounded-lg">ביטול</button>
                <button onClick={addAgreement} className="px-4 py-2 text-sm bg-teal-500/20 text-teal-300 rounded-lg hover:bg-teal-500/30">שמור</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
