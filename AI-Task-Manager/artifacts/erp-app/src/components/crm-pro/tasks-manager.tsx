import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { entityList, entityCreate, entityUpdate, entityDelete } from "@/lib/entity-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Edit2, CheckCircle2, Circle } from "lucide-react";

interface Task {
  id: number;
  title?: string;
  description?: string;
  priority?: string;
  status?: string;
  due_date?: string;
}

export default function TasksManager() {
  const [searchTerm, setSearchTerm] = useState("");
  const [showForm, setShowForm] = useState(false);
  const queryClient = useQueryClient();

  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => entityList<Task>("tasks"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Task> }) =>
      entityUpdate<Task>("tasks", id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => entityDelete("tasks", id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<Task>) => entityCreate<Task>("tasks", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setShowForm(false);
    },
  });

  const filteredTasks = tasks.filter(
    (task) => task.title?.includes(searchTerm) || task.description?.includes(searchTerm)
  );

  const priorityColor: Record<string, string> = {
    low: "bg-blue-100 text-blue-800",
    medium: "bg-yellow-100 text-yellow-800",
    high: "bg-red-100 text-red-800",
    critical: "bg-red-200 text-red-900",
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-4 items-center">
        <Input
          placeholder="חיפוש משימות..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1"
        />
        <Sheet open={showForm} onOpenChange={setShowForm}>
          <SheetTrigger asChild>
            <Button className="bg-blue-600">
              <Plus className="w-4 h-4 ml-2" />
              משימה חדשה
            </Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>משימה חדשה</SheetTitle>
            </SheetHeader>
            <TaskForm onSubmit={(data) => createMutation.mutate(data)} />
          </SheetContent>
        </Sheet>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead className="bg-slate-100 border-b-2 border-slate-300">
            <tr>
              <th className="p-3 text-right font-semibold text-slate-700 w-2/5">כותרת</th>
              <th className="p-3 text-right font-semibold text-slate-700">עדיפות</th>
              <th className="p-3 text-right font-semibold text-slate-700">סטטוס</th>
              <th className="p-3 text-right font-semibold text-slate-700">מועד</th>
              <th className="p-3 text-center font-semibold text-slate-700">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {filteredTasks.map((task) => (
              <tr key={task.id} className="border-b border-slate-200 hover:bg-slate-50">
                <td className="p-3 font-medium">{task.title}</td>
                <td className="p-3">
                  <Badge className={priorityColor[task.priority || "medium"]}>
                    {task.priority}
                  </Badge>
                </td>
                <td className="p-3">
                  <button
                    onClick={() =>
                      updateMutation.mutate({
                        id: task.id,
                        data: { status: task.status === "done" ? "todo" : "done" },
                      })
                    }
                    className="flex items-center gap-1"
                  >
                    {task.status === "done" ? (
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                    ) : (
                      <Circle className="w-5 h-5 text-slate-400" />
                    )}
                    <span className="text-sm">{task.status}</span>
                  </button>
                </td>
                <td className="p-3 text-sm text-slate-600">
                  {task.due_date ? new Date(task.due_date).toLocaleDateString("he-IL") : "-"}
                </td>
                <td className="p-3 flex gap-2 justify-center">
                  <Button size="sm" variant="ghost">
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteMutation.mutate(task.id)}
                    className="text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface TaskFormProps {
  onSubmit: (data: Partial<Task>) => void;
}

function TaskForm({ onSubmit }: TaskFormProps) {
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    priority: "medium",
    status: "todo",
  });

  return (
    <div className="space-y-4 mt-6">
      <Input
        placeholder="כותרת"
        value={formData.title}
        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
      />
      <Input
        placeholder="תיאור"
        value={formData.description}
        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
      />
      <Button onClick={() => onSubmit(formData)} className="w-full bg-blue-600">
        שמור
      </Button>
    </div>
  );
}
