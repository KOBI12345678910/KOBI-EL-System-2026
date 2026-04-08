import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui-components";
import { authFetch } from "@/lib/utils";
import {
  AlertTriangle, Bell, Save, Play, Loader2, CheckCircle2,
  Slack, MessageCircle, Clock, ChevronDown, ChevronUp, RefreshCw, Key,
} from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";

const API_BASE = "/api";

interface EscalationSettings {
  slackWebhookUrl: string;
  slackConfigured: boolean;
  whatsappRecipient: string;
  whatsappPhoneIdConfigured: boolean;
  whatsappTokenConfigured: boolean;
  whatsappConfigured: boolean;
  overdueDays: number;
}

interface EscalationRunResult {
  found: number;
  notificationsCreated: number;
  slackSent: number;
  whatsappSent: number;
  errors: string[];
  skipped: number;
  message: string;
}

interface PreviewInvoice {
  id: number;
  invoice_number: string;
  customer_name: string;
  balance_due: number;
  days_overdue: number;
  currency: string;
}

export default function EscalationChannelsSection() {
  const { token } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    slackWebhookUrl: "",
    whatsappRecipient: "",
    whatsappPhoneId: "",
    whatsappToken: "",
    overdueDays: 30,
  });
  const [showPreview, setShowPreview] = useState(false);
  const [lastRun, setLastRun] = useState<EscalationRunResult | null>(null);

  const { data: settings, isLoading } = useQuery<EscalationSettings>({
    queryKey: ["escalation-settings"],
    queryFn: async () => {
      const res = await authFetch(`${API_BASE}/finance/escalation-settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load settings");
      return res.json();
    },
    enabled: !!token,
  });

  useEffect(() => {
    if (settings) {
      setForm(prev => ({
        ...prev,
        slackWebhookUrl: settings.slackConfigured ? "****" : "",
        whatsappRecipient: settings.whatsappRecipient || "",
        whatsappPhoneId: settings.whatsappPhoneIdConfigured ? "****" : "",
        whatsappToken: settings.whatsappTokenConfigured ? "****" : "",
        overdueDays: settings.overdueDays || 30,
      }));
    }
  }, [settings]);

  const { data: preview } = useQuery<{ invoices: PreviewInvoice[]; count: number }>({
    queryKey: ["escalation-preview", form.overdueDays],
    queryFn: async () => {
      const res = await authFetch(`${API_BASE}/finance/escalation-preview?overdueDays=${form.overdueDays}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return { invoices: [], count: 0 };
      return res.json();
    },
    enabled: !!token && showPreview,
  });

  const saveMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const payload: Record<string, unknown> = {
        overdueDays: data.overdueDays,
        whatsappRecipient: data.whatsappRecipient,
      };
      if (data.slackWebhookUrl && !data.slackWebhookUrl.includes("****")) {
        payload.slackWebhookUrl = data.slackWebhookUrl;
      }
      if (data.whatsappPhoneId && !data.whatsappPhoneId.includes("****")) {
        payload.whatsappPhoneId = data.whatsappPhoneId;
      }
      if (data.whatsappToken && !data.whatsappToken.includes("****")) {
        payload.whatsappToken = data.whatsappToken;
      }
      const res = await authFetch(`${API_BASE}/finance/escalation-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["escalation-settings"] });
      toast({ title: "הגדרות נשמרו", description: "ערוצי האסקלציה עודכנו בהצלחה" });
    },
    onError: (e: Error) => {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    },
  });

  const runMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch(`${API_BASE}/finance/run-escalation`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ overdueDays: form.overdueDays }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed");
      }
      return res.json() as Promise<EscalationRunResult>;
    },
    onSuccess: (data) => {
      setLastRun(data);
      queryClient.invalidateQueries({ queryKey: ["escalation-preview"] });
      toast({
        title: "אסקלציה הורצה",
        description: data.message,
      });
    },
    onError: (e: Error) => {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
          <AlertTriangle className="w-5 h-5 text-red-400" />
        </div>
        <div>
          <h2 className="text-base font-semibold">ערוצי אסקלציה</h2>
          <p className="text-sm text-muted-foreground">שליחה אוטומטית של התראות על חשבוניות ב-30+ ימי איחור ל-Slack ו-WhatsApp</p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-5">
        <div className="flex items-center gap-2 mb-1">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">סף איחור</h3>
        </div>
        <div>
          <label className="block text-sm text-muted-foreground mb-1">ימים באיחור לפני אסקלציה</label>
          <input
            type="number"
            min={1}
            max={365}
            value={form.overdueDays}
            onChange={e => setForm(prev => ({ ...prev, overdueDays: parseInt(e.target.value) || 30 }))}
            className="w-32 px-3 py-2 bg-background border border-border rounded-lg text-sm text-right"
          />
          <p className="text-xs text-muted-foreground mt-1">ברירת מחדל: 30 ימים</p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Slack className="w-4 h-4 text-[#E01E5A]" />
          <h3 className="text-sm font-semibold">Slack</h3>
          {settings?.slackConfigured && (
            <span className="text-xs bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-0.5 rounded-full">מוגדר</span>
          )}
        </div>
        <div>
          <label className="block text-sm text-muted-foreground mb-1">Slack Webhook URL</label>
          <input
            type="text"
            dir="ltr"
            value={form.slackWebhookUrl}
            onChange={e => setForm(prev => ({ ...prev, slackWebhookUrl: e.target.value }))}
            placeholder="https://hooks.slack.com/services/..."
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-mono"
          />
          <p className="text-xs text-muted-foreground mt-1">
            צור webhook ב-Slack App תחת "Incoming Webhooks". הודעות יישלחו לערוץ שמוגדר ב-webhook.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <MessageCircle className="w-4 h-4 text-[#25D366]" />
          <h3 className="text-sm font-semibold">WhatsApp (Meta Business Cloud API)</h3>
          {settings?.whatsappConfigured ? (
            <span className="text-xs bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-0.5 rounded-full">מוגדר</span>
          ) : (
            <span className="text-xs bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 px-2 py-0.5 rounded-full">לא מוגדר</span>
          )}
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-muted-foreground mb-1">
              <Key className="w-3.5 h-3.5 inline ml-1" />
              Phone Number ID
            </label>
            <input
              type="text"
              dir="ltr"
              value={form.whatsappPhoneId}
              onChange={e => setForm(prev => ({ ...prev, whatsappPhoneId: e.target.value }))}
              placeholder="1234567890"
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-sm text-muted-foreground mb-1">
              <Key className="w-3.5 h-3.5 inline ml-1" />
              Access Token
            </label>
            <input
              type="password"
              dir="ltr"
              value={form.whatsappToken}
              onChange={e => setForm(prev => ({ ...prev, whatsappToken: e.target.value }))}
              placeholder="EAAxxxxxxxx..."
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-sm text-muted-foreground mb-1">מספר טלפון יעד (נמען)</label>
            <input
              type="text"
              dir="ltr"
              value={form.whatsappRecipient}
              onChange={e => setForm(prev => ({ ...prev, whatsappRecipient: e.target.value }))}
              placeholder="972501234567"
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-mono"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Phone Number ID ו-Access Token מגיעים מ-Meta Business → WhatsApp → API Setup.
            מספר הנמען בפורמט בינלאומי ללא + (לדוגמה: 972501234567).
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button
          onClick={() => saveMutation.mutate(form)}
          disabled={saveMutation.isPending}
          className="gap-2"
        >
          {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          שמור הגדרות
        </Button>
        <Button
          variant="outline"
          onClick={() => runMutation.mutate()}
          disabled={runMutation.isPending}
          className="gap-2"
        >
          {runMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          הרץ עכשיו (בדיקה)
        </Button>
        <Button
          variant="outline"
          onClick={() => setShowPreview(v => !v)}
          className="gap-2 text-muted-foreground"
        >
          <Bell className="w-4 h-4" />
          {showPreview ? "הסתר" : "הצג"} חשבוניות
          {showPreview ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </Button>
      </div>

      {lastRun && (
        <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4 space-y-2">
          <div className="flex items-center gap-2 text-green-400 font-medium text-sm">
            <CheckCircle2 className="w-4 h-4" />
            תוצאות ריצה אחרונה
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div className="bg-background/50 rounded-lg p-2 text-center">
              <div className="font-bold text-lg">{lastRun.found}</div>
              <div className="text-xs text-muted-foreground">חשבוניות שנמצאו</div>
            </div>
            <div className="bg-background/50 rounded-lg p-2 text-center">
              <div className="font-bold text-lg text-primary">{lastRun.notificationsCreated}</div>
              <div className="text-xs text-muted-foreground">התראות חדשות</div>
            </div>
            <div className="bg-background/50 rounded-lg p-2 text-center">
              <div className="font-bold text-lg text-[#E01E5A]">{lastRun.slackSent}</div>
              <div className="text-xs text-muted-foreground">Slack</div>
            </div>
            <div className="bg-background/50 rounded-lg p-2 text-center">
              <div className="font-bold text-lg text-[#25D366]">{lastRun.whatsappSent}</div>
              <div className="text-xs text-muted-foreground">WhatsApp</div>
            </div>
          </div>
          {lastRun.skipped > 0 && (
            <p className="text-xs text-muted-foreground">דולגו {lastRun.skipped} חשבוניות (כפילויות ב-24 שעות)</p>
          )}
          {lastRun.errors.length > 0 && (
            <details className="text-xs text-red-400">
              <summary className="cursor-pointer">{lastRun.errors.length} שגיאות</summary>
              <ul className="mt-1 space-y-0.5 pr-2">
                {lastRun.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}

      {showPreview && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Bell className="w-4 h-4" />
              חשבוניות שיקבלו אסקלציה ({preview?.count || 0})
            </h3>
            <button
              onClick={() => queryClient.invalidateQueries({ queryKey: ["escalation-preview"] })}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
          {!preview || preview.invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              אין חשבוניות פתוחות מעל {form.overdueDays} ימים
            </p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {preview.invoices.map(inv => (
                <div key={inv.id} className="flex items-center justify-between text-sm p-2 rounded-lg bg-muted/30 border border-border/40">
                  <div>
                    <span className="font-medium">{inv.invoice_number}</span>
                    <span className="text-muted-foreground mr-2">{inv.customer_name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-red-400 font-medium">₪{Number(inv.balance_due).toLocaleString()}</span>
                    <span className="text-xs text-muted-foreground">{inv.days_overdue} ימים</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="text-xs text-muted-foreground bg-muted/20 rounded-lg p-3 border border-border/40">
        <p className="font-medium mb-1">אוטומציה יומית + ניתוב ערוצים</p>
        <p>מנוע האסקלציה רץ אוטומטית כל יום בשעה 08:00. הגדרות Slack ו-WhatsApp משפיעות גם על ניתוב ההתראות הכללי (notification routing). ההגנה מפני כפילויות מונעת שליחה חוזרת לאותה חשבונית תוך 24 שעות.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="escalation-channels" />
        <RelatedRecords entityType="escalation-channels" />
      </div>
    </div>
  );
}
