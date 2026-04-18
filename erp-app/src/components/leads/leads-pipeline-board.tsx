import { useMemo } from 'react';
import { entityList } from '@/lib/entity-api';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Clock, CheckCircle2 } from 'lucide-react';
import { Link } from 'wouter';
import { createPageUrl } from '@/lib/route-map';

const STATUSES = ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];

const STATUS_LABELS: Record<string, string> = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Qualified',
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  won: 'Won',
  lost: 'Lost'
};

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-blue-100 text-blue-800',
  contacted: 'bg-yellow-100 text-yellow-800',
  qualified: 'bg-purple-100 text-purple-800',
  proposal: 'bg-indigo-100 text-indigo-800',
  negotiation: 'bg-orange-100 text-orange-800',
  won: 'bg-green-100 text-green-800',
  lost: 'bg-red-100 text-red-800'
};

export default function LeadsPipelineBoard() {
  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['allLeads'],
    queryFn: () => entityList<any>("leads")
  });

  const leadsByStatus = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    STATUSES.forEach(status => {
      grouped[status] = leads.filter((lead: any) => lead.status === status);
    });
    return grouped;
  }, [leads]);

  const stats = useMemo(() => ({
    untreated: leads.filter((l: any) => l.status === 'new').length,
    incomplete: leads.filter((l: any) => !l.phone || !l.company).length,
    overdue: leads.filter((l: any) => l.created_date &&
      new Date().getTime() - new Date(l.created_date).getTime() > 7 * 24 * 60 * 60 * 1000 &&
      l.status === 'contacted'
    ).length
  }), [leads]);

  if (isLoading) return <div className="p-6 text-center">Loading...</div>;

  return (
    <div className="p-6 bg-slate-50 min-h-screen" dir="rtl">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6 flex items-center gap-3">
              <AlertCircle className="w-8 h-8 text-red-600" />
              <div>
                <p className="text-sm text-red-600">Untreated Leads</p>
                <p className="text-2xl font-bold text-red-700">{stats.untreated}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-yellow-200 bg-yellow-50">
            <CardContent className="pt-6 flex items-center gap-3">
              <Clock className="w-8 h-8 text-yellow-600" />
              <div>
                <p className="text-sm text-yellow-600">Incomplete Leads</p>
                <p className="text-2xl font-bold text-yellow-700">{stats.incomplete}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-orange-200 bg-orange-50">
            <CardContent className="pt-6 flex items-center gap-3">
              <AlertCircle className="w-8 h-8 text-orange-600" />
              <div>
                <p className="text-sm text-orange-600">Delayed Leads</p>
                <p className="text-2xl font-bold text-orange-700">{stats.overdue}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Pipeline Board */}
        <div>
          <h2 className="text-2xl font-bold mb-4">Sales Pipeline</h2>
          <div className="grid grid-cols-7 gap-4 overflow-x-auto pb-4">
            {STATUSES.map(status => (
              <div key={status} className="bg-slate-200 rounded-lg p-4 min-w-[320px]">
                <div className="mb-4">
                  <h3 className="font-semibold text-sm mb-2">
                    {STATUS_LABELS[status]}
                  </h3>
                  <p className="text-xs text-slate-600">
                    {leadsByStatus[status].length} leads
                  </p>
                </div>

                <div className="space-y-3">
                  {leadsByStatus[status].map((lead: any) => (
                    <PipelineLeadCard key={lead.id} lead={lead} status={status} />
                  ))}
                  {leadsByStatus[status].length === 0 && (
                    <p className="text-xs text-slate-500 text-center py-4">No leads</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PipelineLeadCard({ lead, status }: { lead: any; status: string }) {
  const isIncomplete = !lead.phone || !lead.company;
  const isOldUntreated = status === 'new' &&
    new Date().getTime() - new Date(lead.created_date).getTime() > 3 * 24 * 60 * 60 * 1000;

  return (
    <Link href={createPageUrl('LeadDetail') + `?id=${lead.id}`}>
      <Card className={`cursor-pointer hover:shadow-md transition ${
        isOldUntreated ? 'border-red-300 bg-red-50' :
        isIncomplete ? 'border-yellow-300 bg-yellow-50' : ''
      }`}>
        <CardContent className="p-3">
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium text-sm line-clamp-2">{lead.name}</p>
              {isOldUntreated && <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />}
              {isIncomplete && <Clock className="w-4 h-4 text-yellow-600 flex-shrink-0" />}
            </div>
            <p className="text-xs text-slate-600">{lead.company || 'Company not set'}</p>
            <p className="text-xs text-slate-600">{lead.email}</p>
            {lead.phone && <p className="text-xs text-slate-600">{lead.phone}</p>}
            <div className="flex justify-between items-center pt-2 border-t">
              <Badge className={STATUS_COLORS[status]} variant="outline">
                ${lead.value}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {lead.source}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
