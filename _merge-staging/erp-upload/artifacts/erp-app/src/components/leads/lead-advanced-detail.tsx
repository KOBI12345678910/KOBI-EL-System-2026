import { useState, useEffect } from 'react';
import { entityList, entityUpdate } from '@/lib/entity-api';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Edit2, Save, X, Share2, MoreVertical } from 'lucide-react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

import LeadNotes from './lead-notes';
import LeadDocuments from './lead-documents';
import LeadActivity from './lead-activity';
import LeadEvents from './lead-events';
import LeadTasks from './lead-tasks';
import LeadAIInsights from './lead-ai-insights';
import LeadIntegrations from './lead-integrations';
import LeadAutomationEngine from './lead-automation-engine';
import LeadConversionFlow from './lead-conversion-flow';
import LeadDetailCard from './lead-detail-card';
import LeadCoreInfo from './lead-core-info';
import LeadProjectDetails from './lead-project-details';
import LeadTimelines from './lead-timelines';
import LeadFinancials from './lead-financials';
import LeadOperationalStatus from './lead-operational-status';
import LeadNotesAndHistory from './lead-notes-and-history';

interface LeadAdvancedDetailProps {
  leadId: string;
}

export default function LeadAdvancedDetail({ leadId }: LeadAdvancedDetailProps) {
  const [lead, setLead] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState<any>({});

  const { data: leadData, isLoading } = useQuery({
    queryKey: ['lead', leadId],
    queryFn: () => entityList<any>("leads").then(leads => leads.find((l: any) => l.id === leadId))
  });

  useEffect(() => {
    if (leadData) {
      setLead(leadData);
      setFormData(leadData);
    }
  }, [leadData]);

  const handleSave = async () => {
    await entityUpdate("leads", leadId, formData);
    setLead(formData);
    setEditing(false);
  };

  const handleFieldChange = (key: string, value: any) => {
    setFormData({ ...formData, [key]: value });
  };

  if (isLoading) return <div className="p-6 text-center">Loading...</div>;
  if (!lead) return <div className="p-6 text-red-600">Lead not found</div>;

  const statusColors: Record<string, string> = {
    new: 'bg-blue-100 text-blue-800',
    contacted: 'bg-yellow-100 text-yellow-800',
    qualified: 'bg-purple-100 text-purple-800',
    proposal: 'bg-indigo-100 text-indigo-800',
    negotiation: 'bg-orange-100 text-orange-800',
    won: 'bg-green-100 text-green-800',
    lost: 'bg-red-100 text-red-800'
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6" dir="rtl">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-3xl p-8 shadow-xl text-white">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 className="text-4xl font-bold mb-2">{lead.name}</h1>
              <p className="text-slate-300 text-lg">{lead.company || 'No company set'}</p>
              <div className="flex gap-3 mt-4">
                <Badge className={`${statusColors[lead.status]} text-lg px-4 py-1`}>{lead.status}</Badge>
                <Badge className="bg-white text-slate-900">${(lead.value || 0).toLocaleString()}</Badge>
                <Badge className="bg-white text-slate-900">{lead.source}</Badge>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="bg-white/10 border-white/30 text-white hover:bg-white/20" onClick={() => setEditing(!editing)}>
                {editing ? <X className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
              </Button>
              <Button variant="outline" className="bg-white/10 border-white/30 text-white hover:bg-white/20"><Share2 className="w-4 h-4" /></Button>
              <Button variant="outline" className="bg-white/10 border-white/30 text-white hover:bg-white/20"><MoreVertical className="w-4 h-4" /></Button>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-6 text-sm">
            <div><p className="text-slate-400">Email</p><p className="font-medium">{lead.email}</p></div>
            <div><p className="text-slate-400">Phone</p><p className="font-medium">{lead.phone || '---'}</p></div>
            <div><p className="text-slate-400">Created</p><p className="font-medium">{lead.created_date ? format(new Date(lead.created_date), 'dd/MM/yyyy', { locale: he }) : '---'}</p></div>
            <div><p className="text-slate-400">Owner</p><p className="font-medium">{lead.owner_id || 'Unassigned'}</p></div>
          </div>
        </div>

        {editing && (
          <div className="bg-blue-100 border border-blue-300 rounded-lg p-4 flex items-center justify-between">
            <p className="text-blue-900 font-semibold">Edit mode - modify details below</p>
            <div className="flex gap-2">
              <Button onClick={handleSave} size="sm" className="bg-green-600 gap-2"><Save className="w-4 h-4" />Save Changes</Button>
              <Button onClick={() => setEditing(false)} size="sm" variant="outline">Cancel</Button>
            </div>
          </div>
        )}

        <LeadDetailCard lead={lead} editing={editing} formData={formData} onChange={handleFieldChange} />

        {editing && (
          <Card className="border-blue-300 bg-blue-50">
            <CardHeader><CardTitle>General Notes</CardTitle></CardHeader>
            <CardContent>
              <textarea value={formData.notes || ''} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className="w-full p-3 border rounded-lg text-sm" rows={4} placeholder="Add general notes about the lead..." />
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="details" className="w-full">
          <TabsList className="grid w-full grid-cols-10 overflow-x-auto">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            <TabsTrigger value="ai">AI</TabsTrigger>
            <TabsTrigger value="automations">Automations</TabsTrigger>
            <TabsTrigger value="conversion">Conversion</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
            <TabsTrigger value="tasks">Tasks</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="notes">Notes</TabsTrigger>
            <TabsTrigger value="activity">History</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4">
            <LeadCoreInfo lead={lead} editing={editing} formData={formData} onChange={handleFieldChange} />
            <LeadProjectDetails lead={lead} editing={editing} formData={formData} onChange={handleFieldChange} />
            <LeadTimelines lead={lead} editing={editing} formData={formData} onChange={handleFieldChange} />
            <LeadFinancials lead={lead} editing={editing} formData={formData} onChange={handleFieldChange} />
            <LeadOperationalStatus lead={lead} editing={editing} formData={formData} onChange={handleFieldChange} />
            <LeadNotesAndHistory lead={lead} editing={editing} formData={formData} onChange={handleFieldChange} />
          </TabsContent>
          <TabsContent value="integrations"><LeadIntegrations lead={lead} /></TabsContent>
          <TabsContent value="ai"><LeadAIInsights lead={lead} /></TabsContent>
          <TabsContent value="automations"><LeadAutomationEngine lead={lead} /></TabsContent>
          <TabsContent value="conversion"><LeadConversionFlow lead={lead} /></TabsContent>
          <TabsContent value="events"><LeadEvents leadId={leadId} /></TabsContent>
          <TabsContent value="tasks"><LeadTasks leadId={leadId} /></TabsContent>
          <TabsContent value="documents"><LeadDocuments leadId={leadId} /></TabsContent>
          <TabsContent value="notes"><LeadNotes leadId={leadId} /></TabsContent>
          <TabsContent value="activity"><LeadActivity leadId={leadId} /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
