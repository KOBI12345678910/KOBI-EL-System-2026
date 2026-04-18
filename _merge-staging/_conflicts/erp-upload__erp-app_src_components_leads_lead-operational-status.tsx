import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Factory, AlertCircle } from 'lucide-react';

interface LeadOperationalStatusProps {
  lead: any;
  editing: boolean;
  formData: any;
  onChange: (key: string, value: any) => void;
}

export default function LeadOperationalStatus({ lead, editing, formData, onChange }: LeadOperationalStatusProps) {
  const productionStatusColors: Record<string, string> = {
    awaiting_design: 'bg-blue-100 text-blue-800',
    cutting: 'bg-orange-100 text-orange-800',
    welding: 'bg-red-100 text-red-800',
    painting: 'bg-purple-100 text-purple-800',
    ready_for_installation: 'bg-yellow-100 text-yellow-800',
    in_installation: 'bg-cyan-100 text-cyan-800',
    completed: 'bg-green-100 text-green-800'
  };

  const productionLabels: Record<string, string> = {
    awaiting_design: 'Awaiting Design',
    cutting: 'Cutting',
    welding: 'Welding',
    painting: 'Painting',
    ready_for_installation: 'Ready for Installation',
    in_installation: 'In Installation',
    completed: 'Completed'
  };

  const equipmentOptions = [
    { value: 'crane', label: 'Crane' },
    { value: 'ladder', label: 'Ladder' },
    { value: 'safety_equipment', label: 'Safety Equipment' },
    { value: 'vehicle', label: 'Vehicle' }
  ];

  return (
    <div className="space-y-4">
      {/* Production Status */}
      <Card className="border-orange-200 bg-orange-50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Factory className="w-5 h-5 text-orange-600" />
            Production Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="text-sm font-semibold text-slate-600">Production State</label>
            {editing ? (
              <select
                value={formData.production_status || ''}
                onChange={(e) => onChange('production_status', e.target.value)}
                className="w-full border rounded px-2 py-1 text-sm mt-1"
              >
                <option value="">Select</option>
                {Object.entries(productionLabels).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            ) : (
              <Badge className={productionStatusColors[lead.production_status]}>
                {productionLabels[lead.production_status] || '\u2014'}
              </Badge>
            )}
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-600">Production Team</label>
            {editing ? (
              <Input
                value={formData.production_team || ''}
                onChange={(e) => onChange('production_team', e.target.value)}
                className="text-sm mt-1"
                placeholder="Team names / IDs"
              />
            ) : (
              <p className="font-semibold">{lead.production_team || '\u2014'}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Equipment & Missing Items */}
      <Card className="border-red-200 bg-red-50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-600" />
            Equipment & Missing Items
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="text-sm font-semibold text-slate-600">Special Equipment Needed</label>
            {editing ? (
              <div className="space-y-2 mt-1">
                {equipmentOptions.map(opt => (
                  <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={(formData.special_equipment_needed || []).includes(opt.value)}
                      onChange={(e) => {
                        const current = formData.special_equipment_needed || [];
                        if (e.target.checked) {
                          onChange('special_equipment_needed', [...current, opt.value]);
                        } else {
                          onChange('special_equipment_needed', current.filter((v: string) => v !== opt.value));
                        }
                      }}
                    />
                    <span className="text-sm">{opt.label}</span>
                  </label>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {(lead.special_equipment_needed || []).map((eq: string) => (
                  <Badge key={eq} className="bg-orange-200 text-orange-800">
                    {equipmentOptions.find(o => o.value === eq)?.label}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-600">Missing Items / Issues</label>
            {editing ? (
              <textarea
                value={(formData.missing_items || []).join('\n')}
                onChange={(e) => onChange('missing_items', e.target.value.split('\n').filter((v: string) => v))}
                className="w-full p-2 border rounded text-sm mt-1"
                rows={3}
                placeholder="Missing materials / approvals / other issues"
              />
            ) : (
              <div className="space-y-1">
                {(lead.missing_items || []).map((item: string, idx: number) => (
                  <p key={idx} className="text-sm text-red-700">Warning: {item}</p>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
