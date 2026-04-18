import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Hammer, Palette } from 'lucide-react';

interface LeadProjectDetailsProps {
  lead: any;
  editing: boolean;
  formData: any;
  onChange: (key: string, value: any) => void;
}

export default function LeadProjectDetails({ lead, editing, formData, onChange }: LeadProjectDetailsProps) {
  const workTypeOptions = [
    { value: 'railings', label: 'Railings' },
    { value: 'gates', label: 'Gates' },
    { value: 'fences', label: 'Fences' },
    { value: 'stairs', label: 'Stairs' },
    { value: 'pergolas', label: 'Pergolas' },
    { value: 'iron_construction', label: 'Iron Construction' },
    { value: 'aluminum_windows', label: 'Aluminum Windows/Doors' },
    { value: 'mixed', label: 'Mixed Work' }
  ];

  const finishOptions = [
    { value: 'galvanized', label: 'Galvanized' },
    { value: 'powder_coated', label: 'Powder Coated' },
    { value: 'natural', label: 'Natural' }
  ];

  return (
    <div className="space-y-4">
      {/* Work Type */}
      <Card className="border-purple-200 bg-purple-50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Hammer className="w-5 h-5 text-purple-600" />
            Work Type
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <p className="text-sm text-slate-600">Select work types:</p>
            {editing ? (
              <div className="space-y-2">
                {workTypeOptions.map(opt => (
                  <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={(formData.work_type || []).includes(opt.value)}
                      onChange={(e) => {
                        const current = formData.work_type || [];
                        if (e.target.checked) {
                          onChange('work_type', [...current, opt.value]);
                        } else {
                          onChange('work_type', current.filter((v: string) => v !== opt.value));
                        }
                      }}
                      className="rounded"
                    />
                    <span className="text-sm">{opt.label}</span>
                  </label>
                ))}
              </div>
            ) : (
              <div className="space-y-1">
                {(lead.work_type || []).map((type: string) => (
                  <p key={type} className="text-sm font-semibold">
                    {workTypeOptions.find(o => o.value === type)?.label}
                  </p>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Product Details */}
      <Card className="border-cyan-200 bg-cyan-50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Palette className="w-5 h-5 text-cyan-600" />
            Product Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-semibold text-slate-600">Material</label>
              {editing ? (
                <select
                  value={formData.material_type || ''}
                  onChange={(e) => onChange('material_type', e.target.value)}
                  className="w-full border rounded px-2 py-1 text-sm mt-1"
                >
                  <option value="">Select</option>
                  <option value="iron">Iron</option>
                  <option value="aluminum">Aluminum</option>
                  <option value="stainless">Stainless Steel</option>
                  <option value="mixed">Mixed</option>
                </select>
              ) : (
                <p className="font-semibold">{lead.material_type || '\u2014'}</p>
              )}
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-600">Dimensions (H/W/D)</label>
              {editing ? (
                <div className="flex gap-2 mt-1">
                  <Input placeholder="H" value={formData.dimensions_height || ''} onChange={(e) => onChange('dimensions_height', e.target.value)} className="text-sm w-1/3" />
                  <Input placeholder="W" value={formData.dimensions_width || ''} onChange={(e) => onChange('dimensions_width', e.target.value)} className="text-sm w-1/3" />
                  <Input placeholder="D" value={formData.dimensions_depth || ''} onChange={(e) => onChange('dimensions_depth', e.target.value)} className="text-sm w-1/3" />
                </div>
              ) : (
                <p className="font-semibold text-sm">
                  {lead.dimensions_height} / {lead.dimensions_width} / {lead.dimensions_depth}
                </p>
              )}
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-600">Quantity</label>
              {editing ? (
                <Input type="number" value={formData.quantity || ''} onChange={(e) => onChange('quantity', parseInt(e.target.value))} className="text-sm mt-1" />
              ) : (
                <p className="font-semibold">{lead.quantity || '\u2014'} units</p>
              )}
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-600">Color</label>
              {editing ? (
                <Input value={formData.color || ''} onChange={(e) => onChange('color', e.target.value)} className="text-sm mt-1" />
              ) : (
                <p className="font-semibold">{lead.color || '\u2014'}</p>
              )}
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-600">Finish</label>
              {editing ? (
                <select
                  value={formData.finish_type || ''}
                  onChange={(e) => onChange('finish_type', e.target.value)}
                  className="w-full border rounded px-2 py-1 text-sm mt-1"
                >
                  <option value="">Select</option>
                  {finishOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              ) : (
                <p className="font-semibold">{finishOptions.find(o => o.value === lead.finish_type)?.label || '\u2014'}</p>
              )}
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-600">Standard (if required)</label>
              {editing ? (
                <Input value={formData.required_standard || ''} onChange={(e) => onChange('required_standard', e.target.value)} className="text-sm mt-1" />
              ) : (
                <p className="font-semibold">{lead.required_standard || '\u2014'}</p>
              )}
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-600">Strength Level</label>
              {editing ? (
                <Input value={formData.strength_level || ''} onChange={(e) => onChange('strength_level', e.target.value)} className="text-sm mt-1" />
              ) : (
                <p className="font-semibold">{lead.strength_level || '\u2014'}</p>
              )}
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-600">Estimated Load</label>
              {editing ? (
                <Input value={formData.estimated_load || ''} onChange={(e) => onChange('estimated_load', e.target.value)} className="text-sm mt-1" />
              ) : (
                <p className="font-semibold">{lead.estimated_load || '\u2014'}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
