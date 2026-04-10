import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Users,
  FlaskConical,
  Search,
  FileText,
  CalendarDays,
  Building2,
  Clock,
  RefreshCw,
} from "lucide-react";

const FALLBACK_CERTIFICATES = [
  { id: 1, material: "אלומיניום 6063-T5 פרופיל", standard: "EN 573-3", issuer: "TUV Rheinland", issued: "2025-08-15", expiry: "2026-08-15", status: "בתוקף", supplier: "אלומיל ישראל" },
  { id: 2, material: "אלומיניום 6060-T6 יציקה", standard: "EN 755-2", issuer: "Bureau Veritas", issued: "2025-06-01", expiry: "2026-06-01", status: "בתוקף", supplier: "אלומיל ישראל" },
  { id: 3, material: "זכוכית מחוסמת 8 מ\"מ", standard: "EN 12150-1", issuer: "BSI", issued: "2025-09-20", expiry: "2026-09-20", status: "בתוקף", supplier: "פניציה זכוכית" },
  { id: 4, material: "זכוכית בידוד Low-E", standard: "EN 1279-2", issuer: "TUV Rheinland", issued: "2025-07-10", expiry: "2026-07-10", status: "בתוקף", supplier: "פניציה זכוכית" },
  { id: 5, material: "זכוכית בטיחות למינציה", standard: "EN 14449", issuer: "SGS", issued: "2025-05-01", expiry: "2026-05-01", status: "עומד לפוג", supplier: "ישרגלאס" },
  { id: 6, material: "פלדה מגולוונת S235JR", standard: "EN 10025-2", issuer: "Lloyd's Register", issued: "2025-04-15", expiry: "2026-04-15", status: "עומד לפוג", supplier: "מתכת הנגב" },
  { id: 7, material: "פלדת אל-חלד 304", standard: "EN 10088-2", issuer: "TUV SUD", issued: "2025-10-01", expiry: "2026-10-01", status: "בתוקף", supplier: "מתכת הנגב" },
  { id: 8, material: "אטמי EPDM", standard: "EN 12365-1", issuer: "BSI", issued: "2025-03-01", expiry: "2026-03-01", status: "פג תוקף", supplier: "גומטק" },
  { id: 9, material: "ברגים ומחברי נירוסטה", standard: "EN ISO 3506-1", issuer: "DNV", issued: "2025-11-15", expiry: "2026-11-15", status: "בתוקף", supplier: "חומרי בניין פלוס" },
  { id: 10, material: "ציפוי אנודייז אלומיניום", standard: "EN 12373-1", issuer: "Bureau Veritas", issued: "2025-08-01", expiry: "2026-08-01", status: "בתוקף", supplier: "אלומיל ישראל" },
  { id: 11, material: "סיליקון איטום מבני", standard: "EN 15651-1", issuer: "SGS", issued: "2024-12-01", expiry: "2025-12-01", status: "פג תוקף", supplier: "סיקה ישראל" },
  { id: 12, material: "צבע אלקטרוסטטי לאלומיניום", standard: "Qualicoat", issuer: "Qualicoat", issued: "2025-06-15", expiry: "2026-06-15", status: "בתוקף", supplier: "ג'וטון ישראל" },
  { id: 13, material: "זכוכית אש EI30", standard: "EN 1634-1", issuer: "Warringtonfire", issued: "2025-02-01", expiry: "2026-02-01", status: "פג תוקף", supplier: "פניציה זכוכית" },
  { id: 14, material: "אלומיניום חזית קירוי", standard: "EN 13830", issuer: "CSTB", issued: "2025-09-01", expiry: "2026-09-01", status: "בתוקף", supplier: "אלובין" },
  { id: 15, material: "משקוף פלדה חסין אש", standard: "EN 1634-1", issuer: "Warringtonfire", issued: "2025-01-15", expiry: "2026-01-15", status: "פג תוקף", supplier: "מתכת הנגב" },
];

const FALLBACK_SUPPLIERS = [
  { name: "אלומיל ישראל", totalCerts: 3, valid: 3, expiring: 0, expired: 0 },
  { name: "פניציה זכוכית", totalCerts: 3, valid: 1, expiring: 1, expired: 1 },
  { name: "מתכת הנגב", totalCerts: 3, valid: 1, expiring: 1, expired: 1 },
  { name: "ישרגלאס", totalCerts: 1, valid: 0, expiring: 1, expired: 0 },
  { name: "גומטק", totalCerts: 1, valid: 0, expiring: 0, expired: 1 },
  { name: "חומרי בניין פלוס", totalCerts: 1, valid: 1, expiring: 0, expired: 0 },
  { name: "סיקה ישראל", totalCerts: 1, valid: 0, expiring: 0, expired: 1 },
  { name: "ג'וטון ישראל", totalCerts: 1, valid: 1, expiring: 0, expired: 0 },
  { name: "אלובין", totalCerts: 1, valid: 1, expiring: 0, expired: 0 },
];

const statusColor = (status: string) => {
  switch (status) {
    case "בתוקף": return "bg-green-100 text-green-800";
    case "עומד לפוג": return "bg-yellow-100 text-yellow-800";
    case "פג תוקף": return "bg-red-100 text-red-800";
    default: return "bg-gray-100 text-gray-800";
  }
};

const statusIcon = (status: string) => {
  switch (status) {
    case "בתוקף": return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    case "עומד לפוג": return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
    case "פג תוקף": return <XCircle className="h-4 w-4 text-red-600" />;
    default: return <Clock className="h-4 w-4" />;
  }
};

export default function MaterialCerts() {
  const { data: materialcertsData } = useQuery({
    queryKey: ["material-certs"],
    queryFn: () => authFetch("/api/quality/material_certs"),
    staleTime: 5 * 60 * 1000,
  });

  const certificates = materialcertsData ?? FALLBACK_CERTIFICATES;
  const suppliers = FALLBACK_SUPPLIERS;

  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("certificates");

  const totalCerts = certificates.length;
  const validCerts = certificates.filter((c) => c.status === "בתוקף").length;
  const expiringCerts = certificates.filter((c) => c.status === "עומד לפוג").length;
  const expiredCerts = certificates.filter((c) => c.status === "פג תוקף").length;
  const certifiedSuppliers = new Set(certificates.filter((c) => c.status === "בתוקף").map((c) => c.supplier)).size;
  const testsPending = 5;

  const kpis = [
    { label: "סה\"כ תעודות", value: totalCerts, icon: ShieldCheck, color: "text-blue-600" },
    { label: "בתוקף", value: validCerts, icon: CheckCircle2, color: "text-green-600" },
    { label: "עומדים לפוג", value: expiringCerts, icon: AlertTriangle, color: "text-yellow-600" },
    { label: "פג תוקף", value: expiredCerts, icon: XCircle, color: "text-red-600" },
    { label: "ספקים מאושרים", value: certifiedSuppliers, icon: Users, color: "text-purple-600" },
    { label: "בדיקות ממתינות", value: testsPending, icon: FlaskConical, color: "text-orange-600" },
  ];

  const filtered = certificates.filter((c) => c.material.includes(search) || c.supplier.includes(search) || c.standard.includes(search));

  return (
    <div dir="rtl" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">תעודות חומרים</h1>
          <p className="text-muted-foreground mt-1">טכנו-כל עוזי - ניהול אישורי חומרי גלם ותקנים</p>
        </div>
        <Button><FileText className="h-4 w-4 ml-2" />דוח תעודות</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-4 text-center">
              <kpi.icon className={`h-8 w-8 mx-auto mb-2 ${kpi.color}`} />
              <div className="text-2xl font-bold">{kpi.value}</div>
              <div className="text-xs text-muted-foreground">{kpi.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="certificates">תעודות</TabsTrigger>
          <TabsTrigger value="expiring">עומדים לפוג</TabsTrigger>
          <TabsTrigger value="suppliers">ספקים</TabsTrigger>
        </TabsList>

        <TabsContent value="certificates" className="space-y-4">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="חיפוש חומר, תקן או ספק..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-10" />
          </div>
          <div className="space-y-3">
            {filtered.map((cert) => (
              <Card key={cert.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {statusIcon(cert.status)}
                      <div>
                        <div className="font-semibold">{cert.material}</div>
                        <div className="text-sm text-muted-foreground flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">{cert.standard}</Badge>
                          <span className="text-gray-300">|</span>
                          <Building2 className="h-3 w-3" />{cert.supplier}
                        </div>
                      </div>
                    </div>
                    <Badge className={statusColor(cert.status)}>{cert.status}</Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div className="text-center p-2 bg-gray-50 rounded">
                      <div className="font-medium">{cert.issuer}</div>
                      <div className="text-xs text-muted-foreground">גוף מאשר</div>
                    </div>
                    <div className="text-center p-2 bg-gray-50 rounded">
                      <div className="font-medium">{cert.issued}</div>
                      <div className="text-xs text-muted-foreground">תאריך הנפקה</div>
                    </div>
                    <div className={`text-center p-2 rounded ${cert.status === "פג תוקף" ? "bg-red-50" : cert.status === "עומד לפוג" ? "bg-yellow-50" : "bg-green-50"}`}>
                      <div className="font-medium">{cert.expiry}</div>
                      <div className="text-xs text-muted-foreground">תוקף עד</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="expiring" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-yellow-700">
                <AlertTriangle className="h-5 w-5" />תעודות שעומדות לפוג (90 ימים הקרובים)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {certificates.filter((c) => c.status === "עומד לפוג").map((cert) => (
                <div key={cert.id} className="flex items-center justify-between p-3 border border-yellow-200 rounded-lg bg-yellow-50">
                  <div>
                    <div className="font-semibold">{cert.material}</div>
                    <div className="text-sm text-muted-foreground">{cert.standard} | {cert.supplier}</div>
                    <div className="text-sm flex items-center gap-1 mt-1"><CalendarDays className="h-3 w-3" />פג תוקף: {cert.expiry}</div>
                  </div>
                  <Button size="sm" variant="outline" className="border-yellow-400 text-yellow-700">
                    <RefreshCw className="h-3 w-3 ml-1" />חדש
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-700">
                <XCircle className="h-5 w-5" />תעודות שפג תוקפן
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {certificates.filter((c) => c.status === "פג תוקף").map((cert) => (
                <div key={cert.id} className="flex items-center justify-between p-3 border border-red-200 rounded-lg bg-red-50">
                  <div>
                    <div className="font-semibold">{cert.material}</div>
                    <div className="text-sm text-muted-foreground">{cert.standard} | {cert.supplier}</div>
                    <div className="text-sm flex items-center gap-1 mt-1 text-red-600"><XCircle className="h-3 w-3" />פג: {cert.expiry}</div>
                  </div>
                  <Button size="sm" variant="destructive">
                    <RefreshCw className="h-3 w-3 ml-1" />חידוש דחוף
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="p-3 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-700">{validCerts}</div>
                  <div className="text-sm text-muted-foreground">בתוקף</div>
                </div>
                <div className="p-3 bg-yellow-50 rounded-lg">
                  <div className="text-2xl font-bold text-yellow-700">{expiringCerts}</div>
                  <div className="text-sm text-muted-foreground">עומדים לפוג</div>
                </div>
                <div className="p-3 bg-red-50 rounded-lg">
                  <div className="text-2xl font-bold text-red-700">{expiredCerts}</div>
                  <div className="text-sm text-muted-foreground">פג תוקף</div>
                </div>
              </div>
              <div className="mt-4">
                <div className="text-sm mb-1 flex justify-between">
                  <span>תקינות תעודות</span>
                  <span className="font-bold">{((validCerts / totalCerts) * 100).toFixed(0)}%</span>
                </div>
                <Progress value={(validCerts / totalCerts) * 100} className="h-3" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="suppliers" className="space-y-3">
          {suppliers.map((s) => {
            const healthPct = s.totalCerts > 0 ? ((s.valid / s.totalCerts) * 100) : 0;
            return (
              <Card key={s.name}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <Building2 className="h-5 w-5 text-gray-500" />
                      <div>
                        <div className="font-semibold">{s.name}</div>
                        <div className="text-sm text-muted-foreground">{s.totalCerts} תעודות</div>
                      </div>
                    </div>
                    <Badge className={healthPct === 100 ? "bg-green-100 text-green-800" : healthPct >= 50 ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-800"}>
                      {healthPct.toFixed(0)}% תקין
                    </Badge>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-sm">
                    <div className="text-center p-2 bg-gray-50 rounded">
                      <div className="font-bold">{s.totalCerts}</div>
                      <div className="text-xs text-muted-foreground">סה"כ</div>
                    </div>
                    <div className="text-center p-2 bg-green-50 rounded">
                      <div className="font-bold text-green-700">{s.valid}</div>
                      <div className="text-xs text-muted-foreground">בתוקף</div>
                    </div>
                    <div className="text-center p-2 bg-yellow-50 rounded">
                      <div className="font-bold text-yellow-700">{s.expiring}</div>
                      <div className="text-xs text-muted-foreground">עומד לפוג</div>
                    </div>
                    <div className="text-center p-2 bg-red-50 rounded">
                      <div className="font-bold text-red-700">{s.expired}</div>
                      <div className="text-xs text-muted-foreground">פג תוקף</div>
                    </div>
                  </div>
                  <div className="mt-3">
                    <Progress value={healthPct} className="h-2" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>
      </Tabs>
    </div>
  );
}
