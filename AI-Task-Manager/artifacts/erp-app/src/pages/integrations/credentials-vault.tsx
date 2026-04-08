import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  KeyRound, Shield, Lock, FileKey, AlertTriangle, Eye, EyeOff,
  RefreshCw, Clock, CheckCircle, XCircle, ShieldAlert, Globe,
} from "lucide-react";

const FALLBACK_CREDENTIALS = [
  { id: "CRD-001", name: "SAP ERP Production", type: "API Key", service: "SAP S/4HANA", createdBy: "עוזי כהן", createdAt: "2025-08-12", expiresAt: "2026-08-12", lastUsed: "2026-04-07", status: "active" },
  { id: "CRD-002", name: "Salesforce CRM", type: "OAuth2", service: "Salesforce", createdBy: "מיכל לוי", createdAt: "2025-11-03", expiresAt: "2026-11-03", lastUsed: "2026-04-08", status: "active" },
  { id: "CRD-003", name: "AWS S3 Storage", type: "API Key", service: "Amazon S3", createdBy: "עוזי כהן", createdAt: "2025-06-20", expiresAt: "2026-06-20", lastUsed: "2026-04-06", status: "active" },
  { id: "CRD-004", name: "SSL Wildcard Cert", type: "Certificate", service: "DigiCert", createdBy: "דני אברהם", createdAt: "2025-04-01", expiresAt: "2026-04-01", lastUsed: "2026-03-31", status: "expired" },
  { id: "CRD-005", name: "Stripe Payment", type: "API Key", service: "Stripe", createdBy: "רונית שרון", createdAt: "2025-09-15", expiresAt: "2026-09-15", lastUsed: "2026-04-08", status: "active" },
  { id: "CRD-006", name: "Google Workspace", type: "OAuth2", service: "Google APIs", createdBy: "מיכל לוי", createdAt: "2025-12-01", expiresAt: "2026-12-01", lastUsed: "2026-04-07", status: "active" },
  { id: "CRD-007", name: "Twilio SMS", type: "Basic Auth", service: "Twilio", createdBy: "עוזי כהן", createdAt: "2025-07-10", expiresAt: "2026-07-10", lastUsed: "2026-04-05", status: "active" },
  { id: "CRD-008", name: "SendGrid Email", type: "API Key", service: "SendGrid", createdBy: "רונית שרון", createdAt: "2025-10-22", expiresAt: "2026-10-22", lastUsed: "2026-04-08", status: "active" },
  { id: "CRD-009", name: "Azure AD", type: "OAuth2", service: "Microsoft Azure", createdBy: "דני אברהם", createdAt: "2026-01-15", expiresAt: "2027-01-15", lastUsed: "2026-04-07", status: "active" },
  { id: "CRD-010", name: "Webhook HMAC Secret", type: "HMAC", service: "n8n Webhooks", createdBy: "עוזי כהן", createdAt: "2025-05-18", expiresAt: "2026-05-18", lastUsed: "2026-04-08", status: "active" },
  { id: "CRD-011", name: "MongoDB Atlas", type: "Basic Auth", service: "MongoDB", createdBy: "דני אברהם", createdAt: "2025-08-30", expiresAt: "2026-08-30", lastUsed: "2026-04-06", status: "active" },
  { id: "CRD-012", name: "Cloudflare DNS", type: "API Key", service: "Cloudflare", createdBy: "עוזי כהן", createdAt: "2026-02-10", expiresAt: "2027-02-10", lastUsed: "2026-04-04", status: "active" },
  { id: "CRD-013", name: "HubSpot Marketing", type: "OAuth2", service: "HubSpot", createdBy: "מיכל לוי", createdAt: "2025-10-05", expiresAt: "2026-10-05", lastUsed: "2026-04-03", status: "active" },
  { id: "CRD-014", name: "Internal API mTLS", type: "Certificate", service: "Internal Gateway", createdBy: "דני אברהם", createdAt: "2025-09-01", expiresAt: "2026-09-01", lastUsed: "2026-04-08", status: "active" },
  { id: "CRD-015", name: "Legacy FTP Access", type: "Basic Auth", service: "FTP Server", createdBy: "עוזי כהן", createdAt: "2024-06-15", expiresAt: "2025-12-15", lastUsed: "2025-11-20", status: "expired" },
  { id: "CRD-016", name: "Datadog Monitoring", type: "API Key", service: "Datadog", createdBy: "דני אברהם", createdAt: "2025-11-20", expiresAt: "2026-11-20", lastUsed: "2026-04-08", status: "active" },
  { id: "CRD-017", name: "Payment Gateway HMAC", type: "HMAC", service: "Tranzila", createdBy: "רונית שרון", createdAt: "2025-07-25", expiresAt: "2025-07-25", lastUsed: "2025-06-10", status: "revoked" },
  { id: "CRD-018", name: "Partner API Cert", type: "Certificate", service: "שותפים B2B", createdBy: "עוזי כהן", createdAt: "2026-01-20", expiresAt: "2027-01-20", lastUsed: "2026-04-07", status: "active" },
];

const FALLBACK_API_KEYS = [
  { prefix: "sk_live_4f8a...x9kR", scope: "production:full", rateLimit: "1,000/min", callsMonth: 42_850, createdBy: "עוזי כהן" },
  { prefix: "sk_live_7b2c...mT3q", scope: "payments:write", rateLimit: "500/min", callsMonth: 18_320, createdBy: "רונית שרון" },
  { prefix: "sk_test_9d1e...pL5w", scope: "sandbox:full", rateLimit: "2,000/min", callsMonth: 95_400, createdBy: "דני אברהם" },
  { prefix: "sk_live_2a6f...nH8j", scope: "crm:read", rateLimit: "800/min", callsMonth: 31_200, createdBy: "מיכל לוי" },
  { prefix: "sk_live_5c3d...bK1m", scope: "inventory:read,write", rateLimit: "600/min", callsMonth: 22_750, createdBy: "עוזי כהן" },
  { prefix: "sk_live_8e7g...vQ4s", scope: "analytics:read", rateLimit: "1,200/min", callsMonth: 67_100, createdBy: "דני אברהם" },
  { prefix: "sk_live_1f9h...cW6t", scope: "webhooks:manage", rateLimit: "300/min", callsMonth: 8_940, createdBy: "עוזי כהן" },
  { prefix: "sk_live_3g4k...dR2u", scope: "email:send", rateLimit: "200/min", callsMonth: 12_650, createdBy: "רונית שרון" },
];

const FALLBACK_OAUTH_TOKENS = [
  { service: "Salesforce", grantType: "Authorization Code", scopes: "api, refresh_token, full", expiresIn: "58 דקות", refreshStatus: "פעיל" },
  { service: "Google APIs", grantType: "Authorization Code + PKCE", scopes: "drive, calendar, gmail.send", expiresIn: "42 דקות", refreshStatus: "פעיל" },
  { service: "Microsoft Azure", grantType: "Client Credentials", scopes: "Directory.Read, User.Read", expiresIn: "3 שעות", refreshStatus: "פעיל" },
  { service: "HubSpot", grantType: "Authorization Code", scopes: "contacts, content, automation", expiresIn: "5 שעות", refreshStatus: "פעיל" },
  { service: "Slack", grantType: "Bot Token", scopes: "chat:write, channels:read, users:read", expiresIn: "ללא הגבלה", refreshStatus: "לא נדרש" },
  { service: "GitHub", grantType: "Device Flow", scopes: "repo, workflow, read:org", expiresIn: "7 ימים", refreshStatus: "ידני" },
];

const FALLBACK_CERTIFICATES = [
  { cn: "*.techno-kol.co.il", issuer: "DigiCert Global G2", validFrom: "2025-04-01", validTo: "2026-04-01", daysRemaining: 0 },
  { cn: "api.techno-kol.co.il", issuer: "Let's Encrypt R3", validFrom: "2026-01-15", validTo: "2026-07-15", daysRemaining: 98 },
  { cn: "gateway-internal.local", issuer: "Techno-Kol Internal CA", validFrom: "2025-09-01", validTo: "2026-09-01", daysRemaining: 146 },
  { cn: "b2b-partners.techno-kol.co.il", issuer: "Comodo RSA", validFrom: "2026-01-20", validTo: "2027-01-20", daysRemaining: 287 },
];

function statusBadge(status: string) {
  switch (status) {
    case "active": return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">פעיל</Badge>;
    case "expired": return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">פג תוקף</Badge>;
    case "revoked": return <Badge className="bg-gray-200 text-gray-600 hover:bg-gray-200">בוטל</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
}

function typeBadge(type: string) {
  const map: Record<string, string> = {
    "API Key": "bg-blue-100 text-blue-700",
    "OAuth2": "bg-violet-100 text-violet-700",
    "Certificate": "bg-amber-100 text-amber-700",
    "Basic Auth": "bg-slate-100 text-slate-600",
    "HMAC": "bg-teal-100 text-teal-700",
  };
  return <Badge className={`${map[type] || "bg-gray-100 text-gray-600"} hover:${map[type]?.split(" ")[0]}`}>{type}</Badge>;
}

function MaskedValue({ value }: { value: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="inline-flex items-center gap-1 font-mono text-xs">
      {visible ? value : "••••••••••••"}
      <button onClick={() => setVisible(!visible)} className="text-muted-foreground hover:text-foreground">
        {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
      </button>
    </span>
  );
}

function certProgress(days: number) {
  if (days <= 0) return 100;
  if (days >= 365) return 5;
  return Math.max(5, Math.round(((365 - days) / 365) * 100));
}

function certColor(days: number) {
  if (days <= 0) return "text-red-600";
  if (days <= 30) return "text-orange-500";
  if (days <= 90) return "text-amber-500";
  return "text-emerald-600";
}

export default function CredentialsVaultPage() {

  const { data: apiData } = useQuery({
    queryKey: ["credentials_vault"],
    queryFn: () => authFetch("/api/integrations/credentials-vault").then(r => r.json()),
    staleTime: 60_000,
    retry: 1,
  });
  const credentials = apiData?.credentials ?? FALLBACK_CREDENTIALS;
  const apiKeys = apiData?.apiKeys ?? FALLBACK_API_KEYS;
  const oauthTokens = apiData?.oauthTokens ?? FALLBACK_OAUTH_TOKENS;
  const certificates = apiData?.certificates ?? FALLBACK_CERTIFICATES;
  const [activeTab, setActiveTab] = useState("vault");

  const kpis = [
    { label: "credentials שמורים", value: 18, icon: Lock, color: "bg-blue-50 text-blue-600" },
    { label: "API Keys", value: 8, icon: KeyRound, color: "bg-violet-50 text-violet-600" },
    { label: "OAuth Tokens", value: 6, icon: Globe, color: "bg-emerald-50 text-emerald-600" },
    { label: "Certificates", value: 4, icon: FileKey, color: "bg-amber-50 text-amber-600" },
    { label: "פגי תוקף", value: 2, icon: AlertTriangle, color: "bg-red-50 text-red-600" },
  ];

  return (
    <div dir="rtl" className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg">
          <KeyRound className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">כספת הרשאות ואימות</h1>
          <p className="text-sm text-muted-foreground">טכנו-כל עוזי &mdash; ניהול אישורים, מפתחות API, טוקנים ותעודות</p>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {kpis.map((k) => (
          <Card key={k.label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg ${k.color} flex items-center justify-center`}>
                <k.icon className="w-4.5 h-4.5" />
              </div>
              <div>
                <div className="text-xl font-bold">{k.value}</div>
                <div className="text-xs text-muted-foreground">{k.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start">
          <TabsTrigger value="vault"><Lock className="w-4 h-4 ml-1.5" />Vault ({credentials.length})</TabsTrigger>
          <TabsTrigger value="apikeys"><KeyRound className="w-4 h-4 ml-1.5" />API Keys ({apiKeys.length})</TabsTrigger>
          <TabsTrigger value="oauth"><Globe className="w-4 h-4 ml-1.5" />OAuth Tokens ({oauthTokens.length})</TabsTrigger>
          <TabsTrigger value="certs"><FileKey className="w-4 h-4 ml-1.5" />Certificates ({certificates.length})</TabsTrigger>
        </TabsList>

        {/* TAB: Vault */}
        <TabsContent value="vault">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg"><Shield className="w-5 h-5" /> כל ה-Credentials במערכת</CardTitle>
            </CardHeader>
            <CardContent className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">מזהה</TableHead>
                    <TableHead className="text-right">שם</TableHead>
                    <TableHead className="text-right">סוג</TableHead>
                    <TableHead className="text-right">שירות מחובר</TableHead>
                    <TableHead className="text-right">נוצר ע"י</TableHead>
                    <TableHead className="text-right">נוצר בתאריך</TableHead>
                    <TableHead className="text-right">תוקף עד</TableHead>
                    <TableHead className="text-right">שימוש אחרון</TableHead>
                    <TableHead className="text-right">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {credentials.map((c) => (
                    <TableRow key={c.id} className={c.status === "expired" ? "bg-red-50/50" : c.status === "revoked" ? "bg-gray-50/50" : ""}>
                      <TableCell className="font-mono text-xs">{c.id}</TableCell>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>{typeBadge(c.type)}</TableCell>
                      <TableCell>{c.service}</TableCell>
                      <TableCell>{c.createdBy}</TableCell>
                      <TableCell className="text-xs">{c.createdAt}</TableCell>
                      <TableCell className="text-xs">
                        {c.status === "expired" && <AlertTriangle className="w-3.5 h-3.5 text-red-500 inline ml-1" />}
                        {c.expiresAt}
                      </TableCell>
                      <TableCell className="text-xs">{c.lastUsed}</TableCell>
                      <TableCell>{statusBadge(c.status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: API Keys */}
        <TabsContent value="apikeys">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg"><KeyRound className="w-5 h-5" /> מפתחות API פעילים</CardTitle>
            </CardHeader>
            <CardContent className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">#</TableHead>
                    <TableHead className="text-right">קידומת מפתח</TableHead>
                    <TableHead className="text-right">Scope</TableHead>
                    <TableHead className="text-right">Rate Limit</TableHead>
                    <TableHead className="text-right">קריאות החודש</TableHead>
                    <TableHead className="text-right">נוצר ע"י</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {apiKeys.map((k, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell><MaskedValue value={k.prefix} /></TableCell>
                      <TableCell><Badge variant="outline" className="font-mono text-xs">{k.scope}</Badge></TableCell>
                      <TableCell className="text-sm">{k.rateLimit}</TableCell>
                      <TableCell className="font-medium">{k.callsMonth.toLocaleString()}</TableCell>
                      <TableCell>{k.createdBy}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: OAuth Tokens */}
        <TabsContent value="oauth">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg"><Globe className="w-5 h-5" /> OAuth Tokens &mdash; טוקנים פעילים</CardTitle>
            </CardHeader>
            <CardContent className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">#</TableHead>
                    <TableHead className="text-right">שירות</TableHead>
                    <TableHead className="text-right">Grant Type</TableHead>
                    <TableHead className="text-right">Scopes</TableHead>
                    <TableHead className="text-right">תוקף נותר</TableHead>
                    <TableHead className="text-right">סטטוס Refresh</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {oauthTokens.map((t, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">{t.service}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{t.grantType}</Badge></TableCell>
                      <TableCell className="font-mono text-xs max-w-[200px] truncate">{t.scopes}</TableCell>
                      <TableCell>{t.expiresIn}</TableCell>
                      <TableCell>
                        {t.refreshStatus === "פעיל" ? (
                          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100"><RefreshCw className="w-3 h-3 ml-1" />{t.refreshStatus}</Badge>
                        ) : t.refreshStatus === "ידני" ? (
                          <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100"><Clock className="w-3 h-3 ml-1" />{t.refreshStatus}</Badge>
                        ) : (
                          <Badge variant="secondary">{t.refreshStatus}</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: Certificates */}
        <TabsContent value="certs">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg"><FileKey className="w-5 h-5" /> תעודות SSL/TLS</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {certificates.map((cert, i) => (
                <Card key={i} className={`border ${cert.daysRemaining <= 0 ? "border-red-300 bg-red-50/40" : cert.daysRemaining <= 30 ? "border-orange-300 bg-orange-50/40" : "border-border"}`}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <Shield className={`w-4 h-4 ${certColor(cert.daysRemaining)}`} />
                        <span className="font-mono font-medium">{cert.cn}</span>
                      </div>
                      {cert.daysRemaining <= 0 ? (
                        <Badge className="bg-red-100 text-red-700 hover:bg-red-100"><XCircle className="w-3 h-3 ml-1" />פג תוקף - נדרש חידוש מיידי!</Badge>
                      ) : cert.daysRemaining <= 30 ? (
                        <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100"><AlertTriangle className="w-3 h-3 ml-1" />תוקף עומד לפוג - {cert.daysRemaining} ימים</Badge>
                      ) : (
                        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100"><CheckCircle className="w-3 h-3 ml-1" />{cert.daysRemaining} ימים</Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div><span className="text-muted-foreground">Issuer: </span>{cert.issuer}</div>
                      <div><span className="text-muted-foreground">תקף מ: </span>{cert.validFrom}</div>
                      <div><span className="text-muted-foreground">תקף עד: </span>{cert.validTo}</div>
                      <div><span className="text-muted-foreground">ימים שנותרו: </span><span className={`font-bold ${certColor(cert.daysRemaining)}`}>{cert.daysRemaining}</span></div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">תוקף:</span>
                      <Progress value={certProgress(cert.daysRemaining)} className="h-2 flex-1" />
                      <span className={`text-xs font-medium ${certColor(cert.daysRemaining)}`}>{cert.daysRemaining <= 0 ? "0%" : `${100 - certProgress(cert.daysRemaining)}%`}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Security Notice */}
      <Card className="border-amber-200 bg-amber-50/60">
        <CardContent className="p-4 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="space-y-1">
            <p className="font-medium text-sm text-amber-800">תזכורת אבטחה</p>
            <ul className="text-xs text-amber-700 list-disc list-inside space-y-0.5">
              <li>2 credentials עם תוקף שפג &mdash; נדרש חידוש או ביטול מיידי</li>
              <li>יש לבצע רוטציה למפתחות API כל 90 יום בהתאם למדיניות אבטחה</li>
              <li>ערכים רגישים מוצגים במצב מוסתר &mdash; לחצו על סמל העין לחשיפה</li>
              <li>כל פעולה מתועדת ב-Audit Log לצורך ביקורת ותאימות</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
