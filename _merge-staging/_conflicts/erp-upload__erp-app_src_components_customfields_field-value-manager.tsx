import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import DynamicFieldRenderer from './DynamicFieldRenderer';
import { Save, Loader } from 'lucide-react';
import { entityCreate, entityFilter, entityUpdate } from "@/lib/entity-api";

export default function FieldValueManager({ entityType, entityId, onSave }) {
  const [customFields, setCustomFields] = useState([]);
  const [fieldValues, setFieldValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const fieldValueEntityMap = {
    Lead: 'LeadFieldValue',
    Account: 'AccountFieldValue',
    Contact: 'ContactFieldValue',
    Deal: 'DealFieldValue',
    Quote: 'QuoteFieldValue',
    Customer: 'CustomerFieldValue',
  };

  const entityIdFieldMap = {
    Lead: 'lead_id',
    Account: 'account_id',
    Contact: 'contact_id',
    Deal: 'deal_id',
    Quote: 'quote_id',
    Customer: 'customer_id',
  };

  useEffect(() => {
    loadCustomFields();
  }, [entityType, entityId]);

  const loadCustomFields = async () => {
    try {
      setLoading(true);
      
      // Load custom field definitions
      const fields = await entityFilter<any>("custom-fields", { 
        entity_type: entityType,
        is_active: true 
      });
      setCustomFields(fields);

      // Load existing field values
      const valueEntity = fieldValueEntityMap[entityType];
      const idField = entityIdFieldMap[entityType];
      
      if (valueEntity && idField) {
        const values = await entityFilter<any>(valueEntity as string, {
          [idField]: entityId
        }) || [];

        const valuesMap = {};
        values.forEach(v => {
          valuesMap[v.field_key] = v.value_text || v.value_number || v.value_date || v.value_json || v.value_bool;
        });
        setFieldValues(valuesMap);
      }
    } catch (error) {
      console.error('Error loading custom fields:', error);
    } finally {
      setLoading(false);
    }
  };

  const validateFields = () => {
    const newErrors = {};
    customFields.forEach(field => {
      if (field.required && !fieldValues[field.key]) {
        newErrors[field.key] = `${field.label} is required`;
      }
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateFields()) return;

    try {
      setSaving(true);
      const valueEntity = fieldValueEntityMap[entityType];
      const idField = entityIdFieldMap[entityType];

      for (const field of customFields) {
        const value = fieldValues[field.key];
        
        // Prepare value based on field type
        const valuePayload = {
          [idField]: entityId,
          field_key: field.key,
          value_text: typeof value === 'string' ? value : null,
          value_number: field.field_type === 'number' || field.field_type === 'currency' ? Number(value) : null,
          value_date: field.field_type === 'date' || field.field_type === 'datetime' ? value : null,
          value_json: ['multiselect'].includes(field.field_type) ? value : null,
          value_bool: field.field_type === 'checkbox' ? value : null,
        };

        // Save or update field value
        const existing = await entityFilter<any>(valueEntity as string, {
          [idField]: entityId,
          field_key: field.key
        });

        if (existing?.length > 0) {
          await entityUpdate<any>(valueEntity as string, existing[0].id, valuePayload);
        } else if (value !== null && value !== undefined && value !== '') {
          await entityCreate<any>(valueEntity as string, valuePayload);
        }
      }

      onSave?.();
    } catch (error) {
      console.error('Error saving field values:', error);
      setErrors({ submit: 'Failed to save field values' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card className="border-0 shadow-sm">
        <CardContent className="p-8 flex items-center justify-center">
          <Loader className="w-5 h-5 animate-spin text-slate-600" />
          <span className="ml-2 text-slate-600">Loading custom fields...</span>
        </CardContent>
      </Card>
    );
  }

  if (customFields.length === 0) {
    return (
      <Card className="border-0 shadow-sm bg-slate-50">
        <CardContent className="p-6 text-center">
          <p className="text-slate-600 text-sm">No custom fields defined for {entityType}</p>
        </CardContent>
      </Card>
    );
  }

  // Group fields by section
  const groupedFields = customFields.reduce((acc, field) => {
    const section = field.section || 'General';
    if (!acc[section]) acc[section] = [];
    acc[section].push(field);
    return acc;
  }, {});

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="bg-gradient-to-r from-purple-50 to-blue-50">
        <CardTitle className="flex items-center justify-between">
          <span>📋 Custom Fields</span>
          <Badge variant="outline">{customFields.length} fields</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        {Object.entries(groupedFields).map(([section, fields]) => (
          <div key={section} className="space-y-4">
            {section !== 'General' && (
              <h3 className="font-semibold text-slate-900 text-sm">{section}</h3>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {fields.map(field => (
                <DynamicFieldRenderer
                  key={field.key}
                  field={field}
                  value={fieldValues[field.key]}
                  onChange={(value) => {
                    setFieldValues({...fieldValues, [field.key]: value});
                    if (errors[field.key]) {
                      setErrors({...errors, [field.key]: null});
                    }
                  }}
                  error={errors[field.key]}
                />
              ))}
            </div>
          </div>
        ))}

        {errors.submit && (
          <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            {errors.submit}
          </div>
        )}

        <Button 
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-purple-600 hover:bg-purple-700"
        >
          {saving ? <Loader className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          {saving ? 'Saving...' : 'Save Custom Fields'}
        </Button>
      </CardContent>
    </Card>
  );
}