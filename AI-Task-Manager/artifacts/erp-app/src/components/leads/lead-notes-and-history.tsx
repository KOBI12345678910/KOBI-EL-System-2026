import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, AlertCircle, Heart } from 'lucide-react';

interface LeadNotesAndHistoryProps {
  lead: any;
  editing: boolean;
  formData: any;
  onChange: (key: string, value: any) => void;
}

export default function LeadNotesAndHistory({ lead, editing, formData, onChange }: LeadNotesAndHistoryProps) {
  return (
    <div className="space-y-4">
      {/* General Notes */}
      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-slate-600" />
            General Notes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {editing ? (
            <textarea
              value={formData.general_notes || ''}
              onChange={(e) => onChange('general_notes', e.target.value)}
              className="w-full p-3 border rounded-lg text-sm"
              rows={4}
              placeholder="General notes about the client and project"
            />
          ) : (
            <p className="text-slate-700 whitespace-pre-wrap">{lead.general_notes || 'No notes'}</p>
          )}
        </CardContent>
      </Card>

      {/* Site Issues */}
      <Card className="border-red-200 bg-red-50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-600" />
            Special Site Issues
          </CardTitle>
        </CardHeader>
        <CardContent>
          {editing ? (
            <textarea
              value={formData.site_special_issues || ''}
              onChange={(e) => onChange('site_special_issues', e.target.value)}
              className="w-full p-3 border rounded-lg text-sm"
              rows={3}
              placeholder="Issues, difficulties, or notes about the work site"
            />
          ) : (
            <p className="text-slate-700 whitespace-pre-wrap">
              {lead.site_special_issues || 'No special issues'}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Special Requirements */}
      <Card className="border-purple-200 bg-purple-50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Heart className="w-5 h-5 text-purple-600" />
            Special Requirements & Preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Sensitive Client */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              disabled={!editing}
              checked={formData.is_sensitive_client || lead.is_sensitive_client || false}
              onChange={(e) => onChange('is_sensitive_client', e.target.checked)}
            />
            <span className="text-sm">Sensitive Client</span>
          </label>

          {/* Special Requirements */}
          <div>
            <label className="text-sm font-semibold text-slate-600">Special Requirements</label>
            {editing ? (
              <textarea
                value={formData.special_requirements || ''}
                onChange={(e) => onChange('special_requirements', e.target.value)}
                className="w-full p-2 border rounded text-sm mt-1"
                rows={2}
                placeholder="Special requirements from the client"
              />
            ) : (
              <p className="text-sm text-slate-700">{lead.special_requirements || '\u2014'}</p>
            )}
          </div>

          {/* Client Preferences */}
          <div>
            <label className="text-sm font-semibold text-slate-600">Personal Preferences</label>
            {editing ? (
              <textarea
                value={formData.client_preferences || ''}
                onChange={(e) => onChange('client_preferences', e.target.value)}
                className="w-full p-2 border rounded text-sm mt-1"
                rows={2}
                placeholder="Special preferences of the client"
              />
            ) : (
              <p className="text-sm text-slate-700">{lead.client_preferences || '\u2014'}</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
