import { useState, useEffect } from "react";
import { Users, MessageSquare, CheckSquare, Plus, Send, AtSign, Bell, Clock, Star, CheckCircle, Tag } from "lucide-react";
import { authFetch } from "@/lib/utils";
import RelatedRecords from "@/components/related-records";
import ActivityLog from "@/components/activity-log";
import AttachmentsSection from "@/components/attachments-section";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";

const API = "/api";
const token = () => localStorage.getItem("erp_token") || document.cookie.match(/token=([^;]+)/)?.[1] || "";
const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token()}` });

const TEAM = ["אני", "מנהל מכירות", "נציג שירות", "מנהל חשבון"];

const PRIORITY_MAP: Record<string, { label: string; color: string }> = {
  urgent: { label: "דחוף", color: "bg-red-500/20 text-red-400" },
  high: { label: "גבוה", color: "bg-orange-500/20 text-orange-400" },
  medium: { label: "בינוני", color: "bg-blue-500/20 text-blue-400" },
};

export default function CollaborationPage() {
  const [notes, setNotes] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [activityFeed, setActivityFeed] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("notes");
  const [newNote, setNewNote] = useState("");
  const [noteEntity, setNoteEntity] = useState("");
  const [newTask, setNewTask] = useState({ title: "", assignee: "", due: "", priority: "medium", entity: "" });
  const [showNewTask, setShowNewTask] = useState(false);
  const [detailTab, setDetailTab] = useState("details");

  const loadData = () => {
    setLoading(true);
    Promise.all([
      authFetch(`${API}/crm/collaboration/notes`, { headers: headers() }).then(r => r.json()).catch(() => ({ notes: [] })),
      authFetch(`${API}/crm/collaboration/tasks`, { headers: headers() }).then(r => r.json()).catch(() => ({ tasks: [] })),
      authFetch(`${API}/crm/activity-feed?limit=10`, { headers: headers() }).then(r => r.json()).catch(() => ({ feed: [] })),
    ]).then(([notesData, tasksData, feedData]) => {
      setNotes(notesData.notes || []);
      setTasks(tasksData.tasks || []);
      setActivityFeed(feedData.feed || []);
    }).finally(() => setLoading(false));
  };

  useEffect(loadData, []);

  const addNote = async () => {
    if (!newNote.trim()) return;
    const mentions = TEAM.filter(t => newNote.includes(`@${t.split(" ")[0]}`));
    await authFetch(`${API}/crm/collaboration/notes`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ content: newNote, entity_type: noteEntity || "כללי", mentions }),
    });
    setNewNote("");
    setNoteEntity("");
    loadData();
  };

  const addTask = async () => {
    if (!newTask.title.trim()) return;
    await authFetch(`${API}/crm/collaboration/tasks`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ title: newTask.title, assignee: newTask.assignee, due_date: newTask.due, priority: newTask.priority, entity_type: newTask.entity || "כללי" }),
    });
    setNewTask({ title: "", assignee: "", due: "", priority: "medium", entity: "" });
    setShowNewTask(false);
    loadData();
  };

  const toggleTask = async (id: number) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, is_done: !t.is_done } : t));
    await authFetch(`${API}/crm/collaboration/tasks/${id}/toggle`, { method: "PATCH", headers: headers() });
  };

  const pendingTasks = tasks.filter(t => !t.is_done).length;
  const myMentions = notes.filter((n: any) => {
    const mentions = typeof n.mentions === "string" ? JSON.parse(n.mentions || "[]") : (n.mentions || []);
    return mentions.length > 0;
  });

  const formatTime = (ts: string) => {
    if (!ts) return "";
    const d = new Date(ts);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `לפני ${mins} דקות`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `לפני ${hrs} שעות`;
    return d.toLocaleDateString("he-IL");
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold flex items-center gap-2"><Users className="w-6 h-6 text-cyan-400" />Collaboration</h1>
          <p className="text-sm text-muted-foreground">שיתוף פעולה צוותי — הערות, אזכורים, משימות ולוח פעילות</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card border rounded-xl p-4 text-center">
          <MessageSquare className="w-6 h-6 mx-auto mb-1 text-blue-400" />
          <div className="text-lg sm:text-2xl font-bold">{notes.length}</div>
          <div className="text-xs text-muted-foreground">הערות</div>
        </div>
        <div className="bg-card border rounded-xl p-4 text-center">
          <CheckSquare className="w-6 h-6 mx-auto mb-1 text-green-400" />
          <div className="text-lg sm:text-2xl font-bold">{pendingTasks}</div>
          <div className="text-xs text-muted-foreground">משימות פתוחות</div>
        </div>
        <div className="bg-card border rounded-xl p-4 text-center">
          <AtSign className="w-6 h-6 mx-auto mb-1 text-purple-400" />
          <div className="text-lg sm:text-2xl font-bold">{myMentions.length}</div>
          <div className="text-xs text-muted-foreground">אזכורים</div>
        </div>
      </div>

      <div className="flex gap-2 border-b">
        {[
          { id: "notes", label: "הערות", icon: MessageSquare },
          { id: "tasks", label: "משימות", icon: CheckSquare },
          { id: "activity", label: "לוח פעילות", icon: Clock },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-4 py-2 text-sm font-medium border-b-2 flex items-center gap-1 transition-colors ${activeTab === tab.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            <tab.icon className="w-4 h-4" />{tab.label}
          </button>
        ))}
      </div>

      {activeTab === "notes" && (
        <div className="space-y-4">
          <div className="bg-card border rounded-xl p-4 space-y-3">
            <div className="flex gap-2">
              <input className="input input-bordered flex-1 h-9 text-sm" placeholder="ישות (ליד/עסקה/לקוח)" value={noteEntity} onChange={e => setNoteEntity(e.target.value)} />
            </div>
            <textarea
              className="textarea textarea-bordered w-full text-sm"
              rows={3}
              placeholder="כתוב הערה... השתמש ב-@שם לאזכור עמית"
              value={newNote}
              onChange={e => setNewNote(e.target.value)}
            />
            <div className="flex justify-between items-center">
              <div className="flex gap-1">
                {TEAM.map(t => (
                  <button key={t} onClick={() => setNewNote(n => n + `@${t.split(" ")[0]} `)} className="text-xs bg-muted/50 hover:bg-muted px-2 py-1 rounded border">@{t.split(" ")[0]}</button>
                ))}
              </div>
              <button onClick={addNote} disabled={!newNote.trim()} className="btn btn-primary btn-sm flex items-center gap-1"><Send className="w-4 h-4" />פרסם</button>
            </div>
          </div>

          {loading ? (
            <div className="text-center text-muted-foreground text-sm py-8">טוען הערות...</div>
          ) : notes.length === 0 ? (
            <div className="border rounded-xl p-10 bg-card text-center text-muted-foreground">
              <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">אין הערות עדיין</p>
              <p className="text-xs mt-1">היה הראשון לפרסם הערה לצוות</p>
            </div>
          ) : (
            notes.map((note: any) => {
              const mentions = typeof note.mentions === "string" ? JSON.parse(note.mentions || "[]") : (note.mentions || []);
              return (
                <div key={note.id} className={`border rounded-xl p-4 bg-card ${note.is_pinned ? "border-amber-500/30" : ""}`}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">{(note.author || "?")[0]}</div>
                      <div>
                        <div className="text-sm font-medium">{note.author || "משתמש"}</div>
                        <div className="text-xs text-muted-foreground">{note.entity_type || "כללי"} • {formatTime(note.created_at)}</div>
                      </div>
                    </div>
                    {note.is_pinned && <Star className="w-4 h-4 text-amber-400 fill-amber-400" />}
                  </div>
                  <p className="text-sm leading-relaxed">
                    {(note.content || "").split(" ").map((word: string, i: number) => (
                      word.startsWith("@") ? <span key={i} className="text-primary font-medium">{word} </span> : `${word} `
                    ))}
                  </p>
                  {mentions.length > 0 && (
                    <div className="flex gap-1 mt-2">
                      {mentions.map((m: string) => <span key={m} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">@{m}</span>)}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {activeTab === "tasks" && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <div className="text-sm text-muted-foreground">{pendingTasks} משימות פתוחות</div>
            <button onClick={() => setShowNewTask(!showNewTask)} className="btn btn-primary btn-sm flex items-center gap-1"><Plus className="w-4 h-4" />משימה חדשה</button>
          </div>

          {showNewTask && (
            <div className="border rounded-xl p-4 bg-card space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="col-span-2"><input className="input input-bordered w-full h-9 text-sm" placeholder="כותרת משימה *" value={newTask.title} onChange={e => setNewTask(t => ({ ...t, title: e.target.value }))} /></div>
                <div>
                  <select className="select select-bordered w-full select-sm" value={newTask.assignee} onChange={e => setNewTask(t => ({ ...t, assignee: e.target.value }))}>
                    <option value="">הקצה לעמית</option>
                    {TEAM.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div><input type="date" className="input input-bordered w-full h-9 text-sm" value={newTask.due} onChange={e => setNewTask(t => ({ ...t, due: e.target.value }))} /></div>
                <div>
                  <select className="select select-bordered w-full select-sm" value={newTask.priority} onChange={e => setNewTask(t => ({ ...t, priority: e.target.value }))}>
                    {Object.entries(PRIORITY_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div><input className="input input-bordered w-full h-9 text-sm" placeholder="ישות קשורה" value={newTask.entity} onChange={e => setNewTask(t => ({ ...t, entity: e.target.value }))} /></div>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowNewTask(false)} className="btn btn-outline btn-sm">ביטול</button>
                <button onClick={addTask} className="btn btn-primary btn-sm">הוסף</button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="text-center text-muted-foreground text-sm py-8">טוען משימות...</div>
          ) : tasks.length === 0 ? (
            <div className="border rounded-xl p-10 bg-card text-center text-muted-foreground">
              <CheckSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">אין משימות עדיין</p>
              <p className="text-xs mt-1">צור משימה חדשה לצוות</p>
            </div>
          ) : (
            tasks.sort((a, b) => (a.is_done ? 1 : 0) - (b.is_done ? 1 : 0)).map(task => (
              <div key={task.id} className={`flex items-center gap-3 p-4 border rounded-xl bg-card ${task.is_done ? "opacity-60" : ""}`}>
                <button onClick={() => toggleTask(task.id)} className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${task.is_done ? "bg-green-500 border-green-500" : "border-muted-foreground hover:border-primary"}`}>
                  {task.is_done && <CheckCircle className="w-4 h-4 text-foreground" />}
                </button>
                <div className="flex-1">
                  <div className={`text-sm font-medium ${task.is_done ? "line-through text-muted-foreground" : ""}`}>{task.title}</div>
                  <div className="text-xs text-muted-foreground">{task.entity_type || "כללי"} • {task.assignee || "לא הוקצה"} • {task.due_date || ""}</div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded ${PRIORITY_MAP[task.priority]?.color || "bg-muted text-muted-foreground"}`}>{PRIORITY_MAP[task.priority]?.label || task.priority}</span>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === "activity" && (
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">לוח פעילות צוותי — כל הפעולות האחרונות במערכת</div>
          <div className="flex border-b border-border/50 mb-2">
            {[{key:"details",label:"פעילות"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
              <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
            ))}
          </div>
          {detailTab === "related" && (
            <div className="bg-card border rounded-xl p-4"><RelatedRecords tabs={[{key:"tasks",label:"משימות",endpoint:`${API}/crm/collaboration/tasks`,columns:[{key:"title",label:"כותרת"},{key:"assignee",label:"מוקצה"},{key:"status",label:"סטטוס"}]},{key:"comments",label:"הערות",endpoint:`${API}/crm/collaboration/notes`,columns:[{key:"text",label:"תוכן"},{key:"author",label:"כותב"},{key:"date",label:"תאריך"}]}]} /></div>
          )}
          {detailTab === "docs" && (
            <div className="bg-card border rounded-xl p-4"><AttachmentsSection entityType="collaboration" entityId={0} /></div>
          )}
          {detailTab === "history" && (
            <div className="bg-card border rounded-xl p-4"><ActivityLog entityType="collaboration" /></div>
          )}
          {detailTab === "details" && (
          <div>
          {loading ? (
            <div className="text-center text-muted-foreground text-sm py-8">טוען פעילות...</div>
          ) : activityFeed.length === 0 ? (
            <div className="border rounded-xl p-10 bg-card text-center text-muted-foreground">
              <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">אין פעילות עדיין</p>
              <p className="text-xs mt-1">הפעילות תופיע כאן לאחר ביצוע פעולות במערכת</p>
            </div>
          ) : (
            activityFeed.map((a: any, i: number) => (
              <div key={i} className="flex items-center gap-4 p-4 border rounded-xl bg-card">
                <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary flex-shrink-0">{(a.performedBy || "?")[0]}</div>
                <div className="flex-1">
                  <span className="font-medium text-sm">{a.performedBy}</span>
                  <span className="text-sm text-muted-foreground"> — </span>
                  <span className="text-sm text-primary">{a.msg}</span>
                </div>
                <div className="text-xs text-muted-foreground flex-shrink-0">{formatTime(a.time)}</div>
              </div>
            ))
          )}
          </div>
          )}
        </div>
      )}
    </div>
  );
}
