import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, Edit2, Trash2, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export default function TaskCard({ task, onEdit, onDelete, onComplete }) {
  const priorityColors = {
    low: "bg-blue-100 text-blue-800",
    medium: "bg-yellow-100 text-yellow-800",
    high: "bg-orange-100 text-orange-800",
    critical: "bg-red-100 text-red-800"
  };

  const statusIcons = {
    open: <Circle className="w-5 h-5 text-slate-400" />,
    in_progress: <Circle className="w-5 h-5 text-blue-500" />,
    completed: <CheckCircle2 className="w-5 h-5 text-green-500" />,
    cancelled: <Circle className="w-5 h-5 text-slate-300" />
  };

  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'completed';

  return (
    <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <button
            onClick={() => onComplete && onComplete(task.id)}
            className="mt-1 hover:opacity-70 transition-opacity"
          >
            {statusIcons[task.status]}
          </button>

          <div className="flex-1 min-w-0">
            <h3 className={cn(
              "font-medium text-slate-900",
              task.status === 'completed' && "line-through text-slate-500"
            )}>
              {task.title}
            </h3>

            {task.description && (
              <p className="text-sm text-slate-600 mt-1 line-clamp-2">{task.description}</p>
            )}

            <div className="flex flex-wrap gap-2 mt-3">
              <Badge className={priorityColors[task.priority]}>
                {task.priority}
              </Badge>

              {task.due_date && (
                <Badge variant="outline" className={cn(
                  "flex items-center gap-1",
                  isOverdue && "border-red-300 bg-red-50 text-red-700"
                )}>
                  <Calendar className="w-3 h-3" />
                  {format(new Date(task.due_date), 'MMM d')}
                </Badge>
              )}

              {task.assigned_to && (
                <Badge variant="secondary" className="text-xs">
                  {task.assigned_to.split('@')[0]}
                </Badge>
              )}

              {task.related_entity_type && (
                <Badge variant="outline" className="text-xs">
                  {task.related_entity_type}
                </Badge>
              )}
            </div>
          </div>

          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onEdit && onEdit(task)}
              className="h-8 w-8 text-slate-400 hover:text-slate-600"
            >
              <Edit2 className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDelete && onDelete(task.id)}
              className="h-8 w-8 text-slate-400 hover:text-red-600"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}