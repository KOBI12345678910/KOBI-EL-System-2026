import { useState } from 'react';
import { entityFilter, entityCreate } from '@/lib/entity-api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { Calendar, Plus } from 'lucide-react';

interface LeadEventsProps {
  leadId: string;
}

export default function LeadEvents({ leadId }: LeadEventsProps) {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    event_date: '',
    event_type: 'meeting',
    description: ''
  });
  const queryClient = useQueryClient();

  const { data: events = [] } = useQuery({
    queryKey: ['leadEvents', leadId],
    queryFn: () => entityFilter<any>("lead-events", { lead_id: leadId })
  });

  const createEventMutation = useMutation({
    mutationFn: (data: any) => entityCreate("lead-events", { lead_id: leadId, ...data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leadEvents', leadId] });
      setFormData({ title: '', event_date: '', event_type: 'meeting', description: '' });
      setShowForm(false);
    }
  });

  const handleSubmit = () => {
    if (formData.title && formData.event_date) {
      createEventMutation.mutate(formData);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Events & Visits</CardTitle>
          <Button size="sm" onClick={() => setShowForm(!showForm)} className="gap-2">
            <Plus className="w-4 h-4" />
            New Event
          </Button>
        </CardHeader>
        {showForm && (
          <CardContent className="space-y-3">
            <Input
              placeholder="Event title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            />
            <Input
              type="datetime-local"
              value={formData.event_date}
              onChange={(e) => setFormData({ ...formData, event_date: e.target.value })}
            />
            <select
              value={formData.event_type}
              onChange={(e) => setFormData({ ...formData, event_type: e.target.value })}
              className="w-full p-2 border rounded-lg text-sm"
            >
              <option value="meeting">Meeting</option>
              <option value="call">Call</option>
              <option value="email">Email</option>
              <option value="demo">Demo</option>
            </select>
            <textarea
              placeholder="Additional details"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full p-2 border rounded-lg text-sm"
              rows={3}
            />
            <div className="flex gap-2">
              <Button onClick={handleSubmit} disabled={createEventMutation.isPending} className="gap-2">
                <Calendar className="w-4 h-4" />
                Create Event
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </CardContent>
        )}
      </Card>

      <div className="space-y-3">
        {events.map((event: any) => (
          <Card key={event.id}>
            <CardContent className="pt-6">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="font-medium text-sm">{event.title}</p>
                  <p className="text-xs text-slate-500 capitalize">{event.event_type}</p>
                </div>
                <p className="text-xs text-slate-500">
                  {format(new Date(event.event_date), 'dd/MM/yyyy HH:mm', { locale: he })}
                </p>
              </div>
              {event.description && <p className="text-sm text-slate-600">{event.description}</p>}
            </CardContent>
          </Card>
        ))}
        {events.length === 0 && <p className="text-center text-slate-500 py-6">No scheduled events</p>}
      </div>
    </div>
  );
}
