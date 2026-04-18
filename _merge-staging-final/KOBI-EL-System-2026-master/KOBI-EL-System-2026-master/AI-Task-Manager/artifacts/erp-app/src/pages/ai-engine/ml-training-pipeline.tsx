import { useState, useEffect } from "react";
import { authFetch } from "@/lib/utils";
import { motion } from "framer-motion";
import {
  Database, Play, CheckCircle2, XCircle, Clock, Loader2,
  BarChart3, TrendingUp, RefreshCw, Trash2, ChevronDown,
  ChevronRight, Cpu, Activity, Plus, X
} from "lucide-react";

const API = "/api";
const token = () => localStorage.getItem("erp_token") || "";
const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token()}` });

interface TrainingJob {
  id: number;
  name: string;
  description: string;
  job_type: string;
  status: string;
  dataset_config: any;
  metrics: any;
  progress_pct: number;
  started_at: string;
  completed_at: string;
  error_message: string;
  created_at: string;
}

interface DeployedModel {
  id: number;
  name: string;
  model_type: string;
  version: string;
  metrics: any;
  prediction_count: number;
  deployed_at: string;
  job_name: string;
}

interface Dataset {
  id: string;
  label: string;
  table: string;
  description: string;
  rowCount: number;
}

const STATUS_CONFIG: Record<string, { color: string; icon: any }> = {
  pending: { color: "text-amber-400 bg-amber-500/10", icon: Clock },
  running: { color: "text-blue-400 bg-blue-500/10", icon: Loader2 },
  completed: { color: "text-green-400 bg-green-500/10", icon: CheckCircle2 },
  failed: { color: "text-red-400 bg-red-500/10", icon: XCircle },
};

export default function MLTrainingPipelinePage() {
  const [jobs, setJobs] = useState<TrainingJob[]>([]);
  const [models, setModels] = useState<DeployedModel[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [jobTypes, setJobTypes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewJob, setShowNewJob] = useState(false);
  const [expandedJob, setExpandedJob] = useState<number | null>(null);
  const [predicting, setPredicting] = useState<number | null>(null);
  const [predResult, setPredResult] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"jobs" | "models">("jobs");

  const [newJob, setNewJob] = useState({
    name: "",
    description: "",
    jobType: "time_series_forecast",
    datasetId: "sales_history",
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [jobsRes, modelsRes, datasetsRes] = await Promise.all([
        authFetch(`${API}/ai-orchestration/ml/jobs`, { headers: headers() }).then(r => r.json()),
        authFetch(`${API}/ai-orchestration/ml/models`, { headers: headers() }).then(r => r.json()),
        authFetch(`${API}/ai-orchestration/ml/datasets`, { headers: headers() }).then(r => r.json()),
      ]);
      setJobs(jobsRes.jobs || []);
      setModels(modelsRes.models || []);
      setDatasets(datasetsRes.datasets || []);
      setJobTypes(datasetsRes.jobTypes || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    const runningJobs = jobs.filter(j => j.status === "running" || j.status === "pending");
    if (runningJobs.length > 0) {
      const timer = setInterval(fetchData, 3000);
      return () => clearInterval(timer);
    }
  }, [jobs]);

  const createJob = async () => {
    if (!newJob.name) return;
    try {
      await authFetch(`${API}/ai-orchestration/ml/jobs`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          name: newJob.name,
          description: newJob.description,
          jobType: newJob.jobType,
          datasetConfig: { datasetId: newJob.datasetId },
        }),
      });
      setShowNewJob(false);
      setNewJob({ name: "", description: "", jobType: "time_series_forecast", datasetId: "sales_history" });
      await fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const deleteJob = async (id: number) => {
    await authFetch(`${API}/ai-orchestration/ml/jobs/${id}`, { method: "DELETE", headers: headers() });
    fetchData();
  };

  const runPrediction = async (modelId: number) => {
    setPredicting(modelId);
    setPredResult(null);
    try {
      const result = await authFetch(`${API}/ai-orchestration/ml/models/${modelId}/predict`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ input: { period: "next_30_days" } }),
      }).then(r => r.json());
      setPredResult(result);
    } catch (e) {
      console.error(e);
    } finally {
      setPredicting(null);
    }
  };

  const formatDate = (d: string) => d ? new Date(d).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" }) : "—";

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/30 flex items-center justify-center">
          <Cpu className="w-6 h-6 text-blue-400" />
        </div>
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground">ML Training Pipeline</h1>
          <p className="text-muted-foreground text-sm">הגדר מודלים, הפעל אימון, עקוב אחר ביצועים ופרוס תחזיות</p>
        </div>
        <div className="mr-auto flex gap-2">
          <button onClick={fetchData} className="flex items-center gap-2 px-3 py-1.5 bg-card border border-border rounded-lg hover:bg-muted text-sm">
            <RefreshCw className="w-3.5 h-3.5" /> רענן
          </button>
          <button onClick={() => setShowNewJob(true)} className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-foreground rounded-lg text-sm">
            <Plus className="w-3.5 h-3.5" /> משימת אימון חדשה
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-foreground">{jobs.length}</div>
          <div className="text-xs text-muted-foreground">משימות סה"כ</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-green-400">{jobs.filter(j => j.status === "completed").length}</div>
          <div className="text-xs text-muted-foreground">הושלמו</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-blue-400">{models.length}</div>
          <div className="text-xs text-muted-foreground">מודלים פעילים</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-violet-400">{models.reduce((s, m) => s + (m.prediction_count || 0), 0)}</div>
          <div className="text-xs text-muted-foreground">תחזיות בוצעו</div>
        </div>
      </div>

      {showNewJob && (
        <div className="bg-card border border-blue-500/30 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-foreground">משימת אימון חדשה</h3>
            <button onClick={() => setShowNewJob(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">שם המשימה *</label>
              <input
                value={newJob.name}
                onChange={e => setNewJob({ ...newJob, name: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-blue-500"
                placeholder="לדוגמה: תחזית מכירות Q2"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">סוג מודל</label>
              <select
                value={newJob.jobType}
                onChange={e => setNewJob({ ...newJob, jobType: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground"
              >
                {jobTypes.map(jt => (
                  <option key={jt.id} value={jt.id}>{jt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">מקור נתונים</label>
              <select
                value={newJob.datasetId}
                onChange={e => setNewJob({ ...newJob, datasetId: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground"
              >
                {datasets.map(ds => (
                  <option key={ds.id} value={ds.id}>{ds.label} ({ds.rowCount.toLocaleString()} שורות)</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">תיאור (אופציונלי)</label>
              <input
                value={newJob.description}
                onChange={e => setNewJob({ ...newJob, description: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-blue-500"
                placeholder="תיאור קצר"
              />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={createJob} disabled={!newJob.name}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-foreground rounded-lg text-sm">
              <Play className="w-3.5 h-3.5" /> הפעל אימון
            </button>
            <button onClick={() => setShowNewJob(false)} className="px-4 py-2 bg-card border border-border rounded-lg text-sm text-muted-foreground hover:text-foreground">
              ביטול
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2 border-b border-border pb-0">
        {(["jobs", "models"] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === tab ? "border-blue-500 text-blue-400" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {tab === "jobs" ? "משימות אימון" : "מודלים פרוסים"}
          </button>
        ))}
      </div>

      {activeTab === "jobs" && (
        loading ? (
          <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-16 bg-card rounded-xl animate-pulse border border-border" />)}</div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Cpu className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>אין משימות אימון. צור משימה חדשה כדי להתחיל.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {jobs.map(job => {
              const sc = STATUS_CONFIG[job.status] || { color: "text-gray-400", icon: Clock };
              const Icon = sc.icon;
              const metrics = typeof job.metrics === "string" ? JSON.parse(job.metrics || "{}") : (job.metrics || {});
              return (
                <div key={job.id} className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/20 transition-colors"
                    onClick={() => setExpandedJob(expandedJob === job.id ? null : job.id)}>
                    <span className={`flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full ${sc.color}`}>
                      <Icon className={`w-3 h-3 ${job.status === "running" ? "animate-spin" : ""}`} />
                      {job.status}
                    </span>
                    <span className="text-foreground text-sm font-medium">{job.name}</span>
                    <span className="text-xs text-muted-foreground">{job.job_type}</span>
                    {job.status === "running" && (
                      <div className="flex-1 max-w-[150px] h-1.5 bg-muted/30 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${job.progress_pct || 0}%` }} />
                      </div>
                    )}
                    <div className="flex items-center gap-2 mr-auto text-xs text-muted-foreground">
                      {metrics.accuracy && <span className="text-green-400">{Math.round(metrics.accuracy * 100)}% accuracy</span>}
                      <span>{formatDate(job.created_at)}</span>
                      <button onClick={e => { e.stopPropagation(); deleteJob(job.id); }}
                        className="text-red-400/60 hover:text-red-400 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      {expandedJob === job.id ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </div>
                  </div>

                  {expandedJob === job.id && (
                    <div className="border-t border-border p-4 bg-muted/10">
                      {job.description && <p className="text-sm text-muted-foreground mb-3">{job.description}</p>}
                      {job.error_message && (
                        <div className="p-2 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400 mb-3">{job.error_message}</div>
                      )}
                      {Object.keys(metrics).length > 0 && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          {metrics.accuracy && <div className="bg-background rounded-lg p-3 text-center">
                            <div className="text-lg font-bold text-green-400">{Math.round(metrics.accuracy * 100)}%</div>
                            <div className="text-xs text-muted-foreground">Accuracy</div>
                          </div>}
                          {metrics.precision && <div className="bg-background rounded-lg p-3 text-center">
                            <div className="text-lg font-bold text-blue-400">{Math.round(metrics.precision * 100)}%</div>
                            <div className="text-xs text-muted-foreground">Precision</div>
                          </div>}
                          {metrics.recall && <div className="bg-background rounded-lg p-3 text-center">
                            <div className="text-lg font-bold text-violet-400">{Math.round(metrics.recall * 100)}%</div>
                            <div className="text-xs text-muted-foreground">Recall</div>
                          </div>}
                          {metrics.f1_score && <div className="bg-background rounded-lg p-3 text-center">
                            <div className="text-lg font-bold text-amber-400">{Math.round(metrics.f1_score * 100)}%</div>
                            <div className="text-xs text-muted-foreground">F1 Score</div>
                          </div>}
                        </div>
                      )}
                      {metrics.model_summary && (
                        <p className="text-xs text-muted-foreground mt-3 bg-background rounded-lg p-2">{metrics.model_summary}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}

      {activeTab === "models" && (
        models.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Database className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>אין מודלים פרוסים. השלם משימת אימון כדי לפרוס מודל.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {models.map(model => {
              const metrics = typeof model.metrics === "string" ? JSON.parse(model.metrics || "{}") : (model.metrics || {});
              return (
                <motion.div key={model.id} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}
                  className="bg-card border border-border rounded-xl p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-foreground text-sm">{model.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground">{model.model_type}</span>
                        <span className="text-xs text-blue-400">v{model.version}</span>
                      </div>
                    </div>
                    <span className="text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">פעיל</span>
                  </div>

                  {metrics.accuracy && (
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      <div className="text-center">
                        <div className="text-sm font-bold text-green-400">{Math.round(metrics.accuracy * 100)}%</div>
                        <div className="text-[10px] text-muted-foreground">Accuracy</div>
                      </div>
                      {metrics.precision && <div className="text-center">
                        <div className="text-sm font-bold text-blue-400">{Math.round(metrics.precision * 100)}%</div>
                        <div className="text-[10px] text-muted-foreground">Precision</div>
                      </div>}
                      {metrics.f1_score && <div className="text-center">
                        <div className="text-sm font-bold text-violet-400">{Math.round(metrics.f1_score * 100)}%</div>
                        <div className="text-[10px] text-muted-foreground">F1 Score</div>
                      </div>}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
                    <span>פרוס: {formatDate(model.deployed_at)}</span>
                    <span>{model.prediction_count || 0} תחזיות</span>
                  </div>

                  <button
                    onClick={() => runPrediction(model.id)}
                    disabled={predicting === model.id}
                    className="w-full flex items-center justify-center gap-2 py-2 bg-blue-600/20 border border-blue-500/30 hover:bg-blue-600/30 text-blue-400 rounded-lg text-sm transition-colors disabled:opacity-50"
                  >
                    {predicting === model.id
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> מחשב תחזית...</>
                      : <><Play className="w-3.5 h-3.5" /> הפעל תחזית</>}
                  </button>

                  {predResult && predicting === null && (
                    <div className="mt-3 p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-xs">
                      <div className="text-green-400 font-medium mb-1">תוצאת תחזית</div>
                      <div className="text-foreground">{JSON.stringify(predResult.prediction)}</div>
                      {predResult.confidence && <div className="text-muted-foreground mt-1">ביטחון: {Math.round(predResult.confidence * 100)}%</div>}
                      {predResult.explanation && <div className="text-muted-foreground mt-1">{predResult.explanation}</div>}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
