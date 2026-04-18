import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { entityCreate, entityUpdate } from "@/lib/entity-api";

const FIELD_TYPES = [
  { value: 'text', label: 'טקסט' },
  { value: 'textarea', label: 'טקסט ארוך' },
  { value: 'number', label: 'מספר' },
  { value: 'email', label: 'אימייל' },
  { value: 'phone', label: 'טלפון' },
  { value: 'date', label: 'תאריך' },
  { value: 'select', label: 'בחירה מרשימה' },
  { value: 'checkbox', label: 'תיבת סימון' },
  { value: 'lookup', label: 'חיפוש בישות אחרת' }
];

export default function FieldBuilder({ open, onClose, entityType, existingField }) {
  const [fieldName, setFieldName] = useState('');
  const [fieldKey, setFieldKey] = useState('');
  const [fieldType, setFieldType] = useState('text');
  const [required, setRequired] = useState(false);
  const [requiredAtStages, setRequiredAtStages] = useState([]);
  const [placeholder, setPlaceholder] = useState('');
  const [helpText, setHelpText] = useState('');
  const [defaultValue, setDefaultValue] = useState('');
  const [options, setOptions] = useState([{ label: '', value: '' }]);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (existingField) {
      setFieldName(existingField.field_name);
      setFieldKey(existingField.field_key);
      setFieldType(existingField.field_type);
      setRequired(existingField.required);
      setRequiredAtStages(existingField.required_at_stage || []);
      setPlaceholder(existingField.placeholder || '');
      setHelpText(existingField.help_text || '');
      setDefaultValue(existingField.default_value || '');
      setOptions(existingField.options || [{ label: '', value: '' }]);
    } else {
      setFieldName('');
      setFieldKey('');
      setFieldType('text');
      setRequired(false);
      setRequiredAtStages([]);
      setPlaceholder('');
      setHelpText('');
      setDefaultValue('');
      setOptions([{ label: '', value: '' }]);
    }
  }, [existingField, open]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const fieldData = {
        entity_type: entityType,
        field_name: fieldName,
        field_key: fieldKey || fieldName.toLowerCase().replace(/\s+/g, '_'),
        field_type: fieldType,
        required,
        required_at_stage: requiredAtStages.length > 0 ? requiredAtStages : undefined,
        placeholder,
        help_text: helpText,
        default_value: defaultValue,
        options: fieldType === 'select' ? options.filter(o => o.label && o.value) : undefined,
        permissions: {
          visible_to_roles: ['admin', 'manager', 'agent'],
          editable_by_roles: ['admin', 'manager', 'agent']
        }
      };

      if (existingField) {
        await entityUpdate<any>("custom-fields", existingField.id, fieldData);
      } else {
        await entityCreate<any>("custom-fields", fieldData);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['customFields']);
      toast.success(existingField ? 'השדה עודכן בהצלחה' : 'השדה נוסף בהצלחה');
      onClose();
    }
  });

  const addOption = () => {
    setOptions([...options, { label: '', value: '' }]);
  };

  const removeOption = (index) => {
    setOptions(options.filter((_, i) => i !== index));
  };

  const updateOption = (index, key, value) => {
    const updated = [...options];
    updated[index][key] = value;
    setOptions(updated);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existingField ? 'ערוך שדה' : 'שדה חדש'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>שם השדה</Label>
              <Input
                value={fieldName}
                onChange={(e) => setFieldName(e.target.value)}
                placeholder="לדוגמה: תקציב משוער"
                className="mt-2"
              />
            </div>
            <div>
              <Label>מפתח השדה (אנגלית)</Label>
              <Input
                value={fieldKey}
                onChange={(e) => setFieldKey(e.target.value)}
                placeholder="estimated_budget"
                className="mt-2"
              />
            </div>
          </div>

          <div>
            <Label>סוג השדה</Label>
            <select
              value={fieldType}
              onChange={(e) => setFieldType(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 mt-2"
            >
              {FIELD_TYPES.map(type => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>טקסט עזר (Placeholder)</Label>
              <Input
                value={placeholder}
                onChange={(e) => setPlaceholder(e.target.value)}
                placeholder="הזן ערך..."
                className="mt-2"
              />
            </div>
            <div>
              <Label>ערך ברירת מחדל</Label>
              <Input
                value={defaultValue}
                onChange={(e) => setDefaultValue(e.target.value)}
                className="mt-2"
              />
            </div>
          </div>

          <div>
            <Label>הסבר לשדה</Label>
            <Textarea
              value={helpText}
              onChange={(e) => setHelpText(e.target.value)}
              placeholder="מידע נוסף למשתמש..."
              className="mt-2"
            />
          </div>

          {fieldType === 'select' && (
            <div>
              <Label className="mb-2 block">אפשרויות בחירה</Label>
              <div className="space-y-2">
                {options.map((option, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      placeholder="תווית"
                      value={option.label}
                      onChange={(e) => updateOption(index, 'label', e.target.value)}
                    />
                    <Input
                      placeholder="ערך"
                      value={option.value}
                      onChange={(e) => updateOption(index, 'value', e.target.value)}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeOption(index)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addOption}>
                  <Plus className="w-3 h-3 ml-1" />
                  הוסף אפשרות
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-3 p-4 bg-slate-50 rounded-lg">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={required}
                onCheckedChange={setRequired}
              />
              <Label>שדה חובה</Label>
            </div>

            <div>
              <Label className="text-xs text-slate-600">חובה רק בשלבים מסוימים:</Label>
              <Input
                placeholder="לדוגמה: qualified,proposal (מופרד בפסיקים)"
                value={requiredAtStages.join(',')}
                onChange={(e) => setRequiredAtStages(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                className="mt-2"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={onClose}>ביטול</Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!fieldName}
              className="bg-green-600 hover:bg-green-700"
            >
              {existingField ? 'עדכן' : 'צור שדה'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}