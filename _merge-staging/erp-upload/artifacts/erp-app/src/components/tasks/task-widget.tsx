import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertCircle, Plus } from 'lucide-react';
import { Link } from "wouter";
import { createPageUrl } from "@/lib/route-map";
import { entityFilter, entityList } from "@/lib/entity-api";

export default function TaskWidget({ limit = 5 }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ pending: 0, in_progress: 0, completed: 0 });

  useEffect(() => {
    loadTasks();
  }, []);

  const loadTasks = async () => {
    try {
      const data = await entityFilter<any>("tasks", {}, '-due_date', limit);
      setTasks(data);

      // Calculate stats
      const allTasks = await entityList<any>("tasks");
      const counts = {
        pending: allTasks.filter(t => t.status === 'pending').length,
        in_progress: allTasks.filter(t => t.status === 'in_progress').length,
        completed: allTasks.filter(t => t.status === 'completed').length
      };
      setStats(counts);
    } catch (error) {
      console.error('Error loading tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-lg">Tasks</CardTitle>
        <Link to={createPageUrl('Tasks')}>
          <Button size="sm" variant="outline">View All</Button>
        </Link>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-yellow-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
            <p className="text-xs text-yellow-700">Pending</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-blue-600">{stats.in_progress}</p>
            <p className="text-xs text-blue-700">In Progress</p>
          </div>
          <div className="bg-green-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
            <p className="text-xs text-green-700">Completed</p>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-slate-600 text-center py-4">Loading...</p>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-slate-600 text-center py-4">No tasks yet</p>
        ) : (
          <div className="space-y-2">
            {tasks.slice(0, limit).map(task => (
              <div key={task.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{task.title}</p>
                  <p className="text-xs text-slate-600">{task.assigned_to?.split('@')[0]}</p>
                </div>
                <Badge className="text-xs">{task.priority}</Badge>
              </div>
            ))}
          </div>
        )}

        <Link to={createPageUrl('Tasks')}>
          <Button className="w-full bg-purple-600 hover:bg-purple-700" size="sm">
            <Plus className="w-4 h-4 mr-2" />
            New Task
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}