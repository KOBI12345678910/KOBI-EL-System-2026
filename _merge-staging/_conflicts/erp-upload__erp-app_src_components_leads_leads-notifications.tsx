import { useMemo } from 'react';
import { entityList } from '@/lib/entity-api';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, AlertCircle, Clock, CheckCircle2 } from 'lucide-react';
import { Link } from 'wouter';
import { createPageUrl } from '@/lib/route-map';
import { formatDistanceToNow } from 'date-fns';
import { he } from 'date-fns/locale';

interface Alert {
  id: string;
  lead: any;
  type: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  icon: any;
}

export default function LeadsNotifications() {
  const { data: leads = [] } = useQuery({
    queryKey: ['leadsForNotifications'],
    queryFn: () => entityList<any>("leads")
  });

  const alerts = useMemo<Alert[]>(() => {
    const issues: Alert[] = [];

    leads.forEach((lead: any) => {
      const now = new Date();
      const createdDate = new Date(lead.created_date);
      const daysSinceCreation = (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24);

      if (lead.status === 'new' && daysSinceCreation > 3) {
        issues.push({
          id: `untreated-${lead.id}`,
          lead,
          type: 'untreated',
          severity: 'critical',
          message: `Lead "${lead.name}" untreated for ${Math.floor(daysSinceCreation)} days`,
          icon: AlertTriangle
        });
      }

      if (lead.status === 'contacted' && daysSinceCreation > 5) {
        issues.push({
          id: `stalled-${lead.id}`,
          lead,
          type: 'stalled',
          severity: 'warning',
          message: `Lead "${lead.name}" stalled - not assigned to anyone`,
          icon: AlertCircle
        });
      }

      if (!lead.phone || !lead.company) {
        const missing: string[] = [];
        if (!lead.phone) missing.push('phone');
        if (!lead.company) missing.push('company');

        issues.push({
          id: `incomplete-${lead.id}`,
          lead,
          type: 'incomplete',
          severity: 'info',
          message: `Lead "${lead.name}" missing: ${missing.join(', ')}`,
          icon: Clock
        });
      }

      if (['proposal', 'negotiation'].includes(lead.status) && !lead.owner_id) {
        issues.push({
          id: `no-owner-${lead.id}`,
          lead,
          type: 'no_owner',
          severity: 'warning',
          message: `Lead "${lead.name}" in proposal/negotiation without owner`,
          icon: AlertCircle
        });
      }
    });

    return issues.sort((a, b) => {
      const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }, [leads]);

  const severityColors: Record<string, string> = {
    critical: 'bg-red-100 border-red-300',
    warning: 'bg-yellow-100 border-yellow-300',
    info: 'bg-blue-100 border-blue-300'
  };

  const severityBadgeColors: Record<string, string> = {
    critical: 'bg-red-600',
    warning: 'bg-yellow-600',
    info: 'bg-blue-600'
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">System Alerts</h3>
        <Badge variant="outline">{alerts.length} alerts</Badge>
      </div>

      {alerts.length === 0 ? (
        <Card className="border-green-300 bg-green-50">
          <CardContent className="pt-6 flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-green-600" />
            <p className="text-sm text-green-700">All leads are in good shape!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {alerts.map(alert => {
            const IconComponent = alert.icon;
            return (
              <Link
                key={alert.id}
                href={createPageUrl('LeadDetail') + `?id=${alert.lead.id}`}
              >
                <Card className={`cursor-pointer hover:shadow-md transition border ${severityColors[alert.severity]}`}>
                  <CardContent className="p-4 flex items-start gap-3">
                    <IconComponent className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                      alert.severity === 'critical' ? 'text-red-600' :
                      alert.severity === 'warning' ? 'text-yellow-600' :
                      'text-blue-600'
                    }`} />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{alert.message}</p>
                      <div className="flex gap-2 mt-2">
                        <Badge className="text-xs" variant="outline">
                          {alert.lead.source}
                        </Badge>
                        <Badge className={`text-xs text-white ${severityBadgeColors[alert.severity]}`}>
                          {alert.severity === 'critical' ? 'Urgent' :
                           alert.severity === 'warning' ? 'Warning' :
                           'Info'}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
