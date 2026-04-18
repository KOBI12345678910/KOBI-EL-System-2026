import { useState, useEffect } from "react";
import {
  Users, Search, Plus, Edit2, Trash2, X, Save, Eye, Star, TrendingUp, TrendingDown,
  BarChart3, Target, DollarSign, Award, Crosshair, Globe, MapPin, ArrowUpDown, Shield
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/utils";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : [];
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");
const fmtCurrency = (v: any) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(Number(v || 0));

const pricingMap: Record<string, { label: string; color: string }> = {
  budget: { label: "תקציבי", color: "bg-green-500/20 text-green-400" },
  mid: { label: "בינוני", color: "bg-blue-500/20 text-blue-400" },
  premium: { label: "פרימיום", color: "bg-purple-500/20 text-purple-400" },
};

const outcomeMap: Record<string, { label: string; color: string }> = {
  won_by_us: { label: "ניצחנו", color: "bg-green-500/20 text-green-400" },
  lost_to_them: { label: "הפסדנו", color: "bg-red-500/20 text-red-400" },
  unknown: { label: "לא ידוע", color: "bg-gray-500/20 text-gray-400" },
};

function RatingStars({ value, max = 5 }: { value: number; max?: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: max }, (_, i) => (
        <Star key={i} className={`w-3.5 h-3.5 ${i < value ? "text-yellow-400 fill-yellow-400" : "text-gray-600"}`} />
      ))}
    </div>
  );
}

export default function CompetitorIntelligencePage() {
  const [tab, setTab] = useState<"dashboard" | "competitors" | "prices" | "deals" | "trends">("dashboard");
  const [competitors, setCompetitors] = useState<any[]>([]);
  const [prices, setPrices] = useState<any[]>([]);
  const [deals, setDeals] = useState<any[]>([]);
  const [trends, setTrends] = useState<any[]>([]);
  const [dashboard, setDashboard] = useState<any>(null);
  const [winLoss, setWinLoss] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<"competitor" | "price" | "deal" | "trend">("competitor");
  const [form, setForm] = useState<any>({});
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [viewDetail, setViewDetail] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [c, p, d, t, dash, wl] = await Promise.all([
        authFetch(`${API}/competitors`).then(r => r.json()).catch(() => []),
        authFetch(`${API}/competitor-prices`).then(r => r.json()).catch(() => []),
        authFetch(`${API}/competitor-deals`).then(r => r.json()).catch(() => []),
        authFetch(`${API}/market-trends`).then(r => r.json()).catch(() => []),
        authFetch(`${API}/competitors/dashboard`).then(r => r.json()).catch(() => null),
        authFetch(`${API}/competitors/win-loss-analysis`).then(r => r.json()).catch(() => null),
      ]);
      setCompetitors(safeArray(c)); setPrices(safeArray(p)); setDeals(safeArray(d)); setTrends(safeArray(t));
      setDashboard(dash); setWinLoss(wl);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openForm = (type: "competitor" | "price" | "deal" | "trend", item?: any) => {
    setFormType(type);
    setForm(item ? { ...item } : {});
    setEditing(item || null);
    setShowForm(true);
  };

  const saveForm = async () => {
    setSaving(true);
    try {
      const endpoints: Record<string, string> = { competitor: "competitors", price: "competitor-prices", deal: "competitor-deals", trend: "market-trends" };
      const url = `${API}/${endpoints[formType]}${editing ? `/${editing.id}` : ""}`;
      await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowForm(false); setForm({}); setEditing(null);
      load();
    } catch {}
    setSaving(false);
  };

  const del = async (type: string, id: number) => {
    const endpoints: Record<string, string> = { competitor: "competitors", price: "competitor-prices", deal: "competitor-deals", trend: "market-trends" };
    await authFetch(`${API}/${endpoints[type]}/${id}`, { method: "DELETE" });
    load();
  };

  const tabs = [
    { key: "dashboard", label: "דשבורד", icon: BarChart3 },
    { key: "competitors", label: "מתחרים", icon: Users },
    { key: "prices", label: "השוואת מחירים", icon: DollarSign },
    { key: "deals", label: "עסקאות", icon: Target },
    { key: "trends", label: "מגמות שוק", icon: TrendingUp },
  ];

  const filtered = (arr: any[]) => arr.filter((i: any) => !search || JSON.stringify(i).toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Crosshair className="w-7 h-7 text-cyan-400" /> ניתוח מתחרים ושוק</h1>
          <p className="text-sm text-muted-foreground mt-1">מעקב מתחרים, השוואת מחירים, ניתוח עסקאות ומגמות שוק</p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input className="bg-[#1a1a2e] border border-white/10 rounded-lg pr-9 pl-3 py-2 text-sm text-white w-64" placeholder="חיפוש..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#1a1a2e] rounded-xl p-1 w-fit">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.key ? "bg-cyan-500/20 text-cyan-400" : "text-gray-400 hover:text-white"}`}>
            <t.icon className="w-4 h-4" />{t.label}
          </button>
        ))}
      </div>

      {loading && <div className="text-center py-20 text-gray-400">טוען נתונים...</div>}

      {/* DASHBOARD */}
      {!loading && tab === "dashboard" && dashboard && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "מתחרים פעילים", value: dashboard.active_competitors, icon: Users, color: "text-cyan-400" },
              { label: "אחוז זכייה", value: `${dashboard.winRate || 0}%`, icon: Award, color: "text-green-400" },
              { label: "עסקאות שנוצחו", value: fmt(dashboard.won_value), icon: TrendingUp, color: "text-emerald-400" },
              { label: "עסקאות שאבדו", value: fmt(dashboard.lost_value), icon: TrendingDown, color: "text-red-400" },
            ].map((s, i) => (
              <Card key={i} className="bg-[#1a1a2e] border-white/10">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground">{s.label}</span>
                    <s.icon className={`w-5 h-5 ${s.color}`} />
                  </div>
                  <div className="text-2xl font-bold text-white">{s.value}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Win/Loss */}
          {winLoss && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="bg-[#1a1a2e] border-white/10">
                <CardHeader><CardTitle className="text-white text-lg">ניתוח זכייה/הפסד לפי מתחרה</CardTitle></CardHeader>
                <CardContent>
                  {safeArray(winLoss.byCompetitor).length === 0 ? <p className="text-gray-500 text-sm">אין נתונים</p> : (
                    <div className="space-y-3">
                      {safeArray(winLoss.byCompetitor).map((c: any, i: number) => {
                        const total = Number(c.wins || 0) + Number(c.losses || 0) + Number(c.unknown || 0);
                        const winPct = total > 0 ? Math.round((Number(c.wins || 0) / total) * 100) : 0;
                        return (
                          <div key={i} className="space-y-1">
                            <div className="flex justify-between text-sm"><span className="text-white">{c.competitor_name}</span><span className="text-gray-400">{winPct}% זכייה</span></div>
                            <div className="flex h-2 rounded-full overflow-hidden bg-gray-700">
                              <div className="bg-green-500 transition-all" style={{ width: `${winPct}%` }} />
                              <div className="bg-red-500 transition-all" style={{ width: `${total > 0 ? Math.round((Number(c.losses || 0) / total) * 100) : 0}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-[#1a1a2e] border-white/10">
                <CardHeader><CardTitle className="text-white text-lg">סיבות הפסד</CardTitle></CardHeader>
                <CardContent>
                  {safeArray(winLoss.lossReasons).length === 0 ? <p className="text-gray-500 text-sm">אין נתונים</p> : (
                    <div className="space-y-2">
                      {safeArray(winLoss.lossReasons).map((r: any, i: number) => (
                        <div key={i} className="flex justify-between items-center bg-[#0d0d1a] rounded-lg p-3">
                          <span className="text-sm text-white">{r.loss_reason}</span>
                          <div className="flex items-center gap-3">
                            <Badge variant="outline" className="text-red-400">{r.count} עסקאות</Badge>
                            <span className="text-xs text-gray-400">{fmtCurrency(r.total_value)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Top Competitors */}
          <Card className="bg-[#1a1a2e] border-white/10">
            <CardHeader><CardTitle className="text-white text-lg">מתחרים מובילים</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {safeArray(dashboard.topCompetitors).map((c: any) => (
                  <div key={c.id} className="bg-[#0d0d1a] rounded-xl p-4 space-y-3 border border-white/5">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-white font-semibold">{c.name}</h3>
                        {c.location && <p className="text-xs text-gray-400 flex items-center gap-1"><MapPin className="w-3 h-3" />{c.location}</p>}
                      </div>
                      <Badge className={pricingMap[c.pricing_level]?.color || ""}>{pricingMap[c.pricing_level]?.label || c.pricing_level}</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><span className="text-gray-400">איכות:</span> <RatingStars value={c.quality_rating} /></div>
                      <div><span className="text-gray-400">מהירות:</span> <RatingStars value={c.delivery_speed_rating} /></div>
                      <div><span className="text-gray-400">נתח שוק:</span> <span className="text-white">{c.market_share_pct}%</span></div>
                      <div><span className="text-gray-400">עסקאות:</span> <span className="text-white">{c.deal_count}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* COMPETITORS TAB */}
      {!loading && tab === "competitors" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => openForm("competitor")} className="flex items-center gap-1 bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-lg text-sm"><Plus className="w-4 h-4" />הוסף מתחרה</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered(competitors).map(c => (
              <Card key={c.id} className="bg-[#1a1a2e] border-white/10 hover:border-cyan-500/30 transition-all cursor-pointer" onClick={() => setViewDetail(c)}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-white font-semibold text-lg">{c.name}</h3>
                      {c.website && <a href={c.website} target="_blank" rel="noreferrer" className="text-xs text-cyan-400 flex items-center gap-1" onClick={e => e.stopPropagation()}><Globe className="w-3 h-3" />{c.website}</a>}
                    </div>
                    <div className="flex gap-1">
                      <button onClick={e => { e.stopPropagation(); openForm("competitor", c); }} className="p-1.5 text-gray-400 hover:text-cyan-400"><Edit2 className="w-3.5 h-3.5" /></button>
                      <button onClick={e => { e.stopPropagation(); del("competitor", c.id); }} className="p-1.5 text-gray-400 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Badge className={pricingMap[c.pricing_level]?.color || ""}>{pricingMap[c.pricing_level]?.label || c.pricing_level}</Badge>
                    <Badge className={c.status === "active" ? "bg-green-500/20 text-green-400" : "bg-gray-500/20 text-gray-400"}>{c.status === "active" ? "פעיל" : "לא פעיל"}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-gray-400">איכות:</span> <RatingStars value={c.quality_rating} /></div>
                    <div><span className="text-gray-400">מהירות:</span> <RatingStars value={c.delivery_speed_rating} /></div>
                    <div><span className="text-gray-400">נתח שוק:</span> <span className="text-white">{c.market_share_pct}%</span></div>
                    {c.location && <div><span className="text-gray-400">מיקום:</span> <span className="text-white">{c.location}</span></div>}
                  </div>
                  {c.strengths && <p className="text-xs text-green-400 line-clamp-1">חוזקות: {c.strengths}</p>}
                  {c.weaknesses && <p className="text-xs text-red-400 line-clamp-1">חולשות: {c.weaknesses}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* PRICES TAB */}
      {!loading && tab === "prices" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => openForm("price")} className="flex items-center gap-1 bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-lg text-sm"><Plus className="w-4 h-4" />הוסף מחיר</button>
          </div>
          <Card className="bg-[#1a1a2e] border-white/10">
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-white/10 text-gray-400">
                  <th className="p-3 text-right">מתחרה</th><th className="p-3 text-right">סוג מוצר</th><th className="p-3 text-right">מחיר/מטר</th><th className="p-3 text-right">תאריך</th><th className="p-3 text-right">מקור</th><th className="p-3 text-right">מאומת</th><th className="p-3"></th>
                </tr></thead>
                <tbody>
                  {filtered(prices).map(p => (
                    <tr key={p.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="p-3 text-white">{p.competitor_name}</td>
                      <td className="p-3 text-white">{p.product_type}</td>
                      <td className="p-3 text-white font-mono">{fmtCurrency(p.price_per_meter)}</td>
                      <td className="p-3 text-gray-400">{p.price_date ? new Date(p.price_date).toLocaleDateString("he-IL") : "—"}</td>
                      <td className="p-3 text-gray-400">{p.source || "—"}</td>
                      <td className="p-3">{p.verified ? <Badge className="bg-green-500/20 text-green-400">מאומת</Badge> : <Badge className="bg-gray-500/20 text-gray-400">לא</Badge>}</td>
                      <td className="p-3 flex gap-1"><button onClick={() => openForm("price", p)} className="p-1 text-gray-400 hover:text-cyan-400"><Edit2 className="w-3.5 h-3.5" /></button><button onClick={() => del("price", p.id)} className="p-1 text-gray-400 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {prices.length === 0 && <p className="text-center text-gray-500 py-8">אין נתוני מחירים</p>}
            </CardContent>
          </Card>
        </div>
      )}

      {/* DEALS TAB */}
      {!loading && tab === "deals" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => openForm("deal")} className="flex items-center gap-1 bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-lg text-sm"><Plus className="w-4 h-4" />הוסף עסקה</button>
          </div>
          <Card className="bg-[#1a1a2e] border-white/10">
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-white/10 text-gray-400">
                  <th className="p-3 text-right">מתחרה</th><th className="p-3 text-right">לקוח</th><th className="p-3 text-right">סוג</th><th className="p-3 text-right">שווי מוערך</th><th className="p-3 text-right">הצעה שלנו</th><th className="p-3 text-right">תוצאה</th><th className="p-3 text-right">תאריך</th><th className="p-3"></th>
                </tr></thead>
                <tbody>
                  {filtered(deals).map(d => (
                    <tr key={d.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="p-3 text-white">{d.competitor_name}</td>
                      <td className="p-3 text-white">{d.customer_name}</td>
                      <td className="p-3 text-gray-400">{d.deal_type}</td>
                      <td className="p-3 text-white font-mono">{fmtCurrency(d.estimated_value)}</td>
                      <td className="p-3 text-white font-mono">{fmtCurrency(d.our_quote_value)}</td>
                      <td className="p-3"><Badge className={outcomeMap[d.outcome]?.color || ""}>{outcomeMap[d.outcome]?.label || d.outcome}</Badge></td>
                      <td className="p-3 text-gray-400">{d.deal_date ? new Date(d.deal_date).toLocaleDateString("he-IL") : "—"}</td>
                      <td className="p-3 flex gap-1"><button onClick={() => openForm("deal", d)} className="p-1 text-gray-400 hover:text-cyan-400"><Edit2 className="w-3.5 h-3.5" /></button><button onClick={() => del("deal", d.id)} className="p-1 text-gray-400 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {deals.length === 0 && <p className="text-center text-gray-500 py-8">אין נתוני עסקאות</p>}
            </CardContent>
          </Card>
        </div>
      )}

      {/* TRENDS TAB */}
      {!loading && tab === "trends" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => openForm("trend")} className="flex items-center gap-1 bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-lg text-sm"><Plus className="w-4 h-4" />הוסף מגמה</button>
          </div>
          <Card className="bg-[#1a1a2e] border-white/10">
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-white/10 text-gray-400">
                  <th className="p-3 text-right">מדד</th><th className="p-3 text-right">ערך</th><th className="p-3 text-right">תקופה</th><th className="p-3 text-right">קטגוריה</th><th className="p-3 text-right">מקור</th><th className="p-3"></th>
                </tr></thead>
                <tbody>
                  {filtered(trends).map(t => (
                    <tr key={t.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="p-3 text-white">{t.metric_name}</td>
                      <td className="p-3 text-white font-mono">{fmt(t.value)}</td>
                      <td className="p-3 text-gray-400">{t.period ? new Date(t.period).toLocaleDateString("he-IL") : "—"}</td>
                      <td className="p-3"><Badge variant="outline">{t.category}</Badge></td>
                      <td className="p-3 text-gray-400">{t.source || "—"}</td>
                      <td className="p-3 flex gap-1"><button onClick={() => openForm("trend", t)} className="p-1 text-gray-400 hover:text-cyan-400"><Edit2 className="w-3.5 h-3.5" /></button><button onClick={() => del("trend", t.id)} className="p-1 text-gray-400 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {trends.length === 0 && <p className="text-center text-gray-500 py-8">אין נתוני מגמות</p>}
            </CardContent>
          </Card>
        </div>
      )}

      {/* VIEW DETAIL MODAL */}
      {viewDetail && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setViewDetail(null)}>
          <div className="bg-[#1a1a2e] rounded-2xl border border-white/10 w-full max-w-lg p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold text-white">{viewDetail.name}</h2>
              <button onClick={() => setViewDetail(null)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-gray-400 block">אתר:</span><span className="text-white">{viewDetail.website || "—"}</span></div>
              <div><span className="text-gray-400 block">מיקום:</span><span className="text-white">{viewDetail.location || "—"}</span></div>
              <div><span className="text-gray-400 block">רמת מחיר:</span><Badge className={pricingMap[viewDetail.pricing_level]?.color || ""}>{pricingMap[viewDetail.pricing_level]?.label}</Badge></div>
              <div><span className="text-gray-400 block">נתח שוק:</span><span className="text-white">{viewDetail.market_share_pct}%</span></div>
              <div><span className="text-gray-400 block">דירוג איכות:</span><RatingStars value={viewDetail.quality_rating} /></div>
              <div><span className="text-gray-400 block">מהירות אספקה:</span><RatingStars value={viewDetail.delivery_speed_rating} /></div>
            </div>
            {viewDetail.strengths && <div><span className="text-gray-400 text-sm block">חוזקות:</span><p className="text-sm text-green-400">{viewDetail.strengths}</p></div>}
            {viewDetail.weaknesses && <div><span className="text-gray-400 text-sm block">חולשות:</span><p className="text-sm text-red-400">{viewDetail.weaknesses}</p></div>}
            {viewDetail.notes && <div><span className="text-gray-400 text-sm block">הערות:</span><p className="text-sm text-white">{viewDetail.notes}</p></div>}
          </div>
        </div>
      )}

      {/* FORM MODAL */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-[#1a1a2e] rounded-2xl border border-white/10 w-full max-w-lg p-6 space-y-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold text-white">{editing ? "עריכה" : "הוספה"}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>

            {formType === "competitor" && (
              <div className="space-y-3">
                {[{ k: "name", l: "שם מתחרה" }, { k: "website", l: "אתר" }, { k: "location", l: "מיקום" }].map(f => (
                  <div key={f.k}><label className="text-xs text-gray-400">{f.l}</label><input className="w-full bg-[#0d0d1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={form[f.k] || ""} onChange={e => setForm({ ...form, [f.k]: e.target.value })} /></div>
                ))}
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-gray-400">נתח שוק %</label><input type="number" className="w-full bg-[#0d0d1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={form.market_share_pct || ""} onChange={e => setForm({ ...form, market_share_pct: Number(e.target.value) })} /></div>
                  <div><label className="text-xs text-gray-400">רמת מחיר</label><select className="w-full bg-[#0d0d1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={form.pricing_level || "mid"} onChange={e => setForm({ ...form, pricing_level: e.target.value })}><option value="budget">תקציבי</option><option value="mid">בינוני</option><option value="premium">פרימיום</option></select></div>
                  <div><label className="text-xs text-gray-400">איכות (1-5)</label><input type="number" min={1} max={5} className="w-full bg-[#0d0d1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={form.quality_rating || 3} onChange={e => setForm({ ...form, quality_rating: Number(e.target.value) })} /></div>
                  <div><label className="text-xs text-gray-400">מהירות (1-5)</label><input type="number" min={1} max={5} className="w-full bg-[#0d0d1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={form.delivery_speed_rating || 3} onChange={e => setForm({ ...form, delivery_speed_rating: Number(e.target.value) })} /></div>
                </div>
                <div><label className="text-xs text-gray-400">חוזקות</label><textarea className="w-full bg-[#0d0d1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" rows={2} value={form.strengths || ""} onChange={e => setForm({ ...form, strengths: e.target.value })} /></div>
                <div><label className="text-xs text-gray-400">חולשות</label><textarea className="w-full bg-[#0d0d1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" rows={2} value={form.weaknesses || ""} onChange={e => setForm({ ...form, weaknesses: e.target.value })} /></div>
              </div>
            )}

            {formType === "price" && (
              <div className="space-y-3">
                <div><label className="text-xs text-gray-400">מתחרה</label><select className="w-full bg-[#0d0d1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={form.competitor_id || ""} onChange={e => setForm({ ...form, competitor_id: Number(e.target.value) })}><option value="">בחר...</option>{competitors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                <div><label className="text-xs text-gray-400">סוג מוצר</label><input className="w-full bg-[#0d0d1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={form.product_type || ""} onChange={e => setForm({ ...form, product_type: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-gray-400">מחיר/מטר</label><input type="number" className="w-full bg-[#0d0d1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={form.price_per_meter || ""} onChange={e => setForm({ ...form, price_per_meter: Number(e.target.value) })} /></div>
                  <div><label className="text-xs text-gray-400">תאריך</label><input type="date" className="w-full bg-[#0d0d1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={form.price_date || ""} onChange={e => setForm({ ...form, price_date: e.target.value })} /></div>
                </div>
                <div><label className="text-xs text-gray-400">מקור</label><input className="w-full bg-[#0d0d1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={form.source || ""} onChange={e => setForm({ ...form, source: e.target.value })} /></div>
                <div className="flex items-center gap-2"><input type="checkbox" checked={form.verified || false} onChange={e => setForm({ ...form, verified: e.target.checked })} /><span className="text-sm text-gray-400">מאומת</span></div>
              </div>
            )}

            {formType === "deal" && (
              <div className="space-y-3">
                <div><label className="text-xs text-gray-400">מתחרה</label><select className="w-full bg-[#0d0d1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={form.competitor_id || ""} onChange={e => setForm({ ...form, competitor_id: Number(e.target.value) })}><option value="">בחר...</option>{competitors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                <div><label className="text-xs text-gray-400">שם לקוח</label><input className="w-full bg-[#0d0d1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={form.customer_name || ""} onChange={e => setForm({ ...form, customer_name: e.target.value })} /></div>
                <div><label className="text-xs text-gray-400">סוג עסקה</label><input className="w-full bg-[#0d0d1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={form.deal_type || ""} onChange={e => setForm({ ...form, deal_type: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-gray-400">שווי מוערך</label><input type="number" className="w-full bg-[#0d0d1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={form.estimated_value || ""} onChange={e => setForm({ ...form, estimated_value: Number(e.target.value) })} /></div>
                  <div><label className="text-xs text-gray-400">הצעה שלנו</label><input type="number" className="w-full bg-[#0d0d1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={form.our_quote_value || ""} onChange={e => setForm({ ...form, our_quote_value: Number(e.target.value) })} /></div>
                </div>
                <div><label className="text-xs text-gray-400">תוצאה</label><select className="w-full bg-[#0d0d1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={form.outcome || "unknown"} onChange={e => setForm({ ...form, outcome: e.target.value })}><option value="won_by_us">ניצחנו</option><option value="lost_to_them">הפסדנו</option><option value="unknown">לא ידוע</option></select></div>
                {form.outcome === "lost_to_them" && <div><label className="text-xs text-gray-400">סיבת הפסד</label><textarea className="w-full bg-[#0d0d1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" rows={2} value={form.loss_reason || ""} onChange={e => setForm({ ...form, loss_reason: e.target.value })} /></div>}
                <div><label className="text-xs text-gray-400">תאריך</label><input type="date" className="w-full bg-[#0d0d1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={form.deal_date || ""} onChange={e => setForm({ ...form, deal_date: e.target.value })} /></div>
              </div>
            )}

            {formType === "trend" && (
              <div className="space-y-3">
                <div><label className="text-xs text-gray-400">שם מדד</label><input className="w-full bg-[#0d0d1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={form.metric_name || ""} onChange={e => setForm({ ...form, metric_name: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-gray-400">ערך</label><input type="number" className="w-full bg-[#0d0d1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={form.value || ""} onChange={e => setForm({ ...form, value: Number(e.target.value) })} /></div>
                  <div><label className="text-xs text-gray-400">תקופה</label><input type="date" className="w-full bg-[#0d0d1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={form.period || ""} onChange={e => setForm({ ...form, period: e.target.value })} /></div>
                </div>
                <div><label className="text-xs text-gray-400">קטגוריה</label><select className="w-full bg-[#0d0d1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={form.category || "pricing"} onChange={e => setForm({ ...form, category: e.target.value })}><option value="pricing">תמחור</option><option value="demand">ביקוש</option><option value="supply">היצע</option><option value="regulation">רגולציה</option></select></div>
                <div><label className="text-xs text-gray-400">מקור</label><input className="w-full bg-[#0d0d1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={form.source || ""} onChange={e => setForm({ ...form, source: e.target.value })} /></div>
              </div>
            )}

            <button onClick={saveForm} disabled={saving} className="w-full bg-cyan-600 hover:bg-cyan-700 text-white py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2">
              <Save className="w-4 h-4" />{saving ? "שומר..." : "שמור"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
