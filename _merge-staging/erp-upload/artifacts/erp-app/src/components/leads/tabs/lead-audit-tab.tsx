import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, Clock, User } from 'lucide-react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface Lead {
  id: number | string;
  created_by?: string;
  created_date: string;
  updated_date: string;
  archived?: boolean;
}

interface LeadAuditTabProps {
  leadId: number | string;
  lead: Lead;
}

interface AuditRowProps {
  icon?: LucideIcon;
  label: string;
  value: ReactNode;
}

export default function LeadAuditTab({ leadId, lead }: LeadAuditTabProps) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="w-5 h-5" />
            מידע מערכתי
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <AuditRow
            icon={User}
            label="נוצר על ידי"
            value={lead.created_by || '—'}
          />
          <AuditRow
            icon={Clock}
            label="תאריך יצירה"
            value={format(new Date(lead.created_date), 'dd/MM/yyyy HH:mm:ss', {locale: he})}
          />
          <AuditRow
            icon={Clock}
            label="עדכון אחרון"
            value={format(new Date(lead.updated_date), 'dd/MM/yyyy HH:mm:ss', {locale: he})}
          />
          <AuditRow
            label="Lead ID"
            value={lead.id}
          />
          <AuditRow
            label="סטטוס ארכיון"
            value={lead.archived ? (
              <Badge variant="destructive">בארכיון</Badge>
            ) : (
              <Badge>פעיל</Badge>
            )}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">הרשאות וגישה</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600">
            רק בעלים ומנהלים יכולים לערוך ליד זה.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function AuditRow({ icon: Icon, label, value }: AuditRowProps) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-100">
      <div className="flex items-center gap-2 text-sm text-slate-600">
        {Icon && <Icon className="w-4 h-4" />}
        <span>{label}</span>
      </div>
      <div className="text-sm font-medium text-slate-900">{value}</div>
    </div>
  );
}
