import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Key, Shield, Users, AlertTriangle, RefreshCw, Clock, CheckCircle, XCircle,
  Copy, Trash2, RotateCcw, Search, Plus, Eye, EyeOff, Lock, Webhook,
  ShieldCheck, FileKey, UserCog, Timer, Ban,
} from "lucide-react";

/* ── KPI Data ── */
const kpis = [
  { label: 'סה"כ מפתחות API', value: "34", icon: Key, color: "text-blue-600 bg-blue-50", border: "border-blue-200" },
  { label: "לקוחות OAuth פעילים", value: "8", icon: Shield, color: "text-violet-600 bg-violet-50", border: "border-violet-200" },
  { label: "טוקנים פגים ב-7 ימים", value: "5", icon: AlertTriangle, color: "text-amber-600 bg-amber-50", border: "border-amber-200" },
  { label: "טוקנים שבוטלו היום", value: "3", icon: Ban, color: "text-red-600 bg-red-50", border: "border-red-200" },
  { label: "חשבונות שירות", value: "12", icon: UserCog, color: "text-emerald-600 bg-emerald-50", border: "border-emerald-200" },
  { label: "מפתחות חתימת Webhook", value: "9", icon: Webhook, color: "text-teal-600 bg-teal-50", border: "border-teal-200" },
];

/* ── API Keys ── */
const apiKeys = [
  { id: 1, name: "ERP Production Gateway", prefix: "sk_live_4f8a...x9kR", owner: "עוזי כהן", scope: "production:full", created: "2025-08-12", lastUsed: "לפני 2 דקות", status: "active", rateLimit: "1,000/דקה", usage: 78 },
  { id: 2, name: "Salesforce Sync", prefix: "sk_live_7b2c...mT3q", owner: "מיכל לוי", scope: "crm:read,write", created: "2025-11-03", lastUsed: "לפני 5 דקות", status: "active", rateLimit: "500/דקה", usage: 62 },
  { id: 3, name: "Sandbox Testing", prefix: "sk_test_9d1e...pL5w", owner: "דני אברהם", scope: "sandbox:full", created: "2026-01-15", lastUsed: "לפני שעה", status: "active", rateLimit: "2,000/דקה", usage: 45 },
  { id: 4, name: "Mobile App Backend", prefix: "sk_live_2a6f...nH8j", owner: "רונית שרון", scope: "mobile:api", created: "2025-09-22", lastUsed: "לפני 10 דקות", status: "active", rateLimit: "800/דקה", usage: 91 },
  { id: 5, name: "Inventory Service", prefix: "sk_live_5c3d...bK1m", owner: "עוזי כהן", scope: "inventory:read,write", created: "2025-06-20", lastUsed: "לפני 3 דקות", status: "active", rateLimit: "600/דקה", usage: 54 },
  { id: 6, name: "Analytics Pipeline", prefix: "sk_live_8e7g...vQ4s", owner: "דני אברהם", scope: "analytics:read", created: "2025-12-01", lastUsed: "לפני 15 דקות", status: "active", rateLimit: "1,200/דקה", usage: 33 },
  { id: 7, name: "Webhook Delivery", prefix: "sk_live_1f9h...cW6t", owner: "עוזי כהן", scope: "webhooks:manage", created: "2026-02-10", lastUsed: "לפני דקה", status: "active", rateLimit: "300/דקה", usage: 87 },
  { id: 8, name: "Email Service", prefix: "sk_live_3g4k...dR2u", owner: "רונית שרון", scope: "email:send", created: "2025-10-22", lastUsed: "לפני 8 דקות", status: "active", rateLimit: "200/דקה", usage: 41 },
  { id: 9, name: "Legacy B2B Portal", prefix: "sk_live_6h5j...eS7v", owner: "מיכל לוי", scope: "b2b:read", created: "2024-11-05", lastUsed: "לפני 3 ימים", status: "expired", rateLimit: "400/דקה", usage: 0 },
  { id: 10, name: "CI/CD Pipeline", prefix: "sk_svc_0k8l...gU9w", owner: "מערכת DevOps", scope: "deploy:execute", created: "2026-03-01", lastUsed: "לפני 30 דקות", status: "active", rateLimit: "100/דקה", usage: 22 },
];

/* ── OAuth Clients ── */
const oauthClients = [
  { id: 1, name: "Salesforce CRM", clientId: "sf_client_a4b2c8d1", grantType: "authorization_code", redirectUris: ["https://erp.techno-kol.co.il/callback/sf"], scopes: "api, refresh_token, full", status: "active" },
  { id: 2, name: "Google Workspace", clientId: "goog_client_e5f3g9h2", grantType: "authorization_code", redirectUris: ["https://erp.techno-kol.co.il/callback/google"], scopes: "drive, calendar, gmail.send", status: "active" },
  { id: 3, name: "Azure AD SSO", clientId: "azr_client_i6j4k0l3", grantType: "client_credentials", redirectUris: [], scopes: "Directory.Read, User.Read", status: "active" },
  { id: 4, name: "HubSpot Marketing", clientId: "hub_client_m7n5o1p4", grantType: "authorization_code", redirectUris: ["https://erp.techno-kol.co.il/callback/hubspot"], scopes: "contacts, content, automation", status: "active" },
  { id: 5, name: "Slack Workspace", clientId: "slk_client_q8r6s2t5", grantType: "authorization_code", redirectUris: ["https://erp.techno-kol.co.il/callback/slack"], scopes: "chat:write, channels:read", status: "active" },
  { id: 6, name: "GitHub Actions", clientId: "gh_client_u9v7w3x6", grantType: "client_credentials", redirectUris: [], scopes: "repo, workflow, read:org", status: "active" },
  { id: 7, name: "Tranzila Payments", clientId: "trz_client_y0z8a4b7", grantType: "client_credentials", redirectUris: [], scopes: "payments:process", status: "inactive" },
  { id: 8, name: "חילן שכר", clientId: "hln_client_c1d9e5f8", grantType: "authorization_code", redirectUris: ["https://erp.techno-kol.co.il/callback/hilan"], scopes: "payroll:read, employees:sync", status: "active" },
];

/* ── Active Tokens ── */
const activeTokens = [
  { id: 1, type: "bearer", issuedTo: "עוזי כהן", scope: "production:full", issuedAt: "2026-04-08 06:30", expiresAt: "2026-04-08 18:30", lastActivity: "לפני 2 דקות" },
  { id: 2, type: "bearer", issuedTo: "מיכל לוי", scope: "crm:read,write", issuedAt: "2026-04-08 07:15", expiresAt: "2026-04-08 19:15", lastActivity: "לפני 5 דקות" },
  { id: 3, type: "refresh", issuedTo: "Salesforce OAuth", scope: "api, full", issuedAt: "2026-04-01 09:00", expiresAt: "2026-05-01 09:00", lastActivity: "לפני 8 דקות" },
  { id: 4, type: "service", issuedTo: "n8n Automation", scope: "workflows:execute", issuedAt: "2026-03-15 00:00", expiresAt: "2026-06-15 00:00", lastActivity: "לפני דקה" },
  { id: 5, type: "bearer", issuedTo: "דני אברהם", scope: "analytics:read", issuedAt: "2026-04-08 08:00", expiresAt: "2026-04-08 20:00", lastActivity: "לפני 15 דקות" },
  { id: 6, type: "refresh", issuedTo: "Google OAuth", scope: "drive, calendar", issuedAt: "2026-04-05 10:30", expiresAt: "2026-04-12 10:30", lastActivity: "לפני 42 דקות" },
  { id: 7, type: "service", issuedTo: "CI/CD Pipeline", scope: "deploy:execute", issuedAt: "2026-04-01 00:00", expiresAt: "2026-07-01 00:00", lastActivity: "לפני 30 דקות" },
  { id: 8, type: "bearer", issuedTo: "רונית שרון", scope: "email:send, contacts:read", issuedAt: "2026-04-08 07:45", expiresAt: "2026-04-08 19:45", lastActivity: "לפני 8 דקות" },
  { id: 9, type: "refresh", issuedTo: "Azure AD", scope: "Directory.Read", issuedAt: "2026-04-03 14:00", expiresAt: "2026-04-10 14:00", lastActivity: "לפני 3 שעות" },
  { id: 10, type: "service", issuedTo: "Webhook Relay", scope: "webhooks:deliver", issuedAt: "2026-03-20 00:00", expiresAt: "2026-06-20 00:00", lastActivity: "לפני דקה" },
  { id: 11, type: "bearer", issuedTo: "אפליקציית מובייל", scope: "mobile:api", issuedAt: "2026-04-08 06:00", expiresAt: "2026-04-08 18:00", lastActivity: "לפני 10 דקות" },
  { id: 12, type: "refresh", issuedTo: "HubSpot OAuth", scope: "contacts, content", issuedAt: "2026-04-06 11:00", expiresAt: "2026-04-13 11:00", lastActivity: "לפני שעה" },
];

/* ── Service Accounts ── */
const serviceAccounts = [
  { id: 1, name: "n8n Automation Engine", serviceType: "Workflow Orchestrator", authMode: "bearer_token" as const, lastRotation: "2026-03-28", permissions: "workflows:*, triggers:*", status: "active" },
  { id: 2, name: "SAP S/4HANA Connector", serviceType: "ERP Integration", authMode: "oauth2" as const, lastRotation: "2026-04-01", permissions: "orders:sync, inventory:sync", status: "active" },
  { id: 3, name: "Webhook Signing Service", serviceType: "Event Delivery", authMode: "hmac_signature" as const, lastRotation: "2026-03-15", permissions: "webhooks:sign, events:emit", status: "active" },
  { id: 4, name: "CI/CD Deployer", serviceType: "DevOps Pipeline", authMode: "service_account" as const, lastRotation: "2026-04-05", permissions: "deploy:*, builds:read", status: "active" },
  { id: 5, name: "Monitoring Collector", serviceType: "Observability", authMode: "api_key" as const, lastRotation: "2026-03-20", permissions: "metrics:write, health:read", status: "active" },
  { id: 6, name: "Email Relay Service", serviceType: "Communications", authMode: "api_key" as const, lastRotation: "2026-04-02", permissions: "email:send, templates:read", status: "active" },
  { id: 7, name: "Internal Token Issuer", serviceType: "Auth Infrastructure", authMode: "internal_signed_token" as const, lastRotation: "2026-03-10", permissions: "tokens:issue, tokens:revoke", status: "active" },
  { id: 8, name: "Legacy FTP Bridge", serviceType: "File Transfer", authMode: "api_key" as const, lastRotation: "2025-09-12", permissions: "files:read, files:write", status: "inactive" },
];

/* ── Rotation Policies ── */
const rotationPolicies = [
  { id: 1, name: "מפתחות API ייצור", target: "API Keys (Production)", interval: "90 יום", nextRotation: "2026-04-15", autoRotate: true, notifyDays: 14, compliance: "SOC2", compStatus: "compliant" },
  { id: 2, name: "OAuth Refresh Tokens", target: "OAuth2 Refresh", interval: "30 יום", nextRotation: "2026-04-12", autoRotate: true, notifyDays: 7, compliance: "ISO 27001", compStatus: "compliant" },
  { id: 3, name: "חשבונות שירות", target: "Service Accounts", interval: "180 יום", nextRotation: "2026-06-15", autoRotate: false, notifyDays: 30, compliance: "SOC2", compStatus: "compliant" },
  { id: 4, name: "HMAC Signing Keys", target: "Webhook HMAC", interval: "60 יום", nextRotation: "2026-04-10", autoRotate: true, notifyDays: 7, compliance: "PCI-DSS", compStatus: "warning" },
  { id: 5, name: "Internal Signed Tokens", target: "Internal JWT", interval: "365 יום", nextRotation: "2027-01-10", autoRotate: false, notifyDays: 60, compliance: "ISO 27001", compStatus: "compliant" },
  { id: 6, name: "Sandbox Keys", target: "Test API Keys", interval: "30 יום", nextRotation: "2026-04-20", autoRotate: true, notifyDays: 5, compliance: "ללא", compStatus: "exempt" },
];

const statusBadge = (s: string) => {
  if (s === "active") return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">פעיל</Badge>;
  if (s === "expired") return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">פג תוקף</Badge>;
  if (s === "inactive") return <Badge className="bg-gray-200 text-gray-600 hover:bg-gray-200">לא פעיל</Badge>;
  if (s === "revoked") return <Badge className="bg-slate-200 text-slate-600 hover:bg-slate-200">בוטל</Badge>;
  return <Badge variant="outline">{s}</Badge>;
};

const tokenTypeBadge = (t: string) => {
  const m: Record<string, string> = { bearer: "bg-blue-100 text-blue-700", refresh: "bg-violet-100 text-violet-700", service: "bg-teal-100 text-teal-700" };
  const labels: Record<string, string> = { bearer: "Bearer", refresh: "Refresh", service: "Service" };
  return <Badge className={`${m[t] || "bg-gray-100 text-gray-600"} hover:bg-transparent`}>{labels[t] || t}</Badge>;
};

const authModeBadge = (mode: string) => {
  const m: Record<string, { bg: string; label: string }> = {
    api_key: { bg: "bg-blue-100 text-blue-700", label: "API Key" },
    bearer_token: { bg: "bg-indigo-100 text-indigo-700", label: "Bearer Token" },
    oauth2: { bg: "bg-violet-100 text-violet-700", label: "OAuth 2.0" },
    hmac_signature: { bg: "bg-amber-100 text-amber-700", label: "HMAC Signature" },
    service_account: { bg: "bg-emerald-100 text-emerald-700", label: "Service Account" },
    internal_signed_token: { bg: "bg-rose-100 text-rose-700", label: "Internal Signed" },
  };
  const cfg = m[mode] || { bg: "bg-gray-100 text-gray-600", label: mode };
  return <Badge className={`${cfg.bg} hover:bg-transparent`}>{cfg.label}</Badge>;
};

const grantBadge = (g: string) => {
  const m: Record<string, string> = { authorization_code: "bg-blue-100 text-blue-700", client_credentials: "bg-orange-100 text-orange-700" };
  const labels: Record<string, string> = { authorization_code: "Authorization Code", client_credentials: "Client Credentials" };
  return <Badge className={`${m[g] || "bg-gray-100 text-gray-600"} hover:bg-transparent`}>{labels[g] || g}</Badge>;
};

const complianceBadge = (s: string) => {
  if (s === "compliant") return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">תקין</Badge>;
  if (s === "warning") return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">אזהרה</Badge>;
  if (s === "exempt") return <Badge className="bg-gray-100 text-gray-500 hover:bg-gray-100">פטור</Badge>;
  return <Badge variant="outline">{s}</Badge>;
};

export default function AuthTokensPage() {
  const [search, setSearch] = useState("");
  return (
    <div dir="rtl" className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">ניהול טוקנים ואימות</h1>
          <p className="text-muted-foreground text-sm mt-1">מפתחות API, לקוחות OAuth, טוקנים פעילים וחשבונות שירות</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><RefreshCw className="h-4 w-4 ml-1" />רענן הכל</Button>
          <Button size="sm"><Plus className="h-4 w-4 ml-1" />מפתח חדש</Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((k) => (
          <Card key={k.label} className={`border ${k.border}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className={`p-2 rounded-lg ${k.color}`}><k.icon className="h-4 w-4" /></div>
              </div>
              <div className="text-2xl font-bold">{k.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{k.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="חיפוש מפתח, טוקן או חשבון..." className="pr-10" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="api-keys" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5 h-auto">
          <TabsTrigger value="api-keys" className="text-xs sm:text-sm py-2"><Key className="h-4 w-4 ml-1" />מפתחות API</TabsTrigger>
          <TabsTrigger value="oauth" className="text-xs sm:text-sm py-2"><Shield className="h-4 w-4 ml-1" />לקוחות OAuth</TabsTrigger>
          <TabsTrigger value="tokens" className="text-xs sm:text-sm py-2"><FileKey className="h-4 w-4 ml-1" />טוקנים פעילים</TabsTrigger>
          <TabsTrigger value="service-accounts" className="text-xs sm:text-sm py-2"><UserCog className="h-4 w-4 ml-1" />חשבונות שירות</TabsTrigger>
          <TabsTrigger value="rotation" className="text-xs sm:text-sm py-2"><RotateCcw className="h-4 w-4 ml-1" />מדיניות סיבוב</TabsTrigger>
        </TabsList>

        {/* Tab 1: API Keys */}
        <TabsContent value="api-keys">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2"><Key className="h-5 w-5 text-blue-600" />מפתחות API ({apiKeys.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">שם מפתח</TableHead>
                    <TableHead className="text-right">Prefix</TableHead>
                    <TableHead className="text-right">בעלים</TableHead>
                    <TableHead className="text-right">Scope</TableHead>
                    <TableHead className="text-right">נוצר</TableHead>
                    <TableHead className="text-right">שימוש אחרון</TableHead>
                    <TableHead className="text-right">סטטוס</TableHead>
                    <TableHead className="text-right">Rate Limit</TableHead>
                    <TableHead className="text-right">ניצולת</TableHead>
                    <TableHead className="text-right">פעולות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {apiKeys.filter((k) => !search || k.name.toLowerCase().includes(search.toLowerCase()) || k.owner.includes(search)).map((k) => (
                    <TableRow key={k.id}>
                      <TableCell className="font-medium">{k.name}</TableCell>
                      <TableCell><code className="text-xs bg-muted px-2 py-1 rounded">{k.prefix}</code></TableCell>
                      <TableCell>{k.owner}</TableCell>
                      <TableCell><code className="text-xs">{k.scope}</code></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{k.created}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{k.lastUsed}</TableCell>
                      <TableCell>{statusBadge(k.status)}</TableCell>
                      <TableCell className="text-sm">{k.rateLimit}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 min-w-[100px]">
                          <Progress value={k.usage} className="h-2 flex-1" />
                          <span className={`text-xs font-medium ${k.usage > 85 ? "text-red-600" : k.usage > 60 ? "text-amber-600" : "text-emerald-600"}`}>{k.usage}%</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7"><Copy className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7"><RefreshCw className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700"><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: OAuth Clients */}
        <TabsContent value="oauth">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2"><Shield className="h-5 w-5 text-violet-600" />לקוחות OAuth ({oauthClients.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">שם לקוח</TableHead>
                    <TableHead className="text-right">Client ID</TableHead>
                    <TableHead className="text-right">Grant Type</TableHead>
                    <TableHead className="text-right">Redirect URIs</TableHead>
                    <TableHead className="text-right">Scopes</TableHead>
                    <TableHead className="text-right">סטטוס</TableHead>
                    <TableHead className="text-right">פעולות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {oauthClients.filter((c) => !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.clientId.includes(search)).map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell><code className="text-xs bg-muted px-2 py-1 rounded">{c.clientId}</code></TableCell>
                      <TableCell>{grantBadge(c.grantType)}</TableCell>
                      <TableCell className="max-w-[200px]">
                        {c.redirectUris.length > 0
                          ? c.redirectUris.map((u, i) => <div key={i} className="text-xs text-muted-foreground truncate">{u}</div>)
                          : <span className="text-xs text-muted-foreground">ללא (M2M)</span>}
                      </TableCell>
                      <TableCell><code className="text-xs">{c.scopes}</code></TableCell>
                      <TableCell>{statusBadge(c.status)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7"><Copy className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7"><RefreshCw className="h-3.5 w-3.5" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Active Tokens */}
        <TabsContent value="tokens">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2"><FileKey className="h-5 w-5 text-teal-600" />טוקנים פעילים ({activeTokens.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">סוג טוקן</TableHead>
                    <TableHead className="text-right">הונפק ל</TableHead>
                    <TableHead className="text-right">Scope</TableHead>
                    <TableHead className="text-right">הונפק בתאריך</TableHead>
                    <TableHead className="text-right">תפוגה</TableHead>
                    <TableHead className="text-right">פעילות אחרונה</TableHead>
                    <TableHead className="text-right">פעולות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeTokens.filter((t) => !search || t.issuedTo.toLowerCase().includes(search.toLowerCase()) || t.scope.includes(search)).map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>{tokenTypeBadge(t.type)}</TableCell>
                      <TableCell className="font-medium">{t.issuedTo}</TableCell>
                      <TableCell><code className="text-xs">{t.scope}</code></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{t.issuedAt}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{t.expiresAt}</TableCell>
                      <TableCell className="text-sm">{t.lastActivity}</TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 h-7 text-xs">
                          <XCircle className="h-3.5 w-3.5 ml-1" />ביטול
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Service Accounts */}
        <TabsContent value="service-accounts">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2"><UserCog className="h-5 w-5 text-emerald-600" />חשבונות שירות ({serviceAccounts.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">שם חשבון</TableHead>
                    <TableHead className="text-right">סוג שירות</TableHead>
                    <TableHead className="text-right">שיטת אימות</TableHead>
                    <TableHead className="text-right">סיבוב אחרון</TableHead>
                    <TableHead className="text-right">הרשאות</TableHead>
                    <TableHead className="text-right">סטטוס</TableHead>
                    <TableHead className="text-right">פעולות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {serviceAccounts.filter((a) => !search || a.name.toLowerCase().includes(search.toLowerCase())).map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{a.serviceType}</TableCell>
                      <TableCell>{authModeBadge(a.authMode)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{a.lastRotation}</TableCell>
                      <TableCell><code className="text-xs">{a.permissions}</code></TableCell>
                      <TableCell>{statusBadge(a.status)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="סיבוב מפתח"><RotateCcw className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="עריכה"><Lock className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700" title="השבתה"><Ban className="h-3.5 w-3.5" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 5: Rotation Policies */}
        <TabsContent value="rotation">
          <div className="space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="border-emerald-200">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-emerald-50"><CheckCircle className="h-5 w-5 text-emerald-600" /></div>
                    <div>
                      <div className="text-sm text-muted-foreground">תואם מדיניות</div>
                      <div className="text-xl font-bold text-emerald-700">4 / 6</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-amber-200">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-amber-50"><AlertTriangle className="h-5 w-5 text-amber-600" /></div>
                    <div>
                      <div className="text-sm text-muted-foreground">דורש תשומת לב</div>
                      <div className="text-xl font-bold text-amber-700">1</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-blue-200">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-50"><Timer className="h-5 w-5 text-blue-600" /></div>
                    <div>
                      <div className="text-sm text-muted-foreground">סיבוב אוטומטי פעיל</div>
                      <div className="text-xl font-bold text-blue-700">4</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2"><RotateCcw className="h-5 w-5 text-orange-600" />מדיניות סיבוב מפתחות</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">שם מדיניות</TableHead>
                      <TableHead className="text-right">יעד</TableHead>
                      <TableHead className="text-right">מחזור סיבוב</TableHead>
                      <TableHead className="text-right">סיבוב הבא</TableHead>
                      <TableHead className="text-right">סיבוב אוטומטי</TableHead>
                      <TableHead className="text-right">התראה (ימים לפני)</TableHead>
                      <TableHead className="text-right">תקן</TableHead>
                      <TableHead className="text-right">תאימות</TableHead>
                      <TableHead className="text-right">פעולות</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rotationPolicies.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{p.target}</TableCell>
                        <TableCell className="text-sm">{p.interval}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{p.nextRotation}</TableCell>
                        <TableCell>
                          {p.autoRotate
                            ? <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">מופעל</Badge>
                            : <Badge className="bg-gray-100 text-gray-500 hover:bg-gray-100">ידני</Badge>}
                        </TableCell>
                        <TableCell className="text-sm">{p.notifyDays} ימים</TableCell>
                        <TableCell><Badge variant="outline">{p.compliance}</Badge></TableCell>
                        <TableCell>{complianceBadge(p.compStatus)}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="הפעל סיבוב עכשיו"><RotateCcw className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="עריכה"><ShieldCheck className="h-3.5 w-3.5" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}