import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader, Brain, Copy, Check } from "lucide-react";
import { authFetch } from "@/lib/utils";

interface CRMAssistantProps {
  entity: Record<string, unknown>;
  entityType: string;
}

export default function CRMAssistant({ entity, entityType }: CRMAssistantProps) {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

  const summarizeEntity = async () => {
    try {
      setLoading(true);
      const prompt = `Provide a concise 2-3 sentence summary of this ${entityType}:
      ${JSON.stringify(entity, null, 2)}
      Focus on key information like status, value, and recent activity.`;

      const res = await authFetch("/api/ai/invoke-llm", {
        method: "POST",
        body: JSON.stringify({ prompt, add_context_from_internet: false }),
      });
      const result = await res.text();

      setResults((prev) => ({ ...prev, summary: result }));
      setActiveTab("summary");
    } catch (error) {
      console.error("Error:", error);
      alert("Failed to generate summary");
    } finally {
      setLoading(false);
    }
  };

  const draftEmail = async () => {
    try {
      setLoading(true);
      const prompt = `Draft a professional follow-up email for this ${entityType}. Keep it concise and action-oriented.

      ${entityType} Details:
      ${JSON.stringify(entity, null, 2)}

      Include subject line and body. Format as:
      Subject: [subject]

      Body:
      [email body]`;

      const res = await authFetch("/api/ai/invoke-llm", {
        method: "POST",
        body: JSON.stringify({ prompt, add_context_from_internet: false }),
      });
      const result = await res.text();

      setResults((prev) => ({ ...prev, email: result }));
      setActiveTab("email");
    } catch (error) {
      console.error("Error:", error);
      alert("Failed to draft email");
    } finally {
      setLoading(false);
    }
  };

  const suggestActions = async () => {
    try {
      setLoading(true);
      const prompt = `Suggest 3-4 specific next best actions for this ${entityType} based on its current status and information:

      ${JSON.stringify(entity, null, 2)}

      Provide actionable steps that would move this opportunity forward. Format each action on a new line with a number.`;

      const res = await authFetch("/api/ai/invoke-llm", {
        method: "POST",
        body: JSON.stringify({ prompt, add_context_from_internet: false }),
      });
      const result = await res.text();

      setResults((prev) => ({ ...prev, actions: result }));
      setActiveTab("actions");
    } catch (error) {
      console.error("Error:", error);
      alert("Failed to suggest actions");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const tabs = [
    { id: "summary", label: "Summarize", action: summarizeEntity },
    { id: "email", label: "Draft Email", action: draftEmail },
    { id: "actions", label: "Next Actions", action: suggestActions },
  ];

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="bg-gradient-to-r from-purple-50 to-pink-50">
        <CardTitle className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-purple-600" />
          AI Assistant
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-4">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <Button
              key={tab.id}
              onClick={tab.action}
              disabled={loading}
              variant={activeTab === tab.id ? "default" : "outline"}
              className={activeTab === tab.id ? "bg-purple-600 hover:bg-purple-700" : ""}
            >
              {loading && activeTab === tab.id && (
                <Loader className="w-4 h-4 animate-spin mr-2" />
              )}
              {tab.label}
            </Button>
          ))}
        </div>

        {activeTab && results[activeTab] && (
          <div className="bg-slate-50 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Badge className="bg-purple-600">
                {tabs.find((t) => t.id === activeTab)?.label}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(results[activeTab])}
              >
                {copied ? (
                  <Check className="w-4 h-4 text-green-600" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>
            <p className="text-slate-700 whitespace-pre-wrap text-sm leading-relaxed">
              {results[activeTab]}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
