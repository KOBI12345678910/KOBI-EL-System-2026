import { useQuery } from '@tanstack/react-query';
import { entityFilter } from '@/lib/entity-api';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { Mail, Phone, Calendar, FileText, Zap, MessageSquare } from 'lucide-react';

interface LeadActivityProps {
  leadId: string;
}

interface Activity {
  id: string;
  type: string;
  description?: string;
  user_id?: string;
  created_date: string;
}

export default function LeadActivity({ leadId }: LeadActivityProps) {
  const { data: activities = [] } = useQuery({
    queryKey: ['leadActivity', leadId],
    queryFn: () => entityFilter<Activity>("lead-activities", { lead_id: leadId })
  });

  const typeIcons: Record<string, JSX.Element> = {
    email: <Mail className="w-4 h-4" />,
    call: <Phone className="w-4 h-4" />,
    meeting: <Calendar className="w-4 h-4" />,
    note: <MessageSquare className="w-4 h-4" />,
    status_change: <Zap className="w-4 h-4" />,
    document_upload: <FileText className="w-4 h-4" />
  };

  const typeLabels: Record<string, string> = {
    email: 'Email',
    call: 'Call',
    meeting: 'Meeting',
    note: 'Note',
    status_change: 'Status Change',
    document_upload: 'Document Upload'
  };

  return (
    <div className="space-y-4">
      {activities.map(activity => (
        <Card key={activity.id}>
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <div className="text-slate-400 mt-1">
                {typeIcons[activity.type] || <Zap className="w-4 h-4" />}
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-start mb-1">
                  <Badge variant="outline">{typeLabels[activity.type] || activity.type}</Badge>
                  <p className="text-xs text-slate-500">
                    {format(new Date(activity.created_date), 'dd/MM/yyyy HH:mm', { locale: he })}
                  </p>
                </div>
                <p className="text-sm text-slate-600">{activity.description}</p>
                <p className="text-xs text-slate-500 mt-2">By: {activity.user_id}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
      {activities.length === 0 && (
        <p className="text-center text-slate-500 py-8">No activity history yet</p>
      )}
    </div>
  );
}
