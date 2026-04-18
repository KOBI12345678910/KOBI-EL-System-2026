import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import { Trash2, Plus, GripVertical } from "lucide-react";
import { entityCreate, entityFilter } from "@/lib/entity-api";

export default function PipelineBuilder({ entityType = "lead" }) {
  const [newStage, setNewStage] = useState({
    stage_name: "",
    stage_key: "",
    color: "#3b82f6",
  });

  const { data: stages = [], refetch } = useQuery({
    queryKey: ["stages", entityType],
    queryFn: () => entityFilter<any>("pipeline-stages", { entity_type: entityType }),
  });

  const handleCreateStage = async () => {
    if (!newStage.stage_name || !newStage.stage_key) {
      alert("שם וקוד סטטוס נדרשים");
      return;
    }

    try {
      await entityCreate<any>("pipeline-stages", {
        entity_type: entityType,
        ...newStage,
        order: stages.length,
      });

      setNewStage({
        stage_name: "",
        stage_key: "",
        color: "#3b82f6",
      });
      refetch();
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const handleDeleteStage = async (stageId) => {
    // Implementation would delete from database
    refetch();
  };

  const stageColors = [
    { name: "כחול", value: "#3b82f6" },
    { name: "ירוק", value: "#10b981" },
    { name: "צהוב", value: "#f59e0b" },
    { name: "אדום", value: "#ef4444" },
    { name: "סגול", value: "#8b5cf6" },
    { name: "ורוד", value: "#ec4899" },
  ];

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader>
        <CardTitle>🔄 Pipeline Builder - {entityType}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Create New Stage */}
        <div className="p-6 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border-2 border-dashed border-green-300 space-y-4">
          <h3 className="font-bold text-slate-900">סטטוס חדש</h3>

          <div className="grid grid-cols-2 gap-4">
            <Input
              placeholder="שם הסטטוס"
              value={newStage.stage_name}
              onChange={(e) =>
                setNewStage({ ...newStage, stage_name: e.target.value })
              }
            />
            <Input
              placeholder="קוד (snake_case)"
              value={newStage.stage_key}
              onChange={(e) =>
                setNewStage({ ...newStage, stage_key: e.target.value })
              }
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">בחר צבע:</label>
            <div className="flex gap-2 flex-wrap">
              {stageColors.map((color) => (
                <button
                  key={color.value}
                  onClick={() =>
                    setNewStage({ ...newStage, color: color.value })
                  }
                  className={`w-10 h-10 rounded-lg border-2 transition ${
                    newStage.color === color.value
                      ? "border-slate-900"
                      : "border-slate-200"
                  }`}
                  style={{ backgroundColor: color.value }}
                  title={color.name}
                />
              ))}
            </div>
          </div>

          <Button
            onClick={handleCreateStage}
            className="bg-green-600 hover:bg-green-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            הוסף סטטוס
          </Button>
        </div>

        {/* Existing Stages */}
        <div className="space-y-3">
          <h3 className="font-bold text-slate-900">סטטוסים קיימים</h3>
          {stages.length === 0 ? (
            <p className="text-slate-600 text-center py-6">אין סטטוסים עדיין</p>
          ) : (
            <div className="space-y-2">
              {stages.map((stage) => (
                <div
                  key={stage.id}
                  className="p-4 bg-white rounded-lg border border-slate-200 flex items-center justify-between hover:shadow-md transition"
                >
                  <div className="flex items-center gap-4 flex-1">
                    <GripVertical className="w-4 h-4 text-slate-400" />
                    <div
                      className="w-6 h-6 rounded-full border-2 border-slate-300"
                      style={{ backgroundColor: stage.color }}
                    />
                    <div>
                      <p className="font-bold">{stage.stage_name}</p>
                      <p className="text-sm text-slate-600">
                        {stage.stage_key}
                        {stage.win_stage && " • ניצחון"}
                        {stage.lose_stage && " • הפסד"}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteStage(stage.id)}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}