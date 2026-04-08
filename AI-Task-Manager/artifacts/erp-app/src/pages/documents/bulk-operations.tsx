import { useState } from "react";
import { Layers, Upload, Download, FolderEdit, ShieldCheck, Archive, Trash2, Cloud, HardDrive, ScanLine, CheckCircle2, XCircle, Clock, Loader2, FileUp, FileDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const quickActions = [
  { title: "העלאה מרובה", description: "גרור ושחרר קבצים או בחר מהמחשב", icon: Upload, color: "bg-blue-500", lightBg: "bg-blue-50 border-blue-200", textColor: "text-blue-600" },
  { title: "הורדה מרובה", description: "בחר מסמכים והורד כקובץ ZIP", icon: Download, color: "bg-green-500", lightBg: "bg-green-50 border-green-200", textColor: "text-green-600" },
  { title: "שינוי קטגוריה", description: "סיווג מחדש של מסמכים בקבוצה", icon: FolderEdit, color: "bg-orange-500", lightBg: "bg-orange-50 border-orange-200", textColor: "text-orange-600" },
  { title: "שינוי הרשאות", description: "עדכון הרשאות גישה למסמכים", icon: ShieldCheck, color: "bg-purple-500", lightBg: "bg-purple-50 border-purple-200", textColor: "text-purple-600" },
  { title: "ארכיון מרובה", description: "העברת מסמכים לארכיון בצורה מרוכזת", icon: Archive, color: "bg-cyan-500", lightBg: "bg-cyan-50 border-cyan-200", textColor: "text-cyan-600" },
  { title: "מחיקה מרובה", description: "מחיקת מסמכים עם אישור מוקדם", icon: Trash2, color: "bg-red-500", lightBg: "bg-red-50 border-red-200", textColor: "text-red-600" },
];

const activeOperations = [
  { id: "BOP-041", type: "העלאה מרובה", icon: FileUp, docsCount: 128, progress: 72, startedBy: "עוזי כהן", date: "08/04/2026", time: "09:14", status: "בריצה" as const },
  { id: "BOP-040", type: "שינוי קטגוריה", icon: FolderEdit, docsCount: 54, progress: 100, startedBy: "רונית לוי", date: "08/04/2026", time: "08:45", status: "הושלם" as const },
  { id: "BOP-039", type: "ארכיון מרובה", icon: Archive, docsCount: 312, progress: 88, startedBy: "מיכאל אברהם", date: "07/04/2026", time: "16:30", status: "בריצה" as const },
  { id: "BOP-038", type: "הורדה מרובה", icon: FileDown, docsCount: 47, progress: 63, startedBy: "שרה דוידוב", date: "07/04/2026", time: "14:22", status: "נכשל חלקית" as const },
];

const externalSources = [
  { name: "Google Drive", icon: Cloud, connected: true, lastSync: "08/04/2026 08:00", docsAvailable: 1_240 },
  { name: "SharePoint", icon: HardDrive, connected: true, lastSync: "07/04/2026 22:15", docsAvailable: 876 },
  { name: "סורק רשת", icon: ScanLine, connected: false, lastSync: "---", docsAvailable: 0 },
];

const migrationHistory = [
  { id: "MIG-015", source: "Google Drive", date: "05/04/2026", totalDocs: 420, success: 418, failed: 2 },
  { id: "MIG-014", source: "SharePoint", date: "01/04/2026", totalDocs: 310, success: 310, failed: 0 },
  { id: "MIG-013", source: "סורק רשת", date: "28/03/2026", totalDocs: 89, success: 85, failed: 4 },
  { id: "MIG-012", source: "Google Drive", date: "20/03/2026", totalDocs: 1_050, success: 1_044, failed: 6 },
  { id: "MIG-011", source: "SharePoint", date: "15/03/2026", totalDocs: 230, success: 228, failed: 2 },
];

type OpStatus = "בריצה" | "הושלם" | "נכשל חלקית";

function statusBadge(status: OpStatus) {
  const map = {
    "בריצה": { cls: "bg-blue-100 text-blue-700 border-blue-300", Icon: Loader2, spin: true },
    "הושלם": { cls: "bg-green-100 text-green-700 border-green-300", Icon: CheckCircle2, spin: false },
    "נכשל חלקית": { cls: "bg-red-100 text-red-700 border-red-300", Icon: XCircle, spin: false },
  };
  const { cls, Icon, spin } = map[status];
  return <Badge className={`${cls} gap-1`}><Icon size={12} className={spin ? "animate-spin" : ""} />{status}</Badge>;
}

function progressColor(status: OpStatus) {
  if (status === "הושלם") return "[&>div]:bg-green-500";
  if (status === "נכשל חלקית") return "[&>div]:bg-red-500";
  return "[&>div]:bg-blue-500";
}

export default function BulkDocumentOperationsPage() {
  const [activeTab, setActiveTab] = useState("operations");

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div>
        <h1 className="text-lg sm:text-2xl font-bold flex items-center gap-2">
          <Layers className="text-indigo-600" /> פעולות מרובות
        </h1>
        <p className="text-muted-foreground mt-1">
          ביצוע פעולות על מסמכים רבים במקביל &mdash; טכנו-כל עוזי DMS
        </p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="operations">פעולות</TabsTrigger>
          <TabsTrigger value="history">היסטוריה</TabsTrigger>
          <TabsTrigger value="import">ייבוא</TabsTrigger>
          <TabsTrigger value="export">ייצוא</TabsTrigger>
        </TabsList>

        {/* ===== Tab: Operations ===== */}
        <TabsContent value="operations" className="space-y-6">
          {/* Quick Actions */}
          <div>
            <h2 className="text-base font-semibold mb-3">פעולות מהירות</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {quickActions.map((action) => (
                <Card
                  key={action.title}
                  className={`cursor-pointer border-2 transition-all hover:shadow-md ${action.lightBg}`}
                >
                  <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                    <div className={`p-3 rounded-xl ${action.color} text-white`}>
                      <action.icon size={22} />
                    </div>
                    <span className={`font-semibold ${action.textColor}`}>
                      {action.title}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {action.description}
                    </span>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Drag & Drop Zone */}
          <Card className="border-2 border-dashed border-blue-300 bg-blue-50/40">
            <CardContent className="p-8 flex flex-col items-center text-center gap-3">
              <Upload size={36} className="text-blue-400" />
              <p className="font-semibold text-blue-700">
                גרור ושחרר קבצים כאן להעלאה מרובה
              </p>
              <p className="text-xs text-muted-foreground">
                PDF, DOCX, XLSX, ZIP &mdash; עד 50 קבצים בו-זמנית
              </p>
            </CardContent>
          </Card>

          {/* Active Operations */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock size={18} className="text-blue-500" />
                פעולות פעילות
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 border-b">
                    <tr>
                      <th className="px-3 py-2 text-right">מזהה</th>
                      <th className="px-3 py-2 text-right">סוג פעולה</th>
                      <th className="px-3 py-2 text-right">מסמכים</th>
                      <th className="px-3 py-2 text-right min-w-[140px]">התקדמות</th>
                      <th className="px-3 py-2 text-right">הופעל ע"י</th>
                      <th className="px-3 py-2 text-right">תאריך</th>
                      <th className="px-3 py-2 text-right">שעה</th>
                      <th className="px-3 py-2 text-right">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeOperations.map((op) => (
                      <tr key={op.id} className="border-b hover:bg-muted/20">
                        <td className="px-3 py-2 font-mono font-semibold text-indigo-600">
                          {op.id}
                        </td>
                        <td className="px-3 py-2 flex items-center gap-1.5">
                          <op.icon size={14} className="text-muted-foreground" />
                          {op.type}
                        </td>
                        <td className="px-3 py-2 text-center">{op.docsCount}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <Progress
                              value={op.progress}
                              className={`h-2 flex-1 ${progressColor(op.status)}`}
                            />
                            <span className="text-xs font-semibold w-9 text-left">
                              {op.progress}%
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2">{op.startedBy}</td>
                        <td className="px-3 py-2">{op.date}</td>
                        <td className="px-3 py-2">{op.time}</td>
                        <td className="px-3 py-2">{statusBadge(op.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== Tab: History ===== */}
        <TabsContent value="history" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">היסטוריית מיגרציות</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 border-b">
                    <tr>
                      <th className="px-3 py-2 text-right">מזהה</th>
                      <th className="px-3 py-2 text-right">מקור</th>
                      <th className="px-3 py-2 text-right">תאריך</th>
                      <th className="px-3 py-2 text-right">סה"כ מסמכים</th>
                      <th className="px-3 py-2 text-right">הצלחה</th>
                      <th className="px-3 py-2 text-right">כשלון</th>
                      <th className="px-3 py-2 text-right">יחס הצלחה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {migrationHistory.map((mig) => {
                      const ratio =
                        mig.totalDocs > 0
                          ? Math.round((mig.success / mig.totalDocs) * 100)
                          : 0;
                      return (
                        <tr key={mig.id} className="border-b hover:bg-muted/20">
                          <td className="px-3 py-2 font-mono font-semibold text-indigo-600">
                            {mig.id}
                          </td>
                          <td className="px-3 py-2">{mig.source}</td>
                          <td className="px-3 py-2">{mig.date}</td>
                          <td className="px-3 py-2 text-center">{mig.totalDocs.toLocaleString()}</td>
                          <td className="px-3 py-2 text-center text-green-600 font-semibold">
                            {mig.success.toLocaleString()}
                          </td>
                          <td className="px-3 py-2 text-center text-red-500 font-semibold">
                            {mig.failed}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <Progress
                                value={ratio}
                                className={`h-2 flex-1 ${
                                  ratio === 100
                                    ? "[&>div]:bg-green-500"
                                    : ratio >= 95
                                    ? "[&>div]:bg-yellow-500"
                                    : "[&>div]:bg-red-500"
                                }`}
                              />
                              <span className="text-xs font-semibold w-9 text-left">
                                {ratio}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== Tab: Import ===== */}
        <TabsContent value="import" className="space-y-6">
          <div>
            <h2 className="text-base font-semibold mb-3">ייבוא ממקורות חיצוניים</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {externalSources.map((src) => (
                <Card key={src.name} className="border-2">
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <src.icon size={20} className="text-indigo-500" />
                        <span className="font-semibold">{src.name}</span>
                      </div>
                      <Badge
                        className={
                          src.connected
                            ? "bg-green-100 text-green-700 border-green-300"
                            : "bg-gray-100 text-gray-500 border-gray-300"
                        }
                      >
                        {src.connected ? "מחובר" : "לא מחובר"}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-1">
                      <div>
                        סנכרון אחרון: <span className="font-medium">{src.lastSync}</span>
                      </div>
                      <div>
                        מסמכים זמינים:{" "}
                        <span className="font-medium">
                          {src.docsAvailable.toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <button
                      disabled={!src.connected}
                      className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${
                        src.connected
                          ? "bg-indigo-600 text-white hover:bg-indigo-700"
                          : "bg-gray-200 text-gray-400 cursor-not-allowed"
                      }`}
                    >
                      {src.connected ? "התחל ייבוא" : "חבר מקור"}
                    </button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* ===== Tab: Export ===== */}
        <TabsContent value="export" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileDown size={18} className="text-green-600" />
                ייצוא מסמכים
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                בחר פורמט ייצוא והגדרות לייצוא מרוכז של מסמכים מהמערכת.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { label: "ZIP מלא", desc: "כל המסמכים בארכיון ZIP", count: "2,116 מסמכים" },
                  { label: "CSV מטא-דאטה", desc: "ייצוא נתוני מסמכים לטבלה", count: "2,116 רשומות" },
                  { label: "PDF מאוחד", desc: "איחוד מסמכים לקובץ PDF אחד", count: "עד 500 עמודים" },
                ].map((exp) => (
                  <Card key={exp.label} className="border-2 hover:shadow-md transition-all cursor-pointer">
                    <CardContent className="p-4 text-center space-y-2">
                      <Download size={24} className="mx-auto text-green-500" />
                      <div className="font-semibold">{exp.label}</div>
                      <div className="text-xs text-muted-foreground">{exp.desc}</div>
                      <Badge variant="secondary" className="text-xs">{exp.count}</Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
