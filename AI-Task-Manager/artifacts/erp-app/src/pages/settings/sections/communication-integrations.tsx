import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button, Input, Label, Card } from "@/components/ui-components";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  MessageSquare, Mail, Phone, Send, CheckCircle2, XCircle,
  Wifi, WifiOff, TestTube, Loader2, Plus, Trash2, Settings2, Eye, EyeOff,
  Bot, Smartphone, RefreshCw, AlertTriangle
} from "lucide-react";
import { authFetch } from "@/lib/utils";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";

const API_BASE = "/api";

interface CommConnection {
  id: number;
  name: string;
  slug: string;
  isActive: boolean;
  baseUrl: string;
  authConfig: Record<string, string>;
  lastSyncAt: string | null;
  createdAt: string;
}

interface CommTemplate {
  id: number;
  name: string;
  slug: string;
  channel: string;
  subject: string | null;
  body: string;
  category: string | null;
  isActive: boolean;
}

const COMM_CHANNELS = [
  {
    id: "whatsapp",
    label: "WhatsApp",
    icon: MessageSquare,
    color: "text-green-400",
    bg: "bg-green-500/10 border-green-500/20",
    description: "שליחת הודעות WhatsApp ישירות ללקוחות, ספקים ועובדים",
    provider: "WhatsApp Business API / Green API / 360dialog",
    fields: [
      { key: "token", label: "API Token / Access Token", type: "password" as const, required: true },
      { key: "phoneNumberId", label: "Phone Number ID", type: "text" as const, required: true },
      { key: "businessAccountId", label: "Business Account ID", type: "text" as const },
      { key: "verifyToken", label: "Webhook Verify Token", type: "text" as const },
    ],
    baseUrl: "https://graph.facebook.com/v18.0",
    defaultSlug: "whatsapp",
  },
  {
    id: "telegram",
    label: "Telegram",
    icon: Send,
    color: "text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/20",
    description: "שליחת הודעות אוטומטיות ועדכונים דרך Telegram Bot",
    provider: "Telegram Bot API",
    fields: [
      { key: "botToken", label: "Bot Token (מ-@BotFather)", type: "password" as const, required: true },
      { key: "defaultChatId", label: "Chat ID ברירת מחדל", type: "text" as const },
      { key: "allowedChatIds", label: "Chat IDs מורשים (פסיק מפריד)", type: "text" as const },
    ],
    baseUrl: "https://api.telegram.org",
    defaultSlug: "telegram-bot",
  },
  {
    id: "sms",
    label: "SMS",
    icon: Smartphone,
    color: "text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/20",
    description: "שליחת SMS ללקוחות ועובדים דרך ספק SMS ישראלי",
    provider: "Vonage / Twilio",
    fields: [
      {
        key: "provider", label: "ספק SMS", type: "select" as const,
        options: [
          { value: "vonage", label: "Vonage / Nexmo" },
          { value: "twilio", label: "Twilio" },
        ]
      },
      { key: "accountSid", label: "Account SID (Twilio)", type: "password" as const },
      { key: "authToken", label: "Auth Token (Twilio)", type: "password" as const },
      { key: "apiKey", label: "API Key (Vonage)", type: "password" as const },
      { key: "apiSecret", label: "API Secret (Vonage)", type: "password" as const },
      { key: "fromNumber", label: "מספר שולח / From Number", type: "text" as const, required: true },
    ],
    baseUrl: "https://api.twilio.com",
    defaultSlug: "sms",
  },
  {
    id: "email",
    label: "אימייל",
    icon: Mail,
    color: "text-red-400",
    bg: "bg-red-500/10 border-red-500/20",
    description: "שליחת אימיילים אוטומטיים — חשבוניות, תזכורות, עדכונים",
    provider: "Gmail SMTP / SendGrid / Mailgun",
    fields: [
      {
        key: "provider", label: "ספק", type: "select" as const,
        options: [
          { value: "gmail_smtp", label: "Gmail SMTP" },
          { value: "sendgrid", label: "SendGrid" },
          { value: "mailgun", label: "Mailgun" },
          { value: "smtp", label: "SMTP כללי" },
        ]
      },
      { key: "username", label: "כתובת אימייל / API User", type: "text" as const, required: true },
      { key: "password", label: "סיסמה / App Password / API Key", type: "password" as const, required: true },
      { key: "fromName", label: "שם שולח", type: "text" as const },
      { key: "smtpHost", label: "SMTP Host (אם ידני)", type: "text" as const },
      { key: "smtpPort", label: "SMTP Port", type: "text" as const },
    ],
    baseUrl: "https://smtp.gmail.com",
    defaultSlug: "gmail",
  },
];

function MaskedValue({ value }: { value: string }) {
  const [show, setShow] = useState(false);
  if (!value) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <span className="flex items-center gap-1 text-xs font-mono">
      {show ? value : "••••••••"}
      <button onClick={() => setShow(v => !v)} className="opacity-60 hover:opacity-100">
        {show ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
      </button>
    </span>
  );
}

function ChannelSetupForm({
  channel, connection, onSave, onDelete, isSaving, isTesting, onTest
}: {
  channel: typeof COMM_CHANNELS[0];
  connection?: CommConnection;
  onSave: (data: { name: string; slug: string; baseUrl: string; authConfig: Record<string, string> }) => void;
  onDelete?: () => void;
  isSaving: boolean;
  isTesting: boolean;
  onTest: () => void;
}) {
  const [form, setForm] = useState<Record<string, string>>(
    channel.fields.reduce((acc, f) => ({ ...acc, [f.key]: connection?.authConfig?.[f.key] || "" }), {})
  );
  const [connName, setConnName] = useState(connection?.name || `${channel.label} - ייצור המפעל`);
  const [baseUrl, setBaseUrl] = useState(connection?.baseUrl || channel.baseUrl);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ name: connName, slug: channel.defaultSlug, baseUrl, authConfig: form });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>שם החיבור</Label>
          <Input value={connName} onChange={e => setConnName(e.target.value)} required />
        </div>
        <div>
          <Label>כתובת API (Base URL)</Label>
          <Input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} dir="ltr" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {channel.fields.map(field => (
          <div key={field.key}>
            <Label>{field.label}{field.required && <span className="text-red-400 mr-1">*</span>}</Label>
            {field.type === "select" ? (
              <select
                value={form[field.key]}
                onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))}
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
              >
                <option value="">בחר...</option>
                {field.options?.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            ) : (
              <Input
                type={field.type}
                value={form[field.key]}
                onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))}
                dir="ltr"
                placeholder={field.required ? "שדה חובה" : "אופציונלי"}
              />
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-2 pt-2">
        <Button type="submit" disabled={isSaving} className="flex items-center gap-2">
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          {connection ? "עדכן חיבור" : "שמור חיבור"}
        </Button>
        {connection && (
          <>
            <Button type="button" variant="outline" onClick={onTest} disabled={isTesting} className="flex items-center gap-2">
              {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <TestTube className="w-4 h-4" />}
              בדוק חיבור
            </Button>
            <Button type="button" variant="outline" onClick={onDelete} className="flex items-center gap-2 text-red-400 border-red-500/20 hover:bg-red-500/10">
              <Trash2 className="w-4 h-4" />
              מחק
            </Button>
          </>
        )}
      </div>
    </form>
  );
}

function TemplatesTab({ channel }: { channel: string }) {
  const { token } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ name: "", body: "", subject: "", category: "" });

  const { data: templates = [] } = useQuery<CommTemplate[]>({
    queryKey: ["messaging-templates", channel],
    queryFn: async () => {
      const r = await authFetch(`${API_BASE}/platform/messaging/templates?channel=${channel}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) return [];
      const data = await r.json();
      return Array.isArray(data) ? (data as CommTemplate[]).filter(t => !channel || t.channel === channel) : [];
    },
    enabled: !!token,
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; body: string; subject: string; category: string }) => {
      const slug = data.name
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9\u0590-\u05ff-]/g, "")
        .slice(0, 60) + "-" + Date.now().toString(36);
      const r = await authFetch(`${API_BASE}/platform/messaging/templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...data, slug, channel }),
      });
      if (!r.ok) throw new Error("שגיאה ביצירת תבנית");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messaging-templates"] });
      setShowCreate(false);
      setNewTemplate({ name: "", body: "", subject: "", category: "" });
      toast({ title: "תבנית נוצרה בהצלחה" });
    },
    onError: () => toast({ title: "שגיאה", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await authFetch(`${API_BASE}/platform/messaging/templates/${id}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token}` },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messaging-templates"] });
      toast({ title: "תבנית נמחקה" });
    },
  });

  const CHANNEL_LABEL: Record<string, string> = {
    whatsapp: "WhatsApp", telegram: "Telegram", sms: "SMS", gmail: "אימייל"
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">תבניות הודעה מוכנות לשימוש עבור {CHANNEL_LABEL[channel] || channel}</p>
        <Button size="sm" onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-2">
          <Plus className="w-4 h-4" />
          תבנית חדשה
        </Button>
      </div>

      {showCreate && (
        <Card className="p-4 space-y-3 border-primary/20">
          <h4 className="font-medium text-sm">תבנית חדשה</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>שם התבנית</Label>
              <Input value={newTemplate.name} onChange={e => setNewTemplate(t => ({ ...t, name: e.target.value }))} />
            </div>
            <div>
              <Label>קטגוריה</Label>
              <Input value={newTemplate.category} onChange={e => setNewTemplate(t => ({ ...t, category: e.target.value }))} placeholder="תזכורת / עדכון / שיווק..." />
            </div>
          </div>
          {channel === "gmail" && (
            <div>
              <Label>נושא</Label>
              <Input value={newTemplate.subject} onChange={e => setNewTemplate(t => ({ ...t, subject: e.target.value }))} />
            </div>
          )}
          <div>
            <Label>תוכן ההודעה</Label>
            <textarea
              value={newTemplate.body}
              onChange={e => setNewTemplate(t => ({ ...t, body: e.target.value }))}
              className="w-full h-24 bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
              placeholder="שלום {{שם_לקוח}}, ..."
            />
            <p className="text-xs text-muted-foreground mt-1">השתמש ב-&#123;&#123;שם_שדה&#125;&#125; עבור משתנים דינמיים</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => createMutation.mutate(newTemplate)} disabled={createMutation.isPending || !newTemplate.name || !newTemplate.body}>
              שמור
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowCreate(false)}>ביטול</Button>
          </div>
        </Card>
      )}

      <div className="space-y-2">
        {templates.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            <Bot className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p>אין תבניות עדיין</p>
          </div>
        ) : (
          templates.map(tmpl => (
            <div key={tmpl.id} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card/50 hover:bg-card transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{tmpl.name}</span>
                  {tmpl.category && <Badge variant="outline" className="text-xs">{tmpl.category}</Badge>}
                  {!tmpl.isActive && <Badge variant="outline" className="text-xs text-muted-foreground">לא פעיל</Badge>}
                </div>
                {tmpl.subject && <p className="text-xs text-muted-foreground mt-0.5">נושא: {tmpl.subject}</p>}
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{tmpl.body}</p>
              </div>
              <button
                onClick={() => deleteMutation.mutate(tmpl.id)}
                className="text-muted-foreground hover:text-red-400 transition-colors flex-shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function CommunicationIntegrationsSection() {
  const { token } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [savingChannel, setSavingChannel] = useState<string | null>(null);
  const [testingChannel, setTestingChannel] = useState<string | null>(null);
  const [activeChannelTab, setActiveChannelTab] = useState("whatsapp");

  const { data: connections = [], isLoading } = useQuery<CommConnection[]>({
    queryKey: ["comm-integration-connections"],
    queryFn: async () => {
      const r = await authFetch(`${API_BASE}/integrations/connections`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) return [];
      const all = await r.json();
      return Array.isArray(all) ? (all as CommConnection[]).filter(c =>
        ["whatsapp", "whatsapp-api", "telegram", "telegram-bot", "sms", "twilio", "nexmo", "vonage", "gmail"].includes(c.slug)
      ) : [];
    },
    enabled: !!token,
  });

  interface HubStatus { connections: CommConnection[]; stats: Record<string, { total: number; sent: number; received: number; failed: number }>; totalMessages: number; }
  const { data: hubStatus } = useQuery<HubStatus>({
    queryKey: ["messaging-hub-status"],
    queryFn: async () => {
      const r = await authFetch(`${API_BASE}/platform/messaging/hub-status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) return { connections: [], stats: {}, totalMessages: 0 };
      return r.json();
    },
    enabled: !!token,
  });

  const getConnectionForChannel = (channelId: string) => {
    const slugMap: Record<string, string[]> = {
      whatsapp: ["whatsapp", "whatsapp-api"],
      telegram: ["telegram-bot", "telegram"],
      sms: ["sms", "twilio", "nexmo", "vonage"],
      email: ["gmail"],
    };
    const slugs = slugMap[channelId] || [channelId];
    return connections.find(c => slugs.includes(c.slug));
  };

  const saveConnection = async (channelId: string, data: { name: string; slug: string; baseUrl: string; authConfig: Record<string, string> }) => {
    setSavingChannel(channelId);
    try {
      const existing = getConnectionForChannel(channelId);
      const endpoint = existing
        ? `${API_BASE}/integrations/connections/${existing.id}`
        : `${API_BASE}/integrations/connections`;
      const method = existing ? "PUT" : "POST";

      const payload = existing ? {
        name: data.name,
        baseUrl: data.baseUrl,
        authConfig: data.authConfig,
        isActive: true,
      } : {
        name: data.name,
        slug: data.slug,
        serviceType: "messaging",
        baseUrl: data.baseUrl,
        authMethod: "bearer",
        authConfig: data.authConfig,
        defaultHeaders: {},
        isActive: true,
      };

      const r = await authFetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error("שמירה נכשלה");
      queryClient.invalidateQueries({ queryKey: ["comm-integration-connections"] });
      queryClient.invalidateQueries({ queryKey: ["messaging-hub-status"] });
      toast({ title: "החיבור נשמר בהצלחה", description: `חיבור ${data.name} עודכן` });
    } catch (err) {
      const message = err instanceof Error ? err.message : "שגיאה לא ידועה";
      toast({ title: "שגיאה בשמירה", description: message, variant: "destructive" });
    }
    setSavingChannel(null);
  };

  const testConnection = async (channelId: string) => {
    const conn = getConnectionForChannel(channelId);
    if (!conn) return;
    setTestingChannel(channelId);
    try {
      const r = await authFetch(`${API_BASE}/platform/messaging/test/${conn.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      const result = await r.json();
      if (result.success) {
        toast({ title: "חיבור תקין", description: result.message || "החיבור פועל" });
      } else {
        toast({ title: "חיבור נכשל", description: result.message, variant: "destructive" });
      }
    } catch {
      toast({ title: "שגיאה", variant: "destructive" });
    }
    setTestingChannel(null);
  };

  const deleteConnection = async (channelId: string) => {
    const conn = getConnectionForChannel(channelId);
    if (!conn) return;
    const confirmed = await globalConfirm("האם למחוק את החיבור?", `מחיקת ${conn.name} תנתק את ערוץ ${channelId}`);
    if (!confirmed) return;
    await authFetch(`${API_BASE}/integrations/connections/${conn.id}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` },
    });
    queryClient.invalidateQueries({ queryKey: ["comm-integration-connections"] });
    toast({ title: "החיבור נמחק" });
  };

  const totalMessages = hubStatus?.totalMessages || 0;
  const activeConnsCount = connections.filter(c => c.isActive).length;

  return (
    <div className="p-4 md:p-6 space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500/20 to-blue-500/20 border border-green-500/20 flex items-center justify-center">
          <MessageSquare className="w-5 h-5 text-green-400" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-foreground">אינטגרציות תקשורת</h2>
          <p className="text-xs text-muted-foreground">חיבור ערוצי תקשורת — WhatsApp, Telegram, SMS, אימייל</p>
        </div>
        <div className="mr-auto flex gap-3">
          <div className="text-center">
            <div className="text-lg font-bold text-green-400">{activeConnsCount}</div>
            <div className="text-xs text-muted-foreground">ערוצים פעילים</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-blue-400">{totalMessages.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">הודעות נשלחו</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {COMM_CHANNELS.map(ch => {
          const conn = getConnectionForChannel(ch.id);
          const stats = hubStatus?.stats?.[ch.id] || {};
          const isActive = !!conn?.isActive;
          return (
            <button
              key={ch.id}
              onClick={() => setActiveChannelTab(ch.id)}
              className={`p-3 rounded-xl border text-right transition-all ${
                activeChannelTab === ch.id
                  ? ch.bg + " border-current/40"
                  : "border-border bg-card/50 hover:bg-card"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <ch.icon className={`w-4 h-4 ${ch.color}`} />
                <span className="font-medium text-sm">{ch.label}</span>
                {isActive ? (
                  <Wifi className="w-3 h-3 text-green-400 mr-auto" />
                ) : (
                  <WifiOff className="w-3 h-3 text-muted-foreground mr-auto" />
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {isActive ? (
                  <span className="text-green-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> מחובר
                    {stats.sent > 0 && ` · ${stats.sent} הודעות`}
                  </span>
                ) : (
                  <span className="text-muted-foreground flex items-center gap-1">
                    <XCircle className="w-3 h-3" /> לא מוגדר
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {COMM_CHANNELS.map(ch => {
        if (activeChannelTab !== ch.id) return null;
        const conn = getConnectionForChannel(ch.id);
        return (
          <div key={ch.id} className="space-y-4">
            <div className={`rounded-xl border p-4 ${ch.bg}`}>
              <div className="flex items-center gap-3 mb-3">
                <ch.icon className={`w-5 h-5 ${ch.color}`} />
                <div>
                  <h3 className="font-semibold text-sm">{ch.label}</h3>
                  <p className="text-xs text-muted-foreground">{ch.description}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">ספק: <span className="text-foreground/80">{ch.provider}</span></p>
                </div>
              </div>
              {conn && (
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-green-400" />
                  <span className="text-xs text-green-400">מחובר: {conn.name}</span>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs text-muted-foreground">
                    {conn.lastSyncAt ? `בדיקה אחרונה: ${new Date(conn.lastSyncAt).toLocaleString("he-IL")}` : "לא נבדק"}
                  </span>
                </div>
              )}
              {!conn && (
                <div className="flex items-center gap-2 mb-3 text-amber-400">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span className="text-xs">ערוץ לא מוגדר — מלא את הפרטים מטה כדי להפעיל</span>
                </div>
              )}
              <ChannelSetupForm
                channel={ch}
                connection={conn}
                onSave={(data) => saveConnection(ch.id, data)}
                onDelete={() => deleteConnection(ch.id)}
                isSaving={savingChannel === ch.id}
                isTesting={testingChannel === ch.id}
                onTest={() => testConnection(ch.id)}
              />
            </div>

            <Tabs defaultValue="templates">
              <TabsList className="bg-card border border-border">
                <TabsTrigger value="templates">תבניות הודעה</TabsTrigger>
                <TabsTrigger value="history">היסטוריה</TabsTrigger>
              </TabsList>
              <TabsContent value="templates" className="mt-3">
                <Card className="p-4">
                  <TemplatesTab channel={ch.id === "email" ? "gmail" : ch.id} />
                </Card>
              </TabsContent>
              <TabsContent value="history" className="mt-3">
                <Card className="p-4">
                  <div className="text-sm text-muted-foreground text-center py-6">
                    <RefreshCw className="w-6 h-6 mx-auto mb-2 opacity-40" />
                    <p>היסטוריית הודעות זמינה בלשונית <strong>הודעות</strong> בהגדרות הראשיות</p>
                  </div>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        );
      })}
    </div>
  );
}
