import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Link2, CheckCircle2, XCircle, AlertTriangle, Clock, RefreshCw,
  Shield, Key, FileKey, Wifi, WifiOff, Plus, Settings, Activity,
} from "lucide-react";

/* ───────────────────── Types ───────────────────── */

type ConnectorStatus = "מחובר" | "מנותק" | "שגיאה" | "בהקמה";

interface Connector {
  id: number;
  name: string;
  nameEn: string;
  category: string;
  status: ConnectorStatus;
  lastSync: string;
  recordsSynced: number;
  health: number;
  authType: string;
  endpoints: number;
  syncSchedule: string;
  errorLog: string[];
}

/* ───────────────────── Static data ───────────────────── */

const CATEGORIES: Record<string, string> = {
  payroll: "שכר ורשויות",
  banking: "בנקאות",
  communication: "תקשורת",
  cloud: "ענן ואחסון",
  customs: "מכס ויבוא",
};

const connectors: Connector[] = [
  // שכר ורשויות
  { id: 1, name: "חילן", nameEn: "Payroll – Hilan", category: "payroll", status: "מחובר", lastSync: "08/04/2026 09:15", recordsSynced: 12480, health: 98, authType: "Certificate", endpoints: 4, syncSchedule: "כל שעה", errorLog: [] },
  { id: 2, name: "ביטוח לאומי", nameEn: "National Insurance", category: "payroll", status: "מחובר", lastSync: "08/04/2026 08:00", recordsSynced: 3210, health: 95, authType: "Certificate", endpoints: 2, syncSchedule: "יומי 06:00", errorLog: [] },
  { id: 3, name: "רשות המיסים", nameEn: "Tax Authority", category: "payroll", status: "שגיאה", lastSync: "07/04/2026 23:30", recordsSynced: 8742, health: 32, authType: "Certificate", endpoints: 3, syncSchedule: "יומי 00:00", errorLog: ["Timeout on endpoint /tax/vat-report", "SSL handshake failed – retry 3/3"] },
  { id: 4, name: "קרנות פנסיה", nameEn: "Pension Funds", category: "payroll", status: "מחובר", lastSync: "08/04/2026 07:00", recordsSynced: 1580, health: 91, authType: "API Key", endpoints: 2, syncSchedule: "יומי 07:00", errorLog: [] },
  // בנקאות
  { id: 5, name: "בנק לאומי", nameEn: "Bank Leumi", category: "banking", status: "מחובר", lastSync: "08/04/2026 10:02", recordsSynced: 45200, health: 100, authType: "OAuth2", endpoints: 5, syncSchedule: "כל 30 דקות", errorLog: [] },
  { id: 6, name: "בנק הפועלים", nameEn: "Bank Hapoalim", category: "banking", status: "מחובר", lastSync: "08/04/2026 10:00", recordsSynced: 38900, health: 97, authType: "OAuth2", endpoints: 5, syncSchedule: "כל 30 דקות", errorLog: [] },
  { id: 7, name: "מזרחי טפחות", nameEn: "Mizrahi Tefahot", category: "banking", status: "מנותק", lastSync: "05/04/2026 14:22", recordsSynced: 12400, health: 0, authType: "OAuth2", endpoints: 4, syncSchedule: "כל 30 דקות", errorLog: ["Token expired – re-authentication required"] },
  // תקשורת
  { id: 8, name: "WhatsApp Business API", nameEn: "WhatsApp Business", category: "communication", status: "מחובר", lastSync: "08/04/2026 10:10", recordsSynced: 89500, health: 99, authType: "API Key", endpoints: 3, syncSchedule: "זמן אמת", errorLog: [] },
  { id: 9, name: "Gmail / SMTP", nameEn: "Gmail SMTP", category: "communication", status: "מחובר", lastSync: "08/04/2026 10:12", recordsSynced: 67200, health: 100, authType: "OAuth2", endpoints: 2, syncSchedule: "זמן אמת", errorLog: [] },
  { id: 10, name: "SMS Gateway", nameEn: "SMS Gateway", category: "communication", status: "שגיאה", lastSync: "08/04/2026 08:45", recordsSynced: 24300, health: 45, authType: "API Key", endpoints: 1, syncSchedule: "זמן אמת", errorLog: ["Rate limit exceeded 429", "Delivery failed – invalid numbers batch #412"] },
  // ענן ואחסון
  { id: 11, name: "Azure Blob", nameEn: "Azure Blob Storage", category: "cloud", status: "מחובר", lastSync: "08/04/2026 09:55", recordsSynced: 5620, health: 100, authType: "API Key", endpoints: 2, syncSchedule: "כל 15 דקות", errorLog: [] },
  { id: 12, name: "Google Drive", nameEn: "Google Drive", category: "cloud", status: "מחובר", lastSync: "08/04/2026 09:50", recordsSynced: 3180, health: 93, authType: "OAuth2", endpoints: 3, syncSchedule: "כל שעה", errorLog: [] },
  // מכס ויבוא
  { id: 13, name: "שער המכס", nameEn: "Customs Gateway", category: "customs", status: "בהקמה", lastSync: "—", recordsSynced: 0, health: 10, authType: "Certificate", endpoints: 0, syncSchedule: "טרם הוגדר", errorLog: [] },
  { id: 14, name: "ספנות מעקב", nameEn: "Shipping Track", category: "customs", status: "מנותק", lastSync: "02/04/2026 11:00", recordsSynced: 740, health: 0, authType: "API Key", endpoints: 2, syncSchedule: "כל שעתיים", errorLog: ["Connection refused – endpoint unreachable"] },
];

/* ───────────────────── Helpers ───────────────────── */

function statusBadge(status: ConnectorStatus) {
  const map: Record<ConnectorStatus, { color: string; icon: React.ReactNode }> = {
    "מחובר": { color: "bg-emerald-100 text-emerald-700", icon: <CheckCircle2 className="h-3 w-3 ml-1" /> },
    "מנותק": { color: "bg-gray-200 text-gray-600", icon: <XCircle className="h-3 w-3 ml-1" /> },
    "שגיאה": { color: "bg-red-100 text-red-700", icon: <AlertTriangle className="h-3 w-3 ml-1" /> },
    "בהקמה": { color: "bg-amber-100 text-amber-700", icon: <Clock className="h-3 w-3 ml-1" /> },
  };
  const cfg = map[status];
  return (
    <Badge className={`${cfg.color} gap-0.5`}>
      {cfg.icon}
      {status}
    </Badge>
  );
}

function healthColor(h: number) {
  if (h >= 80) return "bg-emerald-500";
  if (h >= 50) return "bg-amber-500";
  return "bg-red-500";
}

function authIcon(type: string) {
  if (type === "OAuth2") return <Shield className="h-4 w-4 text-blue-500" />;
  if (type === "API Key") return <Key className="h-4 w-4 text-amber-500" />;
  return <FileKey className="h-4 w-4 text-purple-500" />;
}

/* ───────────────────── Sub-components ───────────────────── */

function KpiCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: React.ElementType; color: string }) {
  return (
    <Card>
      <CardContent className="py-4 px-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
          <div className={`p-2 rounded-lg ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ConnectorCard({ c, onSelect }: { c: Connector; onSelect: (c: Connector) => void }) {
  return (
    <Card
      className="cursor-pointer hover:ring-2 hover:ring-primary/30 transition-shadow"
      onClick={() => onSelect(c)}
    >
      <CardContent className="py-4 px-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sm">{c.name}</span>
          {statusBadge(c.status)}
        </div>
        <p className="text-xs text-muted-foreground">{c.nameEn}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <RefreshCw className="h-3 w-3" />
          <span>סנכרון אחרון: {c.lastSync}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Activity className="h-3 w-3" />
          <span>{c.recordsSynced.toLocaleString()} רשומות</span>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span>בריאות</span>
            <span>{c.health}%</span>
          </div>
          <Progress value={c.health} className={`h-1.5 [&>div]:${healthColor(c.health)}`} />
        </div>
      </CardContent>
    </Card>
  );
}

function ConnectorDetail({ c, onClose }: { c: Connector; onClose: () => void }) {
  return (
    <Card className="border-2 border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            {c.name}
            <span className="text-sm font-normal text-muted-foreground">({c.nameEn})</span>
          </CardTitle>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-sm">
            ✕ סגור
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Auth & config */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div className="space-y-1">
            <p className="text-muted-foreground">סוג הזדהות</p>
            <div className="flex items-center gap-1.5 font-medium">{authIcon(c.authType)} {c.authType}</div>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground">נקודות קצה</p>
            <p className="font-medium">{c.endpoints} endpoints</p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground">לוח סנכרון</p>
            <p className="font-medium">{c.syncSchedule}</p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground">סטטוס</p>
            {statusBadge(c.status)}
          </div>
        </div>

        {/* Health bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span>בריאות מחבר</span>
            <span className="font-semibold">{c.health}%</span>
          </div>
          <Progress value={c.health} className={`h-2 [&>div]:${healthColor(c.health)}`} />
        </div>

        {/* Error log */}
        {c.errorLog.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-1">
            <p className="text-sm font-semibold text-red-700">יומן שגיאות</p>
            {c.errorLog.map((e, i) => (
              <p key={i} className="text-xs text-red-600 font-mono">{e}</p>
            ))}
          </div>
        )}

        {/* Sync stats table */}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>מדד</TableHead>
              <TableHead>ערך</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium">רשומות מסונכרנות</TableCell>
              <TableCell>{c.recordsSynced.toLocaleString()}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">סנכרון אחרון</TableCell>
              <TableCell>{c.lastSync}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">קטגוריה</TableCell>
              <TableCell>{CATEGORIES[c.category]}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/* ───────────────────── Main page ───────────────────── */

export default function ExternalConnectorsPage() {
  const [selected, setSelected] = useState<Connector | null>(null);

  const activeCount = connectors.filter(c => c.status === "מחובר").length;
  const disconnectedCount = connectors.filter(c => c.status === "מנותק").length;
  const setupCount = connectors.filter(c => c.status === "בהקמה").length;
  const errorCount = connectors.filter(c => c.status === "שגיאה").length;

  const filterByTab = (tab: string) => {
    if (tab === "all") return connectors;
    if (tab === "active") return connectors.filter(c => c.status === "מחובר");
    if (tab === "disconnected") return connectors.filter(c => c.status === "מנותק" || c.status === "שגיאה");
    return connectors;
  };

  const renderGrid = (list: Connector[]) => {
    const grouped = Object.entries(CATEGORIES).map(([key, label]) => ({
      label,
      items: list.filter(c => c.category === key),
    })).filter(g => g.items.length > 0);

    return (
      <div className="space-y-6">
        {grouped.map(g => (
          <div key={g.label}>
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">{g.label}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {g.items.map(c => (
                <ConnectorCard key={c.id} c={c} onSelect={setSelected} />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderAddForm = () => (
    <Card>
      <CardContent className="py-8 text-center space-y-3">
        <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
          <Plus className="h-6 w-6 text-primary" />
        </div>
        <h3 className="font-semibold text-lg">הוספת מחבר חדש</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          בחר מתוך ספריית המחברים הזמינים או הגדר מחבר מותאם אישית עם API Key / OAuth2 / Certificate.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-lg mx-auto pt-4">
          {[
            { icon: Shield, label: "OAuth2", desc: "Google, Microsoft, בנקים" },
            { icon: Key, label: "API Key", desc: "ספקים, SMS, ענן" },
            { icon: FileKey, label: "Certificate", desc: "רשויות, מכס, שכר" },
          ].map(opt => (
            <Card key={opt.label} className="cursor-pointer hover:ring-2 hover:ring-primary/30">
              <CardContent className="py-4 text-center space-y-1">
                <opt.icon className="h-6 w-6 mx-auto text-primary" />
                <p className="font-medium text-sm">{opt.label}</p>
                <p className="text-xs text-muted-foreground">{opt.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Link2 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">מחברים חיצוניים</h1>
            <p className="text-sm text-muted-foreground">טכנו-כל עוזי — ניהול חיבורים חיצוניים למערכת</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Settings className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">עדכון אחרון: 08/04/2026 10:15</span>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="מחברים פעילים" value={activeCount} icon={Wifi} color="bg-emerald-100 text-emerald-600" />
        <KpiCard label="מנותקים" value={disconnectedCount} icon={WifiOff} color="bg-gray-200 text-gray-600" />
        <KpiCard label="בתהליך הקמה" value={setupCount} icon={Clock} color="bg-amber-100 text-amber-600" />
        <KpiCard label="שגיאות היום" value={errorCount} icon={AlertTriangle} color="bg-red-100 text-red-600" />
      </div>

      {/* Selected detail */}
      {selected && <ConnectorDetail c={selected} onClose={() => setSelected(null)} />}

      {/* Tabs */}
      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">כל המחברים</TabsTrigger>
          <TabsTrigger value="active">פעילים</TabsTrigger>
          <TabsTrigger value="disconnected">מנותקים</TabsTrigger>
          <TabsTrigger value="add">הוספת מחבר</TabsTrigger>
        </TabsList>

        <TabsContent value="all">{renderGrid(filterByTab("all"))}</TabsContent>
        <TabsContent value="active">{renderGrid(filterByTab("active"))}</TabsContent>
        <TabsContent value="disconnected">{renderGrid(filterByTab("disconnected"))}</TabsContent>
        <TabsContent value="add">{renderAddForm()}</TabsContent>
      </Tabs>
    </div>
  );
}
