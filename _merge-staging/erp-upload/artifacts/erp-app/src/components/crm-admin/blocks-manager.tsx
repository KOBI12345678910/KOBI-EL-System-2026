import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { entityFilter, entityCreate, entityUpdate, entityDelete } from "@/lib/entity-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Edit2, GripVertical, Eye, EyeOff } from "lucide-react";

interface Block {
  id: number;
  block_name: string;
  block_type: string;
  entity_type: string;
  description?: string;
  icon?: string;
  color?: string;
  size?: string;
  is_active: boolean;
  order?: number;
}

const BLOCK_TYPES = ["text", "number", "chart", "table", "card", "gauge", "list", "metric", "timeline", "kanban"];
const BLOCK_SIZES = ["small", "medium", "large", "full"];

interface BlocksManagerProps {
  entityType: string;
}

export default function BlocksManager({ entityType }: BlocksManagerProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingBlock, setEditingBlock] = useState<Block | null>(null);
  const queryClient = useQueryClient();

  const { data: blocks = [] } = useQuery({
    queryKey: ["blocks", entityType],
    queryFn: () => entityFilter<Block>("blocks", { entity_type: entityType }),
  });

  const createBlockMutation = useMutation({
    mutationFn: (data: Partial<Block>) => entityCreate<Block>("blocks", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blocks", entityType] });
      setShowForm(false);
      setEditingBlock(null);
    },
  });

  const updateBlockMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Block> }) =>
      entityUpdate<Block>("blocks", id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blocks", entityType] });
      setEditingBlock(null);
    },
  });

  const deleteBlockMutation = useMutation({
    mutationFn: (id: number) => entityDelete("blocks", id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["blocks", entityType] }),
  });

  const toggleVisibility = (block: Block) => {
    updateBlockMutation.mutate({
      id: block.id,
      data: { is_active: !block.is_active },
    });
  };

  const sortedBlocks = [...blocks].sort((a, b) => (a.order || 0) - (b.order || 0));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900">בלוקים</h3>
        <Sheet open={showForm} onOpenChange={setShowForm}>
          <SheetTrigger asChild>
            <Button size="sm" className="bg-blue-600">
              <Plus className="w-4 h-4 ml-2" />
              בלוק חדש
            </Button>
          </SheetTrigger>
          <SheetContent dir="rtl">
            <SheetHeader>
              <SheetTitle>{editingBlock ? "ערוך בלוק" : "בלוק חדש"}</SheetTitle>
            </SheetHeader>
            <BlockForm
              entityType={entityType}
              block={editingBlock}
              onSubmit={(data) => {
                if (editingBlock) {
                  updateBlockMutation.mutate({ id: editingBlock.id, data });
                } else {
                  createBlockMutation.mutate(data);
                }
              }}
            />
          </SheetContent>
        </Sheet>
      </div>

      <div className="space-y-2">
        {sortedBlocks.map((block) => (
          <div
            key={block.id}
            className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors group"
          >
            <GripVertical className="w-5 h-5 text-slate-400 cursor-move" />
            <div
              className="w-3 h-3 rounded"
              style={{ backgroundColor: block.color || "#3b82f6" }}
            />
            <div className="flex-1">
              <h4 className="font-medium text-slate-900">{block.block_name}</h4>
              <div className="flex gap-2 mt-1">
                <Badge className="bg-blue-100 text-blue-800 text-xs">{block.block_type}</Badge>
                <Badge className="bg-purple-100 text-purple-800 text-xs">{block.size}</Badge>
                {!block.is_active && (
                  <Badge className="bg-slate-100 text-slate-800 text-xs">מוסתר</Badge>
                )}
              </div>
            </div>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => toggleVisibility(block)}
                className="h-8 w-8 p-0"
              >
                {block.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditingBlock(block)}
                className="h-8 w-8 p-0"
              >
                <Edit2 className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => deleteBlockMutation.mutate(block.id)}
                className="h-8 w-8 p-0 text-red-600"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {sortedBlocks.length === 0 && (
        <div className="text-center py-8 text-slate-400">
          <p>אין בלוקים עדיין</p>
        </div>
      )}
    </div>
  );
}

interface BlockFormProps {
  entityType: string;
  block: Block | null;
  onSubmit: (data: Partial<Block>) => void;
}

function BlockForm({ entityType, block, onSubmit }: BlockFormProps) {
  const [formData, setFormData] = useState({
    block_name: block?.block_name || "",
    block_type: block?.block_type || "card",
    entity_type: entityType,
    description: block?.description || "",
    icon: block?.icon || "",
    color: block?.color || "#3b82f6",
    size: block?.size || "medium",
    is_active: block?.is_active !== false,
  });

  return (
    <div className="space-y-4 mt-6">
      <Input
        placeholder="שם הבלוק"
        value={formData.block_name}
        onChange={(e) => setFormData({ ...formData, block_name: e.target.value })}
      />
      <select
        value={formData.block_type}
        onChange={(e) => setFormData({ ...formData, block_type: e.target.value })}
        className="w-full p-2 border border-slate-300 rounded-md text-sm"
      >
        {BLOCK_TYPES.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </select>
      <select
        value={formData.size}
        onChange={(e) => setFormData({ ...formData, size: e.target.value })}
        className="w-full p-2 border border-slate-300 rounded-md text-sm"
      >
        {BLOCK_SIZES.map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </select>
      <Input
        placeholder="תיאור (אופציונלי)"
        value={formData.description}
        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
      />
      <Input
        placeholder="אייקון (emoji)"
        value={formData.icon}
        onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
        maxLength={2}
      />
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={formData.color}
          onChange={(e) => setFormData({ ...formData, color: e.target.value })}
          className="h-10 w-20 border border-slate-300 rounded-md cursor-pointer"
        />
        <span className="text-sm text-slate-600">בחר צבע</span>
      </div>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={formData.is_active}
          onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
        />
        <span className="text-sm">פעיל</span>
      </label>
      <Button onClick={() => onSubmit(formData)} className="w-full bg-blue-600 hover:bg-blue-700">
        {block ? "עדכן בלוק" : "צור בלוק"}
      </Button>
    </div>
  );
}
