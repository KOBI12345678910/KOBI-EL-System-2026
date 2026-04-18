import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MapPin, Phone, Mail, Building2, User, Users, Clock, MessageSquare, Plus, Trash2 } from 'lucide-react';

interface Stakeholder {
  name?: string;
  role?: string;
  phone?: string;
  email?: string;
  notes?: string;
}

interface LeadDetailCardProps {
  lead: any;
  editing: boolean;
  formData: any;
  onChange: (key: string, value: any) => void;
}

export default function LeadDetailCard({ lead, editing, formData, onChange }: LeadDetailCardProps) {
  const [newStakeholder, setNewStakeholder] = useState<Stakeholder>({});
  const [showStakeholderForm, setShowStakeholderForm] = useState(false);

  const renderField = (label: string, value: any, editable = false, fieldKey: string | null = null, type = 'text') => (
    <div className="flex justify-between items-center py-2 border-b last:border-0">
      <span className="text-sm text-slate-600">{label}</span>
      {editable && editing ? (
        type === 'select' ? (
          <select
            value={formData[fieldKey!] || ''}
            onChange={(e) => onChange(fieldKey!, e.target.value)}
            className="border rounded px-2 py-1 text-sm w-40"
          >
            <option value="">Select option</option>
            {fieldKey === 'communication_style' && (
              <>
                <option value="short">Short & Direct</option>
                <option value="detailed">Detailed</option>
                <option value="technical">Technical</option>
                <option value="business">Business</option>
              </>
            )}
            {fieldKey === 'preferred_channel' && (
              <>
                <option value="phone">Phone</option>
                <option value="email">Email</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="meeting">Meeting</option>
              </>
            )}
            {fieldKey === 'contact_frequency' && (
              <>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="bi-weekly">Bi-weekly</option>
                <option value="monthly">Monthly</option>
                <option value="as-needed">As Needed</option>
              </>
            )}
          </select>
        ) : (
          <input
            type={type}
            value={formData[fieldKey!] || ''}
            onChange={(e) => onChange(fieldKey!, e.target.value)}
            className="border rounded px-2 py-1 text-sm w-40"
          />
        )
      ) : (
        <span className="font-semibold text-right">{value || '\u2014'}</span>
      )}
    </div>
  );

  const addStakeholder = () => {
    const stakeholders = formData.stakeholders || [];
    onChange('stakeholders', [...stakeholders, newStakeholder]);
    setNewStakeholder({});
    setShowStakeholderForm(false);
  };

  const removeStakeholder = (index: number) => {
    const stakeholders = formData.stakeholders || [];
    onChange('stakeholders', stakeholders.filter((_: any, i: number) => i !== index));
  };

  return (
    <div className="grid grid-cols-3 gap-4">
      {/* Contact Information */}
      <Card className="bg-blue-50 border-blue-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="w-5 h-5 text-blue-600" />
            Contact Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {renderField('First Name', lead.first_name, editing, 'first_name')}
          {renderField('Last Name', lead.last_name, editing, 'last_name')}
          {renderField('Email', lead.email, editing, 'email')}
          {renderField('Primary Phone', lead.phone, editing, 'phone')}
          {renderField('Secondary Phone', lead.phone2, editing, 'phone2')}
        </CardContent>
      </Card>

      {/* Address & Location */}
      <Card className="bg-green-50 border-green-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="w-5 h-5 text-green-600" />
            Address & Location
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {renderField('City', lead.city, editing, 'city')}
          {renderField('Street', lead.street, editing, 'street')}
          {renderField('Building Number', lead.building_number, editing, 'building_number')}
          {renderField('Apartment/Floor', lead.apartment, editing, 'apartment')}
          {renderField('Postal Code', lead.postal_code, editing, 'postal_code')}
          {renderField('Region', lead.region, editing, 'region')}
        </CardContent>
      </Card>

      {/* Business & Project Info */}
      <Card className="bg-purple-50 border-purple-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="w-5 h-5 text-purple-600" />
            Project & Business
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="py-2 border-b">
            <span className="text-sm text-slate-600">Client Type</span>
            {editing ? (
              <select
                value={formData.lead_type || ''}
                onChange={(e) => onChange('lead_type', e.target.value)}
                className="w-full border rounded px-2 py-1 text-sm mt-1"
              >
                <option value="">Select type</option>
                <option value="private">Private</option>
                <option value="business">Business</option>
              </select>
            ) : (
              <span className="font-semibold">
                {lead.lead_type === 'private' ? 'Private' : 'Business'}
              </span>
            )}
          </div>
          {renderField('Company', lead.company, editing, 'company')}
          {renderField('Project Type', lead.project_type, editing, 'project_type')}
          {renderField('Estimated Budget', `${lead.budget?.toLocaleString() || '\u2014'}`, editing, 'budget')}
          {renderField('Timeline', lead.timeline, editing, 'timeline')}
        </CardContent>
      </Card>

      {/* Stakeholders */}
      <Card className="bg-orange-50 border-orange-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-5 h-5 text-orange-600" />
            Stakeholders
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {renderField('Architect', lead.architect, editing, 'architect')}
          {renderField('Contractor', lead.contractor, editing, 'contractor')}
          {renderField('Designer', lead.designer, editing, 'designer')}
        </CardContent>
      </Card>

      {/* Lead Source & Value */}
      <Card className="bg-indigo-50 border-indigo-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <User className="w-5 h-5 text-indigo-600" />
            Source & Value
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="py-2 border-b">
            <span className="text-sm text-slate-600">Lead Source</span>
            {editing ? (
              <select
                value={formData.source || ''}
                onChange={(e) => onChange('source', e.target.value)}
                className="w-full border rounded px-2 py-1 text-sm mt-1"
              >
                <option value="website">Website</option>
                <option value="referral">Referral</option>
                <option value="phone">Phone</option>
                <option value="facebook">Facebook</option>
                <option value="instagram">Instagram</option>
                <option value="google">Google</option>
              </select>
            ) : (
              <Badge className="mt-2 bg-blue-100 text-blue-800">
                {lead.source}
              </Badge>
            )}
          </div>
          {renderField('Estimated Value', `$${(lead.value || 0).toLocaleString()}`, editing, 'value')}
        </CardContent>
      </Card>

      {/* Map */}
      <Card className="bg-cyan-50 border-cyan-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="w-5 h-5 text-cyan-600" />
            Map & Geolocation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {lead.latitude && lead.longitude ? (
            <div className="space-y-2">
              <div className="bg-white rounded p-3 text-sm">
                <p className="text-slate-600">GPS Coordinates:</p>
                <p className="font-mono font-semibold">
                  {lead.latitude.toFixed(5)}, {lead.longitude.toFixed(5)}
                </p>
              </div>
              <a
                href={`https://maps.google.com/?q=${lead.latitude},${lead.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center bg-cyan-600 text-white py-2 rounded text-sm hover:bg-cyan-700"
              >
                Open in Maps
              </a>
            </div>
          ) : (
            <p className="text-slate-500 text-sm">No GPS coordinates</p>
          )}
          {lead.address_full && (
            <a
              href={`https://maps.google.com/?q=${encodeURIComponent(lead.address_full)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center bg-cyan-600 text-white py-2 rounded text-sm hover:bg-cyan-700"
            >
              Search by Address
            </a>
          )}
        </CardContent>
      </Card>

      {/* Communication Preferences */}
      <Card className="bg-rose-50 border-rose-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-rose-600" />
            Communication Preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {renderField('Communication Style',
            lead.communication_style ?
            ({ short: 'Short & Direct', detailed: 'Detailed', technical: 'Technical', business: 'Business' } as Record<string, string>)[lead.communication_style] : '\u2014',
            editing, 'communication_style', 'select')}
          {renderField('Preferred Channel',
            lead.preferred_channel ?
            ({ phone: 'Phone', email: 'Email', whatsapp: 'WhatsApp', meeting: 'Meeting' } as Record<string, string>)[lead.preferred_channel] : '\u2014',
            editing, 'preferred_channel', 'select')}
          {renderField('Contact Frequency',
            lead.contact_frequency ?
            ({ daily: 'Daily', weekly: 'Weekly', 'bi-weekly': 'Bi-weekly', monthly: 'Monthly', 'as-needed': 'As Needed' } as Record<string, string>)[lead.contact_frequency] : '\u2014',
            editing, 'contact_frequency', 'select')}
          {renderField('Preferred Hours', lead.preferred_contact_hours, editing, 'preferred_contact_hours')}
        </CardContent>
      </Card>

      {/* Stakeholders Loop */}
      <Card className="bg-amber-50 border-amber-200 col-span-2">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-5 h-5 text-amber-600" />
              Loop Participants ({(formData.stakeholders || lead.stakeholders || []).length})
            </CardTitle>
            {editing && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowStakeholderForm(!showStakeholderForm)}
                className="gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Participant
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {editing && showStakeholderForm && (
            <div className="border rounded-lg p-4 bg-white space-y-3 mb-4">
              <Input
                placeholder="Name"
                value={newStakeholder.name || ''}
                onChange={(e) => setNewStakeholder({ ...newStakeholder, name: e.target.value })}
              />
              <Input
                placeholder="Role"
                value={newStakeholder.role || ''}
                onChange={(e) => setNewStakeholder({ ...newStakeholder, role: e.target.value })}
              />
              <Input
                placeholder="Phone"
                value={newStakeholder.phone || ''}
                onChange={(e) => setNewStakeholder({ ...newStakeholder, phone: e.target.value })}
              />
              <Input
                placeholder="Email"
                value={newStakeholder.email || ''}
                onChange={(e) => setNewStakeholder({ ...newStakeholder, email: e.target.value })}
              />
              <textarea
                placeholder="Notes"
                value={newStakeholder.notes || ''}
                onChange={(e) => setNewStakeholder({ ...newStakeholder, notes: e.target.value })}
                className="w-full p-2 border rounded text-sm"
                rows={2}
              />
              <div className="flex gap-2">
                <Button onClick={addStakeholder} size="sm" className="bg-green-600 flex-1">Add</Button>
                <Button onClick={() => setShowStakeholderForm(false)} size="sm" variant="outline" className="flex-1">Cancel</Button>
              </div>
            </div>
          )}

          {(formData.stakeholders || lead.stakeholders || []).length === 0 ? (
            <p className="text-slate-500 text-sm">No loop participants</p>
          ) : (
            (formData.stakeholders || lead.stakeholders || []).map((stakeholder: Stakeholder, index: number) => (
              <div key={index} className="bg-white border border-amber-200 rounded-lg p-3">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-semibold">{stakeholder.name}</p>
                    <p className="text-xs text-slate-600">{stakeholder.role}</p>
                  </div>
                  {editing && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeStakeholder(index)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                <div className="text-xs space-y-1">
                  {stakeholder.phone && <p className="flex items-center gap-2"><Phone className="w-3 h-3" />{stakeholder.phone}</p>}
                  {stakeholder.email && <p className="flex items-center gap-2"><Mail className="w-3 h-3" />{stakeholder.email}</p>}
                  {stakeholder.notes && <p className="text-slate-600 mt-2">{stakeholder.notes}</p>}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
