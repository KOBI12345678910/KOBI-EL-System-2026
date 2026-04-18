import { useState } from 'react';
import { entityFilter, entityCreate, entityUpdate } from '@/lib/entity-api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { Plus, CheckCircle2, Circle } from 'lucide-react';

interface LeadTasksProps {
  leadId: string;
}

export default function LeadTasks({ leadId }: LeadTasksProps) {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    due_date: '',
    priority: 'medium'
  });
  const queryClient = useQueryClient();

  const { data: tasks = [] } = useQuery({
    queryKey: ['leadTasks', leadId],
    queryFn: () => entityFilter<any>("lead-tasks", { lead_id: leadId })
  });

  const createTaskMutation = useMutation({
    mutationFn: (data: any) => entityCreate("lead-tasks", { lead_id: leadId, ...data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leadTasks', leadId] });
      setFormData({ title: '', description: '', due_date: '', priority: 'medium' });
      setShowForm(false);
    }
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => entityUpdate("lead-tasks", id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leadTasks', leadId] });
    }
  });

  const handleSubmit = () => {
    if (formData.title && formData.due_date) {
      createTaskMutation.mutate(formData);
    }
  };

  const priorityColors: Record<string, string> = {
    low: 'bg-blue-100 text-blue-800',
    medium: 'bg-yellow-100 text-yellow-800',
    high: 'bg-orange-100 text-orange-800',
    urgent: 'bg-red-100 text-red-800'
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Tasks & Reminders</CardTitle>
          <Button size="sm" onClick={() => setShowForm(!showForm)} className="gap-2">
            <Plus className="w-4 h-4" />
            New Task
          </Button>
        </CardHeader>
        {showForm && (
          <CardContent className="space-y-3">
            <Input
              placeholder="Task title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            />
            <textarea
              placeholder="Description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full p-2 border rounded-lg text-sm"
              rows={3}
            />
            <Input
              type="datetime-local"
              value={formData.due_date}
              onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
            />
            <select
              value={formData.priority}
              onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
              className="w-full p-2 border rounded-lg text-sm"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
            <div className="flex gap-2">
              <Button onClick={handleSubmit} disabled={createTaskMutation.isPending}>
                Create Task
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </CardContent>
        )}
      </Card>

      <div className="space-y-3">
        {tasks.map((task: any) => (
          <Card key={task.id} className={task.status === 'completed' ? 'opacity-60' : ''}>
            <CardContent className="pt-6 flex justify-between items-start">
              <div className="flex gap-3 flex-1">
                <button
                  onClick={() => updateTaskMutation.mutate({
                    id: task.id,
                    status: task.status === 'completed' ? 'pending' : 'completed'
                  })}
                  className="mt-1"
                >
                  {task.status === 'completed' ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  ) : (
                    <Circle className="w-5 h-5 text-slate-400" />
                  )}
                </button>
                <div className="flex-1">
                  <p className={`font-medium text-sm ${task.status === 'completed' ? 'line-through text-slate-500' : ''}`}>
                    {task.title}
                  </p>
                  {task.description && <p className="text-xs text-slate-600 mt-1">{task.description}</p>}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <Badge className={priorityColors[task.priority]}>
                  {task.priority}
                </Badge>
                {task.due_date && (
                  <p className="text-xs text-slate-500">
                    {format(new Date(task.due_date), 'dd/MM/yyyy', { locale: he })}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {tasks.length === 0 && <p className="text-center text-slate-500 py-6">No tasks</p>}
      </div>
    </div>
  );
}
