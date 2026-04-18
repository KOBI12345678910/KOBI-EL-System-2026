import { useState, useRef, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  GanttChart, Plus, ChevronRight, ChevronLeft, ChevronDown, ZoomIn, ZoomOut,
  AlertTriangle, Save, Download, GitBranch, RefreshCw, Diamond, Link, X
} from "lucide-react";
import { authFetch } from "@/lib/utils";

const API = "/api";

type ZoomLevel = "day" | "week" | "month" | "quarter";

const ZOOM_CELL_W: Record<ZoomLevel, number> = {
  day: 32,
  week: 100,
  month: 120,
  quarter: 90,
};
const ZOOM_DAYS: Record<ZoomLevel, number> = {
  day: 1,
  week: 7,
  month: 30,
  quarter: 91,
};
const ROW_H = 36;
const LABEL_W = 300;
const HEADER_H = 56;

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function diffDays(a: Date, b: Date) {
  return Math.floor((b.getTime() - a.getTime()) / 86400000);
}

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function fmtLabel(d: Date, zoom: ZoomLevel) {
  if (zoom === "day") return `${d.getDate()}/${d.getMonth() + 1}`;
  if (zoom === "week") return `${d.getDate()}/${d.getMonth() + 1}`;
  if (zoom === "month") {
    const months = ["ינו", "פבר", "מרץ", "אפר", "מאי", "יונ", "יול", "אוג", "ספט", "אוק", "נוב", "דצמ"];
    return `${months[d.getMonth()]} ${d.getFullYear()}`;
  }
  const quarters = ["Q1", "Q2", "Q3", "Q4"];
  return `${quarters[Math.floor(d.getMonth() / 3)]} ${d.getFullYear()}`;
}

function buildColumns(start: Date, totalDays: number, zoom: ZoomLevel): { date: Date; label: string }[] {
  const cols: { date: Date; label: string }[] = [];
  const step = ZOOM_DAYS[zoom];
  let cur = new Date(start);
  while (diffDays(start, cur) < totalDays) {
    cols.push({ date: new Date(cur), label: fmtLabel(cur, zoom) });
    cur = addDays(cur, step);
  }
  return cols;
}

function buildWbsTree(tasks: any[]): any[] {
  const map = new Map<number, any>();
  const roots: any[] = [];
  for (const t of tasks) {
    map.set(t.id, { ...t, children: [] });
  }
  for (const t of tasks) {
    const node = map.get(t.id)!;
    if (t.parent_task_id && map.has(t.parent_task_id)) {
      map.get(t.parent_task_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function flattenTree(nodes: any[], depth = 0, expanded: Set<number>): any[] {
  const result: any[] = [];
  for (const node of nodes) {
    result.push({ ...node, depth });
    if (node.children.length > 0 && expanded.has(node.id)) {
      result.push(...flattenTree(node.children, depth + 1, expanded));
    }
  }
  return result;
}

function getBarBounds(task: any, viewStart: Date, cellW: number, zoom: ZoomLevel) {
  const step = ZOOM_DAYS[zoom];
  const start = task.planned_start ? new Date(task.planned_start) : null;
  const end = task.planned_end ? new Date(task.planned_end) : null;
  if (!start) return null;
  const endDate = end || addDays(start, (task.duration || 1) - 1);
  const startX = (diffDays(viewStart, start) / step) * cellW;
  const endX = (diffDays(viewStart, addDays(endDate, 1)) / step) * cellW;
  return { startX, width: Math.max(endX - startX, 4) };
}

function getBaselineBounds(task: any, viewStart: Date, cellW: number, zoom: ZoomLevel) {
  if (!task.baseline_start) return null;
  const step = ZOOM_DAYS[zoom];
  const start = new Date(task.baseline_start);
  const end = task.baseline_end ? new Date(task.baseline_end) : addDays(start, (task.duration || 1) - 1);
  const startX = (diffDays(viewStart, start) / step) * cellW;
  const endX = (diffDays(viewStart, addDays(end, 1)) / step) * cellW;
  return { startX, width: Math.max(endX - startX, 4) };
}

function getTodayX(viewStart: Date, cellW: number, zoom: ZoomLevel) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return (diffDays(viewStart, today) / ZOOM_DAYS[zoom]) * cellW;
}

export default function GanttChartPage() {
  const [zoom, setZoom] = useState<ZoomLevel>("week");
  const [viewOffset, setViewOffset] = useState(-2);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [dragging, setDragging] = useState<{ taskId: number; startX: number; origStart: string | null } | null>(null);
  const [showDepForm, setShowDepForm] = useState(false);
  const [depForm, setDepForm] = useState<any>({ dependencyType: "FS", lagDays: 0 });
  const [showBaselineInfo, setShowBaselineInfo] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const qc = useQueryClient();

  const cellW = ZOOM_CELL_W[zoom];
  const totalCols = 52;
  const totalDays = totalCols * ZOOM_DAYS[zoom];
  const svgW = cellW * totalCols;

  const viewStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + viewOffset * ZOOM_DAYS[zoom]);
    return d;
  }, [viewOffset, zoom]);

  const columns = useMemo(() => buildColumns(viewStart, totalDays, zoom), [viewStart, totalDays, zoom]);

  const { data: projects = [] } = useQuery<any[]>({
    queryKey: ["projects-module"],
    queryFn: () => authFetch(`${API}/projects-module`).then(r => r.json()),
  });

  const { data: rawTasks = [], refetch: refetchTasks } = useQuery<any[]>({
    queryKey: ["project-tasks", selectedProject],
    queryFn: () => {
      const url = selectedProject
        ? `${API}/project-tasks?projectId=${selectedProject}`
        : `${API}/project-tasks`;
      return authFetch(url).then(r => r.json());
    },
  });

  const { data: rawDeps = [] } = useQuery<any[]>({
    queryKey: ["project-task-dependencies", selectedProject],
    queryFn: () => {
      const url = selectedProject
        ? `${API}/project-task-dependencies?projectId=${selectedProject}`
        : `${API}/project-task-dependencies`;
      return authFetch(url).then(r => r.json());
    },
    enabled: true,
  });

  const tasks: any[] = Array.isArray(rawTasks) ? rawTasks : [];
  const deps: any[] = Array.isArray(rawDeps) ? rawDeps : [];

  const wbsRoots = useMemo(() => buildWbsTree(tasks), [tasks]);
  const allExpanded = useMemo(() => {
    const set = new Set<number>(tasks.map(t => t.id));
    return set;
  }, [tasks]);

  const [manualExpanded, setManualExpanded] = useState<Set<number> | null>(null);
  const effectiveExpanded = manualExpanded ?? allExpanded;

  const flatTasks = useMemo(() => flattenTree(wbsRoots, 0, effectiveExpanded), [wbsRoots, effectiveExpanded]);

  const calcMut = useMutation({
    mutationFn: async (projectId: number) => {
      const r = await authFetch(`${API}/project-tasks/calculate-critical-path/${projectId}`, { method: "POST" });
      return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["project-tasks"] }); },
  });

  const baselineMut = useMutation({
    mutationFn: async (projectId: number) => {
      const r = await authFetch(`${API}/project-tasks/save-baseline/${projectId}`, { method: "POST" });
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-tasks"] });
      setShowBaselineInfo(true);
      setTimeout(() => setShowBaselineInfo(false), 3000);
    },
  });

  const updateTaskMut = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const r = await authFetch(`${API}/project-tasks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project-tasks"] }),
  });

  const addDepMut = useMutation({
    mutationFn: async (data: any) => {
      const r = await authFetch(`${API}/project-task-dependencies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-task-dependencies"] });
      setShowDepForm(false);
      setDepForm({ dependencyType: "FS", lagDays: 0 });
    },
  });

  const deleteDepMut = useMutation({
    mutationFn: async (id: number) => {
      await authFetch(`${API}/project-task-dependencies/${id}`, { method: "DELETE" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project-task-dependencies"] }),
  });

  const toggleExpand = useCallback((id: number) => {
    setManualExpanded(prev => {
      const base = prev ?? allExpanded;
      const next = new Set(base);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, [allExpanded]);

  const handleMouseDown = useCallback((e: React.MouseEvent, taskId: number, task: any) => {
    e.preventDefault();
    setDragging({ taskId, startX: e.clientX, origStart: task.planned_start });
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
  }, [dragging]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    const deltaX = e.clientX - dragging.startX;
    const deltaDays = Math.round(deltaX / cellW) * ZOOM_DAYS[zoom];
    if (deltaDays !== 0 && dragging.origStart) {
      const origDate = new Date(dragging.origStart);
      const newStart = addDays(origDate, deltaDays);
      const task = tasks.find(t => t.id === dragging.taskId);
      if (task) {
        const dur = task.duration || 1;
        const newEnd = addDays(newStart, dur - 1);
        updateTaskMut.mutate({
          id: dragging.taskId,
          data: { plannedStart: fmtDate(newStart), plannedEnd: fmtDate(newEnd) },
        });
      }
    }
    setDragging(null);
  }, [dragging, cellW, zoom, tasks, updateTaskMut]);

  const depArrows = useMemo(() => {
    const arrows: { x1: number; y1: number; x2: number; y2: number; type: string }[] = [];
    for (const dep of deps) {
      const predIdx = flatTasks.findIndex(t => t.id === dep.predecessor_id);
      const succIdx = flatTasks.findIndex(t => t.id === dep.successor_id);
      if (predIdx < 0 || succIdx < 0) continue;
      const predTask = flatTasks[predIdx];
      const succTask = flatTasks[succIdx];
      const predBounds = getBarBounds(predTask, viewStart, cellW, zoom);
      const succBounds = getBarBounds(succTask, viewStart, cellW, zoom);
      if (!predBounds || !succBounds) continue;
      const x1 = predBounds.startX + predBounds.width;
      const y1 = predIdx * ROW_H + ROW_H / 2;
      const x2 = succBounds.startX;
      const y2 = succIdx * ROW_H + ROW_H / 2;
      arrows.push({ x1, y1, x2, y2, type: dep.dependency_type || "FS" });
    }
    return arrows;
  }, [deps, flatTasks, viewStart, cellW, zoom]);

  const todayX = getTodayX(viewStart, cellW, zoom);
  const svgH = Math.max(flatTasks.length * ROW_H + 8, 200);

  const exportCSV = () => {
    const rows = flatTasks.map(t => [
      t.wbs_code || "", t.title, t.status, t.planned_start || "", t.planned_end || "",
      t.duration || "", t.total_float || "", t.is_critical ? "כן" : "לא"
    ].join(","));
    const csv = ["WBS,כותרת,סטטוס,התחלה,סיום,משך,float,קריטי", ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "gantt.csv";
    a.click();
  };

  return (
    <div className="p-4 space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <GanttChart className="text-blue-400" size={26} />
          <h1 className="text-xl font-bold text-foreground">גאנט ו-WBS</h1>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <select
            value={selectedProject ?? ""}
            onChange={e => setSelectedProject(e.target.value ? parseInt(e.target.value) : null)}
            className="bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground"
          >
            <option value="">כל הפרויקטים</option>
            {(projects as any[]).map((p: any) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          <div className="flex border border-border rounded-lg overflow-hidden text-xs">
            {(["day", "week", "month", "quarter"] as ZoomLevel[]).map(z => (
              <button
                key={z}
                onClick={() => setZoom(z)}
                className={`px-3 py-2 ${zoom === z ? "bg-blue-600 text-foreground" : "bg-muted text-gray-300 hover:bg-muted"}`}
              >
                {z === "day" ? "יום" : z === "week" ? "שבוע" : z === "month" ? "חודש" : "רבעון"}
              </button>
            ))}
          </div>

          <button onClick={() => setViewOffset(v => v - 4)} className="p-2 bg-muted border border-border rounded-lg hover:bg-muted text-foreground">
            <ChevronRight size={16} />
          </button>
          <button onClick={() => setViewOffset(0)} className="px-3 py-2 bg-muted border border-border rounded-lg text-xs text-gray-300 hover:bg-muted">
            היום
          </button>
          <button onClick={() => setViewOffset(v => v + 4)} className="p-2 bg-muted border border-border rounded-lg hover:bg-muted text-foreground">
            <ChevronLeft size={16} />
          </button>

          {selectedProject && (
            <>
              <button
                onClick={() => calcMut.mutate(selectedProject)}
                disabled={calcMut.isPending}
                className="flex items-center gap-1.5 px-3 py-2 bg-purple-600/20 border border-purple-500/30 text-purple-400 rounded-lg text-xs hover:bg-purple-600/30"
              >
                <RefreshCw size={14} className={calcMut.isPending ? "animate-spin" : ""} />
                נתיב קריטי
              </button>
              <button
                onClick={() => baselineMut.mutate(selectedProject)}
                disabled={baselineMut.isPending}
                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 rounded-lg text-xs hover:bg-emerald-600/30"
              >
                <Save size={14} />
                שמור Baseline
              </button>
              <button
                onClick={() => setShowDepForm(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-600/20 border border-blue-500/30 text-blue-400 rounded-lg text-xs hover:bg-blue-600/30"
              >
                <Link size={14} />
                הוסף תלות
              </button>
            </>
          )}
          <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-2 bg-muted rounded-lg text-xs text-gray-300 hover:bg-muted">
            <Download size={14} />
            ייצוא
          </button>
        </div>
      </div>

      {showBaselineInfo && (
        <div className="bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-lg px-4 py-2 text-sm">
          Baseline נשמר בהצלחה — תוכל לראות את הקווים האפורים על הגאנט
        </div>
      )}

      <div className="bg-background border border-border rounded-xl overflow-hidden">
        <div className="flex">
          <div className="flex-shrink-0" style={{ width: LABEL_W }}>
            <div
              className="flex items-center bg-muted border-b border-border px-3 text-xs font-semibold text-gray-400"
              style={{ height: HEADER_H }}
            >
              <span className="w-10">WBS</span>
              <span>שם משימה</span>
            </div>
            {flatTasks.map((task, idx) => (
              <div
                key={task.id}
                className={`flex items-center border-b border-border/60 px-2 text-xs gap-1 ${
                  task.is_critical ? "bg-red-950/20" : ""
                }`}
                style={{ height: ROW_H, paddingRight: `${task.depth * 16 + 8}px` }}
              >
                {task.children.length > 0 ? (
                  <button
                    onClick={() => toggleExpand(task.id)}
                    className="text-gray-400 hover:text-foreground flex-shrink-0"
                  >
                    {effectiveExpanded.has(task.id) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </button>
                ) : (
                  <span className="w-3 flex-shrink-0" />
                )}
                <span className="text-gray-500 w-8 flex-shrink-0 text-[10px]">{task.wbs_code || "-"}</span>
                {task.is_milestone ? (
                  <Diamond size={10} className="text-amber-400 flex-shrink-0" />
                ) : null}
                <span
                  className={`truncate ${task.is_critical ? "text-red-400 font-medium" : "text-foreground"}`}
                  title={task.title}
                >
                  {task.title}
                </span>
                {task.is_critical && (
                  <span className="ml-auto text-red-500/60 text-[9px] font-bold flex-shrink-0">CP</span>
                )}
              </div>
            ))}
          </div>

          <div className="flex-1 overflow-x-auto" style={{ maxWidth: `calc(100vw - ${LABEL_W}px - 80px)` }}>
            <svg
              ref={svgRef}
              width={svgW}
              height={svgH + HEADER_H}
              style={{ display: "block", minWidth: svgW }}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={() => setDragging(null)}
            >
              <g>
                {columns.map((col, i) => (
                  <g key={i}>
                    <rect
                      x={i * cellW} y={0} width={cellW} height={HEADER_H}
                      fill={i % 2 === 0 ? "#1f2937" : "#111827"}
                      stroke="#374151" strokeWidth={0.5}
                    />
                    <text
                      x={i * cellW + cellW / 2} y={HEADER_H / 2 + 4}
                      textAnchor="middle" fontSize={10} fill="#9ca3af"
                    >
                      {col.label}
                    </text>
                  </g>
                ))}
              </g>

              <g transform={`translate(0, ${HEADER_H})`}>
                {flatTasks.map((_, idx) => (
                  <rect
                    key={idx}
                    x={0} y={idx * ROW_H} width={svgW} height={ROW_H}
                    fill={idx % 2 === 0 ? "#111827" : "#0f172a"}
                    opacity={0.5}
                  />
                ))}

                {todayX >= 0 && todayX <= svgW && (
                  <line
                    x1={todayX} y1={0} x2={todayX} y2={svgH}
                    stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="4,3" opacity={0.7}
                  />
                )}

                {flatTasks.map((task, idx) => {
                  const baseline = getBaselineBounds(task, viewStart, cellW, zoom);
                  const bounds = getBarBounds(task, viewStart, cellW, zoom);
                  const y = idx * ROW_H;
                  const isMilestone = task.is_milestone;

                  return (
                    <g key={task.id}>
                      {baseline && (
                        <rect
                          x={baseline.startX}
                          y={y + ROW_H * 0.65}
                          width={baseline.width}
                          height={ROW_H * 0.15}
                          rx={2}
                          fill="#6b7280"
                          opacity={0.5}
                        />
                      )}

                      {bounds && !isMilestone && (
                        <g>
                          <rect
                            x={bounds.startX}
                            y={y + ROW_H * 0.2}
                            width={bounds.width}
                            height={ROW_H * 0.6}
                            rx={4}
                            fill={
                              task.is_critical
                                ? "#ef4444"
                                : task.status === "done"
                                ? "#10b981"
                                : task.status === "in-progress"
                                ? "#3b82f6"
                                : task.depth === 0
                                ? "#6366f1"
                                : "#4b5563"
                            }
                            opacity={0.85}
                            cursor="grab"
                            onMouseDown={e => handleMouseDown(e, task.id, task)}
                          />
                          {bounds.width > 30 && (
                            <text
                              x={bounds.startX + 6}
                              y={y + ROW_H * 0.2 + ROW_H * 0.4}
                              fontSize={9}
                              fill="white"
                              dominantBaseline="middle"
                              style={{ pointerEvents: "none", userSelect: "none" }}
                            >
                              {task.title.slice(0, Math.floor(bounds.width / 7))}
                            </text>
                          )}
                        </g>
                      )}

                      {isMilestone && bounds && (
                        <g transform={`translate(${bounds.startX + bounds.width / 2}, ${y + ROW_H / 2})`}>
                          <polygon
                            points="0,-10 10,0 0,10 -10,0"
                            fill={task.is_critical ? "#ef4444" : "#f59e0b"}
                            stroke="#fff"
                            strokeWidth={0.5}
                            opacity={0.9}
                            cursor="grab"
                            onMouseDown={e => handleMouseDown(e, task.id, task)}
                          />
                        </g>
                      )}
                    </g>
                  );
                })}

                {depArrows.map((arrow, i) => {
                  const mx = (arrow.x1 + arrow.x2) / 2;
                  const path = `M ${arrow.x1} ${arrow.y1} C ${mx} ${arrow.y1} ${mx} ${arrow.y2} ${arrow.x2} ${arrow.y2}`;
                  return (
                    <g key={i}>
                      <path
                        d={path}
                        fill="none"
                        stroke={arrow.type === "FS" ? "#60a5fa" : arrow.type === "SS" ? "#34d399" : "#f59e0b"}
                        strokeWidth={1.2}
                        opacity={0.6}
                        markerEnd="url(#arrowhead)"
                      />
                    </g>
                  );
                })}
              </g>

              <defs>
                <marker id="arrowhead" markerWidth={6} markerHeight={6} refX={3} refY={3} orient="auto">
                  <polygon points="0 0, 6 3, 0 6" fill="#60a5fa" opacity={0.7} />
                </marker>
              </defs>
            </svg>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-gray-400">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-3 rounded bg-red-500 opacity-80" />
          <span>נתיב קריטי</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-3 rounded bg-blue-500 opacity-80" />
          <span>בביצוע</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-3 rounded bg-emerald-500 opacity-80" />
          <span>הושלם</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-3 rounded bg-indigo-500 opacity-80" />
          <span>שלב ראשי</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-1.5 rounded bg-gray-500 opacity-60" />
          <span>Baseline</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Diamond size={12} className="text-amber-400" />
          <span>אבן דרך</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-0 border-t-2 border-dashed border-blue-400 opacity-70" />
          <span>היום</span>
        </div>
      </div>

      {deps.length > 0 && (
        <div className="bg-background border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <GitBranch size={14} className="text-blue-400" />
            <h3 className="text-sm font-medium text-foreground">תלויות ({deps.length})</h3>
          </div>
          <div className="divide-y divide-gray-800">
            {deps.map((dep: any) => {
              const pred = tasks.find(t => t.id === dep.predecessor_id);
              const succ = tasks.find(t => t.id === dep.successor_id);
              return (
                <div key={dep.id} className="flex items-center justify-between px-4 py-2 text-xs">
                  <span className="text-gray-300">{pred?.title || `#${dep.predecessor_id}`}</span>
                  <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-[10px]">
                    {dep.dependency_type}{dep.lag_days ? ` +${dep.lag_days}d` : ""}
                  </span>
                  <span className="text-gray-300">{succ?.title || `#${dep.successor_id}`}</span>
                  <button
                    onClick={() => deleteDepMut.mutate(dep.id)}
                    className="p-1 hover:bg-muted rounded text-red-400"
                  >
                    <X size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showDepForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowDepForm(false)}>
          <div className="bg-background border border-border rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Link size={18} className="text-blue-400" />
                הוספת תלות
              </h2>
              <button onClick={() => setShowDepForm(false)} className="text-gray-400 hover:text-foreground">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">קודמת (Predecessor)</label>
                <select
                  value={depForm.predecessorId || ""}
                  onChange={e => setDepForm({ ...depForm, predecessorId: parseInt(e.target.value) })}
                  className="w-full bg-muted border border-border rounded-lg p-2.5 text-sm text-foreground"
                >
                  <option value="">בחר משימה</option>
                  {tasks.map(t => <option key={t.id} value={t.id}>{t.wbs_code ? `${t.wbs_code} — ` : ""}{t.title}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">עוקבת (Successor)</label>
                <select
                  value={depForm.successorId || ""}
                  onChange={e => setDepForm({ ...depForm, successorId: parseInt(e.target.value) })}
                  className="w-full bg-muted border border-border rounded-lg p-2.5 text-sm text-foreground"
                >
                  <option value="">בחר משימה</option>
                  {tasks.map(t => <option key={t.id} value={t.id}>{t.wbs_code ? `${t.wbs_code} — ` : ""}{t.title}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">סוג תלות</label>
                  <select
                    value={depForm.dependencyType}
                    onChange={e => setDepForm({ ...depForm, dependencyType: e.target.value })}
                    className="w-full bg-muted border border-border rounded-lg p-2.5 text-sm text-foreground"
                  >
                    <option value="FS">Finish-to-Start (FS)</option>
                    <option value="SS">Start-to-Start (SS)</option>
                    <option value="FF">Finish-to-Finish (FF)</option>
                    <option value="SF">Start-to-Finish (SF)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Lag (ימים)</label>
                  <input
                    type="number"
                    value={depForm.lagDays}
                    onChange={e => setDepForm({ ...depForm, lagDays: parseInt(e.target.value) || 0 })}
                    className="w-full bg-muted border border-border rounded-lg p-2.5 text-sm text-foreground"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => setShowDepForm(false)} className="px-4 py-2 bg-muted text-foreground rounded-lg text-sm">ביטול</button>
              <button
                onClick={() => addDepMut.mutate({
                  projectId: selectedProject,
                  predecessorId: depForm.predecessorId,
                  successorId: depForm.successorId,
                  dependencyType: depForm.dependencyType,
                  lagDays: depForm.lagDays,
                })}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-foreground rounded-lg text-sm"
              >
                שמור תלות
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
