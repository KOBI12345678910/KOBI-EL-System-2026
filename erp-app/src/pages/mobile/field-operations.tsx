import { useState, useEffect, useCallback, useRef } from "react";

/* ─── Types ──────────────────────────────────────────────────────────────────── */
interface FieldTask {
  id: number; task_type: string; project_id: number | null; project_name: string;
  customer_name: string; customer_phone: string; address: string; city: string;
  assigned_to: number; assigned_name: string; scheduled_date: string; scheduled_time: string;
  estimated_duration_hours: number; actual_start: string | null; actual_end: string | null;
  status: string; priority: string; notes: string; checklist: ChecklistItem[];
  created_at: string;
}
interface ChecklistItem { label: string; done: boolean; toggled_at?: string }
interface FieldDashboard {
  date: string;
  stats: { total_tasks_today: number; completed_today: number; photos_today: number; open_issues: number; active_workers: number };
  active_workers: { assigned_to: number; assigned_name: string; status: string }[];
  worker_locations: { user_id: number; latitude: number; longitude: number; timestamp: string }[];
  tasks: any[];
}

const API = "/api";

const TASK_TYPE_MAP: Record<string, { label: string; icon: string; color: string }> = {
  measurement: { label: "מדידה", icon: "📐", color: "blue" },
  installation: { label: "התקנה", icon: "🔧", color: "green" },
  service: { label: "שירות", icon: "🛠️", color: "orange" },
  inspection: { label: "בדיקה", icon: "🔍", color: "purple" },
};

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  assigned: { label: "מוקצה", color: "text-gray-700", bg: "bg-gray-100" },
  en_route: { label: "בדרך", color: "text-blue-700", bg: "bg-blue-100" },
  arrived: { label: "הגיע לאתר", color: "text-indigo-700", bg: "bg-indigo-100" },
  in_progress: { label: "בביצוע", color: "text-yellow-700", bg: "bg-yellow-100" },
  completed: { label: "הושלם", color: "text-green-700", bg: "bg-green-100" },
  issue_reported: { label: "דווח בעיה", color: "text-red-700", bg: "bg-red-100" },
};

/* ─── Component ──────────────────────────────────────────────────────────────── */
export default function FieldOperationsPage() {
  const [workerId, setWorkerId] = useState<string>(localStorage.getItem("field_worker_id") || "");
  const [workerName, setWorkerName] = useState<string>(localStorage.getItem("field_worker_name") || "");
  const [isLoggedIn, setIsLoggedIn] = useState(!!workerId);
  const [view, setView] = useState<"tasks" | "detail" | "dashboard">("tasks");
  const [tasks, setTasks] = useState<FieldTask[]>([]);
  const [selectedTask, setSelectedTask] = useState<FieldTask | null>(null);
  const [dashboardData, setDashboardData] = useState<FieldDashboard | null>(null);
  const [issueForm, setIssueForm] = useState({ issue_type: "", description: "", severity: "medium" });
  const [photoForm, setPhotoForm] = useState({ photo_type: "during", url: "", caption: "" });
  const [signatureForm, setSignatureForm] = useState({ signer_type: "customer", signer_name: "" });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [showSignaturePad, setShowSignaturePad] = useState(false);

  const headers = { "Content-Type": "application/json", "X-Worker-Id": workerId, "X-Worker-Name": workerName };

  const fieldFetch = useCallback(async (url: string, opts?: RequestInit) => {
    return fetch(url, { ...opts, headers: { ...headers, ...(opts?.headers || {}) } });
  }, [workerId, workerName]);

  const login = () => {
    if (!workerId) return;
    localStorage.setItem("field_worker_id", workerId);
    localStorage.setItem("field_worker_name", workerName);
    setIsLoggedIn(true);
  };

  const loadTasks = useCallback(async () => {
    const res = await fieldFetch(`${API}/field/my-tasks`);
    if (res.ok) setTasks(await res.json());
  }, [fieldFetch]);

  const loadDashboard = useCallback(async () => {
    const res = await fetch(`${API}/field/dashboard`);
    if (res.ok) setDashboardData(await res.json());
  }, []);

  useEffect(() => { if (isLoggedIn) loadTasks(); }, [isLoggedIn, loadTasks]);

  // GPS tracking
  useEffect(() => {
    if (!isLoggedIn || !navigator.geolocation) return;
    const interval = setInterval(() => {
      navigator.geolocation.getCurrentPosition(pos => {
        fieldFetch(`${API}/field/locations/update`, {
          method: "POST",
          body: JSON.stringify({
            latitude: pos.coords.latitude, longitude: pos.coords.longitude,
            accuracy_m: pos.coords.accuracy, task_id: selectedTask?.id || null,
          }),
        }).catch(() => {});
      });
    }, 60000); // Every 60 seconds
    return () => clearInterval(interval);
  }, [isLoggedIn, selectedTask, fieldFetch]);

  const updateTaskStatus = async (taskId: number, action: string) => {
    await fieldFetch(`${API}/field/tasks/${taskId}/${action}`, { method: "POST" });
    loadTasks();
    if (selectedTask?.id === taskId) {
      const res = await fieldFetch(`${API}/field/my-tasks`);
      if (res.ok) {
        const all = await res.json();
        setSelectedTask(all.find((t: FieldTask) => t.id === taskId) || null);
      }
    }
  };

  const toggleChecklistItem = async (taskId: number, idx: number) => {
    await fieldFetch(`${API}/field/tasks/${taskId}/checklist-item/${idx}/toggle`, { method: "POST" });
    // Refresh
    const res = await fieldFetch(`${API}/field/tasks/${taskId}/checklist`);
    if (res.ok && selectedTask) {
      const checklist = await res.json();
      setSelectedTask({ ...selectedTask, checklist });
    }
  };

  const reportIssue = async () => {
    if (!selectedTask || !issueForm.description) return;
    await fieldFetch(`${API}/field/tasks/${selectedTask.id}/report-issue`, {
      method: "POST", body: JSON.stringify(issueForm),
    });
    setIssueForm({ issue_type: "", description: "", severity: "medium" });
    loadTasks();
  };

  const uploadPhoto = async () => {
    if (!selectedTask || !photoForm.url) return;
    await fieldFetch(`${API}/field/photos/upload`, {
      method: "POST",
      body: JSON.stringify({ task_id: selectedTask.id, ...photoForm }),
    });
    setPhotoForm({ photo_type: "during", url: "", caption: "" });
  };

  // Signature pad
  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.stroke();
  };

  const stopDrawing = () => setIsDrawing(false);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const submitSignature = async () => {
    if (!selectedTask || !canvasRef.current) return;
    const signatureData = canvasRef.current.toDataURL("image/png");
    await fieldFetch(`${API}/field/signatures/capture`, {
      method: "POST",
      body: JSON.stringify({ task_id: selectedTask.id, signature_data: signatureData, ...signatureForm }),
    });
    setShowSignaturePad(false); clearCanvas();
  };

  /* ─── Login Screen ───────────────────────────────────────────────────────── */
  if (!isLoggedIn) {
    return (
      <div dir="rtl" className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="text-5xl mb-2">👷</div>
            <h1 className="text-2xl font-bold text-gray-800">אפליקציית שטח</h1>
            <p className="text-gray-500 text-sm">TechnoKoluzi ERP</p>
          </div>
          <input className="w-full border rounded-lg p-4 mb-3 text-right text-lg" placeholder="מספר עובד" type="number"
            value={workerId} onChange={e => setWorkerId(e.target.value)} />
          <input className="w-full border rounded-lg p-4 mb-4 text-right text-lg" placeholder="שם"
            value={workerName} onChange={e => setWorkerName(e.target.value)} />
          <button onClick={login}
            className="w-full bg-amber-600 text-white rounded-lg p-4 text-lg font-bold hover:bg-amber-700">
            כניסה
          </button>
        </div>
      </div>
    );
  }

  /* ─── Main App ───────────────────────────────────────────────────────────── */
  return (
    <div dir="rtl" className="min-h-screen bg-gray-100">
      {/* Mobile Header */}
      <header className="bg-amber-600 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <span className="text-xl">👷</span>
          <span className="font-bold">{workerName || `עובד #${workerId}`}</span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setView("tasks"); setSelectedTask(null); }}
            className={`px-3 py-1 rounded-full text-sm ${view === "tasks" ? "bg-white text-amber-700" : "bg-amber-700"}`}>
            משימות
          </button>
          <button onClick={() => { setView("dashboard"); loadDashboard(); }}
            className={`px-3 py-1 rounded-full text-sm ${view === "dashboard" ? "bg-white text-amber-700" : "bg-amber-700"}`}>
            מנהל
          </button>
        </div>
      </header>

      <main className="p-3 pb-20">
        {/* Task List */}
        {view === "tasks" && !selectedTask && (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-bold text-lg">המשימות שלי היום</h2>
              <button onClick={loadTasks} className="text-sm bg-white px-3 py-1.5 rounded-lg shadow-sm">רענן</button>
            </div>
            {tasks.length === 0 ? (
              <div className="bg-white rounded-xl p-8 text-center shadow-sm">
                <div className="text-5xl mb-3">🎉</div>
                <p className="text-gray-500">אין משימות להיום</p>
              </div>
            ) : (
              tasks.map(t => {
                const tt = TASK_TYPE_MAP[t.task_type] || { label: t.task_type, icon: "📋", color: "gray" };
                const st = STATUS_MAP[t.status] || { label: t.status, color: "text-gray-600", bg: "bg-gray-100" };
                return (
                  <div key={t.id} onClick={() => { setSelectedTask(t); setView("detail"); }}
                    className={`bg-white rounded-xl p-4 shadow-sm border-r-4 ${
                      t.priority === "urgent" ? "border-r-red-500" : "border-r-amber-400"
                    } active:bg-gray-50`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{tt.icon}</span>
                        <div>
                          <span className="font-bold">{tt.label}</span>
                          {t.priority === "urgent" && (
                            <span className="mr-2 bg-red-100 text-red-600 text-xs px-1.5 py-0.5 rounded-full">דחוף</span>
                          )}
                        </div>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${st.bg} ${st.color}`}>{st.label}</span>
                    </div>
                    <p className="font-medium text-gray-800">{t.project_name || t.customer_name}</p>
                    <p className="text-sm text-gray-500">{t.address}{t.city ? `, ${t.city}` : ""}</p>
                    {t.scheduled_time && (
                      <p className="text-sm text-amber-600 font-medium mt-1">{t.scheduled_time.slice(0, 5)}</p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Task Detail */}
        {view === "detail" && selectedTask && (
          <div className="space-y-4">
            <button onClick={() => { setView("tasks"); setSelectedTask(null); }}
              className="text-sm text-gray-500 flex items-center gap-1">&rarr; חזרה למשימות</button>

            {/* Task Info Card */}
            <div className="bg-white rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-3xl">{TASK_TYPE_MAP[selectedTask.task_type]?.icon || "📋"}</span>
                <div>
                  <h2 className="font-bold text-lg">{TASK_TYPE_MAP[selectedTask.task_type]?.label || selectedTask.task_type}</h2>
                  <p className="text-gray-600">{selectedTask.project_name}</p>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">👤</span>
                  <span>{selectedTask.customer_name}</span>
                </div>
                {selectedTask.customer_phone && (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400">📱</span>
                    <a href={`tel:${selectedTask.customer_phone}`} className="text-blue-600 underline">
                      {selectedTask.customer_phone}
                    </a>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">📍</span>
                  <span>{selectedTask.address}{selectedTask.city ? `, ${selectedTask.city}` : ""}</span>
                </div>
                {selectedTask.notes && (
                  <div className="bg-yellow-50 p-3 rounded-lg mt-2">
                    <p className="text-xs text-yellow-600 font-medium mb-1">הערות:</p>
                    <p className="text-sm">{selectedTask.notes}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Big Action Buttons */}
            <div className="grid grid-cols-1 gap-3">
              {selectedTask.status === "assigned" && (
                <button onClick={() => updateTaskStatus(selectedTask.id, "start")}
                  className="bg-blue-600 text-white rounded-xl p-5 text-xl font-bold shadow-lg active:bg-blue-700">
                  🚗 יציאה לאתר
                </button>
              )}
              {selectedTask.status === "en_route" && (
                <button onClick={() => updateTaskStatus(selectedTask.id, "arrive")}
                  className="bg-indigo-600 text-white rounded-xl p-5 text-xl font-bold shadow-lg active:bg-indigo-700">
                  📍 הגעתי לאתר
                </button>
              )}
              {(selectedTask.status === "arrived" || selectedTask.status === "in_progress") && (
                <button onClick={() => updateTaskStatus(selectedTask.id, "complete")}
                  className="bg-green-600 text-white rounded-xl p-5 text-xl font-bold shadow-lg active:bg-green-700">
                  ✅ סיום משימה
                </button>
              )}
              {selectedTask.status !== "completed" && selectedTask.status !== "issue_reported" && (
                <button onClick={() => {}}
                  className="bg-red-500 text-white rounded-xl p-4 text-lg font-bold shadow-lg active:bg-red-600"
                  onClickCapture={() => {
                    const el = document.getElementById("issue-section");
                    if (el) el.scrollIntoView({ behavior: "smooth" });
                  }}>
                  ⚠️ דווח בעיה
                </button>
              )}
            </div>

            {/* Checklist */}
            {selectedTask.checklist && selectedTask.checklist.length > 0 && (
              <div className="bg-white rounded-xl p-5 shadow-sm">
                <h3 className="font-bold mb-3">צ'קליסט</h3>
                <div className="space-y-2">
                  {selectedTask.checklist.map((item, idx) => (
                    <button key={idx} onClick={() => toggleChecklistItem(selectedTask.id, idx)}
                      className={`w-full text-right flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                        item.done ? "bg-green-50 border-green-200" : "bg-white border-gray-200"
                      }`}>
                      <div className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center ${
                        item.done ? "bg-green-500 border-green-500 text-white" : "border-gray-300"
                      }`}>
                        {item.done && "✓"}
                      </div>
                      <span className={item.done ? "line-through text-gray-400" : ""}>{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Photo Upload */}
            <div className="bg-white rounded-xl p-5 shadow-sm">
              <h3 className="font-bold mb-3">📷 העלאת תמונה</h3>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {["before", "during", "after", "issue", "measurement"].map(t => (
                  <button key={t} onClick={() => setPhotoForm({ ...photoForm, photo_type: t })}
                    className={`p-2 rounded-lg text-xs font-medium border ${
                      photoForm.photo_type === t ? "bg-amber-100 border-amber-400 text-amber-700" : "bg-gray-50"
                    }`}>
                    {{ before: "לפני", during: "במהלך", after: "אחרי", issue: "בעיה", measurement: "מדידה" }[t]}
                  </button>
                ))}
              </div>
              <input className="w-full border rounded-lg p-3 text-right mb-2" placeholder="קישור לתמונה (URL)"
                value={photoForm.url} onChange={e => setPhotoForm({ ...photoForm, url: e.target.value })} />
              <input className="w-full border rounded-lg p-3 text-right mb-2" placeholder="כיתוב"
                value={photoForm.caption} onChange={e => setPhotoForm({ ...photoForm, caption: e.target.value })} />
              <button onClick={uploadPhoto}
                className="w-full bg-amber-500 text-white rounded-lg p-3 font-medium active:bg-amber-600">
                העלה תמונה
              </button>
            </div>

            {/* Signature Pad */}
            <div className="bg-white rounded-xl p-5 shadow-sm">
              <h3 className="font-bold mb-3">✍️ חתימה דיגיטלית</h3>
              {!showSignaturePad ? (
                <button onClick={() => setShowSignaturePad(true)}
                  className="w-full bg-purple-500 text-white rounded-lg p-4 text-lg font-bold active:bg-purple-600">
                  פתח לוח חתימה
                </button>
              ) : (
                <div className="space-y-3">
                  <select className="w-full border rounded-lg p-3 text-right bg-white"
                    value={signatureForm.signer_type} onChange={e => setSignatureForm({ ...signatureForm, signer_type: e.target.value })}>
                    <option value="customer">לקוח</option>
                    <option value="installer">מתקין</option>
                    <option value="engineer">מהנדס</option>
                    <option value="manager">מנהל</option>
                  </select>
                  <input className="w-full border rounded-lg p-3 text-right" placeholder="שם החותם"
                    value={signatureForm.signer_name} onChange={e => setSignatureForm({ ...signatureForm, signer_name: e.target.value })} />
                  <div className="border-2 border-dashed border-gray-300 rounded-lg overflow-hidden bg-white">
                    <canvas ref={canvasRef} width={350} height={200}
                      className="w-full touch-none cursor-crosshair"
                      onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing}
                      onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={stopDrawing} />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={submitSignature}
                      className="flex-1 bg-green-600 text-white rounded-lg p-3 font-medium">שמור חתימה</button>
                    <button onClick={clearCanvas}
                      className="bg-gray-200 rounded-lg p-3 px-5">נקה</button>
                    <button onClick={() => { setShowSignaturePad(false); clearCanvas(); }}
                      className="bg-gray-200 rounded-lg p-3 px-5">ביטול</button>
                  </div>
                </div>
              )}
            </div>

            {/* Issue Report */}
            <div id="issue-section" className="bg-white rounded-xl p-5 shadow-sm">
              <h3 className="font-bold mb-3">⚠️ דיווח בעיה</h3>
              <div className="space-y-3">
                <select className="w-full border rounded-lg p-3 text-right bg-white"
                  value={issueForm.issue_type} onChange={e => setIssueForm({ ...issueForm, issue_type: e.target.value })}>
                  <option value="">סוג הבעיה</option>
                  <option value="חומר פגום">חומר פגום</option>
                  <option value="מידות שגויות">מידות שגויות</option>
                  <option value="בעיית גישה">בעיית גישה</option>
                  <option value="חוסר בחומרים">חוסר בחומרים</option>
                  <option value="תקלה טכנית">תקלה טכנית</option>
                  <option value="בעיית בטיחות">בעיית בטיחות</option>
                  <option value="אחר">אחר</option>
                </select>
                <select className="w-full border rounded-lg p-3 text-right bg-white"
                  value={issueForm.severity} onChange={e => setIssueForm({ ...issueForm, severity: e.target.value })}>
                  <option value="low">חומרה נמוכה</option>
                  <option value="medium">חומרה בינונית</option>
                  <option value="high">חומרה גבוהה</option>
                  <option value="critical">קריטי</option>
                </select>
                <textarea className="w-full border rounded-lg p-3 text-right h-28 resize-none" placeholder="תאר את הבעיה..."
                  value={issueForm.description} onChange={e => setIssueForm({ ...issueForm, description: e.target.value })} />
                <button onClick={reportIssue}
                  className="w-full bg-red-500 text-white rounded-lg p-4 text-lg font-bold active:bg-red-600">
                  שלח דיווח בעיה
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Manager Dashboard */}
        {view === "dashboard" && dashboardData && (
          <div className="space-y-4">
            <h2 className="font-bold text-lg">לוח מנהל - {dashboardData.date}</h2>

            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "משימות היום", value: dashboardData.stats.total_tasks_today, icon: "📋", color: "blue" },
                { label: "הושלמו", value: dashboardData.stats.completed_today, icon: "✅", color: "green" },
                { label: "עובדים בשטח", value: dashboardData.stats.active_workers, icon: "👷", color: "amber" },
                { label: "בעיות פתוחות", value: dashboardData.stats.open_issues, icon: "⚠️", color: "red" },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-xl p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-2xl">{s.icon}</span>
                    <span className={`text-2xl font-bold text-${s.color}-600`}>{s.value}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Active Workers */}
            <div className="bg-white rounded-xl p-5 shadow-sm">
              <h3 className="font-bold mb-3">עובדים פעילים</h3>
              {dashboardData.active_workers.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-4">אין עובדים פעילים כרגע</p>
              ) : (
                <div className="space-y-2">
                  {dashboardData.active_workers.map((w, i) => {
                    const st = STATUS_MAP[w.status] || { label: w.status, color: "text-gray-600", bg: "bg-gray-100" };
                    return (
                      <div key={i} className="flex items-center justify-between border rounded-lg p-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">👷</span>
                          <span className="font-medium">{w.assigned_name}</span>
                        </div>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${st.bg} ${st.color}`}>{st.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* All Tasks */}
            <div className="bg-white rounded-xl p-5 shadow-sm">
              <h3 className="font-bold mb-3">כל המשימות היום</h3>
              <div className="space-y-2">
                {dashboardData.tasks.map((t: any) => {
                  const tt = TASK_TYPE_MAP[t.task_type] || { label: t.task_type, icon: "📋", color: "gray" };
                  const st = STATUS_MAP[t.status] || { label: t.status, color: "text-gray-600", bg: "bg-gray-100" };
                  return (
                    <div key={t.id} className={`border rounded-lg p-3 flex items-center justify-between ${
                      t.priority === "urgent" ? "border-r-4 border-r-red-500" : ""
                    }`}>
                      <div className="flex items-center gap-2">
                        <span>{tt.icon}</span>
                        <div>
                          <p className="font-medium text-sm">{t.project_name || t.customer_name}</p>
                          <p className="text-xs text-gray-500">{t.assigned_name} | {t.city}</p>
                        </div>
                      </div>
                      <div className="text-left">
                        <span className={`px-2 py-0.5 rounded-full text-xs ${st.bg} ${st.color}`}>{st.label}</span>
                        {t.scheduled_time && (
                          <p className="text-xs text-gray-400 mt-1">{t.scheduled_time?.slice(0, 5)}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
