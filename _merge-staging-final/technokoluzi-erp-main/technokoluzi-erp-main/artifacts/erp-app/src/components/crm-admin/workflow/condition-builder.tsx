import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, X } from "lucide-react";

interface Condition {
  field: string;
  operator: string;
  value: string;
}

interface ConditionBuilderProps {
  conditions: Condition[];
  onChange: (conditions: Condition[]) => void;
}

export default function ConditionBuilder({ conditions, onChange }: ConditionBuilderProps) {
  const [localConditions, setLocalConditions] = useState<Condition[]>(conditions || []);

  const fields = [
    { value: "sales_status", label: "סטטוס מכירתי" },
    { value: "priority", label: "עדיפות" },
    { value: "source", label: "מקור" },
    { value: "budget_range", label: "טווח תקציב" },
    { value: "customer_type", label: "סוג לקוח" },
  ];

  const operators = [
    { value: "equals", label: "שווה ל" },
    { value: "not_equals", label: "לא שווה ל" },
    { value: "contains", label: "מכיל" },
    { value: "greater_than", label: "גדול מ" },
    { value: "less_than", label: "קטן מ" },
    { value: "is_empty", label: "ריק" },
    { value: "is_not_empty", label: "לא ריק" },
  ];

  const handleAddCondition = () => {
    const newConditions = [...localConditions, { field: "", operator: "equals", value: "" }];
    setLocalConditions(newConditions);
    onChange(newConditions);
  };

  const handleRemoveCondition = (index: number) => {
    const newConditions = localConditions.filter((_, i) => i !== index);
    setLocalConditions(newConditions);
    onChange(newConditions);
  };

  const handleUpdateCondition = (index: number, key: keyof Condition, value: string) => {
    const newConditions = [...localConditions];
    newConditions[index] = { ...newConditions[index], [key]: value };
    setLocalConditions(newConditions);
    onChange(newConditions);
  };

  return (
    <div className="space-y-3">
      {localConditions.length === 0 ? (
        <div className="text-center py-8 bg-slate-50 rounded-lg border-2 border-dashed border-slate-200">
          <p className="text-slate-500 text-sm mb-3">
            לא הוגדרו תנאים - ה-workflow ירוץ בכל מקרה של trigger
          </p>
          <Button onClick={handleAddCondition} variant="outline" size="sm">
            <Plus className="w-4 h-4 ml-2" />
            הוסף תנאי
          </Button>
        </div>
      ) : (
        <>
          {localConditions.map((condition, index) => (
            <div key={index} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
              <Select
                value={condition.field}
                onValueChange={(value) => handleUpdateCondition(index, "field", value)}
              >
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="שדה" />
                </SelectTrigger>
                <SelectContent>
                  {fields.map((field) => (
                    <SelectItem key={field.value} value={field.value}>
                      {field.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={condition.operator}
                onValueChange={(value) => handleUpdateCondition(index, "operator", value)}
              >
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="אופרטור" />
                </SelectTrigger>
                <SelectContent>
                  {operators.map((op) => (
                    <SelectItem key={op.value} value={op.value}>
                      {op.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {!["is_empty", "is_not_empty"].includes(condition.operator) && (
                <Input
                  placeholder="ערך"
                  value={condition.value}
                  onChange={(e) => handleUpdateCondition(index, "value", e.target.value)}
                  className="flex-1"
                />
              )}

              <Button variant="ghost" size="sm" onClick={() => handleRemoveCondition(index)}>
                <X className="w-4 h-4 text-red-600" />
              </Button>
            </div>
          ))}
          <Button onClick={handleAddCondition} variant="outline" size="sm" className="w-full">
            <Plus className="w-4 h-4 ml-2" />
            הוסף תנאי נוסף
          </Button>
        </>
      )}
    </div>
  );
}
