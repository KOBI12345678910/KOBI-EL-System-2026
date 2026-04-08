import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button, Input, Label, Card, Modal } from "@/components/ui-components";
import {
  Plug, Globe, Phone, MessageSquare, Chrome, FileSpreadsheet,
  ShoppingCart, Mail, Facebook, Smartphone, Link2, ArrowLeftRight,
  Plus, CheckCircle2, XCircle, Loader2, Trash2, TestTube,
  Settings2, Wifi, WifiOff, Clock, RotateCw, ExternalLink, Save, Send
} from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { authFetch } from "@/lib/utils";

const API_BASE = "/api";

interface IntegrationTemplate {
  slug: string;
  name: string;
  icon: any;
  color: string;
  bgColor: string;
  description: string;
  defaultBaseUrl: string;
  defaultAuthMethod: string;
  fields: IntegrationField[];
}

interface IntegrationField {
  key: string;
  label: string;
  type: "text" | "password" | "url" | "email" | "select";
  placeholder?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  configPath: "authConfig" | "defaultHeaders" | "root";
}

interface ConnectionRecord {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  serviceType: string;
  baseUrl: string;
  authMethod: string;
  authConfig: Record<string, any>;
  defaultHeaders: Record<string, any>;
  isActive: boolean;
  lastSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const INTEGRATION_TEMPLATES: IntegrationTemplate[] = [
  {
    slug: "sms",
    name: "SMS (Twilio)",
    icon: Phone,
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
    description: "שליחת הודעות SMS ללקוחות וספקים דרך Twilio",
    defaultBaseUrl: "https://api.twilio.com",
    defaultAuthMethod: "basic",
    fields: [
      { key: "accountSid", label: "Account SID", type: "text", placeholder: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", required: true, configPath: "authConfig" },
      { key: "authToken", label: "Auth Token", type: "password", required: true, configPath: "authConfig" },
      { key: "fromNumber", label: "מספר טלפון שולח", type: "text", placeholder: "+972500000000", required: true, configPath: "authConfig" },
    ],
  },
  {
    slug: "twilio",
    name: "SMS — Twilio (מתקדם)",
    icon: Phone,
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    description: "חיבור Twilio עם תמיכה ב-SMS, קול ו-Messaging Services",
    defaultBaseUrl: "https://api.twilio.com/2010-04-01",
    defaultAuthMethod: "basic",
    fields: [
      { key: "accountSid", label: "Account SID", type: "text", placeholder: "ACxxxxxxxxxxxxxxxx", required: true, configPath: "authConfig" },
      { key: "authToken", label: "Auth Token", type: "password", required: true, configPath: "authConfig" },
      { key: "fromNumber", label: "מספר שולח / Messaging Service SID", type: "text", placeholder: "+972500000000", required: true, configPath: "authConfig" },
    ],
  },
  {
    slug: "telegram",
    name: "Telegram Bot",
    icon: Send,
    color: "text-sky-500",
    bgColor: "bg-sky-500/10",
    description: "שליחת הודעות Telegram דרך Bot API — התראות, עדכונים, קבוצות",
    defaultBaseUrl: "https://api.telegram.org",
    defaultAuthMethod: "bearer",
    fields: [
      { key: "botToken", label: "Bot Token", type: "password", placeholder: "1234567890:ABCdefGHIjklMNOpqrsTUVwxyz", required: true, configPath: "authConfig" },
      { key: "defaultChatId", label: "Chat ID ברירת מחדל", type: "text", placeholder: "-1001234567890", configPath: "authConfig" },
    ],
  },
  {
    slug: "telegram-bot",
    name: "Telegram Bot (קבוצה/ערוץ)",
    icon: Send,
    color: "text-cyan-500",
    bgColor: "bg-cyan-500/10",
    description: "שליחת הודעות לקבוצת Telegram ספציפית או ערוץ",
    defaultBaseUrl: "https://api.telegram.org",
    defaultAuthMethod: "bearer",
    fields: [
      { key: "botToken", label: "Bot Token", type: "password", placeholder: "1234567890:ABCdefGHIjklMNOpqrsTUVwxyz", required: true, configPath: "authConfig" },
      { key: "defaultChatId", label: "מזהה קבוצה/ערוץ", type: "text", placeholder: "@channel_name or -1001234567890", required: true, configPath: "authConfig" },
    ],
  },
  {
    slug: "gmail",
    name: "Gmail / Google SMTP",
    icon: Mail,
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    description: "שליחת דואר אלקטרוני דרך Gmail SMTP — חשבוניות, הצעות מחיר, התראות",
    defaultBaseUrl: "https://smtp.gmail.com",
    defaultAuthMethod: "basic",
    fields: [
      { key: "username", label: "כתובת Gmail", type: "email", placeholder: "user@gmail.com", required: true, configPath: "authConfig" },
      { key: "password", label: "סיסמת אפליקציה (App Password)", type: "password", placeholder: "xxxx xxxx xxxx xxxx", required: true, configPath: "authConfig" },
      { key: "fromName", label: "שם השולח", type: "text", placeholder: "טכנו-כל עוזי", configPath: "authConfig" },
      { key: "testEndpoint", label: "כתובת בדיקה (אופציונלי)", type: "url", placeholder: "https://gmail.googleapis.com/gmail/v1/users/me/profile", configPath: "authConfig" },
    ],
  },
  {
    slug: "google-ads",
    name: "Google Ads",
    icon: Globe,
    color: "text-yellow-500",
    bgColor: "bg-yellow-500/10",
    description: "חיבור לחשבון Google Ads לקמפיינים ודוחות פרסום",
    defaultBaseUrl: "https://googleads.googleapis.com",
    defaultAuthMethod: "bearer",
    fields: [
      { key: "token", label: "Access Token", type: "password", required: true, configPath: "authConfig" },
      { key: "customerId", label: "Customer ID", type: "text", placeholder: "123-456-7890", required: true, configPath: "authConfig" },
      { key: "developerToken", label: "Developer Token", type: "password", required: true, configPath: "authConfig" },
    ],
  },
  {
    slug: "telephony",
    name: "חיבור טלפוניה",
    icon: Phone,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    description: "חיבור למרכזייה טלפונית — זיהוי שיחות, יומן שיחות, הקלטות",
    defaultBaseUrl: "https://api.voicenter.co.il",
    defaultAuthMethod: "api_key",
    fields: [
      { key: "apiKey", label: "מפתח API", type: "password", required: true, configPath: "authConfig" },
      { key: "headerName", label: "שם Header", type: "text", placeholder: "X-API-Key", configPath: "authConfig" },
      { key: "accountId", label: "מזהה חשבון", type: "text", configPath: "authConfig" },
    ],
  },
  {
    slug: "facebook",
    name: "פייסבוק",
    icon: Facebook,
    color: "text-blue-600",
    bgColor: "bg-blue-600/10",
    description: "חיבור לדף עסקי בפייסבוק — לידים, הודעות, פרסום",
    defaultBaseUrl: "https://graph.facebook.com/v18.0",
    defaultAuthMethod: "bearer",
    fields: [
      { key: "token", label: "Page Access Token", type: "password", required: true, configPath: "authConfig" },
      { key: "pageId", label: "Page ID", type: "text", required: true, configPath: "authConfig" },
    ],
  },
  {
    slug: "whatsapp",
    name: "וואטסאפ",
    icon: MessageSquare,
    color: "text-green-500",
    bgColor: "bg-green-500/10",
    description: "שליחת הודעות WhatsApp ללקוחות וספקים",
    defaultBaseUrl: "https://graph.facebook.com/v18.0",
    defaultAuthMethod: "bearer",
    fields: [
      { key: "token", label: "WhatsApp Business API Token", type: "password", required: true, configPath: "authConfig" },
      { key: "phoneNumberId", label: "Phone Number ID", type: "text", required: true, configPath: "authConfig" },
      { key: "businessAccountId", label: "Business Account ID", type: "text", configPath: "authConfig" },
    ],
  },
  {
    slug: "whatsapp-api",
    name: "וואטסאפ API (צד שלישי)",
    icon: Smartphone,
    color: "text-green-600",
    bgColor: "bg-green-600/10",
    description: "חיבור דרך ספק צד שלישי — Green API, Twilio, 360dialog",
    defaultBaseUrl: "https://api.green-api.com",
    defaultAuthMethod: "api_key",
    fields: [
      { key: "apiKey", label: "מפתח API", type: "password", required: true, configPath: "authConfig" },
      { key: "instanceId", label: "Instance ID", type: "text", required: true, configPath: "authConfig" },
      { key: "headerName", label: "שם Header", type: "text", placeholder: "Authorization", configPath: "authConfig" },
    ],
  },
  {
    slug: "chrome-extension",
    name: "תוסף גוגל כרום",
    icon: Chrome,
    color: "text-red-400",
    bgColor: "bg-red-400/10",
    description: "חיבור תוסף דפדפן לאיסוף נתונים מאתרים",
    defaultBaseUrl: "https://chrome-ext.technokoluzi.com",
    defaultAuthMethod: "api_key",
    fields: [
      { key: "apiKey", label: "מפתח תוסף", type: "password", required: true, configPath: "authConfig" },
      { key: "headerName", label: "שם Header", type: "text", placeholder: "X-Extension-Key", configPath: "authConfig" },
    ],
  },
  {
    slug: "rivhit",
    name: "מיפוי שדות רווחית",
    icon: ArrowLeftRight,
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
    description: "חיבור למערכת רווחית — סנכרון חשבוניות, לקוחות, פריטים",
    defaultBaseUrl: "https://api.rivhit.co.il/online/RivhitOnlineAPI.svc",
    defaultAuthMethod: "api_key",
    fields: [
      { key: "apiKey", label: "מפתח API רווחית", type: "password", required: true, configPath: "authConfig" },
      { key: "companyId", label: "מזהה חברה", type: "text", required: true, configPath: "authConfig" },
      { key: "headerName", label: "שם Header", type: "text", placeholder: "X-API-Key", configPath: "authConfig" },
    ],
  },
  {
    slug: "accounting",
    name: "מערכת הנהלת חשבונות",
    icon: FileSpreadsheet,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
    description: "חיבור לתוכנת הנהלת חשבונות — חשבשבת, פריורטי, SAP",
    defaultBaseUrl: "https://api.hashavshevet.com",
    defaultAuthMethod: "api_key",
    fields: [
      { key: "apiKey", label: "מפתח API", type: "password", required: true, configPath: "authConfig" },
      { key: "companyCode", label: "קוד חברה", type: "text", configPath: "authConfig" },
      { key: "headerName", label: "שם Header", type: "text", placeholder: "Authorization", configPath: "authConfig" },
      {
        key: "provider", label: "ספק תוכנה", type: "select", configPath: "authConfig",
        options: [
          { value: "hashavshevet", label: "חשבשבת" },
          { value: "priority", label: "פריורטי" },
          { value: "sap", label: "SAP" },
          { value: "other", label: "אחר" },
        ],
      },
    ],
  },
  {
    slug: "woocommerce",
    name: "WooCommerce",
    icon: ShoppingCart,
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
    description: "סנכרון מוצרים והזמנות מחנות WooCommerce",
    defaultBaseUrl: "https://your-store.com/wp-json/wc/v3",
    defaultAuthMethod: "basic",
    fields: [
      { key: "username", label: "Consumer Key", type: "text", required: true, configPath: "authConfig" },
      { key: "password", label: "Consumer Secret", type: "password", required: true, configPath: "authConfig" },
    ],
  },
  {
    slug: "google-sheets",
    name: "Google Sheets",
    icon: FileSpreadsheet,
    color: "text-green-500",
    bgColor: "bg-green-500/10",
    description: "ייבוא וייצוא נתונים מגיליונות Google",
    defaultBaseUrl: "https://sheets.googleapis.com/v4/spreadsheets",
    defaultAuthMethod: "bearer",
    fields: [
      { key: "token", label: "Access Token / Service Account Key", type: "password", required: true, configPath: "authConfig" },
      { key: "spreadsheetId", label: "מזהה גיליון", type: "text", placeholder: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms", configPath: "authConfig" },
    ],
  },
  {
    slug: "external-erp",
    name: "חיבור ERP חיצוני",
    icon: Link2,
    color: "text-indigo-500",
    bgColor: "bg-indigo-500/10",
    description: "חיבור למערכת ERP חיצונית — REST API כללי",
    defaultBaseUrl: "https://api.example.com",
    defaultAuthMethod: "bearer",
    fields: [
      { key: "token", label: "API Token", type: "password", required: true, configPath: "authConfig" },
      { key: "testEndpoint", label: "Endpoint בדיקה", type: "text", placeholder: "/health", configPath: "authConfig" },
    ],
  },
  {
    slug: "custom",
    name: "אינטגרציה מותאמת",
    icon: Plug,
    color: "text-primary",
    bgColor: "bg-primary/10",
    description: "בנה חיבור מותאם אישית לכל API",
    defaultBaseUrl: "https://",
    defaultAuthMethod: "none",
    fields: [
      {
        key: "authMethodSelect", label: "שיטת אימות", type: "select", configPath: "root",
        options: [
          { value: "none", label: "ללא אימות" },
          { value: "api_key", label: "מפתח API" },
          { value: "bearer", label: "Bearer Token" },
          { value: "basic", label: "Basic Auth" },
        ],
      },
      { key: "token", label: "Token / API Key", type: "password", configPath: "authConfig" },
      { key: "headerName", label: "שם Header (עבור API Key)", type: "text", placeholder: "Authorization", configPath: "authConfig" },
    ],
  },
];

export default function IntegrationsSection() {
  const { token } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedTemplate, setSelectedTemplate] = useState<IntegrationTemplate | null>(null);
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [editingConnection, setEditingConnection] = useState<ConnectionRecord | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [baseUrl, setBaseUrl] = useState("");
  const [connectionName, setConnectionName] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const { data: connections = [], isLoading } = useQuery<ConnectionRecord[]>({
    queryKey: ["integration-connections"],
    queryFn: async () => {
      const res = await authFetch(`${API_BASE}/integrations/connections`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!token,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await authFetch(`${API_BASE}/integrations/connections`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integration-connections"] });
      toast({ title: "אינטגרציה נוצרה", description: "החיבור נשמר בהצלחה" });
      closeModal();
    },
    onError: (e: any) => {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await authFetch(`${API_BASE}/integrations/connections/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integration-connections"] });
      toast({ title: "עודכן", description: "החיבור עודכן בהצלחה" });
      closeModal();
    },
    onError: () => {
      toast({ title: "שגיאה", description: "לא ניתן לעדכן", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await authFetch(`${API_BASE}/integrations/connections/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integration-connections"] });
      toast({ title: "נמחק", description: "האינטגרציה הוסרה" });
    },
  });

  const MESSAGING_SLUGS = ["sms", "twilio", "nexmo", "vonage", "telegram", "telegram-bot", "whatsapp", "whatsapp-api", "gmail"];

  const testConnection = async (id: number, slug?: string) => {
    setTestingId(id);
    setTestResult(null);
    try {
      const useMessagingEndpoint = slug && MESSAGING_SLUGS.includes(slug);
      const testUrl = useMessagingEndpoint
        ? `${API_BASE}/platform/messaging/test/${id}`
        : `${API_BASE}/integrations/connections/${id}/test`;
      const res = await authFetch(testUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      const result = await res.json();
      setTestResult(result);
      queryClient.invalidateQueries({ queryKey: ["integration-connections"] });
      if (result.success) {
        toast({ title: "חיבור תקין", description: result.message });
      } else {
        toast({ title: "חיבור נכשל", description: result.message, variant: "destructive" });
      }
    } catch {
      setTestResult({ success: false, message: "שגיאת תקשורת" });
    }
    setTestingId(null);
  };

  const openNewConnection = (template: IntegrationTemplate) => {
    setSelectedTemplate(template);
    setEditingConnection(null);
    setFormData({});
    setBaseUrl(template.defaultBaseUrl);
    setConnectionName(template.name);
    setTestResult(null);
    setShowModal(true);
  };

  const openEditConnection = (conn: ConnectionRecord) => {
    const template = INTEGRATION_TEMPLATES.find(t => t.slug === conn.slug) || INTEGRATION_TEMPLATES[INTEGRATION_TEMPLATES.length - 1];
    setSelectedTemplate(template);
    setEditingConnection(conn);
    setBaseUrl(conn.baseUrl);
    setConnectionName(conn.name);
    setTestResult(null);

    const data: Record<string, any> = {};
    const authConfig = conn.authConfig as Record<string, any> || {};
    const defaultHeaders = conn.defaultHeaders as Record<string, any> || {};
    template.fields.forEach(f => {
      if (f.configPath === "authConfig") data[f.key] = authConfig[f.key] || "";
      else if (f.configPath === "defaultHeaders") data[f.key] = defaultHeaders[f.key] || "";
      else data[f.key] = (conn as any)[f.key] || "";
    });
    setFormData(data);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedTemplate(null);
    setEditingConnection(null);
    setFormData({});
    setTestResult(null);
  };

  const handleSave = () => {
    if (!selectedTemplate) return;

    const authConfig: Record<string, any> = {};
    const defaultHeaders: Record<string, any> = {};

    selectedTemplate.fields.forEach(f => {
      const val = formData[f.key];
      if (val !== undefined && val !== "") {
        if (f.configPath === "authConfig") authConfig[f.key] = val;
        else if (f.configPath === "defaultHeaders") defaultHeaders[f.key] = val;
      }
    });

    if (formData.authMethodSelect) {
      // custom integration: override auth method
    }

    const payload = {
      name: connectionName,
      slug: selectedTemplate.slug,
      description: selectedTemplate.description,
      serviceType: "rest_api",
      baseUrl: baseUrl,
      authMethod: formData.authMethodSelect || selectedTemplate.defaultAuthMethod,
      authConfig,
      defaultHeaders,
      isActive: true,
    };

    if (editingConnection) {
      updateMutation.mutate({ id: editingConnection.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const connectedSlugs = new Set(connections.map(c => c.slug));

  const getConnectionForSlug = (slug: string) => connections.find(c => c.slug === slug);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold">אינטגרציות</h1>
          <p className="text-sm text-muted-foreground mt-1">
            חבר את המערכת לשירותים חיצוניים — כל חיבור נשמר עם הגדרות אמיתיות
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Wifi className="w-4 h-4 text-green-400" />
          <span>{connections.filter(c => c.isActive).length} חיבורים פעילים</span>
        </div>
      </div>

      {connections.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-400" />
            חיבורים מוגדרים ({connections.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {connections.map((conn) => {
              const template = INTEGRATION_TEMPLATES.find(t => t.slug === conn.slug);
              const Icon = template?.icon || Plug;
              const isTesting = testingId === conn.id;

              return (
                <Card key={conn.id} className="p-5 relative">
                  <div className="flex items-start justify-between mb-3">
                    <div className={`w-12 h-12 ${template?.bgColor || "bg-primary/10"} rounded-xl flex items-center justify-center`}>
                      <Icon className={`w-6 h-6 ${template?.color || "text-primary"}`} />
                    </div>
                    <div className="flex items-center gap-1">
                      {conn.isActive ? (
                        <span className="flex items-center gap-1 text-xs text-green-400 bg-green-500/10 px-2 py-1 rounded-full">
                          <Wifi className="w-3 h-3" />
                          פעיל
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded-full">
                          <WifiOff className="w-3 h-3" />
                          מושבת
                        </span>
                      )}
                    </div>
                  </div>

                  <h3 className="font-semibold text-sm mb-1">{conn.name}</h3>
                  <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{conn.description || conn.baseUrl}</p>

                  {conn.lastSyncAt && (
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1 mb-3">
                      <Clock className="w-3 h-3" />
                      בדיקה אחרונה: {new Date(conn.lastSyncAt).toLocaleString("he-IL")}
                    </p>
                  )}

                  <div className="flex items-center gap-2 border-t border-border pt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-1 text-xs"
                      onClick={() => testConnection(conn.id, conn.slug)}
                      disabled={isTesting}
                    >
                      {isTesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <TestTube className="w-3 h-3" />}
                      בדוק חיבור
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 text-xs"
                      onClick={() => openEditConnection(conn)}
                    >
                      <Settings2 className="w-3 h-3" />
                      ערוך
                    </Button>
                    {isSuperAdmin && (<button
                      className="p-1.5 hover:bg-red-500/10 rounded-lg transition-colors"
                      onClick={async () => {
                        const ok = await globalConfirm(`למחוק את "${conn.name}"?`);
                        if (ok) { deleteMutation.mutate(conn.id); }
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </button>
                    )}
                  </div>

                  {testResult && testingId === null && testResult.success !== undefined && conn.id === connections.find(c =>
                    c.lastSyncAt && new Date(c.lastSyncAt).getTime() > Date.now() - 5000
                  )?.id && (
                    <div className={`mt-2 p-2 rounded-lg text-xs ${testResult.success ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                      {testResult.success ? <CheckCircle2 className="w-3 h-3 inline mr-1" /> : <XCircle className="w-3 h-3 inline mr-1" />}
                      {testResult.message}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Plus className="w-5 h-5" />
          הוסף אינטגרציה חדשה
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {INTEGRATION_TEMPLATES.map((template) => {
            const existing = getConnectionForSlug(template.slug);
            return (
              <Card
                key={template.slug}
                onClick={() => existing ? openEditConnection(existing) : openNewConnection(template)}
                className="p-6 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all cursor-pointer group text-center relative"
              >
                <div className={`w-16 h-16 ${template.bgColor} rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform`}>
                  <template.icon className={`w-8 h-8 ${template.color}`} />
                </div>
                <h3 className="font-medium text-sm mb-1">{template.name}</h3>
                <p className="text-[11px] text-muted-foreground leading-tight">{template.description}</p>
                {existing && (
                  <span className="absolute top-3 left-3 flex items-center gap-1 text-[10px] text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">
                    <CheckCircle2 className="w-3 h-3" />
                    מחובר
                  </span>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      {showModal && selectedTemplate && (
        <Modal isOpen={showModal} onClose={closeModal} title={editingConnection ? `עריכת ${selectedTemplate.name}` : `חיבור ${selectedTemplate.name}`}>
          <div className="space-y-4 p-4 max-h-[70vh] overflow-y-auto">
            <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-xl">
              <div className={`w-10 h-10 ${selectedTemplate.bgColor} rounded-lg flex items-center justify-center`}>
                <selectedTemplate.icon className={`w-5 h-5 ${selectedTemplate.color}`} />
              </div>
              <div>
                <p className="font-medium text-sm">{selectedTemplate.name}</p>
                <p className="text-xs text-muted-foreground">{selectedTemplate.description}</p>
              </div>
            </div>

            <div>
              <Label>שם החיבור</Label>
              <Input
                value={connectionName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConnectionName(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label>כתובת בסיס (Base URL)</Label>
              <Input
                value={baseUrl}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBaseUrl(e.target.value)}
                className="mt-1"
                dir="ltr"
              />
            </div>

            {selectedTemplate.fields.map((field) => (
              <div key={field.key}>
                <Label>
                  {field.label}
                  {field.required && <span className="text-red-400 mr-1">*</span>}
                </Label>
                {field.type === "select" ? (
                  <select
                    className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm"
                    value={formData[field.key] || ""}
                    onChange={(e) => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
                  >
                    <option value="">בחר...</option>
                    {field.options?.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                ) : (
                  <Input
                    type={field.type}
                    value={formData[field.key] || ""}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    className="mt-1"
                    dir={field.type === "email" || field.type === "url" || field.type === "password" ? "ltr" : undefined}
                  />
                )}
              </div>
            ))}

            {selectedTemplate.slug === "gmail" && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-400 space-y-1">
                <p className="font-medium">איך להשיג סיסמת אפליקציה ל-Gmail:</p>
                <ol className="list-decimal list-inside space-y-0.5 text-amber-300/80">
                  <li>היכנס ל-Google Account &gt; Security</li>
                  <li>הפעל 2-Step Verification אם לא מופעל</li>
                  <li>חפש "App passwords" בהגדרות האבטחה</li>
                  <li>צור סיסמת אפליקציה חדשה ל-"Mail"</li>
                  <li>העתק את הסיסמה (16 תווים) לשדה למעלה</li>
                </ol>
                <a
                  href="https://myaccount.google.com/apppasswords"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-amber-400 hover:text-amber-300 mt-1"
                >
                  <ExternalLink className="w-3 h-3" />
                  פתח הגדרות Google
                </a>
              </div>
            )}

            {testResult && (
              <div className={`p-3 rounded-xl text-sm ${testResult.success ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"}`}>
                {testResult.success ? <CheckCircle2 className="w-4 h-4 inline mr-2" /> : <XCircle className="w-4 h-4 inline mr-2" />}
                {testResult.message}
              </div>
            )}

            <div className="flex items-center gap-2 pt-2 border-t border-border">
              <Button
                onClick={handleSave}
                disabled={createMutation.isPending || updateMutation.isPending || !connectionName || !baseUrl}
                className="flex-1 gap-2"
              >
                {(createMutation.isPending || updateMutation.isPending)
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Save className="w-4 h-4" />}
                {editingConnection ? "עדכן חיבור" : "שמור וחבר"}
              </Button>
              <Button variant="outline" onClick={closeModal}>ביטול</Button>
            </div>
          </div>
        </Modal>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="integrations" />
        <RelatedRecords entityType="integrations" />
      </div>
    </div>
  );
}
