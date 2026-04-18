import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Lightbulb, Loader, Check } from "lucide-react";
import { authFetch } from "@/lib/utils";

interface Suggestion {
  action: string;
  reason: string;
}

interface SuggestedActionsProps {
  entity: Record<string, unknown>;
  entityType: string;
}

export default function SuggestedActions({ entity, entityType }: SuggestedActionsProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [completed, setCompleted] = useState<Record<number, boolean>>({});

  useEffect(() => {
    generateSuggestions();
  }, [entity?.id]);

  const generateSuggestions = async () => {
    try {
      setLoading(true);
      const prompt = `Based on this ${entityType}, suggest 3-4 specific recommended next actions to maximize success:

      ${JSON.stringify(entity, null, 2)}

      Return as JSON array with objects containing "action" (string) and "reason" (string) fields. Only return the JSON array, no other text.`;

      const res = await authFetch("/api/ai/invoke-llm", {
        method: "POST",
        body: JSON.stringify({
          prompt,
          response_json_schema: {
            type: "object",
            properties: {
              suggestions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    action: { type: "string" },
                    reason: { type: "string" },
                  },
                },
              },
            },
          },
        }),
      });
      const result = await res.json();
      setSuggestions(result.suggestions || []);
    } catch (error) {
      console.error("Error generating suggestions:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleComplete = (index: number) => {
    setCompleted((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="bg-gradient-to-r from-yellow-50 to-orange-50">
        <CardTitle className="flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-yellow-600" />
          Suggested Actions
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader className="w-5 h-5 animate-spin text-slate-400" />
          </div>
        ) : suggestions.length === 0 ? (
          <p className="text-slate-600 text-center py-4">No suggestions available</p>
        ) : (
          <div className="space-y-3">
            {suggestions.map((suggestion, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-lg border-l-4 transition-colors ${
                  completed[idx]
                    ? "border-l-green-500 bg-green-50"
                    : "border-l-blue-500 bg-blue-50"
                }`}
              >
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => toggleComplete(idx)}
                    className={`mt-1 flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center ${
                      completed[idx] ? "bg-green-500 border-green-500" : "border-slate-300"
                    }`}
                  >
                    {completed[idx] && <Check className="w-3 h-3 text-white" />}
                  </button>
                  <div className="flex-1">
                    <p
                      className={`font-medium ${
                        completed[idx] ? "line-through text-slate-500" : "text-slate-900"
                      }`}
                    >
                      {suggestion.action}
                    </p>
                    <p className="text-sm text-slate-600 mt-1">{suggestion.reason}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
