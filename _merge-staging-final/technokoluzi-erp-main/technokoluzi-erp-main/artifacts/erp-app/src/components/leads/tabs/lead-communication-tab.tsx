import { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { entityFilter, entityCreate, entityUpdate } from '@/lib/entity-api';
import { authJson } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Mail, MessageCircle, Send, Inbox } from 'lucide-react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

/* ─── Types ─── */

interface Lead {
  id: number | string;
  email?: string;
  phone?: string;
}

interface SentEmail {
  id: number | string;
  entity_id: number | string;
  subject?: string;
  body?: string;
  created_date: string;
}

interface LeadActivity {
  id: number | string;
  lead_id: number | string;
  type: string;
  description?: string;
  created_date: string;
}

interface CommunicationItemData {
  type: string;
  date: string;
  subject?: string;
  body?: string;
  description?: string;
}

interface SendEmailData {
  to?: string;
  subject: string;
  body: string;
  followUpDays?: string;
}

interface SendWhatsAppData {
  phone?: string;
  message: string;
  followUpDays?: string;
}

interface LeadCommunicationTabProps {
  leadId: number | string;
}

export default function LeadCommunicationTab({ leadId }: LeadCommunicationTabProps) {
  const [emailOpen, setEmailOpen] = useState(false);
  const [whatsappOpen, setWhatsappOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: lead } = useQuery({
    queryKey: ['lead', leadId],
    queryFn: () => entityFilter<Lead>("leads", { id: leadId }).then(leads => leads[0])
  });

  const { data: emails = [], isLoading: loadingEmails } = useQuery({
    queryKey: ['emails', leadId],
    queryFn: () => entityFilter<SentEmail>("sent-emails", { entity_id: leadId })
  });

  const { data: activities = [], isLoading: loadingActivities } = useQuery({
    queryKey: ['comm-activities', leadId],
    queryFn: () => entityFilter<LeadActivity>("lead-activities", { lead_id: leadId, type: 'email' })
  });

  const sendEmailMutation = useMutation({
    mutationFn: async (data: SendEmailData) => {
      // Send email via API
      await authJson("/api/send-email", {
        method: "POST",
        body: JSON.stringify({
          to: data.to,
          subject: data.subject,
          body: data.body
        }),
      });

      // Create activity record
      await entityCreate<LeadActivity>("lead-activities", {
        lead_id: leadId,
        type: 'email',
        description: `נשלח מייל: ${data.subject}`
      });

      // Emit webhook event for n8n
      await entityCreate("event-logs", {
        event_type: 'lead.email.send_requested',
        entity_type: 'Lead',
        entity_id: leadId,
        payload: {
          lead_id: leadId,
          to: data.to,
          subject: data.subject,
          body: data.body,
          timestamp: new Date().toISOString()
        }
      });

      // Update last_contacted_at and next_action_at (automation rule)
      const updateData: Record<string, unknown> = {
        last_contacted_at: new Date().toISOString()
      };
      if (data.followUpDays) {
        const nextAction = new Date();
        nextAction.setDate(nextAction.getDate() + parseInt(data.followUpDays));
        updateData.next_action_at = nextAction.toISOString();
      }
      await entityUpdate("leads", leadId, updateData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emails', leadId] });
      queryClient.invalidateQueries({ queryKey: ['comm-activities', leadId] });
      setEmailOpen(false);
    }
  });

  const sendWhatsAppMutation = useMutation({
    mutationFn: async (data: SendWhatsAppData) => {
      // Create activity record
      await entityCreate<LeadActivity>("lead-activities", {
        lead_id: leadId,
        type: 'whatsapp',
        description: `נשלח WhatsApp: ${data.message}`
      });

      // Emit webhook event for n8n
      await entityCreate("event-logs", {
        event_type: 'lead.whatsapp.send_requested',
        entity_type: 'Lead',
        entity_id: leadId,
        payload: {
          lead_id: leadId,
          phone: data.phone,
          message: data.message,
          timestamp: new Date().toISOString()
        }
      });

      // Update last_contacted_at and next_action_at (automation rule)
      const updateData: Record<string, unknown> = {
        last_contacted_at: new Date().toISOString()
      };
      if (data.followUpDays) {
        const nextAction = new Date();
        nextAction.setDate(nextAction.getDate() + parseInt(data.followUpDays));
        updateData.next_action_at = nextAction.toISOString();
      }
      await entityUpdate("leads", leadId, updateData);

      // Open WhatsApp
      const phone = (data.phone ?? '').replace(/[^0-9]/g, '');
      window.open(`https://wa.me/972${phone}?text=${encodeURIComponent(data.message)}`, '_blank');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comm-activities', leadId] });
      setWhatsappOpen(false);
    }
  });

  if (loadingEmails || loadingActivities) return <div className="p-6">טוען תקשורת...</div>;

  return (
    <div className="space-y-4">
      {/* Action Buttons */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <Button onClick={() => setEmailOpen(true)} className="flex-1 gap-2">
              <Mail className="w-4 h-4" />
              שלח מייל
            </Button>
            <Button onClick={() => setWhatsappOpen(true)} className="flex-1 gap-2 bg-green-600 hover:bg-green-700">
              <MessageCircle className="w-4 h-4" />
              שלח וואטסאפ
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Communication Threads */}
      <Tabs defaultValue="all" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="all">הכל</TabsTrigger>
          <TabsTrigger value="email">מיילים</TabsTrigger>
          <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-3 mt-4">
          {[...emails, ...activities].length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-slate-500">
                אין היסטוריית תקשורת
              </CardContent>
            </Card>
          ) : (
            [...emails.map(e => ({ ...e, type: 'email' as const, date: e.created_date })),
             ...activities.map(a => ({ ...a, date: a.created_date }))]
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
              .map((item, idx) => (
                <CommunicationItem key={idx} item={item as CommunicationItemData} />
              ))
          )}
        </TabsContent>

        <TabsContent value="email" className="space-y-3 mt-4">
          <div className="text-sm text-slate-500 mb-4 flex items-center gap-2">
            <Inbox className="w-4 h-4" />
            היסטוריית מיילים ({emails.length})
          </div>
          {emails.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-slate-500">
                אין מיילים עדיין
              </CardContent>
            </Card>
          ) : (
            emails.map((email, idx) => (
              <CommunicationItem key={idx} item={{ ...email, type: 'email', date: email.created_date }} />
            ))
          )}
        </TabsContent>

        <TabsContent value="whatsapp" className="space-y-3 mt-4">
          <div className="text-sm text-slate-500 mb-4 flex items-center gap-2">
            <MessageCircle className="w-4 h-4" />
            היסטוריית WhatsApp (בקרוב)
          </div>
          <Card>
            <CardContent className="py-12 text-center text-slate-500">
              אינטגרציית WhatsApp תתחבר בקרוב
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Send Email Dialog */}
      <SendEmailDialog
        open={emailOpen}
        onClose={() => setEmailOpen(false)}
        lead={lead}
        onSend={(data) => sendEmailMutation.mutate(data)}
        loading={sendEmailMutation.isPending}
      />

      {/* Send WhatsApp Dialog */}
      <SendWhatsAppDialog
        open={whatsappOpen}
        onClose={() => setWhatsappOpen(false)}
        lead={lead}
        onSend={(data) => sendWhatsAppMutation.mutate(data)}
        loading={sendWhatsAppMutation.isPending}
      />
    </div>
  );
}

/* ─── Sub-components ─── */

function CommunicationItem({ item }: { item: CommunicationItemData }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          {item.type === 'email' && <Mail className="w-4 h-4 text-blue-600" />}
          {item.type === 'whatsapp' && <MessageCircle className="w-4 h-4 text-green-600" />}
          <span className="flex-1">{item.subject || item.description?.split('\n')[0] || item.type}</span>
          <Badge variant="outline" className="text-xs">
            {item.type === 'email' ? 'מייל' : 'WhatsApp'}
          </Badge>
          <span className="text-sm text-slate-500 font-normal">
            {format(new Date(item.date), 'dd/MM HH:mm', {locale: he})}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-slate-600 whitespace-pre-wrap">
          {item.body || item.description}
        </p>
      </CardContent>
    </Card>
  );
}

interface SendEmailDialogProps {
  open: boolean;
  onClose: () => void;
  lead?: Lead;
  onSend: (data: SendEmailData) => void;
  loading: boolean;
}

function SendEmailDialog({ open, onClose, lead, onSend, loading }: SendEmailDialogProps) {
  const [formData, setFormData] = useState({ subject: '', body: '', followUpDays: '' });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSend({ to: lead?.email, ...formData });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-xl" dir="rtl">
        <DialogHeader>
          <DialogTitle>שליחת מייל</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>לכתובת</Label>
            <Input value={lead?.email} readOnly className="bg-slate-50" />
          </div>
          <div>
            <Label>נושא</Label>
            <Input
              value={formData.subject}
              onChange={(e) => setFormData({...formData, subject: e.target.value})}
              placeholder="הצעת מחיר..."
              required
            />
          </div>
          <div>
            <Label>תוכן</Label>
            <Textarea
              value={formData.body}
              onChange={(e) => setFormData({...formData, body: e.target.value})}
              rows={8}
              placeholder="שלום, מצורף..."
              required
            />
          </div>
          <div>
            <Label>מעקב בעוד (ימים - אופציונלי)</Label>
            <Input
              type="number"
              value={formData.followUpDays}
              onChange={(e) => setFormData({...formData, followUpDays: e.target.value})}
              placeholder="3"
              min="1"
            />
            <p className="text-xs text-slate-500 mt-1">יגדיר תזכורת אוטומטית</p>
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={onClose}>ביטול</Button>
            <Button type="submit" disabled={loading}>
              <Send className="w-4 h-4 mr-2" />
              שלח
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface SendWhatsAppDialogProps {
  open: boolean;
  onClose: () => void;
  lead?: Lead;
  onSend: (data: SendWhatsAppData) => void;
  loading: boolean;
}

function SendWhatsAppDialog({ open, onClose, lead, onSend, loading }: SendWhatsAppDialogProps) {
  const [message, setMessage] = useState('');
  const [followUpDays, setFollowUpDays] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSend({ phone: lead?.phone, message, followUpDays });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>שליחת WhatsApp</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>לטלפון</Label>
            <Input value={lead?.phone} readOnly className="bg-slate-50" />
          </div>
          <div>
            <Label>הודעה</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              placeholder="שלום, איך אפשר לעזור?"
              required
            />
          </div>
          <div>
            <Label>מעקב בעוד (ימים - אופציונלי)</Label>
            <Input
              type="number"
              value={followUpDays}
              onChange={(e) => setFollowUpDays(e.target.value)}
              placeholder="3"
              min="1"
            />
            <p className="text-xs text-slate-500 mt-1">יגדיר תזכורת אוטומטית</p>
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={onClose}>ביטול</Button>
            <Button type="submit" disabled={loading} className="bg-green-600 hover:bg-green-700">
              <MessageCircle className="w-4 h-4 mr-2" />
              שלח
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
