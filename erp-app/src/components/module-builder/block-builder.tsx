import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from 'sonner';
import { entityCreate, entityFilter, entityUpdate } from "@/lib/entity-api";

export default function BlockBuilder({ open, onClose, entityType, layoutId, existingBlock }) {
  const [blockName, setBlockName] = useState('');
  const [selectedFields, setSelectedFields] = useState([]);
  const [columns, setColumns] = useState(2);
  const queryClient = useQueryClient();

  const { data: customFields = [] } = useQuery({
    queryKey: ['customFields', entityType],
    queryFn: () => entityFilter<any>("custom-fields", { entity_type: entityType })
  });

  const { data: layout } = useQuery({
    queryKey: ['formLayout', layoutId],
    queryFn: () => entityFilter<any>("form-layouts", { id: layoutId }).then(res => res[0]),
    enabled: !!layoutId
  });

  useEffect(() => {
    if (existingBlock) {
      setBlockName(existingBlock.block_name);
      setSelectedFields(existingBlock.fields || []);
      setColumns(existingBlock.style?.columns || 2);
    } else {
      setBlockName('');
      setSelectedFields([]);
      setColumns(2);
    }
  }, [existingBlock, open]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const newBlock = {
        block_id: existingBlock?.block_id || `block_${Date.now()}`,
        block_name: blockName,
        order: existingBlock?.order ?? (layout?.blocks?.length || 0),
        fields: selectedFields,
        style: { columns }
      };

      if (layoutId && layout) {
        const updatedBlocks = existingBlock
          ? layout.blocks.map(b => b.block_id === existingBlock.block_id ? newBlock : b)
          : [...(layout.blocks || []), newBlock];
        
        await entityUpdate<any>("form-layouts", layoutId, { blocks: updatedBlocks });
      } else {
        await entityCreate<any>("form-layouts", {
          entity_type: entityType,
          layout_name: `${entityType}_default`,
          blocks: [newBlock],
          is_default: true
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['formLayouts']);
      queryClient.invalidateQueries(['formLayout']);
      toast.success(existingBlock ? 'הבלוק עודכן בהצלחה' : 'הבלוק נוסף בהצלחה');
      onClose();
    }
  });

  const toggleField = (fieldKey) => {
    setSelectedFields(prev =>
      prev.includes(fieldKey)
        ? prev.filter(k => k !== fieldKey)
        : [...prev, fieldKey]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existingBlock ? 'ערוך בלוק' : 'בלוק חדש'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div>
            <Label>שם הבלוק</Label>
            <Input
              value={blockName}
              onChange={(e) => setBlockName(e.target.value)}
              placeholder="לדוגמה: פרטי יצירת קשר"
              className="mt-2"
            />
          </div>

          <div>
            <Label>מספר עמודות</Label>
            <select
              value={columns}
              onChange={(e) => setColumns(Number(e.target.value))}
              className="w-full border rounded-lg px-3 py-2 mt-2"
            >
              <option value={1}>1 עמודה</option>
              <option value={2}>2 עמודות</option>
              <option value={3}>3 עמודות</option>
              <option value={4}>4 עמודות</option>
            </select>
          </div>

          <div>
            <Label className="mb-3 block">בחר שדות לבלוק</Label>
            <div className="space-y-2 max-h-[300px] overflow-y-auto border rounded-lg p-3">
              {customFields.map(field => (
                <div key={field.id} className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded">
                  <Checkbox
                    checked={selectedFields.includes(field.field_key)}
                    onCheckedChange={() => toggleField(field.field_key)}
                  />
                  <div className="flex-1">
                    <div className="font-medium text-sm">{field.field_name}</div>
                    <div className="text-xs text-slate-500">{field.field_type}</div>
                  </div>
                </div>
              ))}
              {customFields.length === 0 && (
                <div className="text-center text-slate-500 py-4">
                  אין שדות זמינים. צור שדות חדשים תחילה.
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={onClose}>ביטול</Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!blockName || selectedFields.length === 0}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {existingBlock ? 'עדכן' : 'צור בלוק'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}