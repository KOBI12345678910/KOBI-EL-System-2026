import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { isToday, isTomorrow, isPast, format } from "date-fns";

interface TaskItem {
  id: string | number;
  title: string;
  status?: string;
  priority?: string;
  due_date?: string;
  project_name?: string;
}

interface TasksWidgetProps {
  tasks?: TaskItem[];
  onToggle?: (task: TaskItem) => void;
}

const priorityColors: Record<string, string> = {
  low: "bg-slate-100 text-slate-600",
  medium: "bg-blue-100 text-blue-600",
  high: "bg-orange-100 text-orange-600",
  urgent: "bg-red-100 text-red-600",
};

const priorityLabels: Record<string, string> = {
  low: "נמוכה",
  medium: "בינונית",
  high: "גבוהה",
  urgent: "דחוף",
};

export default function TasksWidget({ tasks = [], onToggle }: TasksWidgetProps) {
  const sortedTasks = [...tasks]
    .filter((t) => t.status !== "done")
    .sort((a, b) => new Date(a.due_date || "9999").getTime() - new Date(b.due_date || "9999").getTime())
    .slice(0, 5);

  const getDueDateLabel = (date?: string) => {
    if (!date) return null;
    const d = new Date(date);
    if (isToday(d)) return "היום";
    if (isTomorrow(d)) return "מחר";
    if (isPast(d)) return "באיחור";
    return format(d, "dd/MM");
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold text-slate-900">משימות להיום</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {sortedTasks.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">אין משימות פתוחות</p>
        ) : (
          sortedTasks.map((task) => {
            const dueLabel = getDueDateLabel(task.due_date);
            const isOverdue = task.due_date && isPast(new Date(task.due_date)) && !isToday(new Date(task.due_date));

            return (
              <div key={task.id} className="flex items-start gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors">
                <Checkbox
                  checked={task.status === "done"}
                  onCheckedChange={() => onToggle?.(task)}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{task.title}</p>
                  {task.project_name && <p className="text-xs text-slate-500">{task.project_name}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {task.priority && (
                    <Badge variant="secondary" className={priorityColors[task.priority] || ""}>
                      {priorityLabels[task.priority] || task.priority}
                    </Badge>
                  )}
                  {dueLabel && (
                    <span className={`text-xs font-medium ${isOverdue ? "text-red-500" : "text-slate-500"}`}>
                      {dueLabel}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
