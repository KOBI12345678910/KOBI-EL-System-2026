import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Lightbulb, Loader, Check, ArrowRight } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Suggestion {
  id: string;
  title: string;
  description: string;
  complexity: "easy" | "medium" | "hard";
  time_saved_percent: number;
}

interface Workflow {
  name?: string;
  trigger_event?: string;
  connected_modules?: string[];
  execution_count?: number;
  error_count?: number;
}

interface Props {
  workflow: Workflow;
  onApplySuggestion?: (suggestion: Suggestion) => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AISuggestions({ workflow, onApplySuggestion }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [appliedSuggestions, setAppliedSuggestions] = useState<Set<string>>(new Set());

  const generateSuggestionsMutation = useMutation({
    mutationFn: async (): Promise<Suggestion[]> => {
      setLoading(true);
      try {
        // NOTE: base44 InvokeLLM integration removed.
        // Replace with your own LLM API call.
        console.info("[AISuggestions] Would invoke LLM for workflow suggestions", workflow.name);

        // Placeholder suggestions
        const placeholderSuggestions: Suggestion[] = [
          {
            id: "1",
            title: "Add error handling step",
            description: "Add a try-catch block around the main workflow to handle failures gracefully.",
            complexity: "easy",
            time_saved_percent: 15,
          },
          {
            id: "2",
            title: "Add validation conditions",
            description: "Validate input fields before processing to reduce errors.",
            complexity: "medium",
            time_saved_percent: 25,
          },
        ];
        return placeholderSuggestions;
      } catch (error) {
        console.error("Error generating suggestions:", error);
        return [];
      } finally {
        setLoading(false);
      }
    },
    onSuccess: (data) => {
      setSuggestions(data);
    },
  });

  const handleApply = (suggestion: Suggestion) => {
    setAppliedSuggestions(new Set([...appliedSuggestions, suggestion.id]));
    onApplySuggestion?.(suggestion);
  };

  if (suggestions.length === 0 && !loading) {
    return (
      <Card className="border-0 shadow-sm">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Lightbulb className="w-5 h-5 text-yellow-600" />
              <div>
                <p className="font-semibold text-slate-900">AI Smart Suggestions</p>
                <p className="text-xs text-slate-600">Get suggestions to improve your workflow</p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => generateSuggestionsMutation.mutate()}
              disabled={loading}
              className="gap-1"
            >
              {loading ? (
                <Loader className="w-3 h-3 animate-spin" />
              ) : (
                <Lightbulb className="w-3 h-3" />
              )}
              {loading ? "Computing..." : "Get suggestions"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-yellow-600" />
          AI Suggestions ({suggestions.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {suggestions.length === 0 ? (
          <div className="text-center py-8">
            <Loader className="w-6 h-6 animate-spin text-blue-600 mx-auto mb-2" />
            <p className="text-sm text-slate-600">Computing suggestions...</p>
          </div>
        ) : (
          suggestions.map((suggestion) => (
            <div
              key={suggestion.id}
              className="p-4 border border-slate-200 rounded-lg hover:border-indigo-300 transition-colors"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <h4 className="font-semibold text-sm text-slate-900">
                    {suggestion.title}
                  </h4>
                  <p className="text-xs text-slate-600 mt-1">
                    {suggestion.description}
                  </p>
                </div>
                {appliedSuggestions.has(suggestion.id) && (
                  <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                )}
              </div>

              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  <Badge variant="outline" className="text-xs">
                    {suggestion.complexity === "easy" && "Easy"}
                    {suggestion.complexity === "medium" && "Medium"}
                    {suggestion.complexity === "hard" && "Hard"}
                  </Badge>
                  {suggestion.time_saved_percent > 0 && (
                    <Badge className="bg-green-100 text-green-800 text-xs">
                      Saves {suggestion.time_saved_percent}%
                    </Badge>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleApply(suggestion)}
                  disabled={appliedSuggestions.has(suggestion.id)}
                  className="gap-1 text-xs"
                >
                  {appliedSuggestions.has(suggestion.id) ? (
                    <>Done</>
                  ) : (
                    <>
                      <ArrowRight className="w-3 h-3" />
                      Apply
                    </>
                  )}
                </Button>
              </div>
            </div>
          ))
        )}

        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setSuggestions([]);
            generateSuggestionsMutation.mutate();
          }}
          className="w-full mt-2"
          disabled={loading}
        >
          {loading ? "Loading..." : "Get more suggestions"}
        </Button>
      </CardContent>
    </Card>
  );
}
