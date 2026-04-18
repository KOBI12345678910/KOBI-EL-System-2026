import { useState } from 'react';
import { entityCreate, entityUpdate } from '@/lib/entity-api';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, User, Phone, Mail, MapPin, Building2 } from 'lucide-react';

interface LeadFormProps {
  lead?: any;
  onClose?: () => void;
  onSuccess?: () => void;
}

export default function LeadForm({ lead, onClose, onSuccess }: LeadFormProps) {
  const [form, setForm] = useState(lead || {
    first_name: '',
    last_name: '',
    phone: '',
    phone_secondary: '',
    email: '',
    address_city: '',
    address_street: '',
    address_number: '',
    address_apartment: '',
    building_floor: '',
    building_details: '',
    source: 'website',
    status: 'new',
    stage: 'new',
    notes: ''
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!form.phone) {
      setError('Phone is required');
      return;
    }

    setLoading(true);
    try {
      const updatedForm = {
        ...form,
        full_name: `${form.first_name || ''} ${form.last_name || ''}`.trim()
      };

      if (lead?.id) {
        await entityUpdate("leads", lead.id, updatedForm);
      } else {
        await entityCreate("leads", updatedForm);
      }

      onSuccess?.();
      onClose?.();
    } catch (err: any) {
      console.error('Error saving lead:', err);
      setError(err?.message || 'Error saving lead');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <Card className="w-full max-w-3xl my-8 shadow-2xl">
        <CardHeader className="flex flex-row justify-between items-center bg-gradient-to-r from-indigo-50 to-purple-50 border-b">
          <CardTitle className="text-xl font-bold flex items-center gap-2">
            <User className="w-6 h-6 text-indigo-600" />
            {lead ? 'Edit Lead' : 'New Lead'}
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </CardHeader>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* Personal Info */}
            <div className="space-y-4">
              <h3 className="font-semibold text-lg flex items-center gap-2 text-slate-800">
                <User className="w-5 h-5 text-indigo-600" />
                Personal Details
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>First Name</Label>
                  <Input
                    value={form.first_name}
                    onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                    placeholder="John"
                  />
                </div>
                <div>
                  <Label>Last Name</Label>
                  <Input
                    value={form.last_name}
                    onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                    placeholder="Doe"
                  />
                </div>
                <div>
                  <Label>Gender</Label>
                  <Select value={form.gender} onValueChange={(value) => setForm({ ...form, gender: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>ID / Customer ID</Label>
                  <Input
                    value={form.id_number}
                    onChange={(e) => setForm({ ...form, id_number: e.target.value })}
                    placeholder="123456789"
                  />
                </div>
                <div>
                  <Label>Date of Birth</Label>
                  <Input
                    type="date"
                    value={form.birth_date}
                    onChange={(e) => setForm({ ...form, birth_date: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Age</Label>
                  <Input
                    type="number"
                    value={form.age}
                    onChange={(e) => setForm({ ...form, age: e.target.value })}
                    placeholder="30"
                  />
                </div>
              </div>
            </div>

            {/* Contact Info */}
            <div className="space-y-4 pt-4 border-t">
              <h3 className="font-semibold text-lg flex items-center gap-2 text-slate-800">
                <Phone className="w-5 h-5 text-blue-600" />
                Contact Details
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="flex items-center gap-1">
                    <Phone className="w-4 h-4" />
                    Mobile Phone *
                  </Label>
                  <Input
                    required
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="050-1234567"
                  />
                </div>
                <div>
                  <Label>Secondary Phone</Label>
                  <Input
                    value={form.phone_secondary}
                    onChange={(e) => setForm({ ...form, phone_secondary: e.target.value })}
                    placeholder="052-7654321"
                  />
                </div>
                <div className="col-span-2">
                  <Label className="flex items-center gap-1">
                    <Mail className="w-4 h-4" />
                    Email
                  </Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="email@example.com"
                  />
                </div>
              </div>
            </div>

            {/* Address */}
            <div className="space-y-4 pt-4 border-t">
              <h3 className="font-semibold text-lg flex items-center gap-2 text-slate-800">
                <MapPin className="w-5 h-5 text-emerald-600" />
                Address
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>City</Label>
                  <Input
                    value={form.address_city}
                    onChange={(e) => setForm({ ...form, address_city: e.target.value })}
                    placeholder="City"
                  />
                </div>
                <div>
                  <Label>Street</Label>
                  <Input
                    value={form.address_street}
                    onChange={(e) => setForm({ ...form, address_street: e.target.value })}
                    placeholder="Street name"
                  />
                </div>
                <div>
                  <Label>Building Number</Label>
                  <Input
                    value={form.address_number}
                    onChange={(e) => setForm({ ...form, address_number: e.target.value })}
                    placeholder="123"
                  />
                </div>
                <div>
                  <Label>Apartment Number</Label>
                  <Input
                    value={form.address_apartment}
                    onChange={(e) => setForm({ ...form, address_apartment: e.target.value })}
                    placeholder="5"
                  />
                </div>
                <div>
                  <Label>Floor</Label>
                  <Input
                    value={form.building_floor}
                    onChange={(e) => setForm({ ...form, building_floor: e.target.value })}
                    placeholder="2"
                  />
                </div>
                <div>
                  <Label>Building Details</Label>
                  <Input
                    value={form.building_details}
                    onChange={(e) => setForm({ ...form, building_details: e.target.value })}
                    placeholder="Building A, main entrance"
                  />
                </div>
              </div>
            </div>

            {/* Lead Info */}
            <div className="space-y-4 pt-4 border-t">
              <h3 className="font-semibold text-lg flex items-center gap-2 text-slate-800">
                <Building2 className="w-5 h-5 text-purple-600" />
                Additional Info
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Lead Source</Label>
                  <Select value={form.source} onValueChange={(value) => setForm({ ...form, source: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="website">Website</SelectItem>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      <SelectItem value="facebook">Facebook</SelectItem>
                      <SelectItem value="phone">Phone</SelectItem>
                      <SelectItem value="referral">Referral</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">New</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="not_relevant">Not Relevant</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label>Notes</Label>
                  <Textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Additional notes about the lead..."
                    rows={3}
                  />
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-6 border-t">
              <Button type="submit" className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg hover:shadow-xl" disabled={loading}>
                {loading ? 'Saving...' : lead ? 'Update Lead' : 'Create Lead'}
              </Button>
              <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
