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
import { Plus, Trash2, Edit2 } from "lucide-react";
import { entityCreate, entityList } from "@/lib/entity-api";

export default function AssignmentRulesBuilder() {
  const [newRule, setNewRule] = useState({
    rule_name: "",
    entity_type: "lead",
    assignment_mode: "auto_assign",
    source_filter: ["website", "facebook"],
  });

  const { data: rules = [], refetch } = useQuery({
    queryKey: ["assignmentRules"],
    queryFn: () => entityList<any>("assignment-rules"),
  });

  const handleCreateRule = async () => {
    if (!newRule.rule_name) {
      alert("שם כלל נדרש");
      return;
    }

    try {
      await entityCreate<any>("assignment-rules", {
        ...newRule,
        priority: rules.length + 1,
      });

      setNewRule({
        rule_name: "",
        entity_type: "lead",
        assignment_mode: "auto_assign",
        source_filter: ["website", "facebook"],
      });
      refetch();
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const sources = [
    "website",
    "facebook",
    "instagram",
    "whatsapp",
    "phone",
    "email",
    "import",
    "other",
  ];

  const assignmentModes = [
    { value: "auto_assign", label: "הקצאה אוטומטית" },
    { value: "manager_queue", label: "תור מנהל" },
    { value: "round_robin", label: "Round Robin" },
    { value: "by_specialization", label: "לפי התמחות" },
    { value: "by_load", label: "לפי עומס" },
  ];

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader>
        <CardTitle>⚙️ Assignment Rules Builder</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Create New Rule */}
        <div className="p-6 bg-gradient-to-r from-orange-50 to-amber-50 rounded-lg border-2 border-dashed border-orange-300 space-y-4">
          <h3 className="font-bold text-slate-900">כלל הקצאה חדש</h3>

          <Input
            placeholder="שם הכלל"
            value={newRule.rule_name}
            onChange={(e) =>
              setNewRule({ ...newRule, rule_name: e.target.value })
            }
          />

          <div className="grid grid-cols-2 gap-4">
            <Select
              value={newRule.entity_type}
              onValueChange={(value) =>
                setNewRule({ ...newRule, entity_type: value })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="בחר ישות" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lead">Lead</SelectItem>
                <SelectItem value="opportunity">Opportunity</SelectItem>
                <SelectItem value="deal">Deal</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={newRule.assignment_mode}
              onValueChange={(value) =>
                setNewRule({ ...newRule, assignment_mode: value })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="מצב הקצאה" />
              </SelectTrigger>
              <SelectContent>
                {assignmentModes.map((mode) => (
                  <SelectItem key={mode.value} value={mode.value}>
                    {mode.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              מקורות שעוברים תור מנהל:
            </label>
            <div className="grid grid-cols-3 gap-2">
              {sources.map((source) => (
                <label key={source} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={newRule.source_filter.includes(source)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setNewRule({
                          ...newRule,
                          source_filter: [...newRule.source_filter, source],
                        });
                      } else {
                        setNewRule({
                          ...newRule,
                          source_filter: newRule.source_filter.filter(
                            (s) => s !== source
                          ),
                        });
                      }
                    }}
                  />
                  <span className="text-sm">{source}</span>
                </label>
              ))}
            </div>
          </div>

          <Button
            onClick={handleCreateRule}
            className="bg-orange-600 hover:bg-orange-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            צור כלל
          </Button>
        </div>

        {/* Existing Rules */}
        <div className="space-y-3">
          <h3 className="font-bold text-slate-900">כללים קיימים</h3>
          {rules.length === 0 ? (
            <p className="text-slate-600 text-center py-6">אין כללים עדיין</p>
          ) : (
            rules.map((rule) => (
              <div
                key={rule.id}
                className="p-4 bg-white rounded-lg border border-slate-200 space-y-2 hover:shadow-md transition"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="font-bold">{rule.rule_name}</p>
                    <p className="text-sm text-slate-600">
                      {rule.entity_type} • {rule.assignment_mode}
                    </p>
                    {rule.source_filter && (
                      <p className="text-xs text-slate-500 mt-1">
                        מקורות:{" "}
                        {rule.source_filter.join(", ")}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="icon" className="text-blue-600">
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}