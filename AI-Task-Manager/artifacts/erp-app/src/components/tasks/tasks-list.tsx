import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, Trash2, Edit, Filter } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { entityDelete, entityFilter, entityUpdate } from "@/lib/entity-api";

const priorityColors = {
  low: 'bg-blue-100 text-blue-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800'
};

const statusIcons = {
  pending: <Circle className="w-4 h-4 text-slate-400" />,
  in_progress: <Circle className="w-4 h-4 text-blue-500 fill-blue-500" />,
  completed: <CheckCircle2 className="w-4 h-4 text-green-500" />,
  cancelled: <Circle className="w-4 h-4 text-slate-300 line-through" />
};

export default function TasksList({ filter, onEdit, onRefresh }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');

  useEffect(() => {
    loadTasks();
  }, [filter, statusFilter, priorityFilter]);

  const loadTasks = async () => {
    try {
      setLoading(true);
      let query = {};
      
      if (filter?.type && filter?.id) {
        query.related_entity_type = filter.type;
        query.related_entity_id = filter.id;
      }
      if (statusFilter !== 'all') query.status = statusFilter;
      if (priorityFilter !== 'all') query.priority = priorityFilter;

      const data = await entityFilter<any>("tasks", query, '-due_date');
      setTasks(data);
    } catch (error) {
      console.error('Error loading tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const deleteTask = async (id) => {
    if (window.confirm('Delete this task?')) {
      try {
        await entityDelete("tasks", id);
        loadTasks();
      } catch (error) {
        console.error('Error deleting task:', error);
      }
    }
  };

  const toggleStatus = async (task) => {
    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    try {
      await entityUpdate<any>("tasks", task.id, { status: newStatus });
      loadTasks();
    } catch (error) {
      console.error('Error updating task:', error);
    }
  };

  if (loading) {
    return <Card className="border-0 shadow-sm bg-slate-50"><CardContent className="p-8 text-center text-slate-600">Loading tasks...</CardContent></Card>;
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>

        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {tasks.length === 0 ? (
        <Card className="border-0 shadow-sm bg-slate-50">
          <CardContent className="p-8 text-center text-slate-600">No tasks found</CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tasks.map(task => (
            <Card key={task.id} className="border-0 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <button
                    onClick={() => toggleStatus(task)}
                    className="mt-1 hover:opacity-70 transition-opacity"
                  >
                    {statusIcons[task.status]}
                  </button>
                  
                  <div className="flex-1 min-w-0">
                    <h3 className={`font-semibold text-slate-900 ${task.status === 'completed' ? 'line-through text-slate-500' : ''}`}>
                      {task.title}
                    </h3>
                    {task.description && <p className="text-sm text-slate-600 mt-1">{task.description}</p>}
                    
                    <div className="flex flex-wrap gap-2 mt-3">
                      <Badge className={priorityColors[task.priority]}>
                        {task.priority}
                      </Badge>
                      {task.assigned_to && <Badge variant="outline">{task.assigned_to.split('@')[0]}</Badge>}
                      {task.due_date && (
                        <Badge variant="outline">
                          Due {formatDistanceToNow(new Date(task.due_date), { addSuffix: true })}
                        </Badge>
                      )}
                      {task.tags?.map((tag, idx) => (
                        <Badge key={idx} variant="secondary">{tag}</Badge>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => onEdit(task)}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => deleteTask(task.id)} className="text-red-600 hover:bg-red-50">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}