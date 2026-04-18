import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Save, Loader, ArrowRight } from 'lucide-react';
import { entityCreate, entityUpdate } from "@/lib/entity-api";

const TRIGGER_TYPES = ['task_completed', 'lead_status_changed', 'deal_stage_changed', 'contact_added'];
const ACTION_TYPES = ['send_email', 'create_task', 'update_field', 'delay', 'conditional'];

export default function WorkflowBuilder({ workflow, onSave, onClose }) {
  const [formData, setFormData] = useState(workflow || {
    name: '',
    description: '',
    trigger_type: '',
    trigger_condition: {},
    steps: [],
    is_active: true
  });
  const [saving, setSaving] = useState(false);
  const [newStep, setNewStep] = useState({ action_type: '', config: {} });

  const addStep = () => {
    if (!newStep.action_type) return;
    setFormData({
      ...formData,
      steps: [...(formData.steps || []), {
        id: `step_${Date.now()}`,
        order: (formData.steps || []).length,
        action_type: newStep.action_type,
        config: newStep.config
      }]
    });
    setNewStep({ action_type: '', config: {} });
  };

  const removeStep = (id) => {
    setFormData({
      ...formData,
      steps: (formData.steps || []).filter(s => s.id !== id)
    });
  };

  const updateStepConfig = (id, key, value) => {
    setFormData({
      ...formData,
      steps: (formData.steps || []).map(s =>
        s.id === id ? { ...s, config: { ...s.config, [key]: value } } : s
      )
    });
  };

  const handleSave = async () => {
    if (!formData.name || !formData.trigger_type || !formData.steps?.length) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      setSaving(true);
      if (workflow?.id) {
        await entityUpdate<any>("workflows", workflow.id, formData);
      } else {
        await entityCreate<any>("workflows", formData);
      }
      onSave?.();
    } catch (error) {
      console.error('Error saving workflow:', error);
      alert('Failed to save workflow');
    } finally {
      setSaving(false);
    }
  };

  const stepConfig = {
    send_email: [
      { key: 'template_name', label: 'Email Template', type: 'text' },
      { key: 'subject_override', label: 'Subject (optional)', type: 'text' },
      { key: 'delay_minutes', label: 'Delay (minutes)', type: 'number' }
    ],
    create_task: [
      { key: 'title', label: 'Task Title', type: 'text' },
      { key: 'priority', label: 'Priority', type: 'select', options: ['low', 'medium', 'high', 'critical'] },
      { key: 'assign_to_creator', label: 'Assign to: Creator', type: 'checkbox' }
    ],
    delay: [
      { key: 'minutes', label: 'Wait (minutes)', type: 'number' }
    ],
    conditional: [
      { key: 'field', label: 'Check Field', type: 'text' },
      { key: 'operator', label: 'Operator', type: 'select', options: ['equals', 'not_equals', 'greater', 'less'] },
      { key: 'value', label: 'Value', type: 'text' }
    ]
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <CardHeader className="sticky top-0 bg-gradient-to-r from-blue-50 to-purple-50 border-b">
          <CardTitle>{workflow ? 'Edit Workflow' : 'Create Workflow'}</CardTitle>
        </CardHeader>

        <CardContent className="p-6 space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <Input
              placeholder="Workflow name"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
            />
            <Textarea
              placeholder="Description (optional)"
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              rows={2}
            />
          </div>

          {/* Trigger */}
          <div className="bg-blue-50 rounded-lg p-4 space-y-3">
            <h3 className="font-semibold text-slate-900">Trigger</h3>
            <Select value={formData.trigger_type} onValueChange={(v) => setFormData({...formData, trigger_type: v})}>
              <SelectTrigger>
                <SelectValue placeholder="Select trigger" />
              </SelectTrigger>
              <SelectContent>
                {TRIGGER_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Steps */}
          <div className="space-y-4">
            <h3 className="font-semibold text-slate-900">Steps</h3>
            
            {formData.steps?.map((step, idx) => (
              <div key={step.id} className="border-l-4 border-purple-500 pl-4 py-2">
                <div className="flex items-center justify-between mb-2">
                  <Badge className="bg-purple-600">{idx + 1}. {step.action_type}</Badge>
                  <Button variant="ghost" size="sm" onClick={() => removeStep(step.id)} className="text-red-600">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                
                {stepConfig[step.action_type]?.map(field => (
                  <div key={field.key} className="mb-2">
                    <label className="text-xs font-medium text-slate-700 block mb-1">{field.label}</label>
                    {field.type === 'select' ? (
                      <Select value={step.config[field.key] || ''} onValueChange={(v) => updateStepConfig(step.id, field.key, v)}>
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {field.options?.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        type={field.type}
                        size="sm"
                        value={step.config[field.key] || ''}
                        onChange={(e) => updateStepConfig(step.id, field.key, e.target.value)}
                        className="h-8 text-sm"
                      />
                    )}
                  </div>
                ))}
              </div>
            ))}

            {/* Add Step */}
            <div className="border-2 border-dashed border-slate-300 rounded-lg p-4 space-y-3">
              <Select value={newStep.action_type} onValueChange={(v) => setNewStep({...newStep, action_type: v})}>
                <SelectTrigger>
                  <SelectValue placeholder="Add new step..." />
                </SelectTrigger>
                <SelectContent>
                  {ACTION_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>

              {newStep.action_type && stepConfig[newStep.action_type]?.map(field => (
                <div key={field.key}>
                  <label className="text-xs font-medium text-slate-700 block mb-1">{field.label}</label>
                  {field.type === 'select' ? (
                    <Select value={newStep.config[field.key] || ''} onValueChange={(v) => setNewStep({...newStep, config: {...newStep.config, [field.key]: v}})}>
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {field.options?.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      type={field.type}
                      size="sm"
                      value={newStep.config[field.key] || ''}
                      onChange={(e) => setNewStep({...newStep, config: {...newStep.config, [field.key]: e.target.value}})}
                      className="h-8 text-sm"
                    />
                  )}
                </div>
              ))}

              <Button onClick={addStep} variant="outline" className="w-full">
                <Plus className="w-4 h-4 mr-2" />
                Add Step
              </Button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-700">
              {saving ? <Loader className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Save Workflow
            </Button>
            <Button onClick={onClose} variant="outline">Cancel</Button>
          </div>
        </CardContent>
      </div>
    </div>
  );
}