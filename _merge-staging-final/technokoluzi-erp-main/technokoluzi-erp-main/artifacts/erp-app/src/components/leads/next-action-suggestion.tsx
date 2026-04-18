import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckSquare,
  MessageSquare,
  Phone,
  Mail,
  Calendar,
  Zap,
  AlertCircle,
} from "lucide-react";

// Placeholder - would import from a real engine module
async function suggestNextAction(lead: any): Promise<any> {
  return null;
}

interface NextActionSuggestionProps {
  lead: any;
  onActionClick?: (action: string) => void;
}

const actionIcons: Record<string, any> = {
  send_follow_up_message: MessageSquare,
  schedule_meeting: Calendar,
  send_proposal: CheckSquare,
  make_call: Phone,
  send_email: Mail,
  discount_offer: Zap,
  reconnect: MessageSquare,
  escalate: AlertCircle,
};

const urgencyColors: Record<string, string> = {
  critical: "bg-red-50 border-red-200",
  high: "bg-orange-50 border-orange-200",
  medium: "bg-yellow-50 border-yellow-200",
  normal: "bg-blue-50 border-blue-200",
};

const urgencyBadgeVariant: Record<string, "destructive" | "secondary" | "outline" | "default"> = {
  critical: "destructive",
  high: "secondary",
  medium: "outline",
  normal: "default",
};

export default function NextActionSuggestion({ lead, onActionClick }: NextActionSuggestionProps) {
  const [suggestion, setSuggestion] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSuggestion = async () => {
      try {
        const action = await suggestNextAction(lead);
        setSuggestion(action);
      } catch (error) {
        console.error("Error fetching next action suggestion:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchSuggestion();
  }, [lead]);

  if (loading || !suggestion) return null;

  const IconComponent = actionIcons[suggestion.action] || CheckSquare;

  return (
    <Card className={`border-2 ${urgencyColors[suggestion.urgency]}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <IconComponent className="w-5 h-5 text-slate-700" />
            <CardTitle className="text-lg">Suggested Next Action</CardTitle>
          </div>
          <Badge variant={urgencyBadgeVariant[suggestion.urgency]}>
            {suggestion.urgency.toUpperCase()}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="font-semibold text-slate-900 capitalize">
            {suggestion.action.replace(/_/g, " ")}
          </p>
          <p className="text-sm text-slate-600 mt-1">{suggestion.description}</p>
        </div>

        {suggestion.rule_name && (
          <p className="text-xs text-slate-500">Rule: {suggestion.rule_name}</p>
        )}

        <Button
          onClick={() => onActionClick?.(suggestion.action)}
          className="w-full"
        >
          Take Action
        </Button>
      </CardContent>
    </Card>
  );
}
