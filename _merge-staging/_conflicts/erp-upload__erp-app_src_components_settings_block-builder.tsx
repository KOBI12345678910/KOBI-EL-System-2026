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
import { Plus, GripVertical, Trash2 } from "lucide-react";
import { entityCreate, entityFilter } from "@/lib/entity-api";

export default function BlockBuilder({ entityType }) {
  const [newBlock, setNewBlock] = useState({
    block_name: "",
    fields: [],
  });

  const { data: layouts = [], refetch: refetchLayouts } = useQuery({
    queryKey: ["layouts", entityType],
    queryFn: () => entityFilter<any>("form-layouts", { entity_type: entityType }),
  });

  const { data: customFields = [] } = useQuery({
    queryKey: ["fields", entityType],
    queryFn: () => entityFilter<any>("custom-fields", { entity_type: entityType }),
  });

  const handleCreateLayout = async () => {
    if (!newBlock.block_name) {
      alert("שם בלוק נדרש");
      return;
    }

    try {
      await entityCreate<any>("form-layouts", {
        entity_type: entityType,
        layout_name: newBlock.block_name,
        blocks: [
          {
            block_id: `block_${Date.now()}`,
            block_name: newBlock.block_name,
            order: 0,
            fields: newBlock.fields,
            visibility: { visible_to_roles: ["admin", "manager", "user"] },
            style: { columns: 2 },
          },
        ],
      });

      setNewBlock({ block_name: "", fields: [] });
      refetchLayouts();
    } catch (error) {
      console.error("Error:", error);
    }
  };

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader>
        <CardTitle>📦 Block Builder - {entityType}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Create New Block */}
        <div className="p-6 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg border-2 border-dashed border-purple-300 space-y-4">
          <h3 className="font-bold text-slate-900">בלוק חדש</h3>

          <Input
            placeholder="שם הבלוק (מפתח אינפורמציה, התקשרויות וכו')"
            value={newBlock.block_name}
            onChange={(e) =>
              setNewBlock({ ...newBlock, block_name: e.target.value })
            }
          />

          <div>
            <label className="block text-sm font-medium mb-2">
              בחר שדות לבלוק:
            </label>
            <div className="space-y-2 max-h-48 overflow-y-auto bg-white p-3 rounded-lg border">
              {customFields.map((field) => (
                <label key={field.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={newBlock.fields.includes(field.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setNewBlock({
                          ...newBlock,
                          fields: [...newBlock.fields, field.id],
                        });
                      } else {
                        setNewBlock({
                          ...newBlock,
                          fields: newBlock.fields.filter((id) => id !== field.id),
                        });
                      }
                    }}
                  />
                  <span>{field.field_name}</span>
                </label>
              ))}
            </div>
          </div>

          <Button
            onClick={handleCreateLayout}
            className="bg-purple-600 hover:bg-purple-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            יצור בלוק
          </Button>
        </div>

        {/* Existing Blocks */}
        <div className="space-y-3">
          <h3 className="font-bold text-slate-900">בלוקים קיימים</h3>
          {layouts.length === 0 ? (
            <p className="text-slate-600 text-center py-6">אין בלוקים עדיין</p>
          ) : (
            layouts.map((layout) => (
              <div
                key={layout.id}
                className="p-4 bg-white rounded-lg border border-slate-200 space-y-3 hover:shadow-md transition"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    <GripVertical className="w-4 h-4 text-slate-400" />
                    <div>
                      <p className="font-bold">{layout.layout_name}</p>
                      <p className="text-sm text-slate-600">
                        {layout.blocks?.[0]?.fields?.length || 0} שדות
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}