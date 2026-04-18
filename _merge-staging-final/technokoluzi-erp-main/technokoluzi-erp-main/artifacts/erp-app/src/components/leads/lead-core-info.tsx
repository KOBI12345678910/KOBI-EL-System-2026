import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from 'lucide-react';

interface LeadCoreInfoProps {
  lead: any;
  editing: boolean;
  formData: any;
  onChange: (key: string, value: any) => void;
}

export default function LeadCoreInfo({ lead, editing, formData, onChange }: LeadCoreInfoProps) {
  const renderSelect = (label: string, value: string, fieldKey: string, options: { value: string; label: string }[], editable = false) => (
    <div className="py-2 border-b last:border-0">
      <span className="text-sm text-slate-600">{label}</span>
      {editable && editing ? (
        <select value={formData[fieldKey] || ''} onChange={(e) => onChange(fieldKey, e.target.value)} className="w-full border rounded px-2 py-1 text-sm mt-1">
          <option value="">Select option</option>
          {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
      ) : (
        <p className="font-semibold mt-1">{options.find(o => o.value === value)?.label || '---'}</p>
      )}
    </div>
  );

  const priorityColors: Record<string, string> = {
    normal: 'bg-blue-100 text-blue-800', urgent: 'bg-orange-100 text-orange-800', very_urgent: 'bg-red-100 text-red-800'
  };

  return (
    <div className="grid grid-cols-3 gap-4">
      <Card className="border-indigo-200 bg-indigo-50">
        <CardHeader className="pb-3"><CardTitle className="text-base">Client Type</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {renderSelect('Client Type', lead.lead_type, 'lead_type', [
            { value: 'private', label: 'Private' }, { value: 'business', label: 'Business' }, { value: 'institutional', label: 'Institutional' }
          ], true)}
        </CardContent>
      </Card>

      <Card className="border-green-200 bg-green-50">
        <CardHeader className="pb-3"><CardTitle className="text-base">Status</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {renderSelect('Client Status', lead.status, 'status', [
            { value: 'new', label: 'New' }, { value: 'in_progress', label: 'In Progress' },
            { value: 'quote', label: 'Quote' }, { value: 'awaiting_approval', label: 'Awaiting Approval' },
            { value: 'approved', label: 'Approved' }, { value: 'in_work', label: 'In Work' },
            { value: 'completed', label: 'Completed' }, { value: 'cancelled', label: 'Cancelled' }
          ], true)}
        </CardContent>
      </Card>

      <Card className="border-red-200 bg-red-50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-red-600" />Urgency</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {renderSelect('Urgency Level', lead.priority, 'priority', [
            { value: 'normal', label: 'Normal' }, { value: 'urgent', label: 'Urgent' }, { value: 'very_urgent', label: 'Very Urgent' }
          ], true)}
          {editing && (
            <>
              <div className="mt-2 pt-2 border-t">
                <label className="text-sm text-slate-600">Target Date</label>
                <input type="date" value={formData.target_date || ''} onChange={(e) => onChange('target_date', e.target.value)} className="w-full border rounded px-2 py-1 text-sm mt-1" />
              </div>
              <div>
                <label className="text-sm text-slate-600">Urgency Reason</label>
                <input type="text" value={formData.priority_reason || ''} onChange={(e) => onChange('priority_reason', e.target.value)} className="w-full border rounded px-2 py-1 text-sm mt-1" placeholder="Explain urgency" />
              </div>
            </>
          )}
          <div className="mt-2">
            <Badge className={priorityColors[lead.priority]}>
              {lead.priority === 'normal' ? 'Normal' : lead.priority === 'urgent' ? 'Urgent' : 'Very Urgent'}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
