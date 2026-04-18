import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { Trash2, Plus } from "lucide-react";
import { entityCreate, entityFilter } from "@/lib/entity-api";

export default function FieldBuilder({ entityType }) {
  const [newField, setNewField] = useState({
    field_name: "",
    field_key: "",
    field_type: "text",
    required: false,
    placeholder: "",
  });

  const { data: fields = [], refetch } = useQuery({
    queryKey: ["fields", entityType],
    queryFn: () => entityFilter<any>("custom-fields", { entity_type: entityType }),
  });

  const handleCreateField = async () => {
    if (!newField.field_name || !newField.field_key) {
      alert("נתונים חסרים");
      return;
    }

    try {
      await entityCreate<any>("custom-fields", {
        entity_type: entityType,
        ...newField,
        order: fields.length,
      });
      setNewField({
        field_name: "",
        field_key: "",
        field_type: "text",
        required: false,
        placeholder: "",
      });
      refetch();
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const handleDeleteField = async (fieldId) => {
    // In real implementation, would delete from database
    refetch();
  };

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader>
        <CardTitle>🔧 Field Builder - {entityType}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Create New Field */}
        <div className="p-6 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border-2 border-dashed border-blue-300 space-y-4">
          <h3 className="font-bold text-slate-900">שדה חדש</h3>
          <div className="grid grid-cols-3 gap-4">
            <Input
              placeholder="שם השדה"
              value={newField.field_name}
              onChange={(e) =>
                setNewField({ ...newField, field_name: e.target.value })
              }
            />
            <Input
              placeholder="field_key (snake_case)"
              value={newField.field_key}
              onChange={(e) =>
                setNewField({ ...newField, field_key: e.target.value })
              }
            />
            <Select value={newField.field_type} onValueChange={(value) => 
              setNewField({ ...newField, field_type: value })
            }>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="text">טקסט</SelectItem>
                <SelectItem value="number">מספר</SelectItem>
                <SelectItem value="date">תאריך</SelectItem>
                <SelectItem value="select">בחירה</SelectItem>
                <SelectItem value="checkbox">סימון</SelectItem>
                <SelectItem value="email">אימייל</SelectItem>
                <SelectItem value="phone">טלפון</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={newField.required}
                onChange={(e) =>
                  setNewField({ ...newField, required: e.target.checked })
                }
              />
              חובה
            </label>
          </div>
          <Button onClick={handleCreateField} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4 mr-2" />
            הוסף שדה
          </Button>
        </div>

        {/* Existing Fields */}
        <div className="space-y-3">
          <h3 className="font-bold text-slate-900">שדות קיימים</h3>
          {fields.length === 0 ? (
            <p className="text-slate-600 text-center py-6">אין שדות עדיין</p>
          ) : (
            fields.map((field) => (
              <div
                key={field.id}
                className="p-4 bg-white rounded-lg border border-slate-200 flex items-center justify-between hover:shadow-md transition"
              >
                <div>
                  <p className="font-bold">{field.field_name}</p>
                  <p className="text-sm text-slate-600">
                    {field.field_key} • {field.field_type}
                    {field.required && " • חובה"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDeleteField(field.id)}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}