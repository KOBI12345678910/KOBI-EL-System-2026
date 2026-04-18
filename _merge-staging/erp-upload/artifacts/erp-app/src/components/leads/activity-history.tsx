import { useQuery } from '@tanstack/react-query';
import { entityFilter, entityList } from '@/lib/entity-api';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Phone, Mail, MessageSquare, FileText, UserPlus,
  Edit, Calendar, CheckCircle, Clock, Activity
} from 'lucide-react';
import moment from 'moment';

interface ActivityHistoryProps {
  leadId: string;
}

interface ActivityItem {
  id: string;
  activity_type: string;
  title?: string;
  description?: string;
  created_by?: string;
  created_date: string;
  metadata?: Record<string, any>;
}

interface User {
  id: string;
  full_name?: string;
}

const ACTIVITY_ICONS: Record<string, any> = {
  call: Phone,
  email: Mail,
  whatsapp: MessageSquare,
  meeting: Calendar,
  note: FileText,
  status_change: Activity,
  assigned: UserPlus,
  updated: Edit,
  created: CheckCircle
};

const ACTIVITY_COLORS: Record<string, string> = {
  call: 'bg-blue-100 text-blue-800',
  email: 'bg-purple-100 text-purple-800',
  whatsapp: 'bg-green-100 text-green-800',
  meeting: 'bg-indigo-100 text-indigo-800',
  note: 'bg-yellow-100 text-yellow-800',
  status_change: 'bg-orange-100 text-orange-800',
  assigned: 'bg-pink-100 text-pink-800',
  updated: 'bg-slate-100 text-slate-800',
  created: 'bg-emerald-100 text-emerald-800'
};

export default function ActivityHistory({ leadId }: ActivityHistoryProps) {
  const { data: activities = [], isLoading } = useQuery({
    queryKey: ['leadActivities', leadId],
    queryFn: async () => {
      const activities = await entityFilter<ActivityItem>("activities", {
        lead_id: leadId
      });
      return activities.sort((a, b) =>
        new Date(b.created_date).getTime() - new Date(a.created_date).getTime()
      );
    }
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => entityList<User>("users")
  });

  const getUserName = (userId?: string): string => {
    const user = users.find(u => u.id === userId);
    return user?.full_name || 'User';
  };

  const getUserInitial = (userId?: string): string => {
    const user = users.find(u => u.id === userId);
    return user?.full_name?.charAt(0) || 'U';
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-slate-500">
          Loading history...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="w-5 h-5" />
          Activity History ({activities.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <div className="space-y-4">
          {activities.map((activity, index) => {
            const Icon = ACTIVITY_ICONS[activity.activity_type] || Activity;
            const colorClass = ACTIVITY_COLORS[activity.activity_type] || 'bg-slate-100 text-slate-800';

            return (
              <div key={activity.id} className="flex gap-4 relative">
                {index < activities.length - 1 && (
                  <div className="absolute right-[27px] top-12 bottom-0 w-0.5 bg-slate-200" />
                )}

                <div className={`w-12 h-12 rounded-full ${colorClass} flex items-center justify-center flex-shrink-0`}>
                  <Icon className="w-5 h-5" />
                </div>

                <div className="flex-1 pb-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className="font-semibold text-slate-900">
                        {activity.title || 'Activity'}
                      </h4>
                      <div className="flex items-center gap-2 mt-1">
                        <Avatar className="w-5 h-5">
                          <AvatarFallback className="text-xs bg-blue-100 text-blue-700">
                            {getUserInitial(activity.created_by)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm text-slate-600">
                          {getUserName(activity.created_by)}
                        </span>
                        <span className="text-xs text-slate-400">&bull;</span>
                        <span className="text-sm text-slate-500">
                          {moment(activity.created_date).fromNow()}
                        </span>
                      </div>
                    </div>
                    <Badge className={colorClass}>
                      {activity.activity_type === 'call' && 'Call'}
                      {activity.activity_type === 'email' && 'Email'}
                      {activity.activity_type === 'whatsapp' && 'WhatsApp'}
                      {activity.activity_type === 'meeting' && 'Meeting'}
                      {activity.activity_type === 'note' && 'Note'}
                      {activity.activity_type === 'status_change' && 'Status Change'}
                      {activity.activity_type === 'assigned' && 'Assigned'}
                      {activity.activity_type === 'updated' && 'Updated'}
                      {activity.activity_type === 'created' && 'Created'}
                    </Badge>
                  </div>

                  {activity.description && (
                    <p className="text-sm text-slate-700 mt-2 bg-slate-50 p-3 rounded-lg">
                      {activity.description}
                    </p>
                  )}

                  {activity.metadata && (
                    <div className="mt-2 text-xs text-slate-500">
                      {Object.entries(activity.metadata).map(([key, value]) => (
                        <div key={key} className="flex gap-2">
                          <span className="font-medium">{key}:</span>
                          <span>{JSON.stringify(value)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {activities.length === 0 && (
            <div className="text-center py-8 text-slate-500">
              <Activity className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p>No activities yet</p>
              <p className="text-sm mt-1">All actions on the lead will be displayed here</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
