import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Mail, MessageSquare, ArrowUpRight, ArrowDownLeft,
  CheckCircle2, XCircle, Clock, Loader2,
} from "lucide-react";

const API_BASE = "/api";

interface Message {
  id: number;
  connectionId: number;
  channel: string;
  direction: string;
  fromAddress: string | null;
  toAddress: string;
  subject: string | null;
  body: string;
  status: string;
  entityType: string | null;
  entityId: number | null;
  entityName: string | null;
  sentAt: string | null;
  createdAt: string;
}

interface MessageHistoryProps {
  entityType?: string;
  entityId?: number;
  channel?: string;
  connectionId?: number;
  limit?: number;
  compact?: boolean;
}

export default function MessageHistory({
  entityType,
  entityId,
  channel,
  connectionId,
  limit = 50,
  compact = false,
}: MessageHistoryProps) {
  const { token } = useAuth();

  const queryParams = new URLSearchParams();
  if (entityType) queryParams.set("entityType", entityType);
  if (entityId) queryParams.set("entityId", String(entityId));
  if (channel) queryParams.set("channel", channel);
  if (connectionId) queryParams.set("connectionId", String(connectionId));
  queryParams.set("limit", String(limit));

  const { data: messages = [], isLoading } = useQuery<Message[]>({
    queryKey: ["messaging-messages", entityType, entityId, channel, connectionId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/platform/messaging/messages?${queryParams}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!token,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin ml-2" />
        טוען היסטוריה...
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        אין הודעות להצגה
      </div>
    );
  }

  const statusIcon = (status: string) => {
    switch (status) {
      case "sent": return <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />;
      case "delivered": return <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />;
      case "received": return <ArrowDownLeft className="w-3.5 h-3.5 text-green-400" />;
      case "failed": return <XCircle className="w-3.5 h-3.5 text-red-400" />;
      default: return <Clock className="w-3.5 h-3.5 text-yellow-400" />;
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case "sent": return "נשלח";
      case "delivered": return "נמסר";
      case "read": return "נקרא";
      case "received": return "נקלט";
      case "failed": return "נכשל";
      default: return status;
    }
  };

  return (
    <ScrollArea className={compact ? "max-h-[300px]" : "max-h-[600px]"}>
      <div className="space-y-2 p-1">
        {messages.map(msg => (
          <Card key={msg.id} className="p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {msg.channel === "whatsapp" ? (
                  <MessageSquare className="w-4 h-4 text-green-500 flex-shrink-0" />
                ) : (
                  <Mail className="w-4 h-4 text-red-500 flex-shrink-0" />
                )}
                {msg.direction === "outbound" ? (
                  <ArrowUpRight className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                ) : (
                  <ArrowDownLeft className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                )}
                <span className="text-sm font-medium truncate" dir="ltr">
                  {msg.direction === "inbound" ? (msg.fromAddress || msg.toAddress) : msg.toAddress}
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {statusIcon(msg.status)}
                <span className="text-[11px] text-muted-foreground">{statusLabel(msg.status)}</span>
              </div>
            </div>

            {msg.subject && (
              <p className="text-sm font-medium mt-1.5 text-foreground">{msg.subject}</p>
            )}

            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{msg.body}</p>

            <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
              <span>
                {msg.sentAt
                  ? new Date(msg.sentAt).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })
                  : new Date(msg.createdAt).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })
                }
              </span>
              {msg.entityName && (
                <Badge variant="outline" className="text-[10px] h-5">{msg.entityName}</Badge>
              )}
            </div>
          </Card>
        ))}
      </div>
    </ScrollArea>
  );
}
