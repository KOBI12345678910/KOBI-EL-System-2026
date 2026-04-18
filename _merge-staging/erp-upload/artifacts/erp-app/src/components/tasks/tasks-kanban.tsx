import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DndContext, DragOverlay, closestCorners, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Clock, User, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { entityFilter, entityList, entityUpdate } from "@/lib/entity-api";

const statuses = [
  { id: 'pending', label: 'ממתין', color: 'bg-slate-100 text-slate-700' },
  { id: 'in_progress', label: 'בעבודה', color: 'bg-blue-100 text-blue-700' },
  { id: 'completed', label: 'הושלם', color: 'bg-green-100 text-green-700' },
  { id: 'cancelled', label: 'בוטל', color: 'bg-red-100 text-red-700' }
];

function TaskCard({ task, isDragging }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ 
    id: task.id 
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const priorityColors = {
    low: 'bg-slate-100 text-slate-700',
    medium: 'bg-yellow-100 text-yellow-700',
    high: 'bg-orange-100 text-orange-700',
    urgent: 'bg-red-100 text-red-700'
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-white rounded-lg border p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
    >
      <div className="flex items-start gap-2 mb-2">
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing mt-1">
          <GripVertical className="w-4 h-4 text-slate-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm mb-1">{task.title}</div>
          {task.description && (
            <div className="text-xs text-slate-600 line-clamp-2 mb-2">
              {task.description}
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            {task.priority && (
              <Badge className={`${priorityColors[task.priority]} text-xs`}>
                {task.priority}
              </Badge>
            )}
            {task.due_date && (
              <div className="flex items-center gap-1 text-xs text-slate-500">
                <Clock className="w-3 h-3" />
                {format(new Date(task.due_date), 'dd/MM')}
              </div>
            )}
            {task.assigned_to && (
              <div className="flex items-center gap-1 text-xs text-slate-500">
                <User className="w-3 h-3" />
                {task.assigned_to.split('@')[0]}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DroppableColumn({ status, tasks, children }) {
  const { setNodeRef } = useSortable({ id: status.id });

  return (
    <div ref={setNodeRef} className="flex-1 min-w-[280px]">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">{status.label}</CardTitle>
            <Badge className={status.color}>{tasks.length}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 min-h-[400px]">
          {children}
        </CardContent>
      </Card>
    </div>
  );
}

export default function TasksKanban({ leadId }) {
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState(null);

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks', leadId],
    queryFn: () => leadId 
      ? entityFilter<any>("lead-tasks", { lead_id: leadId })
      : entityList<any>("tasks", '-created_date', 100)
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ id, data }) => 
      leadId 
        ? entityUpdate<any>("lead-tasks", id, data)
        : entityUpdate<any>("tasks", id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('המשימה עודכנה');
    }
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragStart = (event) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    
    if (!over) {
      setActiveId(null);
      return;
    }

    const activeTask = tasks.find(t => t.id === active.id);
    const overStatus = statuses.find(s => s.id === over.id);

    if (overStatus && activeTask.status !== overStatus.id) {
      updateTaskMutation.mutate({
        id: activeTask.id,
        data: { status: overStatus.id }
      });
    }

    setActiveId(null);
  };

  const handleDragCancel = () => {
    setActiveId(null);
  };

  const activeTask = tasks.find(t => t.id === activeId);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {statuses.map(status => {
          const statusTasks = tasks.filter(t => t.status === status.id);
          
          return (
            <SortableContext
              key={status.id}
              items={statusTasks.map(t => t.id)}
              strategy={verticalListSortingStrategy}
            >
              <DroppableColumn status={status} tasks={statusTasks}>
                {statusTasks.map(task => (
                  <TaskCard key={task.id} task={task} />
                ))}
              </DroppableColumn>
            </SortableContext>
          );
        })}
      </div>

      <DragOverlay>
        {activeTask ? <TaskCard task={activeTask} isDragging /> : null}
      </DragOverlay>
    </DndContext>
  );
}