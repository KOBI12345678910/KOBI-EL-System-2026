import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Copy, RefreshCw, Send, Sparkles } from "lucide-react";

interface Communication {
  text?: string;
  [key: string]: unknown;
}

interface AIResponseDrafterProps {
  communication?: Communication | null;
}

type Tone = "professional" | "friendly" | "apologetic" | "enthusiastic";

export default function AIResponseDrafter({ communication = null }: AIResponseDrafterProps) {
  const [draftedResponse, setDraftedResponse] = useState("");
  const [tone, setTone] = useState<Tone>("professional");

  const generateResponse = (_inputText: string, selectedTone: Tone): string => {
    const templates: Record<Tone, string> = {
      professional: `Thank you for your message. We appreciate your feedback and are committed to addressing your concerns promptly. Our team will follow up with you within 24 hours with a comprehensive solution.`,
      friendly: `Thanks so much for reaching out! We really appreciate you taking the time to share this with us. We'll get back to you super soon with an answer.`,
      apologetic: `We sincerely apologize for the inconvenience this has caused. Your satisfaction is our top priority, and we're committed to making this right immediately.`,
      enthusiastic: `That's fantastic! We're thrilled to hear this from you! Your support means everything to us, and we can't wait to continue working with you!`,
    };
    return templates[selectedTone] || templates.professional;
  };

  const handleDraft = () => {
    const response = generateResponse(communication?.text || "", tone);
    setDraftedResponse(response);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(draftedResponse);
    alert("Response copied to clipboard!");
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-cyan-600" />
          AI Response Drafter & Summarizer
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Tone Selection */}
        <div>
          <p className="text-sm font-semibold text-slate-900 mb-2">Select Tone:</p>
          <div className="grid grid-cols-4 gap-2">
            {(["professional", "friendly", "apologetic", "enthusiastic"] as Tone[]).map((t) => (
              <Button
                key={t}
                variant={tone === t ? "default" : "outline"}
                size="sm"
                onClick={() => setTone(t)}
                className="text-xs"
              >
                {t}
              </Button>
            ))}
          </div>
        </div>

        {/* Draft Button */}
        <Button onClick={handleDraft} className="w-full bg-cyan-600 hover:bg-cyan-700">
          <Sparkles className="w-4 h-4 ml-2" />
          Generate AI Draft
        </Button>

        {/* Drafted Response */}
        {draftedResponse && (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-900">AI Draft Response:</p>
            <Textarea
              value={draftedResponse}
              onChange={(e) => setDraftedResponse(e.target.value)}
              className="min-h-32"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setDraftedResponse(generateResponse(communication?.text || "", tone))
                }
              >
                <RefreshCw className="w-4 h-4 ml-1" />
                Regenerate
              </Button>
              <Button size="sm" onClick={copyToClipboard} className="bg-cyan-600">
                <Copy className="w-4 h-4 ml-1" />
                Copy
              </Button>
              <Button size="sm" className="bg-emerald-600 ml-auto">
                <Send className="w-4 h-4 ml-1" />
                Send
              </Button>
            </div>
          </div>
        )}

        {/* AI Insight */}
        {draftedResponse && (
          <div className="p-3 bg-cyan-50 border border-cyan-200 rounded-lg">
            <p className="text-xs text-cyan-700">
              <strong>AI Tip:</strong> This draft maintains a {tone} tone and addresses customer
              concerns empathetically while promising timely resolution.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
