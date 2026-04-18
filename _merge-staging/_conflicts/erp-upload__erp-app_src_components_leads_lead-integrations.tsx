import { useState } from 'react';
import { authFetch } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Mail, MessageCircle, Calendar, Send } from 'lucide-react';

interface LeadIntegrationsProps {
  lead: any;
}

export default function LeadIntegrations({ lead }: LeadIntegrationsProps) {
  const [sending, setSending] = useState<string | null>(null);

  const sendEmail = async () => {
    setSending('email');
    try {
      await authFetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: lead.email,
          subject: `Welcome ${lead.name}!`,
          body: `Hello ${lead.name},\n\nWe are happy to get in touch based on your inquiry.\n\nWe would love to talk to you about how we can help.\n\nBest regards,\nSales Team`
        }),
      });
      alert('Email sent successfully!');
    } catch (error) {
      alert('Error sending email');
    }
    setSending(null);
  };

  const openWhatsApp = () => {
    const message = encodeURIComponent(`Hello ${lead.name}! This is our team. We would love to talk to you about your project.`);
    window.open(`https://wa.me/${lead.phone.replace(/\D/g, '')}?text=${message}`, '_blank');
  };

  const scheduleCalendar = () => {
    window.open(`https://calendar.google.com/calendar/render?action=TEMPLATE&text=Meeting with ${lead.name}&details=${lead.company}`, '_blank');
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Integrations</h3>

      <div className="grid grid-cols-2 gap-4">
        {/* Email */}
        <Card className="hover:shadow-md transition">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="w-5 h-5 text-blue-600" />
              Email
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate-600">{lead.email}</p>
            <Button
              onClick={sendEmail}
              disabled={sending === 'email'}
              className="w-full gap-2 bg-blue-600 hover:bg-blue-700"
            >
              <Send className="w-4 h-4" />
              {sending === 'email' ? 'Sending...' : 'Send Email'}
            </Button>
          </CardContent>
        </Card>

        {/* WhatsApp */}
        <Card className="hover:shadow-md transition">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-green-600" />
              WhatsApp
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate-600">{lead.phone || 'No phone'}</p>
            <Button
              onClick={openWhatsApp}
              disabled={!lead.phone}
              className="w-full gap-2 bg-green-600 hover:bg-green-700"
            >
              <MessageCircle className="w-4 h-4" />
              Open WhatsApp
            </Button>
          </CardContent>
        </Card>

        {/* Calendar */}
        <Card className="hover:shadow-md transition">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="w-5 h-5 text-purple-600" />
              Schedule Meeting
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate-600">Google Calendar</p>
            <Button
              onClick={scheduleCalendar}
              className="w-full gap-2 bg-purple-600 hover:bg-purple-700"
            >
              <Calendar className="w-4 h-4" />
              Suggest Time
            </Button>
          </CardContent>
        </Card>

        {/* LinkedIn (Future) */}
        <Card className="opacity-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              LinkedIn
              <Badge className="text-xs">Coming Soon</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate-600">Profile Search</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
