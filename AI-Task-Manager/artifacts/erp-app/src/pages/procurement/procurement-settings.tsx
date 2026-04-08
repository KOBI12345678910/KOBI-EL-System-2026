import { useState } from "react";
import {
  Settings, ShieldCheck, Tags, Layers, AlertTriangle,
  GitBranch, CheckCircle2, XCircle, Clock, TrendingUp
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const approvalRules = [
  { name: "אישור רכש רגיל", threshold: 5000, role: "מנהל רכש", level: 1, active: true },
  { name: "אישור רכש גבוה", threshold: 25000, role: "סמנכ\"ל תפעול", level: 2, active: true },
  { name: "אישור הזמנה חריגה", threshold: 50000, role: "מנכ\"ל", level: 3, active: true },
  { name: "רכש חומרי גלם קריטי", threshold: 100000, role: "דירקטוריון", level: 4, active: true },
  { name: "רכש ציוד קבוע", threshold: 75000, role: "סמנכ\"ל כספים", level: 3, active: false },
];

const supplierCategories = [
  { name: "ספקי מתכת", description: "פלדה, ברזל, נירוסטה וסגסוגות", count: 18, terms: "שוטף + 60" },
  { name: "ספקי אלומיניום", description: "פרופילי אלומיניום ולוחות", count: 12, terms: "שוטף + 45" },
  { name: "ספקי זכוכית", description: "זכוכית שטוחה, מחוסמת וכפולה", count: 8, terms: "שוטף + 30" },
  { name: "ספקי אביזרים", description: "ברגים, צירים, ידיות ואטמים", count: 24, terms: "שוטף + 30" },
  { name: "ספקי שירותים", description: "הובלה, התקנה ותחזוקה", count: 6, terms: "שוטף + 15" },
];

const itemCategories = [
  { name: "פרופילי אלומיניום", parent: "חומרי גלם", count: 145, supplier: "אלו-גל בע\"מ" },
  { name: "לוחות זכוכית", parent: "חומרי גלם", count: 62, supplier: "זכוכית ירושלים" },
  { name: "פלדת קונסטרוקציה", parent: "חומרי גלם", count: 38, supplier: "ברזל הצפון" },
  { name: "אביזרי נעילה", parent: "אביזרים", count: 210, supplier: "רב-בריח" },
  { name: "חומרי איטום", parent: "חומרים מתכלים", count: 85, supplier: "סיקה ישראל" },
  { name: "ברגים וחיבורים", parent: "אביזרים", count: 320, supplier: "בורג-אל בע\"מ" },
];

const priceThresholds = [
  { item: "פרופיל אלומיניום T5", min: 28, max: 42, deviation: 15, action: "התראה למנהל" },
  { item: "זכוכית מחוסמת 10 מ\"מ", min: 180, max: 260, deviation: 12, action: "עצירת הזמנה" },
  { item: "פלדה ST-37", min: 4200, max: 5800, deviation: 10, action: "בקשת הצעות חדשה" },
  { item: "קטגוריה: אביזרי נעילה", min: 0, max: 0, deviation: 20, action: "התראה בלבד" },
  { item: "סיליקון מבני 600 מ\"ל", min: 22, max: 38, deviation: 18, action: "התראה למנהל" },
];

const riskRules = [
  { rule: "ספק יחיד קריטי", trigger: "פריט עם ספק יחיד ומחזור > ₪50,000", severity: "גבוה", action: "דרישת ספק חלופי" },
  { rule: "חריגת מחיר", trigger: "עליית מחיר > 15% ברבעון", severity: "בינוני", action: "התראה אוטומטית" },
  { rule: "איחור אספקה חוזר", trigger: "3 איחורים ברצף מספק", severity: "גבוה", action: "הורדת דירוג ספק" },
  { rule: "ריכוז רכש", trigger: "> 40% מהרכש מספק אחד", severity: "בינוני", action: "המלצת פיזור" },
  { rule: "תנאי תשלום חריגים", trigger: "תשלום מראש > ₪20,000", severity: "נמוך", action: "אישור סמנכ\"ל" },
];

const workflowDefinitions = [
  { name: "הזמנת רכש סטנדרטית", steps: 4, duration: "2.5 ימים", status: "פעיל" },
  { name: "RFQ - בקשת הצעות מחיר", steps: 6, duration: "7 ימים", status: "פעיל" },
  { name: "אישור ספק חדש", steps: 5, duration: "14 ימים", status: "פעיל" },
  { name: "החזרת סחורה", steps: 3, duration: "1.5 ימים", status: "פעיל" },
  { name: "רכש חירום", steps: 2, duration: "4 שעות", status: "טיוטה" },
  { name: "מכרז פומבי", steps: 8, duration: "30 ימים", status: "טיוטה" },
];

const fmt = (v: number) =>
  new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(v);

const severityColor: Record<string, string> = {
  "גבוה": "bg-red-500/20 text-red-400 border-red-500/30",
  "בינוני": "bg-amber-500/20 text-amber-400 border-amber-500/30",
  "נמוך": "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

const TAB_CONFIG = [
  { id: "approval", label: "כללי אישור", icon: ShieldCheck },
  { id: "supplier-cat", label: "קטגוריות ספקים", icon: Tags },
  { id: "item-cat", label: "קטגוריות פריטים", icon: Layers },
  { id: "price", label: "ספי מחיר", icon: TrendingUp },
  { id: "risk", label: "כללי סיכון", icon: AlertTriangle },
  { id: "workflow", label: "תהליכי עבודה", icon: GitBranch },
];

export default function ProcurementSettings() {
  const [activeTab, setActiveTab] = useState("approval");

  return (
    <div className="space-y-4 sm:space-y-6" dir="rtl">
      <div>
        <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
          <Settings className="w-6 h-6 text-muted-foreground" /> הגדרות רכש
        </h1>
        <p className="text-muted-foreground mt-1">ניהול הגדרות ותצורת מערכת הרכש — טכנו-כל עוזי</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-slate-800/50 border border-slate-700 flex flex-wrap h-auto gap-1 p-1">
          {TAB_CONFIG.map(t => (
            <TabsTrigger key={t.id} value={t.id} className="flex items-center gap-1.5 text-xs sm:text-sm">
              <t.icon className="w-4 h-4" /> {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Tab 1 — Approval Rules */}
        <TabsContent value="approval">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader><CardTitle className="text-base">כללי אישור רכש</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead>שם כלל</TableHead>
                    <TableHead>סף אישור</TableHead>
                    <TableHead>תפקיד מאשר</TableHead>
                    <TableHead>רמה</TableHead>
                    <TableHead>סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {approvalRules.map((r, i) => (
                    <TableRow key={i} className="border-slate-700/50">
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell>{fmt(r.threshold)}</TableCell>
                      <TableCell>{r.role}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-slate-700/50">{r.level}</Badge>
                      </TableCell>
                      <TableCell>
                        {r.active ? (
                          <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                            <CheckCircle2 className="w-3 h-3 ml-1" /> פעיל
                          </Badge>
                        ) : (
                          <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30">
                            <XCircle className="w-3 h-3 ml-1" /> מושבת
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2 — Supplier Categories */}
        <TabsContent value="supplier-cat">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader><CardTitle className="text-base">קטגוריות ספקים</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead>שם קטגוריה</TableHead>
                    <TableHead>תיאור</TableHead>
                    <TableHead>ספקים</TableHead>
                    <TableHead>תנאי תשלום</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {supplierCategories.map((c, i) => (
                    <TableRow key={i} className="border-slate-700/50">
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-muted-foreground">{c.description}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-slate-700/50">{c.count}</Badge>
                      </TableCell>
                      <TableCell>{c.terms}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3 — Item Categories */}
        <TabsContent value="item-cat">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader><CardTitle className="text-base">קטגוריות פריטים</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead>שם קטגוריה</TableHead>
                    <TableHead>קטגוריית אב</TableHead>
                    <TableHead>פריטים</TableHead>
                    <TableHead>ספק ברירת מחדל</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itemCategories.map((c, i) => (
                    <TableRow key={i} className="border-slate-700/50">
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-muted-foreground">{c.parent}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-slate-700/50">{c.count}</Badge>
                      </TableCell>
                      <TableCell>{c.supplier}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4 — Price Thresholds */}
        <TabsContent value="price">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader><CardTitle className="text-base">ספי מחיר</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead>פריט / קטגוריה</TableHead>
                    <TableHead>מחיר מינימום</TableHead>
                    <TableHead>מחיר מקסימום</TableHead>
                    <TableHead>% חריגה</TableHead>
                    <TableHead>פעולה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {priceThresholds.map((p, i) => (
                    <TableRow key={i} className="border-slate-700/50">
                      <TableCell className="font-medium">{p.item}</TableCell>
                      <TableCell>{p.min > 0 ? fmt(p.min) : "—"}</TableCell>
                      <TableCell>{p.max > 0 ? fmt(p.max) : "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30">
                          {p.deviation}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{p.action}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 5 — Risk Rules */}
        <TabsContent value="risk">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader><CardTitle className="text-base">כללי סיכון</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead>כלל</TableHead>
                    <TableHead>תנאי הפעלה</TableHead>
                    <TableHead>חומרה</TableHead>
                    <TableHead>פעולה אוטומטית</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {riskRules.map((r, i) => (
                    <TableRow key={i} className="border-slate-700/50">
                      <TableCell className="font-medium">{r.rule}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{r.trigger}</TableCell>
                      <TableCell>
                        <Badge className={severityColor[r.severity] || ""}>{r.severity}</Badge>
                      </TableCell>
                      <TableCell>{r.action}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 6 — Workflow Definitions */}
        <TabsContent value="workflow">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader><CardTitle className="text-base">תהליכי עבודה</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead>שם תהליך</TableHead>
                    <TableHead>מספר שלבים</TableHead>
                    <TableHead>משך ממוצע</TableHead>
                    <TableHead>סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workflowDefinitions.map((w, i) => (
                    <TableRow key={i} className="border-slate-700/50">
                      <TableCell className="font-medium">{w.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-slate-700/50">{w.steps}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Clock className="w-3.5 h-3.5" /> {w.duration}
                        </span>
                      </TableCell>
                      <TableCell>
                        {w.status === "פעיל" ? (
                          <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                            <CheckCircle2 className="w-3 h-3 ml-1" /> פעיל
                          </Badge>
                        ) : (
                          <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                            טיוטה
                          </Badge>
                        )}
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
