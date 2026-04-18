import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus, Edit, Trash2, Database, Type, Calendar,
  Hash, ToggleLeft, List, Check, X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface FieldItem {
  id: string;
  name: string;
  label: string;
  type: string;
  required: boolean;
  validation: string | null;
  used: boolean;
  options?: string[];
}

interface FieldType {
  value: string;
  label: string;
  icon: LucideIcon;
}

interface ModelsFieldsProps {
  onChangeDetected?: () => void;
}

export default function ModelsFields({ onChangeDetected }: ModelsFieldsProps) {
  const [selectedModel, setSelectedModel] = useState("Lead");

  const models = ["Lead", "Customer", "Deal", "Product", "Quote"];

  const fields: FieldItem[] = [
    {
      id: "1",
      name: "first_name",
      label: "שם פרטי",
      type: "string",
      required: true,
      validation: "min:2",
      used: true,
    },
    {
      id: "2",
      name: "email",
      label: "אימייל",
      type: "email",
      required: true,
      validation: "email",
      used: true,
    },
    {
      id: "3",
      name: "phone",
      label: "טלפון",
      type: "string",
      required: true,
      validation: "phone",
      used: true,
    },
    {
      id: "4",
      name: "budget_range",
      label: "טווח תקציב",
      type: "enum",
      required: false,
      validation: null,
      used: false,
      options: ["0-10k", "10k-50k", "50k+"],
    },
    {
      id: "5",
      name: "estimated_close_date",
      label: "תאריך סגירה משוער",
      type: "date",
      required: false,
      validation: null,
      used: true,
    },
  ];

  const fieldTypes: FieldType[] = [
    { value: "string", label: "טקסט", icon: Type },
    { value: "number", label: "מספר", icon: Hash },
    { value: "date", label: "תאריך", icon: Calendar },
    { value: "boolean", label: "בוליאני", icon: ToggleLeft },
    { value: "enum", label: "רשימה", icon: List },
    { value: "email", label: "אימייל", icon: Type },
  ];

  const handleAddField = () => {
    if (onChangeDetected) onChangeDetected();
  };

  const handleEditField = (_field: FieldItem) => {
    if (onChangeDetected) onChangeDetected();
  };

  const handleDeleteField = (field: FieldItem) => {
    if (field.used) {
      alert("לא ניתן למחוק שדה שנמצא בשימוש!");
      return;
    }
    if (confirm(`למחוק את השדה "${field.label}"?`)) {
      if (onChangeDetected) onChangeDetected();
    }
  };

  const getFieldIcon = (type: string): LucideIcon => {
    const fieldType = fieldTypes.find((t) => t.value === type);
    return fieldType ? fieldType.icon : Type;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="flex-1 max-w-md">
          <Select value={selectedModel} onValueChange={setSelectedModel}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {models.map((model) => (
                <SelectItem key={model} value={model}>
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4" />
                    {model}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleAddField}>
          <Plus className="w-4 h-4 ml-2" />
          הוסף שדה
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            שדות במודל {selectedModel}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="grid grid-cols-12 gap-4 px-4 py-2 bg-slate-50 rounded-lg font-medium text-sm text-slate-600">
              <div className="col-span-3">שם השדה</div>
              <div className="col-span-2">סוג</div>
              <div className="col-span-2">תווית</div>
              <div className="col-span-2">חובה</div>
              <div className="col-span-2">Validation</div>
              <div className="col-span-1 text-left">פעולות</div>
            </div>

            {fields.map((field) => {
              const Icon = getFieldIcon(field.type);
              return (
                <div
                  key={field.id}
                  className="grid grid-cols-12 gap-4 px-4 py-3 bg-white border border-slate-200 rounded-lg hover:border-indigo-300 transition-colors items-center"
                >
                  <div className="col-span-3">
                    <code className="bg-slate-100 px-2 py-1 rounded text-sm font-mono">
                      {field.name}
                    </code>
                    {field.used && (
                      <Badge variant="outline" className="mr-2 text-xs">
                        בשימוש
                      </Badge>
                    )}
                  </div>
                  <div className="col-span-2">
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4 text-slate-500" />
                      <span className="text-sm">{field.type}</span>
                    </div>
                  </div>
                  <div className="col-span-2 text-sm text-slate-700">{field.label}</div>
                  <div className="col-span-2">
                    {field.required ? (
                      <Badge className="bg-red-100 text-red-700 border-red-200">
                        <Check className="w-3 h-3 ml-1" />
                        חובה
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-slate-500">
                        <X className="w-3 h-3 ml-1" />
                        אופציונלי
                      </Badge>
                    )}
                  </div>
                  <div className="col-span-2">
                    {field.validation ? (
                      <code className="text-xs bg-slate-50 px-2 py-1 rounded">
                        {field.validation}
                      </code>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </div>
                  <div className="col-span-1 flex items-center justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => handleEditField(field)}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700"
                      onClick={() => handleDeleteField(field)}
                      disabled={field.used}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
