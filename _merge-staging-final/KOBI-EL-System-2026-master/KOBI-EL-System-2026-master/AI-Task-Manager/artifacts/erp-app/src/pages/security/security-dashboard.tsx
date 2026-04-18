import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Shield, AlertTriangle, Globe, Key, Zap, Lock, CheckCircle2, XCircle, RefreshCw, FileText, Database, Server, CheckCircle, Clock, Users, Eye, ChevronLeft } from "lucide-react";
import { authFetch } from "@/lib/utils";
import { Link } from "wouter";
import IpManagementTab from "./tabs/ip-management";
import GeoBlockingTab from "./tabs/geo-blocking";
import VulnerabilityTab from "./tabs/vulnerability-tracker";
import RateLimitTab from "./tabs/rate-limit-config";
import ApiKeysSecurityTab from "./tabs/api-keys-security";
import WebhookSecretsTab from "./tabs/webhook-secrets";
import CorsManagementTab from "./tabs/cors-management";

const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") + "/api";

interface DashboardStats {
  securityScore: number;
  ipRules: { total: number; blacklisted: number; whitelisted: number };
  geoRules: { total: number; denied: number };
  blockedLast24h: number;
  vulnerabilities: { critical: number; high: number; medium: number; low: number; info: number; open: number; resolved: number };
  totalVulnerabilities: number;
  apiKeys: { total: number; active: number };
  rateLimitRules: number;
}

function ScoreRing({ score }: { score: number }) {
  const color = score >= 80 ? "#22c55e" : score >= 60 ? "#f59e0b" : "#ef4444";
  const r = 42;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <div className="relative flex items-center justify-center w-28 h-28">
      <svg className="w-28 h-28 -rotate-90" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r={r} fill="none" stroke="#e5e7eb" strokeWidth="8" />
        <circle cx="48" cy="48" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round" />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-2xl font-bold" style={{ color }}>{score}</span>
        <span className="text-xs text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
}

const StatusBadge = ({ good, total }: { good: number; total: number }) => {
  const pct = total > 0 ? Math.round((good / total) * 100) : 0;
  const color = pct >= 80 ? "bg-green-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-medium min-w-[36px] text-left">{pct}%</span>
    </div>
  );
};

export default function SecurityDashboard() {
  const { toast } = useToast();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [overview, setOverview] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");

  const loadStats = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("erp_auth_token");
      const [statsRes, overviewRes] = await Promise.all([
        fetch(`${API_BASE}/security/dashboard-stats`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        authFetch(`${API_BASE}/security/overview`).catch(() => null),
      ]);
      if (statsRes.ok) setStats(await statsRes.json());
      if (overviewRes?.ok) setOverview(await overviewRes.json());
    } catch {
      toast({ title: "Error loading security stats", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadStats(); }, []);

  const vulnColor = (sev: string) => ({
    critical: "bg-red-500 text-foreground",
    high: "bg-orange-500 text-foreground",
    medium: "bg-yellow-500 text-foreground",
    low: "bg-blue-500 text-foreground",
    info: "bg-gray-400 text-foreground",
  }[sev] || "bg-gray-300");

  const encPct = overview?.encryption?.total > 0
    ? Math.round((overview.encryption.encrypted / overview.encryption.total) * 100)
    : 0;

  const securityModules = [
    { title: "ניהול הצפנה", desc: "הצפנת שדות רגישים AES-256 וניהול מפתחות", icon: Lock, href: "/security/encryption", color: "bg-green-600" },
    { title: "יומן ביקורת", desc: "מעקב CRUD מלא עם שרשרת hash לאי-זיוף", icon: Eye, href: "/audit-log", color: "bg-blue-600" },
    { title: "מרכז GDPR", desc: "DSAR, הסכמות, מחיקה ומדיניות שמירת נתונים", icon: Shield, href: "/security/gdpr", color: "bg-purple-600" },
    { title: "מדיניות שמירת נתונים", desc: "ניהול תקופות שמירה לפי ישות וחוק", icon: Clock, href: "/security/retention", color: "bg-amber-600" },
    { title: "דוחות תאימות", desc: "ISO 27001 | SOC 2 | חוק הגנת הפרטיות", icon: FileText, href: "/security/compliance-reports", color: "bg-cyan-600" },
    { title: "ניהול גיבויים ו-DR", desc: "גיבויים, בדיקות שחזור ולוח זמנים", icon: Server, href: "/security/backups", color: "bg-rose-600" },
  ];

  return (
    <div className="p-6 space-y-6" dir="ltr">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center">
            <Shield className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Security Dashboard</h1>
            <p className="text-sm text-muted-foreground">Network & API hardening · Compliance · Data Protection</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={loadStats} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap gap-1 h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="ip">IP Rules</TabsTrigger>
          <TabsTrigger value="geo">Geo Blocking</TabsTrigger>
          <TabsTrigger value="vulnerabilities">Vulnerabilities</TabsTrigger>
          <TabsTrigger value="rate-limit">Rate Limits</TabsTrigger>
          <TabsTrigger value="api-keys">API Keys</TabsTrigger>
          <TabsTrigger value="webhooks">Webhook Secrets</TabsTrigger>
          <TabsTrigger value="cors">CORS Policy</TabsTrigger>
          <TabsTrigger value="compliance">Compliance</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-4">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[1,2,3,4,5,6].map(i => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-5 h-28 bg-muted/20 rounded-xl" />
                </Card>
              ))}
            </div>
          ) : stats ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                <Card className="border-0 shadow-sm bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
                  <CardContent className="p-5 flex items-center gap-4">
                    <ScoreRing score={stats.securityScore} />
                    <div>
                      <div className="text-sm font-medium text-muted-foreground">Security Score</div>
                      <div className="text-xs mt-1 text-muted-foreground">
                        {stats.securityScore >= 80 ? "Good posture" : stats.securityScore >= 60 ? "Needs attention" : "Critical issues"}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-sm">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center">
                        <AlertTriangle className="w-4 h-4 text-orange-500" />
                      </div>
                      <span className="font-medium text-sm">Blocked (24h)</span>
                    </div>
                    <div className="text-3xl font-bold text-orange-600">{stats.blockedLast24h}</div>
                    <div className="text-xs text-muted-foreground mt-1">access attempts blocked</div>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-sm">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
                        <Shield className="w-4 h-4 text-red-500" />
                      </div>
                      <span className="font-medium text-sm">Open Vulnerabilities</span>
                    </div>
                    <div className="text-3xl font-bold text-red-600">{stats.vulnerabilities.open}</div>
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {stats.vulnerabilities.critical > 0 && (
                        <Badge className={`text-xs ${vulnColor("critical")}`}>C:{stats.vulnerabilities.critical}</Badge>
                      )}
                      {stats.vulnerabilities.high > 0 && (
                        <Badge className={`text-xs ${vulnColor("high")}`}>H:{stats.vulnerabilities.high}</Badge>
                      )}
                      {stats.vulnerabilities.medium > 0 && (
                        <Badge className={`text-xs ${vulnColor("medium")}`}>M:{stats.vulnerabilities.medium}</Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-sm">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                        <Globe className="w-4 h-4 text-blue-500" />
                      </div>
                      <span className="font-medium text-sm">IP/Geo Rules</span>
                    </div>
                    <div className="text-3xl font-bold text-blue-600">
                      {stats.ipRules.total + stats.geoRules.total}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {stats.ipRules.blacklisted} blacklisted · {stats.geoRules.denied} countries denied
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <Card className="border-0 shadow-sm">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center">
                        <Key className="w-4 h-4 text-green-600" />
                      </div>
                      <span className="font-medium text-sm">API Keys</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div>
                        <div className="text-2xl font-bold">{stats.apiKeys.active}</div>
                        <div className="text-xs text-muted-foreground">active keys</div>
                      </div>
                      <div className="text-muted-foreground">/</div>
                      <div>
                        <div className="text-2xl font-bold text-muted-foreground">{stats.apiKeys.total}</div>
                        <div className="text-xs text-muted-foreground">total</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-sm">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
                        <Zap className="w-4 h-4 text-purple-600" />
                      </div>
                      <span className="font-medium text-sm">Rate Limit Rules</span>
                    </div>
                    <div className="text-2xl font-bold text-purple-600">{stats.rateLimitRules}</div>
                    <div className="text-xs text-muted-foreground mt-1">custom endpoint configurations</div>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-sm">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      </div>
                      <span className="font-medium text-sm">Resolved Vulnerabilities</span>
                    </div>
                    <div className="text-2xl font-bold text-emerald-600">{stats.vulnerabilities.resolved}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {stats.totalVulnerabilities > 0
                        ? `${Math.round((stats.vulnerabilities.resolved / stats.totalVulnerabilities) * 100)}% resolution rate`
                        : "No vulnerabilities tracked"}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Security Controls Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                      { label: "IP Filtering", active: stats.ipRules.total > 0, desc: `${stats.ipRules.blacklisted} blacklist rules` },
                      { label: "Geo-Blocking", active: stats.geoRules.total > 0, desc: `${stats.geoRules.denied} countries denied` },
                      { label: "Rate Limiting", active: true, desc: "Global + per-user limits active" },
                      { label: "API Key Auth", active: stats.apiKeys.active > 0, desc: `${stats.apiKeys.active} active keys` },
                      { label: "Request Signing", active: true, desc: "Webhook signatures enforced" },
                      { label: "CSRF Protection", active: true, desc: "Origin validation active" },
                      { label: "Security Headers", active: true, desc: "Helmet CSP, HSTS active" },
                      { label: "Audit Logging", active: true, desc: "All API calls logged" },
                    ].map(control => (
                      <div key={control.label} className="flex items-start gap-3 p-3 rounded-lg border border-border">
                        {control.active ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                        )}
                        <div>
                          <div className="text-sm font-medium">{control.label}</div>
                          <div className="text-xs text-muted-foreground">{control.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="text-center py-12 text-muted-foreground">Failed to load security stats</div>
          )}
        </TabsContent>

        <TabsContent value="ip" className="mt-4">
          <IpManagementTab />
        </TabsContent>

        <TabsContent value="geo" className="mt-4">
          <GeoBlockingTab />
        </TabsContent>

        <TabsContent value="vulnerabilities" className="mt-4">
          <VulnerabilityTab />
        </TabsContent>

        <TabsContent value="rate-limit" className="mt-4">
          <RateLimitTab />
        </TabsContent>

        <TabsContent value="api-keys" className="mt-4">
          <ApiKeysSecurityTab />
        </TabsContent>

        <TabsContent value="webhooks" className="mt-4">
          <WebhookSecretsTab />
        </TabsContent>

        <TabsContent value="cors" className="mt-4">
          <CorsManagementTab />
        </TabsContent>

        <TabsContent value="compliance" className="mt-4 space-y-6" dir="rtl">
          {overview && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {[
                { label: "רשומות ביקורת", value: (overview?.audit?.total || 0).toLocaleString("he-IL"), sub: `${overview?.audit?.last_24h || 0} ב-24 שעות`, icon: Eye, color: "bg-blue-600", href: "/audit-log" },
                { label: "כיסוי הצפנה", value: `${encPct}%`, sub: `${overview?.encryption?.encrypted || 0}/${overview?.encryption?.total || 0} שדות`, icon: Lock, color: encPct >= 70 ? "bg-green-600" : "bg-amber-600", href: "/security/encryption" },
                { label: "בקשות DSAR", value: overview?.dsar?.total || 0, sub: `${overview?.dsar?.pending || 0} ממתינות`, icon: Users, color: "bg-purple-600", href: "/security/gdpr" },
                { label: "מדיניות שמירה", value: overview?.retention?.active || 0, sub: "פוליסות פעילות", icon: Clock, color: "bg-amber-600", href: "/security/retention" },
                { label: "גיבויים", value: overview?.backups?.total || 0, sub: `${overview?.backups?.completed || 0} הושלמו`, icon: Server, color: "bg-rose-600", href: "/security/backups" },
              ].map((item) => (
                <Link key={item.href} href={item.href}>
                  <div className="bg-card border border-border/50 rounded-2xl p-5 hover:border-primary/30 transition-colors cursor-pointer group">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className={`w-9 h-9 rounded-xl ${item.color} flex items-center justify-center mb-3`}>
                          <item.icon size={18} className="text-foreground" />
                        </div>
                        <div className="text-2xl font-bold">{item.value ?? "—"}</div>
                        <div className="text-sm text-muted-foreground mt-0.5">{item.label}</div>
                        {item.sub && <div className="text-xs text-muted-foreground/70 mt-1">{item.sub}</div>}
                      </div>
                      <ChevronLeft size={16} className="text-muted-foreground group-hover:text-primary transition-colors mt-1" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  מצב אבטחה כולל
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">הצפנת שדות</span>
                    <span className="font-medium">{encPct}%</span>
                  </div>
                  <StatusBadge good={overview?.encryption?.encrypted || 0} total={overview?.encryption?.total || 1} />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">בקשות DSAR מטופלות</span>
                    <span className="font-medium">
                      {overview?.dsar?.total > 0 ? Math.round(((overview.dsar.total - overview.dsar.pending) / overview.dsar.total) * 100) : 100}%
                    </span>
                  </div>
                  <StatusBadge good={(overview?.dsar?.total || 0) - (overview?.dsar?.pending || 0)} total={Math.max(1, overview?.dsar?.total || 1)} />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">גיבויים מוצלחים</span>
                    <span className="font-medium">
                      {overview?.backups?.total > 0 ? Math.round((overview.backups.completed / overview.backups.total) * 100) : 0}%
                    </span>
                  </div>
                  <StatusBadge good={overview?.backups?.completed || 0} total={Math.max(1, overview?.backups?.total || 1)} />
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  התראות תאימות
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {encPct < 70 && (
                  <div className="flex items-start gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                    <AlertTriangle size={16} className="text-amber-400 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-sm font-medium text-amber-300">כיסוי הצפנה נמוך</div>
                      <div className="text-xs text-muted-foreground mt-0.5">רק {encPct}% מהשדות הרגישים מוצפנים — המלצה: הצפן לפחות 80%</div>
                    </div>
                  </div>
                )}
                {(overview?.dsar?.pending || 0) > 0 && (
                  <div className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                    <AlertTriangle size={16} className="text-red-400 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-sm font-medium text-red-300">בקשות DSAR ממתינות</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{overview?.dsar?.pending} בקשות לא טופלו — GDPR מחייב מענה תוך 30 יום</div>
                    </div>
                  </div>
                )}
                {(encPct >= 70 || !overview) && (overview?.dsar?.pending || 0) === 0 && (
                  <div className="flex items-center gap-3 p-3 bg-green-500/10 border border-green-500/20 rounded-xl">
                    <CheckCircle size={16} className="text-green-400 shrink-0" />
                    <div className="text-sm text-green-300">מצב תאימות תקין — אין התראות פעילות</div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div>
            <h2 className="font-bold mb-4 flex items-center gap-2">
              <Database size={18} className="text-primary" />
              מודולי אבטחה ותאימות
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {securityModules.map((mod, i) => (
                <Link key={i} href={mod.href}>
                  <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="bg-card border border-border/50 rounded-2xl p-5 hover:border-primary/40 transition-all cursor-pointer group"
                  >
                    <div className={`w-10 h-10 rounded-xl ${mod.color} flex items-center justify-center mb-3 group-hover:scale-105 transition-transform`}>
                      <mod.icon size={20} className="text-foreground" />
                    </div>
                    <div className="font-bold">{mod.title}</div>
                    <div className="text-xs text-muted-foreground mt-1">{mod.desc}</div>
                  </motion.div>
                </Link>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
