import { useState, useEffect, useMemo } from "react";
import {
  Layers, Search, Plus, Edit2, Trash2, X, Copy, RefreshCw, DollarSign,
  ChevronDown, ChevronRight, Calculator, BarChart3, TrendingUp, Clock, Wrench,
  ArrowUpDown, Eye
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/utils";

const API = "/api/bom-builder";
const safeArr = (d: any) => Array.isArray(d) ? d : [];
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fmtC = (v: any) => Number(v || 0).toLocaleString("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 2 });

const statusMap: Record<string, { label: string; color: string }> = {
  draft: { label: "טיוטה", color: "bg-yellow-500/20 text-yellow-400" },
  active: { label: "פעיל", color: "bg-green-500/20 text-green-400" },
  obsolete: { label: "מיושן", color: "bg-red-500/20 text-red-400" },
};

export default function BomBuilderPage() {
  const [dashboard, setDashboard] = useState<any>({});
  const [products, setProducts] = useState<any[]>([]);
  const [lines, setLines] = useState<any[]>([]);
  const [assemblies, setAssemblies] = useState<any[]>([]);
  const [labor, setLabor] = useState<any[]>([]);
  const [margins, setMargins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [bomTree, setBomTree] = useState<any>(null);
  const [tab, setTab] = useState<"products" | "margins" | "dashboard">("dashboard");
  const [showForm, setShowForm] = useState(false);
  const [showLineForm, setShowLineForm] = useState(false);
  const [showLaborForm, setShowLaborForm] = useState(false);
  const [showAsmForm, setShowAsmForm] = useState(false);
  const [form, setForm] = useState<any>({});
  const [lineForm, setLineForm] = useState<any>({});
  const [laborForm, setLaborForm] = useState<any>({});
  const [asmForm, setAsmForm] = useState<any>({});
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [expandedAsm, setExpandedAsm] = useState<Set<number>>(new Set());

  const load = async () => {
    setLoading(true);
    try {
      const [dRes, pRes, mRes] = await Promise.all([
        authFetch(`${API}/dashboard`),
        authFetch(`${API}/products`),
        authFetch(`${API}/margin-analysis`),
      ]);
      if (dRes.ok) setDashboard(await dRes.json());
      if (pRes.ok) setProducts(safeArr(await pRes.json()));
      if (mRes.ok) setMargins(safeArr(await mRes.json()));
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const selectProduct = async (p: any) => {
    setSelectedProduct(p);
    try {
      const [tRes, lRes, aRes, labRes] = await Promise.all([
        authFetch(`${API}/products/${p.id}/explode-tree`),
        authFetch(`${API}/products/${p.id}/lines`),
        authFetch(`${API}/products/${p.id}/assemblies`),
        authFetch(`${API}/products/${p.id}/labor`),
      ]);
      if (tRes.ok) setBomTree(await tRes.json());
      if (lRes.ok) setLines(safeArr(await lRes.json()));
      if (aRes.ok) setAssemblies(safeArr(await aRes.json()));
      if (labRes.ok) setLabor(safeArr(await labRes.json()));
    } catch {}
  };

  const saveProduct = async () => {
    setSaving(true);
    try {
      const url = editing ? `${API}/products/${editing.id}` : `${API}/products`;
      const method = editing ? "PUT" : "POST";
      await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowForm(false); setEditing(null); setForm({}); load();
    } catch {}
    setSaving(false);
  };

  const deleteProduct = async (id: number) => {
    await authFetch(`${API}/products/${id}`, { method: "DELETE" });
    setSelectedProduct(null); load();
  };

  const cloneProduct = async (id: number) => {
    await authFetch(`${API}/products/${id}/clone`, { method: "POST" });
    load();
  };

  const updatePrices = async (id: number) => {
    await authFetch(`${API}/products/${id}/update-prices-from-materials`, { method: "POST" });
    selectProduct(selectedProduct);
    load();
  };

  const recalcCost = async (id: number) => {
    await authFetch(`${API}/products/${id}/calculate-cost`, { method: "POST" });
    selectProduct(selectedProduct);
    load();
  };

  const saveLine = async () => {
    setSaving(true);
    try {
      const url = lineForm.id ? `${API}/lines/${lineForm.id}` : `${API}/lines`;
      const method = lineForm.id ? "PUT" : "POST";
      await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...lineForm, product_id: selectedProduct.id }) });
      setShowLineForm(false); setLineForm({});
      selectProduct(selectedProduct); load();
    } catch {}
    setSaving(false);
  };

  const deleteLine = async (id: number) => {
    await authFetch(`${API}/lines/${id}`, { method: "DELETE" });
    selectProduct(selectedProduct); load();
  };

  const saveLabor = async () => {
    setSaving(true);
    try {
      const url = laborForm.id ? `${API}/labor/${laborForm.id}` : `${API}/labor`;
      const method = laborForm.id ? "PUT" : "POST";
      await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...laborForm, product_id: selectedProduct.id }) });
      setShowLaborForm(false); setLaborForm({});
      selectProduct(selectedProduct); load();
    } catch {}
    setSaving(false);
  };

  const saveAssembly = async () => {
    setSaving(true);
    try {
      const url = asmForm.id ? `${API}/assemblies/${asmForm.id}` : `${API}/assemblies`;
      const method = asmForm.id ? "PUT" : "POST";
      await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...asmForm, product_id: selectedProduct.id }) });
      setShowAsmForm(false); setAsmForm({});
      selectProduct(selectedProduct);
    } catch {}
    setSaving(false);
  };

  const filtered = useMemo(() => {
    return products.filter(p => {
      if (filterStatus !== "all" && p.status !== filterStatus) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!p.product_name?.toLowerCase().includes(s) && !p.product_code?.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [products, search, filterStatus]);

  const ds = dashboard.summary || {};

  const toggleAsm = (id: number) => {
    const s = new Set(expandedAsm);
    s.has(id) ? s.delete(id) : s.add(id);
    setExpandedAsm(s);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Layers className="w-6 h-6 text-emerald-400" /> בונה BOM</h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול מפרטי חומרים, עלויות ומרווחים</p>
        </div>
        <div className="flex gap-2">
          {(["dashboard", "products", "margins"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t ? "bg-emerald-600 text-white" : "bg-white/5 hover:bg-white/10 text-gray-400"}`}>
              {t === "dashboard" ? "דשבורד" : t === "products" ? "מוצרים" : "ניתוח מרווח"}
            </button>
          ))}
        </div>
      </div>

      {/* Dashboard */}
      {tab === "dashboard" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            {[
              { label: "סה\"כ מוצרים", val: ds.total_products, icon: Layers, color: "text-blue-400" },
              { label: "פעילים", val: ds.active, icon: TrendingUp, color: "text-green-400" },
              { label: "טיוטות", val: ds.drafts, icon: Clock, color: "text-yellow-400" },
              { label: "עלות ממוצעת/מ'", val: fmtC(ds.avg_cost), icon: Calculator, color: "text-cyan-400" },
              { label: "מחיר מכירה ממוצע", val: fmtC(ds.avg_selling_price), icon: DollarSign, color: "text-emerald-400" },
              { label: "מרווח ממוצע %", val: `${fmt(ds.avg_markup)}%`, icon: BarChart3, color: "text-purple-400" },
            ].map((c, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                className="bg-[#111118] border border-white/10 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2"><c.icon className={`w-4 h-4 ${c.color}`} /><span className="text-xs text-muted-foreground">{c.label}</span></div>
                <div className="text-xl font-bold">{c.val ?? "—"}</div>
              </motion.div>
            ))}
          </div>
          {safeArr(dashboard.marginsByType).length > 0 && (
            <div className="bg-[#111118] border border-white/10 rounded-xl p-5">
              <h3 className="text-lg font-bold mb-4">מרווחים לפי סוג מוצר</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-white/10 text-muted-foreground">
                    <th className="text-right py-2 px-3">סוג</th><th className="text-right py-2 px-3">כמות</th>
                    <th className="text-right py-2 px-3">עלות ממוצעת</th><th className="text-right py-2 px-3">מרווח ממוצע</th>
                  </tr></thead>
                  <tbody>{safeArr(dashboard.marginsByType).map((m: any, i: number) => (
                    <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                      <td className="py-2 px-3 font-medium">{m.product_type}</td>
                      <td className="py-2 px-3">{m.cnt}</td>
                      <td className="py-2 px-3">{fmtC(m.avg_cost)}</td>
                      <td className="py-2 px-3"><Badge className="bg-emerald-500/20 text-emerald-400">{m.avg_markup}%</Badge></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Products Tab */}
      {tab === "products" && (
        <div className="flex gap-4">
          {/* Product list */}
          <div className={`${selectedProduct ? "w-1/3" : "w-full"} space-y-4 transition-all`}>
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input className="w-full bg-[#111118] border border-white/10 rounded-lg pl-3 pr-10 py-2 text-sm"
                  placeholder="חיפוש מוצר..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <select className="bg-[#111118] border border-white/10 rounded-lg px-3 py-2 text-sm"
                value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="all">כל הסטטוסים</option>
                <option value="draft">טיוטה</option>
                <option value="active">פעיל</option>
                <option value="obsolete">מיושן</option>
              </select>
              <button onClick={() => { setForm({}); setEditing(null); setShowForm(true); }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2">
                <Plus className="w-4 h-4" /> מוצר חדש
              </button>
            </div>

            {loading ? <div className="text-center py-12 text-muted-foreground">טוען...</div> :
              filtered.length === 0 ? <div className="text-center py-12 text-muted-foreground">לא נמצאו מוצרים</div> :
              filtered.map(p => (
                <motion.div key={p.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className={`bg-[#111118] border rounded-xl p-4 cursor-pointer transition-all hover:border-emerald-500/50 ${selectedProduct?.id === p.id ? "border-emerald-500" : "border-white/10"}`}
                  onClick={() => selectProduct(p)}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{p.product_name}</div>
                      <div className="text-xs text-muted-foreground">{p.product_code} | v{p.version} | {p.product_type || "—"}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-left">
                        <div className="text-xs text-muted-foreground">עלות/מ'</div>
                        <div className="font-bold">{fmtC(p.total_cost_per_meter)}</div>
                      </div>
                      <div className="text-left">
                        <div className="text-xs text-muted-foreground">מכירה/מ'</div>
                        <div className="font-bold text-emerald-400">{fmtC(p.selling_price_per_meter)}</div>
                      </div>
                      <Badge className={statusMap[p.status]?.color || "bg-gray-500/20 text-gray-400"}>
                        {statusMap[p.status]?.label || p.status}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                    <span>חומרים: {fmtC(p.total_material_cost_per_meter)}</span>
                    <span>עבודה: {fmtC(p.total_labor_cost_per_meter)}</span>
                    <span>מרווח: {fmt(p.markup_pct)}%</span>
                  </div>
                </motion.div>
              ))
            }
          </div>

          {/* BOM detail panel */}
          <AnimatePresence>
            {selectedProduct && (
              <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                className="flex-1 bg-[#111118] border border-white/10 rounded-xl p-5 space-y-5 max-h-[85vh] overflow-y-auto">
                {/* Header */}
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-bold text-lg">{selectedProduct.product_name}</h3>
                    <div className="text-sm text-muted-foreground">{selectedProduct.product_code} | v{selectedProduct.version}</div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => recalcCost(selectedProduct.id)} className="p-2 hover:bg-white/10 rounded-lg" title="חשב מחדש"><Calculator className="w-4 h-4" /></button>
                    <button onClick={() => updatePrices(selectedProduct.id)} className="p-2 hover:bg-white/10 rounded-lg" title="עדכן מחירים מקטלוג"><RefreshCw className="w-4 h-4" /></button>
                    <button onClick={() => cloneProduct(selectedProduct.id)} className="p-2 hover:bg-white/10 rounded-lg" title="שכפל גרסה"><Copy className="w-4 h-4" /></button>
                    <button onClick={() => { setEditing(selectedProduct); setForm(selectedProduct); setShowForm(true); }} className="p-2 hover:bg-white/10 rounded-lg"><Edit2 className="w-4 h-4" /></button>
                    <button onClick={() => deleteProduct(selectedProduct.id)} className="p-2 hover:bg-red-500/20 rounded-lg text-red-400"><Trash2 className="w-4 h-4" /></button>
                    <button onClick={() => setSelectedProduct(null)} className="p-2 hover:bg-white/10 rounded-lg"><X className="w-4 h-4" /></button>
                  </div>
                </div>

                {/* Cost summary */}
                <div className="grid grid-cols-4 gap-3">
                  <div className="bg-white/5 rounded-lg p-3 text-center">
                    <div className="text-xs text-muted-foreground">חומרים/מ'</div>
                    <div className="font-bold text-blue-400">{fmtC(selectedProduct.total_material_cost_per_meter)}</div>
                  </div>
                  <div className="bg-white/5 rounded-lg p-3 text-center">
                    <div className="text-xs text-muted-foreground">עבודה/מ'</div>
                    <div className="font-bold text-orange-400">{fmtC(selectedProduct.total_labor_cost_per_meter)}</div>
                  </div>
                  <div className="bg-white/5 rounded-lg p-3 text-center">
                    <div className="text-xs text-muted-foreground">עלות כוללת/מ'</div>
                    <div className="font-bold text-cyan-400">{fmtC(selectedProduct.total_cost_per_meter)}</div>
                  </div>
                  <div className="bg-emerald-600/20 rounded-lg p-3 text-center">
                    <div className="text-xs text-muted-foreground">מחיר מכירה/מ'</div>
                    <div className="font-bold text-emerald-400">{fmtC(selectedProduct.selling_price_per_meter)}</div>
                  </div>
                </div>

                {/* BOM Tree */}
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="font-bold text-sm">עץ מוצר (BOM)</h4>
                    <div className="flex gap-2">
                      <button onClick={() => { setAsmForm({}); setShowAsmForm(true); }}
                        className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1"><Plus className="w-3 h-3" /> הרכבה</button>
                      <button onClick={() => { setLineForm({}); setShowLineForm(true); }}
                        className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"><Plus className="w-3 h-3" /> שורה</button>
                    </div>
                  </div>

                  {/* Assemblies with lines */}
                  {assemblies.map(asm => (
                    <div key={asm.id} className="mb-2">
                      <div className="flex items-center justify-between bg-white/5 rounded-lg p-3 cursor-pointer hover:bg-white/10"
                        onClick={() => toggleAsm(asm.id)}>
                        <div className="flex items-center gap-2">
                          {expandedAsm.has(asm.id) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          <Wrench className="w-4 h-4 text-emerald-400" />
                          <span className="font-medium">{asm.assembly_name}</span>
                        </div>
                        <span className="text-sm font-bold">{fmtC(asm.total_cost)}</span>
                      </div>
                      <AnimatePresence>
                        {expandedAsm.has(asm.id) && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden mr-6 space-y-1 mt-1">
                            {lines.filter(l => l.assembly_id === asm.id).map(line => (
                              <div key={line.id} className="flex items-center justify-between bg-white/3 rounded p-2 text-sm">
                                <div className="flex items-center gap-2">
                                  <span>{line.material_name}</span>
                                  {line.is_optional && <Badge className="bg-yellow-500/20 text-yellow-400 text-xs">אופציונלי</Badge>}
                                </div>
                                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                  <span>כמות: {fmt(line.quantity_per_meter)}/מ'</span>
                                  <span>בזבוז: {line.waste_pct}%</span>
                                  <span className="font-bold text-white">{fmtC(line.line_cost)}</span>
                                  <button onClick={() => deleteLine(line.id)} className="p-1 hover:bg-red-500/20 rounded text-red-400"><Trash2 className="w-3 h-3" /></button>
                                </div>
                              </div>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}

                  {/* Unassigned lines */}
                  {lines.filter(l => !l.assembly_id).length > 0 && (
                    <div className="mt-3">
                      <div className="text-xs text-muted-foreground mb-2">שורות ללא הרכבה</div>
                      {lines.filter(l => !l.assembly_id).map(line => (
                        <div key={line.id} className="flex items-center justify-between bg-white/5 rounded p-2 text-sm mb-1">
                          <span>{line.material_name}</span>
                          <div className="flex items-center gap-4 text-xs">
                            <span>{fmt(line.quantity_per_meter)}/מ'</span>
                            <span className="font-bold">{fmtC(line.line_cost)}</span>
                            <button onClick={() => deleteLine(line.id)} className="p-1 hover:bg-red-500/20 rounded text-red-400"><Trash2 className="w-3 h-3" /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Labor */}
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="font-bold text-sm">תקני עבודה</h4>
                    <button onClick={() => { setLaborForm({}); setShowLaborForm(true); }}
                      className="text-xs text-orange-400 hover:text-orange-300 flex items-center gap-1"><Plus className="w-3 h-3" /> הוסף</button>
                  </div>
                  {labor.length === 0 ? <div className="text-xs text-muted-foreground">לא הוגדרו תקני עבודה</div> :
                    labor.map(l => (
                      <div key={l.id} className="flex items-center justify-between bg-white/5 rounded-lg p-3 mb-2 text-sm">
                        <span className="font-medium">{l.operation}</span>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>{fmt(l.time_per_meter_min)} דק'/מ'</span>
                          <span>{fmtC(l.labor_rate_per_hour)}/שעה</span>
                          <span className="font-bold text-white">{fmtC(l.labor_cost_per_meter)}/מ'</span>
                        </div>
                      </div>
                    ))
                  }
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Margins Tab */}
      {tab === "margins" && (
        <div className="bg-[#111118] border border-white/10 rounded-xl p-5">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><BarChart3 className="w-5 h-5 text-emerald-400" /> ניתוח מרווח - מוצרים פעילים</h3>
          {margins.length === 0 ? <div className="text-center py-12 text-muted-foreground">אין מוצרים פעילים</div> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-white/10 text-muted-foreground text-xs">
                  <th className="text-right py-3 px-3">קוד</th><th className="text-right py-3 px-3">שם</th>
                  <th className="text-right py-3 px-3">סוג</th><th className="text-right py-3 px-3">חומרים/מ'</th>
                  <th className="text-right py-3 px-3">עבודה/מ'</th><th className="text-right py-3 px-3">עלות/מ'</th>
                  <th className="text-right py-3 px-3">מכירה/מ'</th><th className="text-right py-3 px-3">רווח גולמי/מ'</th>
                  <th className="text-right py-3 px-3">מרווח %</th>
                </tr></thead>
                <tbody>{margins.map((m: any) => (
                  <tr key={m.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-2 px-3 font-mono text-xs">{m.product_code}</td>
                    <td className="py-2 px-3 font-medium">{m.product_name}</td>
                    <td className="py-2 px-3">{m.product_type || "—"}</td>
                    <td className="py-2 px-3">{fmtC(m.total_material_cost_per_meter)}</td>
                    <td className="py-2 px-3">{fmtC(m.total_labor_cost_per_meter)}</td>
                    <td className="py-2 px-3 font-bold">{fmtC(m.total_cost_per_meter)}</td>
                    <td className="py-2 px-3 text-emerald-400 font-bold">{fmtC(m.selling_price_per_meter)}</td>
                    <td className="py-2 px-3 text-blue-400">{fmtC(m.gross_profit_per_meter)}</td>
                    <td className="py-2 px-3">
                      <Badge className={Number(m.gross_margin_pct) >= 50 ? "bg-green-500/20 text-green-400" : Number(m.gross_margin_pct) >= 30 ? "bg-yellow-500/20 text-yellow-400" : "bg-red-500/20 text-red-400"}>
                        {m.gross_margin_pct}%
                      </Badge>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
          {/* Visual margin bars */}
          {margins.length > 0 && (
            <div className="mt-6 space-y-2">
              <h4 className="text-sm font-bold mb-3">מרווח גולמי - השוואה חזותית</h4>
              {margins.slice(0, 15).map((m: any) => (
                <div key={m.id} className="flex items-center gap-3">
                  <span className="w-32 text-xs truncate">{m.product_code}</span>
                  <div className="flex-1 h-5 bg-white/5 rounded overflow-hidden relative">
                    <div className={`h-full rounded ${Number(m.gross_margin_pct) >= 50 ? "bg-emerald-500/60" : Number(m.gross_margin_pct) >= 30 ? "bg-yellow-500/60" : "bg-red-500/60"}`}
                      style={{ width: `${Math.min(Number(m.gross_margin_pct), 100)}%` }} />
                  </div>
                  <span className="text-xs font-mono w-12 text-left">{m.gross_margin_pct}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Product Form Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-[#181820] border border-white/10 rounded-2xl p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
              <h2 className="text-lg font-bold mb-4">{editing ? "עריכת מוצר" : "מוצר חדש"}</h2>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { key: "product_code", label: "קוד מוצר" },
                  { key: "product_name", label: "שם מוצר" },
                  { key: "product_type", label: "סוג מוצר" },
                  { key: "default_material", label: "חומר ברירת מחדל" },
                  { key: "markup_pct", label: "אחוז מרווח", type: "number" },
                ].map(f => (
                  <div key={f.key}>
                    <label className="text-xs text-muted-foreground mb-1 block">{f.label}</label>
                    <input type={f.type || "text"} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
                      value={form[f.key] ?? ""} onChange={e => setForm({ ...form, [f.key]: e.target.value })} />
                  </div>
                ))}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">סטטוס</label>
                  <select className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
                    value={form.status ?? "draft"} onChange={e => setForm({ ...form, status: e.target.value })}>
                    <option value="draft">טיוטה</option><option value="active">פעיל</option><option value="obsolete">מיושן</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-400">ביטול</button>
                <button onClick={saveProduct} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg text-sm disabled:opacity-50">
                  {saving ? "שומר..." : editing ? "עדכן" : "צור"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Line Form Modal */}
      <AnimatePresence>
        {showLineForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowLineForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-[#181820] border border-white/10 rounded-2xl p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
              <h2 className="text-lg font-bold mb-4">שורת BOM חדשה</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><label className="text-xs text-muted-foreground mb-1 block">שם חומר</label>
                  <input className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm" value={lineForm.material_name ?? ""} onChange={e => setLineForm({ ...lineForm, material_name: e.target.value })} /></div>
                <div><label className="text-xs text-muted-foreground mb-1 block">כמות/מ'</label>
                  <input type="number" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm" value={lineForm.quantity_per_meter ?? ""} onChange={e => setLineForm({ ...lineForm, quantity_per_meter: e.target.value })} /></div>
                <div><label className="text-xs text-muted-foreground mb-1 block">% בזבוז</label>
                  <input type="number" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm" value={lineForm.waste_pct ?? 5} onChange={e => setLineForm({ ...lineForm, waste_pct: e.target.value })} /></div>
                <div><label className="text-xs text-muted-foreground mb-1 block">עלות ליחידה</label>
                  <input type="number" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm" value={lineForm.unit_cost ?? ""} onChange={e => setLineForm({ ...lineForm, unit_cost: e.target.value })} /></div>
                <div><label className="text-xs text-muted-foreground mb-1 block">הרכבה</label>
                  <select className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm" value={lineForm.assembly_id ?? ""} onChange={e => setLineForm({ ...lineForm, assembly_id: e.target.value || null })}>
                    <option value="">ללא הרכבה</option>
                    {assemblies.map(a => <option key={a.id} value={a.id}>{a.assembly_name}</option>)}
                  </select></div>
                <div className="flex items-center gap-2 mt-6">
                  <input type="checkbox" checked={lineForm.is_optional || false} onChange={e => setLineForm({ ...lineForm, is_optional: e.target.checked })} /><label className="text-sm">אופציונלי</label>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setShowLineForm(false)} className="px-4 py-2 text-sm text-gray-400">ביטול</button>
                <button onClick={saveLine} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm disabled:opacity-50">{saving ? "שומר..." : "הוסף"}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Labor Form Modal */}
      <AnimatePresence>
        {showLaborForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowLaborForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-[#181820] border border-white/10 rounded-2xl p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
              <h2 className="text-lg font-bold mb-4">תקן עבודה חדש</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><label className="text-xs text-muted-foreground mb-1 block">פעולה</label>
                  <input className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm" value={laborForm.operation ?? ""} onChange={e => setLaborForm({ ...laborForm, operation: e.target.value })} /></div>
                <div><label className="text-xs text-muted-foreground mb-1 block">דקות/מ'</label>
                  <input type="number" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm" value={laborForm.time_per_meter_min ?? ""} onChange={e => setLaborForm({ ...laborForm, time_per_meter_min: e.target.value })} /></div>
                <div><label className="text-xs text-muted-foreground mb-1 block">תעריף/שעה</label>
                  <input type="number" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm" value={laborForm.labor_rate_per_hour ?? 80} onChange={e => setLaborForm({ ...laborForm, labor_rate_per_hour: e.target.value })} /></div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setShowLaborForm(false)} className="px-4 py-2 text-sm text-gray-400">ביטול</button>
                <button onClick={saveLabor} disabled={saving} className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-2 rounded-lg text-sm disabled:opacity-50">{saving ? "שומר..." : "הוסף"}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Assembly Form Modal */}
      <AnimatePresence>
        {showAsmForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowAsmForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-[#181820] border border-white/10 rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
              <h2 className="text-lg font-bold mb-4">הרכבה חדשה</h2>
              <div><label className="text-xs text-muted-foreground mb-1 block">שם הרכבה</label>
                <input className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm" value={asmForm.assembly_name ?? ""} onChange={e => setAsmForm({ ...asmForm, assembly_name: e.target.value })} /></div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setShowAsmForm(false)} className="px-4 py-2 text-sm text-gray-400">ביטול</button>
                <button onClick={saveAssembly} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg text-sm disabled:opacity-50">{saving ? "שומר..." : "צור"}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
