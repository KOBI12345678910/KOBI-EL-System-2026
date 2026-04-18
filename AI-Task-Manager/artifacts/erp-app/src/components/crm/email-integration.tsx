import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Mail, Reply, Archive, Plus } from "lucide-react";

interface Email {
  id: number;
  from: string;
  subject: string;
  date: string;
  preview: string;
}

export default function EmailIntegration() {
  const [emails] = useState<Email[]>([
    {
      id: 1,
      from: "משה כהן",
      subject: "דרוש עדכון על ההצעה",
      date: "היום 10:30",
      preview: "היי, רציתי לדעת אם...",
    },
    {
      id: 2,
      from: "דינה רוזנברג",
      subject: "עסקה חדשה - צורך בפגישה",
      date: "אתמול 14:00",
      preview: "תודה על הצעת המחיר...",
    },
  ]);

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Mail className="w-5 h-5 text-blue-600" />
          Email Sync (Gmail/Outlook)
        </CardTitle>
        <Button size="sm" className="bg-blue-600">
          <Plus className="w-4 h-4 ml-1" />
          Send Email
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {emails.map((email) => (
          <div key={email.id} className="p-3 border border-slate-200 rounded-lg hover:bg-slate-50">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="font-medium text-slate-900">{email.from}</p>
                <p className="text-sm text-slate-700 mt-1">{email.subject}</p>
                <p className="text-xs text-slate-500 mt-1">{email.preview}</p>
              </div>
              <div className="flex gap-1 ml-2">
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Reply className="w-4 h-4 text-slate-600" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Archive className="w-4 h-4 text-slate-600" />
                </Button>
              </div>
            </div>
            <div className="mt-2 flex justify-between items-center">
              <Badge variant="outline" className="text-xs">
                {email.date}
              </Badge>
              <Badge className="bg-blue-100 text-blue-700 text-xs">Connected</Badge>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
