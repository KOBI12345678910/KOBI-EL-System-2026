import { useState, useEffect } from "react";
import { MessageSquare, Mail, Phone, Send, Clock, CheckCheck, Check, AlertCircle, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { authFetch } from "@/lib/utils";

interface TimelineMessage {
  id: number;
  channel: string;
  direction: string;
  from_address: string;
  to_address: string;
  subject?: string;
  body: string;
  status: string;
  sent_at?: string;
  delivered_at?: string;
  read_at?: string;
  created_at: string;
  connection_name?: string;
}

interface TimelineStats {
  total: number;
  whatsapp: number;
  email: number;
  sms: number;
  inbound: number;
  outbound: number;
  read_count: number;
  last_contact_at?: string;
}

interface Props {
  entityType: "lead" | "customer";
  entityId: number;
  className?: string;
}

const CHANNEL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  whatsapp: MessageSquare,
  gmail: Mail,
  email: Mail,
  sms: Phone,
};

const CHANNEL_COLORS: Record<string, string> = {
  whatsapp: "bg-green-500/20 text-green-400 border-green-500/30",
  gmail: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  email: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  sms: "bg-amber-500/20 text-amber-400 border-amber-500/30",
};

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  gmail: "אימייל",
  email: "אימייל",
  sms: "SMS",
};

function StatusIcon({ status, readAt, deliveredAt }: { status: string; readAt?: string; deliveredAt?: string }) {
  if (readAt || status === "read") return <CheckCheck className="w-3.5 h-3.5 text-blue-400" />;
  if (deliveredAt || status === "delivered") return <CheckCheck className="w-3.5 h-3.5 text-muted-foreground" />;
  if (status === "sent") return <Check className="w-3.5 h-3.5 text-muted-foreground" />;
  if (status === "failed") return <AlertCircle className="w-3.5 h-3.5 text-red-400" />;
  return <Clock className="w-3.5 h-3.5 text-muted-foreground" />;
}

function formatTime(ts?: string): string {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return "עכשיו";
  if (diff < 3600000) return `לפני ${Math.floor(diff / 60000)} דקות`;
  if (diff < 86400000) return `לפני ${Math.floor(diff / 3600000)} שעות`;
  if (diff < 604800000) return `לפני ${Math.floor(diff / 86400000)} ימים`;
  return d.toLocaleDateString("he-IL");
}

export default function CommunicationTimeline({ entityType, entityId, className = "" }: Props) {
  const [messages, setMessages] = useState<TimelineMessage[]>([]);
  const [stats, setStats] = useState<TimelineStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterChannel, setFilterChannel] = useState("all");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [page, setPage] = useState(1);
  const PER_PAGE = 20;

  const load = async () => {
    setLoading(true);
    try {
      const [msgsRes, statsRes] = await Promise.all([
        authFetch(`/api/crm/timeline/${entityType}/${entityId}`),
        authFetch(`/api/crm/timeline/${entityType}/${entityId}/stats`),
      ]);
      if (msgsRes.ok) {
        const data = await msgsRes.json();
        setMessages(Array.isArray(data) ? data : []);
      }
      if (statsRes.ok) {
        setStats(await statsRes.json());
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    if (entityId) load();
  }, [entityType, entityId]);

  const filtered = messages.filter(m => filterChannel === "all" || m.channel === filterChannel);
  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const toggleExpand = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (loading) {
    return (
      <div className={`flex items-center justify-center py-8 ${className}`}>
        <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
        <span className="mr-2 text-sm text-muted-foreground">טוען ציר זמן...</span>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: "סה\"כ", value: stats.total, color: "text-foreground" },
            { label: "WhatsApp", value: stats.whatsapp, color: "text-green-400" },
            { label: "אימייל", value: stats.email, color: "text-blue-400" },
            { label: "SMS", value: stats.sms, color: "text-amber-400" },
          ].map((s, i) => (
            <div key={i} className="bg-card border rounded-lg p-2 text-center">
              <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {["all", "whatsapp", "gmail", "sms"].map(ch => (
          <button
            key={ch}
            onClick={() => { setFilterChannel(ch); setPage(1); }}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${filterChannel === ch ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:bg-muted"}`}
          >
            {ch === "all" ? "הכל" : CHANNEL_LABELS[ch] || ch}
          </button>
        ))}
        <button onClick={load} className="mr-auto p-1 hover:bg-muted rounded text-muted-foreground">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {paginated.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">אין הודעות בציר הזמן</p>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute right-5 top-0 bottom-0 w-px bg-border" />
          <div className="space-y-3">
            {paginated.map(msg => {
              const Icon = CHANNEL_ICONS[msg.channel] || MessageSquare;
              const colorClass = CHANNEL_COLORS[msg.channel] || "bg-muted/20 text-muted-foreground border-muted";
              const isInbound = msg.direction === "inbound";
              const isExpanded = expanded.has(msg.id);
              const bodyPreview = msg.body?.slice(0, 100) + (msg.body?.length > 100 && !isExpanded ? "..." : "");

              return (
                <div key={msg.id} className="flex gap-3 relative">
                  <div className={`relative z-10 flex-shrink-0 w-8 h-8 rounded-full border flex items-center justify-center ${colorClass}`}>
                    {isInbound ? <Icon className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
                  </div>
                  <div className={`flex-1 bg-card border rounded-lg p-3 min-w-0 ${isInbound ? "border-muted" : "border-primary/20"}`}>
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium border ${colorClass}`}>
                          {CHANNEL_LABELS[msg.channel] || msg.channel}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {isInbound ? "נכנס" : "יוצא"}
                        </span>
                        {msg.subject && (
                          <span className="text-xs font-medium text-foreground truncate max-w-[200px]">{msg.subject}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <StatusIcon status={msg.status} readAt={msg.read_at} deliveredAt={msg.delivered_at} />
                        <span className="text-xs text-muted-foreground">{formatTime(msg.created_at)}</span>
                      </div>
                    </div>
                    <div className="mt-2">
                      <p className="text-sm text-foreground/90 break-words whitespace-pre-wrap leading-relaxed">
                        {isExpanded ? msg.body : bodyPreview}
                      </p>
                      {msg.body?.length > 100 && (
                        <button
                          onClick={() => toggleExpand(msg.id)}
                          className="flex items-center gap-1 mt-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                          {isExpanded ? <><ChevronUp className="w-3 h-3" />הצג פחות</> : <><ChevronDown className="w-3 h-3" />הצג עוד</>}
                        </button>
                      )}
                    </div>
                    <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
                      {msg.from_address && <span>מ: {msg.from_address}</span>}
                      {msg.to_address && <span>אל: {msg.to_address}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn btn-xs btn-outline">הקודם</button>
          <span className="text-xs text-muted-foreground py-1">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="btn btn-xs btn-outline">הבא</button>
        </div>
      )}
    </div>
  );
}
