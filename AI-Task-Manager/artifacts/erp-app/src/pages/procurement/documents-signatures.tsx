import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  PenTool, FileText, FileCheck, Clock, Link2, GitBranch, Shield,
  CheckCircle2, XCircle, AlertTriangle, Upload, Eye, History, Search
} from "lucide-react";

const statusColors: Record<string, string> = {
  "חתום": "bg-green-500/20 text-green-400 border-green-500/30",
  "ממתין לחתימה": "bg-amber-500/20 text-amber-400 border-amber-500/30",
  "טיוטה": "bg-slate-500/20 text-slate-400 border-slate-500/30",
  "נדחה": "bg-red-500/20 text-red-400 border-red-500/30",
  "בתוקף": "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  "פג תוקף": "bg-red-500/20 text-red-400 border-red-500/30",
  "אושר": "bg-green-500/20 text-green-400 border-green-500/30",
  "הושלם": "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

const documents = [
  { id: "DOC-001", name: "חוזה שנתי - אלומט בע\"מ", type: "חוזה", linkedTo: "PO-1042", uploadedBy: "עוזי כהן", date: "2026-04-01", version: "v3.1", status: "חתום" },
  { id: "DOC-002", name: "הזמנת רכש פרופילי אלומיניום", type: "הזמנה", linkedTo: "PO-1085", uploadedBy: "דנה לוי", date: "2026-04-03", version: "v1.0", status: "ממתין לחתימה" },
  { id: "DOC-003", name: "תעודת משלוח - זכוכית מחוסמת", type: "תעודת משלוח", linkedTo: "PO-1071", uploadedBy: "רון אברהם", date: "2026-04-05", version: "v1.0", status: "חתום" },
  { id: "DOC-004", name: "אישור איכות - פלדת אל-חלד", type: "אישור איכות", linkedTo: "PO-1063", uploadedBy: "מיכל שרון", date: "2026-04-06", version: "v2.0", status: "בתוקף" },
  { id: "DOC-005", name: "חוזה מסגרת - מתכת פלוס", type: "חוזה", linkedTo: "PO-1090", uploadedBy: "עוזי כהן", date: "2026-04-07", version: "v1.2", status: "ממתין לחתימה" },
  { id: "DOC-006", name: "הזמנת חומרי גלם Q2", type: "הזמנה", linkedTo: "PO-1093", uploadedBy: "יוסי מזרחי", date: "2026-04-07", version: "v1.0", status: "טיוטה" },
  { id: "DOC-007", name: "תעודת בדיקה - ציפוי אנודייז", type: "אישור איכות", linkedTo: "PO-1058", uploadedBy: "מיכל שרון", date: "2026-04-02", version: "v1.1", status: "חתום" },
  { id: "DOC-008", name: "הסכם סודיות - ספק חדש", type: "חוזה", linkedTo: "—", uploadedBy: "דנה לוי", date: "2026-04-08", version: "v1.0", status: "ממתין לחתימה" },
];

const signatures = [
  { id: "SIG-001", docId: "DOC-002", docName: "הזמנת רכש פרופילי אלומיניום", signer: "עוזי כהן", role: "מנכ\"ל", requestedDate: "2026-04-03", status: "ממתין לחתימה", type: "אישור" },
  { id: "SIG-002", docId: "DOC-005", docName: "חוזה מסגרת - מתכת פלוס", signer: "דנה לוי", role: "מנהלת רכש", requestedDate: "2026-04-07", status: "ממתין לחתימה", type: "חוזה" },
  { id: "SIG-003", docId: "DOC-001", docName: "חוזה שנתי - אלומט בע\"מ", signer: "עוזי כהן", role: "מנכ\"ל", requestedDate: "2026-03-28", status: "אושר", type: "חוזה", signedDate: "2026-04-01" },
  { id: "SIG-004", docId: "DOC-003", docName: "תעודת משלוח - זכוכית מחוסמת", signer: "רון אברהם", role: "מנהל מחסן", requestedDate: "2026-04-04", status: "אושר", type: "אישור", signedDate: "2026-04-05" },
  { id: "SIG-005", docId: "DOC-008", docName: "הסכם סודיות - ספק חדש", signer: "עוזי כהן", role: "מנכ\"ל", requestedDate: "2026-04-08", status: "ממתין לחתימה", type: "חוזה" },
  { id: "SIG-006", docId: "DOC-004", docName: "אישור איכות - פלדת אל-חלד", signer: "מיכל שרון", role: "מנהלת איכות", requestedDate: "2026-04-05", status: "אושר", type: "אישור", signedDate: "2026-04-06" },
  { id: "SIG-007", docId: "DOC-006", docName: "הזמנת חומרי גלם Q2", signer: "יוסי מזרחי", role: "רכש", requestedDate: "2026-04-07", status: "נדחה", type: "אישור" },
  { id: "SIG-008", docId: "DOC-007", docName: "תעודת בדיקה - ציפוי אנודייז", signer: "מיכל שרון", role: "מנהלת איכות", requestedDate: "2026-04-01", status: "אושר", type: "אישור", signedDate: "2026-04-02" },
];

const versions = [
  { docId: "DOC-001", docName: "חוזה שנתי - אלומט בע\"מ", from: "v3.0", to: "v3.1", changedBy: "עוזי כהן", date: "2026-04-01", summary: "עדכון תנאי תשלום ל-שוטף+60" },
  { docId: "DOC-004", docName: "אישור איכות - פלדת אל-חלד", from: "v1.0", to: "v2.0", changedBy: "מיכל שרון", date: "2026-04-06", summary: "הוספת תוצאות בדיקת מתיחה" },
  { docId: "DOC-005", docName: "חוזה מסגרת - מתכת פלוס", from: "v1.0", to: "v1.2", changedBy: "דנה לוי", date: "2026-04-07", summary: "תיקון סעיף אחריות, הוספת נספח מחירים" },
  { docId: "DOC-007", docName: "תעודת בדיקה - ציפוי אנודייז", from: "v1.0", to: "v1.1", changedBy: "מיכל שרון", date: "2026-04-02", summary: "עדכון ערכי עובי ציפוי" },
  { docId: "DOC-002", docName: "הזמנת רכש פרופילי אלומיניום", from: "—", to: "v1.0", changedBy: "דנה לוי", date: "2026-04-03", summary: "העלאה ראשונית של מסמך" },
  { docId: "DOC-006", docName: "הזמנת חומרי גלם Q2", from: "—", to: "v1.0", changedBy: "יוסי מזרחי", date: "2026-04-07", summary: "טיוטה ראשונית" },
];

const auditTrail = [
  { timestamp: "2026-04-08 09:15", user: "דנה לוי", action: "העלאת מסמך", target: "DOC-008 - הסכם סודיות", detail: "מסמך חדש הועלה למערכת" },
  { timestamp: "2026-04-07 16:42", user: "דנה לוי", action: "עדכון גרסה", target: "DOC-005 - חוזה מסגרת", detail: "גרסה עודכנה מ-v1.0 ל-v1.2" },
  { timestamp: "2026-04-07 14:20", user: "יוסי מזרחי", action: "העלאת מסמך", target: "DOC-006 - הזמנת חומרי גלם", detail: "טיוטה ראשונית נשמרה" },
  { timestamp: "2026-04-07 11:05", user: "יוסי מזרחי", action: "דחיית חתימה", target: "SIG-007 - הזמנת חומרי גלם", detail: "נדחה — חסרים פרטי ספק" },
  { timestamp: "2026-04-06 10:30", user: "מיכל שרון", action: "חתימה דיגיטלית", target: "DOC-004 - אישור איכות", detail: "המסמך נחתם ואושר" },
  { timestamp: "2026-04-05 15:00", user: "רון אברהם", action: "חתימה דיגיטלית", target: "DOC-003 - תעודת משלוח", detail: "תעודת משלוח נחתמה ואומתה" },
  { timestamp: "2026-04-03 08:45", user: "דנה לוי", action: "קישור למסמך", target: "DOC-002 → PO-1085", detail: "מסמך קושר להזמנת רכש" },
  { timestamp: "2026-04-01 13:10", user: "עוזי כהן", action: "חתימה דיגיטלית", target: "DOC-001 - חוזה שנתי", detail: "חוזה נחתם סופית — v3.1" },
];

const kpis = [
  { label: "סה\"כ מסמכים", value: "48", icon: FileText, color: "text-blue-400", bg: "bg-blue-500/20" },
  { label: "ממתינים לחתימה", value: "7", icon: Clock, color: "text-amber-400", bg: "bg-amber-500/20" },
  { label: "נחתמו היום", value: "3", icon: CheckCircle2, color: "text-green-400", bg: "bg-green-500/20" },
  { label: "מקושרים להזמנות", value: "42", icon: Link2, color: "text-purple-400", bg: "bg-purple-500/20" },
  { label: "עדכוני גרסה", value: "12", icon: GitBranch, color: "text-cyan-400", bg: "bg-cyan-500/20" },
  { label: "רשומות ביקורת", value: "156", icon: Shield, color: "text-rose-400", bg: "bg-rose-500/20" },
];

const typeIcons: Record<string, any> = {
  "חוזה": FileCheck,
  "הזמנה": FileText,
  "תעודת משלוח": Upload,
  "אישור איכות": Shield,
};

export default function DocumentsSignatures() {
  const [activeTab, setActiveTab] = useState("documents");
  const [searchTerm, setSearchTerm] = useState("");

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-6" dir="rtl">
      <div className="max-w-7xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <PenTool size={22} className="text-primary" />
              מסמכים וחתימות דיגיטליות
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">ניהול מסמכים · חתימות דיגיטליות · בקרת גרסאות · מעקב ביקורת</p>
          </div>
          <div className="relative">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text" placeholder="חיפוש מסמך..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              className="pr-8 pl-3 py-2 rounded-lg border border-slate-700 bg-slate-800/50 text-foreground text-sm w-56"
            />
          </div>
        </div>

        {/* KPI Row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {kpis.map((k, i) => (
            <Card key={i} className="border-slate-700 bg-slate-800/50">
              <CardContent className="p-3 flex items-center gap-3">
                <div className={`w-9 h-9 rounded-full ${k.bg} flex items-center justify-center`}>
                  <k.icon className={k.color} size={18} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{k.label}</p>
                  <p className="text-lg font-bold">{k.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-slate-800/50 border border-slate-700">
            <TabsTrigger value="documents">מסמכים</TabsTrigger>
            <TabsTrigger value="signatures">חתימות</TabsTrigger>
            <TabsTrigger value="versions">גרסאות</TabsTrigger>
            <TabsTrigger value="audit">ביקורת</TabsTrigger>
          </TabsList>

          {/* Documents Tab */}
          <TabsContent value="documents">
            <Card className="border-slate-700 bg-slate-800/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText size={16} className="text-blue-400" />
                  רשימת מסמכים
                  <Badge className="bg-blue-500/20 text-blue-400 text-xs mr-2">{documents.length} מסמכים</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-right border-b border-slate-700">
                        <th className="pb-2 pr-2 font-medium text-muted-foreground text-xs">מזהה</th>
                        <th className="pb-2 font-medium text-muted-foreground text-xs">שם המסמך</th>
                        <th className="pb-2 font-medium text-muted-foreground text-xs">סוג</th>
                        <th className="pb-2 font-medium text-muted-foreground text-xs">מקושר ל-</th>
                        <th className="pb-2 font-medium text-muted-foreground text-xs">הועלה ע״י</th>
                        <th className="pb-2 font-medium text-muted-foreground text-xs">תאריך</th>
                        <th className="pb-2 font-medium text-muted-foreground text-xs">גרסה</th>
                        <th className="pb-2 font-medium text-muted-foreground text-xs">סטטוס</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                      {documents.filter(d => !searchTerm || d.name.includes(searchTerm) || d.id.includes(searchTerm)).map(doc => {
                        const TypeIcon = typeIcons[doc.type] || FileText;
                        return (
                          <tr key={doc.id} className="hover:bg-slate-700/30 transition-colors">
                            <td className="py-3 pr-2">
                              <span className="font-mono text-xs bg-slate-700/50 px-2 py-0.5 rounded">{doc.id}</span>
                            </td>
                            <td className="py-3 font-medium text-foreground">{doc.name}</td>
                            <td className="py-3">
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <TypeIcon size={13} />
                                <span className="text-xs">{doc.type}</span>
                              </div>
                            </td>
                            <td className="py-3">
                              {doc.linkedTo !== "—" ? (
                                <Badge className="bg-purple-500/20 text-purple-300 text-xs">{doc.linkedTo}</Badge>
                              ) : <span className="text-muted-foreground text-xs">—</span>}
                            </td>
                            <td className="py-3 text-muted-foreground text-xs">{doc.uploadedBy}</td>
                            <td className="py-3 text-muted-foreground text-xs">{doc.date}</td>
                            <td className="py-3">
                              <Badge className="bg-cyan-500/20 text-cyan-300 text-xs">{doc.version}</Badge>
                            </td>
                            <td className="py-3">
                              <Badge className={`text-xs ${statusColors[doc.status] || "bg-slate-500/20 text-slate-400"}`}>{doc.status}</Badge>
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

          {/* Signatures Tab */}
          <TabsContent value="signatures">
            <Card className="border-slate-700 bg-slate-800/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <PenTool size={16} className="text-amber-400" />
                  תור חתימות
                  <Badge className="bg-amber-500/20 text-amber-400 text-xs mr-2">{signatures.filter(s => s.status === "ממתין לחתימה").length} ממתינים</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-right border-b border-slate-700">
                        <th className="pb-2 pr-2 font-medium text-muted-foreground text-xs">מזהה</th>
                        <th className="pb-2 font-medium text-muted-foreground text-xs">מסמך</th>
                        <th className="pb-2 font-medium text-muted-foreground text-xs">חותם</th>
                        <th className="pb-2 font-medium text-muted-foreground text-xs">תפקיד</th>
                        <th className="pb-2 font-medium text-muted-foreground text-xs">סוג חתימה</th>
                        <th className="pb-2 font-medium text-muted-foreground text-xs">תאריך בקשה</th>
                        <th className="pb-2 font-medium text-muted-foreground text-xs">תאריך חתימה</th>
                        <th className="pb-2 font-medium text-muted-foreground text-xs">סטטוס</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                      {signatures.map(sig => (
                        <tr key={sig.id} className="hover:bg-slate-700/30 transition-colors">
                          <td className="py-3 pr-2">
                            <span className="font-mono text-xs bg-slate-700/50 px-2 py-0.5 rounded">{sig.id}</span>
                          </td>
                          <td className="py-3">
                            <div className="flex flex-col">
                              <span className="text-foreground text-xs font-medium">{sig.docName}</span>
                              <span className="text-muted-foreground text-xs">{sig.docId}</span>
                            </div>
                          </td>
                          <td className="py-3 text-foreground text-xs">{sig.signer}</td>
                          <td className="py-3">
                            <Badge className="bg-slate-600/30 text-slate-300 text-xs">{sig.role}</Badge>
                          </td>
                          <td className="py-3 text-muted-foreground text-xs">{sig.type}</td>
                          <td className="py-3 text-muted-foreground text-xs">{sig.requestedDate}</td>
                          <td className="py-3 text-muted-foreground text-xs">{(sig as any).signedDate || "—"}</td>
                          <td className="py-3">
                            <Badge className={`text-xs ${statusColors[sig.status] || "bg-slate-500/20 text-slate-400"}`}>
                              {sig.status === "אושר" && <CheckCircle2 size={10} className="ml-1" />}
                              {sig.status === "נדחה" && <XCircle size={10} className="ml-1" />}
                              {sig.status === "ממתין לחתימה" && <Clock size={10} className="ml-1" />}
                              {sig.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-700">
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>התקדמות חתימות היום:</span>
                    <Progress value={62} className="flex-1 h-2" />
                    <span className="text-foreground font-medium">62%</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Versions Tab */}
          <TabsContent value="versions">
            <Card className="border-slate-700 bg-slate-800/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <GitBranch size={16} className="text-cyan-400" />
                  היסטוריית גרסאות
                  <Badge className="bg-cyan-500/20 text-cyan-400 text-xs mr-2">{versions.length} שינויים</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {versions.map((v, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-lg border border-slate-700 bg-slate-800/30 hover:bg-slate-700/30 transition-colors">
                      <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center mt-0.5">
                        <History className="text-cyan-400" size={14} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs bg-slate-700/50 px-2 py-0.5 rounded">{v.docId}</span>
                          <span className="text-sm font-medium text-foreground">{v.docName}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge className="bg-slate-600/30 text-slate-300 text-xs">{v.from || "חדש"}</Badge>
                          <span className="text-muted-foreground text-xs">→</span>
                          <Badge className="bg-cyan-500/20 text-cyan-300 text-xs">{v.to}</Badge>
                          <span className="text-muted-foreground text-xs">·</span>
                          <span className="text-muted-foreground text-xs">{v.changedBy}</span>
                          <span className="text-muted-foreground text-xs">·</span>
                          <span className="text-muted-foreground text-xs">{v.date}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{v.summary}</p>
                      </div>
                      <button className="p-1.5 rounded hover:bg-slate-700/50 text-muted-foreground hover:text-foreground transition-colors">
                        <Eye size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Audit Tab */}
          <TabsContent value="audit">
            <Card className="border-slate-700 bg-slate-800/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield size={16} className="text-rose-400" />
                  יומן ביקורת
                  <Badge className="bg-rose-500/20 text-rose-400 text-xs mr-2">{auditTrail.length} רשומות</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {auditTrail.map((entry, i) => {
                    const actionColor = entry.action.includes("חתימה") ? "text-green-400" :
                      entry.action.includes("דחי") ? "text-red-400" :
                      entry.action.includes("עדכון") ? "text-cyan-400" :
                      entry.action.includes("העלא") ? "text-blue-400" :
                      entry.action.includes("קישור") ? "text-purple-400" : "text-muted-foreground";
                    const ActionIcon = entry.action.includes("חתימה") ? CheckCircle2 :
                      entry.action.includes("דחי") ? XCircle :
                      entry.action.includes("עדכון") ? GitBranch :
                      entry.action.includes("העלא") ? Upload :
                      entry.action.includes("קישור") ? Link2 : AlertTriangle;
                    return (
                      <div key={i} className="flex items-start gap-3 p-3 rounded-lg border border-slate-700/50 hover:bg-slate-700/20 transition-colors">
                        <div className={`mt-0.5 ${actionColor}`}>
                          <ActionIcon size={15} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs font-medium ${actionColor}`}>{entry.action}</span>
                            <span className="text-xs text-muted-foreground">·</span>
                            <span className="text-xs text-foreground">{entry.target}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{entry.detail}</p>
                        </div>
                        <div className="text-left shrink-0">
                          <p className="text-xs text-muted-foreground">{entry.user}</p>
                          <p className="text-xs text-muted-foreground">{entry.timestamp}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
