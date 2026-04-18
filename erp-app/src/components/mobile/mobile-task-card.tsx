import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, Circle, AlertCircle, Calendar } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { he } from 'date-fns/locale';

export default function MobileTaskCard({ task, onStatusChange }) {
    const statusIcons = {
        'pending': <Circle className="w-4 h-4 text-gray-400" />,
        'in_progress': <AlertCircle className="w-4 h-4 text-blue-500" />,
        'completed': <CheckCircle2 className="w-4 h-4 text-green-500" />
    };

    const priorityColors = {
        'low': 'bg-blue-100 text-blue-800',
        'medium': 'bg-yellow-100 text-yellow-800',
        'high': 'bg-red-100 text-red-800'
    };

    return (
        <Card className="mb-3 touch-target">
            <CardContent className="p-4">
                <div className="flex items-start gap-3">
                    <div className="pt-1 cursor-pointer" onClick={() => onStatusChange?.(task)}>
                        {statusIcons[task.status]}
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm text-slate-900 truncate">{task.title}</h3>
                        {task.description && (
                            <p className="text-xs text-slate-600 mt-1 line-clamp-2">{task.description}</p>
                        )}
                        <div className="flex gap-1 mt-2 flex-wrap">
                            <Badge className={`text-xs ${priorityColors[task.priority]}`}>
                                {task.priority}
                            </Badge>
                            {task.due_date && (
                                <Badge variant="outline" className="text-xs flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    {formatDistanceToNow(new Date(task.due_date), { locale: he })}
                                </Badge>
                            )}
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}