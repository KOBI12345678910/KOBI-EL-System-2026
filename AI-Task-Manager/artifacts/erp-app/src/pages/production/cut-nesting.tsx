import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Scissors, Plus, Search, BarChart3, Package, CheckCircle, Clock, AlertTriangle, Trash2, Play, Layers } from "lucide-react";

interface NestingJob {
  id: number; job_number: string; material_type: string; source_material_id: number;
  raw_length: number; raw_width: number; parts_to_cut: any; status: string; waste_percentage: number; created_at: string;
}
interface NestingResult {
  id: number; job_id: number; pattern_data: any; total_waste: number; remnants: any; estimated_time_min: number; created_at: string;
}
interface Dashboard {
  total_jobs: number; pending: number; optimizing: number; optimized: number; cutting: number; completed: number; avg_waste: number; best_waste: number;
}

export default function CutNestingPage() {
  const [jobs, setJobs] = useState<NestingJob[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard|null>(null);
  const [selectedJob, setSelectedJob] = useState<NestingJob|null>(null);
  const [results, setResults] = useState<NestingResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [optimizing, setOptimizing] = useState<number|null>(null);
  const [form, setForm] = useState({ material_type:"profile", raw_length:"6000", raw_width:"", parts_json:"" });

  const token = localStorage.getItem("erp_token");
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [j, d] = await Promise.all([
        fetch("/api/cut-nesting/jobs", { headers }).then(r=>r.json()),
        fetch("/api/cut-nesting/dashboard", { headers }).then(r=>r.json()),
      ]);
      setJobs(Array.isArray(j) ? j : []);
      setDashboard(d);
    } catch {} finally { setLoading(false); }
  }

  async function createJob(e: React.FormEvent) {
    e.preventDefault();
    let parts: any[] = [];
    try { parts = JSON.parse(form.parts_json); } catch { parts = []; }
    await fetch("/api/cut-nesting/jobs", { method:"POST", headers, body: JSON.stringify({
      material_type: form.material_type,
      raw_length: Number(form.raw_length),
      raw_width: form.raw_width ? Number(form.raw_width) : null,
      parts_to_cut: parts,
    })});
    setShowForm(false);
    setForm({ material_type:"profile", raw_length:"6000", raw_width:"", parts_json:"" });
    loadAll();
  }

  async function optimizeJob(job: NestingJob) {
    setOptimizing(job.id);
    try {
      const data = await fetch(`/api/cut-nesting/jobs/${job.id}/optimize`, { method:"POST", headers }).then(r=>r.json());
      if (data.result) { setResults([data.result]); setSelectedJob(data.job || job); }
      loadAll();
    } finally { setOptimizing(null); }
  }

  async function loadResults(job: NestingJob) {
    setSelectedJob(job);
    const data = await fetch(`/api/cut-nesting/jobs/${job.id}/results`, { headers }).then(r=>r.json());
    setResults(Array.isArray(data) ? data : []);
  }

  async function completeJob(jobId: number) {
    await fetch(`/api/cut-nesting/jobs/${jobId}/complete`, { method:"POST", headers });
    loadAll();
  }

  const statusLabel: Record<string,string> = { pending:"ממתין", optimizing:"מייעל...", optimized:"מותאם", cutting:"בחיתוך", completed:"הושלם" };
  const statusColor: Record<string,string> = { pending:"bg-gray-500", optimizing:"bg-blue-500 animate-pulse", optimized:"bg-green-500", cutting:"bg-yellow-500", completed:"bg-emerald-600" };
  const matLabel: Record<string,string> = { profile:"פרופיל", sheet:"פח/לוח", glass:"זכוכית" };

  const filtered = jobs.filter(j => !search || j.job_number.includes(search) || j.material_type.includes(search));

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"/></div>;

  return (
    <div className="p-6 space-y-6 text-white" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Scissors className="w-8 h-8 text-orange-400" />
          <div>
            <h1 className="text-2xl font-bold">אופטימיזציית חיתוך / Nesting</h1>
            <p className="text-sm text-gray-400">מינימום פסולת - מקסימום ניצול חומר גלם</p>
          </div>
        </div>
        <button onClick={()=>setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded-lg text-sm">
          <Plus className="w-4 h-4" /> עבודה חדשה
        </button>
      </div>

      {/* Dashboard */}
      {dashboard && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label:"סה\"כ עבודות", val: dashboard.total_jobs, color:"text-blue-400" },
            { label:"ממתינות", val: dashboard.pending, color:"text-gray-400" },
            { label:"בחיתוך", val: dashboard.cutting, color:"text-yellow-400" },
            { label:"הושלמו", val: dashboard.completed, color:"text-green-400" },
          ].map((k,i) => (
            <motion.div key={i} initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:i*0.05}} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <span className="text-xs text-gray-400">{k.label}</span>
              <div className={`text-2xl font-bold ${k.color}`}>{k.val}</div>
            </motion.div>
          ))}
        </div>
      )}
      {dashboard && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <span className="text-xs text-gray-400">ממוצע פסולת</span>
            <div className={`text-2xl font-bold ${Number(dashboard.avg_waste) < 10 ? "text-green-400" : Number(dashboard.avg_waste) < 20 ? "text-yellow-400" : "text-red-400"}`}>
              {Number(dashboard.avg_waste).toFixed(1)}%
            </div>
          </div>
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <span className="text-xs text-gray-400">שיא יעילות (מינימום פסולת)</span>
            <div className="text-2xl font-bold text-emerald-400">{Number(dashboard.best_waste).toFixed(1)}%</div>
          </div>
        </div>
      )}

      {/* Create Job Form */}
      {showForm && (
        <motion.form initial={{opacity:0}} animate={{opacity:1}} onSubmit={createJob} className="bg-gray-800 rounded-xl p-6 border border-gray-700 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <select value={form.material_type} onChange={e=>setForm({...form,material_type:e.target.value})} className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm">
              <option value="profile">פרופיל (1D)</option><option value="sheet">פח/לוח (2D)</option><option value="glass">זכוכית (2D)</option>
            </select>
            <input type="number" placeholder="אורך גולמי (מ״מ)" value={form.raw_length} onChange={e=>setForm({...form,raw_length:e.target.value})} className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm" required />
            <input type="number" placeholder="רוחב גולמי (מ״מ) - ל-2D" value={form.raw_width} onChange={e=>setForm({...form,raw_width:e.target.value})} className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">חלקים לחיתוך (JSON): [{`{"part_id":"A1","length":500,"width":300,"qty":4}`}]</label>
            <textarea value={form.parts_json} onChange={e=>setForm({...form,parts_json:e.target.value})} className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm font-mono" rows={3}
              placeholder='[{"part_id":"A1","length":1200,"qty":5},{"part_id":"B2","length":800,"qty":3}]' />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="px-6 py-2 bg-orange-600 hover:bg-orange-700 rounded-lg text-sm">צור עבודה</button>
            <button type="button" onClick={()=>setShowForm(false)} className="px-6 py-2 bg-gray-600 rounded-lg text-sm">ביטול</button>
          </div>
        </motion.form>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
        <input placeholder="חיפוש עבודות..." value={search} onChange={e=>setSearch(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg pr-10 pl-4 py-2 text-sm" />
      </div>

      {/* Jobs Table */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-900"><tr>
            <th className="p-3 text-right">מספר עבודה</th><th className="p-3 text-right">חומר</th>
            <th className="p-3 text-right">אורך גולמי</th><th className="p-3 text-right">חלקים</th>
            <th className="p-3 text-right">פסולת %</th><th className="p-3 text-right">סטטוס</th><th className="p-3 text-right">פעולות</th>
          </tr></thead>
          <tbody>
            {filtered.map(job => {
              const parts = typeof job.parts_to_cut === "string" ? JSON.parse(job.parts_to_cut || "[]") : (job.parts_to_cut || []);
              return (
                <tr key={job.id} className="border-t border-gray-700 hover:bg-gray-700/50">
                  <td className="p-3 font-mono font-bold text-orange-400">{job.job_number}</td>
                  <td className="p-3">{matLabel[job.material_type] || job.material_type}</td>
                  <td className="p-3">{job.raw_length} {job.raw_width ? `x ${job.raw_width}` : ""} מ"מ</td>
                  <td className="p-3">{parts.length} סוגים</td>
                  <td className="p-3">
                    {job.waste_percentage != null ? (
                      <span className={`font-bold ${job.waste_percentage < 10 ? "text-green-400" : job.waste_percentage < 20 ? "text-yellow-400" : "text-red-400"}`}>
                        {Number(job.waste_percentage).toFixed(1)}%
                      </span>
                    ) : "-"}
                  </td>
                  <td className="p-3"><span className={`px-2 py-0.5 rounded-full text-xs text-white ${statusColor[job.status]||"bg-gray-500"}`}>{statusLabel[job.status]||job.status}</span></td>
                  <td className="p-3">
                    <div className="flex gap-1.5">
                      {job.status === "pending" && (
                        <button onClick={()=>optimizeJob(job)} disabled={optimizing===job.id} className="flex items-center gap-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs disabled:opacity-50">
                          <Play className="w-3 h-3"/>{optimizing===job.id ? "מייעל..." : "ייעל"}
                        </button>
                      )}
                      {(job.status === "optimized" || job.status === "cutting") && (
                        <button onClick={()=>completeJob(job.id)} className="flex items-center gap-1 px-2 py-1 bg-green-600 hover:bg-green-700 rounded text-xs">
                          <CheckCircle className="w-3 h-3"/>סיום
                        </button>
                      )}
                      <button onClick={()=>loadResults(job)} className="flex items-center gap-1 px-2 py-1 bg-gray-600 hover:bg-gray-700 rounded text-xs">
                        <Layers className="w-3 h-3"/>תוצאות
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!filtered.length && <tr><td colSpan={7} className="p-8 text-center text-gray-400">אין עבודות</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Results Panel */}
      {selectedJob && results.length > 0 && (
        <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} className="bg-gray-800 rounded-xl p-6 border border-orange-500/30 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold flex items-center gap-2"><BarChart3 className="w-5 h-5 text-orange-400" /> תוצאות ייעול - {selectedJob.job_number}</h2>
            <button onClick={()=>{setSelectedJob(null);setResults([]);}} className="text-gray-400 hover:text-white text-sm">סגור</button>
          </div>
          {results.map(r => {
            const pattern = typeof r.pattern_data === "string" ? JSON.parse(r.pattern_data) : (r.pattern_data || {});
            const remnants = typeof r.remnants === "string" ? JSON.parse(r.remnants) : (r.remnants || []);
            return (
              <div key={r.id} className="space-y-3">
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-gray-900 rounded-lg p-3">
                    <span className="text-xs text-gray-400">מוטות/לוחות בשימוש</span>
                    <div className="text-xl font-bold text-blue-400">{pattern.bars_used || 0}</div>
                  </div>
                  <div className="bg-gray-900 rounded-lg p-3">
                    <span className="text-xs text-gray-400">סה"כ פסולת</span>
                    <div className="text-xl font-bold text-red-400">{Number(r.total_waste).toFixed(0)} מ"מ</div>
                  </div>
                  <div className="bg-gray-900 rounded-lg p-3">
                    <span className="text-xs text-gray-400">זמן משוער</span>
                    <div className="text-xl font-bold text-cyan-400">{r.estimated_time_min} דקות</div>
                  </div>
                </div>
                {remnants.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold text-gray-300 mb-2">שאריות (Remnants):</h3>
                    <div className="flex flex-wrap gap-2">
                      {remnants.map((rem: any, i: number) => (
                        <span key={i} className="px-3 py-1 bg-gray-900 rounded-lg text-xs">
                          מוט #{rem.bar}: <span className="text-green-400 font-bold">{rem.remaining_length} מ"מ</span>
                          {rem.remaining_width && <> x {rem.remaining_width} מ"מ</>}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
