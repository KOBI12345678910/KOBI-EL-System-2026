import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  FileText, FilePlus, FileCheck, FileSignature, ShieldCheck,
  Search, Download, Upload, Eye, Pen, Copy, Trash2, Clock,
  CheckCircle2, AlertTriangle, Plus, CalendarDays
} from "lucide-react";

const statusStyle: Record<string, { label: string; cls: string }> = {
  draft: { label: "טיוטה", cls: "bg-yellow-500/20 text-yellow-600" },
  final: { label: "סופי", cls: "bg-blue-500/20 text-blue-600" },
  signed: { label: "חתום", cls: "bg-green-500/20 text-green-600" },
};

const FALLBACK_DOCUMENTS = [
  { id: 1, name: "הצעה טכנית", tender: "TND-001", category: "טכני", updated: "2026-04-06", status: "final", version: 3 },
  { id: 2, name: "הצעה מסחרית", tender: "TND-001", category: "מסחרי", updated: "2026-04-07", status: "signed", version: 2 },
  { id: 3, name: "פרופיל חברה", tender: "TND-002", category: "כללי", updated: "2026-04-05", status: "final", version: 1 },
  { id: 4, name: "רשימת ממליצים", tender: "TND-001", category: "כללי", updated: "2026-04-04", status: "final", version: 1 },
  { id: 5, name: "תעודות ISO / איכות", tender: "TND-003", category: "תקינה", updated: "2026-04-03", status: "signed", version: 2 },
  { id: 6, name: "מסמכי ביטוח", tender: "TND-002", category: "משפטי", updated: "2026-04-02", status: "draft", version: 1 },
  { id: 7, name: "דוחות כספיים", tender: "TND-001", category: "פיננסי", updated: "2026-04-01", status: "final", version: 4 },
  { id: 8, name: "ערבויות בנקאיות", tender: "TND-003", category: "פיננסי", updated: "2026-03-30", status: "draft", version: 1 },
  { id: 9, name: "שרטוטים הנדסיים", tender: "TND-001", category: "טכני", updated: "2026-04-06", status: "signed", version: 5 },
  { id: 10, name: "מפרט טכני", tender: "TND-002", category: "טכני", updated: "2026-04-05", status: "final", version: 2 },
  { id: 11, name: "כתב כמויות (BOQ)", tender: "TND-001", category: "מסחרי", updated: "2026-04-07", status: "signed", version: 3 },
  { id: 12, name: "לוח זמנים לפרויקט", tender: "TND-003", category: "תכנון", updated: "2026-04-04", status: "draft", version: 2 },
  { id: 13, name: "קורות חיים צוות", tender: "TND-002", category: "כללי", updated: "2026-04-03", status: "final", version: 1 },
  { id: 14, name: "רשימת קבלני משנה", tender: "TND-001", category: "תפעול", updated: "2026-04-02", status: "final", version: 1 },
  { id: 15, name: "תכנית בטיחות", tender: "TND-003", category: "בטיחות", updated: "2026-04-01", status: "draft", version: 1 },
];

const FALLBACK_TEMPLATES = [
  { id: 1, name: "תבנית הצעה טכנית", category: "טכני", uses: 24, lastUsed: "2026-04-05" },
  { id: 2, name: "תבנית הצעה מסחרית", category: "מסחרי", uses: 18, lastUsed: "2026-04-06" },
  { id: 3, name: "תבנית פרופיל חברה", category: "כללי", uses: 31, lastUsed: "2026-04-07" },
  { id: 4, name: "תבנית מפרט טכני", category: "טכני", uses: 15, lastUsed: "2026-04-02" },
  { id: 5, name: "תבנית כתב כמויות", category: "מסחרי", uses: 12, lastUsed: "2026-04-01" },
  { id: 6, name: "תבנית תכנית בטיחות", category: "בטיחות", uses: 9, lastUsed: "2026-03-28" },
  { id: 7, name: "תבנית לוח זמנים", category: "תכנון", uses: 20, lastUsed: "2026-04-04" },
  { id: 8, name: "תבנית ערבות בנקאית", category: "פיננסי", uses: 7, lastUsed: "2026-03-25" },
];

const FALLBACK_COMPLIANCE_CHECKLIST = [
  { type: "מכרז ממשלתי", required: ["הצעה טכנית", "הצעה מסחרית", "תעודות ISO", "דוחות כספיים", "ערבות בנקאית", "ביטוח", "תכנית בטיחות"], completed: 5 },
  { type: "מכרז עירוני", required: ["הצעה טכנית", "הצעה מסחרית", "פרופיל חברה", "ממליצים", "תעודות ISO", "ביטוח"], completed: 4 },
  { type: "מכרז פרטי", required: ["הצעה טכנית", "הצעה מסחרית", "פרופיל חברה", "שרטוטים", "כתב כמויות"], completed: 5 },
  { type: "מכרז בינלאומי", required: ["הצעה טכנית", "הצעה מסחרית", "ISO", "דוחות כספיים", "ערבות", "ביטוח", "בטיחות", "קבלני משנה"], completed: 3 },
  { type: "מכרז ביטחוני", required: ["הצעה טכנית", "הצעה מסחרית", "סיווג ביטחוני", "ISO", "דוחות כספיים", "ערבות", "ביטוח", "בטיחות", "קבלני משנה"], completed: 6 },
];

const FALLBACK_SIGNATURES = [
  { id: 1, doc: "הצעה מסחרית - TND-001", signer: "עוזי אלמליח", role: "מנכ\"ל", status: "completed", date: "2026-04-07" },
  { id: 2, doc: "כתב כמויות - TND-001", signer: "עוזי אלמליח", role: "מנכ\"ל", status: "completed", date: "2026-04-07" },
  { id: 3, doc: "שרטוטים הנדסיים - TND-001", signer: "רונן כהן", role: "מהנדס ראשי", status: "completed", date: "2026-04-06" },
  { id: 4, doc: "מסמכי ביטוח - TND-002", signer: "דנה לוי", role: "סמנכ\"ל כספים", status: "pending", date: "2026-04-08" },
  { id: 5, doc: "ערבויות בנקאיות - TND-003", signer: "דנה לוי", role: "סמנכ\"ל כספים", status: "pending", date: "2026-04-08" },
  { id: 6, doc: "תכנית בטיחות - TND-003", signer: "יוסי מזרחי", role: "מנהל בטיחות", status: "pending", date: "2026-04-09" },
  { id: 7, doc: "תעודות ISO - TND-003", signer: "עוזי אלמליח", role: "מנכ\"ל", status: "completed", date: "2026-04-03" },
  { id: 8, doc: "לוח זמנים - TND-003", signer: "רונן כהן", role: "מהנדס ראשי", status: "pending", date: "2026-04-09" },
];

export default function TenderDocumentsPage() {
  const { data: documents = FALLBACK_DOCUMENTS } = useQuery({
    queryKey: ["tenders-documents"],
    queryFn: async () => {
      const res = await authFetch("/api/tenders/tender-documents/documents");
      if (!res.ok) return FALLBACK_DOCUMENTS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_DOCUMENTS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: templates = FALLBACK_TEMPLATES } = useQuery({
    queryKey: ["tenders-templates"],
    queryFn: async () => {
      const res = await authFetch("/api/tenders/tender-documents/templates");
      if (!res.ok) return FALLBACK_TEMPLATES;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_TEMPLATES;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: complianceChecklist = FALLBACK_COMPLIANCE_CHECKLIST } = useQuery({
    queryKey: ["tenders-compliance-checklist"],
    queryFn: async () => {
      const res = await authFetch("/api/tenders/tender-documents/compliance-checklist");
      if (!res.ok) return FALLBACK_COMPLIANCE_CHECKLIST;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_COMPLIANCE_CHECKLIST;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: signatures = FALLBACK_SIGNATURES } = useQuery({
    queryKey: ["tenders-signatures"],
    queryFn: async () => {
      const res = await authFetch("/api/tenders/tender-documents/signatures");
      if (!res.ok) return FALLBACK_SIGNATURES;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_SIGNATURES;
    },
    staleTime: 30_000,
    retry: 1,
  });


  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("documents");

  const filtered = documents.filter(d =>
    d.name.includes(search) || d.tender.includes(search) || d.category.includes(search)
  );

  const kpis = {
    total: documents.length,
    templates: templates.length,
    thisMonth: documents.filter(d => d.updated >= "2026-04-01").length,
    pendingSig: signatures.filter(s => s.status === "pending").length,
    compliance: complianceChecklist.reduce((a, c) => a + c.completed, 0),
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileText className="h-7 w-7" /> ניהול מסמכי מכרזים
        </h1>
        <div className="flex gap-2">
          <Button variant="outline"><Upload className="h-4 w-4 ml-2" />העלאת מסמך</Button>
          <Button><Plus className="h-4 w-4 ml-2" />מסמך חדש</Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-5 gap-4">
        <Card className="border-blue-200">
          <CardContent className="pt-6 text-center">
            <FileText className="h-6 w-6 mx-auto text-blue-500 mb-1" />
            <p className="text-sm text-muted-foreground">סה"כ מסמכים</p>
            <p className="text-3xl font-bold text-blue-600">{kpis.total}</p>
          </CardContent>
        </Card>
        <Card className="border-purple-200">
          <CardContent className="pt-6 text-center">
            <Copy className="h-6 w-6 mx-auto text-purple-500 mb-1" />
            <p className="text-sm text-muted-foreground">תבניות</p>
            <p className="text-3xl font-bold text-purple-600">{kpis.templates}</p>
          </CardContent>
        </Card>
        <Card className="border-green-200">
          <CardContent className="pt-6 text-center">
            <CalendarDays className="h-6 w-6 mx-auto text-green-500 mb-1" />
            <p className="text-sm text-muted-foreground">מסמכים החודש</p>
            <p className="text-3xl font-bold text-green-600">{kpis.thisMonth}</p>
          </CardContent>
        </Card>
        <Card className="border-orange-200">
          <CardContent className="pt-6 text-center">
            <FileSignature className="h-6 w-6 mx-auto text-orange-500 mb-1" />
            <p className="text-sm text-muted-foreground">ממתינים לחתימה</p>
            <p className="text-3xl font-bold text-orange-600">{kpis.pendingSig}</p>
          </CardContent>
        </Card>
        <Card className="border-teal-200">
          <CardContent className="pt-6 text-center">
            <ShieldCheck className="h-6 w-6 mx-auto text-teal-500 mb-1" />
            <p className="text-sm text-muted-foreground">מסמכי תאימות</p>
            <p className="text-3xl font-bold text-teal-600">{kpis.compliance}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="documents">מסמכים</TabsTrigger>
          <TabsTrigger value="templates">תבניות</TabsTrigger>
          <TabsTrigger value="compliance">רשימת תאימות</TabsTrigger>
          <TabsTrigger value="signatures">חתימות דיגיטליות</TabsTrigger>
        </TabsList>

        {/* Tab 1: Documents */}
        <TabsContent value="documents" className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="חיפוש מסמך, מכרז, קטגוריה..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
            </div>
            <Button variant="outline" size="sm"><Download className="h-4 w-4 ml-1" />ייצוא</Button>
          </div>
          <div className="grid gap-3">
            {filtered.map(doc => (
              <Card key={doc.id} className="hover:shadow-md transition-shadow">
                <CardContent className="py-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                      <FileText className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-semibold">{doc.name}</p>
                      <p className="text-sm text-muted-foreground">{doc.tender} | {doc.category} | גרסה {doc.version}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">{doc.updated}</span>
                    <Badge className={statusStyle[doc.status].cls}>{statusStyle[doc.status].label}</Badge>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon"><Eye className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon"><Pen className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon"><Download className="h-4 w-4" /></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Tab 2: Templates */}
        <TabsContent value="templates" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">תבניות מסמכים</h2>
            <Button size="sm"><FilePlus className="h-4 w-4 ml-1" />תבנית חדשה</Button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {templates.map(t => (
              <Card key={t.id} className="hover:shadow-md transition-shadow">
                <CardContent className="py-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
                        <Copy className="h-5 w-5 text-purple-600" />
                      </div>
                      <div>
                        <p className="font-semibold">{t.name}</p>
                        <p className="text-sm text-muted-foreground">{t.category}</p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon"><Eye className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon"><Pen className="h-4 w-4" /></Button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-3 text-sm text-muted-foreground">
                    <span>שימושים: {t.uses}</span>
                    <span>שימוש אחרון: {t.lastUsed}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Tab 3: Compliance Checklist */}
        <TabsContent value="compliance" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">רשימת תאימות לפי סוג מכרז</h2>
            <div className="flex gap-3 text-sm">
              <span className="text-muted-foreground">סה"כ סוגים: <strong>{complianceChecklist.length}</strong></span>
              <span className="text-green-600">מלאים: <strong>{complianceChecklist.filter(c => c.completed === c.required.length).length}</strong></span>
              <span className="text-orange-600">חלקיים: <strong>{complianceChecklist.filter(c => c.completed < c.required.length).length}</strong></span>
            </div>
          </div>
          <div className="grid gap-4">
            {complianceChecklist.map((item, idx) => {
              const pct = Math.round((item.completed / item.required.length) * 100);
              return (
                <Card key={idx}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <ShieldCheck className="h-5 w-5 text-teal-500" />
                        {item.type}
                      </CardTitle>
                      <Badge className={pct === 100 ? "bg-green-500/20 text-green-600" : "bg-orange-500/20 text-orange-600"}>
                        {item.completed}/{item.required.length} הושלמו
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Progress value={pct} className="h-2" />
                    <div className="flex flex-wrap gap-2">
                      {item.required.map((req, ri) => (
                        <Badge key={ri} variant="outline" className={ri < item.completed ? "border-green-400 text-green-600" : "border-gray-300 text-gray-500"}>
                          {ri < item.completed ? <CheckCircle2 className="h-3 w-3 ml-1" /> : <Clock className="h-3 w-3 ml-1" />}
                          {req}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* Tab 4: Digital Signatures */}
        <TabsContent value="signatures" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">חתימות דיגיטליות</h2>
            <div className="flex gap-2">
              <Badge className="bg-orange-500/20 text-orange-600">{signatures.filter(s => s.status === "pending").length} ממתינים</Badge>
              <Badge className="bg-green-500/20 text-green-600">{signatures.filter(s => s.status === "completed").length} הושלמו</Badge>
            </div>
          </div>
          {/* Signature progress summary */}
          <div className="grid grid-cols-3 gap-4">
            <Card className="border-green-200">
              <CardContent className="pt-4 pb-3 text-center">
                <FileCheck className="h-5 w-5 mx-auto text-green-500 mb-1" />
                <p className="text-xs text-muted-foreground">חתימות שהושלמו</p>
                <p className="text-xl font-bold text-green-600">{signatures.filter(s => s.status === "completed").length}</p>
              </CardContent>
            </Card>
            <Card className="border-orange-200">
              <CardContent className="pt-4 pb-3 text-center">
                <Clock className="h-5 w-5 mx-auto text-orange-500 mb-1" />
                <p className="text-xs text-muted-foreground">ממתינים לחתימה</p>
                <p className="text-xl font-bold text-orange-600">{signatures.filter(s => s.status === "pending").length}</p>
              </CardContent>
            </Card>
            <Card className="border-blue-200">
              <CardContent className="pt-4 pb-3 text-center">
                <FileSignature className="h-5 w-5 mx-auto text-blue-500 mb-1" />
                <p className="text-xs text-muted-foreground">אחוז השלמה</p>
                <p className="text-xl font-bold text-blue-600">{Math.round((signatures.filter(s => s.status === "completed").length / signatures.length) * 100)}%</p>
              </CardContent>
            </Card>
          </div>
          <div className="grid gap-3">
            {signatures.map(sig => (
              <Card key={sig.id} className={`hover:shadow-md transition-shadow ${sig.status === "pending" ? "border-orange-200" : ""}`}>
                <CardContent className="py-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${sig.status === "completed" ? "bg-green-100" : "bg-orange-100"}`}>
                      <FileSignature className={`h-5 w-5 ${sig.status === "completed" ? "text-green-600" : "text-orange-600"}`} />
                    </div>
                    <div>
                      <p className="font-semibold">{sig.doc}</p>
                      <p className="text-sm text-muted-foreground">{sig.signer} - {sig.role}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">{sig.date}</span>
                    {sig.status === "completed" ? (
                      <Badge className="bg-green-500/20 text-green-600"><CheckCircle2 className="h-3 w-3 ml-1" />חתום</Badge>
                    ) : (
                      <Badge className="bg-orange-500/20 text-orange-600"><AlertTriangle className="h-3 w-3 ml-1" />ממתין</Badge>
                    )}
                    {sig.status === "pending" && (
                      <Button size="sm" variant="outline">שלח תזכורת</Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
