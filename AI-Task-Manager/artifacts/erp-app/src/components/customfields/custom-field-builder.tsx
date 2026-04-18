import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Copy, Settings } from 'lucide-react';

export default function CustomFieldBuilder() {
  const [fields, setFields] = useState([
    { id: 1, entity: 'Lead', label: 'Budget', type: 'currency', required: true, order: 1 },
    { id: 2, entity: 'Account', label: 'Employee Count', type: 'number', required: false, order: 2 },
  ]);
  
  const [newField, setNewField] = useState({
    entity: 'Lead',
    label: '',
    key: '',
    type: 'text',
    required: false,
    description: '',
    section: '',
  });

  const [editingId, setEditingId] = useState(null);

  const entityTypes = ['Lead', 'Account', 'Contact', 'Deal', 'Quote', 'Invoice', 'Customer', 'Opportunity'];
  const fieldTypes = ['text', 'textarea', 'number', 'currency', 'date', 'datetime', 'select', 'multiselect', 'checkbox', 'phone', 'email', 'url', 'rating'];

  const handleAddField = () => {
    if (!newField.label || !newField.key) return;
    
    setFields([...fields, {
      id: Date.now(),
      ...newField,
      order: Math.max(...fields.map(f => f.order || 0)) + 1
    }]);
    
    setNewField({
      entity: 'Lead',
      label: '',
      key: '',
      type: 'text',
      required: false,
      description: '',
      section: '',
    });
  };

  const handleDeleteField = (id) => {
    setFields(fields.filter(f => f.id !== id));
  };

  const handleDuplicateField = (field) => {
    setFields([...fields, {
      ...field,
      id: Date.now(),
      label: field.label + ' (Copy)',
      key: field.key + '_copy'
    }]);
  };

  return (
    <div className="space-y-6 p-6 md:p-8 bg-gradient-to-br from-slate-50 to-slate-100 min-h-screen" dir="rtl">
      <div>
        <h1 className="text-4xl font-bold text-slate-900 mb-2">🛠️ Custom Field Builder</h1>
        <p className="text-slate-600">Create and manage custom fields for your CRM entities</p>
      </div>

      {/* New Field Form */}
      <Card className="border-0 shadow-lg">
        <CardHeader className="bg-gradient-to-r from-purple-50 to-blue-50">
          <CardTitle>➕ Add New Custom Field</CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-semibold text-slate-700 mb-1 block">Entity Type</label>
              <Select value={newField.entity} onValueChange={(val) => setNewField({...newField, entity: val})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {entityTypes.map(et => (
                    <SelectItem key={et} value={et}>{et}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-700 mb-1 block">Field Type</label>
              <Select value={newField.type} onValueChange={(val) => setNewField({...newField, type: val})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {fieldTypes.map(ft => (
                    <SelectItem key={ft} value={ft}>{ft}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-semibold text-slate-700 mb-1 block">Label (Display Name)</label>
              <Input 
                placeholder="e.g., תקציב משוער"
                value={newField.label}
                onChange={(e) => {
                  const label = e.target.value;
                  const key = label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
                  setNewField({...newField, label, key});
                }}
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-700 mb-1 block">Key (Internal ID)</label>
              <Input 
                placeholder="e.g., estimated_budget"
                value={newField.key}
                onChange={(e) => setNewField({...newField, key: e.target.value})}
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-700 mb-1 block">Description (Help Text)</label>
            <Textarea 
              placeholder="Explain what this field is for..."
              value={newField.description}
              onChange={(e) => setNewField({...newField, description: e.target.value})}
              className="h-20"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-semibold text-slate-700 mb-1 block">Section/Group</label>
              <Input 
                placeholder="e.g., Business Details"
                value={newField.section}
                onChange={(e) => setNewField({...newField, section: e.target.value})}
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="checkbox"
                  checked={newField.required}
                  onChange={(e) => setNewField({...newField, required: e.target.checked})}
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm font-semibold text-slate-700">Required Field</span>
              </label>
            </div>
          </div>

          <Button 
            onClick={handleAddField}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white"
          >
            <Plus className="w-4 h-4 ml-2" />
            Create Custom Field
          </Button>
        </CardContent>
      </Card>

      {/* Fields List */}
      <Card className="border-0 shadow-lg">
        <CardHeader className="bg-gradient-to-r from-blue-50 to-purple-50">
          <CardTitle>📋 Existing Custom Fields ({fields.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-100">
                <tr>
                  <th className="p-4 text-left text-sm font-semibold text-slate-700">Label</th>
                  <th className="p-4 text-left text-sm font-semibold text-slate-700">Entity</th>
                  <th className="p-4 text-left text-sm font-semibold text-slate-700">Type</th>
                  <th className="p-4 text-left text-sm font-semibold text-slate-700">Key</th>
                  <th className="p-4 text-left text-sm font-semibold text-slate-700">Status</th>
                  <th className="p-4 text-left text-sm font-semibold text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {fields.map((field, idx) => (
                  <tr key={field.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="p-4">
                      <div>
                        <p className="font-semibold text-slate-900">{field.label}</p>
                        <p className="text-xs text-slate-500">{field.description}</p>
                      </div>
                    </td>
                    <td className="p-4">
                      <Badge variant="outline">{field.entity}</Badge>
                    </td>
                    <td className="p-4">
                      <Badge className="bg-purple-100 text-purple-700">{field.type}</Badge>
                    </td>
                    <td className="p-4">
                      <code className="text-xs bg-slate-100 px-2 py-1 rounded">{field.key}</code>
                    </td>
                    <td className="p-4">
                      <div className="flex gap-1">
                        {field.required && <Badge className="bg-red-100 text-red-700 text-xs">Required</Badge>}
                        <Badge className="bg-emerald-100 text-emerald-700 text-xs">Active</Badge>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleDuplicateField(field)}
                          className="p-1.5 hover:bg-slate-200 rounded"
                          title="Duplicate field"
                        >
                          <Copy className="w-4 h-4 text-slate-600" />
                        </button>
                        <button
                          onClick={() => setEditingId(field.id)}
                          className="p-1.5 hover:bg-slate-200 rounded"
                          title="Edit field"
                        >
                          <Settings className="w-4 h-4 text-slate-600" />
                        </button>
                        <button
                          onClick={() => handleDeleteField(field.id)}
                          className="p-1.5 hover:bg-red-200 rounded"
                          title="Delete field"
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm bg-gradient-to-br from-blue-50 to-cyan-50">
          <CardHeader>
            <CardTitle className="text-sm">💡 Field Types</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-600">
              Choose from 12+ field types including text, number, date, currency, select dropdowns, and more.
            </p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-gradient-to-br from-purple-50 to-pink-50">
          <CardHeader>
            <CardTitle className="text-sm">🔐 Permissions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-600">
              Control who can edit each field. Set visibility per role and view (list, detail, form).
            </p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-gradient-to-br from-emerald-50 to-teal-50">
          <CardHeader>
            <CardTitle className="text-sm">⚡ Validation</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-600">
              Add validation rules: min/max values, regex patterns, required fields, default values.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}