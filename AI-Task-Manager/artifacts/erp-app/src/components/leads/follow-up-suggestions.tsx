import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lightbulb } from "lucide-react";

interface Suggestion {
  icon: string;
  title: string;
  description: string;
  action: string;
}

interface FollowUpSuggestionsProps {
  lead: Record<string, any>;
  onActionSelected?: (suggestion: Suggestion) => void;
}

// Placeholder for follow-up suggestions logic
function getFollowUpSuggestions(_lead: Record<string, any>): Suggestion[] {
  return [];
}

export default function FollowUpSuggestions({ lead, onActionSelected }: FollowUpSuggestionsProps) {
  const suggestions = getFollowUpSuggestions(lead);

  if (!suggestions || suggestions.length === 0) {
    return null;
  }

  return (
    <Card className="border-0 shadow-lg bg-gradient-to-r from-yellow-50 to-amber-50">
      <CardContent className="pt-6 space-y-3">
        <div className="flex items-center gap-2 mb-4">
          <Lightbulb className="w-5 h-5 text-amber-600" />
          <h3 className="font-semibold text-slate-900">Suggested Follow-ups</h3>
        </div>

        <div className="space-y-3">
          {suggestions.map((suggestion, idx) => (
            <div key={idx} className="p-3 bg-white rounded-lg border border-amber-200 hover:border-amber-400 transition">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900">
                    {suggestion.icon} {suggestion.title}
                  </p>
                  <p className="text-xs text-slate-600 mt-1">{suggestion.description}</p>
                </div>
                <Button size="sm" onClick={() => onActionSelected?.(suggestion)} className="bg-amber-600 hover:bg-amber-700">
                  {suggestion.action}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
