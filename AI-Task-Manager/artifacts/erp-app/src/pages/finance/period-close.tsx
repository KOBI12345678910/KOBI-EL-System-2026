import { useState, useEffect, useMemo } from "react";
import {
  CalendarCheck, Search, AlertTriangle, ArrowUpDown, CheckCircle2, Clock,
  Play, SkipForward, ChevronDown, ChevronRight, RefreshCw, X,
  ListChecks, BarChart3, Loader2, Check, Minus, Circle
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/utils";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);

interface PeriodCloseTask {
  id: number;
  category: string;
  task_name: string;
  description: string;
  assigned_to: string;
  status: string;
  due_date: string;
  completed_date: string;
  order_num: number;
  is_mandatory: boolean;
  notes: string;
  depends_on: number[];
}

interface PeriodInfo {
  id: number;
  period_name: string;
  fiscal_year: number;
  period_number: number;
  start_date: string;
  end_date: string;
  status: string;
}

const categoryMap: Record<string, { label: string; color: string; icon: any }> = {
  pre_close: { label: "טרום סגירה", color: "bg-blue-500/20 text-blue-400", icon: Clock },
  close: { label: "סגירה", color: "bg-amber-500/20 text-amber-400", icon: ListChecks },
  post_close: { label: "לאחר סגירה", color: "bg-purple-500/20 text-purple-400", icon: CheckCircle2 },
  reporting: { label: "דיווח", color: "bg-emerald-500/20 text-emerald-400", icon: BarChart3 },
};

const taskStatusMap: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: "ממתין", color: "bg-muted/20 text-muted-foreground", icon: Circle },
  in_progress: { label: "בביצוע", color: "bg-blue-500/20 text-blue-400", icon: Loader2 },
  completed: { label: "הושלם", color: "bg-green-500/20 text-green-400", icon: Check },
  skipped: { label: "דולג", color: "bg-amber-500/20 text-amber-400", icon: Minus },
};

const periodStatusMap: Record<string, { label: string; color: string }> = {
  open: { label: "פתוח", color: "bg-green-500/20 text-green-400" },
  in_progress: { label: "בסגירה", color: "bg-blue-500/20 text-blue-400" },
  closed: { label: "סגור", color: "bg-muted/20 text-muted-foreground" },
};

const fmtDate = (v: any) => v ? new Date(v).toLocaleDateString("he-IL") : "\u2014";

export default function PeriodClosePage() {
  const [tasks, setTasks] = useState<PeriodCloseTask[]>([]);
  const [periods, setPeriods] = useState<PeriodInfo[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    pre_close: true, close: true, post_close: true, reporting: true,
  });
  const [executingTask, setExecutingTask] = useState<number | null>(null);

  const loadPeriods = async () => {
    try {
      const res = await authFetch(`${API}/finance-sap/period-close/periods`);
      if (res.ok) {
        const data = safeArray(await res.json());
        setPeriods(data);
        if (data.length > 0 && !selectedPeriod) {
          const current = data.find((p: PeriodInfo) => p.status === "open" || p.status === "in_progress") || data[0];
          setSelectedPeriod(current.id);
        }
      }
    } catch {}
  };

  const loadTasks = async () => {
    if (!selectedPeriod) return;
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`${API}/finance-sap/period-close/tasks?period_id=${selectedPeriod}`);
      if (res.ok) setTasks(safeArray(await res.json()));
      else setError("שגיאה בטעינת משימות סגירה");
    } catch (e: any) {
      setError(e.message || "שגיאה");
    }
    setLoading(false);
  };

  useEffect(() => { loadPeriods(); }, []);
  useEffect(() => { if (selectedPeriod) loadTasks(); }, [selectedPeriod]);

  const executeTask = async (taskId: number, newStatus: string) => {
    setExecutingTask(taskId);
    try {
      await authFetch(`${API}/finance-sap/period-close/tasks/${taskId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus, period_id: selectedPeriod }),
      });
      loadTasks();
    } catch {}
    setExecutingTask(null);
  };

  const filtered = useMemo(() => {
    return tasks.filter(t =>
      (filterCategory === "all" || t.category === filterCategory) &&
      (filterStatus === "all" || t.status === filterStatus) &&
      (!search || [t.task_name, t.description, t.assigned_to]
        .some(f => f?.toLowerCase().includes(search.toLowerCase())))
    ).sort((a, b) => (a.order_num || 0) - (b.order_num || 0));
  }, [tasks, search, filterCategory, filterStatus]);

  const categoryGroups = useMemo(() => {
    const groups: Record<string, PeriodCloseTask[]> = {};
    for (const cat of Object.keys(categoryMap)) {
      groups[cat] = filtered.filter(t => t.category === cat);
    }
    return groups;
  }, [filtered]);

  const categoryProgress = useMemo(() => {
    const progress: Record<string, { total: number; completed: number; pct: number }> = {};
    for (const cat of Object.keys(categoryMap)) {
      const catTasks = tasks.filter(t => t.category === cat);
      const completed = catTasks.filter(t => t.status === "completed" || t.status === "skipped").length;
      progress[cat] = {
        total: catTasks.length,
        completed,
        pct: catTasks.length > 0 ? Math.round((completed / catTasks.length) * 100) : 0,
      };
    }
    return progress;
  }, [tasks]);

  const overallProgress = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter(t => t.status === "completed" || t.status === "skipped").length;
    return { total, done, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
  }, [tasks]);

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  const currentPeriod = periods.find(p => p.id === selectedPeriod);

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <CalendarCheck className="text-cyan-400 w-6 h-6" />
            סגירת תקופה
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול תהליך סגירת תקופה חשבונאית</p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <select
            value={selectedPeriod || ""}
            onChange={e => setSelectedPeriod(Number(e.target.value))}
            className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm min-w-[200px]"
          >
            <option value="" disabled>בחר תקופה</option>
            {periods.map(p => (
              <option key={p.id} value={p.id}>
                {p.period_name || `${p.fiscal_year}/${String(p.period_number).padStart(2, "0")}`}
                {p.status === "open" ? " (פתוח)" : p.status === "in_progress" ? " (בסגירה)" : " (סגור)"}
              </option>
            ))}
          </select>
          <button onClick={loadTasks} className="flex items-center gap-2 bg-card border border-border px-3 py-2.5 rounded-xl hover:bg-muted text-sm">
            <RefreshCw className="w-4 h-4" /> רענן
          </button>
        </div>
      </div>

      {/* Current Period Info & Overall Progress */}
      {currentPeriod && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-border/50 rounded-2xl p-5">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-foreground">
                {currentPeriod.period_name || `תקופה ${currentPeriod.period_number}/${currentPeriod.fiscal_year}`}
              </h2>
              <Badge className={periodStatusMap[currentPeriod.status]?.color}>
                {periodStatusMap[currentPeriod.status]?.label || currentPeriod.status}
              </Badge>
            </div>
            <div className="text-sm text-muted-foreground">
              {fmtDate(currentPeriod.start_date)} - {fmtDate(currentPeriod.end_date)}
            </div>
          </div>
          <div className="flex items-center gap-3 mb-2">
            <div className="flex-1 h-3 bg-muted/30 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${overallProgress.pct}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className={`h-full rounded-full ${overallProgress.pct === 100 ? "bg-green-500" : overallProgress.pct > 50 ? "bg-blue-500" : "bg-amber-500"}`}
              />
            </div>
            <span className="text-sm font-bold text-foreground min-w-[60px] text-left">
              {overallProgress.pct}%
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            {overallProgress.done} מתוך {overallProgress.total} משימות הושלמו
          </div>
        </motion.div>
      )}

      {/* Category Progress Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Object.entries(categoryMap).map(([cat, info], i) => {
          const prog = categoryProgress[cat] || { total: 0, completed: 0, pct: 0 };
          const Icon = info.icon;
          return (
            <motion.div key={cat} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-card border border-border/50 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Icon className={`w-4 h-4 ${info.color.split(" ")[1]}`} />
                <span className="text-sm font-medium text-foreground">{info.label}</span>
              </div>
              <div className="h-2 bg-muted/30 rounded-full overflow-hidden mb-2">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${prog.pct === 100 ? "bg-green-500" : prog.pct > 50 ? "bg-blue-500" : "bg-muted-foreground/50"}`}
                  style={{ width: `${prog.pct}%` }}
                />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">{prog.completed}/{prog.total}</span>
                <span className={`text-sm font-bold ${prog.pct === 100 ? "text-green-400" : "text-foreground"}`}>{prog.pct}%</span>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Search & Filter */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש משימה..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הקטגוריות</option>
          {Object.entries(categoryMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הסטטוסים</option>
          {Object.entries(taskStatusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <span className="text-sm text-muted-foreground">{filtered.length} משימות</span>
      </div>

      {/* Task Checklist by Category */}
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse">
              <div className="h-5 w-32 bg-muted/30 rounded mb-3" />
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="flex items-center gap-3 py-2">
                  <div className="h-5 w-5 bg-muted/30 rounded" />
                  <div className="h-4 w-48 bg-muted/30 rounded" />
                  <div className="h-4 w-20 bg-muted/30 rounded mr-auto" />
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-16 text-red-400">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="font-medium">שגיאה בטעינה</p>
          <p className="text-sm mt-1">{error}</p>
          <button onClick={loadTasks} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button>
        </div>
      ) : !selectedPeriod ? (
        <div className="text-center py-16 text-muted-foreground">
          <CalendarCheck className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">בחר תקופה</p>
          <p className="text-sm mt-1">בחר תקופה מהרשימה כדי לצפות במשימות הסגירה</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(categoryMap).map(([cat, catInfo]) => {
            const catTasks = categoryGroups[cat] || [];
            if (filterCategory !== "all" && filterCategory !== cat) return null;
            if (catTasks.length === 0 && filterCategory === "all") return null;
            const isExpanded = expandedCategories[cat];
            const Icon = catInfo.icon;
            const prog = categoryProgress[cat] || { total: 0, completed: 0, pct: 0 };

            return (
              <motion.div
                key={cat}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"
              >
                <button
                  onClick={() => toggleCategory(cat)}
                  className="w-full flex items-center justify-between p-4 hover:bg-muted/20 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                    <Icon className={`w-5 h-5 ${catInfo.color.split(" ")[1]}`} />
                    <span className="font-medium text-foreground">{catInfo.label}</span>
                    <Badge className={catInfo.color}>{catTasks.length}</Badge>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-24 h-2 bg-muted/30 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${prog.pct === 100 ? "bg-green-500" : "bg-blue-500"}`}
                        style={{ width: `${prog.pct}%` }}
                      />
                    </div>
                    <span className="text-sm text-muted-foreground min-w-[40px] text-left">{prog.pct}%</span>
                  </div>
                </button>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className="border-t border-border/30">
                        {catTasks.length === 0 ? (
                          <div className="p-4 text-center text-sm text-muted-foreground">אין משימות בקטגוריה זו</div>
                        ) : (
                          catTasks.map(task => {
                            const statusInfo = taskStatusMap[task.status] || taskStatusMap.pending;
                            const StatusIcon = statusInfo.icon;
                            const isExecuting = executingTask === task.id;
                            return (
                              <div
                                key={task.id}
                                className="flex items-center gap-3 px-4 py-3 border-b border-border/10 last:border-b-0 hover:bg-muted/10 transition-colors group"
                              >
                                <StatusIcon className={`w-5 h-5 flex-shrink-0 ${task.status === "in_progress" ? "animate-spin" : ""} ${statusInfo.color.split(" ")[1]}`} />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className={`text-sm font-medium ${task.status === "completed" ? "line-through text-muted-foreground" : "text-foreground"}`}>
                                      {task.task_name}
                                    </span>
                                    {task.is_mandatory && (
                                      <span className="text-[9px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded font-bold">חובה</span>
                                    )}
                                  </div>
                                  {task.description && (
                                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{task.description}</p>
                                  )}
                                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                    {task.assigned_to && <span>אחראי: {task.assigned_to}</span>}
                                    {task.due_date && <span>יעד: {fmtDate(task.due_date)}</span>}
                                    {task.completed_date && <span>הושלם: {fmtDate(task.completed_date)}</span>}
                                  </div>
                                </div>
                                <Badge className={`text-[10px] ${statusInfo.color}`}>
                                  {statusInfo.label}
                                </Badge>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  {task.status === "pending" && (
                                    <>
                                      <button
                                        onClick={() => executeTask(task.id, "in_progress")}
                                        disabled={isExecuting}
                                        className="p-1.5 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 text-xs disabled:opacity-50"
                                        title="התחל ביצוע"
                                      >
                                        {isExecuting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                                      </button>
                                      {!task.is_mandatory && (
                                        <button
                                          onClick={() => executeTask(task.id, "skipped")}
                                          disabled={isExecuting}
                                          className="p-1.5 bg-amber-500/20 text-amber-400 rounded-lg hover:bg-amber-500/30 text-xs disabled:opacity-50"
                                          title="דלג"
                                        >
                                          <SkipForward className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                    </>
                                  )}
                                  {task.status === "in_progress" && (
                                    <button
                                      onClick={() => executeTask(task.id, "completed")}
                                      disabled={isExecuting}
                                      className="p-1.5 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 text-xs disabled:opacity-50"
                                      title="סיים"
                                    >
                                      {isExecuting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                                    </button>
                                  )}
                                  {(task.status === "completed" || task.status === "skipped") && (
                                    <button
                                      onClick={() => executeTask(task.id, "pending")}
                                      disabled={isExecuting}
                                      className="p-1.5 bg-muted/30 text-muted-foreground rounded-lg hover:bg-muted/50 text-xs disabled:opacity-50"
                                      title="החזר לממתין"
                                    >
                                      <RefreshCw className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
