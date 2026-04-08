import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import MessageHistory from "@/components/messaging/message-history";
import SendMessageDialog from "@/components/messaging/send-message-dialog";
import { authFetch } from "@/lib/utils";
import {
  Plug, Mail, MessageSquare, CheckCircle2, XCircle,
  Wifi, WifiOff, Activity, Send, TestTube, Loader2,
  Clock, BarChart3, ArrowUpRight, ArrowDownLeft,
  FileText, Plus, RefreshCw, Phone,
} from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";

const API_BASE = "/api";

type Channel = "whatsapp" | "gmail" | "sms" | "telegram";

interface HubConnection {
  id: number;
  name: string;
  slug: string;
  isActive: boolean;
  lastSyncAt: string | null;
  channel: string;
}

interface HubStatus {
  connections: HubConnection[];
  stats: Record<string, { total: number; sent: number; received: number; failed: number; lastSent?: string }>;
  totalMessages: number;
}

interface Template {
  id: number;
  name: string;
  slug: string;
  channel: string;
  subject: string | null;
  body: string;
  category: string | null;
  isActive: boolean;
}

const SLUG_TO_CHANNEL: Record<string, Channel> = {
  whatsapp: "whatsapp",
  "whatsapp-api": "whatsapp",
  gmail: "gmail",
  sms: "sms",
  twilio: "sms",
  nexmo: "sms",
  vonage: "sms",
  telegram: "telegram",
  "telegram-bot": "telegram",
};

function getConnectionChannel(slug: string): Channel {
  return SLUG_TO_CHANNEL[slug] ?? "whatsapp";
}

type ChannelStat = { sent: number; received: number; failed: number };

interface ChannelCardProps {
  label: string;
  description: string;
  icon: React.ReactNode;
  iconBg: string;
  conns: HubConnection[];
  stat: ChannelStat;
  channel: Channel;
  testingId: number | null;
  syncingId?: number | null;
  onTest: (id: number) => void;
  onSync?: (id: number) => void;
  onSend: (channel: Channel) => void;
  sendColor: string;
}

function ChannelCard({
  label, description, icon, iconBg, conns, stat,
  channel, testingId, syncingId, onTest, onSync, onSend, sendColor,
}: ChannelCardProps) {
  const isConnected = conns.some(c => c.isActive);
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <div className={`w-12 h-12 ${iconBg} rounded-xl flex items-center justify-center`}>
          {icon}
        </div>
        {isConnected ? (
          <Badge className="bg-green-500/10 text-green-400 border-green-500/20">מחובר</Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">לא מוגדר</Badge>
        )}
      </div>
      <h3 className="font-semibold mb-1">{label}</h3>
      <p className="text-xs text-muted-foreground mb-3">{description}</p>
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
        <BarChart3 className="w-3.5 h-3.5" />
        <span className="flex items-center gap-0.5"><ArrowUpRight className="w-3 h-3" />{stat.sent} נשלחו</span>
        <span className="flex items-center gap-0.5"><ArrowDownLeft className="w-3 h-3" />{stat.received} נקלטו</span>
        {(stat.failed || 0) > 0 && (
          <span className="text-red-400">• {stat.failed} נכשלו</span>
        )}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {conns.map(c => (
          <div key={c.id} className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="text-xs gap-1"
              onClick={() => onTest(c.id)}
              disabled={testingId === c.id}
            >
              {testingId === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <TestTube className="w-3 h-3" />}
              בדוק
            </Button>
            {onSync && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs gap-1"
                onClick={() => onSync(c.id)}
                disabled={syncingId === c.id}
              >
                {syncingId === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                סנכרן
              </Button>
            )}
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          className={`text-xs gap-1 ${sendColor}`}
          onClick={() => onSend(channel)}
          disabled={conns.length === 0}
        >
          <Send className="w-3 h-3" />
          שלח
        </Button>
      </div>
    </Card>
  );
}

export default function IntegrationHubSection() {
  const { token } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [testingId, setTestingId] = useState<number | null>(null);
  const [syncingId, setSyncingId] = useState<number | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendChannel, setSendChannel] = useState<Channel>("whatsapp");

  const { data: hubStatus, isLoading: hubLoading } = useQuery<HubStatus>({
    queryKey: ["messaging-hub-status"],
    queryFn: async () => {
      const res = await authFetch(`${API_BASE}/platform/messaging/hub-status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return { connections: [], stats: {}, totalMessages: 0 };
      return res.json();
    },
    enabled: !!token,
  });

  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ["messaging-templates"],
    queryFn: async () => {
      const res = await authFetch(`${API_BASE}/platform/messaging/templates`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!token,
  });

  const testConnection = async (connectionId: number) => {
    setTestingId(connectionId);
    try {
      const res = await authFetch(`${API_BASE}/platform/messaging/test/${connectionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      const result = await res.json();
      queryClient.invalidateQueries({ queryKey: ["messaging-hub-status"] });
      if (result.success) {
        toast({ title: "חיבור תקין", description: result.message });
      } else {
        toast({ title: "חיבור נכשל", description: result.message, variant: "destructive" });
      }
    } catch {
      toast({ title: "שגיאה", description: "שגיאת תקשורת", variant: "destructive" });
    }
    setTestingId(null);
  };

  const syncGmailInbox = async (connectionId: number) => {
    setSyncingId(connectionId);
    try {
      const res = await authFetch(`${API_BASE}/platform/messaging/sync/gmail/${connectionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      const result = await res.json();
      queryClient.invalidateQueries({ queryKey: ["messaging-hub-status"] });
      if (result.success) {
        toast({ title: "סנכרון הושלם", description: `${result.fetched} הודעות חדשות נקלטו` });
      } else {
        toast({ title: "סנכרון נכשל", description: result.errors?.join(", ") || "שגיאה", variant: "destructive" });
      }
    } catch {
      toast({ title: "שגיאה", description: "שגיאת תקשורת", variant: "destructive" });
    }
    setSyncingId(null);
  };

  const openSendDialog = (channel: Channel) => {
    setSendChannel(channel);
    setSendOpen(true);
  };

  const connections = hubStatus?.connections || [];
  const stats = hubStatus?.stats || {};

  const whatsappConns = connections.filter(c => getConnectionChannel(c.slug) === "whatsapp");
  const gmailConns = connections.filter(c => getConnectionChannel(c.slug) === "gmail");
  const smsConns = connections.filter(c => getConnectionChannel(c.slug) === "sms");
  const telegramConns = connections.filter(c => getConnectionChannel(c.slug) === "telegram");

  const smsStat1 = stats.sms || { sent: 0, received: 0, failed: 0 };
  const smsStat2 = stats.twilio || { sent: 0, received: 0, failed: 0 };
  const smsStat3 = stats.nexmo || { sent: 0, received: 0, failed: 0 };
  const smsStat4 = stats.vonage || { sent: 0, received: 0, failed: 0 };
  const smsCombined: ChannelStat = {
    sent: smsStat1.sent + smsStat2.sent + smsStat3.sent + smsStat4.sent,
    received: smsStat1.received + smsStat2.received + smsStat3.received + smsStat4.received,
    failed: smsStat1.failed + smsStat2.failed + smsStat3.failed + smsStat4.failed,
  };

  const telegramStat = stats.telegram || { sent: 0, received: 0, failed: 0 };
  const telegramBot = stats["telegram-bot"] || { sent: 0, received: 0, failed: 0 };
  const telegramCombined: ChannelStat = {
    sent: telegramStat.sent + telegramBot.sent,
    received: telegramStat.received + telegramBot.received,
    failed: telegramStat.failed + telegramBot.failed,
  };

  return (
    <div className="p-6 max-w-6xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold flex items-center gap-2">
            <Plug className="w-6 h-6" />
            מרכז אינטגרציות
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            ניהול חיבורי וואטסאפ, Gmail, SMS ו-Telegram
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="gap-1.5 py-1.5 px-3">
            <Wifi className="w-3.5 h-3.5 text-green-400" />
            {connections.filter(c => c.isActive).length} חיבורים פעילים
          </Badge>
          <Badge variant="outline" className="gap-1.5 py-1.5 px-3">
            <Activity className="w-3.5 h-3.5" />
            {hubStatus?.totalMessages || 0} הודעות
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <ChannelCard
          label="וואטסאפ"
          description="שליחת הודעות ללקוחות וספקים"
          icon={<MessageSquare className="w-6 h-6 text-green-500" />}
          iconBg="bg-green-500/10"
          conns={whatsappConns}
          stat={stats.whatsapp || { sent: 0, received: 0, failed: 0 }}
          channel="whatsapp"
          testingId={testingId}
          onTest={testConnection}
          onSend={openSendDialog}
          sendColor="text-green-500"
        />
        <ChannelCard
          label="Gmail"
          description="שליחה וקליטת אימיילים"
          icon={<Mail className="w-6 h-6 text-red-500" />}
          iconBg="bg-red-500/10"
          conns={gmailConns}
          stat={stats.gmail || { sent: 0, received: 0, failed: 0 }}
          channel="gmail"
          testingId={testingId}
          syncingId={syncingId}
          onTest={testConnection}
          onSync={syncGmailInbox}
          onSend={openSendDialog}
          sendColor="text-red-500"
        />
        <ChannelCard
          label="SMS"
          description="הודעות SMS דרך Twilio / Nexmo"
          icon={<Phone className="w-6 h-6 text-orange-500" />}
          iconBg="bg-orange-500/10"
          conns={smsConns}
          stat={smsCombined}
          channel="sms"
          testingId={testingId}
          onTest={testConnection}
          onSend={openSendDialog}
          sendColor="text-orange-500"
        />
        <ChannelCard
          label="Telegram"
          description="הודעות לקבוצות וערוצים"
          icon={<Send className="w-6 h-6 text-sky-500" />}
          iconBg="bg-sky-500/10"
          conns={telegramConns}
          stat={telegramCombined}
          channel="telegram"
          testingId={testingId}
          onTest={testConnection}
          onSend={openSendDialog}
          sendColor="text-sky-500"
        />
      </div>

      <div className="mb-6">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              <h3 className="font-semibold">תבניות הודעה</h3>
              <Badge variant="outline">{templates.length} תבניות</Badge>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>{templates.filter(t => t.channel === "gmail").length} אימייל</span>
            <span>•</span>
            <span>{templates.filter(t => t.channel === "whatsapp").length} וואטסאפ</span>
            <span>•</span>
            <span>{templates.filter(t => t.channel === "sms").length} SMS</span>
            <span>•</span>
            <span>{templates.filter(t => t.channel === "telegram").length} Telegram</span>
          </div>
        </Card>
      </div>

      <Tabs defaultValue="activity" dir="rtl">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="activity" className="gap-1.5">
            <Activity className="w-4 h-4" />
            יומן פעילות
          </TabsTrigger>
          <TabsTrigger value="whatsapp-history" className="gap-1.5">
            <MessageSquare className="w-4 h-4" />
            וואטסאפ
          </TabsTrigger>
          <TabsTrigger value="gmail-history" className="gap-1.5">
            <Mail className="w-4 h-4" />
            Gmail
          </TabsTrigger>
          <TabsTrigger value="sms-history" className="gap-1.5">
            <Phone className="w-4 h-4" />
            SMS
          </TabsTrigger>
          <TabsTrigger value="telegram-history" className="gap-1.5">
            <Send className="w-4 h-4" />
            Telegram
          </TabsTrigger>
          <TabsTrigger value="health" className="gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            בריאות חיבורים
          </TabsTrigger>
        </TabsList>

        <TabsContent value="activity" className="mt-4">
          <MessageHistory limit={100} />
        </TabsContent>

        <TabsContent value="whatsapp-history" className="mt-4">
          <MessageHistory channel="whatsapp" limit={100} />
        </TabsContent>

        <TabsContent value="gmail-history" className="mt-4">
          <MessageHistory channel="gmail" limit={100} />
        </TabsContent>

        <TabsContent value="sms-history" className="mt-4">
          <MessageHistory channel="sms" limit={100} />
        </TabsContent>

        <TabsContent value="telegram-history" className="mt-4">
          <MessageHistory channel="telegram" limit={100} />
        </TabsContent>

        <TabsContent value="health" className="mt-4">
          <div className="space-y-3">
            {connections.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Plug className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>אין חיבורי הודעות מוגדרים</p>
                <p className="text-xs mt-1">הגדר חיבורים בלשונית "אינטגרציות"</p>
              </div>
            )}
            {connections.map(conn => {
              const ch = getConnectionChannel(conn.slug);
              const icons: Record<Channel, React.ReactNode> = {
                whatsapp: <MessageSquare className="w-5 h-5 text-green-500" />,
                gmail: <Mail className="w-5 h-5 text-red-500" />,
                sms: <Phone className="w-5 h-5 text-orange-500" />,
                telegram: <Send className="w-5 h-5 text-sky-500" />,
              };
              return (
                <Card key={conn.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {icons[ch]}
                      <div>
                        <h4 className="font-medium text-sm">{conn.name}</h4>
                        <p className="text-xs text-muted-foreground">
                          {conn.lastSyncAt
                            ? `בדיקה אחרונה: ${new Date(conn.lastSyncAt).toLocaleString("he-IL")}`
                            : "טרם נבדק"
                          }
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {conn.isActive ? (
                        <Badge className="bg-green-500/10 text-green-400 border-green-500/20 gap-1">
                          <Wifi className="w-3 h-3" /> פעיל
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1 text-red-400">
                          <WifiOff className="w-3 h-3" /> מושבת
                        </Badge>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs gap-1"
                        onClick={() => testConnection(conn.id)}
                        disabled={testingId === conn.id}
                      >
                        {testingId === conn.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <TestTube className="w-3 h-3" />
                        )}
                        בדוק חיבור
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs gap-1"
                        onClick={() => openSendDialog(ch)}
                      >
                        <Send className="w-3 h-3" />
                        שלח הודעת בדיקה
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      <SendMessageDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        channel={sendChannel}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="integration-hub" />
        <RelatedRecords entityType="integration-hub" />
      </div>
    </div>
  );
}
