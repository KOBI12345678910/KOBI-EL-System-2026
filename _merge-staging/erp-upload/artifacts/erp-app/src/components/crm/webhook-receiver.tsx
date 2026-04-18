import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";

export default function WebhookReceiver() {
  const [copied, setCopied] = useState(false);

  const webhookUrl = `${window.location.origin}/api/webhooks/lead-intake`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    toast.success("הכתובת הועתקה");
    setTimeout(() => setCopied(false), 2000);
  };

  const examplePayloads: Record<string, Record<string, unknown>> = {
    website: {
      source: "website",
      first_name: "יוסי",
      last_name: "כהן",
      phone: "0501234567",
      email: "yossi@example.com",
      work_type: ["railings"],
      city: "תל אביב",
      notes: "מעוניין במעקות למרפסת",
    },
    facebook: {
      source: "facebook",
      first_name: "שרה",
      phone: "0529876543",
      work_type: ["gates"],
      urgency: "urgent",
    },
    whatsapp: {
      source: "whatsapp",
      phone: "0501111111",
      company_name: "חברת ABC",
      notes: "הודעה מוואטסאפ",
    },
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>כתובת Webhook לקבלת לידים</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <code className="flex-1 p-3 bg-slate-100 rounded text-sm">{webhookUrl}</code>
            <Button variant="outline" size="icon" onClick={copyToClipboard}>
              {copied ? (
                <Check className="w-4 h-4 text-green-600" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </Button>
          </div>
          <div className="text-sm text-slate-600">
            <div className="font-semibold mb-2">שימוש:</div>
            <ul className="list-disc list-inside space-y-1">
              <li>שלח POST request לכתובת זו</li>
              <li>המערכת תקבל את הליד אוטומטית</li>
              <li>בדיקת כפילויות אוטומטית</li>
              <li>ניתוב להקצאה לפי כללים</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>דוגמאות Payload</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {Object.entries(examplePayloads).map(([source, payload]) => (
            <div key={source}>
              <div className="font-semibold text-sm mb-2 capitalize">{source}</div>
              <pre className="p-3 bg-slate-900 text-slate-100 rounded text-xs overflow-x-auto">
                {JSON.stringify(payload, null, 2)}
              </pre>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>טסטים אוטומטיים</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Badge variant="outline" className="bg-green-50">קליטת ליד מאתר</Badge>
            <Badge variant="outline" className="bg-green-50">זיהוי כפילויות</Badge>
            <Badge variant="outline" className="bg-green-50">הקצאה אוטומטית</Badge>
            <Badge variant="outline" className="bg-green-50">שליחת התראות</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
