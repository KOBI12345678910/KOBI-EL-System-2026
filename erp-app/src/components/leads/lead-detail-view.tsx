import { useState, useEffect } from 'react';
import { entityList, entityUpdate } from '@/lib/entity-api';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mail, MessageCircle, FileUp, Calendar, CheckSquare, History, Edit2, Save, X } from 'lucide-react';
import LeadNotes from './lead-notes';
import LeadDocuments from './lead-documents';
import LeadActivity from './lead-activity';
import LeadEvents from './lead-events';
import LeadTasks from './lead-tasks';

interface LeadDetailViewProps {
  leadId: string;
}

export default function LeadDetailView({ leadId }: LeadDetailViewProps) {
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

  const handleConvertToCustomer = async () => {
    // This would convert the lead to a customer
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
    <div className="min-h-screen bg-slate-50 p-6" dir="rtl">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white rounded-2xl p-8 shadow-sm border">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">
                {lead.name}
              </h1>
              <p className="text-slate-500 mt-1">Lead - {lead.company}</p>
            </div>
            <div className="flex items-center gap-3">
              <Badge className={statusColors[lead.status]}>
                {lead.status}
              </Badge>
              <Button
                size="icon"
                variant="outline"
                onClick={() => setEditing(!editing)}
              >
                {editing ? <X className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          {/* Main Details */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { label: 'Email', key: 'email', type: 'email' },
              { label: 'Phone', key: 'phone', type: 'tel' },
              { label: 'Company', key: 'company', type: 'text' },
              { label: 'Lead Value', key: 'value', type: 'number' },
              { label: 'Source', key: 'source', type: 'select', options: ['website', 'referral', 'phone', 'event', 'import'] },
              { label: 'Owner', key: 'owner_id', type: 'text' },
            ].map(({ label, key, type, options }) => (
              <div key={key}>
                <label className="text-xs font-medium text-slate-500">{label}</label>
                {editing ? (
                  type === 'select' ? (
                    <select
                      className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                      value={formData[key] || ''}
                      onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
                    >
                      {options?.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  ) : (
                    <Input
                      type={type}
                      value={formData[key] || ''}
                      onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
                      className="mt-1"
                    />
                  )
                ) : (
                  <p className="text-sm font-medium text-slate-900 mt-1">{lead[key] || '\u2014'}</p>
                )}
              </div>
            ))}
          </div>

          {/* Quick Actions */}
          <div className="flex gap-2 mt-6 pt-6 border-t">
            <Button className="gap-2" variant="outline">
              <Mail className="w-4 h-4" />
              Send Email
            </Button>
            <Button className="gap-2" variant="outline">
              <MessageCircle className="w-4 h-4" />
              WhatsApp
            </Button>
            <Button className="gap-2" variant="outline">
              <Calendar className="w-4 h-4" />
              Schedule Meeting
            </Button>
            <Button onClick={handleConvertToCustomer} className="gap-2 bg-green-600 hover:bg-green-700 ml-auto">
              Convert to Customer
            </Button>
            {editing && (
              <Button onClick={handleSave} className="gap-2 bg-blue-600 hover:bg-blue-700">
                <Save className="w-4 h-4" />
                Save
              </Button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="notes" className="w-full">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="notes">Notes</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
            <TabsTrigger value="tasks">Tasks</TabsTrigger>
            <TabsTrigger value="activity">History</TabsTrigger>
            <TabsTrigger value="details">More Details</TabsTrigger>
          </TabsList>

          <TabsContent value="notes">
            <LeadNotes leadId={leadId} />
          </TabsContent>

          <TabsContent value="documents">
            <LeadDocuments leadId={leadId} />
          </TabsContent>

          <TabsContent value="events">
            <LeadEvents leadId={leadId} />
          </TabsContent>

          <TabsContent value="tasks">
            <LeadTasks leadId={leadId} />
          </TabsContent>

          <TabsContent value="activity">
            <LeadActivity leadId={leadId} />
          </TabsContent>

          <TabsContent value="details">
            <Card>
              <CardHeader>
                <CardTitle>Additional Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium">General Notes</label>
                  {editing ? (
                    <textarea
                      className="w-full mt-2 p-3 border rounded-lg text-sm"
                      rows={5}
                      value={formData.notes || ''}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    />
                  ) : (
                    <p className="text-sm text-slate-600 mt-2">{lead.notes || 'No notes'}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
