import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageCircle, Send, Phone, MoreVertical } from "lucide-react";

interface Message {
  id: number;
  sender: "contact" | "user";
  text: string;
  time: string;
}

export default function WhatsAppMessaging() {
  const [messages] = useState<Message[]>([
    { id: 1, sender: "contact", text: "שלום, תודה על הצעת המחיר", time: "09:30" },
    { id: 2, sender: "user", text: "בשמחה! יש לך שאלות?", time: "09:35" },
    { id: 3, sender: "contact", text: "כן, אפשר קצת הנחה?", time: "09:40" },
  ]);
  const [newMsg, setNewMsg] = useState("");

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-green-600" />
          WhatsApp & SMS Integration
        </CardTitle>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Phone className="w-4 h-4 text-slate-600" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreVertical className="w-4 h-4 text-slate-600" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="h-48 bg-slate-50 rounded-lg p-3 space-y-2 overflow-y-auto">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-xs px-3 py-2 rounded-lg ${
                  msg.sender === "user"
                    ? "bg-green-500 text-white"
                    : "bg-slate-200 text-slate-900"
                }`}
              >
                <p className="text-sm">{msg.text}</p>
                <p
                  className={`text-xs mt-1 ${
                    msg.sender === "user" ? "text-green-100" : "text-slate-600"
                  }`}
                >
                  {msg.time}
                </p>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="הודעה..."
            value={newMsg}
            onChange={(e) => setNewMsg(e.target.value)}
          />
          <Button className="bg-green-600">
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <Badge className="bg-green-100 text-green-700">פעיל</Badge>
      </CardContent>
    </Card>
  );
}
