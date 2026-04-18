import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, GripVertical, TrendingUp } from 'lucide-react';
import {
  useSortable,
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";

const FIELD_OPTIONS = [
  { label: 'Lead Source', value: 'lead_source', type: 'field_value' },
  { label: 'Lead Status', value: 'lead_status', type: 'field_value' },
  { label: 'Estimated Value', value: 'estimated_value', type: 'field_value' },
  { label: 'Job Title', value: 'job_title', type: 'demographic' },
  { label: 'Company Size', value: 'company_size', type: 'demographic' },
  { label: 'Industry', value: 'industry', type: 'demographic' },
];

const OPERATORS = {
  equals: { label: 'Equals', types: ['all'] },
  contains: { label: 'Contains', types: ['text'] },
  greater_than: { label: 'Greater Than', types: ['number'] },
  less_than: { label: 'Less Than', types: ['number'] },
  in_range: { label: 'In Range', types: ['number'] },
  exists: { label: 'Exists/Not Empty', types: ['all'] },
};

function CriteriaItem({ criterion, index, onUpdate, onRemove }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: criterion.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-slate-50 p-4 rounded-lg border border-slate-200 flex items-center gap-3"
    >
      <button
        {...attributes}
        {...listeners}
        className="text-slate-400 hover:text-slate-600 cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="w-5 h-5" />
      </button>

      <div className="flex-1 grid grid-cols-4 gap-2">
        <Select value={criterion.field_key} onValueChange={(v) => onUpdate(index, 'field_key', v)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FIELD_OPTIONS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={criterion.operator} onValueChange={(v) => onUpdate(index, 'operator', v)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(OPERATORS).map(([key, op]) => (
              <SelectItem key={key} value={key}>{op.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          placeholder="Value"
          value={criterion.value}
          onChange={(e) => onUpdate(index, 'value', e.target.value)}
        />

        <div className="flex items-center gap-1">
          <Input
            type="number"
            min="0"
            max="100"
            value={criterion.weight}
            onChange={(e) => onUpdate(index, 'weight', parseInt(e.target.value))}
            placeholder="Points"
            className="h-9"
          />
          <span className="text-xs text-slate-500 font-medium">pts</span>
        </div>
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => onRemove(index)}
        className="text-red-600 hover:bg-red-50"
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
}

export default function ScoringRuleEditor({ rule, onSave, onCancel }) {
  const [formData, setFormData] = useState(rule || {
    name: '',
    description: '',
    criteria: [],
    is_active: true,
    auto_calculate: true,
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor)
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (active.id !== over.id) {
      const oldIndex = formData.criteria.findIndex(c => c.id === active.id);
      const newIndex = formData.criteria.findIndex(c => c.id === over.id);
      const newCriteria = [...formData.criteria];
      [newCriteria[oldIndex], newCriteria[newIndex]] = [newCriteria[newIndex], newCriteria[oldIndex]];
      setFormData({ ...formData, criteria: newCriteria });
    }
  };

  const addCriterion = () => {
    const newCriteria = [...(formData.criteria || []), {
      id: Math.random().toString(),
      field_key: 'lead_source',
      operator: 'equals',
      value: '',
      weight: 10,
    }];
    setFormData({ ...formData, criteria: newCriteria });
  };

  const updateCriterion = (index, field, value) => {
    const newCriteria = [...formData.criteria];
    newCriteria[index][field] = value;
    setFormData({ ...formData, criteria: newCriteria });
  };

  const removeCriterion = (index) => {
    setFormData({
      ...formData,
      criteria: formData.criteria.filter((_, i) => i !== index)
    });
  };

  const totalWeight = formData.criteria.reduce((sum, c) => sum + (c.weight || 0), 0);

  const handleSave = () => {
    if (!formData.name) {
      alert('Rule name is required');
      return;
    }
    if (formData.criteria.length === 0) {
      alert('Add at least one criterion');
      return;
    }
    onSave({ ...formData, total_weight: totalWeight });
  };

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="bg-gradient-to-r from-blue-50 to-cyan-50">
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5" />
          {rule ? 'Edit Scoring Rule' : 'Create Scoring Rule'}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-2">Rule Name</label>
          <Input
            placeholder="e.g., High-Value Tech Leads"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700 block mb-2">Description</label>
          <Input
            placeholder="Describe what this rule scores..."
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          />
        </div>

        {/* Criteria */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium text-slate-900">Scoring Criteria</h4>
            <Badge className="bg-blue-100 text-blue-800">
              Total: {totalWeight} points
            </Badge>
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={formData.criteria.map(c => c.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2 mb-4">
                {formData.criteria.map((criterion, idx) => (
                  <CriteriaItem
                    key={criterion.id}
                    criterion={criterion}
                    index={idx}
                    onUpdate={updateCriterion}
                    onRemove={removeCriterion}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          <Button onClick={addCriterion} variant="outline" className="w-full">
            <Plus className="w-4 h-4 mr-2" />
            Add Criterion
          </Button>
        </div>

        <div className="flex gap-2">
          <label className="flex items-center gap-2 flex-1">
            <input
              type="checkbox"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className="rounded"
            />
            <span className="text-sm font-medium text-slate-700">Active rule</span>
          </label>
          <label className="flex items-center gap-2 flex-1">
            <input
              type="checkbox"
              checked={formData.auto_calculate}
              onChange={(e) => setFormData({ ...formData, auto_calculate: e.target.checked })}
              className="rounded"
            />
            <span className="text-sm font-medium text-slate-700">Auto-calculate</span>
          </label>
        </div>

        <div className="flex gap-2 pt-4 border-t">
          <Button onClick={handleSave} className="flex-1 bg-blue-600 hover:bg-blue-700">
            Save Rule
          </Button>
          <Button onClick={onCancel} variant="outline">Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
}