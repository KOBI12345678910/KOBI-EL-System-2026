import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import AttachmentsSection from "@/components/attachments-section";
import {
  CalendarDays, ChevronLeft, ChevronRight, Plus, Clock, MapPin,
  X, Check, Trash2, Edit2, Users, Eye, CheckCircle2, Circle,
  Calendar as CalendarIcon, List, LayoutGrid, AlertCircle
} from "lucide-react";
import { globalConfirm } from "@/components/confirm-dialog";

const API = "/api";

const EVENT_TYPES: Record<string, { label: string; icon: string; defaultColor: string }> = {
  meeting: { label: "פגישה", icon: "👥", defaultColor: "#3B82F6" },
  task: { label: "משימה", icon: "✅", defaultColor: "#22C55E" },
  call: { label: "שיחה", icon: "📞", defaultColor: "#8B5CF6" },
  deadline: { label: "דדליין", icon: "⏰", defaultColor: "#EF4444" },
  reminder: { label: "תזכורת", icon: "🔔", defaultColor: "#F59E0B" },
  personal: { label: "אישי", icon: "👤", defaultColor: "#06B6D4" },
  site_visit: { label: "ביקור באתר", icon: "🏗️", defaultColor: "#F97316" },
  installation: { label: "התקנה", icon: "🔧", defaultColor: "#10B981" },
  measurement: { label: "מדידה", icon: "📐", defaultColor: "#6366F1" },
};

const PRIORITY_MAP: Record<string, { label: string; color: string }> = {
  low: { label: "נמוכה", color: "#94A3B8" },
  normal: { label: "רגילה", color: "#3B82F6" },
  high: { label: "גבוהה", color: "#F59E0B" },
  urgent: { label: "דחופה", color: "#EF4444" },
};

const COLORS = ["#3B82F6", "#22C55E", "#EF4444", "#F59E0B", "#8B5CF6", "#06B6D4", "#F97316", "#EC4899", "#10B981", "#6366F1"];

const DAYS_HE = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
const DAYS_FULL_HE = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const MONTHS_HE = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

interface CalendarEvent {
  id: number;
  userId: number;
  title: string;
  description: string | null;
  eventType: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  location: string | null;
  color: string;
  isAllDay: boolean;
  isCompleted: boolean;
  priority: string;
  reminderMinutes: number | null;
  googleEventId: string | null;
  relatedEntityType: string | null;
  relatedEntityId: number | null;
  relatedEntityName: string | null;
  createdAt: string;
  updatedAt: string;
}

interface UserRecord {
  id: number;
  username: string;
  fullName: string;
  fullNameHe?: string;
  isSuperAdmin: boolean;
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

export default function UserCalendarPage() {
  const { token, user: currentUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<"month" | "week" | "day" | "list">("month");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [viewingUserId, setViewingUserId] = useState<string>("me");

  const isAdmin = !!(currentUser as any)?.isSuperAdmin;

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const dateRange = useMemo(() => {
    if (viewMode === "month") {
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      const startOffset = firstDay.getDay();
      const from = new Date(year, month, 1 - startOffset);
      const to = new Date(year, month + 1, 6 - lastDay.getDay());
      return { from: formatDate(from), to: formatDate(to) };
    } else if (viewMode === "week") {
      const day = currentDate.getDay();
      const startOfWeek = new Date(currentDate);
      startOfWeek.setDate(currentDate.getDate() - day);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      return { from: formatDate(startOfWeek), to: formatDate(endOfWeek) };
    } else if (viewMode === "day") {
      return { from: formatDate(currentDate), to: formatDate(currentDate) };
    } else {
      const from = new Date(year, month, 1);
      const to = new Date(year, month + 1, 0);
      return { from: formatDate(from), to: formatDate(to) };
    }
  }, [year, month, viewMode, currentDate]);

  const { data: events = [], isLoading } = useQuery<CalendarEvent[]>({
    queryKey: ["calendar-events", dateRange.from, dateRange.to, viewingUserId],
    queryFn: async () => {
      const params = new URLSearchParams({ from: dateRange.from, to: dateRange.to });
      if (viewingUserId === "all") params.set("userId", "all");
      else if (viewingUserId !== "me") params.set("userId", viewingUserId);
      const res = await authFetch(`${API}/calendar/events?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!token,
  });

  const { data: allUsers = [] } = useQuery<UserRecord[]>({
    queryKey: ["all-users-for-calendar"],
    queryFn: async () => {
      const res = await authFetch(`${API}/auth/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : (data?.users || []);
    },
    enabled: !!token && isAdmin,
  });

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const url = editingEvent ? `${API}/calendar/events/${editingEvent.id}` : `${API}/calendar/events`;
      const method = editingEvent ? "PUT" : "POST";
      const res = await authFetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "שגיאה");
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      toast({ title: editingEvent ? "אירוע עודכן" : "אירוע נוצר", description: "בהצלחה" });
      setShowCreateModal(false);
      setEditingEvent(null);
    },
    onError: (err: Error) => {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await authFetch(`${API}/calendar/events/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("שגיאה במחיקה");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      toast({ title: "אירוע נמחק" });
    },
  });

  const toggleCompleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await authFetch(`${API}/calendar/events/${id}/complete`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("שגיאה");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
    },
  });

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const ev of events) {
      const d = ev.eventDate?.split("T")[0] || ev.eventDate;
      if (!map[d]) map[d] = [];
      map[d].push(ev);
    }
    for (const k in map) {
      map[k].sort((a, b) => a.startTime.localeCompare(b.startTime));
    }
    return map;
  }, [events]);

  function navigate(dir: number) {
    const d = new Date(currentDate);
    if (viewMode === "month") d.setMonth(d.getMonth() + dir);
    else if (viewMode === "week") d.setDate(d.getDate() + dir * 7);
    else d.setDate(d.getDate() + dir);
    setCurrentDate(d);
  }

  function goToToday() {
    setCurrentDate(new Date());
  }

  function openCreate(date?: string) {
    setEditingEvent(null);
    setSelectedDate(date || formatDate(new Date()));
    setShowCreateModal(true);
  }

  function openEdit(ev: CalendarEvent) {
    setEditingEvent(ev);
    setSelectedDate(ev.eventDate?.split("T")[0] || ev.eventDate);
    setShowCreateModal(true);
  }

  const today = formatDate(new Date());

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto" dir="rtl">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold flex items-center gap-2">
            <CalendarDays className="w-7 h-7 text-blue-500" />
            היומן שלי
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול פגישות, משימות ואירועים</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && (
            <select
              value={viewingUserId}
              onChange={(e) => setViewingUserId(e.target.value)}
              className="text-sm border rounded-lg px-3 py-2 bg-background"
            >
              <option value="me">היומן שלי</option>
              <option value="all">כל המשתמשים</option>
              {allUsers.map(u => (
                <option key={u.id} value={String(u.id)}>
                  {u.fullName || u.username}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() => openCreate()}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-foreground rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            אירוע חדש
          </button>
        </div>
      </div>

      <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
        <div className="flex items-center justify-between p-4 border-b bg-muted/30">
          <div className="flex items-center gap-2">
            <button onClick={() => navigate(-1)} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
              <ChevronRight className="w-5 h-5" />
            </button>
            <button onClick={goToToday} className="px-3 py-1 text-sm font-medium hover:bg-muted rounded-lg transition-colors">
              היום
            </button>
            <button onClick={() => navigate(1)} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-semibold mr-2">
              {viewMode === "day"
                ? `${DAYS_FULL_HE[currentDate.getDay()]} ${currentDate.getDate()} ${MONTHS_HE[month]} ${year}`
                : `${MONTHS_HE[month]} ${year}`
              }
            </h2>
          </div>
          <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
            {[
              { mode: "month" as const, label: "חודש", icon: LayoutGrid },
              { mode: "week" as const, label: "שבוע", icon: CalendarIcon },
              { mode: "day" as const, label: "יום", icon: Clock },
              { mode: "list" as const, label: "רשימה", icon: List },
            ].map(({ mode, label, icon: Icon }) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${viewMode === mode ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {viewMode === "month" && (
          <MonthView
            year={year}
            month={month}
            today={today}
            eventsByDate={eventsByDate}
            onDateClick={(d) => openCreate(d)}
            onEventClick={openEdit}
            viewingUserId={viewingUserId}
            allUsers={allUsers}
          />
        )}

        {viewMode === "week" && (
          <WeekView
            currentDate={currentDate}
            today={today}
            eventsByDate={eventsByDate}
            onDateClick={(d) => openCreate(d)}
            onEventClick={openEdit}
            onToggleComplete={(id) => toggleCompleteMutation.mutate(id)}
          />
        )}

        {viewMode === "day" && (
          <DayView
            currentDate={currentDate}
            today={today}
            events={eventsByDate[formatDate(currentDate)] || []}
            onEventClick={openEdit}
            onToggleComplete={(id) => toggleCompleteMutation.mutate(id)}
            onDelete={async (id) => { if (await globalConfirm("למחוק אירוע זה?")) deleteMutation.mutate(id); }}
          />
        )}

        {viewMode === "list" && (
          <ListView
            events={events}
            onEventClick={openEdit}
            onToggleComplete={(id) => toggleCompleteMutation.mutate(id)}
            onDelete={async (id) => { if (await globalConfirm("למחוק אירוע זה?")) deleteMutation.mutate(id); }}
            viewingUserId={viewingUserId}
            allUsers={allUsers}
          />
        )}
      </div>

      {showCreateModal && (
        <EventFormModal
          event={editingEvent}
          defaultDate={selectedDate || formatDate(new Date())}
          onSave={(data) => createMutation.mutate(data)}
          onClose={() => { setShowCreateModal(false); setEditingEvent(null); }}
          onDelete={editingEvent ? async () => { if (await globalConfirm("למחוק אירוע זה?")) { deleteMutation.mutate(editingEvent.id); setShowCreateModal(false); setEditingEvent(null); } } : undefined}
          saving={createMutation.isPending}
        />
      )}
    </div>
  );
}

function MonthView({ year, month, today, eventsByDate, onDateClick, onEventClick, viewingUserId, allUsers }: any) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const prevMonthDays = getDaysInMonth(year, month - 1);

  const cells: { date: string; day: number; isCurrentMonth: boolean }[] = [];

  for (let i = firstDay - 1; i >= 0; i--) {
    const d = prevMonthDays - i;
    const dateStr = formatDate(new Date(year, month - 1, d));
    cells.push({ date: dateStr, day: d, isCurrentMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = formatDate(new Date(year, month, d));
    cells.push({ date: dateStr, day: d, isCurrentMonth: true });
  }
  const remaining = 7 - (cells.length % 7);
  if (remaining < 7) {
    for (let d = 1; d <= remaining; d++) {
      const dateStr = formatDate(new Date(year, month + 1, d));
      cells.push({ date: dateStr, day: d, isCurrentMonth: false });
    }
  }

  return (
    <div>
      <div className="grid grid-cols-7 border-b">
        {DAYS_HE.map(d => (
          <div key={d} className="p-2 text-center text-xs font-semibold text-muted-foreground border-l last:border-l-0">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((cell, i) => {
          const dayEvents = eventsByDate[cell.date] || [];
          const isToday = cell.date === today;
          return (
            <div
              key={i}
              className={`min-h-[100px] border-b border-l last:border-l-0 p-1 cursor-pointer hover:bg-muted/30 transition-colors ${
                !cell.isCurrentMonth ? "bg-muted/10 text-muted-foreground" : ""
              }`}
              onClick={() => onDateClick(cell.date)}
            >
              <div className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                isToday ? "bg-blue-600 text-foreground" : ""
              }`}>
                {cell.day}
              </div>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map((ev: CalendarEvent) => (
                  <div
                    key={ev.id}
                    onClick={(e) => { e.stopPropagation(); onEventClick(ev); }}
                    className={`text-[10px] leading-tight px-1.5 py-0.5 rounded truncate cursor-pointer hover:opacity-80 transition-opacity ${ev.isCompleted ? "line-through opacity-60" : ""}`}
                    style={{ backgroundColor: `${ev.color || "#3B82F6"}20`, color: ev.color || "#3B82F6", borderRight: `3px solid ${ev.color || "#3B82F6"}` }}
                  >
                    {ev.startTime?.substring(0, 5)} {ev.title}
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-[10px] text-muted-foreground pr-1">
                    +{dayEvents.length - 3} נוספים
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekView({ currentDate, today, eventsByDate, onDateClick, onEventClick, onToggleComplete }: any) {
  const day = currentDate.getDay();
  const startOfWeek = new Date(currentDate);
  startOfWeek.setDate(currentDate.getDate() - day);

  const weekDays: { date: string; dayName: string; dayNum: number; monthName: string }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    weekDays.push({
      date: formatDate(d),
      dayName: DAYS_FULL_HE[d.getDay()],
      dayNum: d.getDate(),
      monthName: MONTHS_HE[d.getMonth()],
    });
  }

  const hours = Array.from({ length: 14 }, (_, i) => i + 7);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[700px]">
        <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b sticky top-0 bg-card z-10">
          <div className="p-2 border-l" />
          {weekDays.map(wd => (
            <div key={wd.date} className={`p-2 text-center border-l last:border-l-0 ${wd.date === today ? "bg-blue-50 dark:bg-blue-950/30" : ""}`}>
              <div className="text-xs text-muted-foreground">{wd.dayName}</div>
              <div className={`text-lg font-bold ${wd.date === today ? "text-blue-600" : ""}`}>{wd.dayNum}</div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-[60px_repeat(7,1fr)]">
          {hours.map(hour => (
            <div key={hour} className="contents">
              <div className="p-1 text-[10px] text-muted-foreground text-center border-b border-l h-16 flex items-start justify-center pt-1">
                {String(hour).padStart(2, "0")}:00
              </div>
              {weekDays.map(wd => {
                const dayEvents = (eventsByDate[wd.date] || []).filter((ev: CalendarEvent) => {
                  const h = parseInt(ev.startTime?.substring(0, 2) || "0");
                  return h === hour;
                });
                return (
                  <div
                    key={wd.date + hour}
                    className={`border-b border-l last:border-l-0 h-16 p-0.5 cursor-pointer hover:bg-muted/20 ${wd.date === today ? "bg-blue-50/50 dark:bg-blue-950/10" : ""}`}
                    onClick={() => onDateClick(wd.date)}
                  >
                    {dayEvents.map((ev: CalendarEvent) => (
                      <div
                        key={ev.id}
                        onClick={(e) => { e.stopPropagation(); onEventClick(ev); }}
                        className={`text-[10px] px-1 py-0.5 rounded mb-0.5 truncate cursor-pointer hover:opacity-80 ${ev.isCompleted ? "line-through opacity-60" : ""}`}
                        style={{ backgroundColor: `${ev.color}25`, color: ev.color, borderRight: `2px solid ${ev.color}` }}
                      >
                        {ev.title}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DayView({ currentDate, today, events, onEventClick, onToggleComplete, onDelete }: any) {
  const hours = Array.from({ length: 16 }, (_, i) => i + 6);
  const dateStr = formatDate(currentDate);

  return (
    <div className="p-4">
      {events.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>אין אירועים ביום זה</p>
        </div>
      )}
      <div className="space-y-2">
        {hours.map(hour => {
          const hourEvents = events.filter((ev: CalendarEvent) => {
            const h = parseInt(ev.startTime?.substring(0, 2) || "0");
            return h === hour;
          });
          return (
            <div key={hour} className="flex gap-3">
              <div className="w-14 text-sm text-muted-foreground text-left pt-1 shrink-0">
                {String(hour).padStart(2, "0")}:00
              </div>
              <div className="flex-1 min-h-[48px] border-t border-dashed pt-1">
                {hourEvents.map((ev: CalendarEvent) => (
                  <div
                    key={ev.id}
                    className={`mb-1 p-3 rounded-lg cursor-pointer hover:shadow-md transition-shadow ${ev.isCompleted ? "opacity-60" : ""}`}
                    style={{ backgroundColor: `${ev.color}15`, borderRight: `4px solid ${ev.color}` }}
                    onClick={() => onEventClick(ev)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button onClick={(e) => { e.stopPropagation(); onToggleComplete(ev.id); }} className="shrink-0">
                          {ev.isCompleted ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Circle className="w-4 h-4 text-muted-foreground" />}
                        </button>
                        <span className={`font-medium text-sm ${ev.isCompleted ? "line-through" : ""}`}>{ev.title}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${ev.color}20`, color: ev.color }}>
                          {EVENT_TYPES[ev.eventType]?.icon} {EVENT_TYPES[ev.eventType]?.label || ev.eventType}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">{ev.startTime?.substring(0, 5)} - {ev.endTime?.substring(0, 5)}</span>
                        <button onClick={(e) => { e.stopPropagation(); onDelete(ev.id); }} className="p-1 hover:bg-red-500/10 rounded">
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      </div>
                    </div>
                    {ev.location && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                        <MapPin className="w-3 h-3" />
                        {ev.location}
                      </div>
                    )}
                    {ev.description && (
                      <p className="text-xs text-muted-foreground mt-1">{ev.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ListView({ events, onEventClick, onToggleComplete, onDelete, viewingUserId, allUsers }: any) {
  const grouped: Record<string, CalendarEvent[]> = {};
  for (const ev of events) {
    const d = ev.eventDate?.split("T")[0] || ev.eventDate;
    if (!grouped[d]) grouped[d] = [];
    grouped[d].push(ev);
  }
  const sortedDates = Object.keys(grouped).sort();

  return (
    <div className="p-4 space-y-4">
      {sortedDates.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <List className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>אין אירועים בתקופה זו</p>
        </div>
      )}
      {sortedDates.map(date => {
        const d = new Date(date + "T00:00:00");
        return (
          <div key={date}>
            <h3 className="text-sm font-semibold mb-2 text-muted-foreground">
              {DAYS_FULL_HE[d.getDay()]} {d.getDate()} {MONTHS_HE[d.getMonth()]} {d.getFullYear()}
            </h3>
            <div className="space-y-1">
              {grouped[date].map(ev => {
                const ownerUser = viewingUserId === "all" ? allUsers.find((u: any) => u.id === ev.userId) : null;
                return (
                  <div
                    key={ev.id}
                    className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer hover:shadow-sm transition-shadow border ${ev.isCompleted ? "opacity-60" : ""}`}
                    style={{ borderRightWidth: 4, borderRightColor: ev.color || "#3B82F6" }}
                    onClick={() => onEventClick(ev)}
                  >
                    <button onClick={(e) => { e.stopPropagation(); onToggleComplete(ev.id); }} className="shrink-0">
                      {ev.isCompleted ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <Circle className="w-5 h-5 text-muted-foreground" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`font-medium text-sm ${ev.isCompleted ? "line-through" : ""}`}>{ev.title}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0" style={{ backgroundColor: `${ev.color}20`, color: ev.color }}>
                          {EVENT_TYPES[ev.eventType]?.label || ev.eventType}
                        </span>
                        {ev.priority === "high" || ev.priority === "urgent" ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0" style={{ backgroundColor: `${PRIORITY_MAP[ev.priority]?.color}20`, color: PRIORITY_MAP[ev.priority]?.color }}>
                            {PRIORITY_MAP[ev.priority]?.label}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{ev.startTime?.substring(0, 5)} - {ev.endTime?.substring(0, 5)}</span>
                        {ev.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{ev.location}</span>}
                        {ownerUser && <span className="flex items-center gap-1"><Users className="w-3 h-3" />{ownerUser.fullName}</span>}
                      </div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); onDelete(ev.id); }} className="p-1.5 hover:bg-red-500/10 rounded shrink-0">
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EventFormModal({ event, defaultDate, onSave, onClose, onDelete, saving }: {
  event: CalendarEvent | null;
  defaultDate: string;
  onSave: (data: Record<string, any>) => void;
  onClose: () => void;
  onDelete?: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState({
    title: event?.title || "",
    description: event?.description || "",
    eventType: event?.eventType || "meeting",
    eventDate: event?.eventDate?.split("T")[0] || defaultDate,
    startTime: event?.startTime?.substring(0, 5) || "09:00",
    endTime: event?.endTime?.substring(0, 5) || "10:00",
    location: event?.location || "",
    color: event?.color || EVENT_TYPES["meeting"].defaultColor,
    isAllDay: event?.isAllDay || false,
    priority: event?.priority || "normal",
    reminderMinutes: event?.reminderMinutes || 15,
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    onSave({
      ...form,
      startTime: form.startTime + ":00",
      endTime: form.endTime + ":00",
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-card border rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" dir="rtl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">{event ? "עריכת אירוע" : "אירוע חדש"}</h2>
          <div className="flex items-center gap-2">
            {onDelete && (
              <button onClick={onDelete} className="p-1.5 hover:bg-red-500/10 rounded-lg">
                <Trash2 className="w-4 h-4 text-red-400" />
              </button>
            )}
            <button onClick={onClose} className="p-1.5 hover:bg-muted rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="text-sm font-medium block mb-1">כותרת *</label>
            <input
              value={form.title}
              onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
              placeholder="שם האירוע"
              required
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium block mb-1">סוג</label>
              <select
                value={form.eventType}
                onChange={(e) => {
                  const t = e.target.value;
                  setForm(p => ({ ...p, eventType: t, color: EVENT_TYPES[t]?.defaultColor || p.color }));
                }}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
              >
                {Object.entries(EVENT_TYPES).map(([k, v]) => (
                  <option key={k} value={k}>{v.icon} {v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">עדיפות</label>
              <select
                value={form.priority}
                onChange={(e) => setForm(p => ({ ...p, priority: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
              >
                {Object.entries(PRIORITY_MAP).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">תאריך *</label>
            <input
              type="date"
              value={form.eventDate}
              onChange={(e) => setForm(p => ({ ...p, eventDate: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium block mb-1">שעת התחלה *</label>
              <input
                type="time"
                value={form.startTime}
                onChange={(e) => setForm(p => ({ ...p, startTime: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">שעת סיום *</label>
              <input
                type="time"
                value={form.endTime}
                onChange={(e) => setForm(p => ({ ...p, endTime: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">מיקום</label>
            <input
              value={form.location}
              onChange={(e) => setForm(p => ({ ...p, location: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
              placeholder="כתובת / חדר ישיבות / אונליין"
            />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">תיאור</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background resize-none"
              rows={3}
              placeholder="פרטים נוספים..."
            />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">צבע</label>
            <div className="flex gap-2">
              {COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm(p => ({ ...p, color: c }))}
                  className={`w-7 h-7 rounded-full transition-transform ${form.color === c ? "ring-2 ring-offset-2 ring-blue-500 scale-110" : "hover:scale-105"}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted">
              ביטול
            </button>
            <button
              type="submit"
              disabled={saving || !form.title.trim()}
              className="px-6 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-foreground rounded-lg disabled:opacity-50 font-medium"
            >
              {saving ? "שומר..." : event ? "עדכן" : "צור אירוע"}
            </button>
          </div>
        </form>
      </div>

      {event && (
        <div className="border-t border-border/50 pt-4 space-y-4">
          <AttachmentsSection entityType="calendar-events" entityId={event.id} compact />
          <ActivityLog entityType="calendar-events" entityId={event.id} compact />
        </div>
      )}
    </div>
  );
}
