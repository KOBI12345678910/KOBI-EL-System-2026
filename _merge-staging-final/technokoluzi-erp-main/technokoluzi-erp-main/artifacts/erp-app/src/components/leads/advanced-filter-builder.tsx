import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, X, Save } from 'lucide-react';
import { entityList } from '@/lib/entity-api';
import { useQuery } from '@tanstack/react-query';

interface FieldOption {
  value: string;
  label: string;
  type: string;
  options?: { value: string; label: string }[];
}

interface Condition {
  id: number;
  field: string;
  operator: string;
  value: string;
}

interface ConditionGroup {
  id: number;
  logic: 'AND' | 'OR';
  conditions: Condition[];
}

interface FilterData {
  name: string;
  groups: ConditionGroup[];
}

interface AdvancedFilterBuilderProps {
  open: boolean;
  onClose: () => void;
  onApply: (filter: FilterData) => void;
}

interface User {
  id: string;
  full_name?: string;
}

const FIELD_OPTIONS: FieldOption[] = [
  { value: 'full_name', label: 'Full Name', type: 'text' },
  { value: 'first_name', label: 'First Name', type: 'text' },
  { value: 'last_name', label: 'Last Name', type: 'text' },
  { value: 'phone', label: 'Phone', type: 'text' },
  { value: 'email', label: 'Email', type: 'text' },
  { value: 'company_name', label: 'Company', type: 'text' },
  { value: 'job_title', label: 'Job Title', type: 'text' },
  { value: 'address_city', label: 'City', type: 'text' },
  { value: 'address_country', label: 'Country', type: 'text' },
  { value: 'source', label: 'Source', type: 'select', options: [
    { value: 'whatsapp', label: 'WhatsApp' },
    { value: 'website', label: 'Website' },
    { value: 'facebook', label: 'Facebook' },
    { value: 'instagram', label: 'Instagram' },
    { value: 'google', label: 'Google' },
    { value: 'phone', label: 'Phone' },
    { value: 'referral', label: 'Referral' },
    { value: 'event', label: 'Event' },
    { value: 'linkedin', label: 'LinkedIn' },
    { value: 'import', label: 'Import' }
  ]},
  { value: 'status', label: 'Status', type: 'select', options: [
    { value: 'new', label: 'New' },
    { value: 'call_scheduled', label: 'Call Scheduled' },
    { value: 'meeting_scheduled', label: 'Meeting Scheduled' },
    { value: 'quote_sent', label: 'Quote Sent' },
    { value: 'deal_closed', label: 'Deal Closed' },
    { value: 'not_relevant', label: 'Not Relevant' },
    { value: 'thinking', label: 'Thinking' },
    { value: 'too_expensive', label: 'Too Expensive' }
  ]},
  { value: 'stage', label: 'Stage', type: 'select', options: [
    { value: 'new', label: 'New' },
    { value: 'contacted', label: 'Contacted' },
    { value: 'qualified', label: 'Qualified' },
    { value: 'proposal', label: 'Proposal' },
    { value: 'negotiation', label: 'Negotiation' },
    { value: 'won', label: 'Won' },
    { value: 'lost', label: 'Lost' }
  ]},
  { value: 'grade', label: 'Grade', type: 'select', options: [
    { value: 'hot', label: 'Hot' },
    { value: 'warm', label: 'Warm' },
    { value: 'cold', label: 'Cold' }
  ]},
  { value: 'urgency', label: 'Urgency', type: 'select', options: [
    { value: 'urgent', label: 'Urgent' },
    { value: 'high', label: 'High' },
    { value: 'medium', label: 'Medium' },
    { value: 'low', label: 'Low' }
  ]},
  { value: 'owner_id', label: 'Owner', type: 'user' },
  { value: 'interested_product', label: 'Interested Product', type: 'text' },
  { value: 'deal_value', label: 'Deal Value', type: 'number' },
  { value: 'lead_score', label: 'Lead Score', type: 'number' },
  { value: 'created_date', label: 'Created Date', type: 'date' }
];

const OPERATOR_OPTIONS: Record<string, { value: string; label: string }[]> = {
  text: [
    { value: 'equals', label: 'Equals' },
    { value: 'not_equals', label: 'Not Equals' },
    { value: 'contains', label: 'Contains' },
    { value: 'not_contains', label: 'Not Contains' },
    { value: 'is_empty', label: 'Is Empty' },
    { value: 'is_not_empty', label: 'Is Not Empty' }
  ],
  number: [
    { value: 'equals', label: 'Equals' },
    { value: 'greater_than', label: 'Greater Than' },
    { value: 'less_than', label: 'Less Than' },
    { value: 'between', label: 'Between' }
  ],
  select: [
    { value: 'equals', label: 'Equals' },
    { value: 'not_equals', label: 'Not Equals' },
    { value: 'is_empty', label: 'Is Empty' },
    { value: 'is_not_empty', label: 'Is Not Empty' }
  ],
  date: [
    { value: 'equals', label: 'Equals' },
    { value: 'before', label: 'Before' },
    { value: 'after', label: 'After' },
    { value: 'last_7_days', label: 'Last 7 Days' },
    { value: 'last_30_days', label: 'Last 30 Days' },
    { value: 'this_month', label: 'This Month' }
  ],
  user: [
    { value: 'equals', label: 'Equals' },
    { value: 'not_equals', label: 'Not Equals' }
  ]
};

export default function AdvancedFilterBuilder({ open, onClose, onApply }: AdvancedFilterBuilderProps) {
  const [filterName, setFilterName] = useState('');
  const [conditionGroups, setConditionGroups] = useState<ConditionGroup[]>([{
    id: 1,
    logic: 'AND',
    conditions: [{ id: 1, field: 'status', operator: 'equals', value: '' }]
  }]);

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => entityList<User>("users")
  });

  const addConditionGroup = () => {
    setConditionGroups([...conditionGroups, {
      id: Date.now(),
      logic: 'AND',
      conditions: [{ id: Date.now(), field: 'status', operator: 'equals', value: '' }]
    }]);
  };

  const removeConditionGroup = (groupId: number) => {
    setConditionGroups(conditionGroups.filter(g => g.id !== groupId));
  };

  const addCondition = (groupId: number) => {
    setConditionGroups(conditionGroups.map(group =>
      group.id === groupId
        ? { ...group, conditions: [...group.conditions, { id: Date.now(), field: 'status', operator: 'equals', value: '' }] }
        : group
    ));
  };

  const removeCondition = (groupId: number, conditionId: number) => {
    setConditionGroups(conditionGroups.map(group =>
      group.id === groupId
        ? { ...group, conditions: group.conditions.filter(c => c.id !== conditionId) }
        : group
    ));
  };

  const updateCondition = (groupId: number, conditionId: number, key: string, value: string) => {
    setConditionGroups(conditionGroups.map(group =>
      group.id === groupId
        ? {
            ...group,
            conditions: group.conditions.map(c =>
              c.id === conditionId
                ? { ...c, [key]: value, ...(key === 'field' ? { value: '', operator: 'equals' } : {}) }
                : c
            )
          }
        : group
    ));
  };

  const updateGroupLogic = (groupId: number, logic: 'AND' | 'OR') => {
    setConditionGroups(conditionGroups.map(group =>
      group.id === groupId ? { ...group, logic } : group
    ));
  };

  const getFieldType = (fieldValue: string): string => {
    const field = FIELD_OPTIONS.find(f => f.value === fieldValue);
    return field?.type || 'text';
  };

  const getFieldOptions = (fieldValue: string) => {
    const field = FIELD_OPTIONS.find(f => f.value === fieldValue);
    return field?.options || [];
  };

  const handleApply = () => {
    onApply({ name: filterName, groups: conditionGroups });
    onClose();
  };

  const renderValueInput = (group: ConditionGroup, condition: Condition) => {
    const fieldType = getFieldType(condition.field);
    const needsValue = !['is_empty', 'is_not_empty', 'last_7_days', 'last_30_days', 'this_month', 'last_month'].includes(condition.operator);
    if (!needsValue) return null;

    if (fieldType === 'select') {
      const options = getFieldOptions(condition.field);
      return (
        <select value={condition.value} onChange={(e) => updateCondition(group.id, condition.id, 'value', e.target.value)} className="border rounded-lg px-2 py-1.5 text-xs w-full">
          <option value="">Select...</option>
          {options.map(opt => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
        </select>
      );
    }

    if (fieldType === 'user') {
      return (
        <select value={condition.value} onChange={(e) => updateCondition(group.id, condition.id, 'value', e.target.value)} className="border rounded-lg px-2 py-1.5 text-xs w-full">
          <option value="">Select agent...</option>
          {users.map(u => (<option key={u.id} value={u.id}>{u.full_name}</option>))}
        </select>
      );
    }

    if (fieldType === 'number') {
      return <Input type="number" value={condition.value} onChange={(e) => updateCondition(group.id, condition.id, 'value', e.target.value)} placeholder="Value..." className="text-xs h-7" />;
    }

    if (fieldType === 'date') {
      return <Input type="date" value={condition.value} onChange={(e) => updateCondition(group.id, condition.id, 'value', e.target.value)} className="text-xs h-7" />;
    }

    return <Input value={condition.value} onChange={(e) => updateCondition(group.id, condition.id, 'value', e.target.value)} placeholder="Value..." className="text-xs h-7" />;
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Create New Filter</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-3">
          <div>
            <label className="text-xs font-medium mb-1 block">Filter Name</label>
            <Input value={filterName} onChange={(e) => setFilterName(e.target.value)} placeholder="e.g., Hot leads from website" className="text-sm h-9" />
          </div>

          {conditionGroups.map((group, groupIndex) => (
            <Card key={group.id} className="bg-blue-50 border-blue-200">
              <CardContent className="p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-blue-900">Group {groupIndex + 1}</span>
                    <div className="flex gap-1">
                      <Button variant={group.logic === 'AND' ? 'default' : 'outline'} size="sm" onClick={() => updateGroupLogic(group.id, 'AND')} className="h-6 text-xs px-2">AND</Button>
                      <Button variant={group.logic === 'OR' ? 'default' : 'outline'} size="sm" onClick={() => updateGroupLogic(group.id, 'OR')} className="h-6 text-xs px-2">OR</Button>
                    </div>
                  </div>
                  {conditionGroups.length > 1 && (
                    <Button variant="ghost" size="icon" onClick={() => removeConditionGroup(group.id)} className="h-7 w-7"><X className="w-4 h-4" /></Button>
                  )}
                </div>

                <div className="space-y-2">
                  {group.conditions.map((condition, condIndex) => (
                    <div key={condition.id} className="bg-white p-2 rounded-lg border border-blue-200">
                      {condIndex > 0 && (
                        <div className="text-xs font-medium text-blue-600 mb-1">{group.logic === 'AND' ? 'AND' : 'OR'}</div>
                      )}
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-xs text-slate-600 mb-0.5 block">Field</label>
                          <select value={condition.field} onChange={(e) => updateCondition(group.id, condition.id, 'field', e.target.value)} className="border rounded-lg px-2 py-1.5 text-xs w-full">
                            {FIELD_OPTIONS.map(field => (<option key={field.value} value={field.value}>{field.label}</option>))}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-slate-600 mb-0.5 block">Operator</label>
                          <select value={condition.operator} onChange={(e) => updateCondition(group.id, condition.id, 'operator', e.target.value)} className="border rounded-lg px-2 py-1.5 text-xs w-full">
                            {(OPERATOR_OPTIONS[getFieldType(condition.field)] || []).map(op => (<option key={op.value} value={op.value}>{op.label}</option>))}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-slate-600 mb-0.5 block">Value</label>
                          {renderValueInput(group, condition)}
                        </div>
                      </div>
                      {group.conditions.length > 1 && (
                        <Button variant="ghost" size="sm" onClick={() => removeCondition(group.id, condition.id)} className="mt-1 text-xs text-red-600 hover:text-red-700 h-6">
                          <X className="w-3 h-3 ml-1" />Remove
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={() => addCondition(group.id)} className="w-full text-xs border-blue-300 text-blue-700 hover:bg-blue-50 h-7">
                    <Plus className="w-3 h-3 ml-1" />Add Condition
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}

          <Button variant="outline" onClick={addConditionGroup} className="w-full border-blue-300 text-blue-700 hover:bg-blue-50 h-8 text-xs">
            <Plus className="w-3 h-3 ml-1" />Add Group
          </Button>

          <div className="flex justify-end gap-2 pt-3 border-t">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleApply} className="bg-blue-600 hover:bg-blue-700">
              <Save className="w-4 h-4 ml-2" />Save & Apply
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
