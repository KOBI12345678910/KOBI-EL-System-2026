import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Eye, Edit2 } from "lucide-react";
import { STATUS_COLORS } from "./field-type-registry";
import { authFetch } from "@/lib/utils";

const API = "/api";

interface CalendarViewProps {
  records: any[];
  fields: any[];
  statuses: any[];
  entity: any;
  activeView: any;
  entityId: number;
  onViewRecord: (record: any) => void;
  onEditRecord: (record: any) => void;
  canEdit?: boolean;
}

const DAYS_HE = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const MONTHS_HE = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

export default function CalendarView({
  records, fields, statuses, entity, activeView, entityId,
  onViewRecord, onEditRecord, canEdit = true,
}: CalendarViewProps) {
  const queryClient = useQueryClient();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<"month" | "week">("month");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const dateField = useMemo(() => {
    const slug = activeView?.settings?.calendarDateField;
    if (slug) return fields.find((f: any) => f.slug === slug);
    return fields.find((f: any) => f.fieldType === "date" || f.fieldType === "datetime");
  }, [fields, activeView]);

  const titleField = useMemo(() => {
    const slug = activeView?.settings?.calendarTitleField;
    if (slug) return fields.find((f: any) => f.slug === slug);
    return fields.find((f: any) => f.showInList) || fields[0];
  }, [fields, activeView]);

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => authFetch(`${API}/platform/records/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["entity-records", entityId] }),
  });

  const recordsByDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    if (!dateField) return map;
    for (const rec of records) {
      const val = (rec.data || {})[dateField.slug];
      if (!val) continue;
      const d = new Date(val);
      if (isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (!map[key]) map[key] = [];
      map[key].push(rec);
    }
    return map;
  }, [records, dateField]);

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

  function formatKey(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  const today = formatKey(new Date());

  const navigate = (dir: number) => {
    setCurrentDate(prev => {
      const d = new Date(prev);
      if (viewMode === "month") d.setMonth(d.getMonth() + dir);
      else d.setDate(d.getDate() + dir * 7);
      return d;
    });
  };

  const handleDrop = (e: React.DragEvent, dayKey: string) => {
    e.preventDefault();
    if (!canEdit) return;
    const recordId = e.dataTransfer.getData("recordId");
    if (!recordId || !dateField) return;
    const rec = records.find((r: any) => r.id === Number(recordId));
    if (!rec) return;
    updateMutation.mutate({
      id: rec.id,
      data: { ...(rec.data || {}), [dateField.slug]: dayKey },
    });
  };

  if (!dateField) {
    return (
      <div className="bg-card border border-border rounded-2xl p-12 text-center">
        <p className="text-muted-foreground">לא נמצא שדה תאריך בישות זו.</p>
        <p className="text-sm text-muted-foreground mt-1">הוסף שדה מסוג "תאריך" כדי להשתמש בתצוגת לוח שנה.</p>
      </div>
    );
  }

  const displayDays = viewMode === "month" ? calendarDays : weekDays;

  return (
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
        </div>
        <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
          <button onClick={() => setViewMode("month")}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${viewMode === "month" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>
            חודשי
          </button>
          <button onClick={() => setViewMode("week")}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${viewMode === "week" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>
            שבועי
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7">
        {DAYS_HE.map(day => (
          <div key={day} className="px-2 py-2 text-center text-xs font-medium text-muted-foreground border-b border-border bg-muted/30">
            {day}
          </div>
        ))}
      </div>

      <div className={`grid grid-cols-7 ${viewMode === "week" ? "min-h-[300px]" : ""}`}>
        {displayDays.map((day) => {
          const dayRecords = recordsByDate[day.key] || [];
          const isToday = day.key === today;

          return (
            <div
              key={day.key}
              className={`border-b border-l border-border/50 p-1 transition-colors ${viewMode === "month" ? "min-h-[100px]" : "min-h-[250px]"} ${
                !day.isCurrentMonth ? "bg-muted/10" : ""
              } ${isToday ? "bg-primary/5" : ""} hover:bg-muted/20`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, day.key)}
              onClick={() => setSelectedDay(selectedDay === day.key ? null : day.key)}
            >
              <div className={`text-xs font-medium px-1 py-0.5 ${
                isToday ? "bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center" : 
                !day.isCurrentMonth ? "text-muted-foreground/50" : "text-muted-foreground"
              }`}>
                {day.date.getDate()}
              </div>

              <div className="mt-1 space-y-0.5">
                {dayRecords.slice(0, viewMode === "month" ? 3 : 10).map((rec: any) => {
                  const data = rec.data || {};
                  const statusDef = statuses.find((s: any) => s.slug === rec.status);
                  const colorDef = STATUS_COLORS.find(c => c.key === statusDef?.color);
                  const color = colorDef?.hex || "#6b7280";

                  return (
                    <div
                      key={rec.id}
                      draggable={canEdit}
                      onDragStart={canEdit ? (e) => {
                        e.dataTransfer.setData("recordId", String(rec.id));
                        e.stopPropagation();
                      } : undefined}
                      onClick={(e) => { e.stopPropagation(); onViewRecord(rec); }}
                      className="text-[10px] px-1.5 py-0.5 rounded cursor-pointer hover:opacity-80 truncate"
                      style={{ backgroundColor: `${color}20`, color, borderRight: `2px solid ${color}` }}
                    >
                      {titleField ? (data[titleField.slug] || `#${rec.id}`) : `#${rec.id}`}
                    </div>
                  );
                })}
                {dayRecords.length > (viewMode === "month" ? 3 : 10) && (
                  <div className="text-[10px] text-muted-foreground px-1">
                    +{dayRecords.length - (viewMode === "month" ? 3 : 10)} נוספים
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {selectedDay && recordsByDate[selectedDay] && (
        <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} className="border-t border-border overflow-hidden">
          <div className="p-4">
            <h4 className="text-sm font-semibold mb-3">
              {new Date(selectedDay).toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" })}
            </h4>
            <div className="space-y-2">
              {recordsByDate[selectedDay].map((rec: any) => {
                const data = rec.data || {};
                const statusDef = statuses.find((s: any) => s.slug === rec.status);
                const colorDef = STATUS_COLORS.find(c => c.key === statusDef?.color);
                return (
                  <div key={rec.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-2">
                      {statusDef && (
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: colorDef?.hex || "#6b7280" }} />
                      )}
                      <span className="text-sm">{titleField ? (data[titleField.slug] || `#${rec.id}`) : `#${rec.id}`}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => onViewRecord(rec)} className="p-1 hover:bg-muted rounded"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                      {canEdit && <button onClick={() => onEditRecord(rec)} className="p-1 hover:bg-muted rounded"><Edit2 className="w-3.5 h-3.5 text-muted-foreground" /></button>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
