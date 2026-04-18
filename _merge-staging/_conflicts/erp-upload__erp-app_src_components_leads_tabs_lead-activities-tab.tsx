import { useQuery } from '@tanstack/react-query';
import { entityFilter } from '@/lib/entity-api';
import { Card, CardContent } from "@/components/ui/card";
import { Phone, Mail, MessageCircle, User } from 'lucide-react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import type { LucideIcon } from 'lucide-react';

interface LeadActivity {
  id: number | string;
  lead_id: number | string;
  type: string;
  description: string;
  created_date: string;
}

interface LeadActivitiesTabProps {
  leadId: number | string;
}

export default function LeadActivitiesTab({ leadId }: LeadActivitiesTabProps) {
  const { data: activities = [], isLoading } = useQuery({
    queryKey: ['activities', leadId],
    queryFn: () => entityFilter<LeadActivity>("lead-activities", { lead_id: leadId })
  });

  const getIcon = (type: string): LucideIcon => {
    switch(type) {
      case 'call': return Phone;
      case 'email': return Mail;
      case 'meeting': return User;
      default: return MessageCircle;
    }
  };

  if (isLoading) return <div className="p-6">טוען פעילויות...</div>;

  return (
    <div className="space-y-4">
      {activities.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-slate-500">
            אין פעילויות עדיין
          </CardContent>
        </Card>
      ) : (
        activities.map(activity => {
          const Icon = getIcon(activity.type);
          return (
            <Card key={activity.id}>
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">{activity.type}</span>
                      <span className="text-sm text-slate-500">
                        {format(new Date(activity.created_date), 'dd/MM/yyyy HH:mm', {locale: he})}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 whitespace-pre-wrap">{activity.description}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
