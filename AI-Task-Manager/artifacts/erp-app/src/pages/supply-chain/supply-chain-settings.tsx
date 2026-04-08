import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Settings, Save, Users, FileStack, Bell, Plug, Globe, Percent,
  Clock, BarChart3, ShieldCheck, Truck, Mail, MessageSquare, Warehouse,
  RefreshCw, CheckCircle2, AlertTriangle, XCircle, DollarSign
} from "lucide-react";

const FALLBACK_GENERALSETTINGS = [
  { key: "lead_time", label: "זמן אספקה ברירת מחדל", value: "14", unit: "ימים", desc: "Lead Time ממוצע להזמנות חדשות" },
  { key: "safety_stock", label: "מדיניות מלאי ביטחון", value: "15%", unit: "מהצריכה החודשית", desc: "אחוז מלאי ביטחון מינימלי" },
  { key: "reorder_method", label: "שיטת נקודת הזמנה מחדש", value: "ROP דינמי", unit: "", desc: "חישוב אוטומטי לפי צריכה" },
  { key: "abc_a", label: "סף סיווג ABC - קטגוריה A", value: "80%", unit: "מערך המלאי", desc: "פריטים המהווים 80% מהערך" },
  { key: "abc_b", label: "סף סיווג ABC - קטגוריה B", value: "15%", unit: "מערך המלאי", desc: "פריטים המהווים 15% מהערך" },
  { key: "horizon", label: "אופק תכנון", value: "12", unit: "שבועות", desc: "טווח תכנון לביקוש ורכש" },
  { key: "forecast", label: "שיטת חיזוי ביקוש", value: "ממוצע נע משוקלל", unit: "", desc: "אלגוריתם חיזוי ראשי" },
  { key: "currency", label: "מטבע ברירת מחדל", value: "₪ (ILS)", unit: "", desc: "מטבע בסיס לכל תמחור" },
  { key: "uom", label: "יחידות מידה", value: "מטרי (ק\"ג, מ\')", unit: "", desc: "מערכת יחידות ברירת מחדל" },
];

const FALLBACK_SUPPLIERCRITERIA = [
  { criterion: "איכות מוצר", weight: 30, color: "bg-blue-500" },
  { criterion: "אמינות אספקה", weight: 25, color: "bg-green-500" },
  { criterion: "מחיר תחרותי", weight: 20, color: "bg-amber-500" },
  { criterion: "שירות ותמיכה", weight: 15, color: "bg-purple-500" },
  { criterion: "גמישות ותגובה", weight: 10, color: "bg-rose-500" },
];

const FALLBACK_APPROVEDCOUNTRIES = ["ישראל", "גרמניה", "איטליה", "טורקיה", "סין", "בלגיה", "יוון", "ספרד"];

const FALLBACK_BOMSETTINGS = [
  { key: "levels", label: "רמות BOM ברירת מחדל", value: "5", desc: "עומק מקסימלי של עץ מוצר" },
  { key: "cost_rollup", label: "שיטת צבירת עלויות", value: "Bottom-Up Rollup", desc: "צבירה מהרמה הנמוכה לגבוהה" },
  { key: "scrap", label: "אחוז פחת ברירת מחדל", value: "3.5%", desc: "פחת חומר סטנדרטי בייצור" },
  { key: "eco_chain", label: "שרשרת אישור ECO", value: "מהנדס → מנהל ייצור → סמנכ\"ל", desc: "תהליך אישור שינויים הנדסיים" },
  { key: "version", label: "מוסכמת מספור גרסאות", value: "V{major}.{minor}.{rev}", desc: "פורמט מספור גרסאות BOM" },
  { key: "archive", label: "ארכוב אוטומטי לאחר חוסר פעילות", value: "90", desc: "ימים עד ארכוב BOM לא פעיל" },
];

const FALLBACK_ALERTRULES = [
  { id: 1, name: "חוסר מלאי קריטי", desc: "מלאי מתחת לנקודת הזמנה", threshold: "< 10%", channel: "אימייל + SMS", enabled: true, icon: Warehouse },
  { id: 2, name: "חריגת זמן אספקה", desc: "עיכוב מעבר לסף מותר", threshold: "> 3 ימים", channel: "אימייל", enabled: true, icon: Clock },
  { id: 3, name: "שינוי מחיר ספק", desc: "עלייה במחיר מעבר לאחוז מוגדר", threshold: "> 5%", channel: "מערכת + אימייל", enabled: true, icon: DollarSign },
  { id: 4, name: "שיעור פסילת איכות", desc: "פסילות מעל סף מותר", threshold: "> 2%", channel: "אימייל + מערכת", enabled: true, icon: ShieldCheck },
  { id: 5, name: "עיכוב משלוח", desc: "משלוח לא הגיע במועד", threshold: "> 2 ימים", channel: "SMS + אימייל", enabled: true, icon: Truck },
  { id: 6, name: "ירידת דירוג ספק", desc: "ספק ירד מתחת לסף מינימלי", threshold: "< 70 נק'", channel: "אימייל", enabled: false, icon: Users },
  { id: 7, name: "BOM לא מעודכן", desc: "גרסת BOM לא עודכנה בטווח מוגדר", threshold: "> 60 יום", channel: "מערכת", enabled: false, icon: FileStack },
  { id: 8, name: "חריגת תקציב רכש", desc: "הוצאה מעבר לתקציב רבעוני", threshold: "> 90%", channel: "אימייל + מערכת", enabled: true, icon: BarChart3 },
  { id: 9, name: "הזמנה ללא אישור", desc: "הזמנה שנוצרה ללא שרשרת אישור", threshold: "כל הזמנה", channel: "אימייל דחוף", enabled: true, icon: AlertTriangle },
  { id: 10, name: "ספק חדש ללא הערכה", desc: "ספק שנוסף ללא תהליך הערכה", threshold: "כל ספק", channel: "מערכת", enabled: true, icon: Globe },
];

const FALLBACK_INTEGRATIONS = [
  { name: "מודול רכש", type: "פנימי", status: "מחובר", sync: "זמן אמת", lastSync: "08/04/2026 09:15", health: 100 },
  { name: "מודול ייצור", type: "פנימי", status: "מחובר", sync: "כל 5 דקות", lastSync: "08/04/2026 09:12", health: 100 },
  { name: "מודול מלאי", type: "פנימי", status: "מחובר", sync: "זמן אמת", lastSync: "08/04/2026 09:15", health: 98 },
  { name: "מודול כספים", type: "פנימי", status: "מחובר", sync: "כל שעה", lastSync: "08/04/2026 09:00", health: 100 },
  { name: "API מכס ישראל", type: "חיצוני", status: "מחובר", sync: "כל 30 דקות", lastSync: "08/04/2026 08:45", health: 95 },
  { name: "מעקב משלוחים (DHL/FedEx)", type: "חיצוני", status: "מחובר", sync: "כל 15 דקות", lastSync: "08/04/2026 09:00", health: 92 },
  { name: "פורטל ספקים Schüco", type: "חיצוני", status: "מחובר", sync: "כל שעה", lastSync: "08/04/2026 08:00", health: 88 },
  { name: "פורטל ספקים Foshan Glass", type: "חיצוני", status: "מנותק", sync: "כל שעה", lastSync: "07/04/2026 22:30", health: 0 },
];

const statusBadge = (status: string) => {
  if (status === "מחובר") return <Badge className="bg-green-500/20 text-green-600 gap-1"><CheckCircle2 className="h-3 w-3" />מחובר</Badge>;
  return <Badge className="bg-red-500/20 text-red-600 gap-1"><XCircle className="h-3 w-3" />מנותק</Badge>;
};

export default function SupplyChainSettingsPage() {
  const { data: apigeneralSettings } = useQuery({
    queryKey: ["/api/supply-chain/supply-chain-settings/generalsettings"],
    queryFn: () => authFetch("/api/supply-chain/supply-chain-settings/generalsettings").then(r => r.json()).catch(() => null),
  });
  const generalSettings = Array.isArray(apigeneralSettings) ? apigeneralSettings : (apigeneralSettings?.data ?? apigeneralSettings?.items ?? FALLBACK_GENERALSETTINGS);


  const { data: apisupplierCriteria } = useQuery({
    queryKey: ["/api/supply-chain/supply-chain-settings/suppliercriteria"],
    queryFn: () => authFetch("/api/supply-chain/supply-chain-settings/suppliercriteria").then(r => r.json()).catch(() => null),
  });
  const supplierCriteria = Array.isArray(apisupplierCriteria) ? apisupplierCriteria : (apisupplierCriteria?.data ?? apisupplierCriteria?.items ?? FALLBACK_SUPPLIERCRITERIA);


  const { data: apiapprovedCountries } = useQuery({
    queryKey: ["/api/supply-chain/supply-chain-settings/approvedcountries"],
    queryFn: () => authFetch("/api/supply-chain/supply-chain-settings/approvedcountries").then(r => r.json()).catch(() => null),
  });
  const approvedCountries = Array.isArray(apiapprovedCountries) ? apiapprovedCountries : (apiapprovedCountries?.data ?? apiapprovedCountries?.items ?? FALLBACK_APPROVEDCOUNTRIES);


  const { data: apibomSettings } = useQuery({
    queryKey: ["/api/supply-chain/supply-chain-settings/bomsettings"],
    queryFn: () => authFetch("/api/supply-chain/supply-chain-settings/bomsettings").then(r => r.json()).catch(() => null),
  });
  const bomSettings = Array.isArray(apibomSettings) ? apibomSettings : (apibomSettings?.data ?? apibomSettings?.items ?? FALLBACK_BOMSETTINGS);


  const { data: apialertRules } = useQuery({
    queryKey: ["/api/supply-chain/supply-chain-settings/alertrules"],
    queryFn: () => authFetch("/api/supply-chain/supply-chain-settings/alertrules").then(r => r.json()).catch(() => null),
  });
  const alertRules = Array.isArray(apialertRules) ? apialertRules : (apialertRules?.data ?? apialertRules?.items ?? FALLBACK_ALERTRULES);


  const { data: apiintegrations } = useQuery({
    queryKey: ["/api/supply-chain/supply-chain-settings/integrations"],
    queryFn: () => authFetch("/api/supply-chain/supply-chain-settings/integrations").then(r => r.json()).catch(() => null),
  });
  const integrations = Array.isArray(apiintegrations) ? apiintegrations : (apiintegrations?.data ?? apiintegrations?.items ?? FALLBACK_INTEGRATIONS);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="h-7 w-7" /> הגדרות שרשרת אספקה
        </h1>
        <Button className="gap-2"><Save className="h-4 w-4" />שמור שינויים</Button>
      </div>

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList className="grid grid-cols-5 w-full">
          <TabsTrigger value="general" className="gap-1"><Settings className="h-4 w-4" />כללי</TabsTrigger>
          <TabsTrigger value="suppliers" className="gap-1"><Users className="h-4 w-4" />ספקים</TabsTrigger>
          <TabsTrigger value="bom" className="gap-1"><FileStack className="h-4 w-4" />BOM</TabsTrigger>
          <TabsTrigger value="alerts" className="gap-1"><Bell className="h-4 w-4" />התראות</TabsTrigger>
          <TabsTrigger value="integrations" className="gap-1"><Plug className="h-4 w-4" />אינטגרציות</TabsTrigger>
        </TabsList>

        {/* Tab 1: General */}
        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Settings className="h-5 w-5" />הגדרות כלליות - שרשרת אספקה</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right w-[220px]">הגדרה</TableHead>
                    <TableHead className="text-right w-[150px]">ערך</TableHead>
                    <TableHead className="text-right w-[120px]">יחידה</TableHead>
                    <TableHead className="text-right">תיאור</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {generalSettings.map((s) => (
                    <TableRow key={s.key}>
                      <TableCell className="font-medium">{s.label}</TableCell>
                      <TableCell><Input defaultValue={s.value} className="h-8 w-32 text-sm" /></TableCell>
                      <TableCell className="text-muted-foreground text-sm">{s.unit}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{s.desc}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Suppliers */}
        <TabsContent value="suppliers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" />משקלות קריטריונים להערכת ספקים</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {supplierCriteria.map((c) => (
                <div key={c.criterion} className="flex items-center gap-4">
                  <span className="w-36 text-sm font-medium">{c.criterion}</span>
                  <Progress value={c.weight} className="flex-1 h-3" />
                  <Input defaultValue={String(c.weight)} className="h-8 w-16 text-sm text-center" />
                  <span className="text-sm text-muted-foreground w-6">%</span>
                </div>
              ))}
              <p className="text-xs text-muted-foreground pt-2">סה״כ משקלות חייב להסתכם ל-100%</p>
            </CardContent>
          </Card>
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">הגדרות ברירת מחדל לספקים</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">סף דירוג מינימלי לספק מאושר</span>
                  <div className="flex items-center gap-2"><Input defaultValue="70" className="h-8 w-16 text-sm text-center" /><span className="text-sm text-muted-foreground">נקודות</span></div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">תנאי תשלום ברירת מחדל</span>
                  <Input defaultValue="שוטף + 60" className="h-8 w-28 text-sm" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">מדיניות בדיקת איכות כניסה</span>
                  <Input defaultValue="דגימה 10% מכל משלוח" className="h-8 w-40 text-sm" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Globe className="h-4 w-4" />מדינות מאושרות לרכש</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {approvedCountries.map((c) => (
                    <Badge key={c} variant="secondary" className="text-sm px-3 py-1">{c}</Badge>
                  ))}
                </div>
                <Button variant="outline" size="sm" className="mt-3 text-xs">+ הוסף מדינה</Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 3: BOM */}
        <TabsContent value="bom">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><FileStack className="h-5 w-5" />הגדרות BOM - עץ מוצר</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right w-[240px]">הגדרה</TableHead>
                    <TableHead className="text-right w-[200px]">ערך</TableHead>
                    <TableHead className="text-right">תיאור</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bomSettings.map((s) => (
                    <TableRow key={s.key}>
                      <TableCell className="font-medium">{s.label}</TableCell>
                      <TableCell><Input defaultValue={s.value} className="h-8 w-44 text-sm" /></TableCell>
                      <TableCell className="text-muted-foreground text-sm">{s.desc}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Alerts */}
        <TabsContent value="alerts">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" />כללי התראות - שרשרת אספקה</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right w-10"></TableHead>
                    <TableHead className="text-right">שם התראה</TableHead>
                    <TableHead className="text-right">תיאור</TableHead>
                    <TableHead className="text-right w-[110px]">סף</TableHead>
                    <TableHead className="text-right w-[130px]">ערוץ התראה</TableHead>
                    <TableHead className="text-center w-[80px]">פעיל</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alertRules.map((a) => (
                    <TableRow key={a.id} className={!a.enabled ? "opacity-50" : ""}>
                      <TableCell><a.icon className="h-4 w-4 text-muted-foreground" /></TableCell>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{a.desc}</TableCell>
                      <TableCell><Input defaultValue={a.threshold} className="h-8 w-24 text-sm" /></TableCell>
                      <TableCell className="text-sm">{a.channel}</TableCell>
                      <TableCell className="text-center"><Switch defaultChecked={a.enabled} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 5: Integrations */}
        <TabsContent value="integrations">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Plug className="h-5 w-5" />מערכות מחוברות</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">מערכת</TableHead>
                    <TableHead className="text-right w-[80px]">סוג</TableHead>
                    <TableHead className="text-right w-[100px]">סטטוס</TableHead>
                    <TableHead className="text-right w-[110px]">תדירות סנכרון</TableHead>
                    <TableHead className="text-right w-[150px]">סנכרון אחרון</TableHead>
                    <TableHead className="text-right w-[120px]">תקינות</TableHead>
                    <TableHead className="text-center w-[80px]">פעולה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {integrations.map((intg) => (
                    <TableRow key={intg.name}>
                      <TableCell className="font-medium">{intg.name}</TableCell>
                      <TableCell><Badge variant={intg.type === "פנימי" ? "default" : "outline"}>{intg.type}</Badge></TableCell>
                      <TableCell>{statusBadge(intg.status)}</TableCell>
                      <TableCell className="text-sm">{intg.sync}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{intg.lastSync}</TableCell>
                      <TableCell>
                        {intg.health > 0 ? (
                          <div className="flex items-center gap-2">
                            <Progress value={intg.health} className="h-2 flex-1" />
                            <span className="text-xs w-8">{intg.health}%</span>
                          </div>
                        ) : (
                          <span className="text-xs text-red-500">לא זמין</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                          <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
