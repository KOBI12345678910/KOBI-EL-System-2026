import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Settings, Clock, DollarSign, CalendarDays, Star, FileText, Link2,
  CheckCircle, AlertTriangle, Shield, Briefcase, Baby, Swords, Users
} from "lucide-react";

const generalSettings = [
  { label: "שעות עבודה", value: "07:00 - 16:00", note: "כולל הפסקת צהריים 30 דקות" },
  { label: "ימי עבודה", value: "א׳ - ה׳ (ראשון עד חמישי)", note: "שבוע עבודה 5 ימים" },
  { label: "מדיניות שעות נוספות", value: "125% שעתיים ראשונות, 150% מעבר", note: "בהתאם לחוק שעות עבודה ומנוחה" },
  { label: "לוח חגים", value: "לוח עברי + חגים ארציים", note: "9 ימי חג בשנה לפי חוק" },
  { label: "תקופת ניסיון", value: "6 חודשים", note: "הערכה בחודש 3 וחודש 6" },
  { label: "שעות עבודה שבועיות", value: "42 שעות", note: "תקן ארצי" },
  { label: "הודעה מוקדמת לפיטורין", value: "יום לכל חודש עבודה (עד 30 יום)", note: "חוק הודעה מוקדמת" },
  { label: "גיל פרישה", value: "גברים 67 / נשים 65", note: "חוק גיל פרישה" },
];

const salarySettings = [
  { label: "מחזור שכר", value: "ה-10 לכל חודש", note: "תשלום שכר עד ה-9 לחודש העוקב" },
  { label: "שכר מינימום", value: "₪5,880", note: "עדכון אחרון: אפריל 2025" },
  { label: "מדרגות מס הכנסה", value: "10%-50%", note: "7 מדרגות מס לשנת 2026" },
  { label: "הפרשה לפנסיה (עובד)", value: "6.5%", note: "חובה מלאה לפי צו הרחבה" },
  { label: "הפרשה לפנסיה (מעסיק)", value: "6.5% + 8.33%", note: "תגמולים + פיצויים" },
  { label: "ביטוח לאומי (עובד)", value: "3.50% / 12.00%", note: "מדרגה ראשונה / שנייה" },
  { label: "ביטוח לאומי (מעסיק)", value: "3.55% / 7.60%", note: "מדרגה ראשונה / שנייה" },
  { label: "מס בריאות", value: "3.10% / 5.00%", note: "מדרגה ראשונה / שנייה" },
  { label: "פיצויי פיטורין", value: "8.33%", note: "שכר חודש לכל שנת עבודה" },
  { label: "קרן השתלמות (עובד)", value: "2.5%", note: "אופציונלי — הטבת מס" },
  { label: "קרן השתלמות (מעסיק)", value: "7.5%", note: "עד תקרה מוטבת" },
];

const leaveTypes = [
  { type: "חופשה שנתית", days: 12, icon: CalendarDays, accrual: "צבירה חודשית — 1 יום/חודש", note: "עולה עם ותק עד 28 יום" },
  { type: "מחלה", days: 18, icon: AlertTriangle, accrual: "1.5 יום/חודש, צבירה עד 90 יום", note: "יום ראשון ללא תשלום, 50% ביום 2-3" },
  { type: "ימים אישיים", days: 3, icon: Users, accrual: "הקצאה שנתית קבועה", note: "לא ניתנים לצבירה" },
  { type: "חופשת לידה (אם)", days: 182, icon: Baby, accrual: "26 שבועות — 15 בתשלום דמי לידה", note: "בהתאם לחוק עבודת נשים" },
  { type: "חופשת לידה (אב)", days: 7, icon: Baby, accrual: "שבוע ראשון בתשלום", note: "זכות להאריך מחופשת האם" },
  { type: "מילואים", days: 0, icon: Shield, accrual: "לפי צו קריאה", note: "תשלום מלא מביטוח לאומי" },
  { type: "אבל", days: 7, icon: Users, accrual: "קרוב משפחה מדרגה ראשונה", note: "שבעה — בתשלום מלא" },
  { type: "חתונה", days: 3, icon: Star, accrual: "חד פעמי", note: "בתשלום מלא" },
];

const performanceSettings = [
  { label: "תדירות הערכה", value: "חצי שנתי", note: "יוני ודצמבר" },
  { label: "סולם דירוג", value: "1-5", note: "1=חלש, 2=דרוש שיפור, 3=עומד בציפיות, 4=מצטיין, 5=יוצא דופן" },
  { label: "קטגוריות חובה", value: "5 קטגוריות", note: "ביצועים, מקצועיות, עבודת צוות, יוזמה, נוכחות" },
  { label: "משוב 360°", value: "פעיל", note: "3 עמיתים לפחות + מנהל ישיר" },
  { label: "יעדים אישיים", value: "3-5 יעדים לתקופה", note: "SMART — ברי מדידה" },
  { label: "תוכנית שיפור (PIP)", value: "90 יום", note: "מופעל בדירוג מתחת ל-2" },
  { label: "בונוס ביצועים", value: "עד 15% משכר שנתי", note: "בהתאם לדירוג ותוצאות מפעל" },
  { label: "קידום דרגה", value: "דירוג 4+ בשני מחזורים רצופים", note: "בכפוף לאישור הנהלה" },
];

const documentSettings = [
  { docType: "תעודת זהות / דרכון", required: "כל העובדים", expiry: "בדיקת תוקף שנתית", status: "חובה" },
  { docType: "טופס 101", required: "כל העובדים", expiry: "עדכון שנתי בינואר", status: "חובה" },
  { docType: "אישור ניהול חשבון", required: "כל העובדים", expiry: "בקבלה לעבודה", status: "חובה" },
  { docType: "תעודות השכלה", required: "כל העובדים", expiry: "חד פעמי", status: "חובה" },
  { docType: "אישור רפואי תעסוקתי", required: "עובדי ייצור", expiry: "כל 12 חודשים", status: "חובה" },
  { docType: "הדרכת בטיחות", required: "עובדי ייצור", expiry: "כל 6 חודשים", status: "חובה" },
  { docType: "רישיון מלגזה", required: "נהגי מלגזה", expiry: "כל 3 שנים", status: "חובה" },
  { docType: "הסכם סודיות (NDA)", required: "כל העובדים", expiry: "בקבלה לעבודה", status: "מומלץ" },
  { docType: "הסכם העסקה חתום", required: "כל העובדים", expiry: "חד פעמי", status: "חובה" },
];

const integrations = [
  { name: "שעון נוכחות", provider: "Synel MLL", status: "מחובר", lastSync: "08/04/2026 06:00", records: "2,340", health: 100 },
  { name: "מערכת שכר חילן", provider: "חילן טכנולוגיות", status: "מחובר", lastSync: "07/04/2026 22:00", records: "68", health: 100 },
  { name: "ביטוח לאומי", provider: "המוסד לביטוח לאומי", status: "מחובר", lastSync: "01/04/2026 08:00", records: "68", health: 98 },
  { name: "קרנות פנסיה", provider: "מגדל / הראל / מנורה", status: "מחובר", lastSync: "05/04/2026 10:00", records: "68", health: 100 },
  { name: "רשות המיסים", provider: "רשות המיסים בישראל", status: "מחובר", lastSync: "01/04/2026 09:00", records: "68", health: 95 },
];

const statusBadge = (s: string) => (
  s === "מחובר"
    ? <Badge className="bg-green-500/20 text-green-400 border-green-500/30">מחובר</Badge>
    : <Badge className="bg-red-500/20 text-red-400 border-red-500/30">מנותק</Badge>
);

const docBadge = (s: string) => (
  s === "חובה"
    ? <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">חובה</Badge>
    : <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">מומלץ</Badge>
);

export default function HRSettings() {
  const [activeTab, setActiveTab] = useState("general");

  return (
    <div dir="rtl" className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Settings className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">הגדרות משאבי אנוש</h1>
          <p className="text-sm text-muted-foreground">טכנו-כל עוזי — ניהול מדיניות עבודה בהתאם לחוקי עבודה בישראל</p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl">
        <TabsList className="grid grid-cols-6 w-full">
          <TabsTrigger value="general" className="gap-1.5"><Clock className="h-4 w-4" />כללי</TabsTrigger>
          <TabsTrigger value="salary" className="gap-1.5"><DollarSign className="h-4 w-4" />שכר</TabsTrigger>
          <TabsTrigger value="leave" className="gap-1.5"><CalendarDays className="h-4 w-4" />חופשות</TabsTrigger>
          <TabsTrigger value="performance" className="gap-1.5"><Star className="h-4 w-4" />ביצועים</TabsTrigger>
          <TabsTrigger value="documents" className="gap-1.5"><FileText className="h-4 w-4" />מסמכים</TabsTrigger>
          <TabsTrigger value="integrations" className="gap-1.5"><Link2 className="h-4 w-4" />אינטגרציות</TabsTrigger>
        </TabsList>

        {/* General Tab */}
        <TabsContent value="general" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5" />הגדרות כלליות — שעות עבודה ומדיניות</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">הגדרה</TableHead>
                    <TableHead className="text-right">ערך</TableHead>
                    <TableHead className="text-right">הערות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {generalSettings.map((s, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{s.label}</TableCell>
                      <TableCell><Badge variant="outline">{s.value}</Badge></TableCell>
                      <TableCell className="text-muted-foreground text-sm">{s.note}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Salary Tab */}
        <TabsContent value="salary" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5" />הגדרות שכר — ניכויים, הפרשות ומיסים</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">רכיב</TableHead>
                    <TableHead className="text-right">שיעור / סכום</TableHead>
                    <TableHead className="text-right">הערות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {salarySettings.map((s, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{s.label}</TableCell>
                      <TableCell><Badge variant="outline">{s.value}</Badge></TableCell>
                      <TableCell className="text-muted-foreground text-sm">{s.note}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Leave Tab */}
        <TabsContent value="leave" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5" />סוגי חופשות — מכסות וכללי צבירה</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {leaveTypes.map((lt, i) => {
                const Icon = lt.icon;
                return (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg border bg-card/50">
                    <div className="p-2 rounded-md bg-primary/10 mt-0.5">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">{lt.type}</span>
                        {lt.days > 0 && (
                          <Badge className="bg-primary/20 text-primary border-primary/30">{lt.days} ימים</Badge>
                        )}
                        {lt.days === 0 && (
                          <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">לפי צורך</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{lt.accrual}</p>
                      <p className="text-xs text-muted-foreground/70">{lt.note}</p>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Star className="h-5 w-5" />הגדרות הערכת ביצועים</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">הגדרה</TableHead>
                    <TableHead className="text-right">ערך</TableHead>
                    <TableHead className="text-right">פרטים</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {performanceSettings.map((s, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{s.label}</TableCell>
                      <TableCell><Badge variant="outline">{s.value}</Badge></TableCell>
                      <TableCell className="text-muted-foreground text-sm">{s.note}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />מסמכים נדרשים לכל סוג עובד</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">מסמך</TableHead>
                    <TableHead className="text-right">נדרש עבור</TableHead>
                    <TableHead className="text-right">תוקף / תזכורת</TableHead>
                    <TableHead className="text-right">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documentSettings.map((d, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{d.docType}</TableCell>
                      <TableCell className="text-sm">{d.required}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{d.expiry}</TableCell>
                      <TableCell>{docBadge(d.status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-4 p-3 rounded-lg border bg-yellow-500/5 border-yellow-500/20">
                <p className="text-sm font-medium text-yellow-400 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  מוסכמת שמות קבצים: [מספר_עובד]_[סוג_מסמך]_[תאריך].pdf
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Integrations Tab */}
        <TabsContent value="integrations" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Link2 className="h-5 w-5" />מערכות מחוברות</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {integrations.map((intg, i) => (
                <div key={i} className="flex items-center gap-4 p-4 rounded-lg border bg-card/50">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{intg.name}</span>
                      {statusBadge(intg.status)}
                    </div>
                    <p className="text-sm text-muted-foreground">ספק: {intg.provider}</p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>סנכרון אחרון: {intg.lastSync}</span>
                      <span>רשומות: {intg.records}</span>
                    </div>
                  </div>
                  <div className="w-32 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">תקינות</span>
                      <span className="font-medium">{intg.health}%</span>
                    </div>
                    <Progress value={intg.health} className="h-2" />
                  </div>
                  <CheckCircle className="h-5 w-5 text-green-500" />
                </div>
              ))}
              <div className="mt-2 p-3 rounded-lg border bg-muted/30">
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  כל ההעברות מוצפנות TLS 1.3 — תואם תקנות הגנת הפרטיות (העברת מידע בין גופים ציבוריים) ותקנות GDPR
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
