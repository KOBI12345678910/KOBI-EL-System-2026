import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { entityCreate } from "@/lib/entity-api";
import { authJson } from "@/lib/utils";
import { Phone, Mail, Building2 } from "lucide-react";

interface LeadCreationFormProps {
  onSuccess?: (lead: any) => void;
}

export default function LeadCreationForm({ onSuccess }: LeadCreationFormProps) {
  const [formData, setFormData] = useState({ full_name: "", phone: "", email: "", company_name: "", source: "manual" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!formData.full_name || !formData.phone) { setError("Name and phone are required"); return; }

    setLoading(true);
    try {
      const me = await authJson("/api/auth/me");
      const lead = await entityCreate("leads", { ...formData, stage: "new", owner_id: me?.id });
      await entityCreate("activities", { entity_type: "lead", entity_id: lead.id, action_type: "note", description: `Lead created manually`, performed_by: me?.id });
      setFormData({ full_name: "", phone: "", email: "", company_name: "", source: "manual" });
      onSuccess?.(lead);
    } catch (err) {
      setError("Error creating lead");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader><CardTitle>Create New Lead</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-300 rounded-lg text-red-700 text-sm">{error}</div>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Full Name *</label>
              <Input required placeholder="John Doe" value={formData.full_name} onChange={(e) => setFormData({ ...formData, full_name: e.target.value })} className="border-slate-300" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Phone *</label>
              <div className="relative">
                <Phone className="absolute right-3 top-3 w-4 h-4 text-slate-400" />
                <Input required placeholder="050-1234567" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="border-slate-300 pr-10" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Email</label>
              <div className="relative">
                <Mail className="absolute right-3 top-3 w-4 h-4 text-slate-400" />
                <Input type="email" placeholder="name@company.com" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="border-slate-300 pr-10" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Company</label>
              <div className="relative">
                <Building2 className="absolute right-3 top-3 w-4 h-4 text-slate-400" />
                <Input placeholder="Company name" value={formData.company_name} onChange={(e) => setFormData({ ...formData, company_name: e.target.value })} className="border-slate-300 pr-10" />
              </div>
            </div>
          </div>
          <div className="flex gap-3 pt-4">
            <Button type="submit" disabled={loading} className="flex-1 bg-indigo-600 hover:bg-indigo-700">{loading ? "Saving..." : "Create Lead"}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
