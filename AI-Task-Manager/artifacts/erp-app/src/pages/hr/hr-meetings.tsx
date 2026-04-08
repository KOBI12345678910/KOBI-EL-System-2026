import { useState, useEffect } from "react";
import { CalendarDays, Plus, Edit2, Trash2, X, Save, Bot, Sparkles, Clock, Users, MapPin, FileText, CheckCircle2, Calendar, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { useApiAction } from "@/hooks/use-api-action";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";
import StatusTransition from "@/components/status-transition";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const API = "/api";

interface Meeting {
  id: number;
  meeting_number: string;
  title: string;
  meeting_date: string;
  meeting_time: string;
  duration_minutes: number;
  meeting_type: string;
  participants: string;
  location: string;
  notes: string;
  ai_summary: string;
  status: string;
  created_by_name: string;
  created_at: string;
}

const typeConfig: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  interview:  { label: "ראיון",    color: "text-violet-300", bg: "bg-violet-500/20 border-violet-500/30", dot: "bg-violet-400" },
  client:     { label: "לקוח",     color: "text-blue-300",   bg: "bg-blue-500/20 border-blue-500/30",     dot: "bg-blue-400"   },
  standup:    { label: "סטנדאפ",   color: "text-green-300",  bg: "bg-green-500/20 border-green-500/30",   dot: "bg-green-400"  },
  internal:   { label: "פנימי",    color: "text-slate-300",  bg: "bg-muted/20 border-slate-500/30",   dot: "bg-slate-400"  },
  vendor:     { label: "ספק",      color: "text-amber-300",  bg: "bg-amber-500/20 border-amber-500/30",   dot: "bg-amber-400"  },
};

const statusConfig: Record<string, { label: string; color: string }> = {
  scheduled:  { label: "מתוכנן",   color: "text-blue-400"   },
  completed:  { label: "הושלם",    color: "text-green-400"  },
  cancelled:  { label: "בוטל",     color: "text-red-400"    },
};

const defaultForm = {
  title: "", meeting_date: "", meeting_time: "10:00", duration_minutes: 60,
  meeting_type: "internal", participants: "", location: "", notes: "", status: "scheduled"
};

export default function HRMeetingsPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [selected, setSelected] = useState<Meeting | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Meeting | null>(null);
  const [form, setForm] = useState<any>({ ...defaultForm });
  const [summarizing, setSummarizing] = useState(false);
  const [detailTab, setDetailTab] = useState("details");
  const bulk = useBulkSelection();
  const formValidation = useFormValidation({
    title: [{ type: "required", message: "כותרת נדרשת" }],
    meeting_date: [{ type: "required", message: "תאריך נדרש" }],
  });
  const [summaryResult, setSummaryResult] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const pagination = useSmartPagination(25);
  const { executeSave, executeDelete, execute, loading: actionLoading } = useApiAction();

  const token = localStorage.getItem("erp_token") || "";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const load = () => {
    setLoading(true);
    authFetch(`${API}/hr/meetings`, { headers })
      .then(r => r.json())
      .then(d => { setMeetings(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => { setMeetings([]); setLoading(false); });
  };

  useEffect(load, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...defaultForm, meeting_date: new Date().toISOString().slice(0, 10) });
    setShowForm(true);
  };

  const openEdit = (m: Meeting) => {
    setEditing(m);
    setForm({
      title: m.title, meeting_date: m.meeting_date?.slice(0, 10) || "",
      meeting_time: m.meeting_time || "10:00", duration_minutes: m.duration_minutes || 60,
      meeting_type: m.meeting_type || "internal", participants: m.participants || "",
      location: m.location || "", notes: m.notes || "", status: m.status || "scheduled"
    });
    setShowForm(true);
  };

  const save = async () => { const url = editing ? `${API}/hr/meetings/${editing.id}` : `${API}/hr/meetings`; await executeSave(url, editing ? "PUT" : "POST", form, editing ? "עודכן בהצלחה" : "נוצר בהצלחה", () => { setShowForm(false); load(); }); };

  const remove = async (id: number) => { await executeDelete(`${API}/hr/meetings/${id}`, "למחוק פגישה?", () => { if (selected?.id === id) setSelected(null); load(); }); };

  const summarize = async (meeting: Meeting) => {
    setSummarizing(true);
    setSummaryResult("");
    try {
      const r = await authFetch(`${API}/hr/meetings/${meeting.id}/summarize`, { method: "POST", headers });
      const d = await r.json();
      setSummaryResult(d.summary || "");
      setSelected(prev => prev ? { ...prev, ai_summary: d.summary } : prev);
      load();
    } catch {
      setSummaryResult("שגיאה ביצירת הסיכום");
    }
    setSummarizing(false);
  };

  const activeSummary = summaryResult || selected?.ai_summary || "";
  const fmt = (d: string) => d ? new Date(d).toLocaleDateString("he-IL") : "-";

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <CalendarDays className="text-blue-400 w-7 h-7" /> פגישות AI — משאבי אנוש
          </h1>
          <p className="text-muted-foreground mt-1">ניהול פגישות חכם עם סיכום אוטומטי בינה מלאכותית</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-foreground px-4 py-2 rounded-xl shadow-lg transition-colors text-sm">
          <Plus size={16} /> פגישה חדשה
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* LEFT: AI Summary */}
        <div className="lg:col-span-1 flex flex-col gap-4">
          <div className="border border-border/50 rounded-2xl bg-card p-5 flex-1">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2 mb-4">
              <Bot className="w-5 h-5 text-violet-400" /> סיכום ופעולות AI
            </h2>
            {selected ? (
              <div className="space-y-4">
                <div className="bg-muted/30 rounded-xl p-3">
                  <p className="text-sm text-foreground font-medium">{selected.title}</p>
                  <div className="flex items-center gap-3 mt-1">
                    {selected.meeting_date && <span className="text-xs text-muted-foreground flex items-center gap-1"><Calendar size={11} />{fmt(selected.meeting_date)}</span>}
                    {selected.meeting_time && <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock size={11} />{selected.meeting_time}</span>}
                  </div>
                  {selected.participants && <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><Users size={11} />{selected.participants}</p>}
                </div>
                <div className="flex border-b border-border/50">
                  {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                    <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-3 py-2 text-xs font-medium border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                  ))}
                </div>
                {detailTab === "related" && <div className="py-2"><RelatedRecords entityType="hr-meetings" entityId={selected.id} relations={[{key:"attendees",label:"משתתפים",icon:"Users"},{key:"minutes",label:"פרוטוקולים",icon:"FileText"}]} /></div>}
                {detailTab === "docs" && <div className="py-2"><AttachmentsSection entityType="hr-meetings" entityId={selected.id} /></div>}
                {detailTab === "history" && <div className="py-2"><ActivityLog entityType="hr-meetings" entityId={selected.id} /></div>}
                {detailTab === "details" && <>
                <div className="text-xs text-muted-foreground mt-1">
                  <StatusTransition currentStatus={selected.status} statusMap={{"scheduled":"מתוכנן","in_progress":"בתהליך","completed":"הושלם","cancelled":"בוטל"}} transitions={{"scheduled":["in_progress","cancelled"],"in_progress":["completed","cancelled"]}} onTransition={async (s) => { await authFetch(`${API}/hr/meetings/${selected.id}`, { method: "PUT", headers, body: JSON.stringify({status: s}) }); load(); }} />
                </div></>}

                {activeSummary ? (
                  <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="w-4 h-4 text-violet-400" />
                      <span className="text-xs font-semibold text-violet-300">סיכום AI</span>
                    </div>
                    <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">{activeSummary}</p>
                  </div>
                ) : (
                  <div className="text-center py-6 text-muted-foreground">
                    <Bot className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">לחץ "סכם פגישה" לקבלת סיכום AI</p>
                  </div>
                )}

                <button
                  onClick={() => summarize(selected)}
                  disabled={summarizing}
                  className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-foreground px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
                >
                  {summarizing ? (
                    <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> מייצר סיכום...</>
                  ) : (
                    <><Sparkles size={16} /> סכם פגישה</>
                  )}
                </button>
              </div>
            ) : (
              <div className="text-center py-10 text-muted-foreground">
                <CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm">בחר פגישה מהרשימה לצפייה ולסיכום AI</p>
              </div>
            )}
          </div>
        </div>

        {/* MIDDLE: Create/Edit meeting inline form (quick generator) */}
        <div className="lg:col-span-1">
          <div className="border border-border/50 rounded-2xl bg-card p-5">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2 mb-4">
              <Plus className="w-5 h-5 text-blue-400" /> מחולל פגישה
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">נושא הפגישה *</label>
                <input value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="לדוגמה: ראיון מועמד, פגישת צוות..." className="w-full bg-muted/30 border border-border/50 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500/50" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">תאריך</label>
                  <input type="date" value={form.meeting_date} onChange={e => setForm({...form, meeting_date: e.target.value})} className="w-full bg-muted/30 border border-border/50 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-blue-500/50" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">שעה</label>
                  <input type="time" value={form.meeting_time} onChange={e => setForm({...form, meeting_time: e.target.value})} className="w-full bg-muted/30 border border-border/50 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-blue-500/50" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">סוג</label>
                  <select value={form.meeting_type} onChange={e => setForm({...form, meeting_type: e.target.value})} className="w-full bg-muted/30 border border-border/50 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-blue-500/50">
                    {Object.entries(typeConfig).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">משך (דקות)</label>
                  <input type="number" value={form.duration_minutes} onChange={e => setForm({...form, duration_minutes: Number(e.target.value)})} className="w-full bg-muted/30 border border-border/50 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-blue-500/50" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">משתתפים</label>
                <input value={form.participants} onChange={e => setForm({...form, participants: e.target.value})} placeholder="שמות המשתתפים, מופרדים בפסיק" className="w-full bg-muted/30 border border-border/50 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500/50" />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">מיקום / קישור</label>
                <input value={form.location} onChange={e => setForm({...form, location: e.target.value})} placeholder="חדר ישיבות / Zoom / כתובת..." className="w-full bg-muted/30 border border-border/50 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500/50" />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">סדר יום / הערות</label>
                <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={3} placeholder="תאר את תוכן הפגישה, נקודות לדיון..." className="w-full bg-muted/30 border border-border/50 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500/50 resize-none" />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">סטטוס</label>
                <select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="w-full bg-muted/30 border border-border/50 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-blue-500/50">
                  {Object.entries(statusConfig).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <button
                onClick={save}
                disabled={!form.title}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-foreground px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
              >
                <Save size={16} /> שמור פגישה
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT: Recent meetings list */}
        <div className="lg:col-span-1">
          <div className="border border-border/50 rounded-2xl bg-card p-5 h-full">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2 mb-4">
              <FileText className="w-5 h-5 text-teal-400" /> פגישות אחרונות
            </h2>
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
              </div>
            ) : meetings.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <CalendarDays className="w-10 h-10 mx-auto mb-2 opacity-20" />
                <p className="text-sm">אין פגישות עדיין</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[520px] overflow-y-auto">
                <BulkActions selectedIds={bulk.selectedIds} onClear={bulk.clearAll} entityName="פגישות" actions={defaultBulkActions} />
                {pagination.paginate(meetings).map(m => {
                  const tc = typeConfig[m.meeting_type] || typeConfig.internal;
                  const sc = statusConfig[m.status] || statusConfig.scheduled;
                  const isSelected = selected?.id === m.id;
                  return (
                    <motion.div
                      key={m.id}
                      layout
                      onClick={() => { setSelected(m); setDetailTab("details"); setSummaryResult(""); }}
                      className={`rounded-xl p-3 cursor-pointer border transition-all ${isSelected ? "border-blue-500/40 bg-blue-500/10" : "border-border/30 bg-muted/20 hover:border-border/60 hover:bg-muted/30"}`}
                    >
                      <div className="flex items-start gap-2">
                        <div className="pt-1" onClick={e => e.stopPropagation()}><BulkCheckbox checked={bulk.isSelected(m.id)} onChange={() => bulk.toggle(m.id)} /></div>
                      <div className="flex items-start justify-between gap-2 flex-1">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{m.title}</p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {m.meeting_date && (
                              <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                                <Calendar size={10} />{fmt(m.meeting_date)}{m.meeting_time ? ` ${m.meeting_time}` : ""}
                              </span>
                            )}
                            {m.duration_minutes && (
                              <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                                <Clock size={10} />{m.duration_minutes}′
                              </span>
                            )}
                          </div>
                          {m.participants && (
                            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1 truncate">
                              <Users size={10} />{m.participants}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${tc.bg} ${tc.color}`}>{tc.label}</span>
                          {m.ai_summary && <CheckCircle2 size={12} className="text-violet-400" title="יש סיכום AI" />}
                        </div>
                      </div>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <span className={`text-[10px] font-medium ${sc.color}`}>{sc.label}</span>
                        <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                          <button onClick={() => openEdit(m)} className="p-1 hover:bg-blue-500/20 rounded text-blue-400 transition-colors"><Edit2 size={12} /></button>
                          <button onClick={() => remove(m.id)} className="p-1 hover:bg-red-500/20 rounded text-red-400 transition-colors"><Trash2 size={12} /></button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      <AnimatePresence>
        {showForm && editing && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-card border border-border/50 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-5">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><Edit2 size={18} className="text-blue-400" />עריכת פגישה</h2>
                <button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted/50 rounded-lg text-muted-foreground"><X size={18} /></button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">נושא הפגישה *</label>
                  <input value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="w-full bg-muted/30 border border-border/50 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-blue-500/50" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">תאריך</label>
                    <input type="date" value={form.meeting_date} onChange={e => setForm({...form, meeting_date: e.target.value})} className="w-full bg-muted/30 border border-border/50 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-blue-500/50" />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">שעה</label>
                    <input type="time" value={form.meeting_time} onChange={e => setForm({...form, meeting_time: e.target.value})} className="w-full bg-muted/30 border border-border/50 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-blue-500/50" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">סוג</label>
                    <select value={form.meeting_type} onChange={e => setForm({...form, meeting_type: e.target.value})} className="w-full bg-muted/30 border border-border/50 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-blue-500/50">
                      {Object.entries(typeConfig).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">משך (דקות)</label>
                    <input type="number" value={form.duration_minutes} onChange={e => setForm({...form, duration_minutes: Number(e.target.value)})} className="w-full bg-muted/30 border border-border/50 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-blue-500/50" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">משתתפים</label>
                  <input value={form.participants} onChange={e => setForm({...form, participants: e.target.value})} className="w-full bg-muted/30 border border-border/50 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-blue-500/50" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">מיקום</label>
                  <input value={form.location} onChange={e => setForm({...form, location: e.target.value})} className="w-full bg-muted/30 border border-border/50 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-blue-500/50" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">הערות / סדר יום</label>
                  <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={3} className="w-full bg-muted/30 border border-border/50 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-blue-500/50 resize-none" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">סטטוס</label>
                  <select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="w-full bg-muted/30 border border-border/50 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-blue-500/50">
                    {Object.entries(statusConfig).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div className="flex gap-2 pt-2">
                  <button onClick={save} disabled={!form.title} className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-foreground px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
                    <Save size={16} /> שמור שינויים
                  </button>
                  <button onClick={() => setShowForm(false)} className="px-4 py-2.5 border border-border/50 rounded-xl text-sm text-muted-foreground hover:bg-muted/30 transition-colors">ביטול</button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
