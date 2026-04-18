import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader, Save } from 'lucide-react';
import { entityFilter } from "@/lib/entity-api";

export default function CustomFieldValueEditor({ entityId, entityType, onSave }) {
  const [fields, setFields] = useState([]);
  const [values, setValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadFieldsAndValues();
  }, [entityId, entityType]);

  const loadFieldsAndValues = async () => {
    try {
      setLoading(true);
      const fieldsData = await entityFilter<any>("custom-fields", { 
        entity_type: entityType,
        is_active: true 
      });
      setFields(fieldsData);

      let valuesData: any[] = [];
      try {
        valuesData = await entityFilter<any>("lead-field-values", { lead_id: entityId }) ||
          await entityFilter<any>("contact-field-values", { contact_id: entityId }) ||
          await entityFilter<any>("account-field-values", { account_id: entityId }) ||
          [];
      } catch { valuesData = []; }

      const valueMap = {};
      valuesData.forEach(v => {
        valueMap[v.field_key] = v.value_text || v.value_number || v.value_date || v.value_bool;
      });
      setValues(valueMap);
    } catch (error) {
      console.error('Error loading fields:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await fetch("/api/integrations/invoke-llm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        prompt: `Save custom field values for ${entityType} ${entityId}`,
        add_context_from_internet: false
      }) });

      // Call API endpoint via fetch (since it's backend)
      await fetch(`/api/leads/${entityId}/values`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values })
      });

      onSave?.();
    } catch (error) {
      console.error('Error saving values:', error);
      alert('Failed to save custom fields');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card className="border-0 shadow-sm">
        <CardContent className="p-8 flex items-center justify-center">
          <Loader className="w-5 h-5 animate-spin text-slate-600 mr-2" />
          <span className="text-slate-600">Loading custom fields...</span>
        </CardContent>
      </Card>
    );
  }

  if (fields.length === 0) {
    return (
      <Card className="border-0 shadow-sm bg-slate-50">
        <CardContent className="p-6 text-center">
          <p className="text-slate-600">No custom fields available for {entityType}</p>
        </CardContent>
      </Card>
    );
  }

  const groupedBySection = fields.reduce((acc, field) => {
    const section = field.section || 'Other';
    if (!acc[section]) acc[section] = [];
    acc[section].push(field);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {Object.entries(groupedBySection).map(([section, sectionFields]) => (
        <Card key={section} className="border-0 shadow-sm">
          <CardHeader className="bg-slate-50 border-b">
            <CardTitle className="text-base">{section}</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            {sectionFields.map(field => (
              <div key={field.id}>
                <label className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-slate-900">{field.label}</span>
                  {field.required && <Badge className="bg-red-100 text-red-800 text-xs">Required</Badge>}
                </label>
                {field.description && (
                  <p className="text-xs text-slate-500 mb-2">{field.description}</p>
                )}

                {field.field_type === 'textarea' ? (
                  <Textarea
                    value={values[field.key] || ''}
                    onChange={(e) => setValues({...values, [field.key]: e.target.value})}
                    rows={3}
                  />
                ) : field.field_type === 'select' || field.field_type === 'multiselect' ? (
                  <Select value={values[field.key] || ''} onValueChange={(v) => setValues({...values, [field.key]: v})}>
                    <SelectTrigger>
                      <SelectValue placeholder={`Select ${field.label}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {field.options?.choices?.map(choice => (
                        <SelectItem key={choice.value} value={choice.value}>
                          {choice.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : field.field_type === 'checkbox' ? (
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={values[field.key] === true || values[field.key] === 'true'}
                      onChange={(e) => setValues({...values, [field.key]: e.target.checked})}
                      className="rounded"
                    />
                    <span className="text-sm text-slate-700">Yes</span>
                  </label>
                ) : (
                  <Input
                    type={field.field_type === 'number' || field.field_type === 'currency' ? 'number' : field.field_type === 'date' ? 'date' : field.field_type === 'email' ? 'email' : field.field_type === 'phone' ? 'tel' : field.field_type === 'url' ? 'url' : 'text'}
                    value={values[field.key] || ''}
                    onChange={(e) => setValues({...values, [field.key]: e.target.value})}
                    placeholder={field.label}
                  />
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      <Button 
        onClick={handleSave} 
        disabled={saving}
        className="w-full bg-blue-600 hover:bg-blue-700"
      >
        {saving ? <Loader className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
        {saving ? 'Saving...' : 'Save Custom Fields'}
      </Button>
    </div>
  );
}