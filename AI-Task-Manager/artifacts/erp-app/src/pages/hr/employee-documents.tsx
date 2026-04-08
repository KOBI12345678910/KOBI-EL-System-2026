import { useState } from "react";
import {
  FileText, AlertTriangle, CheckCircle, Clock,
  Search, User, Shield, ChevronLeft, FileWarning, Award
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Link } from "wouter";

const STATUS_CFG: Record<string, { label: string; color: string }> = {
  valid: { label: "תקין", color: "bg-green-100 text-green-700" },
  missing: { label: "חסר", color: "bg-red-100 text-red-700" },
  expired: { label: "פג תוקף", color: "bg-orange-100 text-orange-700" },
  pending: { label: "ממתין לחתימה", color: "bg-yellow-100 text-yellow-700" },
};

const REQUIRED_DOCS = [
  "חוזה עבודה", "צילום ת.ז.", "טופס 101", "אישור בריאות",
  "הצהרת סודיות", "אישור משטרה", "תעודות השכלה", "הסמכות מקצועיות",
];

const checklists = [
  { name: "יוסי כהן", dept: "ייצור", has: [1,1,1,1,1,1,1,1] },
  { name: "רונית לוי", dept: "הנדסה", has: [1,1,1,0,1,1,1,0] },
  { name: "אבי מזרחי", dept: "אחזקה", has: [1,1,0,1,1,0,1,1] },
  { name: "דנה שמש", dept: "בקרת איכות", has: [1,1,1,1,1,1,0,1] },
  { name: "מוחמד חאלד", dept: "לוגיסטיקה", has: [1,1,1,1,0,1,1,1] },
];

interface Doc { id: number; name: string; dept: string; type: string; uploaded: string; expiry: string | null; status: string; }

const docs: Doc[] = [
  { id: 1, name: "יוסי כהן", dept: "ייצור", type: "חוזה עבודה", uploaded: "2025-01-15", expiry: null, status: "valid" },
  { id: 2, name: "רונית לוי", dept: "הנדסה", type: "אישור בריאות", uploaded: "", expiry: "2026-02-28", status: "missing" },
  { id: 3, name: "אבי מזרחי", dept: "אחזקה", type: "טופס 101", uploaded: "", expiry: null, status: "missing" },
  { id: 4, name: "דנה שמש", dept: "בקרת איכות", type: "הצהרת סודיות", uploaded: "2024-06-10", expiry: null, status: "valid" },
  { id: 5, name: "מוחמד חאלד", dept: "לוגיסטיקה", type: "הצהרת סודיות", uploaded: "", expiry: null, status: "missing" },
  { id: 6, name: "שירה ביטון", dept: "כספים", type: "אישור משטרה", uploaded: "2024-11-20", expiry: "2025-11-20", status: "expired" },
  { id: 7, name: "עומר פרץ", dept: "ייצור", type: "הסמכות מקצועיות", uploaded: "2025-03-01", expiry: "2026-03-01", status: "pending" },
  { id: 8, name: "נועה אשכנזי", dept: "IT", type: "חוזה עבודה", uploaded: "2025-08-12", expiry: null, status: "pending" },
  { id: 9, name: "איתי גולדשטיין", dept: "מכירות", type: "אישור בריאות", uploaded: "2024-09-05", expiry: "2025-09-05", status: "expired" },
  { id: 10, name: "מיכל דוד", dept: "משאבי אנוש", type: "צילום ת.ז.", uploaded: "2025-04-22", expiry: null, status: "valid" },
  { id: 11, name: "אלון ברק", dept: "ייצור", type: "אישור בריאות", uploaded: "2024-12-10", expiry: "2025-12-10", status: "expired" },
  { id: 12, name: "רונית לוי", dept: "הנדסה", type: "הסמכות מקצועיות", uploaded: "", expiry: null, status: "missing" },
  { id: 13, name: "אבי מזרחי", dept: "אחזקה", type: "אישור משטרה", uploaded: "", expiry: null, status: "missing" },
  { id: 14, name: "טל רוזנברג", dept: "הנדסה", type: "חוזה עבודה", uploaded: "2025-07-01", expiry: null, status: "pending" },
  { id: 15, name: "שירה ביטון", dept: "כספים", type: "אישור בריאות", uploaded: "2024-05-15", expiry: "2025-05-15", status: "expired" },
];

const missingGroups = [
  { name: "רונית לוי", dept: "הנדסה", missing: ["אישור בריאות", "הסמכות מקצועיות"] },
  { name: "אבי מזרחי", dept: "אחזקה", missing: ["טופס 101", "אישור משטרה"] },
  { name: "מוחמד חאלד", dept: "לוגיסטיקה", missing: ["הצהרת סודיות"] },
  { name: "דנה שמש", dept: "בקרת איכות", missing: ["תעודות השכלה"] },
  { name: "שירה ביטון", dept: "כספים", missing: ["אישור משטרה", "טופס 101"] },
  { name: "איתי גולדשטיין", dept: "מכירות", missing: ["הצהרת סודיות", "אישור משטרה"] },
  { name: "נועה אשכנזי", dept: "IT", missing: ["טופס 101"] },
  { name: "טל רוזנברג", dept: "הנדסה", missing: ["אישור בריאות"] },
];

function DocBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <Badge className={ok ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
      {ok ? <CheckCircle className="w-3 h-3 ml-1" /> : <AlertTriangle className="w-3 h-3 ml-1" />}
      {label}
    </Badge>
  );
}

export default function EmployeeDocumentsPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const [search, setSearch] = useState("");

  const kpis = [
    { label: 'סה"כ מסמכים', value: 450, color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/30", icon: FileText },
    { label: "חסרים", value: 12, color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30", icon: AlertTriangle },
    { label: "פגי תוקף", value: 5, color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30", icon: FileWarning },
    { label: "ממתינים לחתימה", value: 8, color: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/30", icon: Clock },
  ];

  const q = search.toLowerCase();
  const filtered = docs.filter(d => !search || d.name.includes(q) || d.type.includes(q) || d.dept.includes(q));
  const expired = docs.filter(d => d.status === "expired");
  const missing = docs.filter(d => d.status === "missing");

  const SearchInput = ({ placeholder }: { placeholder: string }) => (
    <div className="relative max-w-md">
      <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder={placeholder}
        className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
    </div>
  );

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Link href="/hr" className="flex items-center gap-1 hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" />
          משאבי אנוש
        </Link>
        <span>/</span>
        <span className="text-foreground">מסמכי עובדים</span>
      </div>

      <div>
        <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-3">
          <FileText className="w-7 h-7 text-blue-400" />
          מסמכי עובדים
        </h1>
        <p className="text-muted-foreground mt-1">ניהול ומעקב מסמכי עובדים - טכנו-כל עוזי</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => (
          <div key={i} className={`${kpi.bg} border ${kpi.border} rounded-2xl p-4 text-right`}>
            <div className="flex items-center justify-between">
              <kpi.icon className={`w-5 h-5 ${kpi.color}`} />
              <div className={`text-3xl font-bold ${kpi.color}`}>{kpi.value}</div>
            </div>
            <div className="text-sm text-muted-foreground mt-1">{kpi.label}</div>
          </div>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">סקירה</TabsTrigger>
          <TabsTrigger value="missing">חסרים</TabsTrigger>
          <TabsTrigger value="expired">פגי תוקף</TabsTrigger>
          <TabsTrigger value="by-employee">לפי עובד</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-4">
          <SearchInput placeholder="חיפוש לפי עובד, סוג מסמך, מחלקה..." />
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                טבלת מסמכים
                <Badge className="bg-primary/20 text-primary text-[10px]">{filtered.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>שם עובד</TableHead>
                    <TableHead>מחלקה</TableHead>
                    <TableHead>סוג מסמך</TableHead>
                    <TableHead>תאריך העלאה</TableHead>
                    <TableHead>תוקף</TableHead>
                    <TableHead>סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(d => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">{d.name}</TableCell>
                      <TableCell>{d.dept}</TableCell>
                      <TableCell>{d.type}</TableCell>
                      <TableCell>{d.uploaded || "---"}</TableCell>
                      <TableCell>{d.expiry || "ללא תוקף"}</TableCell>
                      <TableCell><Badge className={STATUS_CFG[d.status].color}>{STATUS_CFG[d.status].label}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" />
                רשימת מסמכים נדרשים לפי עובד
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {checklists.map((emp, idx) => {
                const completed = emp.has.filter(Boolean).length;
                const pct = Math.round((completed / REQUIRED_DOCS.length) * 100);
                return (
                  <div key={idx} className="border border-border rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium text-sm">{emp.name}</span>
                        <Badge className="bg-muted/50 text-muted-foreground text-[10px]">{emp.dept}</Badge>
                      </div>
                      <span className={`text-sm font-bold ${pct === 100 ? "text-green-500" : pct >= 75 ? "text-yellow-500" : "text-red-500"}`}>{pct}%</span>
                    </div>
                    <Progress value={pct} className="h-2 mb-3" />
                    <div className="flex flex-wrap gap-2">
                      {REQUIRED_DOCS.map((doc, i) => <DocBadge key={doc} ok={!!emp.has[i]} label={doc} />)}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="missing" className="space-y-6 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                מסמכים חסרים לפי עובד
                <Badge className="bg-red-500/20 text-red-400 text-[10px]">12 מסמכים</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {missingGroups.map((g, i) => (
                <div key={i} className="border border-red-500/20 bg-red-500/5 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <User className="w-4 h-4 text-red-400" />
                    <span className="font-medium text-sm">{g.name}</span>
                    <Badge className="bg-muted/50 text-muted-foreground text-[10px]">{g.dept}</Badge>
                    <Badge className="bg-red-100 text-red-700 text-[10px]">{g.missing.length} חסרים</Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {g.missing.map(d => (
                      <Badge key={d} className="bg-red-100 text-red-700"><FileWarning className="w-3 h-3 ml-1" />{d}</Badge>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <FileText className="w-4 h-4 text-red-400" />
                רשימת מסמכים חסרים
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>שם עובד</TableHead>
                    <TableHead>מחלקה</TableHead>
                    <TableHead>סוג מסמך</TableHead>
                    <TableHead>סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {missing.map(d => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">{d.name}</TableCell>
                      <TableCell>{d.dept}</TableCell>
                      <TableCell>{d.type}</TableCell>
                      <TableCell><Badge className="bg-red-100 text-red-700">חסר</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expired" className="space-y-6 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <FileWarning className="w-4 h-4 text-orange-400" />
                מסמכים שפג תוקפם
                <Badge className="bg-orange-500/20 text-orange-400 text-[10px]">{expired.length} מסמכים</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>שם עובד</TableHead>
                    <TableHead>מחלקה</TableHead>
                    <TableHead>סוג מסמך</TableHead>
                    <TableHead>תאריך העלאה</TableHead>
                    <TableHead>תוקף שפג</TableHead>
                    <TableHead>סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expired.map(d => (
                    <TableRow key={d.id} className="bg-orange-500/5">
                      <TableCell className="font-medium">{d.name}</TableCell>
                      <TableCell>{d.dept}</TableCell>
                      <TableCell>{d.type}</TableCell>
                      <TableCell>{d.uploaded || "---"}</TableCell>
                      <TableCell className="text-orange-400 font-medium">{d.expiry}</TableCell>
                      <TableCell><Badge className="bg-orange-100 text-orange-700">פג תוקף</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="by-employee" className="space-y-6 mt-4">
          <SearchInput placeholder="חיפוש עובד..." />
          {checklists.filter(e => !search || e.name.includes(q) || e.dept.includes(q)).map((emp, idx) => {
            const completed = emp.has.filter(Boolean).length;
            const pct = Math.round((completed / REQUIRED_DOCS.length) * 100);
            const empDocs = docs.filter(d => d.name === emp.name);
            return (
              <Card key={idx}>
                <CardHeader>
                  <CardTitle className="text-sm font-semibold flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-primary" />
                      {emp.name}
                      <Badge className="bg-muted/50 text-muted-foreground text-[10px]">{emp.dept}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold ${pct === 100 ? "text-green-500" : "text-red-500"}`}>{completed}/{REQUIRED_DOCS.length} מסמכים</span>
                      <Award className={`w-4 h-4 ${pct === 100 ? "text-green-500" : "text-muted-foreground"}`} />
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Progress value={pct} className="h-2" />
                  <div className="flex flex-wrap gap-2">
                    {REQUIRED_DOCS.map((doc, i) => <DocBadge key={doc} ok={!!emp.has[i]} label={doc} />)}
                  </div>
                  {empDocs.length > 0 && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>סוג מסמך</TableHead>
                          <TableHead>תאריך העלאה</TableHead>
                          <TableHead>תוקף</TableHead>
                          <TableHead>סטטוס</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {empDocs.map(d => (
                          <TableRow key={d.id}>
                            <TableCell>{d.type}</TableCell>
                            <TableCell>{d.uploaded || "---"}</TableCell>
                            <TableCell>{d.expiry || "ללא תוקף"}</TableCell>
                            <TableCell><Badge className={STATUS_CFG[d.status].color}>{STATUS_CFG[d.status].label}</Badge></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>
      </Tabs>
    </div>
  );
}
