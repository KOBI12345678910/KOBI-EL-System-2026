import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowRight, Wand2, CheckCircle, AlertCircle, Loader } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface FieldMapping {
  source_field: string;
  target_field: string;
  confidence: number;
}

interface Props {
  sourceModule?: string;
  targetModule?: string;
  onMappingComplete: (mappings: FieldMapping[]) => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AIFieldMapper({
  sourceModule,
  targetModule,
  onMappingComplete,
}: Props) {
  const [mappings, setMappings] = useState<FieldMapping[]>([]);
  const [loading, setLoading] = useState(false);

  const generateMappingMutation = useMutation({
    mutationFn: async (): Promise<FieldMapping[]> => {
      setLoading(true);
      try {
        // NOTE: base44 InvokeLLM integration removed.
        // Replace with your own LLM API call.
        console.info(
          "[AIFieldMapper] Would invoke LLM to map fields from",
          sourceModule,
          "to",
          targetModule
        );

        // Placeholder: return common field mappings
        const common: FieldMapping[] = [
          { source_field: "name", target_field: "name", confidence: 95 },
          { source_field: "email", target_field: "email", confidence: 95 },
          { source_field: "phone", target_field: "phone", confidence: 90 },
          { source_field: "address", target_field: "address", confidence: 85 },
          { source_field: "amount", target_field: "amount", confidence: 80 },
        ];
        return common;
      } catch (error) {
        console.error("AI mapping error:", error);
        return [];
      } finally {
        setLoading(false);
      }
    },
    onSuccess: (data) => {
      setMappings(data);
    },
  });

  const handleApplyMapping = () => {
    onMappingComplete(mappings);
  };

  const handleRemoveMapping = (index: number) => {
    setMappings(mappings.filter((_, i) => i !== index));
  };

  const handleAddCustomMapping = () => {
    setMappings([...mappings, { source_field: "", target_field: "", confidence: 50 }]);
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">AI Field Mapper</CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => generateMappingMutation.mutate()}
            disabled={loading || !sourceModule || !targetModule}
            className="gap-1"
          >
            {loading ? (
              <Loader className="w-3 h-3 animate-spin" />
            ) : (
              <Wand2 className="w-3 h-3" />
            )}
            AI Generate
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Module Info */}
        <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
          <Badge variant="outline">{sourceModule || "Select source"}</Badge>
          <ArrowRight className="w-4 h-4 text-slate-400" />
          <Badge variant="outline">{targetModule || "Select target"}</Badge>
        </div>

        {/* Mappings List */}
        {mappings.length > 0 ? (
          <div className="space-y-2">
            {mappings.map((mapping, idx) => (
              <div key={idx} className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
                <Input
                  placeholder="Source field"
                  value={mapping.source_field}
                  onChange={(e) => {
                    const newMappings = [...mappings];
                    newMappings[idx].source_field = e.target.value;
                    setMappings(newMappings);
                  }}
                  className="text-xs"
                />
                <ArrowRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <Input
                  placeholder="Target field"
                  value={mapping.target_field}
                  onChange={(e) => {
                    const newMappings = [...mappings];
                    newMappings[idx].target_field = e.target.value;
                    setMappings(newMappings);
                  }}
                  className="text-xs"
                />
                <div className="flex items-center gap-2 flex-shrink-0">
                  {mapping.confidence >= 80 && (
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  )}
                  {mapping.confidence < 80 && mapping.confidence >= 50 && (
                    <AlertCircle className="w-4 h-4 text-yellow-600" />
                  )}
                  <span className="text-xs font-semibold text-slate-700 min-w-8">
                    {mapping.confidence}%
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveMapping(idx)}
                  className="text-red-600"
                >
                  X
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-slate-500">
            <p className="text-sm">Click &quot;AI Generate&quot; to create automatic mappings</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleAddCustomMapping} className="flex-1">
            + Add manual mapping
          </Button>
          {mappings.length > 0 && (
            <Button size="sm" variant="default" onClick={handleApplyMapping} className="flex-1">
              Apply mappings
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
