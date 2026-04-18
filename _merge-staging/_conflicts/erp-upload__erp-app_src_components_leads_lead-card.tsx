import { useState, useEffect } from 'react';
import { entityFilter, entityUpdate, entityCreate } from '@/lib/entity-api';
import { authJson } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Mail, Phone, Building2, Edit2, Save, X } from 'lucide-react';

interface LeadCardProps {
  leadId: string;
}

export default function LeadCard({ leadId }: LeadCardProps) {
  const [lead, setLead] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [user, setUser] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState<any>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, [leadId]);

  const loadData = async () => {
    try {
      const currentUser = await authJson("/api/auth/me");
      setUser(currentUser);
      const leadData = await entityFilter<any>("leads", { id: leadId });
      if (leadData.length > 0) {
        setLead(leadData[0]);
        setFormData(leadData[0]);
        const eventsData = await entityFilter<any>("lead-events", { lead_id: leadId });
        setEvents(eventsData.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
      }
    } catch (error) {
      console.error('Error loading lead:', error);
    } finally {
      setLoading(false);
    }
  };

  const canEdit = lead?.owner_id === user?.id || user?.role === 'admin';

  const handleSave = async () => {
    try {
      await entityUpdate("leads", lead.id, formData);
      if (JSON.stringify(lead) !== JSON.stringify(formData)) {
        await entityCreate("lead-events", {
          lead_id: lead.id,
          type: 'status_changed',
          user_id: user?.id,
          timestamp: new Date().toISOString()
        });
      }
      setLead(formData);
      setEditing(false);
      loadData();
    } catch (error) {
      console.error('Error saving:', error);
    }
  };

  if (loading) return <div className="p-4">Loading...</div>;
  if (!lead) return <div className="p-4 text-red-600">Lead not found</div>;

  const statusColors: Record<string, string> = {
    new: 'bg-blue-100 text-blue-800', contacted: 'bg-yellow-100 text-yellow-800',
    qualified: 'bg-green-100 text-green-800', proposal: 'bg-purple-100 text-purple-800',
    negotiation: 'bg-orange-100 text-orange-800', won: 'bg-emerald-100 text-emerald-800',
    lost: 'bg-red-100 text-red-800'
  };

  return (
    <div className="grid grid-cols-3 gap-6 p-6">
      <div className="col-span-2 space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex justify-between items-start">
              <div>
                {editing ? (
                  <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="text-2xl font-bold" />
                ) : (
                  <h1 className="text-2xl font-bold">{lead.name}</h1>
                )}
                <div className="flex gap-2 mt-2">
                  <Badge className={statusColors[lead.status]}>{lead.status}</Badge>
                  <Badge variant="outline">{lead.source}</Badge>
                </div>
              </div>
              <div>
                {!editing && canEdit && (<Button variant="ghost" onClick={() => setEditing(true)}><Edit2 className="w-4 h-4" /></Button>)}
                {editing && (
                  <div className="flex gap-2">
                    <Button onClick={handleSave} className="bg-blue-600"><Save className="w-4 h-4 mr-1" /> Save</Button>
                    <Button variant="outline" onClick={() => setEditing(false)}><X className="w-4 h-4" /></Button>
                  </div>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-slate-600">Email</label>
                {editing ? (<Input value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />) : (<div className="flex items-center gap-2 mt-1"><Mail className="w-4 h-4 text-slate-400" />{lead.email}</div>)}
              </div>
              <div>
                <label className="text-sm text-slate-600">Phone</label>
                {editing ? (<Input value={formData.phone || ''} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />) : (<div className="flex items-center gap-2 mt-1"><Phone className="w-4 h-4 text-slate-400" />{lead.phone || '---'}</div>)}
              </div>
              <div>
                <label className="text-sm text-slate-600">Company</label>
                {editing ? (<Input value={formData.company || ''} onChange={(e) => setFormData({ ...formData, company: e.target.value })} />) : (<div className="flex items-center gap-2 mt-1"><Building2 className="w-4 h-4 text-slate-400" />{lead.company || '---'}</div>)}
              </div>
              <div>
                <label className="text-sm text-slate-600">Value</label>
                {editing ? (<Input type="number" value={formData.value || 0} onChange={(e) => setFormData({ ...formData, value: parseInt(e.target.value) || 0 })} />) : (<div className="mt-1 font-semibold">${(lead.value || 0).toLocaleString()}</div>)}
              </div>
            </div>
            <div>
              <label className="text-sm text-slate-600">Notes</label>
              {editing ? (<textarea value={formData.notes || ''} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className="w-full mt-1 p-2 border rounded text-sm" rows={3} />) : (<p className="mt-1 text-sm text-slate-700">{lead.notes || '---'}</p>)}
            </div>
          </CardContent>
        </Card>
      </div>
      <div>
        <Card>
          <CardHeader><CardTitle className="text-lg">Timeline</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {events.length === 0 ? (<p className="text-sm text-slate-500">No events yet</p>) : events.map((event) => (
                <div key={event.id} className="text-xs">
                  <div className="font-medium text-slate-900">{event.type}</div>
                  <div className="text-slate-500">{new Date(event.timestamp).toLocaleDateString()}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
