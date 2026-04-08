import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import AttachmentsSection from "@/components/attachments-section";
import {
  CalendarDays, ChevronLeft, ChevronRight, Plus, Search,
  Filter, Eye, Edit2, Send, Mail, MessageSquare, Phone,
  MapPin, Video, Clock, Users, X, Loader2, Check, AlertCircle,
  History
} from "lucide-react";

const API = "/api";

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  planned: { label: "מתוכננת", color: "#3B82F6", bg: "bg-blue-500/10 text-blue-500" },
  confirmed: { label: "אושרה", color: "#8B5CF6", bg: "bg-purple-500/10 text-purple-500" },
  completed: { label: "בוצעה", color: "#22C55E", bg: "bg-green-500/10 text-green-500" },
  cancelled: { label: "בוטלה", color: "#EF4444", bg: "bg-red-500/10 text-red-500" },
  postponed: { label: "נדחתה", color: "#F59E0B", bg: "bg-amber-500/10 text-amber-500" },
};

const CATEGORY_MAP: Record<string, string> = {
  client: "פגישת לקוח",
  supplier: "פגישת ספק",
  team: "פגישת צוות",
  management: "פגישת הנהלה",
  other: "אחר",
};

const DAYS_HE = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const MONTHS_HE = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

interface MeetingRecord {
  id: number;
  entityId: number;
  data: Record<string, any>;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export default function MeetingsCalendarPage() {
  const { token } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar");
  const [calendarMode, setCalendarMode] = useState<"month" | "week">("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedMeeting, setSelectedMeeting] = useState<MeetingRecord | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [participantFilter, setParticipantFilter] = useState("");

  const { data: entityData } = useQuery({
    queryKey: ["meeting-entity"],
    queryFn: async () => {
      const res = await authFetch(`${API}/platform/entities/slug-map`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return null;
      const map = await res.json();
      return map["meeting"] ? { id: Number(map["meeting"]) } : null;
    },
  });

  const entityId = entityData?.id;

  const { data: recordsData, isLoading } = useQuery({
    queryKey: ["meeting-records", entityId, statusFilter, searchQuery],
    queryFn: async () => {
      if (!entityId) return { records: [], total: 0 };
      const params = new URLSearchParams({ limit: "500" });
      if (statusFilter) params.set("status", statusFilter);
      if (searchQuery) params.set("search", searchQuery);
      const res = await authFetch(`${API}/platform/entities/${entityId}/records?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return { records: [], total: 0 };
      return res.json();
    },
    enabled: !!entityId,
  });

  const allRecords: MeetingRecord[] = recordsData?.records || [];

  const records = useMemo(() => {
    let filtered = allRecords;
    if (dateFrom) {
      const from = new Date(dateFrom);
      filtered = filtered.filter((r) => {
        const dt = r.data?.start_datetime;
        return dt && new Date(dt) >= from;
      });
    }
    if (dateTo) {
      const to = new Date(dateTo + "T23:59:59");
      filtered = filtered.filter((r) => {
        const dt = r.data?.start_datetime;
        return dt && new Date(dt) <= to;
      });
    }
    if (participantFilter) {
      const q = participantFilter.toLowerCase();
      filtered = filtered.filter((r) => {
        const d = r.data || {};
        return (d.participants || "").toLowerCase().includes(q) ||
          (d.participant_email || "").toLowerCase().includes(q) ||
          (d.participant_phone || "").includes(q);
      });
    }
    return filtered;
  }, [allRecords, dateFrom, dateTo, participantFilter]);

  const sendWhatsApp = useMutation({
    mutationFn: async (recordId: number) => {
      const res = await authFetch(`${API}/platform/meetings/${recordId}/send-whatsapp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "נשלח!", description: "הזמנת WhatsApp נשלחה בהצלחה" });
      queryClient.invalidateQueries({ queryKey: ["meeting-records"] });
    },
    onError: (e: any) => {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    },
  });

  const sendEmail = useMutation({
    mutationFn: async (recordId: number) => {
      const res = await authFetch(`${API}/platform/meetings/${recordId}/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "נשלח!", description: "הזמנת מייל נשלחה בהצלחה" });
      queryClient.invalidateQueries({ queryKey: ["meeting-records"] });
    },
    onError: (e: any) => {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    },
  });

  const recordsByDate = useMemo(() => {
    const map: Record<string, MeetingRecord[]> = {};
    for (const rec of records) {
      const val = rec.data?.start_datetime;
      if (!val) continue;
      const d = new Date(val);
      if (isNaN(d.getTime())) continue;
      const key = formatKey(d);
      if (!map[key]) map[key] = [];
      map[key].push(rec);
    }
    return map;
  }, [records]);

  function formatKey(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  const today = formatKey(new Date());

  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDow = firstDay.getDay();
    const days: { date: Date; isCurrentMonth: boolean; key: string }[] = [];
    for (let i = startDow - 1; i >= 0; i--) {
      const d = new Date(year, month, -i);
      days.push({ date: d, isCurrentMonth: false, key: formatKey(d) });
    }
    for (let i = 1; i <= lastDay.getDate(); i++) {
      const d = new Date(year, month, i);
      days.push({ date: d, isCurrentMonth: true, key: formatKey(d) });
    }
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      days.push({ date: d, isCurrentMonth: false, key: formatKey(d) });
    }
    return days;
  }, [currentDate]);

  const weekDays = useMemo(() => {
    const start = new Date(currentDate);
    start.setDate(start.getDate() - start.getDay());
    const days: { date: Date; isCurrentMonth: boolean; key: string }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push({ date: d, isCurrentMonth: d.getMonth() === currentDate.getMonth(), key: formatKey(d) });
    }
    return days;
  }, [currentDate]);

  const navigate = (dir: number) => {
    setCurrentDate((prev) => {
      const d = new Date(prev);
      if (calendarMode === "month") d.setMonth(d.getMonth() + dir);
      else d.setDate(d.getDate() + dir * 7);
      return d;
    });
  };

  const displayDays = calendarMode === "month" ? calendarDays : weekDays;

  const sortedRecords = useMemo(() => {
    return [...records].sort((a, b) => {
      const aDate = a.data?.start_datetime ? new Date(a.data.start_datetime).getTime() : 0;
      const bDate = b.data?.start_datetime ? new Date(b.data.start_datetime).getTime() : 0;
      return aDate - bDate;
    });
  }, [records]);

  function formatDateTime(dt: string) {
    if (!dt) return "";
    const d = new Date(dt);
    return d.toLocaleString("he-IL", { dateStyle: "medium", timeStyle: "short" });
  }

  function formatTime(dt: string) {
    if (!dt) return "";
    const d = new Date(dt);
    return d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold flex items-center gap-2">
            <CalendarDays className="w-7 h-7 text-purple-500" />
            יומן פגישות
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול פגישות, תזכורות ושליחת הזמנות</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
            <button
              onClick={() => setViewMode("calendar")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === "calendar" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
            >
              <CalendarDays className="w-3.5 h-3.5 inline-block ml-1" />
              לוח שנה
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === "list" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
            >
              רשימה
            </button>
          </div>
          {entityId && (
            <a
              href={`${import.meta.env.BASE_URL}builder/data/${entityId}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" />
              פגישה חדשה
            </a>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-[300px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="חיפוש פגישות..."
            className="w-full pr-9 pl-3 py-2 bg-muted/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="">כל הסטטוסים</option>
          {Object.entries(STATUS_MAP).map(([key, val]) => (
            <option key={key} value={key}>{val.label}</option>
          ))}
        </select>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">מתאריך:</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-2 py-1.5 bg-muted/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <span className="text-xs text-muted-foreground">עד:</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-2 py-1.5 bg-muted/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div className="relative min-w-[160px]">
          <Users className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={participantFilter}
            onChange={(e) => setParticipantFilter(e.target.value)}
            placeholder="סנן לפי משתתף..."
            className="w-full pr-8 pl-3 py-2 bg-muted/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        {(dateFrom || dateTo || participantFilter || statusFilter) && (
          <button
            onClick={() => { setDateFrom(""); setDateTo(""); setParticipantFilter(""); setStatusFilter(""); }}
            className="px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
          >
            נקה סינון
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : viewMode === "calendar" ? (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-3">
              <button onClick={() => navigate(-1)} className="p-1.5 hover:bg-muted rounded-lg">
                <ChevronRight className="w-4 h-4" />
              </button>
              <h3 className="text-lg font-semibold min-w-[160px] text-center">
                {MONTHS_HE[currentDate.getMonth()]} {currentDate.getFullYear()}
              </h3>
              <button onClick={() => navigate(1)} className="p-1.5 hover:bg-muted rounded-lg">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCurrentDate(new Date())}
                className="px-2 py-1 text-xs bg-muted hover:bg-muted/80 rounded-md text-muted-foreground"
              >
                היום
              </button>
            </div>
            <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
              <button
                onClick={() => setCalendarMode("month")}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${calendarMode === "month" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
              >
                חודשי
              </button>
              <button
                onClick={() => setCalendarMode("week")}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${calendarMode === "week" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
              >
                שבועי
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7">
            {DAYS_HE.map((day) => (
              <div key={day} className="px-2 py-2 text-center text-xs font-medium text-muted-foreground border-b border-border bg-muted/30">
                {day}
              </div>
            ))}
          </div>

          <div className={`grid grid-cols-7 ${calendarMode === "week" ? "min-h-[300px]" : ""}`}>
            {displayDays.map((day) => {
              const dayRecords = recordsByDate[day.key] || [];
              const isToday = day.key === today;
              return (
                <div
                  key={day.key}
                  className={`border-b border-l border-border/50 p-1 transition-colors ${calendarMode === "month" ? "min-h-[100px]" : "min-h-[250px]"} ${!day.isCurrentMonth ? "bg-muted/10" : ""} ${isToday ? "bg-primary/5" : ""} hover:bg-muted/20`}
                >
                  <div className={`text-xs font-medium px-1 py-0.5 ${isToday ? "bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center" : !day.isCurrentMonth ? "text-muted-foreground/50" : "text-muted-foreground"}`}>
                    {day.date.getDate()}
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {dayRecords.slice(0, calendarMode === "month" ? 3 : 10).map((rec) => {
                      const status = STATUS_MAP[rec.status] || STATUS_MAP.planned;
                      return (
                        <div
                          key={rec.id}
                          onClick={() => setSelectedMeeting(rec)}
                          className="text-[10px] px-1.5 py-0.5 rounded cursor-pointer hover:opacity-80 truncate"
                          style={{ backgroundColor: `${status.color}20`, color: status.color, borderRight: `2px solid ${status.color}` }}
                        >
                          {rec.data?.start_datetime && (
                            <span className="font-medium">{formatTime(rec.data.start_datetime)} </span>
                          )}
                          {rec.data?.title || `#${rec.id}`}
                        </div>
                      );
                    })}
                    {dayRecords.length > (calendarMode === "month" ? 3 : 10) && (
                      <div className="text-[10px] text-muted-foreground px-1">
                        +{dayRecords.length - (calendarMode === "month" ? 3 : 10)} נוספים
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">כותרת</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">תאריך ושעה</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">משתתפים</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">מיקום</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">נושא</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">סטטוס</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {sortedRecords.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-muted-foreground">
                      <CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p>אין פגישות להצגה</p>
                      <p className="text-xs mt-1">לחץ "פגישה חדשה" כדי להוסיף</p>
                    </td>
                  </tr>
                ) : (
                  sortedRecords.map((rec) => {
                    const d = rec.data || {};
                    const status = STATUS_MAP[rec.status] || STATUS_MAP.planned;
                    return (
                      <tr
                        key={rec.id}
                        className="border-b border-border/50 hover:bg-muted/20 cursor-pointer transition-colors"
                        onClick={() => setSelectedMeeting(rec)}
                      >
                        <td className="px-4 py-3 font-medium">{d.title || `#${rec.id}`}</td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDateTime(d.start_datetime)}</td>
                        <td className="px-4 py-3 text-muted-foreground max-w-[150px] truncate">{d.participants || "-"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{d.location || "-"}</td>
                        <td className="px-4 py-3 text-muted-foreground max-w-[150px] truncate">{d.subject || "-"}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${status.bg}`}>
                            {status.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            {d.participant_phone && (
                              <button
                                onClick={() => sendWhatsApp.mutate(rec.id)}
                                disabled={sendWhatsApp.isPending}
                                className="p-1.5 hover:bg-green-500/10 rounded-lg text-green-500 transition-colors"
                                title="שלח הזמנה בוואטסאפ"
                              >
                                <MessageSquare className="w-4 h-4" />
                              </button>
                            )}
                            {d.participant_email && (
                              <button
                                onClick={() => sendEmail.mutate(rec.id)}
                                disabled={sendEmail.isPending}
                                className="p-1.5 hover:bg-blue-500/10 rounded-lg text-blue-500 transition-colors"
                                title="שלח הזמנה במייל"
                              >
                                <Mail className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedMeeting && (
        <MeetingDetailPanel
          meeting={selectedMeeting}
          onClose={() => setSelectedMeeting(null)}
          onSendWhatsApp={() => sendWhatsApp.mutate(selectedMeeting.id)}
          onSendEmail={() => sendEmail.mutate(selectedMeeting.id)}
          isSendingWhatsApp={sendWhatsApp.isPending}
          isSendingEmail={sendEmail.isPending}
          entityId={entityId}
        />
      )}
    </div>
  );
}

function MeetingDetailPanel({
  meeting,
  onClose,
  onSendWhatsApp,
  onSendEmail,
  isSendingWhatsApp,
  isSendingEmail,
  entityId,
}: {
  meeting: MeetingRecord;
  onClose: () => void;
  onSendWhatsApp: () => void;
  onSendEmail: () => void;
  isSendingWhatsApp: boolean;
  isSendingEmail: boolean;
  entityId?: number;
}) {
  const { token } = useAuth();
  const [showHistory, setShowHistory] = useState(false);
  const d = meeting.data || {};
  const status = STATUS_MAP[meeting.status] || STATUS_MAP.planned;

  const { data: auditLogs, isLoading: auditLoading } = useQuery({
    queryKey: ["meeting-audit", meeting.id],
    queryFn: async () => {
      const res = await authFetch(`${API}/platform/records/${meeting.id}/audit`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: showHistory,
  });

  const startDate = d.start_datetime
    ? new Date(d.start_datetime).toLocaleString("he-IL", { dateStyle: "full", timeStyle: "short" })
    : "לא צוין";
  const endDate = d.end_datetime
    ? new Date(d.end_datetime).toLocaleString("he-IL", { dateStyle: "full", timeStyle: "short" })
    : "";

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-500/10 rounded-xl flex items-center justify-center">
              <CalendarDays className="w-5 h-5 text-purple-500" />
            </div>
            <div>
              <h2 className="font-bold text-lg">{d.title || "פגישה"}</h2>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${status.bg}`}>
                {status.label}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-muted rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 gap-4">
            <DetailRow icon={<Clock className="w-4 h-4 text-blue-500" />} label="תאריך ושעה" value={startDate} />
            {endDate && <DetailRow icon={<Clock className="w-4 h-4 text-muted-foreground" />} label="סיום" value={endDate} />}
            {d.location && <DetailRow icon={<MapPin className="w-4 h-4 text-red-500" />} label="מיקום" value={d.location} />}
            {d.video_link && (
              <DetailRow
                icon={<Video className="w-4 h-4 text-purple-500" />}
                label="קישור וידאו"
                value={
                  <a href={d.video_link} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate block">
                    {d.video_link}
                  </a>
                }
              />
            )}
            {d.participants && <DetailRow icon={<Users className="w-4 h-4 text-emerald-500" />} label="משתתפים" value={d.participants} />}
            {d.participant_phone && <DetailRow icon={<Phone className="w-4 h-4 text-green-500" />} label="טלפון" value={d.participant_phone} />}
            {d.participant_email && <DetailRow icon={<Mail className="w-4 h-4 text-blue-500" />} label="אימייל" value={d.participant_email} />}
            {d.subject && <DetailRow icon={<AlertCircle className="w-4 h-4 text-amber-500" />} label="נושא" value={d.subject} />}
            {d.meeting_category && (
              <DetailRow icon={<Filter className="w-4 h-4 text-muted-foreground" />} label="קטגוריה" value={CATEGORY_MAP[d.meeting_category] || d.meeting_category} />
            )}
          </div>

          {d.description && (
            <div className="bg-muted/30 rounded-xl p-4">
              <p className="text-xs font-medium text-muted-foreground mb-1">תיאור</p>
              <p className="text-sm whitespace-pre-wrap">{d.description}</p>
            </div>
          )}

          {d.notes && (
            <div className="bg-muted/30 rounded-xl p-4">
              <p className="text-xs font-medium text-muted-foreground mb-1">הערות</p>
              <p className="text-sm whitespace-pre-wrap">{d.notes}</p>
            </div>
          )}

          <div className="flex flex-col gap-2 pt-2 border-t border-border">
            <p className="text-xs font-medium text-muted-foreground">שליחת הזמנות</p>
            <div className="flex flex-wrap gap-2">
              {d.participant_phone && (
                <button
                  onClick={onSendWhatsApp}
                  disabled={isSendingWhatsApp}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-foreground rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {isSendingWhatsApp ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                  שלח הזמנה בוואטסאפ
                </button>
              )}
              {d.participant_email && (
                <button
                  onClick={onSendEmail}
                  disabled={isSendingEmail}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-foreground rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {isSendingEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                  שלח הזמנה במייל
                </button>
              )}
            </div>
            {d.whatsapp_sent === "yes" && (
              <p className="text-xs text-green-500 flex items-center gap-1">
                <Check className="w-3 h-3" /> הזמנת WhatsApp נשלחה
              </p>
            )}
            {d.email_sent === "yes" && (
              <p className="text-xs text-blue-500 flex items-center gap-1">
                <Check className="w-3 h-3" /> הזמנת מייל נשלחה
              </p>
            )}
          </div>

          <div className="pt-2 border-t border-border">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <History className="w-3.5 h-3.5" />
              {showHistory ? "הסתר היסטוריית שינויים" : "הצג היסטוריית שינויים"}
            </button>
            {showHistory && (
              <div className="mt-3 space-y-2">
                {auditLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  </div>
                ) : !auditLogs || auditLogs.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">אין היסטוריית שינויים</p>
                ) : (
                  <div className="max-h-[200px] overflow-y-auto space-y-2">
                    {(auditLogs as any[]).map((log: any) => (
                      <div key={log.id} className="bg-muted/30 rounded-lg p-2.5">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium">
                            {log.action === "create" ? "נוצר" :
                             log.action === "update" ? "עודכן" :
                             log.action === "status_change" ? "שינוי סטטוס" :
                             log.action === "delete" ? "נמחק" : log.action}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(log.createdAt).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" })}
                          </span>
                        </div>
                        {log.performedBy && (
                          <p className="text-[10px] text-muted-foreground">ע"י: {log.performedBy}</p>
                        )}
                        {log.changes && typeof log.changes === "object" && (
                          <div className="mt-1 space-y-0.5">
                            {Object.entries(log.changes as Record<string, any>).slice(0, 5).map(([field, change]: [string, any]) => (
                              <div key={field} className="text-[10px]">
                                <span className="text-muted-foreground">{field}: </span>
                                {change?.old !== undefined && (
                                  <span className="text-red-400 line-through ml-1">{String(change.old).substring(0, 30)}</span>
                                )}
                                {change?.new !== undefined && (
                                  <span className="text-green-500 mr-1"> {String(change.new).substring(0, 30)}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {entityId && (
            <div className="pt-2 border-t border-border">
              <a
                href={`${import.meta.env.BASE_URL}builder/data/${entityId}?record=${meeting.id}`}
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                <Edit2 className="w-3.5 h-3.5" />
                עריכה מלאה בבונה המערכת
              </a>
            </div>
          )}

          <div className="pt-3 border-t border-border space-y-3">
            <AttachmentsSection entityType="meetings" entityId={meeting.id} compact />
            <ActivityLog entityType="meetings" entityId={meeting.id} compact />
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}
