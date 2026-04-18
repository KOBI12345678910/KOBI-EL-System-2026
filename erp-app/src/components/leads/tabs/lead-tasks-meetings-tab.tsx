import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { entityFilter, entityUpdate } from '@/lib/entity-api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import {
  CheckSquare, Calendar, Plus, Clock, User, Flag, Video, MapPin,
  CheckCircle2, Circle, AlertCircle, Play
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import CreateTaskModal from '../modals/CreateTaskModal';
import CreateMeetingModal from '../modals/CreateMeetingModal';
import type { LucideIcon } from 'lucide-react';

/* ─── Types ─── */

interface Lead {
  id: number | string;
}

interface Task {
  id: number | string;
  lead_id: number | string;
  title: string;
  description?: string;
  status: string;
  priority?: string;
  due_date?: string;
  assigned_to?: string;
  category?: string;
  completed_at?: string | null;
  created_date: string;
}

interface Meeting {
  id: number | string;
  lead_id: number | string;
  title: string;
  description?: string;
  meeting_type?: string;
  meeting_date: string;
  duration_minutes?: number;
  location?: string;
  status: string;
}

interface LeadTasksMeetingsTabProps {
  lead: Lead;
}

export default function LeadTasksMeetingsTab({ lead }: LeadTasksMeetingsTabProps) {
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [createMeetingOpen, setCreateMeetingOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: tasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ['lead-tasks', lead.id],
    queryFn: () => entityFilter<Task>("tasks", { lead_id: lead.id })
  });

  const { data: meetings = [], isLoading: meetingsLoading } = useQuery({
    queryKey: ['lead-meetings', lead.id],
    queryFn: () => entityFilter<Meeting>("meetings", { lead_id: lead.id })
  });

  const toggleTaskMutation = useMutation({
    mutationFn: ({ taskId, currentStatus }: { taskId: number | string; currentStatus: string }) => {
      const newStatus = currentStatus === 'done' ? 'todo' : 'done';
      return entityUpdate<Task>("tasks", taskId, {
        status: newStatus,
        completed_at: newStatus === 'done' ? new Date().toISOString() : null
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-tasks', lead.id] });
      toast.success('המשימה עודכנה');
    }
  });

  const updateMeetingStatusMutation = useMutation({
    mutationFn: ({ meetingId, status }: { meetingId: number | string; status: string }) =>
      entityUpdate<Meeting>("meetings", meetingId, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-meetings', lead.id] });
      toast.success('הפגישה עודכנה');
    }
  });

  const pendingTasks = tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled');
  const completedTasks = tasks.filter(t => t.status === 'done');
  const upcomingMeetings = meetings.filter(m => m.status === 'scheduled');
  const pastMeetings = meetings.filter(m => m.status === 'completed' || m.status === 'cancelled');

  const getPriorityColor = (priority?: string): string => {
    const colors: Record<string, string> = {
      low: 'bg-blue-100 text-blue-700',
      medium: 'bg-yellow-100 text-yellow-700',
      high: 'bg-orange-100 text-orange-700',
      critical: 'bg-red-100 text-red-700'
    };
    return colors[priority ?? 'medium'] || colors.medium;
  };

  const getMeetingTypeIcon = (type?: string): LucideIcon => {
    const icons: Record<string, LucideIcon> = {
      video: Video,
      phone: Play,
      in_person: MapPin
    };
    return icons[type ?? ''] || MapPin;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="border-0 shadow-xl">
        <CardHeader className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-bold flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <CheckSquare className="w-5 h-5" />
              </div>
              משימות ופגישות
              <div className="flex gap-2">
                <Badge className="bg-white/20 text-white border-white/30">
                  {pendingTasks.length} משימות פעילות
                </Badge>
                <Badge className="bg-white/20 text-white border-white/30">
                  {upcomingMeetings.length} פגישות קרובות
                </Badge>
              </div>
            </CardTitle>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => setCreateTaskOpen(true)}
                className="gap-2 bg-white/20 hover:bg-white/30 text-white border-white/30"
              >
                <Plus className="w-4 h-4" />
                משימה חדשה
              </Button>
              <Button
                size="sm"
                onClick={() => setCreateMeetingOpen(true)}
                className="gap-2 bg-white/20 hover:bg-white/30 text-white border-white/30"
              >
                <Plus className="w-4 h-4" />
                פגישה חדשה
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="tasks" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="tasks" className="gap-2">
            <CheckSquare className="w-4 h-4" />
            משימות ({tasks.length})
          </TabsTrigger>
          <TabsTrigger value="meetings" className="gap-2">
            <Calendar className="w-4 h-4" />
            פגישות ({meetings.length})
          </TabsTrigger>
        </TabsList>

        {/* Tasks Tab */}
        <TabsContent value="tasks" className="space-y-4">
          {pendingTasks.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Circle className="w-4 h-4 text-orange-500" />
                  משימות פעילות ({pendingTasks.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {pendingTasks.map(task => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    onToggle={() => toggleTaskMutation.mutate({ taskId: task.id, currentStatus: task.status })}
                    getPriorityColor={getPriorityColor}
                  />
                ))}
              </CardContent>
            </Card>
          )}

          {completedTasks.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  משימות שהושלמו ({completedTasks.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {completedTasks.map(task => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    onToggle={() => toggleTaskMutation.mutate({ taskId: task.id, currentStatus: task.status })}
                    getPriorityColor={getPriorityColor}
                  />
                ))}
              </CardContent>
            </Card>
          )}

          {tasks.length === 0 && (
            <Card>
              <CardContent className="p-12 text-center text-slate-500">
                אין משימות עדיין. צור משימה חדשה כדי להתחיל.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Meetings Tab */}
        <TabsContent value="meetings" className="space-y-4">
          {upcomingMeetings.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-indigo-500" />
                  פגישות קרובות ({upcomingMeetings.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {upcomingMeetings.map(meeting => (
                  <MeetingItem
                    key={meeting.id}
                    meeting={meeting}
                    onUpdateStatus={(status) => updateMeetingStatusMutation.mutate({ meetingId: meeting.id, status })}
                    getMeetingTypeIcon={getMeetingTypeIcon}
                  />
                ))}
              </CardContent>
            </Card>
          )}

          {pastMeetings.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  פגישות שהיו ({pastMeetings.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {pastMeetings.map(meeting => (
                  <MeetingItem
                    key={meeting.id}
                    meeting={meeting}
                    onUpdateStatus={(status) => updateMeetingStatusMutation.mutate({ meetingId: meeting.id, status })}
                    getMeetingTypeIcon={getMeetingTypeIcon}
                  />
                ))}
              </CardContent>
            </Card>
          )}

          {meetings.length === 0 && (
            <Card>
              <CardContent className="p-12 text-center text-slate-500">
                אין פגישות עדיין. קבע פגישה חדשה כדי להתחיל.
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <CreateTaskModal open={createTaskOpen} onClose={() => setCreateTaskOpen(false)} leadId={lead.id} />
      <CreateMeetingModal open={createMeetingOpen} onClose={() => setCreateMeetingOpen(false)} leadId={lead.id} />
    </div>
  );
}

/* ─── Sub-components ─── */

interface TaskItemProps {
  task: Task;
  onToggle: () => void;
  getPriorityColor: (priority?: string) => string;
}

function TaskItem({ task, onToggle, getPriorityColor }: TaskItemProps) {
  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done';

  return (
    <div className={`flex items-start gap-3 p-4 rounded-xl border ${task.status === 'done' ? 'bg-slate-50 border-slate-200' : 'bg-white border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all'}`}>
      <Checkbox
        checked={task.status === 'done'}
        onCheckedChange={onToggle}
        className="mt-1"
      />
      <div className="flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <h4 className={`font-semibold ${task.status === 'done' ? 'text-slate-500 line-through' : 'text-slate-900'}`}>
              {task.title}
            </h4>
            {task.description && (
              <p className="text-sm text-slate-600 mt-1">{task.description}</p>
            )}
          </div>
          <Badge className={getPriorityColor(task.priority)}>
            {task.priority === 'critical' ? 'קריטי' : task.priority === 'high' ? 'גבוה' : task.priority === 'medium' ? 'בינוני' : 'נמוך'}
          </Badge>
        </div>

        <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
          {task.due_date && (
            <div className={`flex items-center gap-1 ${isOverdue ? 'text-red-600 font-semibold' : ''}`}>
              <Clock className="w-3 h-3" />
              {format(new Date(task.due_date), 'dd/MM/yyyy HH:mm')}
              {isOverdue && <AlertCircle className="w-3 h-3" />}
            </div>
          )}
          {task.assigned_to && (
            <div className="flex items-center gap-1">
              <User className="w-3 h-3" />
              {task.assigned_to}
            </div>
          )}
          {task.category && (
            <Badge variant="outline" className="text-xs">
              {task.category}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

interface MeetingItemProps {
  meeting: Meeting;
  onUpdateStatus: (status: string) => void;
  getMeetingTypeIcon: (type?: string) => LucideIcon;
}

function MeetingItem({ meeting, onUpdateStatus, getMeetingTypeIcon }: MeetingItemProps) {
  const Icon = getMeetingTypeIcon(meeting.meeting_type);
  const isPast = new Date(meeting.meeting_date) < new Date();

  return (
    <div className={`p-4 rounded-xl border ${meeting.status === 'completed' ? 'bg-slate-50 border-slate-200' : 'bg-white border-slate-200 hover:border-emerald-300 hover:shadow-md transition-all'}`}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center">
          <Icon className="w-5 h-5 text-emerald-600" />
        </div>

        <div className="flex-1">
          <h4 className="font-semibold text-slate-900">{meeting.title}</h4>
          {meeting.description && (
            <p className="text-sm text-slate-600 mt-1">{meeting.description}</p>
          )}

          <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
            <div className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {format(new Date(meeting.meeting_date), 'dd/MM/yyyy HH:mm')}
            </div>
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {meeting.duration_minutes} דקות
            </div>
            {meeting.location && (
              <div className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {meeting.location.substring(0, 30)}...
              </div>
            )}
          </div>

          {meeting.status === 'scheduled' && isPast && (
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={() => onUpdateStatus('completed')}>
                סמן כהושלמה
              </Button>
              <Button size="sm" variant="outline" onClick={() => onUpdateStatus('no_show')}>
                לא הגיע
              </Button>
            </div>
          )}
        </div>

        <Badge className={
          meeting.status === 'completed' ? 'bg-green-100 text-green-700' :
          meeting.status === 'cancelled' ? 'bg-red-100 text-red-700' :
          meeting.status === 'no_show' ? 'bg-orange-100 text-orange-700' :
          'bg-blue-100 text-blue-700'
        }>
          {meeting.status === 'scheduled' ? 'מתוכנן' :
           meeting.status === 'completed' ? 'הושלם' :
           meeting.status === 'cancelled' ? 'בוטל' : 'לא הגיע'}
        </Badge>
      </div>
    </div>
  );
}
