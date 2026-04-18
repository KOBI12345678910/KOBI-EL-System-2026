import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { entityList, entityCreate, entityDelete } from "@/lib/entity-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Plus, Trash2, Edit2 } from "lucide-react";

interface Lead {
  id: number;
  full_name?: string;
  email?: string;
  phone?: string;
  company_name?: string;
  stage?: string;
}

const STAGES: Record<string, string> = {
  new: "bg-slate-100 text-slate-800",
  contacted: "bg-blue-100 text-blue-800",
  qualified: "bg-purple-100 text-purple-800",
  proposal: "bg-orange-100 text-orange-800",
  negotiation: "bg-yellow-100 text-yellow-800",
  won: "bg-green-100 text-green-800",
  lost: "bg-red-100 text-red-800",
};

export default function LeadsManager() {
  const [searchTerm, setSearchTerm] = useState("");
  const [showForm, setShowForm] = useState(false);
  const queryClient = useQueryClient();

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["leads"],
    queryFn: () => entityList<Lead>("leads"),
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<Lead>) => entityCreate<Lead>("leads", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      setShowForm(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => entityDelete("leads", id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["leads"] }),
  });

  const filteredLeads = leads.filter(
    (lead) =>
      !searchTerm ||
      lead.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.phone?.includes(searchTerm)
  );

  if (isLoading) return <div className="p-8 text-center text-slate-600">טוען...</div>;

  return (
    <div className="space-y-4">
      <div className="flex gap-4 items-center">
        <Input
          placeholder="חיפוש לידים..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1"
        />
        <Sheet open={showForm} onOpenChange={setShowForm}>
          <SheetTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 ml-2" />
              ליד חדש
            </Button>
          </SheetTrigger>
          <SheetContent dir="rtl">
            <SheetHeader>
              <SheetTitle>ליד חדש</SheetTitle>
            </SheetHeader>
            <LeadForm onSubmit={(data) => createMutation.mutate(data)} />
          </SheetContent>
        </Sheet>
      </div>

      {filteredLeads.length === 0 ? (
        <div className="p-8 text-center text-slate-500">אין לידים</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-3 text-right font-semibold text-slate-700">שם</th>
                <th className="p-3 text-right font-semibold text-slate-700">אימייל</th>
                <th className="p-3 text-right font-semibold text-slate-700">טלפון</th>
                <th className="p-3 text-right font-semibold text-slate-700">חברה</th>
                <th className="p-3 text-right font-semibold text-slate-700">סטטוס</th>
                <th className="p-3 text-center font-semibold text-slate-700">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.map((lead) => (
                <tr key={lead.id} className="border-b border-slate-200 hover:bg-slate-50">
                  <td className="p-3 font-medium">{lead.full_name}</td>
                  <td className="p-3 text-slate-600 text-sm">{lead.email}</td>
                  <td className="p-3 text-slate-600 text-sm">{lead.phone}</td>
                  <td className="p-3 text-slate-600 text-sm">{lead.company_name || "-"}</td>
                  <td className="p-3">
                    <Badge className={STAGES[lead.stage || "new"] || STAGES.new}>
                      {lead.stage}
                    </Badge>
                  </td>
                  <td className="p-3 flex gap-2 justify-center">
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteMutation.mutate(lead.id)}
                      className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface LeadFormProps {
  onSubmit: (data: Partial<Lead>) => void;
}

function LeadForm({ onSubmit }: LeadFormProps) {
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    phone: "",
    company_name: "",
    stage: "new",
  });

  const handleSubmit = () => {
    if (!formData.full_name || !formData.phone) {
      alert("חובה למלא שם וטלפון");
      return;
    }
    onSubmit(formData);
  };

  return (
    <div className="space-y-4 mt-6">
      <Input
        placeholder="שם מלא"
        value={formData.full_name}
        onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
      />
      <Input
        placeholder="אימייל"
        type="email"
        value={formData.email}
        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
      />
      <Input
        placeholder="טלפון"
        value={formData.phone}
        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
      />
      <Input
        placeholder="שם חברה"
        value={formData.company_name}
        onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
      />
      <Button onClick={handleSubmit} className="w-full bg-blue-600 hover:bg-blue-700">
        שמור
      </Button>
    </div>
  );
}
