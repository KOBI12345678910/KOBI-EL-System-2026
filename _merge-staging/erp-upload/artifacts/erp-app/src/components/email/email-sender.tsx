import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, Send, Loader } from 'lucide-react';
import { entityCreate, entityFilter } from "@/lib/entity-api";
import { authJson } from "@/lib/utils";

export default function EmailSender({ entityType, entityId, entityEmail, entityName, onSuccess }) {
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [to, setTo] = useState(entityEmail || '');
  const [sending, setSending] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    loadTemplates();
    loadUser();
  }, []);

  const loadTemplates = async () => {
    try {
      const data = await entityFilter<any>("email-templates", { is_active: true });
      setTemplates(data);
    } catch (error) {
      console.error('Error loading templates:', error);
    }
  };

  const loadUser = async () => {
    try {
      const userData = await authJson("/api/auth/me");
      setUser(userData);
    } catch (error) {
      console.error('Error loading user:', error);
    }
  };

  const applyTemplate = (templateId) => {
    const template = templates.find(t => t.id === templateId);
    if (template) {
      const processedBody = template.body
        .replace(/{{firstName}}/g, entityName?.split(' ')[0] || '')
        .replace(/{{email}}/g, to)
        .replace(/{{companyName}}/g, entityName || '');
      
      setSubject(template.subject);
      setBody(processedBody);
      setSelectedTemplate(templateId);
    }
  };

  const handleSend = async () => {
    if (!to || !subject || !body) {
      alert('Please fill in all fields');
      return;
    }

    try {
      setSending(true);

      // Send email via integration
      await fetch("/api/integrations/send-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        to,
        subject,
        body,
        from_name: user?.full_name || 'CRM'
      }) });

      // Log as activity
      await entityCreate<any>("activities", {
        type: 'email',
        subject: `Email sent to ${to}`,
        description: body,
        related_entity_type: entityType,
        related_entity_id: entityId,
        owner_id: user?.id,
        status: 'completed'
      });

      // Record sent email
      await entityCreate<any>("sent-emails", {
        to,
        subject,
        body,
        sent_by: user?.email,
        entity_type: entityType,
        entity_id: entityId,
        template_id: selectedTemplate || null,
        status: 'sent'
      });

      onSuccess?.();
      // Reset form
      setSubject('');
      setBody('');
      setSelectedTemplate('');
    } catch (error) {
      console.error('Error sending email:', error);
      alert('Failed to send email');
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50">
        <CardTitle className="flex items-center gap-2">
          <Mail className="w-5 h-5 text-blue-600" />
          Send Email
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Template</label>
          <Select value={selectedTemplate} onValueChange={applyTemplate}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a template (optional)" />
            </SelectTrigger>
            <SelectContent>
              {templates.map(t => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">To</label>
          <Input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="recipient@example.com"
            type="email"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Subject</label>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Email subject"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Body</label>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Email message"
            rows={8}
          />
          <p className="text-xs text-slate-500 mt-1">Variables: {{firstName}}, {{email}}, {{companyName}}</p>
        </div>

        <Button
          onClick={handleSend}
          disabled={sending}
          className="w-full bg-blue-600 hover:bg-blue-700"
        >
          {sending ? <Loader className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
          {sending ? 'Sending...' : 'Send Email'}
        </Button>
      </CardContent>
    </Card>
  );
}