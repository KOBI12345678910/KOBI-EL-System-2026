import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Send, Mail, MessageSquare, Phone } from "lucide-react";

const API_BASE = "/api";

type Channel = "whatsapp" | "gmail" | "sms" | "telegram";

interface Connection {
  id: number;
  name: string;
  slug: string;
  isActive: boolean;
}

interface SendMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channel?: Channel;
  defaultTo?: string;
  entityType?: string;
  entityId?: number;
  entityName?: string;
}

const CHANNEL_SLUGS: Record<Channel, string[]> = {
  whatsapp: ["whatsapp", "whatsapp-api"],
  gmail: ["gmail"],
  sms: ["sms", "twilio", "nexmo", "vonage"],
  telegram: ["telegram", "telegram-bot"],
};

const CHANNEL_LABELS: Record<Channel, string> = {
  whatsapp: "וואטסאפ",
  gmail: "Gmail",
  sms: "SMS",
  telegram: "Telegram",
};

const CHANNEL_PLACEHOLDER: Record<Channel, string> = {
  whatsapp: "+972501234567",
  gmail: "user@example.com",
  sms: "+972501234567",
  telegram: "Chat ID או @username",
};

const CHANNEL_TO_LABEL: Record<Channel, string> = {
  whatsapp: "מספר טלפון",
  gmail: "כתובת אימייל",
  sms: "מספר טלפון",
  telegram: "Chat ID / @username",
};

function ChannelIcon({ channel, className }: { channel: Channel; className?: string }) {
  if (channel === "whatsapp") return <MessageSquare className={className || "w-5 h-5 text-green-500"} />;
  if (channel === "gmail") return <Mail className={className || "w-5 h-5 text-red-500"} />;
  if (channel === "sms") return <Phone className={className || "w-5 h-5 text-orange-500"} />;
  return <Send className={className || "w-5 h-5 text-sky-500"} />;
}

export default function SendMessageDialog({
  open,
  onOpenChange,
  channel: defaultChannel,
  defaultTo = "",
  entityType,
  entityId,
  entityName,
}: SendMessageDialogProps) {
  const { token } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [channel, setChannel] = useState<Channel>(defaultChannel || "whatsapp");
  const [connectionId, setConnectionId] = useState<string>("");
  const [to, setTo] = useState(defaultTo);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [cc, setCc] = useState("");

  useEffect(() => {
    if (defaultChannel) {
      setChannel(defaultChannel);
      setConnectionId("");
    }
  }, [defaultChannel]);

  useEffect(() => {
    setTo(defaultTo);
  }, [defaultTo]);

  const { data: connections = [] } = useQuery<Connection[]>({
    queryKey: ["messaging-connections"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/integrations/connections`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      const all = await res.json();
      const allSlugs = Object.values(CHANNEL_SLUGS).flat();
      return all.filter((c: Connection) => allSlugs.includes(c.slug) && c.isActive);
    },
    enabled: open && !!token,
  });

  const filteredConnections = connections.filter(c =>
    CHANNEL_SLUGS[channel]?.includes(c.slug)
  );

  const sendMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/platform/messaging/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          connectionId: Number(connectionId),
          channel,
          to,
          subject: channel === "gmail" ? subject : undefined,
          message,
          cc: channel === "gmail" ? cc : undefined,
          entityType,
          entityId,
          entityName,
        }),
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "נשלח בהצלחה", description: `הודעת ${CHANNEL_LABELS[channel]} נשלחה` });
        queryClient.invalidateQueries({ queryKey: ["messaging-messages"] });
        queryClient.invalidateQueries({ queryKey: ["messaging-activity"] });
        onOpenChange(false);
        resetForm();
      } else {
        toast({ title: "שגיאה בשליחה", description: data.error, variant: "destructive" });
      }
    },
    onError: (err: Error) => {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setTo(defaultTo);
    setSubject("");
    setMessage("");
    setCc("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ChannelIcon channel={channel} />
            שליחת הודעת {CHANNEL_LABELS[channel]}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!defaultChannel && (
            <div className="space-y-1.5">
              <Label>ערוץ</Label>
              <Select value={channel} onValueChange={(v: string) => { setChannel(v as Channel); setConnectionId(""); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp">
                    <span className="flex items-center gap-2"><MessageSquare className="w-4 h-4 text-green-500" /> וואטסאפ</span>
                  </SelectItem>
                  <SelectItem value="gmail">
                    <span className="flex items-center gap-2"><Mail className="w-4 h-4 text-red-500" /> Gmail</span>
                  </SelectItem>
                  <SelectItem value="sms">
                    <span className="flex items-center gap-2"><Phone className="w-4 h-4 text-orange-500" /> SMS</span>
                  </SelectItem>
                  <SelectItem value="telegram">
                    <span className="flex items-center gap-2"><Send className="w-4 h-4 text-sky-500" /> Telegram</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>חיבור</Label>
            <Select value={connectionId} onValueChange={setConnectionId}>
              <SelectTrigger>
                <SelectValue placeholder="בחר חיבור..." />
              </SelectTrigger>
              <SelectContent>
                {filteredConnections.map(c => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {filteredConnections.length === 0 && (
              <p className="text-xs text-muted-foreground">
                אין חיבורי {CHANNEL_LABELS[channel]} פעילים. הגדר חיבור בהגדרות → אינטגרציות.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>{CHANNEL_TO_LABEL[channel]}</Label>
            <Input
              value={to}
              onChange={e => setTo(e.target.value)}
              placeholder={CHANNEL_PLACEHOLDER[channel]}
              dir="ltr"
            />
          </div>

          {channel === "gmail" && (
            <>
              <div className="space-y-1.5">
                <Label>נושא</Label>
                <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="נושא האימייל" />
              </div>
              <div className="space-y-1.5">
                <Label>CC (אופציונלי)</Label>
                <Input value={cc} onChange={e => setCc(e.target.value)} placeholder="cc@example.com" dir="ltr" title="אימייל" />
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label>הודעה</Label>
            <Textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder={channel === "gmail" ? "תוכן האימייל..." : "הקלד הודעה..."}
              rows={5}
            />
          </div>

          {entityName && (
            <p className="text-xs text-muted-foreground">
              מקושר ל: <span className="font-medium">{entityName}</span>
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>ביטול</Button>
          <Button
            onClick={() => sendMutation.mutate()}
            disabled={!connectionId || !to || !message || sendMutation.isPending}
          >
            {sendMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin ml-2" />
            ) : (
              <Send className="w-4 h-4 ml-2" />
            )}
            שלח
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
