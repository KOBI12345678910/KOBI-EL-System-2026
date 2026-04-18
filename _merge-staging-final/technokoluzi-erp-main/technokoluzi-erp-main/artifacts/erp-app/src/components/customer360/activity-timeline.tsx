import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mail, Phone, MessageCircle, FileText, Calendar, User } from 'lucide-react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

export default function ActivityTimeline({ activities }) {
  const getActivityIcon = (type) => {
    const icons = {
      email: Mail,
      call: Phone,
      message: MessageCircle,
      note: FileText,
      meeting: Calendar,
      other: User
    };
    return icons[type] || icons.other;
  };

  const getActivityColor = (type) => {
    const colors = {
      email: 'text-blue-600',
      call: 'text-green-600',
      message: 'text-purple-600',
      note: 'text-amber-600',
      meeting: 'text-indigo-600',
      other: 'text-slate-600'
    };
    return colors[type] || colors.other;
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-indigo-600" />
          Recent Activities ({activities.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {activities.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-4">No activities yet</p>
          ) : (
            activities.map((activity, idx) => {
              const Icon = getActivityIcon(activity.type);
              return (
                <div key={activity.id} className="flex gap-4 pb-4 border-b border-slate-200 last:border-0">
                  <div className={`w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0`}>
                    <Icon className={`w-5 h-5 ${getActivityColor(activity.type)}`} />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-slate-900 text-sm">{activity.subject}</p>
                    <p className="text-xs text-slate-600 mt-1">{activity.description}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="outline" className="text-xs">{activity.type}</Badge>
                      <span className="text-xs text-slate-500">
                        {format(new Date(activity.date), 'dd MMM HH:mm', { locale: he })}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}