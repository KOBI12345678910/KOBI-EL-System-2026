import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Package, Plus, Search, Filter, Recycle, CheckCircle, AlertTriangle, Trash2, Lock, Unlock, BarChart3 } from "lucide-react";

interface Remnant {
  id: number; material_type: string; material_id: number; length: number; width: number;
  thickness: number; weight_kg: number; location: string; status: string; source_job_id: number;
  quality_grade: string; created_at: string;
}
interface UsageLog {
  id: number; remnant_id: number; used_in_job_id: number; used_length: number; used_at: string;
  material_type?: string; original_length?: number;
}
interface Dashboard {
  total_available: number; total_reserved: number; total_used: number; total_scrapped: number;
  total_available_volume: number; total_available_weight_kg: number; material_types_count: number;
  usage_rate_pct: number; top_materials: any[];
}

export default function RemnantManagementPage() {
  const [tab, setTab] = useState<"inventory"|"search"|"log">("inventory");
  const [remnants, setRemnants] = useState<Remnant[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard|null>(null);
  const [usageLog, setUsageLog] = useState<UsageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterType, setFilterType] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ material_type:"", length:"", width:"", thickness:"", weight_kg:"", location:"", quality_grade:"A", source_job_id:"" });
  const [searchForm, setSearchForm] = useState({ material_type:"", min_length:"", min_width:"", quality_grade:"" });
  const [searchResults, setSearchResults] = useState<Remnant[]>([]);

  const token = localStorage.getItem("erp_token");
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set("status", filterStatus);
      if (filterType) params.set("material_type", filterType);
      const [r, d] = await Promise.all([
        fetch(`/api/remnants?${params}`, { headers }).then(r=>r.json()),
        fetch("/api/remnants/dashboard", { headers }).then(r=>r.json()),
      ]);
      setRemnants(Array.isArray(r) ? r : []);
      setDashboard(d);
    } catch {} finally { setLoading(false); }
  }

  async function loadUsageLog() {
    const data = await fetch("/api/remnants/usage-log/all", { headers }).then(r=>r.json());
    setUsageLog(Array.isArray(data) ? data : []);
  }

  async function createRemnant(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/remnants", { method:"POST", headers, body: JSON.stringify({
      material_type: form.material_type, length: Number(form.length) || null, width: Number(form.width) || null,
      thickness: Number(form.thickness) || null, weight_kg: Number(form.weight_kg) || null,
      location: form.location, quality_grade: form.quality_grade, source_job_id: Number(form.source_job_id) || null,
    })});
    setShowForm(false);
    setForm({ material_type:"", length:"", width:"", thickness:"", weight_kg:"", location:"", quality_grade:"A", source_job_id:"" });
    loadAll();
  }

  async function searchAvailable(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (searchForm.material_type) params.set("material_type", searchForm.material_type);
    if (searchForm.min_length) params.set("min_length", searchForm.min_length);
    if (searchForm.min_width) params.set("min_width", searchForm.min_width);
    if (searchForm.quality_grade) params.set("quality_grade", searchForm.quality_grade);
    const data = await fetch(`/api/remnants/available?${params}`, { headers }).then(r=>r.json());
    setSearchResults(Array.isArray(data) ? data : []);
  }

  async function reserveRemnant(id: number) {
    await fetch(`/api/remnants/${id}/reserve`, { method:"POST", headers });
    loadAll();
  }

  async function useRemnant(id: number) {
    const jobId = prompt("מספר עבודה לשימוש (אופציונלי):");
    const usedLen = prompt("אורך ששימש (מ\"מ) - השאר ריק לשימוש מלא:");
    await fetch(`/api/remnants/${id}/use`, { method:"POST", headers, body: JSON.stringify({
      used_in_job_id: jobId ? Number(jobId) : null,
      used_length: usedLen ? Number(usedLen) : null,
    })});
    loadAll();
  }

  async function scrapRemnant(id: number) {
    await fetch(`/api/remnants/${id}/scrap`, { method:"POST", headers });
    loadAll();
  }

  const statusLabel: Record<string,string> = { available:"זמין", reserved:"שמור", used:"בשימוש", scrapped:"גרוטאה" };
  const statusColor: Record<string,string> = { available:"bg-green-500", reserved:"bg-yellow-500", used:"bg-blue-500", scrapped:"bg-red-500" };
  const gradeColor: Record<string,string> = { A:"text-green-400", B:"text-yellow-400", C:"text-orange-400", D:"text-red-400" };

  const filtered = remnants.filter(r => {
    if (search && !r.material_type?.includes(search) && !r.location?.includes(search) && !String(r.id).includes(search)) return false;
    return true;
  });

  useEffect(() => { if (tab === "log") loadUsageLog(); }, [tab]);
  useEffect(() => { loadAll(); }, [filterStatus, filterType]);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"/></div>;

  return (
    <div className="p-6 space-y-6 text-white" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Recycle className="w-8 h-8 text-green-400" />
          <div>
            <h1 className="text-2xl font-bold">ניהול שאריות וחיתוכים</h1>
            <p className="text-sm text-gray-400">מעקב, חיפוש ושימוש חוזר בשאריות חומר גלם</p>
          </div>
        </div>
        <button onClick={()=>setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm">
          <Plus className="w-4 h-4" /> שארית חדשה
        </button>
      </div>

      {/* Dashboard */}
      {dashboard && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label:"זמינות", val: dashboard.total_available, color:"text-green-400" },
            { label:"שמורות", val: dashboard.total_reserved, color:"text-yellow-400" },
            { label:"בשימוש", val: dashboard.total_used, color:"text-blue-400" },
            { label:"אחוז ניצול", val: `${dashboard.usage_rate_pct || 0}%`, color:"text-emerald-400" },
          ].map((k,i) => (
            <motion.div key={i} initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:i*0.05}} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <span className="text-xs text-gray-400">{k.label}</span>
              <div className={`text-2xl font-bold ${k.color}`}>{k.val}</div>
            </motion.div>
          ))}
        </div>
      )}
      {dashboard && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <span className="text-xs text-gray-400">משקל זמין כולל</span>
            <div className="text-xl font-bold text-cyan-400">{Number(dashboard.total_available_weight_kg).toFixed(1)} ק"ג</div>
          </div>
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <span className="text-xs text-gray-400">סוגי חומרים</span>
            <div className="text-xl font-bold text-purple-400">{dashboard.material_types_count}</div>
          </div>
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <span className="text-xs text-gray-400">נגרטו</span>
            <div className="text-xl font-bold text-red-400">{dashboard.total_scrapped}</div>
          </div>
        </div>
      )}

      {/* Top Materials */}
      {dashboard?.top_materials && dashboard.top_materials.length > 0 && (
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <h3 className="text-sm font-bold mb-3 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-green-400" />חומרים מובילים (זמינים)</h3>
          <div className="flex flex-wrap gap-3">
            {dashboard.top_materials.map((m: any, i: number) => (
              <span key={i} className="px-3 py-1.5 bg-gray-900 rounded-lg text-xs">
                {m.material_type || "לא מוגדר"}: <span className="text-green-400 font-bold">{m.count}</span> יחידות
                {m.total_weight && <> ({Number(m.total_weight).toFixed(1)} ק"ג)</>}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-700 pb-2">
        {([["inventory","מלאי שאריות"],["search","חיפוש זמינים"],["log","יומן שימוש"]] as const).map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} className={`px-4 py-2 rounded-t-lg text-sm ${tab===k?"bg-gray-700 text-white":"text-gray-400 hover:text-white"}`}>{l}</button>
        ))}
      </div>

      {/* Create Remnant Form */}
      {showForm && (
        <motion.form initial={{opacity:0}} animate={{opacity:1}} onSubmit={createRemnant} className="bg-gray-800 rounded-xl p-6 border border-gray-700 grid grid-cols-1 md:grid-cols-3 gap-4">
          <input placeholder="סוג חומר" value={form.material_type} onChange={e=>setForm({...form,material_type:e.target.value})} className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm" required />
          <input type="number" placeholder="אורך (מ״מ)" value={form.length} onChange={e=>setForm({...form,length:e.target.value})} className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm" />
          <input type="number" placeholder="רוחב (מ״מ)" value={form.width} onChange={e=>setForm({...form,width:e.target.value})} className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm" />
          <input type="number" placeholder="עובי (מ״מ)" value={form.thickness} onChange={e=>setForm({...form,thickness:e.target.value})} className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm" />
          <input type="number" step="0.001" placeholder='משקל (ק"ג)' value={form.weight_kg} onChange={e=>setForm({...form,weight_kg:e.target.value})} className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm" />
          <input placeholder="מיקום במחסן" value={form.location} onChange={e=>setForm({...form,location:e.target.value})} className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm" />
          <select value={form.quality_grade} onChange={e=>setForm({...form,quality_grade:e.target.value})} className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm">
            <option value="A">A - מצוין</option><option value="B">B - טוב</option><option value="C">C - סביר</option><option value="D">D - נמוך</option>
          </select>
          <input type="number" placeholder="מזהה עבודת מקור" value={form.source_job_id} onChange={e=>setForm({...form,source_job_id:e.target.value})} className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <button type="submit" className="px-6 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm">שמור</button>
            <button type="button" onClick={()=>setShowForm(false)} className="px-6 py-2 bg-gray-600 rounded-lg text-sm">ביטול</button>
          </div>
        </motion.form>
      )}

      {/* TAB: Inventory */}
      {tab === "inventory" && (
        <div className="space-y-4">
          <div className="flex gap-3 flex-wrap items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
              <input placeholder="חיפוש..." value={search} onChange={e=>setSearch(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg pr-10 pl-4 py-2 text-sm" />
            </div>
            <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm">
              <option value="">כל הסטטוסים</option><option value="available">זמין</option><option value="reserved">שמור</option><option value="used">בשימוש</option><option value="scrapped">גרוטאה</option>
            </select>
            <select value={filterType} onChange={e=>setFilterType(e.target.value)} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm">
              <option value="">כל החומרים</option><option value="profile">פרופיל</option><option value="sheet">פח</option><option value="glass">זכוכית</option><option value="aluminum">אלומיניום</option>
            </select>
          </div>

          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-900"><tr>
                <th className="p-3 text-right">#</th><th className="p-3 text-right">חומר</th><th className="p-3 text-right">מידות</th>
                <th className="p-3 text-right">משקל</th><th className="p-3 text-right">מיקום</th><th className="p-3 text-right">דרגה</th>
                <th className="p-3 text-right">סטטוס</th><th className="p-3 text-right">פעולות</th>
              </tr></thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} className="border-t border-gray-700 hover:bg-gray-700/50">
                    <td className="p-3 font-mono text-xs">{r.id}</td>
                    <td className="p-3 font-bold">{r.material_type || "-"}</td>
                    <td className="p-3 text-xs">
                      {r.length && <span>{r.length}</span>}
                      {r.width && <span> x {r.width}</span>}
                      {r.thickness && <span> x {r.thickness}</span>} מ"מ
                    </td>
                    <td className="p-3">{r.weight_kg ? `${Number(r.weight_kg).toFixed(1)} ק"ג` : "-"}</td>
                    <td className="p-3 text-gray-400">{r.location || "-"}</td>
                    <td className="p-3"><span className={`font-bold ${gradeColor[r.quality_grade] || "text-gray-400"}`}>{r.quality_grade}</span></td>
                    <td className="p-3"><span className={`px-2 py-0.5 rounded-full text-xs text-white ${statusColor[r.status]||"bg-gray-500"}`}>{statusLabel[r.status]||r.status}</span></td>
                    <td className="p-3">
                      <div className="flex gap-1.5">
                        {r.status === "available" && (
                          <>
                            <button onClick={()=>reserveRemnant(r.id)} className="flex items-center gap-1 px-2 py-1 bg-yellow-600 hover:bg-yellow-700 rounded text-xs"><Lock className="w-3 h-3"/>שריון</button>
                            <button onClick={()=>useRemnant(r.id)} className="flex items-center gap-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs"><CheckCircle className="w-3 h-3"/>שימוש</button>
                          </>
                        )}
                        {r.status === "reserved" && (
                          <button onClick={()=>useRemnant(r.id)} className="flex items-center gap-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs"><CheckCircle className="w-3 h-3"/>שימוש</button>
                        )}
                        {(r.status === "available" || r.status === "reserved") && (
                          <button onClick={()=>scrapRemnant(r.id)} className="flex items-center gap-1 px-2 py-1 bg-red-600/30 hover:bg-red-600/50 rounded text-xs"><Trash2 className="w-3 h-3"/>גרט</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!filtered.length && <tr><td colSpan={8} className="p-8 text-center text-gray-400">אין שאריות</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: Search Available */}
      {tab === "search" && (
        <div className="space-y-4">
          <form onSubmit={searchAvailable} className="bg-gray-800 rounded-xl p-4 border border-gray-700 flex flex-wrap gap-3 items-end">
            <input placeholder="סוג חומר" value={searchForm.material_type} onChange={e=>setSearchForm({...searchForm,material_type:e.target.value})} className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm" />
            <input type="number" placeholder="אורך מינימלי (מ״מ)" value={searchForm.min_length} onChange={e=>setSearchForm({...searchForm,min_length:e.target.value})} className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm" />
            <input type="number" placeholder="רוחב מינימלי (מ״מ)" value={searchForm.min_width} onChange={e=>setSearchForm({...searchForm,min_width:e.target.value})} className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm" />
            <select value={searchForm.quality_grade} onChange={e=>setSearchForm({...searchForm,quality_grade:e.target.value})} className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm">
              <option value="">כל הדרגות</option><option value="A">A</option><option value="B">B</option><option value="C">C</option>
            </select>
            <button type="submit" className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm flex items-center gap-2"><Search className="w-4 h-4"/>חפש</button>
          </form>

          {searchResults.length > 0 && (
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-900"><tr>
                  <th className="p-3 text-right">#</th><th className="p-3 text-right">חומר</th><th className="p-3 text-right">אורך</th>
                  <th className="p-3 text-right">רוחב</th><th className="p-3 text-right">דרגה</th><th className="p-3 text-right">מיקום</th><th className="p-3 text-right">פעולות</th>
                </tr></thead>
                <tbody>
                  {searchResults.map(r => (
                    <tr key={r.id} className="border-t border-gray-700 hover:bg-gray-700/50">
                      <td className="p-3 font-mono text-xs">{r.id}</td>
                      <td className="p-3 font-bold">{r.material_type}</td>
                      <td className="p-3 text-green-400 font-bold">{r.length} מ"מ</td>
                      <td className="p-3">{r.width || "-"}</td>
                      <td className="p-3"><span className={`font-bold ${gradeColor[r.quality_grade]}`}>{r.quality_grade}</span></td>
                      <td className="p-3 text-gray-400">{r.location || "-"}</td>
                      <td className="p-3 flex gap-1.5">
                        <button onClick={()=>reserveRemnant(r.id)} className="px-2 py-1 bg-yellow-600 hover:bg-yellow-700 rounded text-xs">שריון</button>
                        <button onClick={()=>useRemnant(r.id)} className="px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs">שימוש</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="p-3 text-xs text-gray-400">נמצאו {searchResults.length} שאריות תואמות</div>
            </div>
          )}
          {searchResults.length === 0 && <div className="text-center text-gray-400 py-8">הזן קריטריונים וחפש שאריות זמינות</div>}
        </div>
      )}

      {/* TAB: Usage Log */}
      {tab === "log" && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-900"><tr>
              <th className="p-3 text-right">מזהה</th><th className="p-3 text-right">שארית #</th><th className="p-3 text-right">חומר</th>
              <th className="p-3 text-right">אורך מקורי</th><th className="p-3 text-right">אורך ששימש</th>
              <th className="p-3 text-right">עבודה</th><th className="p-3 text-right">תאריך</th>
            </tr></thead>
            <tbody>
              {usageLog.map(log => (
                <tr key={log.id} className="border-t border-gray-700 hover:bg-gray-700/50">
                  <td className="p-3 font-mono text-xs">{log.id}</td>
                  <td className="p-3">{log.remnant_id}</td>
                  <td className="p-3">{log.material_type || "-"}</td>
                  <td className="p-3">{log.original_length || "-"} מ"מ</td>
                  <td className="p-3 text-blue-400 font-bold">{log.used_length || "מלא"} {log.used_length ? 'מ"מ' : ""}</td>
                  <td className="p-3">{log.used_in_job_id || "-"}</td>
                  <td className="p-3 text-gray-400 text-xs">{log.used_at ? new Date(log.used_at).toLocaleString("he-IL") : "-"}</td>
                </tr>
              ))}
              {!usageLog.length && <tr><td colSpan={7} className="p-8 text-center text-gray-400">אין רשומות שימוש</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
