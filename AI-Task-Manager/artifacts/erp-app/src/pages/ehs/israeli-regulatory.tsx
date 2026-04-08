import { LoadingOverlay } from "@/components/ui/unified-states";
import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/utils";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import {
  Shield, Plus, Search, Edit2, Eye, X, Save, AlertCircle,
  ArrowUpDown, RefreshCw, CheckCircle2, Clock, Users, FileText,
  ClipboardList
} from "lucide-react";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);

type TabKey = "meetings" | "officer" | "checklist";

interface SafetyCommitteeMeeting {
  id: number;
  meeting_date: string;
  meeting_type: string;
  attendees: string;
  chairperson: string;
  agenda: string;
  minutes_summary: string;
  action_items: string;
  next_meeting_date: string;
  status: string;
  created_at: string;
}

interface SafetyOfficer {
  id: number;
  officer_name: string;
  appointment_date: string;
  certification_number: string;
  certification_expiry: string;
  phone: string;
  email: string;
  department: string;
  is_active: boolean;
  notes: string;
  created_at: string;
}

interface IsraeliChecklist {
  id: number;
  requirement: string;
  law_reference: string;
  frequency: string;
  last_done: string;
  next_due: string;
  status: string;
  responsible: string;
  notes: string;
}

const MEETING_TYPES = ["ישיבה רגילה", "ישיבת חירום", "ביקורת שנתית", "דיון מיוחד"];
const MEETING_STATUSES = ["מתוכנן", "התקיים", "בוטל", "נדחה"];
const CHECKLIST_STATUSES = ["עמידה", "בטיפול", "חריגה", "לא רלוונטי"];
const SC_STATUS: Record<string, string> = {
  "עמידה": "bg-green-500/20 text-green-300",
  "בטיפול": "bg-yellow-500/20 text-yellow-300",
  "חריגה": "bg-red-500/20 text-red-300",
  "לא רלוונטי": "bg-gray-500/20 text-gray-300",
  "התקיים": "bg-green-500/20 text-green-300",
  "מתוכנן": "bg-blue-500/20 text-blue-300",
  "בוטל": "bg-red-500/20 text-red-300",
  "נדחה": "bg-yellow-500/20 text-yellow-300",
};

const DEFAULT_CHECKLIST: Partial<IsraeliChecklist>[] = [
  { requirement: "ועדת בטיחות — ישיבה חודשית", law_reference: "תקנות הבטיחות בעבודה סעיף 2", frequency: "חודשי", status: "עמידה", responsible: "ממונה בטיחות" },
  { requirement: "מינוי ממונה בטיחות", law_reference: "פקודת הבטיחות בעבודה", frequency: "קבוע", status: "עמידה", responsible: "מנהל משאבי אנוש" },
  { requirement: "סקר בטיחות שנתי", law_reference: "תקנות סביבת עבודה", frequency: "שנתי", status: "בטיפול", responsible: "ממונה בטיחות" },
  { requirement: "דוח בטיחות שנתי למשרד העבודה", law_reference: "חוק ארגון פיקוח העבודה", frequency: "שנתי", status: "בטיפול", responsible: "ממונה בטיחות" },
  { requirement: "הדרכת בטיחות לעובדים חדשים", law_reference: "תקנות הבטיחות בעבודה", frequency: "בקליטה", status: "עמידה", responsible: "מנהל הדרכה" },
  { requirement: "תרגיל פינוי אש", law_reference: "תקן ישראלי 1220", frequency: "חצי שנתי", status: "עמידה", responsible: "קצין בטיחות" },
  { requirement: "בדיקת מטפי אש", law_reference: "תקן ישראלי 1220", frequency: "שנתי", status: "עמידה", responsible: "אחראי תחזוקה" },
  { requirement: "תיקי בטיחות מכונות", law_reference: "תקנות מכונות ומתקנים", frequency: "שנתי", status: "בטיפול", responsible: "מהנדס ייצור" },
  { requirement: "בדיקות רעש בסביבת עבודה", law_reference: "תקנות בריאות בעבודה", frequency: "שנתי", status: "עמידה", responsible: "ממונה בטיחות" },
  { requirement: "ועדת בטיחות — פרוטוקולים ותוכנית עבודה", law_reference: "תקנות ועדת בטיחות", frequency: "שנתי", status: "עמידה", responsible: "ממונה בטיחות" },
];

const EMPTY_MEETING = {
  meeting_date: new Date().toISOString().slice(0,10), meeting_type: "ישיבה רגילה",
  attendees: "", chairperson: "", agenda: "", minutes_summary: "", action_items: "",
  next_meeting_date: "", status: "מתוכנן"
};

const EMPTY_OFFICER = {
  officer_name: "", appointment_date: new Date().toISOString().slice(0,10),
  certification_number: "", certification_expiry: "", phone: "", email: "",
  department: "", notes: "", is_active: true
};

export default function IsraeliRegulatoryPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [tab, setTab] = useState<TabKey>("meetings");
  const [meetings, setMeetings] = useState<SafetyCommitteeMeeting[]>([]);
  const [officers, setOfficers] = useState<SafetyOfficer[]>([]);
  const [checklist, setChecklist] = useState<IsraeliChecklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [viewDetail, setViewDetail] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const pagination = useSmartPagination(20);

  const load = async () => {
    setLoading(true);
    try {
      const [mr, or, cr] = await Promise.all([
        authFetch(`${API}/hse-safety-committee-meetings?limit=200`),
        authFetch(`${API}/hse-safety-officers?limit=50`),
        authFetch(`${API}/hse-israeli-checklist?limit=200`),
      ]);
      if (mr.ok) setMeetings(safeArray(await mr.json()));
      if (or.ok) setOfficers(safeArray(await or.json()));
      if (cr.ok) {
        const d = safeArray(await cr.json());
        setChecklist(d.length > 0 ? d : DEFAULT_CHECKLIST as any);
      } else {
        setChecklist(DEFAULT_CHECKLIST as any);
      }
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filteredMeetings = useMemo(() => {
    const f = meetings.filter(r => !search || [r.chairperson, r.meeting_type, r.agenda].some(v => v?.toLowerCase().includes(search.toLowerCase())));
    pagination.setTotalItems(f.length);
    return f;
  }, [meetings, search]);

  const openCreateMeeting = () => { setEditing(null); setForm({ ...EMPTY_MEETING }); setShowForm(true); };
  const openEditMeeting = (r: SafetyCommitteeMeeting) => {
    setEditing(r);
    setForm({ meeting_date: r.meeting_date?.slice(0,10), meeting_type: r.meeting_type, attendees: r.attendees, chairperson: r.chairperson, agenda: r.agenda, minutes_summary: r.minutes_summary, action_items: r.action_items, next_meeting_date: r.next_meeting_date?.slice(0,10), status: r.status });
    setShowForm(true);
  };

  const openCreateOfficer = () => { setEditing(null); setForm({ ...EMPTY_OFFICER }); setShowForm(true); };
  const openEditOfficer = (r: SafetyOfficer) => {
    setEditing(r);
    setForm({ officer_name: r.officer_name, appointment_date: r.appointment_date?.slice(0,10), certification_number: r.certification_number, certification_expiry: r.certification_expiry?.slice(0,10), phone: r.phone, email: r.email, department: r.department, notes: r.notes, is_active: r.is_active });
    setShowForm(true);
  };

  const saveMeeting = async () => {
    setSaving(true);
    try {
      const url = editing ? `${API}/hse-safety-committee-meetings/${editing.id}` : `${API}/hse-safety-committee-meetings`;
      await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowForm(false); load();
    } catch {}
    setSaving(false);
  };

  const saveOfficer = async () => {
    setSaving(true);
    try {
      const url = editing ? `${API}/hse-safety-officers/${editing.id}` : `${API}/hse-safety-officers`;
      await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowForm(false); load();
    } catch {}
    setSaving(false);
  };

  const stats = {
    meetings: meetings.length,
    upcomingMeetings: meetings.filter(m => m.status === "מתוכנן").length,
    activeOfficers: officers.filter(o => o.is_active).length,
    checklistCompliance: checklist.length > 0 ? Math.round((checklist.filter(c => c.status === "עמידה").length / checklist.length) * 100) : 0,
  };

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <Shield className="w-6 h-6 text-indigo-400" />
            ציות לרגולציה ישראלית — משרד העבודה
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ועדת בטיחות, ממונה בטיחות, סקר שנתי ורשימת תיוג לדרישות חוק</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={load} className="flex items-center gap-1 px-3 py-2 bg-card border border-border rounded-lg text-sm hover:bg-muted"><RefreshCw className="w-3.5 h-3.5" /></button>
          {tab === "meetings" && <button onClick={openCreateMeeting} className="flex items-center gap-2 bg-indigo-600 text-foreground px-4 py-2 rounded-xl hover:bg-indigo-700 text-sm font-medium"><Plus className="w-4 h-4" />תזמן ישיבה</button>}
          {tab === "officer" && <button onClick={openCreateOfficer} className="flex items-center gap-2 bg-indigo-600 text-foreground px-4 py-2 rounded-xl hover:bg-indigo-700 text-sm font-medium"><Plus className="w-4 h-4" />הוסף ממונה</button>}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card/50 border-border/50"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-foreground">{stats.meetings}</p><p className="text-xs text-muted-foreground mt-1">ישיבות ועדת בטיחות</p></CardContent></Card>
        <Card className="bg-card/50 border-border/50"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-blue-400">{stats.upcomingMeetings}</p><p className="text-xs text-muted-foreground mt-1">ישיבות מתוכננות</p></CardContent></Card>
        <Card className="bg-card/50 border-border/50"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-green-400">{stats.activeOfficers}</p><p className="text-xs text-muted-foreground mt-1">ממונה בטיחות פעיל</p></CardContent></Card>
        <Card className="bg-card/50 border-border/50"><CardContent className="p-4 text-center"><p className={`text-2xl font-bold ${stats.checklistCompliance >= 90 ? "text-green-400" : stats.checklistCompliance >= 70 ? "text-yellow-400" : "text-red-400"}`}>{stats.checklistCompliance}%</p><p className="text-xs text-muted-foreground mt-1">ציות לרשימת תיוג</p></CardContent></Card>
      </div>

      <div className="flex border-b border-border/50 gap-1">
        {([["meetings","ועדת בטיחות (ועדת בטיחות)"], ["officer","ממונה בטיחות"], ["checklist","רשימת תיוג רגולטורית"]] as [TabKey, string][]).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === k ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{l}</button>
        ))}
      </div>

      {tab === "meetings" && (
        <>
          <div className="flex gap-3 flex-wrap items-center">
            <div className="relative flex-1 min-w-0 max-w-md"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש ישיבות..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" /></div>
            <span className="text-sm text-muted-foreground">{filteredMeetings.length} ישיבות</span>
          </div>
          {loading ? <LoadingOverlay className="min-h-[100px]" /> : filteredMeetings.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground"><Users className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-medium">אין ישיבות ועדת בטיחות</p><p className="text-sm mt-1">לחץ "תזמן ישיבה" להתחיל</p></div>
          ) : (
            <>
              <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><div className="overflow-x-auto">
                <table className="w-full text-sm"><thead className="bg-muted/30 border-b border-border/50"><tr>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">תאריך</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">סוג ישיבה</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">יו"ר</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">סדר יום</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">ישיבה הבאה</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">סטטוס</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
                </tr></thead><tbody>
                  {pagination.paginate(filteredMeetings).map(r => (
                    <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 text-xs font-medium text-foreground">{r.meeting_date?.slice(0,10)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.meeting_type}</td>
                      <td className="px-4 py-3">{r.chairperson || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground max-w-[200px] truncate">{r.agenda || "—"}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{r.next_meeting_date?.slice(0,10) || "—"}</td>
                      <td className="px-4 py-3"><Badge className={`text-[10px] ${SC_STATUS[r.status] || ""}`}>{r.status}</Badge></td>
                      <td className="px-4 py-3"><div className="flex gap-1">
                        <button onClick={() => setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                        <button onClick={() => openEditMeeting(r)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                        <button onClick={async () => { if (await globalConfirm("למחוק ישיבה?")) { await authFetch(`${API}/hse-safety-committee-meetings/${r.id}`, { method: "DELETE" }); load(); } }} className="p-1.5 hover:bg-muted rounded-lg"><AlertCircle className="w-3.5 h-3.5 text-red-400" /></button>
                      </div></td>
                    </tr>
                  ))}
                </tbody></table>
              </div></div>
              <SmartPagination pagination={pagination} />
            </>
          )}
        </>
      )}

      {tab === "officer" && (
        <>
          {officers.length === 0 && !loading ? (
            <div className="text-center py-16 text-muted-foreground"><Shield className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-medium">לא מוגדר ממונה בטיחות</p><p className="text-sm mt-1">לחץ "הוסף ממונה" לרישום</p></div>
          ) : (
            <div className="grid gap-4">
              {officers.map(o => (
                <Card key={o.id} className="bg-card/50 border-border/50">
                  <CardContent className="p-5">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center"><Shield className="w-5 h-5 text-indigo-400" /></div>
                        <div>
                          <h3 className="font-bold text-foreground">{o.officer_name}</h3>
                          <p className="text-sm text-muted-foreground">{o.department}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Badge className={o.is_active ? "bg-green-500/20 text-green-300" : "bg-gray-500/20 text-gray-300"}>{o.is_active ? "פעיל" : "לא פעיל"}</Badge>
                        <button onClick={() => openEditOfficer(o)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                        <button onClick={async () => { if (await globalConfirm("למחוק ממונה?")) { await authFetch(`${API}/hse-safety-officers/${o.id}`, { method: "DELETE" }); load(); } }} className="p-1.5 hover:bg-muted rounded-lg"><AlertCircle className="w-3.5 h-3.5 text-red-400" /></button>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div><p className="text-xs text-muted-foreground">מספר תעודה</p><p className="font-medium">{o.certification_number || "—"}</p></div>
                      <div><p className="text-xs text-muted-foreground">תוקף תעודה</p><p className={`font-medium ${o.certification_expiry && new Date(o.certification_expiry) < new Date() ? "text-red-400" : "text-foreground"}`}>{o.certification_expiry?.slice(0,10) || "—"}</p></div>
                      <div><p className="text-xs text-muted-foreground">טלפון</p><p className="font-medium">{o.phone || "—"}</p></div>
                      <div><p className="text-xs text-muted-foreground">תאריך מינוי</p><p className="font-medium">{o.appointment_date?.slice(0,10) || "—"}</p></div>
                    </div>
                    {o.notes && <p className="mt-3 text-sm text-muted-foreground border-t border-border/30 pt-3">{o.notes}</p>}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "checklist" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">רשימת דרישות חוק ורגולציה ישראלית לבטיחות במפעל</p>
          <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><div className="overflow-x-auto">
            <table className="w-full text-sm"><thead className="bg-muted/30 border-b border-border/50"><tr>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">דרישה</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">הפניה לחוק</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">תדירות</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">בוצע לאחרונה</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">אחראי</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">סטטוס</th>
            </tr></thead><tbody>
              {checklist.map((c, i) => (
                <tr key={c.id || i} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{c.requirement}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{c.law_reference || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.frequency}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{c.last_done?.slice(0,10) || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.responsible || "—"}</td>
                  <td className="px-4 py-3"><Badge className={`text-[10px] ${SC_STATUS[c.status] || ""}`}>{c.status}</Badge></td>
                </tr>
              ))}
            </tbody></table>
          </div></div>
        </div>
      )}

      {viewDetail && tab === "meetings" && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setViewDetail(null)}>
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground flex items-center gap-2"><Users className="w-5 h-5 text-indigo-400" />ישיבת ועדת בטיחות</h2><button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
            <div className="p-5 space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                {[["תאריך", viewDetail.meeting_date?.slice(0,10)], ["סוג", viewDetail.meeting_type], ["יו\"ר", viewDetail.chairperson], ["סטטוס", viewDetail.status], ["ישיבה הבאה", viewDetail.next_meeting_date?.slice(0,10)]].map(([l,v]) => (
                  <div key={l}><p className="text-xs text-muted-foreground mb-0.5">{l}</p><p className="font-medium text-foreground">{v || "—"}</p></div>
                ))}
              </div>
              {[["משתתפים", viewDetail.attendees], ["סדר יום", viewDetail.agenda], ["פרוטוקול", viewDetail.minutes_summary], ["פעולות נדרשות", viewDetail.action_items]].map(([l,v]) => (
                <div key={l}><p className="text-xs text-muted-foreground mb-0.5">{l}</p><p className="text-foreground whitespace-pre-wrap">{v || "—"}</p></div>
              ))}
            </div>
            <div className="p-5 border-t border-border flex justify-end gap-2">
              <button onClick={() => { setViewDetail(null); openEditMeeting(viewDetail); }} className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm hover:bg-blue-500/30"><Edit2 className="w-3.5 h-3.5 inline ml-1" />עריכה</button>
              <button onClick={() => setViewDetail(null)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">סגור</button>
            </div>
          </div>
        </div>
      )}

      {showForm && tab === "meetings" && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground">{editing ? "עריכת ישיבה" : "תזמון ישיבת ועדת בטיחות"}</h2><button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
            <div className="p-5 grid grid-cols-2 gap-4">
              <div><label className="block text-xs text-muted-foreground mb-1.5">תאריך ישיבה *</label><input type="date" value={form.meeting_date} onChange={e => setForm({...form, meeting_date: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div><label className="block text-xs text-muted-foreground mb-1.5">סוג ישיבה</label><select value={form.meeting_type} onChange={e => setForm({...form, meeting_type: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{MEETING_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
              <div><label className="block text-xs text-muted-foreground mb-1.5">יו"ר הוועדה</label><input value={form.chairperson} onChange={e => setForm({...form, chairperson: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div><label className="block text-xs text-muted-foreground mb-1.5">תאריך ישיבה הבאה</label><input type="date" value={form.next_meeting_date} onChange={e => setForm({...form, next_meeting_date: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div><label className="block text-xs text-muted-foreground mb-1.5">סטטוס</label><select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">{MEETING_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
              <div className="col-span-2"><label className="block text-xs text-muted-foreground mb-1.5">משתתפים</label><input value={form.attendees} onChange={e => setForm({...form, attendees: e.target.value})} placeholder="שמות המשתתפים מופרדים בפסיק" className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div className="col-span-2"><label className="block text-xs text-muted-foreground mb-1.5">סדר יום</label><textarea value={form.agenda} onChange={e => setForm({...form, agenda: e.target.value})} rows={3} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div className="col-span-2"><label className="block text-xs text-muted-foreground mb-1.5">פרוטוקול / סיכום</label><textarea value={form.minutes_summary} onChange={e => setForm({...form, minutes_summary: e.target.value})} rows={3} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div className="col-span-2"><label className="block text-xs text-muted-foreground mb-1.5">פעולות נדרשות (action items)</label><textarea value={form.action_items} onChange={e => setForm({...form, action_items: e.target.value})} rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
            </div>
            <div className="p-5 border-t border-border flex justify-end gap-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
              <button onClick={saveMeeting} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-foreground rounded-lg text-sm hover:bg-indigo-700">
                {saving ? "שומר..." : <><Save className="w-3.5 h-3.5" />שמור</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {showForm && tab === "officer" && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground">{editing ? "עריכת ממונה בטיחות" : "רישום ממונה בטיחות"}</h2><button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
            <div className="p-5 grid grid-cols-2 gap-4">
              <div className="col-span-2"><label className="block text-xs text-muted-foreground mb-1.5">שם הממונה *</label><input value={form.officer_name} onChange={e => setForm({...form, officer_name: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div><label className="block text-xs text-muted-foreground mb-1.5">תאריך מינוי</label><input type="date" value={form.appointment_date} onChange={e => setForm({...form, appointment_date: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div><label className="block text-xs text-muted-foreground mb-1.5">מחלקה</label><input value={form.department} onChange={e => setForm({...form, department: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div><label className="block text-xs text-muted-foreground mb-1.5">מספר תעודת ממונה</label><input value={form.certification_number} onChange={e => setForm({...form, certification_number: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div><label className="block text-xs text-muted-foreground mb-1.5">תוקף תעודה</label><input type="date" value={form.certification_expiry} onChange={e => setForm({...form, certification_expiry: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div><label className="block text-xs text-muted-foreground mb-1.5">טלפון</label><input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div><label className="block text-xs text-muted-foreground mb-1.5">אימייל</label><input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
              <div className="col-span-2 flex items-center gap-2">
                <input type="checkbox" id="is_active" checked={form.is_active} onChange={e => setForm({...form, is_active: e.target.checked})} className="w-4 h-4" />
                <label htmlFor="is_active" className="text-sm text-muted-foreground">ממונה פעיל</label>
              </div>
              <div className="col-span-2"><label className="block text-xs text-muted-foreground mb-1.5">הערות</label><textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" /></div>
            </div>
            <div className="p-5 border-t border-border flex justify-end gap-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
              <button onClick={saveOfficer} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-foreground rounded-lg text-sm hover:bg-indigo-700">
                {saving ? "שומר..." : <><Save className="w-3.5 h-3.5" />שמור</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
