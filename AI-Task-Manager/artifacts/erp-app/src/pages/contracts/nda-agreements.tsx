import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ShieldCheck, FileText, Clock, AlertTriangle, CheckCircle2,
  Search, Plus, Download, Eye, Edit2, Trash2, Filter, Users
} from "lucide-react";

const FALLBACK_NDA_DATA = [
  { id: "NDA-001", party: "אלומיניום הצפון בע\"מ", contact: "דוד כהן", scope: "טכנולוגיית ייצור פרופילים", signed: "2025-09-15", expiry: "2027-09-15", duration: "24 חודשים", status: "חתום", confidentiality: "גבוהה" },
  { id: "NDA-002", party: "זכוכית ים תיכון", contact: "רונית לוי", scope: "שיטות חיתוך זכוכית מחוסמת", signed: "2026-01-10", expiry: "2028-01-10", duration: "24 חודשים", status: "חתום", confidentiality: "גבוהה" },
  { id: "NDA-003", party: "מתכות הדרום בע\"מ", contact: "אלי ברק", scope: "תהליכי ריתוך מתקדמים", signed: "2025-11-20", expiry: "2026-05-20", duration: "6 חודשים", status: "ממתין לחידוש", confidentiality: "בינונית" },
  { id: "NDA-004", party: "פלדת אביב תעשיות", contact: "מיכל אברהם", scope: "נתוני לקוחות ומחירים", signed: "2024-06-01", expiry: "2026-06-01", duration: "24 חודשים", status: "חתום", confidentiality: "גבוהה" },
  { id: "NDA-005", party: "גלאסטק ישראל", contact: "יוסי מזרחי", scope: "פיתוח זכוכית חכמה", signed: "", expiry: "", duration: "12 חודשים", status: "טיוטה", confidentiality: "גבוהה" },
  { id: "NDA-006", party: "אינסולייט מערכות", contact: "שרה דוידוב", scope: "שיתוף פעולה בבידוד תרמי", signed: "2025-03-10", expiry: "2026-03-10", duration: "12 חודשים", status: "פג תוקף", confidentiality: "בינונית" },
  { id: "NDA-007", party: "קונסטרקט מהנדסים", contact: "עמית גולן", scope: "תוכניות אדריכליות ומפרטים", signed: "2026-02-01", expiry: "2028-02-01", duration: "24 חודשים", status: "חתום", confidentiality: "גבוהה" },
  { id: "NDA-008", party: "טיטניום טכנולוגיות", contact: "נועה פרידמן", scope: "סגסוגות מתכת ייחודיות", signed: "", expiry: "", duration: "18 חודשים", status: "טיוטה", confidentiality: "גבוהה" },
  { id: "NDA-009", party: "חברת חשמל - מחלקת רכש", contact: "בני שטרן", scope: "הצעת מחיר לפרויקט תחנות", signed: "2025-07-22", expiry: "2026-07-22", duration: "12 חודשים", status: "ממתין לחידוש", confidentiality: "בינונית" },
  { id: "NDA-010", party: "ארקיטקט פלוס", contact: "דנה רוזן", scope: "עיצובי חזיתות אלומיניום", signed: "2026-03-05", expiry: "2027-03-05", duration: "12 חודשים", status: "חתום", confidentiality: "בינונית" },
];

const statusColors: Record<string, string> = {
  "חתום": "bg-green-500/20 text-green-300 border-green-500/30",
  "ממתין לחידוש": "bg-amber-500/20 text-amber-300 border-amber-500/30",
  "פג תוקף": "bg-red-500/20 text-red-300 border-red-500/30",
  "טיוטה": "bg-blue-500/20 text-blue-300 border-blue-500/30",
};

const confidentialityColors: Record<string, string> = {
  "גבוהה": "bg-red-500/20 text-red-300",
  "בינונית": "bg-yellow-500/20 text-yellow-300",
};

export default function NdaAgreements() {
  const { data: ndaagreementsData } = useQuery({
    queryKey: ["nda-agreements"],
    queryFn: () => authFetch("/api/contracts/nda_agreements"),
    staleTime: 5 * 60 * 1000,
  });

  const ndaData = ndaagreementsData ?? FALLBACK_NDA_DATA;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("all");

  const filtered = useMemo(() => {
    return ndaData.filter(r => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        return r.party.toLowerCase().includes(s) || r.scope.toLowerCase().includes(s) || r.id.toLowerCase().includes(s);
      }
      return true;
    });
  }, [search, statusFilter]);

  const kpis = useMemo(() => ({
    total: ndaData.length,
    signed: ndaData.filter(r => r.status === "חתום").length,
    pending: ndaData.filter(r => r.status === "ממתין לחידוש").length,
    expired: ndaData.filter(r => r.status === "פג תוקף").length,
    drafts: ndaData.filter(r => r.status === "טיוטה").length,
  }), []);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ShieldCheck className="h-7 w-7 text-blue-400" />
            הסכמי סודיות - NDA
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול הסכמי סודיות ואי-תחרות | טכנו-כל עוזי</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Download className="w-4 h-4 ml-1" />ייצוא</Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700"><Plus className="w-4 h-4 ml-1" />NDA חדש</Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">סה״כ הסכמים</p>
                <p className="text-2xl font-bold text-white">{kpis.total}</p>
              </div>
              <FileText className="h-8 w-8 text-slate-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-900/50 to-green-950 border-green-800/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-green-400">חתומים ופעילים</p>
                <p className="text-2xl font-bold text-green-300">{kpis.signed}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
            <Progress value={(kpis.signed / kpis.total) * 100} className="mt-2 h-1.5" />
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-900/50 to-amber-950 border-amber-800/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-amber-400">ממתין לחידוש</p>
                <p className="text-2xl font-bold text-amber-300">{kpis.pending}</p>
              </div>
              <Clock className="h-8 w-8 text-amber-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-red-900/50 to-red-950 border-red-800/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-red-400">פג תוקף</p>
                <p className="text-2xl font-bold text-red-300">{kpis.expired}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-900/50 to-blue-950 border-blue-800/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-blue-400">טיוטות</p>
                <p className="text-2xl font-bold text-blue-300">{kpis.drafts}</p>
              </div>
              <Edit2 className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs + Table */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <TabsList className="bg-background/50">
            <TabsTrigger value="all">הכל ({kpis.total})</TabsTrigger>
            <TabsTrigger value="active">חתומים ({kpis.signed})</TabsTrigger>
            <TabsTrigger value="pending">לחידוש ({kpis.pending})</TabsTrigger>
            <TabsTrigger value="draft">טיוטות ({kpis.drafts})</TabsTrigger>
          </TabsList>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input placeholder="חיפוש לפי צד / נושא..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 w-64 bg-background/50" />
            </div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
              <option value="all">כל הסטטוסים</option>
              <option value="חתום">חתום</option>
              <option value="ממתין לחידוש">ממתין לחידוש</option>
              <option value="פג תוקף">פג תוקף</option>
              <option value="טיוטה">טיוטה</option>
            </select>
          </div>
        </div>

        <TabsContent value={activeTab} className="mt-4">
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 bg-muted/30">
                      <th className="text-right p-3 text-muted-foreground font-medium">מס׳</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">צד להסכם</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">איש קשר</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">נושא / היקף</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">תאריך חתימה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">תוקף עד</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">משך</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סיווג</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סטטוס</th>
                      <th className="text-center p-3 text-muted-foreground font-medium w-28">פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered
                      .filter(r => {
                        if (activeTab === "active") return r.status === "חתום";
                        if (activeTab === "pending") return r.status === "ממתין לחידוש";
                        if (activeTab === "draft") return r.status === "טיוטה";
                        return true;
                      })
                      .map((row) => (
                      <tr key={row.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                        <td className="p-3 text-foreground font-mono text-xs">{row.id}</td>
                        <td className="p-3 text-foreground font-medium">{row.party}</td>
                        <td className="p-3 text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Users className="w-3.5 h-3.5" />
                            {row.contact}
                          </div>
                        </td>
                        <td className="p-3 text-foreground max-w-[200px] truncate">{row.scope}</td>
                        <td className="p-3 text-muted-foreground">{row.signed || "—"}</td>
                        <td className="p-3 text-muted-foreground">{row.expiry || "—"}</td>
                        <td className="p-3 text-muted-foreground">{row.duration}</td>
                        <td className="p-3">
                          <Badge className={confidentialityColors[row.confidentiality] || ""}>{row.confidentiality}</Badge>
                        </td>
                        <td className="p-3">
                          <Badge className={statusColors[row.status] || "bg-gray-500/20 text-gray-300"}>{row.status}</Badge>
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button variant="ghost" size="sm" title="צפייה"><Eye className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="sm" title="עריכה"><Edit2 className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="sm" title="מחיקה" className="text-red-400 hover:text-red-300"><Trash2 className="w-3.5 h-3.5" /></Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Alerts Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-amber-950/30 border-amber-800/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-amber-300 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              הסכמים לחידוש בקרוב
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {ndaData.filter(r => r.status === "ממתין לחידוש").map(r => (
              <div key={r.id} className="flex items-center justify-between p-2 rounded bg-amber-900/20">
                <div>
                  <p className="text-sm font-medium text-foreground">{r.party}</p>
                  <p className="text-xs text-muted-foreground">{r.scope}</p>
                </div>
                <Button size="sm" variant="outline" className="text-amber-300 border-amber-600">חדש הסכם</Button>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="bg-red-950/30 border-red-800/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-red-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              הסכמים שפג תוקפם
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {ndaData.filter(r => r.status === "פג תוקף").map(r => (
              <div key={r.id} className="flex items-center justify-between p-2 rounded bg-red-900/20">
                <div>
                  <p className="text-sm font-medium text-foreground">{r.party}</p>
                  <p className="text-xs text-muted-foreground">פג ב: {r.expiry}</p>
                </div>
                <Button size="sm" variant="outline" className="text-red-300 border-red-600">טפל עכשיו</Button>
              </div>
            ))}
            {ndaData.filter(r => r.status === "פג תוקף").length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">אין הסכמים שפג תוקפם</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
