import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronRight, ChevronLeft, ZoomIn, ZoomOut, AlertTriangle } from "lucide-react";
import { authFetch } from "@/lib/utils";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";

const API = "/api";
const TODAY = new Date();

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function diffDays(a: Date, b: Date) {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function fmt(d: Date) {
  return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
}

function mapStatus(status: string): { label: string; color: string; barColor: string } {
  const s = (status || "").toLowerCase();
  if (s === "completed" || s === "הושלם") return { label: "הושלם", color: "text-green-600 bg-green-50", barColor: "bg-green-500" };
  if (s === "in_progress" || s === "in-progress" || s === "בביצוע") return { label: "בביצוע", color: "text-amber-600 bg-amber-50", barColor: "bg-amber-500" };
  if (s === "cancelled" || s === "בוטל") return { label: "בוטל", color: "text-muted-foreground bg-muted/30", barColor: "bg-gray-400" };
  if (s === "draft" || s === "טיוטה") return { label: "טיוטה", color: "text-blue-600 bg-blue-50", barColor: "bg-blue-400" };
  return { label: "מתוכנן", color: "text-blue-600 bg-blue-50", barColor: "bg-blue-500" };
}

const CELL_W = 28;
const ROW_H = 40;
const LABEL_W = 220;

const relatedTabs = [
  {
    key: "work-orders", label: "הזמנות עבודה", endpoint: `${API}/work-orders?limit=10`,
    columns: [
      { key: "order_number", label: "מספר הזמנה" },
      { key: "product_name", label: "מוצר" },
      { key: "status", label: "סטטוס" },
    ],
  },
  {
    key: "machines", label: "מכונות", endpoint: `${API}/production/machines?limit=10`,
    columns: [
      { key: "name", label: "שם מכונה" },
      { key: "type", label: "סוג" },
      { key: "status", label: "סטטוס" },
    ],
  },
];

export default function ProductionGanttPage() {
  const [startOffset, setStartOffset] = useState(-14);
  const [zoom, setZoom] = useState(1);
  const days = 45;
  const viewStart = addDays(TODAY, startOffset);
  const dayList = Array.from({ length: days }, (_, i) => addDays(viewStart, i));
  const cellW = Math.round(CELL_W * zoom);

  const { selectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();

  const { data: rawData, isLoading, refetch } = useQuery({
    queryKey: ["work-orders-gantt"],
    queryFn: () => authFetch(`${API}/work-orders`).then(r => r.json()),
  });

  const workOrders: any[] = Array.isArray(rawData) ? rawData : (rawData?.data || rawData?.items || []);

  const tasks = workOrders
    .filter((wo: any) => wo.planned_start_date || wo.plannedStartDate || wo.start_date || wo.due_date)
    .map((wo: any) => {
      const startStr = wo.planned_start_date || wo.plannedStartDate || wo.start_date || wo.created_at;
      const endStr = wo.due_date || wo.planned_end_date || wo.plannedEndDate || wo.delivery_date;
      const start = new Date(startStr);
      const end = endStr ? new Date(endStr) : addDays(start, 7);
      const statusInfo = mapStatus(wo.status);
      return {
        id: wo.order_number || wo.orderNumber || `#${wo.id}`,
        numericId: wo.id,
        label: wo.product_name || wo.productName || wo.product || wo.description || "הזמנת עבודה",
        customer: wo.customer_name || wo.customerName || wo.customer || "",
        start,
        end,
        status: statusInfo.label,
        color: statusInfo.barColor,
        statusColor: statusInfo.color,
        isLate: (statusInfo.label === "מתוכנן" || statusInfo.label === "בביצוע") && end < TODAY,
      };
    })
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const statusCounts = {
    total: tasks.length,
    late: tasks.filter(t => t.isLate).length,
    inProgress: tasks.filter(t => t.status === "בביצוע").length,
    planned: tasks.filter(t => t.status === "מתוכנן").length,
    completed: tasks.filter(t => t.status === "הושלם").length,
  };

  const loadForBulk = () => { refetch(); };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold flex items-center gap-3">
            <CalendarDays className="text-blue-600" size={32} />
            Gantt Chart — תכנון ייצור
          </h1>
          <p className="text-muted-foreground mt-1">תצוגת לוח זמנים גאנט להזמנות ייצור</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setStartOffset(s => s - 7)} className="p-2 border rounded-lg hover:bg-muted/30"><ChevronRight size={18} /></button>
          <span className="text-sm text-muted-foreground min-w-[100px] text-center">{fmt(viewStart)} — {fmt(addDays(viewStart, days - 1))}</span>
          <button onClick={() => setStartOffset(s => s + 7)} className="p-2 border rounded-lg hover:bg-muted/30"><ChevronLeft size={18} /></button>
          <button onClick={() => setZoom(z => Math.min(2, z + 0.25))} className="p-2 border rounded-lg hover:bg-muted/30" title="הגדל"><ZoomIn size={16} /></button>
          <button onClick={() => setZoom(z => Math.max(0.5, z - 0.25))} className="p-2 border rounded-lg hover:bg-muted/30" title="הקטן"><ZoomOut size={16} /></button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "סה\"כ הזמנות", value: statusCounts.total.toString(), color: "text-blue-600" },
          { label: "באיחור", value: statusCounts.late.toString(), color: "text-red-600" },
          { label: "בביצוע", value: statusCounts.inProgress.toString(), color: "text-amber-600" },
          { label: "הושלמו", value: statusCounts.completed.toString(), color: "text-green-600" },
        ].map((k, i) => (
          <div key={i} className="bg-card border rounded-xl p-3 shadow-sm text-center">
            <div className={`text-lg sm:text-2xl font-bold ${k.color}`}>{k.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{k.label}</div>
          </div>
        ))}
      </div>

      <BulkActions selectedIds={selectedIds} onClear={clear} entityName="הזמנות עבודה" actions={defaultBulkActions(selectedIds, clear, loadForBulk, `${API}/work-orders`)} />

      {isLoading ? (
        <div className="text-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3" />
          <p className="text-muted-foreground">טוען הזמנות ייצור...</p>
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-16 bg-card border rounded-xl">
          <CalendarDays size={48} className="mx-auto text-slate-300 mb-3" />
          <p className="text-muted-foreground">אין הזמנות עבודה עם תאריכים מוגדרים</p>
        </div>
      ) : (
        <>
          <div className="bg-card border rounded-xl shadow-sm overflow-auto">
            <div style={{ minWidth: LABEL_W + cellW * days }} className="relative">
              <div className="flex border-b bg-muted/30 sticky top-0 z-10">
                <div style={{ width: LABEL_W, minWidth: LABEL_W }} className="flex-shrink-0 p-2 border-r text-sm font-semibold text-muted-foreground">הזמנה / מוצר</div>
                <div className="flex">
                  {dayList.map((d, i) => {
                    const isToday = d.toDateString() === TODAY.toDateString();
                    const isWeekend = d.getDay() === 5 || d.getDay() === 6;
                    return (
                      <div
                        key={i}
                        style={{ width: cellW, minWidth: cellW }}
                        className={`border-r text-center py-1 text-xs font-medium flex-shrink-0 ${isToday ? "bg-blue-600 text-foreground" : isWeekend ? "bg-muted/50 text-muted-foreground" : "text-muted-foreground"}`}
                      >
                        {d.getDate()}
                        {d.getDate() === 1 || i === 0 ? <div className="text-xs font-bold">{d.getMonth() + 1}/{d.getFullYear().toString().slice(2)}</div> : null}
                      </div>
                    );
                  })}
                </div>
              </div>

              {tasks.map((task, rowIdx) => {
                const taskStart = diffDays(viewStart, task.start);
                const taskEnd = diffDays(viewStart, task.end);
                const left = Math.max(0, taskStart) * cellW;
                const width = Math.max(cellW, (Math.min(days, taskEnd + 1) - Math.max(0, taskStart)) * cellW);
                const visible = taskEnd >= 0 && taskStart <= days;

                return (
                  <div key={rowIdx} className="flex border-b hover:bg-muted/30" style={{ height: ROW_H }}>
                    <div style={{ width: LABEL_W, minWidth: LABEL_W }} className="flex-shrink-0 p-2 border-r flex items-center gap-2">
                      <div>
                        <div className="font-mono text-xs text-muted-foreground">{task.id}</div>
                        <div className="text-xs font-medium text-foreground truncate max-w-[140px]" title={task.label}>{task.label}</div>
                        {task.customer && <div className="text-xs text-muted-foreground truncate max-w-[140px]">{task.customer}</div>}
                      </div>
                      {task.isLate && <AlertTriangle size={12} className="text-red-500 flex-shrink-0" />}
                    </div>
                    <div className="relative flex-1" style={{ height: ROW_H }}>
                      {visible && (
                        <div
                          className={`absolute top-1/2 -translate-y-1/2 h-6 rounded-md flex items-center px-2 text-foreground text-xs font-medium shadow-sm ${task.color}`}
                          style={{ left, width, maxWidth: cellW * days }}
                          title={`${task.label}: ${fmt(task.start)} — ${fmt(task.end)}`}
                        >
                          <span className="truncate">{task.label}</span>
                        </div>
                      )}
                      {diffDays(viewStart, TODAY) >= 0 && diffDays(viewStart, TODAY) < days && (
                        <div
                          className="absolute top-0 bottom-0 w-0.5 bg-blue-500 opacity-30 z-0"
                          style={{ left: diffDays(viewStart, TODAY) * cellW }}
                        />
                      )}
                    </div>
                  </div>
                );
              })}

              <div className="flex border-b bg-muted/30 p-2">
                <div style={{ width: LABEL_W, minWidth: LABEL_W }} className="flex-shrink-0 border-r pr-2 text-xs font-semibold text-muted-foreground">
                  מקרא:
                  <div className="flex flex-wrap gap-3 mt-1">
                    {[
                      { label: "באיחור", color: "bg-red-500" },
                      { label: "בביצוע", color: "bg-amber-500" },
                      { label: "מתוכנן", color: "bg-blue-500" },
                      { label: "הושלם", color: "bg-green-500" },
                    ].map((s, i) => (
                      <div key={i} className="flex items-center gap-1">
                        <div className={`w-3 h-3 rounded ${s.color}`} />
                        <span>{s.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 border-b font-semibold text-foreground">פירוט הזמנות</div>
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr>
                  <th className="p-3 w-10">
                    <BulkCheckbox checked={selectedIds.length === tasks.length && tasks.length > 0} onChange={() => toggleAll(tasks.map(t => ({ id: t.numericId })))} partial={selectedIds.length > 0 && selectedIds.length < tasks.length} />
                  </th>
                  <th className="p-3 text-right">הזמנה</th>
                  <th className="p-3 text-right">מוצר</th>
                  <th className="p-3 text-right">לקוח</th>
                  <th className="p-3 text-right">התחלה</th>
                  <th className="p-3 text-right">סיום</th>
                  <th className="p-3 text-right">משך</th>
                  <th className="p-3 text-right">סטטוס</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t, i) => (
                  <tr key={i} className="border-t hover:bg-muted/30">
                    <td className="p-3">
                      <BulkCheckbox checked={isSelected(t.numericId)} onChange={() => toggle(t.numericId)} />
                    </td>
                    <td className="p-3 font-mono text-xs">{t.id}</td>
                    <td className="p-3 font-medium">{t.label}</td>
                    <td className="p-3 text-muted-foreground text-xs">{t.customer || "—"}</td>
                    <td className="p-3">{fmt(t.start)}</td>
                    <td className="p-3">{fmt(t.end)}</td>
                    <td className="p-3">{diffDays(t.start, t.end)} ימים</td>
                    <td className="p-3"><span className={`text-xs px-2 py-0.5 rounded-full ${t.statusColor}`}>{t.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="space-y-6 mt-8">
        <RelatedRecords tabs={relatedTabs} />
        <ActivityLog entityType="production_gantt" />
      </div>
    </div>
  );
}
