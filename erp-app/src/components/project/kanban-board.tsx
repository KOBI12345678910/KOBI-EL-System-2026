import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, Users, GripVertical } from 'lucide-react';

const statusConfig = {
    todo: { label: 'לביצוע', color: 'bg-slate-50 border-slate-200' },
    in_progress: { label: 'בתהליך', color: 'bg-blue-50 border-blue-200' },
    review: { label: 'בבדיקה', color: 'bg-amber-50 border-amber-200' },
    done: { label: 'בוצע', color: 'bg-emerald-50 border-emerald-200' },
    cancelled: { label: 'בוטל', color: 'bg-red-50 border-red-200' }
};

function KanbanCard({ task, onStatusChange }) {
    return (
        <Card className="hover:shadow-md transition-shadow border border-slate-200 mb-3 cursor-pointer group">
            <CardContent className="p-3">
                <div className="flex items-start gap-2">
                    <GripVertical className="w-4 h-4 text-slate-300 flex-shrink-0 mt-0.5 group-hover:text-slate-500" />
                    <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-slate-900 mb-2">{task.title}</p>
                        <div className="space-y-2 text-xs">
                            {task.assigned_name && (
                                <div className="flex items-center gap-1 text-slate-600">
                                    <Users className="w-3 h-3" />
                                    <span className="truncate">{task.assigned_name}</span>
                                </div>
                            )}
                            {task.estimated_hours > 0 && (
                                <div className="flex items-center gap-1 text-slate-600">
                                    <Clock className="w-3 h-3" />
                                    {task.actual_hours || 0} / {task.estimated_hours} שעות
                                </div>
                            )}
                            <div className="flex gap-1 flex-wrap">
                                <Badge className="text-xs" variant="outline">{task.priority}</Badge>
                                {task.due_date && <Badge className="text-xs">{new Date(task.due_date).toLocaleDateString('he-IL')}</Badge>}
                            </div>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

function KanbanColumn({ status, tasks, onStatusChange }) {
    const config = statusConfig[status];

    return (
        <div className={`flex-1 p-4 rounded-lg border-2 ${config.color} min-h-96`}>
            <h3 className="font-semibold text-sm mb-4 text-slate-900">{config.label} ({tasks.length})</h3>
            <div className="space-y-2">
                {tasks.map(task => (
                    <KanbanCard key={task.id} task={task} onStatusChange={onStatusChange} />
                ))}
            </div>
        </div>
    );
}

export default function KanbanBoard({ tasks, onTaskUpdate }) {
    const statuses = ['todo', 'in_progress', 'review', 'done'];
    const tasksByStatus = {};

    statuses.forEach(status => {
        tasksByStatus[status] = tasks.filter(t => t.status === status).sort((a, b) => {
            if (a.priority === 'urgent') return -1;
            if (b.priority === 'urgent') return 1;
            if (a.due_date && b.due_date) return new Date(a.due_date) - new Date(b.due_date);
            return 0;
        });
    });

    const handleStatusChange = (taskId, newStatus) => {
        const task = tasks.find(t => t.id === taskId);
        if (task) {
            onTaskUpdate(taskId, { ...task, status: newStatus });
        }
    };

    return (
        <div className="flex gap-4 overflow-x-auto pb-4">
            {statuses.map(status => (
                <KanbanColumn
                    key={status}
                    status={status}
                    tasks={tasksByStatus[status]}
                    onStatusChange={handleStatusChange}
                />
            ))}
        </div>
    );
}