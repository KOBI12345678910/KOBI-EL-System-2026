import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { X, GripVertical } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface Column {
  id: string;
  label: string;
  enabled: boolean;
}

interface SortableColumnItemProps {
  col: Column;
  onToggle: (id: string) => void;
}

function SortableColumnItem({ col, onToggle }: SortableColumnItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: col.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 bg-white p-3 rounded-lg shadow-sm hover:shadow-md transition-shadow">
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
        <GripVertical className="w-4 h-4 text-slate-400" />
      </div>
      <Checkbox checked={col.enabled} onCheckedChange={() => onToggle(col.id)} id={col.id} />
      <label htmlFor={col.id} className="text-sm cursor-pointer flex-1">{col.label}</label>
    </div>
  );
}

interface ColumnManagerProps {
  open: boolean;
  onClose: () => void;
  columns: Column[];
  setColumns: React.Dispatch<React.SetStateAction<Column[]>>;
}

export default function ColumnManager({ open, onClose, columns, setColumns }: ColumnManagerProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const toggleColumn = (columnId: string) => {
    setColumns(columns.map(col => col.id === columnId ? { ...col, enabled: !col.enabled } : col));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setColumns((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  if (!open) return null;

  return (
    <Card className="bg-blue-50 border-blue-300">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Column Manager</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-sm text-slate-600 mt-2">Drag columns to reorder, check to display</p>
      </CardHeader>
      <CardContent>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={columns.map(c => c.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {columns.map(col => (
                <SortableColumnItem key={col.id} col={col} onToggle={toggleColumn} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </CardContent>
    </Card>
  );
}
