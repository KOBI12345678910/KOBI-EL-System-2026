import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { entityUpdate } from "@/lib/entity-api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Edit2, Save, X, Building2, User, Phone, Mail, MapPin, Briefcase, Lock } from "lucide-react";
import { toast } from "sonner";
import { useFieldPermission } from "./use-lead-permissions";
import BlockManager from "./block-manager";
import type { LeadPermissions } from "./use-lead-permissions";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface LeadRecord {
  id: string;
  customer_type: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  city?: string;
  address?: string;
  work_type?: string[];
  material?: string;
  quantity?: string | number;
  dimensions?: string;
  notes?: string;
  ai_summary?: string;
  [key: string]: unknown;
}

interface LeftPanelProps {
  lead: LeadRecord;
  permissions: LeadPermissions;
  onUpdate?: () => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function LeftPanel({ lead, permissions, onUpdate }: LeftPanelProps) {
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState<LeadRecord>(lead);
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: (data: Partial<LeadRecord>) => entityUpdate<LeadRecord>("leads", lead.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead", lead.id] });
      toast.success("\u05D4\u05DC\u05D9\u05D3 \u05E2\u05D5\u05D3\u05DB\u05DF \u05D1\u05D4\u05E6\u05DC\u05D7\u05D4");
      setEditing(false);
      onUpdate?.();
    },
    onError: () => toast.error("\u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05E2\u05D3\u05DB\u05D5\u05DF \u05D4\u05DC\u05D9\u05D3"),
  });

  const handleSave = () => {
    updateMutation.mutate(formData);
  };

  const handleCancel = () => {
    setFormData(lead);
    setEditing(false);
  };

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <User className="w-5 h-5 text-indigo-600" />
          \u05E4\u05E8\u05D8\u05D9 \u05D4\u05DC\u05D9\u05D3
          {!permissions.canEditLead && (
            <Lock className="w-4 h-4 text-slate-400" title="\u05D0\u05D9\u05DF \u05D4\u05E8\u05E9\u05D0\u05EA \u05E2\u05E8\u05D9\u05DB\u05D4" />
          )}
        </CardTitle>
        {permissions.canEditLead && !editing && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Edit2 className="w-4 h-4 ml-2" />
            \u05E2\u05E8\u05D5\u05DA
          </Button>
        )}
        {editing && (
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending}>
              <Save className="w-4 h-4 ml-2" />
              \u05E9\u05DE\u05D5\u05E8
            </Button>
            <Button variant="outline" size="sm" onClick={handleCancel}>
              <X className="w-4 h-4 ml-2" />
              \u05D1\u05D9\u05D8\u05D5\u05DC
            </Button>
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Basic Info */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 border-b pb-2">
            <Building2 className="w-4 h-4" />
            \u05DE\u05D9\u05D3\u05E2 \u05DB\u05DC\u05DC\u05D9
          </div>

          {lead.customer_type === "private" ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>\u05E9\u05DD \u05E4\u05E8\u05D8\u05D9</Label>
                {editing ? (
                  <Input
                    value={formData.first_name || ""}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  />
                ) : (
                  <p className="text-sm text-slate-900 mt-1">{lead.first_name || "-"}</p>
                )}
              </div>
              <div>
                <Label>\u05E9\u05DD \u05DE\u05E9\u05E4\u05D7\u05D4</Label>
                {editing ? (
                  <Input
                    value={formData.last_name || ""}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  />
                ) : (
                  <p className="text-sm text-slate-900 mt-1">{lead.last_name || "-"}</p>
                )}
              </div>
            </div>
          ) : (
            <>
              <div>
                <Label>\u05E9\u05DD \u05D4\u05D7\u05D1\u05E8\u05D4</Label>
                {editing ? (
                  <Input
                    value={formData.company_name || ""}
                    onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                  />
                ) : (
                  <p className="text-sm text-slate-900 mt-1">{lead.company_name || "-"}</p>
                )}
              </div>
              <div>
                <Label>\u05D0\u05D9\u05E9 \u05E7\u05E9\u05E8</Label>
                {editing ? (
                  <Input
                    value={formData.contact_person || ""}
                    onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                  />
                ) : (
                  <p className="text-sm text-slate-900 mt-1">{lead.contact_person || "-"}</p>
                )}
              </div>
            </>
          )}
        </div>

        {/* Contact Info */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 border-b pb-2">
            <Phone className="w-4 h-4" />
            \u05E4\u05E8\u05D8\u05D9 \u05D4\u05EA\u05E7\u05E9\u05E8\u05D5\u05EA
          </div>

          <div>
            <Label>\u05D8\u05DC\u05E4\u05D5\u05DF</Label>
            {editing ? (
              <Input
                value={formData.phone || ""}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            ) : (
              <p className="text-sm text-slate-900 mt-1">{lead.phone || "-"}</p>
            )}
          </div>

          <div>
            <Label>\u05D0\u05D9\u05DE\u05D9\u05D9\u05DC</Label>
            {editing ? (
              <Input
                type="email"
                value={formData.email || ""}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            ) : (
              <p className="text-sm text-slate-900 mt-1">{lead.email || "-"}</p>
            )}
          </div>
        </div>

        {/* Location */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 border-b pb-2">
            <MapPin className="w-4 h-4" />
            \u05DE\u05D9\u05E7\u05D5\u05DD \u05D5\u05D0\u05EA\u05E8
          </div>

          <div>
            <Label>\u05E2\u05D9\u05E8</Label>
            {editing ? (
              <Input
                value={formData.city || ""}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              />
            ) : (
              <p className="text-sm text-slate-900 mt-1">{lead.city || "-"}</p>
            )}
          </div>

          <div>
            <Label>\u05DB\u05EA\u05D5\u05D1\u05EA</Label>
            {editing ? (
              <Textarea
                value={formData.address || ""}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                rows={2}
              />
            ) : (
              <p className="text-sm text-slate-900 mt-1">{lead.address || "-"}</p>
            )}
          </div>
        </div>

        {/* Project Details */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 border-b pb-2">
            <Briefcase className="w-4 h-4" />
            \u05E4\u05E8\u05D8\u05D9 \u05D4\u05E4\u05E8\u05D5\u05D9\u05E7\u05D8
          </div>

          <div>
            <Label>\u05E1\u05D5\u05D2\u05D9 \u05E2\u05D1\u05D5\u05D3\u05D4</Label>
            <p className="text-sm text-slate-900 mt-1">{lead.work_type?.join(", ") || "-"}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>\u05D7\u05D5\u05DE\u05E8</Label>
              <p className="text-sm text-slate-900 mt-1">{lead.material || "-"}</p>
            </div>
            <div>
              <Label>\u05DB\u05DE\u05D5\u05EA</Label>
              <p className="text-sm text-slate-900 mt-1">{lead.quantity || "-"}</p>
            </div>
          </div>

          <div>
            <Label>\u05DE\u05D9\u05D3\u05D5\u05EA</Label>
            <p className="text-sm text-slate-900 mt-1">{lead.dimensions || "-"}</p>
          </div>

          <div>
            <Label>\u05D4\u05E2\u05E8\u05D5\u05EA</Label>
            {editing ? (
              <Textarea
                value={formData.notes || ""}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
              />
            ) : (
              <p className="text-sm text-slate-900 mt-1 whitespace-pre-wrap">{lead.notes || "-"}</p>
            )}
          </div>
        </div>

        {/* AI Summary */}
        {lead.ai_summary && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 border-b pb-2">
              \uD83E\uDD16 \u05E1\u05D9\u05DB\u05D5\u05DD AI
            </div>
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
              <p className="text-sm text-indigo-900">{lead.ai_summary}</p>
            </div>
          </div>
        )}
      </CardContent>

      {/* Custom Blocks Section */}
      <CardContent className="pt-0 border-t border-slate-200">
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Briefcase className="w-4 h-4" />
            \u05D1\u05DC\u05D5\u05E7\u05D9\u05DD \u05DE\u05D5\u05EA\u05D0\u05DE\u05D9\u05DD \u05D0\u05D9\u05E9\u05D9\u05EA
          </div>
          <BlockManager leadId={lead.id} permissions={permissions} />
        </div>
      </CardContent>
    </Card>
  );
}
