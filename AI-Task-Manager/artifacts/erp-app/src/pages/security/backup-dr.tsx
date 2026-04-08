import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Server, Plus, Play, RefreshCw, X, Save, CheckCircle, XCircle, Clock, HardDrive, Download, AlertTriangle, Calendar, Edit2 } from "lucide-react";
import { authFetch } from "@/lib/utils";

const API = "/api";

const BACKUP_STATUS: Record<string, { label: string; color: string }> = {
  completed: { label: "הושלם", color: "bg-green-500/20 text-green-400" },
  in_progress: { label: "בתהליך", color: "bg-blue-500/20 text-blue-400" },
  failed: { label: "נכשל", color: "bg-red-500/20 text-red-400" },
  pending: { label: "ממתין", color: "bg-amber-500/20 text-amber-400" },
};

const BACKUP_TYPE: Record<string, string> = {
  full: "גיבוי מלא",
  database: "מסד נתונים",
  configuration: "תצורה",
  incremental: "אינקרמנטלי",
  differential: "דיפרנציאלי",
  files: "קבצים",
};

const DR_STATUS: Record<string, { label: string; color: string }> = {
  scheduled: { label: "מתוכנן", color: "bg-blue-500/20 text-blue-400" },
  completed: { label: "הושלם", color: "bg-green-500/20 text-green-400" },
  in_progress: { label: "מתבצע", color: "bg-amber-500/20 text-amber-400" },
  cancelled: { label: "בוטל", color: "bg-red-500/20 text-red-400" },
};

const DR_TEST_TYPES: Record<string, string> = {
  tabletop: "שולחן עגול",
  simulation: "סימולציה",
  full_test: "בדיקה מלאה",
  partial: "בדיקה חלקית",
};

function formatSize(bytes: number) {
  if (!bytes) return "—";
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "פחות משעה";
  if (h < 24) return `לפני ${h} שעות`;
  return `לפני ${Math.floor(h / 24)} ימים`;
}

function Tab({ label, active, onClick }: any) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
    >
      {label}
    </button>
  );
}

export default function BackupDRPage() {
  const [tab, setTab] = useState<"backups" | "dr">("backups");

  const [backups, setBackups] = useState<any[]>([]);
  const [backupLoading, setBackupLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [backupType, setBackupType] = useState("full");
  const [statusFilter, setStatusFilter] = useState("all");

  const [drTests, setDrTests] = useState<any[]>([]);
  const [drLoading, setDrLoading] = useState(true);
  const [showDrForm, setShowDrForm] = useState(false);
  const [drForm, setDrForm] = useState<any>({});
  const [drSaving, setDrSaving] = useState(false);
  const [selectedDr, setSelectedDr] = useState<any>(null);

  const loadBackups = async () => {
    setBackupLoading(true);
    try {
      const res = await authFetch(`${API}/settings/backups`);
      if (res.ok) { const d = await res.json(); setBackups(Array.isArray(d) ? d : d.data || []); }
    } catch { }
    setBackupLoading(false);
  };

  const loadDr = async () => {
    setDrLoading(true);
    try {
      const res = await authFetch(`${API}/security/dr-tests`);
      if (res.ok) setDrTests(await res.json());
    } catch { }
    setDrLoading(false);
  };

  useEffect(() => { loadBackups(); loadDr(); }, []);

  const triggerBackup = async () => {
    setTriggering(true);
    try {
      await authFetch(`${API}/settings/backups/trigger`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backupType, triggeredBy: "admin" }),
      });
      setTimeout(loadBackups, 3000);
    } catch { }
    setTriggering(false);
  };

  const saveDr = async () => {
    setDrSaving(true);
    try {
      const url = selectedDr?.id ? `${API}/security/dr-tests/${selectedDr.id}` : `${API}/security/dr-tests`;
      const method = selectedDr?.id ? "PUT" : "POST";
      await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(drForm) });
      setShowDrForm(false);
      setDrForm({});
      setSelectedDr(null);
      loadDr();
    } catch { }
    setDrSaving(false);
  };

  const filteredBackups = useMemo(() => {
    let d = [...backups];
    if (statusFilter !== "all") d = d.filter(b => b.status === statusFilter);
    return d;
  }, [backups, statusFilter]);

  const completedBackups = backups.filter(b => b.status === "completed").length;
  const failedBackups = backups.filter(b => b.status === "failed").length;
  const totalSize = backups.reduce((s, b) => s + Number(b.size_bytes || 0), 0);
  const lastBackup = backups[0];

  const upcomingDr = drTests.filter(t => t.status === "scheduled");
  const completedDr = drTests.filter(t => t.status === "completed");
  const passedDr = completedDr.filter(t => t.result === "passed");

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Server className="text-rose-400" size={26} />
            גיבויים ו-Disaster Recovery
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול גיבויים, לוח זמנים שחזור ובדיקות DR</p>
        </div>
        <button onClick={() => { loadBackups(); loadDr(); }} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground btn-ghost">
          <RefreshCw size={13} /> רענון
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card border border-border/50 rounded-xl p-4">
          <Download size={18} className="text-blue-400 mb-2" />
          <div className="text-xl font-bold text-foreground">{backups.length}</div>
          <div className="text-xs text-muted-foreground">סה"כ גיבויים</div>
        </div>
        <div className="bg-card border border-border/50 rounded-xl p-4">
          <CheckCircle size={18} className="text-green-400 mb-2" />
          <div className="text-xl font-bold text-foreground">{completedBackups}</div>
          <div className="text-xs text-muted-foreground">הושלמו</div>
        </div>
        <div className="bg-card border border-border/50 rounded-xl p-4">
          <HardDrive size={18} className="text-cyan-400 mb-2" />
          <div className="text-xl font-bold text-foreground">{formatSize(totalSize)}</div>
          <div className="text-xs text-muted-foreground">נפח כולל</div>
        </div>
        <div className="bg-card border border-border/50 rounded-xl p-4">
          <Clock size={18} className="text-amber-400 mb-2" />
          <div className="text-xl font-bold text-foreground">{lastBackup ? timeAgo(lastBackup.created_at) : "—"}</div>
          <div className="text-xs text-muted-foreground">גיבוי אחרון</div>
        </div>
      </div>

      <div className="flex gap-2 border-b border-border pb-3">
        <Tab label="גיבויים" active={tab === "backups"} onClick={() => setTab("backups")} />
        <Tab label="בדיקות DR ושחזור" active={tab === "dr"} onClick={() => setTab("dr")} />
      </div>

      {tab === "backups" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 items-center justify-between">
            <div className="flex gap-2 flex-wrap items-center">
              <select value={backupType} onChange={e => setBackupType(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2 text-sm">
                {Object.entries(BACKUP_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <button onClick={triggerBackup} disabled={triggering} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-foreground px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50">
                {triggering ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Play size={16} />}
                {triggering ? "מגבה..." : "הפעל גיבוי"}
              </button>
            </div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2 text-sm">
              <option value="all">כל הסטטוסים</option>
              {Object.entries(BACKUP_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>

          {failedBackups > 0 && (
            <div className="flex items-center gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
              <AlertTriangle size={16} className="text-red-400 shrink-0" />
              <div className="text-sm text-red-300">{failedBackups} גיבויים נכשלו — בדוק לוגים ותצורה</div>
            </div>
          )}

          {backupLoading ? (
            <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-14 bg-muted/20 rounded-xl animate-pulse" />)}</div>
          ) : filteredBackups.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground"><Server size={40} className="mx-auto mb-3 opacity-20" /><p>אין גיבויים</p></div>
          ) : (
            <div className="border border-border/50 rounded-2xl overflow-hidden bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 border-b border-border/50">
                  <tr>
                    <th className="px-4 py-3 text-right text-xs text-muted-foreground font-medium">#</th>
                    <th className="px-4 py-3 text-right text-xs text-muted-foreground font-medium">סוג</th>
                    <th className="px-4 py-3 text-right text-xs text-muted-foreground font-medium">גודל</th>
                    <th className="px-4 py-3 text-right text-xs text-muted-foreground font-medium">מיקום</th>
                    <th className="px-4 py-3 text-right text-xs text-muted-foreground font-medium">הופעל ע"י</th>
                    <th className="px-4 py-3 text-right text-xs text-muted-foreground font-medium">תאריך</th>
                    <th className="px-4 py-3 text-right text-xs text-muted-foreground font-medium">סטטוס</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBackups.map(b => {
                    const st = BACKUP_STATUS[b.status] || BACKUP_STATUS.pending;
                    return (
                      <tr key={b.id} className="border-b border-border/20 hover:bg-muted/20">
                        <td className="px-4 py-3 font-mono text-xs text-blue-400">#{b.id}</td>
                        <td className="px-4 py-3 text-muted-foreground">{BACKUP_TYPE[b.backup_type] || b.backup_type}</td>
                        <td className="px-4 py-3 font-mono text-foreground text-xs">{formatSize(Number(b.size_bytes))}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground truncate max-w-[150px]">{b.location || "—"}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{b.triggered_by}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{timeAgo(b.created_at)}</td>
                        <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs ${st.color}`}>{st.label}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="bg-card border border-border/50 rounded-2xl p-5">
            <h3 className="font-bold text-foreground mb-3 flex items-center gap-2"><Calendar size={15} className="text-blue-400" /> לוח גיבויים מומלץ</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              {[
                { freq: "יומי", type: "מסד נתונים", time: "02:00", ret: "7 ימים" },
                { freq: "שבועי", type: "גיבוי מלא", time: "שישי 23:00", ret: "4 שבועות" },
                { freq: "חודשי", type: "ארכיון מלא", time: "1 בחודש 01:00", ret: "12 חודשים" },
              ].map((s, i) => (
                <div key={i} className="bg-background rounded-lg p-3">
                  <div className="font-medium text-foreground">{s.freq} — {s.type}</div>
                  <div className="text-muted-foreground mt-1">שעה: {s.time}</div>
                  <div className="text-muted-foreground">שמירה: {s.ret}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "dr" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-card border border-border/50 rounded-xl p-4">
                <Calendar size={16} className="text-blue-400 mb-1" />
                <div className="font-bold text-foreground">{upcomingDr.length}</div>
                <div className="text-xs text-muted-foreground">מתוכננות</div>
              </div>
              <div className="bg-card border border-border/50 rounded-xl p-4">
                <CheckCircle size={16} className="text-green-400 mb-1" />
                <div className="font-bold text-foreground">{completedDr.length}</div>
                <div className="text-xs text-muted-foreground">הושלמו</div>
              </div>
              <div className="bg-card border border-border/50 rounded-xl p-4">
                <CheckCircle size={16} className="text-cyan-400 mb-1" />
                <div className="font-bold text-foreground">{completedDr.length > 0 ? Math.round((passedDr.length / completedDr.length) * 100) : 0}%</div>
                <div className="text-xs text-muted-foreground">שיעור הצלחה</div>
              </div>
            </div>
            <button onClick={() => { setSelectedDr(null); setDrForm({ test_type: "tabletop", rto_target_minutes: 240, rpo_target_minutes: 60 }); setShowDrForm(true); }} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-medium">
              <Plus size={16} /> בדיקה חדשה
            </button>
          </div>

          {drLoading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 bg-muted/20 rounded-xl animate-pulse" />)}</div>
          ) : drTests.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Server size={40} className="mx-auto mb-3 opacity-20" />
              <p>אין בדיקות DR מתוכננות</p>
              <p className="text-sm mt-1">מומלץ לתכנן בדיקת שחזור לפחות אחת לרבעון</p>
            </div>
          ) : (
            <div className="border border-border/50 rounded-2xl overflow-hidden bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 border-b border-border/50">
                  <tr>
                    <th className="px-4 py-3 text-right text-xs text-muted-foreground font-medium">שם בדיקה</th>
                    <th className="px-4 py-3 text-right text-xs text-muted-foreground font-medium">סוג</th>
                    <th className="px-4 py-3 text-right text-xs text-muted-foreground font-medium">תאריך מתוכנן</th>
                    <th className="px-4 py-3 text-right text-xs text-muted-foreground font-medium">RTO יעד</th>
                    <th className="px-4 py-3 text-right text-xs text-muted-foreground font-medium">RPO יעד</th>
                    <th className="px-4 py-3 text-right text-xs text-muted-foreground font-medium">תוצאה</th>
                    <th className="px-4 py-3 text-right text-xs text-muted-foreground font-medium">סטטוס</th>
                    <th className="px-4 py-3 text-right text-xs text-muted-foreground font-medium">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {drTests.map(test => {
                    const st = DR_STATUS[test.status] || DR_STATUS.scheduled;
                    return (
                      <tr key={test.id} className="border-b border-border/20 hover:bg-muted/20">
                        <td className="px-4 py-3 font-medium text-foreground">{test.test_name}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{DR_TEST_TYPES[test.test_type] || test.test_type}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{test.scheduled_date ? new Date(test.scheduled_date).toLocaleDateString("he-IL") : "—"}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{test.rto_target_minutes} דק'</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{test.rpo_target_minutes} דק'</td>
                        <td className="px-4 py-3">
                          {test.result ? (
                            <span className={`px-2 py-0.5 rounded-full text-xs ${test.result === "passed" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                              {test.result === "passed" ? "עבר" : "נכשל"}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs ${st.color}`}>{st.label}</span></td>
                        <td className="px-4 py-3">
                          <button onClick={() => { setSelectedDr(test); setDrForm({ ...test }); setShowDrForm(true); }} className="p-1.5 hover:bg-muted rounded-lg">
                            <Edit2 size={13} className="text-blue-400" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="bg-card border border-border/50 rounded-2xl p-5">
            <h3 className="font-bold text-foreground mb-3">📋 DR Runbook — נהלי שחזור מזורזים</h3>
            <div className="space-y-3 text-sm">
              {[
                { step: "1", title: "זיהוי אירוע", desc: "הפעל פרוטוקול אירוע — ודא מקור הכשל ורמת חומרה" },
                { step: "2", title: "הפעלת צוות DR", desc: "יצור קשר עם מנהל IT, מנהל מערכות ובעל תפקיד עסקי בכיר" },
                { step: "3", title: "הערכת נזק", desc: "בדוק מה מערכות פעילות ומה מושבת — תעד בסיסמה ייעודית" },
                { step: "4", title: "שחזור מגיבוי", desc: "בחר גיבוי אחרון תקין — השתמש ב-point-in-time recovery אם נדרש" },
                { step: "5", title: "אימות שחזור", desc: "בדוק שלמות נתונים, תפקוד שירותים קריטיים ונגישות משתמשים" },
                { step: "6", title: "תיעוד ולמידה", desc: "תעד את האירוע, הגורם, הצעדים שנעשו וזמן שחזור — עדכן את ה-runbook" },
              ].map(step => (
                <div key={step.step} className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">{step.step}</div>
                  <div>
                    <div className="font-medium text-foreground">{step.title}</div>
                    <div className="text-xs text-muted-foreground">{step.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {showDrForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowDrForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="font-bold text-foreground">{selectedDr ? "עדכון בדיקת DR" : "בדיקת DR חדשה"}</h2>
                <button onClick={() => setShowDrForm(false)} className="p-1 hover:bg-muted rounded-lg"><X size={18} /></button>
              </div>
              <div className="p-5 grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs text-muted-foreground mb-1.5">שם הבדיקה *</label>
                  <input value={drForm.test_name || ""} onChange={e => setDrForm({ ...drForm, test_name: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm" placeholder="בדיקת שחזור Q2 2026" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">סוג בדיקה</label>
                  <select value={drForm.test_type || "tabletop"} onChange={e => setDrForm({ ...drForm, test_type: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm">
                    {Object.entries(DR_TEST_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">תאריך מתוכנן</label>
                  <input type="date" value={drForm.scheduled_date || ""} onChange={e => setDrForm({ ...drForm, scheduled_date: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">RTO יעד (דקות)</label>
                  <input type="number" min={1} value={drForm.rto_target_minutes || ""} onChange={e => setDrForm({ ...drForm, rto_target_minutes: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">RPO יעד (דקות)</label>
                  <input type="number" min={1} value={drForm.rpo_target_minutes || ""} onChange={e => setDrForm({ ...drForm, rpo_target_minutes: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm" />
                </div>
                {selectedDr && (
                  <>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1.5">סטטוס</label>
                      <select value={drForm.status || "scheduled"} onChange={e => setDrForm({ ...drForm, status: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm">
                        {Object.entries(DR_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1.5">תוצאה</label>
                      <select value={drForm.result || ""} onChange={e => setDrForm({ ...drForm, result: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm">
                        <option value="">— בחר —</option>
                        <option value="passed">עבר</option>
                        <option value="failed">נכשל</option>
                        <option value="partial">חלקי</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1.5">RTO בפועל (דקות)</label>
                      <input type="number" value={drForm.rto_actual_minutes || ""} onChange={e => setDrForm({ ...drForm, rto_actual_minutes: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1.5">תאריך ביצוע</label>
                      <input type="date" value={drForm.completed_date || ""} onChange={e => setDrForm({ ...drForm, completed_date: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-muted-foreground mb-1.5">ממצאים</label>
                      <textarea value={drForm.findings || ""} onChange={e => setDrForm({ ...drForm, findings: e.target.value })} rows={3} className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm resize-none" />
                    </div>
                  </>
                )}
                <div className="col-span-2">
                  <label className="block text-xs text-muted-foreground mb-1.5">משתתפים</label>
                  <input value={drForm.participants || ""} onChange={e => setDrForm({ ...drForm, participants: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm" placeholder="מנהל IT, DevOps, מנהל מערכות..." />
                </div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => setShowDrForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
                <button onClick={saveDr} disabled={drSaving || !drForm.test_name} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50">
                  <Save size={14} />{drSaving ? "שומר..." : "שמור"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
