import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Edit2, Save, X, GripVertical } from "lucide-react";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { entityList, entityCreate, entityUpdate } from "@/lib/entity-api";
import KPIBlock from "./blocks/kpi-block";
import ChartBlock from "./blocks/chart-block";
import TableBlock from "./blocks/table-block";
import GaugeBlock from "./blocks/gauge-block";
import ListBlock from "./blocks/list-block";
import MetricBlock from "./blocks/metric-block";

interface BlockTemplate {
  id: string;
  name: string;
  type: string;
}

interface BlockCategory {
  label: string;
  blocks: BlockTemplate[];
}

interface DashboardBlock {
  id: string;
  templateId?: string;
  name: string;
  type: string;
  size: string;
  config: Record<string, unknown>;
  position?: number;
}

interface DashboardData {
  id?: string | number;
  name?: string;
  layout_name?: string;
  blocks?: DashboardBlock[];
  widgets?: { id: string; type: string; title: string; position: Record<string, unknown>; config: Record<string, unknown>; visible: boolean }[];
}

interface AdvancedDashboardBuilderProps {
  dashboard?: DashboardData;
  onSave: (data: Record<string, unknown>) => void | Promise<void>;
  onClose: () => void;
}

const BLOCK_CATEGORIES: Record<string, BlockCategory> = {
  "מכירות": {
    label: "מכירות",
    blocks: [
      { id: "sales_kpi", name: "KPI מכירות", type: "kpi" },
      { id: "sales_chart", name: "תרשים מכירות", type: "chart" },
      { id: "sales_table", name: "טבלת הזמנות", type: "table" },
      { id: "pipeline_gauge", name: "מטר צנרת", type: "gauge" },
    ],
  },
  "ייצור": {
    label: "ייצור",
    blocks: [
      { id: "production_kpi", name: "KPI ייצור", type: "kpi" },
      { id: "production_chart", name: "תרשים ייצור", type: "chart" },
      { id: "production_stages", name: "שלבי ייצור", type: "list" },
      { id: "production_efficiency", name: "יעילות ייצור", type: "gauge" },
    ],
  },
  "כספים": {
    label: "כספים",
    blocks: [
      { id: "revenue_kpi", name: "KPI הכנסות", type: "kpi" },
      { id: "invoice_chart", name: "תרשים חשבוניות", type: "chart" },
      { id: "cash_flow", name: "תזרים מזומנים", type: "gauge" },
      { id: "expenses_table", name: "טבלת הוצאות", type: "table" },
    ],
  },
  "משאבי אנוש": {
    label: "משאבי אנוש",
    blocks: [
      { id: "hr_kpi", name: "KPI עובדים", type: "kpi" },
      { id: "attendance_chart", name: "תרשים נוכחות", type: "chart" },
      { id: "hr_metrics", name: "מדדי HR", type: "metric" },
      { id: "departments_list", name: "רשימת מחלקות", type: "list" },
    ],
  },
  "ניהול": {
    label: "ניהול",
    blocks: [
      { id: "dashboard_summary", name: "סיכום ביצוע", type: "kpi" },
      { id: "alerts_list", name: "רשימת התראות", type: "list" },
      { id: "tasks_table", name: "טבלת משימות", type: "table" },
      { id: "overview_chart", name: "סקירה כללית", type: "chart" },
    ],
  },
};

export default function AdvancedDashboardBuilder({ dashboard, onSave, onClose }: AdvancedDashboardBuilderProps) {
  const [blocks, setBlocks] = useState<DashboardBlock[]>(dashboard?.blocks || []);
  const [name, setName] = useState(dashboard?.name || dashboard?.layout_name || "");
  const [selectedCategory, setSelectedCategory] = useState(Object.keys(BLOCK_CATEGORIES)[0]);
  const [editingBlock, setEditingBlock] = useState<DashboardBlock | null>(null);
  const [savedDashboards, setSavedDashboards] = useState<DashboardData[]>([]);
  const [loadingDashboards, setLoadingDashboards] = useState(true);
  const [departments, setDepartments] = useState<{ id: string | number; name: string }[]>([]);
  const [selectedDept, setSelectedDept] = useState<string | number | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [dashboards, depts] = await Promise.all([
          entityList<DashboardData>("dashboard-layouts", "-created_date", 50).catch(() => []),
          entityList<{ id: string | number; name: string }>("departments", "name", 100).catch(() => []),
        ]);
        setSavedDashboards(dashboards);
        setDepartments(depts);
      } catch (error) {
        console.error("Error loading data:", error);
      } finally {
        setLoadingDashboards(false);
      }
    };
    loadData();
  }, []);

  const addBlock = (blockTemplate: BlockTemplate) => {
    const newBlock: DashboardBlock = {
      id: `block_${Date.now()}`,
      templateId: blockTemplate.id,
      name: blockTemplate.name,
      type: blockTemplate.type,
      size: "medium",
      config: {},
      position: blocks.length,
    };
    setBlocks([...blocks, newBlock]);
  };

  const removeBlock = (blockId: string) => {
    setBlocks(blocks.filter((b) => b.id !== blockId));
  };

  const updateBlock = (blockId: string, updates: Partial<DashboardBlock>) => {
    setBlocks(blocks.map((b) => (b.id === blockId ? { ...b, ...updates } : b)));
  };

  const handleDragEnd = (result: DropResult) => {
    const { source, destination } = result;
    if (!destination) return;
    const newBlocks = Array.from(blocks);
    const [removed] = newBlocks.splice(source.index, 1);
    newBlocks.splice(destination.index, 0, removed);
    setBlocks(newBlocks);
  };

  const handleSave = async () => {
    const dashboardData = {
      layout_name: name,
      widgets: blocks.map((b) => ({
        id: b.id,
        type: b.type,
        title: b.name,
        position: { x: 0, y: 0, w: 4, h: 2 },
        config: b.config,
        visible: true,
      })),
    };

    if (dashboard?.id) {
      await entityUpdate("dashboard-layouts", dashboard.id, dashboardData);
    } else {
      await entityCreate("dashboard-layouts", dashboardData);
    }

    await onSave(dashboardData);
  };

  const loadDashboard = (selectedDashboard: DashboardData) => {
    setName(selectedDashboard.layout_name || "");
    setBlocks(
      selectedDashboard.widgets?.map((w) => ({
        id: w.id,
        name: w.title,
        type: w.type,
        size: "medium",
        config: w.config || {},
      })) || []
    );
  };

  const renderBlock = (block: DashboardBlock) => {
    const props = {
      config: block.config,
      onUpdate: (config: Record<string, unknown>) => updateBlock(block.id, { config }),
    };

    switch (block.type) {
      case "kpi": return <KPIBlock {...props} />;
      case "chart": return <ChartBlock {...props} />;
      case "table": return <TableBlock {...props} />;
      case "gauge": return <GaugeBlock {...props} />;
      case "list": return <ListBlock {...props} />;
      case "metric": return <MetricBlock {...props} />;
      default: return <div className="p-4 bg-slate-100 rounded">בלוק לא ידוע</div>;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-6xl max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>בונה דאשבורדים מתקדם</CardTitle>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="שם הדאשבורד" className="mt-2 w-96" />
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-5 h-5" /></Button>
        </CardHeader>

        <CardContent className="space-y-6">
          {!loadingDashboards && savedDashboards.length > 0 && (
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <h3 className="font-semibold mb-3">דאשבורדים שמורים</h3>
              <div className="flex flex-wrap gap-2">
                {savedDashboards.map((dash) => (
                  <Button key={String(dash.id)} variant="outline" onClick={() => loadDashboard(dash)} className="border-blue-300 hover:bg-blue-100">
                    {dash.layout_name}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-4 gap-4">
            <div className="space-y-3">
              <h3 className="font-semibold text-sm">מחלקות</h3>
              <button onClick={() => setSelectedDept(null)} className={`w-full text-right p-2 rounded text-sm ${selectedDept === null ? "bg-purple-600 text-white" : "bg-slate-100"}`}>הכל</button>
              <div className="space-y-1 max-h-80 overflow-y-auto">
                {departments.map((dept) => (
                  <button key={String(dept.id)} onClick={() => setSelectedDept(dept.id)} className={`w-full text-right p-2 rounded text-sm ${selectedDept === dept.id ? "bg-purple-600 text-white" : "bg-slate-100 hover:bg-slate-200"}`}>{dept.name}</button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="font-semibold text-sm">קטגוריות בלוקים</h3>
              <div className="space-y-1 max-h-80 overflow-y-auto">
                {Object.entries(BLOCK_CATEGORIES).map(([key, category]) => (
                  <button key={key} onClick={() => setSelectedCategory(key)} className={`w-full text-right p-2 rounded text-sm ${selectedCategory === key ? "bg-indigo-600 text-white" : "bg-slate-100 hover:bg-slate-200"}`}>{category.label}</button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="font-semibold text-sm">בלוקים זמינים</h3>
              <div className="space-y-1 max-h-80 overflow-y-auto">
                {BLOCK_CATEGORIES[selectedCategory]?.blocks.map((block) => (
                  <button key={block.id} onClick={() => addBlock(block)} className="w-full text-right p-2 bg-indigo-50 rounded border border-indigo-200 hover:bg-indigo-100 text-sm flex items-center justify-between">
                    <Plus className="w-3 h-3" />
                    <span>{block.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="font-semibold text-sm">תצורת בלוק</h3>
              {editingBlock && (
                <div className="p-3 bg-slate-50 rounded space-y-2">
                  <Input value={editingBlock.name} onChange={(e) => setEditingBlock({ ...editingBlock, name: e.target.value })} placeholder="שם הבלוק" className="text-sm" />
                  <Select value={editingBlock.size} onValueChange={(size) => setEditingBlock({ ...editingBlock, size })}>
                    <SelectTrigger className="text-sm"><SelectValue placeholder="גודל" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="small">קטן</SelectItem>
                      <SelectItem value="medium">בינוני</SelectItem>
                      <SelectItem value="large">גדול</SelectItem>
                      <SelectItem value="full">מלא</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="sm" onClick={() => { updateBlock(editingBlock.id, editingBlock); setEditingBlock(null); }} className="w-full text-xs">שמור</Button>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="font-semibold">תצוגה מקדימה</h3>
            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="blocks" direction="vertical">
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2 p-4 bg-slate-50 rounded min-h-96">
                    {blocks.map((block, index) => (
                      <Draggable key={block.id} draggableId={block.id} index={index}>
                        {(provided, snapshot) => (
                          <div ref={provided.innerRef} {...provided.draggableProps} className={`p-4 bg-white rounded border-2 ${snapshot.isDragging ? "border-indigo-600 shadow-lg" : "border-slate-200"}`}>
                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-2" {...provided.dragHandleProps}>
                                <GripVertical className="w-4 h-4 text-slate-400" />
                                <div>
                                  <p className="font-medium">{block.name}</p>
                                  <p className="text-xs text-slate-500">{block.type}</p>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <Button size="sm" variant="ghost" onClick={() => setEditingBlock(block)}><Edit2 className="w-4 h-4" /></Button>
                                <Button size="sm" variant="ghost" onClick={() => removeBlock(block.id)}><Trash2 className="w-4 h-4 text-red-600" /></Button>
                              </div>
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          </div>

          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={onClose}>ביטול</Button>
            <Button onClick={handleSave} className="bg-indigo-600"><Save className="w-4 h-4 ml-2" />שמור דאשבורד</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
