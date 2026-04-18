import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { entityFilter, entityCreate, entityUpdate } from '@/lib/entity-api';
import { authJson } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  MessageSquare, Phone, Mail, MessageCircle, Bell, FileText,
  TrendingUp, UserCheck, Pin, Send, Filter, Calendar, CheckSquare
} from 'lucide-react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

const activityIcons: Record<string, any> = {
  note: MessageSquare,
  call: Phone,
  email: Mail,
  whatsapp: MessageCircle,
  reminder: Bell,
  document_upload: FileText,
  status_change: TrendingUp,
  owner_changed: UserCheck,
  meeting: Calendar,
  task: CheckSquare
};

const activityColors: Record<string, string> = {
  note: 'bg-blue-50 border-blue-200 text-blue-700',
  call: 'bg-green-50 border-green-200 text-green-700',
  email: 'bg-purple-50 border-purple-200 text-purple-700',
  whatsapp: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  reminder: 'bg-orange-50 border-orange-200 text-orange-700',
  document_upload: 'bg-slate-50 border-slate-200 text-slate-700',
  status_change: 'bg-indigo-50 border-indigo-200 text-indigo-700',
  owner_changed: 'bg-pink-50 border-pink-200 text-pink-700',
  meeting: 'bg-cyan-50 border-cyan-200 text-cyan-700',
  task: 'bg-amber-50 border-amber-200 text-amber-700'
};

const activityLabels: Record<string, string> = {
  note: 'Note',
  call: 'Call',
  email: 'Email',
  whatsapp: 'WhatsApp',
  reminder: 'Reminder',
  document_upload: 'Document',
  status_change: 'Status Change',
  owner_changed: 'Owner Changed',
  meeting: 'Meeting',
  task: 'Task'
};

interface TimelineFeedProps {
  leadId: string;
}

interface TimelineItem {
  id: string;
  type: string;
  created_date: string;
  created_by: string;
  content: string;
  category?: string;
  pinned?: boolean;
  tag?: string;
  file_url?: string;
  status?: string;
  rawData: any;
}

export default function TimelineFeed({ leadId }: TimelineFeedProps) {
  const [quickNote, setQuickNote] = useState('');
  const [filterType, setFilterType] = useState('all');
  const queryClient = useQueryClient();

  const { data: notes = [] } = useQuery({
    queryKey: ['lead-notes', leadId],
    queryFn: () => entityFilter<any>("lead-notes", { lead_id: leadId })
  });

  const { data: activities = [] } = useQuery({
    queryKey: ['lead-activities', leadId],
    queryFn: () => entityFilter<any>("lead-activities", { lead_id: leadId })
  });

  const { data: documents = [] } = useQuery({
    queryKey: ['lead-documents', leadId],
    queryFn: () => entityFilter<any>("lead-documents", { lead_id: leadId })
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ['lead-tasks', leadId],
    queryFn: () => entityFilter<any>("tasks", { lead_id: leadId })
  });

  const { data: meetings = [] } = useQuery({
    queryKey: ['lead-meetings', leadId],
    queryFn: () => entityFilter<any>("meetings", { lead_id: leadId })
  });

  const addNoteMutation = useMutation({
    mutationFn: async (noteText: string) => {
      const user = await authJson("/api/auth/me");
      return entityCreate("lead-notes", {
        lead_id: leadId,
        note_text: noteText,
        category: 'general',
        pinned: false
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-notes', leadId] });
      setQuickNote('');
    }
  });

  const handleQuickNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (quickNote.trim()) {
      addNoteMutation.mutate(quickNote);
    }
  };

  const allTimelineItems: TimelineItem[] = [
    ...notes.map((n: any) => ({
      id: `note-${n.id}`,
      type: 'note',
      created_date: n.created_date,
      created_by: n.created_by,
      content: n.note_text,
      category: n.category,
      pinned: n.pinned,
      rawData: n
    })),
    ...activities.map((a: any) => ({
      id: `activity-${a.id}`,
      type: a.type,
      created_date: a.created_date,
      created_by: a.user_id || a.created_by,
      content: a.description,
      rawData: a
    })),
    ...documents.map((d: any) => ({
      id: `doc-${d.id}`,
      type: 'document_upload',
      created_date: d.created_date,
      created_by: d.uploaded_by,
      content: `Document uploaded: ${d.file_name}`,
      tag: d.tag,
      file_url: d.file_url,
      rawData: d
    })),
    ...tasks.map((t: any) => ({
      id: `task-${t.id}`,
      type: 'task',
      created_date: t.created_date,
      created_by: t.created_by,
      content: `Task: ${t.title}${t.status === 'done' ? ' (done)' : ''}`,
      status: t.status,
      rawData: t
    })),
    ...meetings.map((m: any) => ({
      id: `meeting-${m.id}`,
      type: 'meeting',
      created_date: m.meeting_date || m.created_date,
      created_by: m.created_by,
      content: `Meeting: ${m.title || 'Untitled'}`,
      rawData: m
    }))
  ].sort((a, b) => new Date(b.created_date).getTime() - new Date(a.created_date).getTime());

  const timelineItems = filterType === 'all'
    ? allTimelineItems
    : allTimelineItems.filter(item => item.type === filterType);

  const counts = allTimelineItems.reduce((acc: Record<string, number>, item) => {
    acc[item.type] = (acc[item.type] || 0) + 1;
    return acc;
  }, {});

  const togglePinMutation = useMutation({
    mutationFn: ({ noteId, pinned }: { noteId: string; pinned: boolean }) =>
      entityUpdate("lead-notes", noteId, { pinned: !pinned }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-notes', leadId] });
    }
  });

  return (
    <div className="space-y-4">
      {/* Header with Filters */}
      <Card className="border-0 shadow-lg">
        <CardHeader className="bg-gradient-to-r from-slate-800 to-slate-900 text-white pb-4">
          <CardTitle className="text-lg font-bold flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
            Activity Timeline
            <Badge className="bg-white/20 text-white border-white/30">
              {allTimelineItems.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-2 mb-4">
            <Button
              size="sm"
              variant={filterType === 'all' ? 'default' : 'outline'}
              onClick={() => setFilterType('all')}
              className="gap-2"
            >
              <Filter className="w-4 h-4" />
              All ({allTimelineItems.length})
            </Button>
            {Object.entries(counts).map(([type, count]) => {
              const Icon = activityIcons[type];
              return (
                <Button
                  key={type}
                  size="sm"
                  variant={filterType === type ? 'default' : 'outline'}
                  onClick={() => setFilterType(type)}
                  className="gap-2"
                >
                  <Icon className="w-4 h-4" />
                  {activityLabels[type]} ({count})
                </Button>
              );
            })}
          </div>

          {/* Quick Note Input */}
          <form onSubmit={handleQuickNote} className="flex gap-2">
            <Input
              value={quickNote}
              onChange={(e) => setQuickNote(e.target.value)}
              placeholder="Write a quick note..."
              className="flex-1"
              data-test="quick-note-input"
            />
            <Button type="submit" disabled={!quickNote.trim() || addNoteMutation.isPending}>
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Timeline Feed */}
      <div className="space-y-3" data-test="timeline-feed">
        {timelineItems.map((item) => {
          const Icon = activityIcons[item.type] || MessageSquare;
          const colorClass = activityColors[item.type] || 'bg-slate-50 border-slate-200 text-slate-700';

          return (
            <Card key={item.id} className={`border ${item.pinned ? 'border-yellow-400 shadow-md' : ''}`}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg border ${colorClass}`}>
                    <Icon className="w-4 h-4" />
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-slate-900">
                        {item.created_by || 'System'}
                      </span>
                      <span className="text-xs text-slate-500">
                        {format(new Date(item.created_date), 'dd/MM/yyyy HH:mm', { locale: he })}
                      </span>
                      {item.category && (
                        <Badge variant="outline" className="text-xs">
                          {item.category}
                        </Badge>
                      )}
                      {item.tag && (
                        <Badge variant="outline" className="text-xs">
                          {item.tag}
                        </Badge>
                      )}
                    </div>

                    <p className="text-sm text-slate-700 whitespace-pre-wrap">
                      {item.content}
                    </p>

                    {item.file_url && (
                      <a
                        href={item.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline mt-2 inline-block"
                      >
                        Open file
                      </a>
                    )}
                  </div>

                  {item.type === 'note' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => togglePinMutation.mutate({
                        noteId: item.rawData.id,
                        pinned: item.pinned || false
                      })}
                      className={item.pinned ? 'text-yellow-600' : 'text-slate-400'}
                    >
                      <Pin className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}

        {timelineItems.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-slate-500">
              No activity yet
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
