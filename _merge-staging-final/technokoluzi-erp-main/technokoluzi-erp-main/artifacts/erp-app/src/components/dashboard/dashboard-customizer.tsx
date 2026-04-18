import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Settings, GripVertical, Save, RotateCcw, BarChart3, TrendingUp, Factory, Target, Zap, Brain, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { authJson } from "@/lib/utils";
import { entityFilter, entityUpdate, entityCreate } from "@/lib/entity-api";

interface WidgetDef {
  id: string;
  type: string;
  title: string;
  icon: LucideIcon;
  description: string;
}

interface WidgetState {
  id: string;
  type: string;
  title: string;
  visible: boolean;
  position: { x: number; y: number; w: number; h: number };
}

interface DashboardLayout {
  id?: string | number;
  user_email?: string;
  layout_name?: string;
  is_default?: boolean;
  widgets?: WidgetState[];
}

interface DashboardCustomizerProps {
  open: boolean;
  onClose: () => void;
}

const availableWidgets: WidgetDef[] = [
  { id: "stats", type: "stats", title: "סטטיסטיקות", icon: BarChart3, description: "כרטיסי סטטיסטיקות מהירות" },
  { id: "revenue_chart", type: "revenue_chart", title: "גרף הכנסות", icon: TrendingUp, description: "מעקב הכנסות חודשי" },
  { id: "production_chart", type: "production_chart", title: "סטטוס ייצור", icon: Factory, description: "מצב ייצור לפי שלבים" },
  { id: "deals_chart", type: "deals_chart", title: "צנרת עסקאות", icon: Target, description: "עסקאות לפי שלבים" },
  { id: "tasks_list", type: "tasks_list", title: "משימות דחופות", icon: Target, description: "רשימת משימות בעדיפות גבוהה" },
  { id: "quick_actions", type: "quick_actions", title: "פעולות מהירות", icon: Zap, description: "קיצורי דרך לפעולות נפוצות" },
  { id: "ai_insights", type: "ai_insights", title: "תובנות AI", icon: Brain, description: "המלצות והתראות חכמות" },
];

function SortableWidget({ widget, onToggle }: { widget: WidgetState; onToggle: (id: string, visible: boolean) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: widget.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const Icon = availableWidgets.find((w) => w.type === widget.type)?.icon || BarChart3;

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border">
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
        <GripVertical className="w-5 h-5 text-slate-400" />
      </div>
      <Icon className="w-5 h-5 text-slate-600" />
      <div className="flex-1">
        <div className="font-medium text-sm">{widget.title}</div>
        <div className="text-xs text-slate-500">{availableWidgets.find((w) => w.type === widget.type)?.description}</div>
      </div>
      <Switch checked={widget.visible} onCheckedChange={(checked) => onToggle(widget.id, checked)} />
    </div>
  );
}

export default function DashboardCustomizer({ open, onClose }: DashboardCustomizerProps) {
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ["current-user"],
    queryFn: () => authJson("/api/auth/me") as Promise<{ email: string }>,
  });

  const { data: layouts = [] } = useQuery({
    queryKey: ["dashboard-layouts", user?.email],
    queryFn: () => entityFilter<DashboardLayout>("dashboard-layouts", { user_email: user!.email }),
    enabled: !!user,
  });

  const currentLayout = layouts.find((l) => l.is_default) || layouts[0];

  const [widgets, setWidgets] = useState<WidgetState[]>(() => {
    if (currentLayout?.widgets) return currentLayout.widgets;
    return availableWidgets.map((w, i) => ({
      id: w.id,
      type: w.type,
      title: w.title,
      visible: true,
      position: { x: 0, y: i, w: 1, h: 1 },
    }));
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const saveLayoutMutation = useMutation({
    mutationFn: async (layoutData: { widgets: WidgetState[] }) => {
      if (currentLayout?.id) {
        return entityUpdate("dashboard-layouts", currentLayout.id, layoutData);
      } else {
        return entityCreate("dashboard-layouts", {
          user_email: user?.email,
          layout_name: "ברירת מחדל",
          is_default: true,
          ...layoutData,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-layouts"] });
      toast.success("הפריסה נשמרה בהצלחה");
      onClose();
    },
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setWidgets((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleToggleWidget = (widgetId: string, visible: boolean) => {
    setWidgets((prev) => prev.map((w) => (w.id === widgetId ? { ...w, visible } : w)));
  };

  const handleSave = () => {
    saveLayoutMutation.mutate({ widgets });
  };

  const handleReset = () => {
    setWidgets(
      availableWidgets.map((w, i) => ({
        id: w.id,
        type: w.type,
        title: w.title,
        visible: true,
        position: { x: 0, y: i, w: 1, h: 1 },
      }))
    );
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            התאמה אישית של הדשבורד
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-sm text-slate-600">גרור ווידג'טים לסידור מחדש, והפעל/כבה להצגה בדשבורד</div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={widgets.map((w) => w.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {widgets.map((widget) => (
                  <SortableWidget key={widget.id} widget={widget} onToggle={handleToggleWidget} />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          <div className="flex gap-2 pt-4 border-t">
            <Button onClick={handleSave} disabled={saveLayoutMutation.isPending}>
              <Save className="w-4 h-4 ml-2" />שמור
            </Button>
            <Button variant="outline" onClick={handleReset}>
              <RotateCcw className="w-4 h-4 ml-2" />איפוס
            </Button>
            <Button variant="outline" onClick={onClose}>ביטול</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
