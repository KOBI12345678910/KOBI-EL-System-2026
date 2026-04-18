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
  GripVertical, Plus, X, Eye, Settings,
  Columns, Grid3x3, Rows, ChevronDown, ChevronUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface LayoutBlock {
  id: string;
  name: string;
  position: number;
  column: number;
}

interface PageLayout {
  tabs: string[];
  blocks: Record<string, LayoutBlock[]>;
}

interface PageOption {
  value: string;
  label: string;
  description: string;
}

interface AvailableBlock {
  id: string;
  name: string;
  type: string;
}

interface LayoutOption {
  value: string;
  label: string;
  icon: LucideIcon;
}

interface PageBuilderProps {
  onChangeDetected?: () => void;
}

export default function PageBuilder({ onChangeDetected }: PageBuilderProps) {
  const [selectedPage, setSelectedPage] = useState("lead_card");
  const [layout] = useState<Record<string, PageLayout>>({
    lead_card: {
      tabs: ["פרטים", "פעילויות", "משימות", "מסמכים", "תקשורת", "אנליטיקה"],
      blocks: {
        "פרטים": [
          { id: "info_1", name: "מידע כללי", position: 1, column: 1 },
          { id: "info_2", name: "פרטי קשר", position: 2, column: 1 },
          { id: "kpi_1", name: "מדדי KPI", position: 1, column: 2 },
        ],
        "פעילויות": [{ id: "activity_1", name: "Timeline", position: 1, column: 1 }],
      },
    },
  });

  const pages: PageOption[] = [
    { value: "lead_card", label: "כרטיס ליד", description: "עמוד פרטי הליד המלא" },
    { value: "leads_list", label: "רשימת לידים", description: "טבלת לידים ראשית" },
    { value: "dashboard", label: "דשבורד", description: "מסך הבית של CRM" },
    { value: "pipeline", label: "Pipeline", description: "צינור מכירות" },
  ];

  const availableBlocks: AvailableBlock[] = [
    { id: "kpi", name: "מדדי KPI", type: "widget" },
    { id: "ai_analysis", name: "ניתוח AI", type: "widget" },
    { id: "timeline", name: "ציר זמן", type: "widget" },
    { id: "products", name: "מוצרים מעניינים", type: "table" },
    { id: "notes", name: "הערות", type: "form" },
  ];

  const layoutOptions: LayoutOption[] = [
    { value: "1col", label: "עמודה אחת", icon: Rows },
    { value: "2col", label: "2 עמודות", icon: Columns },
    { value: "3col", label: "3 עמודות", icon: Grid3x3 },
  ];

  const [draggedBlock, setDraggedBlock] = useState<AvailableBlock | null>(null);
  const [currentLayout, setCurrentLayout] = useState("2col");

  const handleDragStart = (block: AvailableBlock) => {
    setDraggedBlock(block);
  };

  const handleDrop = (_tab: string, _column: number) => {
    if (draggedBlock) {
      if (onChangeDetected) onChangeDetected();
    }
    setDraggedBlock(null);
  };

  const handleRemoveBlock = (_tab: string, _blockId: string) => {
    if (confirm("להסיר את הבלוק מהטאב?")) {
      if (onChangeDetected) onChangeDetected();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <Select value={selectedPage} onValueChange={setSelectedPage}>
            <SelectTrigger className="w-full max-w-md">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pages.map((page) => (
                <SelectItem key={page.value} value={page.value}>
                  <div>
                    <div className="font-medium">{page.label}</div>
                    <div className="text-xs text-slate-500">{page.description}</div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          {layoutOptions.map((option) => {
            const Icon = option.icon;
            return (
              <Button
                key={option.value}
                variant={currentLayout === option.value ? "default" : "outline"}
                size="sm"
                onClick={() => setCurrentLayout(option.value)}
              >
                <Icon className="w-4 h-4 ml-1" />
                {option.label}
              </Button>
            );
          })}
        </div>
        <Button variant="outline" size="sm">
          <Eye className="w-4 h-4 ml-2" />
          תצוגה מקדימה
        </Button>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">בלוקים זמינים</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {availableBlocks.map((block) => (
                <div
                  key={block.id}
                  draggable
                  onDragStart={() => handleDragStart(block)}
                  className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg cursor-move hover:bg-slate-100 transition-colors border border-slate-200"
                >
                  <GripVertical className="w-4 h-4 text-slate-400" />
                  <div className="flex-1">
                    <div className="font-medium text-sm">{block.name}</div>
                    <Badge variant="outline" className="text-xs mt-1">
                      {block.type}
                    </Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="col-span-9">
          <Card>
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  פריסת {pages.find((p) => p.value === selectedPage)?.label}
                </CardTitle>
                <Button variant="outline" size="sm">
                  <Plus className="w-4 h-4 ml-2" />
                  הוסף טאב
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              {layout[selectedPage]?.tabs.map((tab, tabIndex) => (
                <div key={tabIndex} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm">
                        <GripVertical className="w-4 h-4" />
                      </Button>
                      <h3 className="font-semibold text-slate-900">{tab}</h3>
                      <Badge variant="outline" className="text-xs">
                        {layout[selectedPage].blocks[tab]?.length || 0} בלוקים
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm">
                        <ChevronUp className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm">
                        <ChevronDown className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm">
                        <Settings className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div
                    className={`grid gap-4 p-4 bg-slate-50 rounded-lg border-2 border-dashed border-slate-200 min-h-[120px] ${
                      currentLayout === "2col"
                        ? "grid-cols-2"
                        : currentLayout === "3col"
                          ? "grid-cols-3"
                          : "grid-cols-1"
                    }`}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleDrop(tab, 1)}
                  >
                    {layout[selectedPage].blocks[tab]?.map((block) => (
                      <div
                        key={block.id}
                        className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <GripVertical className="w-4 h-4 text-slate-400 cursor-move" />
                            <span className="font-medium text-sm">{block.name}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveBlock(tab, block.id)}
                          >
                            <X className="w-4 h-4 text-slate-400 hover:text-red-600" />
                          </Button>
                        </div>
                        <div className="text-xs text-slate-500">
                          עמודה {block.column} • מיקום {block.position}
                        </div>
                      </div>
                    )) || (
                      <div className="col-span-full text-center py-8 text-slate-400">
                        גרור בלוקים לכאן
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
