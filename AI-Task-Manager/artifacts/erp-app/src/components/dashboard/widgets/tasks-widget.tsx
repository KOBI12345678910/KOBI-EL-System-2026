import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock } from "lucide-react";
import { Link } from "wouter";
import { createPageUrl } from "@/lib/route-map";
import { entityFilter } from "@/lib/entity-api";
import { format } from "date-fns";
import type { Task } from "@/types/base44-entities";

export default function TasksWidgetDashboard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const tasksData = await entityFilter<Task>("tasks", { status: "pending" });
      setTasks(tasksData.slice(0, 5));
    } catch (error) {
      console.error("Error loading tasks:", error);
    } finally {
      setLoading(false);
    }
  };

  const getTaskColor = (task: Task) => {
    if (task.due_date && new Date(task.due_date) < new Date()) {
      return "border-l-red-500 bg-red-50";
    }
    if (task.priority === "critical" || task.priority === "high") {
      return "border-l-orange-500 bg-orange-50";
    }
    return "border-l-blue-500 bg-blue-50";
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">המשימות שלי</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <p className="text-sm text-slate-600">טוען...</p>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-slate-600">אין משימות ממתינות</p>
        ) : (
          <div className="space-y-2">
            {tasks.map((task) => (
              <div key={task.id} className={`p-3 rounded-lg border-l-4 ${getTaskColor(task)}`}>
                <p className="font-medium text-sm text-slate-900 line-clamp-1">{task.title}</p>
                <div className="flex items-center gap-2 mt-1 text-xs text-slate-600">
                  {task.priority && (
                    <span className="px-2 py-0.5 bg-white rounded text-slate-700">{task.priority}</span>
                  )}
                  {task.due_date && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {format(new Date(task.due_date), "MMM d")}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <Link href={createPageUrl("Tasks")}>
          <Button variant="outline" className="w-full mt-4">צפה בכל המשימות</Button>
        </Link>
      </CardContent>
    </Card>
  );
}
