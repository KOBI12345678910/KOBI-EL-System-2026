import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader, Mail, Copy, Check } from "lucide-react";
import { authFetch } from "@/lib/utils";

interface Lead {
  name?: string;
  email?: string;
  status?: string;
  lead_source?: string;
  lead_score?: number;
  [key: string]: unknown;
}

interface EmailDrafterProps {
  lead: Lead;
  onUse?: (draft: string) => void;
}

export default function EmailDrafter({ lead, onUse }: EmailDrafterProps) {
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generateDraft = async () => {
    try {
      setLoading(true);
      const prompt = `Draft a professional, personalized follow-up email for this lead based on their current status and history. Keep it concise (3-4 sentences).

      Lead Info:
      - Name: ${lead.name}
      - Email: ${lead.email}
      - Status: ${lead.status}
      - Source: ${lead.lead_source}
      - Score: ${lead.lead_score}

      Format as:
      Subject: [subject]

      Body:
      [email]`;

      const res = await authFetch("/api/ai/invoke-llm", {
        method: "POST",
        body: JSON.stringify({ prompt, add_context_from_internet: false }),
      });
      const result = await res.text();
      setDraft(result);
    } catch (error) {
      console.error("Error:", error);
      alert("Failed to generate draft");
    } finally {
      setLoading(false);
    }
  };

  const copyDraft = () => {
    if (!draft) return;
    navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="bg-gradient-to-r from-blue-50 to-cyan-50">
        <CardTitle className="flex items-center gap-2">
          <Mail className="w-5 h-5 text-blue-600" />
          Email Draft
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-4">
        {!draft ? (
          <Button
            onClick={generateDraft}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            {loading && <Loader className="w-4 h-4 animate-spin mr-2" />}
            {loading ? "Generating..." : "Generate Follow-up Email"}
          </Button>
        ) : (
          <div className="space-y-3">
            <div className="bg-slate-50 rounded-lg p-4 max-h-96 overflow-y-auto">
              <p className="text-slate-700 whitespace-pre-wrap text-sm leading-relaxed">{draft}</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={copyDraft} variant="outline" className="flex-1">
                {copied ? (
                  <Check className="w-4 h-4 text-green-600 mr-2" />
                ) : (
                  <Copy className="w-4 h-4 mr-2" />
                )}
                {copied ? "Copied!" : "Copy"}
              </Button>
              <Button
                onClick={() => onUse?.(draft)}
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                Use in Email
              </Button>
              <Button onClick={() => setDraft(null)} variant="outline">
                Regenerate
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
