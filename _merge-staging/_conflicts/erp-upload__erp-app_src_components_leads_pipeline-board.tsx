import { useState, useEffect } from 'react';
import { entityList } from '@/lib/entity-api';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mail, Phone } from 'lucide-react';

const STATUSES = ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];

interface PipelineBoardProps {
  onLeadClick: (leadId: string) => void;
}

export default function PipelineBoard({ onLeadClick }: PipelineBoardProps) {
  const [leads, setLeads] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLeads();
  }, []);

  const loadLeads = async () => {
    try {
      const data = await entityList<any>("leads");
      const grouped: Record<string, any[]> = {};
      STATUSES.forEach(status => {
        grouped[status] = data.filter((lead: any) => lead.status === status);
      });
      setLeads(grouped);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const statusLabels: Record<string, string> = {
    new: 'New',
    contacted: 'Contacted',
    qualified: 'Qualified',
    proposal: 'Proposal',
    negotiation: 'Negotiation',
    won: 'Won',
    lost: 'Lost'
  };

  const statusColors: Record<string, string> = {
    new: 'bg-blue-50 border-blue-200',
    contacted: 'bg-yellow-50 border-yellow-200',
    qualified: 'bg-green-50 border-green-200',
    proposal: 'bg-purple-50 border-purple-200',
    negotiation: 'bg-orange-50 border-orange-200',
    won: 'bg-emerald-50 border-emerald-200',
    lost: 'bg-red-50 border-red-200'
  };

  if (loading) return <div className="p-6 text-center">Loading...</div>;

  return (
    <div className="p-6 overflow-x-auto">
      <div className="flex gap-6 min-w-max">
        {STATUSES.map(status => (
          <div key={status} className="w-80 flex-shrink-0">
            <div className={`rounded-lg border-2 p-4 ${statusColors[status]} h-[600px] flex flex-col`}>
              <div className="mb-4">
                <h3 className="font-bold text-slate-900">{statusLabels[status]}</h3>
                <p className="text-sm text-slate-500">{leads[status]?.length || 0} leads</p>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto">
                {(leads[status] || []).map((lead: any) => (
                  <Card
                    key={lead.id}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => onLeadClick(lead.id)}
                  >
                    <CardContent className="p-3">
                      <div className="font-semibold text-sm text-slate-900">{lead.name}</div>
                      <div className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                        <Mail className="w-3 h-3" />
                        {lead.email}
                      </div>
                      {lead.phone && (
                        <div className="text-xs text-slate-500 flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {lead.phone}
                        </div>
                      )}
                      <div className="mt-2 flex justify-between items-center">
                         <Badge variant="outline" className="text-xs">
                           ${(lead.value || 0).toLocaleString()}
                         </Badge>
                         <span className="text-xs text-slate-400">{lead.source || '-'}</span>
                       </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
