import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { entityFilter, entityCreate, entityUpdate, entityDelete } from "@/lib/entity-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Edit2, GripVertical } from "lucide-react";

interface SelectOptionItem {
  id: number;
  field_id: string;
  label: string;
  value: string;
  color?: string;
  order?: number;
}

interface SelectOptionManagerProps {
  fieldId: string;
}

export default function SelectOptionManager({ fieldId }: SelectOptionManagerProps) {
  const [showForm, setShowForm] = useState(false);
  const [, setEditingOption] = useState<SelectOptionItem | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState("#3b82f6");
  const queryClient = useQueryClient();

  const { data: options = [] } = useQuery({
    queryKey: ["selectOptions", fieldId],
    queryFn: () => entityFilter<SelectOptionItem>("select-options", { field_id: fieldId }),
  });

  const createOptionMutation = useMutation({
    mutationFn: (data: { label: string; color: string }) =>
      entityCreate<SelectOptionItem>("select-options", {
        field_id: fieldId,
        ...data,
        value: data.label.toLowerCase().replace(/\s+/g, "_"),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["selectOptions", fieldId] });
      setNewLabel("");
      setNewColor("#3b82f6");
      setShowForm(false);
    },
  });

  const updateOptionMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<SelectOptionItem> }) =>
      entityUpdate<SelectOptionItem>("select-options", id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["selectOptions", fieldId] });
      setEditingOption(null);
    },
  });

  const deleteOptionMutation = useMutation({
    mutationFn: (id: number) => entityDelete("select-options", id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["selectOptions", fieldId] }),
  });

  const sortedOptions = [...options].sort((a, b) => (a.order || 0) - (b.order || 0));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-600 hover:bg-blue-700"
        >
          <Plus className="w-4 h-4 ml-1" />
          ערך חדש
        </Button>
      </div>

      {showForm && (
        <div className="p-3 border border-slate-200 rounded-lg bg-slate-50 space-y-3">
          <Input
            placeholder="שם הערך"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === "Enter" && newLabel.trim()) {
                createOptionMutation.mutate({ label: newLabel, color: newColor });
              }
            }}
          />
          <div className="flex gap-2">
            <input
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              className="h-9 w-16 border border-slate-300 rounded-md cursor-pointer"
            />
            <Button
              size="sm"
              onClick={() => createOptionMutation.mutate({ label: newLabel, color: newColor })}
              disabled={!newLabel.trim()}
              className="bg-blue-600"
            >
              הוסף
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>
              ביטול
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {sortedOptions.map((option) => (
          <div
            key={option.id}
            className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors group"
          >
            <GripVertical className="w-4 h-4 text-slate-400 cursor-move" />
            <div
              className="w-4 h-4 rounded flex-shrink-0"
              style={{ backgroundColor: option.color || "#3b82f6" }}
            />
            <span className="flex-1 font-medium text-slate-900">{option.label}</span>
            <span className="text-xs text-slate-500">{option.value}</span>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditingOption(option)}
                className="h-8 w-8 p-0"
              >
                <Edit2 className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => deleteOptionMutation.mutate(option.id)}
                className="h-8 w-8 p-0 text-red-600"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {sortedOptions.length === 0 && (
        <div className="text-center py-6 text-slate-400 text-sm">אין ערכים עדיין</div>
      )}
    </div>
  );
}
