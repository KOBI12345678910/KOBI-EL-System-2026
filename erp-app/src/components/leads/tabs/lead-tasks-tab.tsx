import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { entityFilter, entityUpdate } from '@/lib/entity-api';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Clock, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

/* ─── Types ─── */

interface LeadTask {
  id: number | string;
  lead_id: number | string;
  title: string;
  description?: string;
  status: string;
  due_date?: string;
}

interface LeadTasksTabProps {
  leadId: number | string;
}

export default function LeadTasksTab({ leadId }: LeadTasksTabProps) {
  const queryClient = useQueryClient();

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks', leadId],
    queryFn: () => entityFilter<LeadTask>("lead-tasks", { lead_id: leadId })
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ id, status }: { id: number | string; status: string }) =>
      entityUpdate<LeadTask>("lead-tasks", id, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks', leadId] })
  });

  const handleToggle = (task: LeadTask) => {
    updateTaskMutation.mutate({
      id: task.id,
      status: task.status === 'completed' ? 'pending' : 'completed'
    });
  };

  if (isLoading) return <div className="p-6">טוען משימות...</div>;

  const pending = tasks.filter(t => t.status !== 'completed');
  const completed = tasks.filter(t => t.status === 'completed');

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">משימות פתוחות ({pending.length})</h3>
        <div className="space-y-3">
          {pending.map(task => (
            <TaskItem key={task.id} task={task} onToggle={handleToggle} />
          ))}
          {pending.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-slate-500">
                אין משימות פתוחות
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {completed.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-4">הושלמו ({completed.length})</h3>
          <div className="space-y-3">
            {completed.map(task => (
              <TaskItem key={task.id} task={task} onToggle={handleToggle} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface TaskItemProps {
  task: LeadTask;
  onToggle: (task: LeadTask) => void;
}

function TaskItem({ task, onToggle }: TaskItemProps) {
  const isCompleted = task.status === 'completed';
  const isOverdue = !isCompleted && task.due_date && new Date(task.due_date) < new Date();

  return (
    <Card className={isCompleted ? 'opacity-60' : ''}>
      <CardContent className="pt-6">
        <div className="flex items-start gap-4">
          <Checkbox
            checked={isCompleted}
            onCheckedChange={() => onToggle(task)}
            className="mt-1"
          />
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <span className={`font-medium ${isCompleted ? 'line-through' : ''}`}>
                {task.title}
              </span>
              {task.due_date && (
                <Badge variant={isOverdue ? 'destructive' : 'outline'} className="gap-1">
                  <Clock className="w-3 h-3" />
                  {format(new Date(task.due_date), 'dd/MM HH:mm', {locale: he})}
                </Badge>
              )}
            </div>
            {task.description && (
              <p className="text-sm text-slate-600">{task.description}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
