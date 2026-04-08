import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Button, Input, Label, Card } from "@/components/ui-components";
import { Upload, Download, FileSpreadsheet, FileText, FileJson, CheckCircle2, Clock, AlertCircle, Trash2 } from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";

const FALLBACK_IMPORT_HISTORY = [
  { id: 1, file: "לקוחות_2026.xlsx", type: "Excel", module: "לקוחות", records: 245, status: "הצליח", date: "17/03/2026 10:30", imported: 242, errors: 3 },
  { id: 2, file: "מוצרים.csv", type: "CSV", module: "מוצרים", records: 1200, status: "הצליח", date: "15/03/2026 14:15", imported: 1200, errors: 0 },
  { id: 3, file: "ספקים_Q1.xlsx", type: "Excel", module: "ספקים", records: 89, status: "שגיאה", date: "10/03/2026 09:00", imported: 0, errors: 89 },
];

const FALLBACK_EXPORT_HISTORY = [
  { id: 1, file: "הזמנות_2026.xlsx", type: "Excel", module: "הזמנות", records: 1423, date: "17/03/2026 12:00" },
  { id: 2, file: "לקוחות_מלא.pdf", type: "PDF", module: "לקוחות", records: 312, date: "16/03/2026 16:30" },
  { id: 3, file: "נתונים.json", type: "JSON", module: "כל המערכת", records: 5820, date: "01/03/2026 08:00" },
];

export default function ImportExportSection() {
  const { data: importexportData } = useQuery({
    queryKey: ["import-export"],
    queryFn: () => authFetch("/api/settings/import_export"),
    staleTime: 5 * 60 * 1000,
  });

  const IMPORT_HISTORY = importexportData ?? FALLBACK_IMPORT_HISTORY;

  const [activeTab, setActiveTab] = useState("import");
  const [selectedModule, setSelectedModule] = useState("");
  const [fileFormat, setFileFormat] = useState("xlsx");
  const [importStep, setImportStep] = useState<"upload" | "mapping" | "preview">("upload");
  const [dragOver, setDragOver] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);

  const tabs = [
    { id: "import", label: "ייבוא נתונים" },
    { id: "export", label: "ייצוא נתונים" },
    { id: "history", label: "היסטוריה" },
    { id: "settings", label: "הגדרות" },
  ];

  const MODULES = ["לקוחות", "ספקים", "מוצרים", "הזמנות", "חשבוניות", "ליסט מחירים"];
  const FORMATS = [
    { id: "xlsx", label: "Excel (.xlsx)", icon: FileSpreadsheet },
    { id: "csv", label: "CSV", icon: FileText },
    { id: "json", label: "JSON", icon: FileJson },
  ];

  const STATUS_CONFIG: Record<string, { color: string; bg: string; icon: any }> = {
    "הצליח": { color: "text-green-400", bg: "bg-green-500/10", icon: CheckCircle2 },
    "שגיאה": { color: "text-red-400", bg: "bg-red-500/10", icon: AlertCircle },
    "בתהליך": { color: "text-yellow-400", bg: "bg-yellow-500/10", icon: Clock },
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center">
          <FileSpreadsheet className="w-5 h-5 text-green-500" />
        </div>
        <div>
          <h1 className="text-lg sm:text-2xl font-bold">Import / Export</h1>
          <p className="text-sm text-muted-foreground">ייבוא וייצוא נתונים — CSV, Excel, JSON, מיפוי שדות</p>
        </div>
      </div>

      <div className="flex gap-1 mb-6 border-b border-border overflow-x-auto pb-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "import" && (
        <div className="space-y-4">
          <div className="flex items-center gap-4 mb-2">
            {["upload", "mapping", "preview"].map((step, i) => (
              <div key={step} className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                  importStep === step ? "bg-primary text-foreground" : "bg-muted text-muted-foreground"
                }`}>
                  {i + 1}
                </div>
                <span className={`text-xs ${importStep === step ? "text-primary font-medium" : "text-muted-foreground"}`}>
                  {step === "upload" ? "העלאת קובץ" : step === "mapping" ? "מיפוי שדות" : "תצוגה מקדימה"}
                </span>
                {i < 2 && <div className="w-8 h-px bg-border" />}
              </div>
            ))}
          </div>

          {importStep === "upload" && (
            <>
              <Card className="p-4">
                <Label>בחר מודול לייבוא</Label>
                <select
                  className="w-full mt-2 bg-background border border-border rounded-lg px-3 py-2 text-sm"
                  value={selectedModule}
                  onChange={(e) => setSelectedModule(e.target.value)}
                >
                  <option value="">בחר מודול...</option>
                  {MODULES.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </Card>

              <div
                className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors ${
                  dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                }`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); setUploadedFile("data.xlsx"); }}
              >
                <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <h3 className="font-semibold mb-1">גרור קובץ לכאן</h3>
                <p className="text-sm text-muted-foreground mb-4">או לחץ לבחירת קובץ</p>
                <div className="flex items-center justify-center gap-3 mb-4">
                  {FORMATS.map(fmt => (
                    <span key={fmt.id} className="flex items-center gap-1 text-xs text-muted-foreground bg-muted/30 px-2 py-1 rounded">
                      <fmt.icon className="w-3 h-3" />
                      {fmt.label}
                    </span>
                  ))}
                </div>
                <Button variant="outline" onClick={() => setUploadedFile("לקוחות_2026.xlsx")}>
                  בחר קובץ
                </Button>
              </div>

              {uploadedFile && (
                <div className="flex items-center gap-3 p-3 bg-green-500/10 rounded-lg border border-green-500/20">
                  <FileSpreadsheet className="w-5 h-5 text-green-400" />
                  <span className="flex-1 text-sm font-medium">{uploadedFile}</span>
                  <Button size="sm" onClick={() => setImportStep("mapping")}>המשך למיפוי</Button>
                </div>
              )}
            </>
          )}

          {importStep === "mapping" && (
            <Card className="p-3 sm:p-6">
              <h3 className="font-semibold mb-4">מיפוי שדות</h3>
              <p className="text-sm text-muted-foreground mb-4">מפה את עמודות הקובץ לשדות במערכת</p>
              <div className="space-y-3">
                {["שם לקוח", "טלפון", "אימייל", "כתובת", "עיר"].map((field) => (
                  <div key={field} className="flex items-center gap-4">
                    <span className="w-32 text-sm font-medium font-mono bg-muted/30 px-2 py-1 rounded">{field}</span>
                    <span className="text-muted-foreground">←</span>
                    <select className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm">
                      <option value="">בחר שדה...</option>
                      <option value="name">שם</option>
                      <option value="phone">טלפון</option>
                      <option value="email">אימייל</option>
                      <option value="address">כתובת</option>
                      <option value="city">עיר</option>
                    </select>
                  </div>
                ))}
              </div>
              <div className="flex gap-3 mt-4">
                <Button onClick={() => setImportStep("preview")}>המשך לתצוגה מקדימה</Button>
                <Button variant="outline" onClick={() => setImportStep("upload")}>חזור</Button>
              </div>
            </Card>
          )}

          {importStep === "preview" && (
            <Card className="p-3 sm:p-6">
              <h3 className="font-semibold mb-4">תצוגה מקדימה — 5 שורות ראשונות</h3>
              <div className="overflow-x-auto mb-4">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      {["שם", "טלפון", "אימייל", "כתובת", "עיר"].map(h => (
                        <th key={h} className="text-right p-2 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["אריה כהן", "052-1234567", "arye@gmail.com", "הרצל 15", "תל אביב"],
                      ["דינה לוי", "054-9876543", "dina@gmail.com", "ביאליק 8", "חיפה"],
                      ["יוסף גולן", "053-5555555", "yosef@test.com", "הגפן 3", "ירושלים"],
                    ].map((row, i) => (
                      <tr key={i} className="border-b border-border/50">
                        {row.map((cell, j) => <td key={j} className="p-2">{cell}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-sm text-muted-foreground mb-4">סה"כ 245 רשומות מוכנות לייבוא</p>
              <div className="flex gap-3">
                <Button className="gap-2">
                  <Upload className="w-4 h-4" />
                  יבא 245 רשומות
                </Button>
                <Button variant="outline" onClick={() => setImportStep("mapping")}>חזור</Button>
              </div>
            </Card>
          )}
        </div>
      )}

      {activeTab === "export" && (
        <div className="space-y-4">
          <Card className="p-3 sm:p-6">
            <h3 className="text-lg font-semibold mb-4">הגדרות ייצוא</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>מודול לייצוא</Label>
                <select className="w-full mt-2 bg-background border border-border rounded-lg px-3 py-2 text-sm" value={selectedModule} onChange={(e) => setSelectedModule(e.target.value)}>
                  <option value="">בחר מודול...</option>
                  {MODULES.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <Label>פורמט ייצוא</Label>
                <select className="w-full mt-2 bg-background border border-border rounded-lg px-3 py-2 text-sm" value={fileFormat} onChange={(e) => setFileFormat(e.target.value)}>
                  {FORMATS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
              </div>
              <div>
                <Label>סינון לפי תאריך</Label>
                <Input type="date" className="mt-2" />
              </div>
              <div>
                <Label>עד תאריך</Label>
                <Input type="date" className="mt-2" />
              </div>
            </div>
            <div className="mt-4 flex gap-3">
              <Button className="gap-2">
                <Download className="w-4 h-4" />
                ייצא נתונים
              </Button>
            </div>
          </Card>
        </div>
      )}

      {activeTab === "history" && (
        <div className="space-y-4 sm:space-y-6">
          <div>
            <h3 className="font-semibold mb-3">היסטוריית ייבוא</h3>
            <Card className="overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-right p-3 font-medium text-xs text-muted-foreground">קובץ</th>
                    <th className="text-right p-3 font-medium text-xs text-muted-foreground">מודול</th>
                    <th className="text-right p-3 font-medium text-xs text-muted-foreground">רשומות</th>
                    <th className="text-right p-3 font-medium text-xs text-muted-foreground">שגיאות</th>
                    <th className="text-right p-3 font-medium text-xs text-muted-foreground">תאריך</th>
                    <th className="text-right p-3 font-medium text-xs text-muted-foreground">סטטוס</th>
                  </tr>
                </thead>
                <tbody>
                  {IMPORT_HISTORY.map((item) => {
                    const config = STATUS_CONFIG[item.status];
                    return (
                      <tr key={item.id} className="border-b border-border hover:bg-muted/20">
                        <td className="p-3 font-mono text-xs">{item.file}</td>
                        <td className="p-3 text-xs">{item.module}</td>
                        <td className="p-3 text-xs">{item.imported}/{item.records}</td>
                        <td className="p-3 text-xs text-red-400">{item.errors > 0 ? item.errors : "—"}</td>
                        <td className="p-3 text-xs text-muted-foreground">{item.date}</td>
                        <td className="p-3">
                          <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full w-fit ${config.bg} ${config.color}`}>
                            <config.icon className="w-3 h-3" />
                            {item.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          </div>

          <div>
            <h3 className="font-semibold mb-3">היסטוריית ייצוא</h3>
            <Card className="overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-right p-3 font-medium text-xs text-muted-foreground">קובץ</th>
                    <th className="text-right p-3 font-medium text-xs text-muted-foreground">מודול</th>
                    <th className="text-right p-3 font-medium text-xs text-muted-foreground">רשומות</th>
                    <th className="text-right p-3 font-medium text-xs text-muted-foreground">תאריך</th>
                    <th className="text-right p-3 font-medium text-xs text-muted-foreground">הורד</th>
                  </tr>
                </thead>
                <tbody>
                  {EXPORT_HISTORY.map((item) => (
                    <tr key={item.id} className="border-b border-border hover:bg-muted/20">
                      <td className="p-3 font-mono text-xs">{item.file}</td>
                      <td className="p-3 text-xs">{item.module}</td>
                      <td className="p-3 text-xs">{item.records.toLocaleString()}</td>
                      <td className="p-3 text-xs text-muted-foreground">{item.date}</td>
                      <td className="p-3">
                        <button className="p-1 hover:bg-primary/10 rounded">
                          <Download className="w-3.5 h-3.5 text-primary" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        </div>
      )}

      {activeTab === "settings" && (
        <Card className="p-3 sm:p-6">
          <h3 className="text-lg font-semibold mb-4">הגדרות ייבוא/ייצוא</h3>
          <div className="space-y-3">
            {[
              { label: "אמת נתונים לפני ייבוא", desc: "בדיקת שדות חובה ופורמטים לפני שמירה", enabled: true },
              { label: "דלג על שורות עם שגיאות", desc: "המשך ייבוא גם כשיש שורות בעייתיות", enabled: false },
              { label: "שמור היסטוריית ייבוא", desc: "שמור רשומה של כל פעולות הייבוא", enabled: true },
              { label: "עדכן רשומות קיימות", desc: "עדכן רשומות קיימות לפי מזהה ייחודי", enabled: false },
              { label: "שלח דוח ייבוא במייל", desc: "שלח סיכום לאחר השלמת ייבוא", enabled: true },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                <div>
                  <p className="font-medium text-sm">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" defaultChecked={item.enabled} />
                  <div className="w-11 h-6 bg-muted rounded-full peer peer-checked:bg-primary transition-colors after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-card after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-[-20px]" />
                </label>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <Button className="gap-2">
              <CheckCircle2 className="w-4 h-4" />
              שמור הגדרות
            </Button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="import-export" />
        <RelatedRecords entityType="import-export" />
      </div>
    </div>
  );
}
