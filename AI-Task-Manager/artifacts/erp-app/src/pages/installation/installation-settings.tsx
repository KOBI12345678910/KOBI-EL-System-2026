import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Settings, Clock, Users, ShieldCheck, Bell, FileText, Link2,
  Globe, CalendarDays, Ruler, Languages, Camera, CheckCircle,
  XCircle, AlertTriangle, RefreshCw, FolderOpen, Zap
} from "lucide-react";

/* ── Static config data ──────────────────────────────────────── */

const generalSettings = [
  { label: "שעות עבודה", value: "06:00 – 16:00", icon: Clock, note: "כולל הפסקה 12:00–12:30" },
  { label: "ימי עבודה", value: "א׳ – ה׳", icon: CalendarDays, note: "שישי/שבת — לפי אישור מנהל בלבד" },
  { label: "אזור שירות", value: "מרכז / צפון / דרום", icon: Globe, note: "כיסוי ארצי — עדיפות למרכז" },
  { label: "מטבע ברירת מחדל", value: "₪ (שקל חדש)", icon: Zap, note: "המרות מט״ח לפי שער יציג יומי" },
  { label: "יחידות מידה", value: 'מ"מ (מילימטר)', icon: Ruler, note: "תצוגה משנית: ס״מ / מ׳" },
  { label: "שפת ממשק", value: "עברית", icon: Languages, note: "תמיכה נוספת: English, العربية" },
];

const teamSettings = [
  { label: "גודל צוות ברירת מחדל", value: "3 אנשים", icon: Users, note: "מינימום 2, מקסימום 6" },
  { label: "התקנות ליום לצוות", value: "2 התקנות", icon: CalendarDays, note: "חריגה דורשת אישור מנהל מחלקה" },
  { label: "כישורים נדרשים מינימום", value: "הסמכת בטיחות + רישיון גובה", icon: ShieldCheck, note: "חשמלאי מוסמך — לפי סוג התקנה" },
  { label: "שיבוץ אוטומטי", value: "פעיל — לפי זמינות + קרבה גאוגרפית", icon: RefreshCw, note: "עדיפות לצוות עם ניסיון במוצר" },
  { label: "זמן מינימלי בין התקנות", value: "90 דקות", icon: Clock, note: "כולל נסיעה, פריקה והכנה" },
  { label: "הגבלת שעות נוספות", value: "עד 2 שעות ליום", icon: Clock, note: "מעבר — דורש אישור סמנכ״ל תפעול" },
];

const qualitySettings = [
  { label: "סף עובר בדיקת איכות", value: "85%", icon: ShieldCheck, note: "מתחת ל-70% — עצירת התקנה אוטומטית" },
  { label: "תמונות מינימום להתקנה", value: "4 תמונות", icon: Camera, note: "לפני, במהלך, לאחר, ואישור לקוח" },
  { label: "תבנית רשימת ביקורת QC", value: "v3.2 — 18 סעיפים", icon: FileText, note: "עדכון אחרון: מרץ 2026" },
  { label: "עצירת QC אוטומטית", value: "פעיל — בחריגת מידות > 5 מ״מ", icon: AlertTriangle, note: "מפעיל התראה למנהל איכות" },
  { label: "דגימת ביקורת אקראית", value: "15% מההתקנות", icon: CheckCircle, note: "ביקורת שטח ע״י מפקח חיצוני" },
  { label: "זמן תגובה לכשל QC", value: "4 שעות עבודה", icon: Clock, note: "מעבר — התקנה עוברת לסטטוס ׳מוקפאת׳" },
];

const alertSettings = [
  { label: "חריגת עלות", value: "10%", icon: AlertTriangle, note: "מעל 10% — התראה למנהל פרויקט + כספים" },
  { label: "עיכוב בימים", value: "2 ימים", icon: Clock, note: "מעל 5 ימים — אסקלציה להנהלה" },
  { label: "חומרים חסרים — זמן אספקה", value: "3 ימי עבודה", icon: Bell, note: "פחות מ-3 ימים — התראה דחופה למחסן" },
  { label: "סיכון מזג אוויר", value: "פעיל — גשם / רוח > 50 קמ״ש", icon: Globe, note: "מבוסס שירות מטאורולוגי אוטומטי" },
  { label: "צוות לא דיווח סיום", value: "שעתיים מעבר לתכנון", icon: Users, note: "שליחת SMS + התראה למנהל צוותים" },
  { label: "התקנה ללא אישור לקוח", value: "24 שעות מסיום", icon: Bell, note: "תזכורת אוטומטית ללקוח + נציג שירות" },
];

const documentSettings = [
  { label: "סוגי מסמכים נדרשים", value: "פרוטוקול, אישור לקוח, דו״ח QC, תמונות", icon: FileText, note: "חובה בכל התקנה — ללא חריגים" },
  { label: "הפקת פרוטוקול אוטומטית", value: "פעיל — PDF + חתימה דיגיטלית", icon: Zap, note: "נשלח ללקוח תוך 24 שעות מסיום" },
  { label: "מוסכמת שמות קבצים", value: "INS-[מספר]-[סוג]-[תאריך]", icon: FolderOpen, note: 'דוגמה: INS-001-PROTOCOL-2026-04-08' },
  { label: "נתיב אחסון", value: "/documents/installations/[שנה]/[חודש]/", icon: FolderOpen, note: "גיבוי יומי לענן + שרת מקומי" },
  { label: "תקופת שמירת מסמכים", value: "7 שנים", icon: FileText, note: "בהתאם לתקנות רגולציה ובטיחות" },
  { label: "חתימת לקוח דיגיטלית", value: "פעיל — OTP + אימות SMS", icon: ShieldCheck, note: "תקף משפטית לפי חוק חתימה אלקטרונית" },
];

const integrationModules = [
  { module: "CRM", status: "מחובר", lastSync: "08/04/2026 08:15", records: "1,240", health: 98 },
  { module: "פרויקטים", status: "מחובר", lastSync: "08/04/2026 08:10", records: "356", health: 100 },
  { module: "ייצור", status: "מחובר", lastSync: "08/04/2026 07:45", records: "892", health: 95 },
  { module: "מלאי", status: "מחובר", lastSync: "08/04/2026 08:00", records: "4,510", health: 97 },
  { module: "כספים", status: "מחובר", lastSync: "08/04/2026 06:30", records: "2,780", health: 100 },
  { module: "איכות", status: "מנותק", lastSync: "07/04/2026 22:10", records: "—", health: 0 },
  { module: "שירות", status: "מחובר", lastSync: "08/04/2026 08:12", records: "670", health: 92 },
];

/* ── Helper: config card ─────────────────────────────────────── */

function ConfigCard({ item }: { item: { label: string; value: string; icon: React.ElementType; note: string } }) {
  const Icon = item.icon;
  return (
    <Card>
      <CardContent className="pt-5 pb-4 space-y-1">
        <div className="flex items-center gap-2 mb-2">
          <Icon className="h-4 w-4 text-blue-600" />
          <span className="text-sm font-medium text-muted-foreground">{item.label}</span>
        </div>
        <p className="text-lg font-semibold">{item.value}</p>
        <p className="text-xs text-muted-foreground">{item.note}</p>
      </CardContent>
    </Card>
  );
}

/* ── Page component ──────────────────────────────────────────── */

export default function InstallationSettingsPage() {
  return (
    <div dir="rtl" className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="bg-blue-100 p-2.5 rounded-lg">
          <Settings className="h-6 w-6 text-blue-700" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">הגדרות מחלקת התקנות</h1>
          <p className="text-sm text-muted-foreground">טכנו-כל עוזי — קונפיגורציה מרכזית למחלקת ההתקנות</p>
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-xs text-muted-foreground">סה״כ הגדרות פעילות</p>
            <p className="text-2xl font-bold text-blue-700">34</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-xs text-muted-foreground">מודולים מחוברים</p>
            <p className="text-2xl font-bold text-green-700">6 / 7</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-xs text-muted-foreground">עדכון אחרון</p>
            <p className="text-2xl font-bold">08/04/2026</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-xs text-muted-foreground">גרסת קונפיגורציה</p>
            <p className="text-2xl font-bold">v4.1</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="general" className="space-y-4">
        <TabsList className="grid grid-cols-6 w-full">
          <TabsTrigger value="general">כללי</TabsTrigger>
          <TabsTrigger value="teams">צוותים</TabsTrigger>
          <TabsTrigger value="quality">איכות</TabsTrigger>
          <TabsTrigger value="alerts">התראות</TabsTrigger>
          <TabsTrigger value="documents">מסמכים</TabsTrigger>
          <TabsTrigger value="integrations">אינטגרציות</TabsTrigger>
        </TabsList>

        {/* ── כללי ────────────────────────────────────────────── */}
        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Settings className="h-5 w-5 text-blue-600" />
                הגדרות כלליות — ברירות מחדל למחלקה
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {generalSettings.map((s) => <ConfigCard key={s.label} item={s} />)}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── צוותים ─────────────────────────────────────────── */}
        <TabsContent value="teams" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-600" />
                הגדרות צוותים — כללי שיבוץ וניהול
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {teamSettings.map((s) => <ConfigCard key={s.label} item={s} />)}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── איכות ──────────────────────────────────────────── */}
        <TabsContent value="quality" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-green-600" />
                הגדרות איכות — בקרת QC ותקנים
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {qualitySettings.map((s) => <ConfigCard key={s.label} item={s} />)}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── התראות ─────────────────────────────────────────── */}
        <TabsContent value="alerts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Bell className="h-5 w-5 text-orange-500" />
                הגדרות התראות — ספי הפעלה ואסקלציה
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {alertSettings.map((s) => <ConfigCard key={s.label} item={s} />)}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── מסמכים ─────────────────────────────────────────── */}
        <TabsContent value="documents" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5 text-purple-600" />
                הגדרות מסמכים — תבניות, שמות ואחסון
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {documentSettings.map((s) => <ConfigCard key={s.label} item={s} />)}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── אינטגרציות ─────────────────────────────────────── */}
        <TabsContent value="integrations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Link2 className="h-5 w-5 text-indigo-600" />
                אינטגרציות — חיבור למודולים במערכת
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">מודול</TableHead>
                    <TableHead className="text-right">סטטוס</TableHead>
                    <TableHead className="text-right">סנכרון אחרון</TableHead>
                    <TableHead className="text-right">רשומות מסונכרנות</TableHead>
                    <TableHead className="text-right">תקינות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {integrationModules.map((m) => (
                    <TableRow key={m.module}>
                      <TableCell className="font-medium">{m.module}</TableCell>
                      <TableCell>
                        <Badge variant={m.status === "מחובר" ? "default" : "destructive"} className="gap-1">
                          {m.status === "מחובר"
                            ? <CheckCircle className="h-3 w-3" />
                            : <XCircle className="h-3 w-3" />}
                          {m.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{m.lastSync}</TableCell>
                      <TableCell className="text-sm">{m.records}</TableCell>
                      <TableCell className="w-36">
                        {m.health > 0
                          ? <div className="flex items-center gap-2">
                              <Progress value={m.health} className="h-2 flex-1" />
                              <span className="text-xs text-muted-foreground w-8">{m.health}%</span>
                            </div>
                          : <span className="text-xs text-red-500">לא זמין</span>}
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