import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, X } from 'lucide-react';

const FIELD_TYPES = ['text', 'textarea', 'number', 'currency', 'date', 'datetime', 'select', 'multiselect', 'checkbox', 'phone', 'email', 'url', 'rating'];

export default function FieldForm({ field, entityType, onSave, onCancel }) {
  const [formData, setFormData] = useState(field || {
    key: '',
    label: '',
    field_type: 'text',
    required: false,
    description: '',
    section: '',
    options: { choices: [] }
  });
  const [newChoice, setNewChoice] = useState('');

  const addChoice = () => {
    if (!newChoice.trim()) return;
    setFormData({
      ...formData,
      options: {
        ...formData.options,
        choices: [...(formData.options?.choices || []), { label: newChoice, value: newChoice.toLowerCase() }]
      }
    });
    setNewChoice('');
  };

  const removeChoice = (index) => {
    setFormData({
      ...formData,
      options: {
        ...formData.options,
        choices: (formData.options?.choices || []).filter((_, i) => i !== index)
      }
    });
  };

  const handleSave = () => {
    if (!formData.key || !formData.label) {
      alert('Key and Label are required');
      return;
    }
    if (['select', 'multiselect'].includes(formData.field_type) && !formData.options?.choices?.length) {
      alert('Select fields must have at least one choice');
      return;
    }
    onSave({ ...formData, entity_type: entityType });
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="bg-gradient-to-r from-purple-50 to-pink-50">
        <CardTitle>{field ? 'Edit Field' : 'Create New Field'}</CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-4">
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">Key (unique identifier)</label>
          <Input
            placeholder="e.g., custom_source"
            value={formData.key}
            onChange={(e) => setFormData({...formData, key: e.target.value})}
            disabled={!!field}
          />
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">Label</label>
          <Input
            placeholder="e.g., Lead Source"
            value={formData.label}
            onChange={(e) => setFormData({...formData, label: e.target.value})}
          />
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">Field Type</label>
          <Select value={formData.field_type} onValueChange={(v) => setFormData({...formData, field_type: v})}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FIELD_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">Description (optional)</label>
          <Input
            placeholder="Help text for users"
            value={formData.description}
            onChange={(e) => setFormData({...formData, description: e.target.value})}
          />
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">Section (optional)</label>
          <Input
            placeholder="e.g., Contact Info"
            value={formData.section}
            onChange={(e) => setFormData({...formData, section: e.target.value})}
          />
        </div>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={formData.required}
            onChange={(e) => setFormData({...formData, required: e.target.checked})}
            className="rounded"
          />
          <span className="text-sm font-medium text-slate-700">Required field</span>
        </label>

        {['select', 'multiselect'].includes(formData.field_type) && (
          <div className="bg-slate-50 rounded-lg p-4 space-y-3">
            <h4 className="font-medium text-slate-900 text-sm">Options</h4>
            <div className="flex gap-2">
              <Input
                placeholder="Add option..."
                value={newChoice}
                onChange={(e) => setNewChoice(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addChoice()}
              />
              <Button onClick={addChoice} variant="outline" size="sm">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {(formData.options?.choices || []).map((choice, idx) => (
                <Badge key={idx} className="bg-purple-100 text-purple-800 flex items-center gap-1 pr-1">
                  {choice.label}
                  <button onClick={() => removeChoice(idx)} className="hover:opacity-70">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-4">
          <Button onClick={handleSave} className="flex-1 bg-purple-600 hover:bg-purple-700">
            Save Field
          </Button>
          <Button onClick={onCancel} variant="outline">Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
}