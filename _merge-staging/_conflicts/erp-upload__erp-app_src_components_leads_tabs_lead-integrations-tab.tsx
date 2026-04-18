import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  CheckCircle2, XCircle, AlertCircle, Calendar, Mail,
  MessageCircle, Database, Clock, RefreshCw, Settings
} from 'lucide-react';
import { Link } from 'wouter';
import { createPageUrl } from '@/lib/route-map';
import type { LucideIcon } from 'lucide-react';

/* ─── Types ─── */

interface IntegrationStatus {
  whatsapp_synced?: boolean;
  email_synced?: boolean;
  calendar_synced?: boolean;
  erp_synced?: boolean;
  last_sync_date?: string;
  sync_errors?: string[];
}

interface Lead {
  id: number | string;
  phone?: string;
  integration_status?: IntegrationStatus;
}

interface IntegrationDef {
  name: string;
  icon: LucideIcon;
  synced?: boolean;
  description: string;
}

interface WebhookEvent {
  event: string;
  description: string;
  payload: Record<string, unknown>;
}

interface AutomationRule {
  name: string;
  trigger: string;
  action: string;
  status: string;
}

interface LeadIntegrationsTabProps {
  lead: Lead;
}

export default function LeadIntegrationsTab({ lead }: LeadIntegrationsTabProps) {
  const integrationStatus = lead?.integration_status || {} as IntegrationStatus;

  const integrations: IntegrationDef[] = [
    {
      name: 'WhatsApp',
      icon: MessageCircle,
      synced: integrationStatus?.whatsapp_synced,
      description: 'סנכרון הודעות WhatsApp'
    },
    {
      name: 'Email',
      icon: Mail,
      synced: integrationStatus?.email_synced,
      description: 'סנכרון אימיילים'
    },
    {
      name: 'Calendar',
      icon: Calendar,
      synced: integrationStatus?.calendar_synced,
      description: 'סנכרון פגישות ליומן'
    },
    {
      name: 'ERP',
      icon: Database,
      synced: integrationStatus?.erp_synced,
      description: 'סנכרון למערכת ERP'
    }
  ];

  const webhookEvents: WebhookEvent[] = [
    {
      event: 'lead.email.send_requested',
      description: 'בקשה לשליחת אימייל',
      payload: { to: 'customer@example.com', subject: 'הצעת מחיר' }
    },
    {
      event: 'lead.whatsapp.send_requested',
      description: 'בקשה לשליחת WhatsApp',
      payload: { phone: lead.phone, message: 'עדכון' }
    },
    {
      event: 'lead.status_changed',
      description: 'שינוי סטטוס',
      payload: { from: 'new', to: 'quoted' }
    },
    {
      event: 'lead.owner_changed',
      description: 'שינוי בעלות',
      payload: { from_user: 'user1', to_user: 'user2' }
    }
  ];

  const activeRules: AutomationRule[] = [
    {
      name: 'SLA - יצירת קשר ראשון',
      trigger: 'ליד חדש ללא פעילות 30 דקות',
      action: 'התראה למנהל + שינוי בעלים',
      status: 'active'
    },
    {
      name: 'Anti-stagnation',
      trigger: 'ליד ללא עדכון 7 ימים',
      action: 'יצירת משימה + תזכורת',
      status: 'active'
    },
    {
      name: 'Escalation',
      trigger: 'ליד דחוף ללא מענה',
      action: 'העברה למנהל',
      status: 'active'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Integration Status */}
      <Card>
        <CardHeader>
          <CardTitle>מצב אינטגרציות</CardTitle>
          <CardDescription>
            סטטוס סנכרון עם ערוצי תקשורת ומערכות חיצוניות
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {integrations.map((integration) => (
              <IntegrationItem key={integration.name} integration={integration} />
            ))}
          </div>

          {integrationStatus?.last_sync_date && (
            <div className="flex items-center gap-2 text-sm text-slate-600 pt-4 border-t">
              <Clock className="w-4 h-4" />
              <span>סנכרון אחרון:</span>
              <span className="font-medium">
                {new Date(integrationStatus.last_sync_date).toLocaleString('he-IL')}
              </span>
            </div>
          )}

          {integrationStatus?.sync_errors && integrationStatus.sync_errors.length > 0 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 mt-0.5" />
                <div className="flex-1">
                  <div className="font-medium text-red-900 text-sm">שגיאות סנכרון</div>
                  <ul className="mt-2 space-y-1">
                    {integrationStatus.sync_errors.map((error, i) => (
                      <li key={i} className="text-xs text-red-800">&#x2022; {error}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button variant="outline" size="sm" className="gap-2">
              <RefreshCw className="w-4 h-4" />
              סנכרן עכשיו
            </Button>
            <Link to={createPageUrl('IntegrationsManagement')}>
              <Button variant="outline" size="sm" className="gap-2">
                <Settings className="w-4 h-4" />
                הגדרות אינטגרציות
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Webhook Events */}
      <Card>
        <CardHeader>
          <CardTitle>אירועי Webhook זמינים</CardTitle>
          <CardDescription>
            אירועים שניתן להגדיר עבורם webhooks ל-n8n או מערכות חיצוניות
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {webhookEvents.map((event, i) => (
            <EventItem key={i} event={event} />
          ))}
        </CardContent>
      </Card>

      {/* Active Automation Rules */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>כללי אוטומציה פעילים</CardTitle>
              <CardDescription>כללים שחלים על ליד זה</CardDescription>
            </div>
            <Link to={createPageUrl('LeadAutomationBuilder')}>
              <Button variant="outline" size="sm">
                ניהול כללים
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {activeRules.map((rule, i) => (
            <AutomationRuleItem key={i} rule={rule} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function IntegrationItem({ integration }: { integration: IntegrationDef }) {
  const Icon = integration.icon;

  return (
    <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
      <div className={`p-2 rounded-lg ${integration.synced ? 'bg-green-100' : 'bg-slate-200'}`}>
        <Icon className={`w-5 h-5 ${integration.synced ? 'text-green-600' : 'text-slate-500'}`} />
      </div>
      <div className="flex-1">
        <div className="font-medium text-sm">{integration.name}</div>
        <div className="text-xs text-slate-600">{integration.description}</div>
      </div>
      {integration.synced ? (
        <CheckCircle2 className="w-5 h-5 text-green-600" />
      ) : (
        <XCircle className="w-5 h-5 text-slate-400" />
      )}
    </div>
  );
}

function EventItem({ event }: { event: WebhookEvent }) {
  return (
    <div className="p-3 bg-slate-50 rounded-lg">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="font-medium text-sm">{event.event}</div>
          <div className="text-xs text-slate-600">{event.description}</div>
        </div>
        <Badge variant="outline" className="text-xs">webhook</Badge>
      </div>
      <pre className="text-xs bg-slate-900 text-slate-100 p-2 rounded overflow-x-auto">
        {JSON.stringify(event.payload, null, 2)}
      </pre>
    </div>
  );
}

function AutomationRuleItem({ rule }: { rule: AutomationRule }) {
  return (
    <div className="p-3 bg-slate-50 rounded-lg">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <div className="font-medium text-sm">{rule.name}</div>
          <div className="text-xs text-slate-600 mt-1">
            <span className="font-medium">טריגר:</span> {rule.trigger}
          </div>
          <div className="text-xs text-slate-600">
            <span className="font-medium">פעולה:</span> {rule.action}
          </div>
        </div>
        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
          פעיל
        </Badge>
      </div>
    </div>
  );
}
