import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  User, Building2, Phone, Mail, Globe, MapPin, DollarSign,
  FileText, ShoppingCart, Briefcase, Clock, TrendingUp, Star,
  MessageSquare, Paperclip, Activity, Target, Calendar, CreditCard,
  CheckCircle, AlertTriangle, ChevronRight, Edit2, Plus
} from "lucide-react";
import { authFetch } from "@/lib/utils";

// ============================================================
// CUSTOMER DATA (360 view)
// ============================================================
const FALLBACK_CUSTOMER = {
  id: 1,
  name: "חברת אלומיניום ישראל בע\"מ",
  number: "CUS-00042",
  type: "enterprise",
  industry: "בנייה ותשתיות",
  status: "active",
  segment: "VIP",
  since: "2022-03-15",
  creditLimit: 500000,
  paymentTerms: "שוטף + 60",
  contact: { name: "אבי כהן", title: "מנהל רכש", phone: "054-1234567", email: "avi@alumisrael.co.il" },
  address: "רח' התעשייה 12, חולון",
  owner: "דני כהן",
  nps: 82,
  healthScore: 78,
  ltv: 2850000,
  churnRisk: "low",
};

const FALLBACK_FINANCIAL_SUMMARY = {
  totalRevenue: 2850000,
  revenueYTD: 485000,
  openInvoices: 245000,
  overdue: 128000,
  avgPaymentDays: 52,
  creditUsed: 245000,
  creditAvailable: 255000,
  profitability: 21.3,
};

const FALLBACK_DOCUMENTS = [
  { type: "חשבונית", number: "INV-000234", date: "2026-04-08", amount: 45000, status: "open" },
  { type: "הצעת מחיר", number: "QUO-000089", date: "2026-04-05", amount: 120000, status: "sent" },
  { type: "חשבונית", number: "INV-000228", date: "2026-03-25", amount: 72000, status: "paid" },
  { type: "קבלה", number: "RCP-000156", date: "2026-03-20", amount: 72000, status: "completed" },
  { type: "הזמנה", number: "SO-002456", date: "2026-04-08", amount: 145000, status: "confirmed" },
];

const FALLBACK_OPPORTUNITIES = [
  { name: "פרויקט מגדל A - שלב ב'", value: 850000, stage: "משא ומתן", probability: 65, close: "2026-05-15" },
  { name: "חיפוי מגורים רמת גן", value: 620000, stage: "הצעת מחיר", probability: 40, close: "2026-06-01" },
];

const FALLBACK_ACTIVITIES = [
  { date: "2026-04-08 10:30", type: "שיחה", subject: "מעקב על הצעה QUO-089", by: "דני כהן", note: "מחכים לאישור תקציבי - מעדכן בשבוע הבא" },
  { date: "2026-04-05 14:00", type: "מייל", subject: "שליחת הצעת מחיר מעודכנת", by: "מיכל לוי", note: "הצעה עם 5% הנחה לפרויקט מגדל" },
  { date: "2026-04-02 09:00", type: "פגישה", subject: "סיור באתר מגדל A", by: "דני כהן", note: "נדרשים מדידות נוספות - מהנדס מגיע 10.04" },
  { date: "2026-03-28 11:00", type: "שיחה", subject: "בירור על חשבונית INV-228", by: "שרה כהן (גבייה)", note: "הבטיח לשלם עד 01.04 - בוצע" },
  { date: "2026-03-20 16:00", type: "משימה", subject: "שליחת קטלוג פרופילים חדש", by: "יוסי אברהם", note: "נשלח PDF בדוא\"ל" },
];

const FALLBACK_PROJECTS = [
  { name: "בניין משרדים חולון", status: "active", value: 320000, completion: 75 },
  { name: "מפעל אור יהודה - שלב א'", status: "completed", value: 280000, completion: 100 },
];

const FALLBACK_CONTACTS = [
  { name: "אבי כהן", title: "מנהל רכש", phone: "054-1234567", email: "avi@alumisrael.co.il", isPrimary: true },
  { name: "שרון לוי", title: "מנהל פרויקטים", phone: "052-9876543", email: "sharon@alumisrael.co.il", isPrimary: false },
  { name: "דנה גולד", title: "CFO", phone: "050-5551234", email: "dana@alumisrael.co.il", isPrimary: false },
];

const FALLBACK_SERVICE_CASES = [
  { id: "TK-0038", subject: "החלפת חלון סדוק", status: "resolved", priority: "medium", created: "2026-03-15" },
  { id: "TK-0029", subject: "בעיה בנעילת דלת", status: "resolved", priority: "low", created: "2026-02-20" },
];

const fmt = (v: number) => v >= 1000000 ? `₪${(v / 1000000).toFixed(1)}M` : `₪${v.toLocaleString("he-IL")}`;

const FALLBACK_360 = {
  customer: FALLBACK_CUSTOMER,
  financialSummary: FALLBACK_FINANCIAL_SUMMARY,
  recentDocuments: FALLBACK_DOCUMENTS,
  opportunities: FALLBACK_OPPORTUNITIES,
  activities: FALLBACK_ACTIVITIES,
  projects: FALLBACK_PROJECTS,
  contacts: FALLBACK_CONTACTS,
  serviceCases: FALLBACK_SERVICE_CASES,
};

export default function Customer360() {
  const { data: apiData } = useQuery<typeof FALLBACK_360>({
    queryKey: ["crm-customer-360"],
    queryFn: async () => { const res = await authFetch("/api/crm/customers/360"); if (!res.ok) throw new Error("API error"); return res.json(); },
  });
  const d = apiData ?? FALLBACK_360;
  const customer = d.customer;
  const financialSummary = d.financialSummary;
  const recentDocuments = d.recentDocuments;
  const opportunities = d.opportunities;
  const activities = d.activities;
  const projects = d.projects;
  const contacts = d.contacts;
  const serviceCases = d.serviceCases;

  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* Header - Customer Profile */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-start gap-5">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="bg-primary text-primary-foreground text-xl font-bold">אי</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold">{customer.name}</h1>
                <Badge variant="outline" className="font-mono">{customer.number}</Badge>
                <Badge className="bg-emerald-100 text-emerald-700">{customer.status === "active" ? "פעיל" : "לא פעיל"}</Badge>
                <Badge className="bg-amber-100 text-amber-700">{customer.segment}</Badge>
                <Button variant="outline" size="sm" className="mr-auto"><Edit2 className="h-3 w-3 ml-1" /> ערוך</Button>
              </div>
              <div className="flex items-center gap-6 mt-2 text-sm text-muted-foreground">
                <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{customer.industry}</span>
                <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{customer.address}</span>
                <span className="flex items-center gap-1"><User className="h-3.5 w-3.5" />{customer.owner}</span>
                <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />לקוח מ-{customer.since}</span>
              </div>
              <div className="flex items-center gap-3 mt-2">
                <span className="flex items-center gap-1 text-sm"><Phone className="h-3.5 w-3.5" />{customer.contact.phone}</span>
                <span className="flex items-center gap-1 text-sm"><Mail className="h-3.5 w-3.5" />{customer.contact.email}</span>
              </div>
            </div>

            {/* Health Score */}
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-[10px] text-muted-foreground">Health Score</p>
                <p className={`text-2xl font-bold ${customer.healthScore >= 70 ? "text-emerald-600" : "text-amber-600"}`}>{customer.healthScore}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">NPS</p>
                <p className="text-2xl font-bold text-blue-600">{customer.nps}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">LTV</p>
                <p className="text-2xl font-bold font-mono">{fmt(customer.ltv)}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Financial Summary Strip */}
      <div className="grid grid-cols-6 gap-3">
        {[
          { label: "הכנסות כוללות", value: fmt(financialSummary.totalRevenue), color: "text-blue-600" },
          { label: "הכנסות YTD", value: fmt(financialSummary.revenueYTD), color: "text-emerald-600" },
          { label: "חשבוניות פתוחות", value: fmt(financialSummary.openInvoices), color: "text-amber-600" },
          { label: "באיחור", value: fmt(financialSummary.overdue), color: "text-red-600" },
          { label: "ימי תשלום ממוצע", value: `${financialSummary.avgPaymentDays}`, color: "text-purple-600" },
          { label: "רווחיות", value: `${financialSummary.profitability}%`, color: "text-teal-600" },
        ].map((item, i) => (
          <Card key={i}>
            <CardContent className="pt-3 pb-2 text-center">
              <p className="text-[10px] text-muted-foreground">{item.label}</p>
              <p className={`text-lg font-bold font-mono ${item.color}`}>{item.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="activities">
        <TabsList className="flex flex-wrap gap-1">
          <TabsTrigger value="activities" className="text-xs gap-1"><Activity className="h-3 w-3" /> פעילויות</TabsTrigger>
          <TabsTrigger value="opportunities" className="text-xs gap-1"><Target className="h-3 w-3" /> הזדמנויות</TabsTrigger>
          <TabsTrigger value="documents" className="text-xs gap-1"><FileText className="h-3 w-3" /> מסמכים</TabsTrigger>
          <TabsTrigger value="projects" className="text-xs gap-1"><Briefcase className="h-3 w-3" /> פרויקטים</TabsTrigger>
          <TabsTrigger value="contacts" className="text-xs gap-1"><User className="h-3 w-3" /> אנשי קשר</TabsTrigger>
          <TabsTrigger value="finance" className="text-xs gap-1"><DollarSign className="h-3 w-3" /> פיננסי</TabsTrigger>
          <TabsTrigger value="service" className="text-xs gap-1"><MessageSquare className="h-3 w-3" /> שירות</TabsTrigger>
        </TabsList>

        {/* Activities Timeline */}
        <TabsContent value="activities">
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">היסטוריית פעילויות</CardTitle>
              <Button size="sm"><Plus className="h-3.5 w-3.5 ml-1" /> פעילות חדשה</Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {activities.map((a, i) => (
                  <div key={i} className="flex gap-4 border-r-2 border-primary/20 pr-4 relative">
                    <div className="absolute -right-[5px] top-1 h-2 w-2 rounded-full bg-primary" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[9px]">{a.type}</Badge>
                        <span className="text-xs font-medium">{a.subject}</span>
                        <span className="text-[10px] text-muted-foreground mr-auto">{a.date}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{a.note}</p>
                      <p className="text-[10px] text-primary mt-0.5">{a.by}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Opportunities */}
        <TabsContent value="opportunities">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="text-right text-xs">הזדמנות</TableHead>
                    <TableHead className="text-right text-xs">ערך</TableHead>
                    <TableHead className="text-right text-xs">שלב</TableHead>
                    <TableHead className="text-right text-xs">סיכוי</TableHead>
                    <TableHead className="text-right text-xs">סגירה צפויה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {opportunities.map((o, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium text-xs">{o.name}</TableCell>
                      <TableCell className="font-mono text-xs font-bold">{fmt(o.value)}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[9px]">{o.stage}</Badge></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Progress value={o.probability} className="h-1.5 w-12" />
                          <span className="text-[10px] font-mono">{o.probability}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-[10px]">{o.close}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Documents */}
        <TabsContent value="documents">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="text-right text-xs">סוג</TableHead>
                    <TableHead className="text-right text-xs">מספר</TableHead>
                    <TableHead className="text-right text-xs">תאריך</TableHead>
                    <TableHead className="text-right text-xs">סכום</TableHead>
                    <TableHead className="text-right text-xs">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentDocuments.map((d, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs">{d.type}</TableCell>
                      <TableCell className="font-mono text-[10px]">{d.number}</TableCell>
                      <TableCell className="text-[10px]">{d.date}</TableCell>
                      <TableCell className="font-mono text-xs font-bold">{fmt(d.amount)}</TableCell>
                      <TableCell>
                        <Badge className={`text-[9px] ${d.status === "paid" || d.status === "completed" ? "bg-emerald-100 text-emerald-700" : d.status === "open" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}>
                          {d.status === "paid" ? "שולם" : d.status === "completed" ? "הושלם" : d.status === "open" ? "פתוח" : d.status === "sent" ? "נשלח" : "אושר"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Projects */}
        <TabsContent value="projects">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="text-right text-xs">פרויקט</TableHead>
                    <TableHead className="text-right text-xs">סכום</TableHead>
                    <TableHead className="text-right text-xs">התקדמות</TableHead>
                    <TableHead className="text-right text-xs">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projects.map((p, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium text-xs">{p.name}</TableCell>
                      <TableCell className="font-mono text-xs font-bold">{fmt(p.value)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={p.completion} className="h-2 w-20" />
                          <span className="text-[10px] font-mono">{p.completion}%</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[9px] ${p.status === "completed" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>
                          {p.status === "completed" ? "הושלם" : "פעיל"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Contacts */}
        <TabsContent value="contacts">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="text-right text-xs">שם</TableHead>
                    <TableHead className="text-right text-xs">תפקיד</TableHead>
                    <TableHead className="text-right text-xs">טלפון</TableHead>
                    <TableHead className="text-right text-xs">מייל</TableHead>
                    <TableHead className="text-right text-xs">ראשי</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contacts.map((c, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium text-xs">{c.name}</TableCell>
                      <TableCell className="text-xs">{c.title}</TableCell>
                      <TableCell className="font-mono text-[10px]">{c.phone}</TableCell>
                      <TableCell className="text-[10px]">{c.email}</TableCell>
                      <TableCell>{c.isPrimary && <Star className="h-3.5 w-3.5 text-amber-500" />}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Finance */}
        <TabsContent value="finance">
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">אשראי</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-xs"><span>מסגרת אשראי</span><span className="font-mono font-bold">{fmt(customer.creditLimit)}</span></div>
                <div className="flex justify-between text-xs"><span>בשימוש</span><span className="font-mono">{fmt(financialSummary.creditUsed)}</span></div>
                <div className="flex justify-between text-xs"><span>זמין</span><span className="font-mono text-emerald-600">{fmt(financialSummary.creditAvailable)}</span></div>
                <Progress value={(financialSummary.creditUsed / customer.creditLimit) * 100} className="h-2" />
                <div className="flex justify-between text-xs"><span>תנאי תשלום</span><span>{customer.paymentTerms}</span></div>
                <div className="flex justify-between text-xs"><span>ימי תשלום ממוצעים</span><span className="font-mono">{financialSummary.avgPaymentDays}</span></div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">רווחיות</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-xs"><span>הכנסות כוללות</span><span className="font-mono font-bold">{fmt(financialSummary.totalRevenue)}</span></div>
                <div className="flex justify-between text-xs"><span>רווחיות</span><span className="font-mono text-emerald-600">{financialSummary.profitability}%</span></div>
                <div className="flex justify-between text-xs"><span>LTV</span><span className="font-mono font-bold">{fmt(customer.ltv)}</span></div>
                <div className="flex justify-between text-xs"><span>סיכון נטישה</span>
                  <Badge className={customer.churnRisk === "low" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}>
                    {customer.churnRisk === "low" ? "נמוך" : "גבוה"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Service */}
        <TabsContent value="service">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="text-right text-xs">מספר</TableHead>
                    <TableHead className="text-right text-xs">נושא</TableHead>
                    <TableHead className="text-right text-xs">עדיפות</TableHead>
                    <TableHead className="text-right text-xs">נפתח</TableHead>
                    <TableHead className="text-right text-xs">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {serviceCases.map((c, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-[10px]">{c.id}</TableCell>
                      <TableCell className="text-xs">{c.subject}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[9px]">{c.priority}</Badge></TableCell>
                      <TableCell className="text-[10px]">{c.created}</TableCell>
                      <TableCell><Badge className="bg-emerald-100 text-emerald-700 text-[9px]">נפתר</Badge></TableCell>
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
