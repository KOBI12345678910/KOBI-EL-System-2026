import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Car, Truck, Wrench, FileText, ShieldCheck, Calendar, Fuel,
  Weight, Package, DollarSign, User, ClipboardList, AlertTriangle,
} from "lucide-react";

// ─── Data ────────────────────────────────────────────────────────────────────

interface Vehicle {
  id: string;
  plate: string;
  type: string;
  makeModel: string;
  year: number;
  km: number;
  testDate: string;
  insuranceUntil: string;
  licenseUntil: string;
  driver: string;
  status: "תקין" | "דורש טיפול" | "בתחזוקה" | "מושבת";
  purchaseDate: string;
  monthlyCost: number;
  weight: number;
  cargoVolume: number;
  fuelConsumption: number;
}

const STATUS_COLOR: Record<string, string> = {
  "תקין": "bg-green-600/20 text-green-300 border-green-500/40",
  "דורש טיפול": "bg-yellow-600/20 text-yellow-300 border-yellow-500/40",
  "בתחזוקה": "bg-blue-600/20 text-blue-300 border-blue-500/40",
  "מושבת": "bg-red-600/20 text-red-300 border-red-500/40",
};

const FALLBACK_VEHICLES: Vehicle[] = [
  { id: "VEH-001", plate: "85-342-71", type: "משאית 12T", makeModel: "מרצדס אקטרוס 1845", year: 2021, km: 187420, testDate: "2026-01-15", insuranceUntil: "2026-09-30", licenseUntil: "2026-12-31", driver: "מוחמד חלבי", status: "תקין", purchaseDate: "2021-03-10", monthlyCost: 8200, weight: 12000, cargoVolume: 42, fuelConsumption: 32 },
  { id: "VEH-002", plate: "91-487-23", type: "משאית 12T", makeModel: "וולוו FH 460", year: 2020, km: 214860, testDate: "2025-11-20", insuranceUntil: "2026-07-15", licenseUntil: "2026-11-30", driver: "אבי כהן", status: "דורש טיפול", purchaseDate: "2020-06-22", monthlyCost: 9100, weight: 12000, cargoVolume: 44, fuelConsumption: 34 },
  { id: "VEH-003", plate: "78-156-94", type: "משאית מנוף 8T", makeModel: "סקניה P280 + מנוף פלפינגר", year: 2022, km: 98300, testDate: "2026-03-05", insuranceUntil: "2026-11-20", licenseUntil: "2027-03-31", driver: "יוסי לוי", status: "תקין", purchaseDate: "2022-01-18", monthlyCost: 11500, weight: 8000, cargoVolume: 28, fuelConsumption: 28 },
  { id: "VEH-004", plate: "44-293-58", type: "טנדר 3.5T", makeModel: "טויוטה היילקס 2.4D", year: 2023, km: 42150, testDate: "2026-06-10", insuranceUntil: "2027-01-31", licenseUntil: "2027-06-30", driver: "דני אברהם", status: "תקין", purchaseDate: "2023-02-14", monthlyCost: 4300, weight: 3500, cargoVolume: 6, fuelConsumption: 11 },
  { id: "VEH-005", plate: "63-718-42", type: "רכב שירות", makeModel: "פיאט דוקאטו L2H2", year: 2022, km: 76980, testDate: "2026-02-28", insuranceUntil: "2026-08-15", licenseUntil: "2026-12-15", driver: "רמי נסר", status: "תקין", purchaseDate: "2022-05-30", monthlyCost: 5600, weight: 3300, cargoVolume: 12, fuelConsumption: 13 },
  { id: "VEH-006", plate: "52-834-67", type: "טנדר 3.5T", makeModel: "פורד ריינג'ר 2.0 Bi-Turbo", year: 2021, km: 112400, testDate: "2025-09-14", insuranceUntil: "2026-06-30", licenseUntil: "2026-09-30", driver: "—", status: "בתחזוקה", purchaseDate: "2021-08-05", monthlyCost: 4800, weight: 3500, cargoVolume: 5, fuelConsumption: 12 },
  { id: "VEH-007", plate: "37-561-89", type: "טרקטורון מפעל", makeModel: "BT Lifter — חשמלי", year: 2023, km: 8200, testDate: "—", insuranceUntil: "2026-12-31", licenseUntil: "—", driver: "שמעון דוד", status: "תקין", purchaseDate: "2023-07-01", monthlyCost: 1900, weight: 2000, cargoVolume: 3, fuelConsumption: 0 },
  { id: "VEH-008", plate: "29-645-13", type: "רכב שירות", makeModel: "רנו מאסטר L3H2", year: 2019, km: 198700, testDate: "2025-12-02", insuranceUntil: "2026-05-31", licenseUntil: "2026-06-30", driver: "—", status: "מושבת", purchaseDate: "2019-11-20", monthlyCost: 3200, weight: 3500, cargoVolume: 13, fuelConsumption: 14 },
];

const FALLBACK_MAINTENANCE_HISTORY = [
  { date: "2026-03-18", vehicle: "VEH-002", description: "החלפת רפידות בלמים קדמיות + דיסקים", cost: 4200, garage: "מוסך אורן — חיפה" },
  { date: "2026-02-04", vehicle: "VEH-006", description: "טיפול 120,000 ק\"מ — שמן, פילטרים, רצועה", cost: 3100, garage: "מוסך יניב — עכו" },
  { date: "2026-01-22", vehicle: "VEH-001", description: "החלפת צמיגים 4 יח' — מישלין 315/80R22.5", cost: 9600, garage: "צמיגי הצפון" },
  { date: "2025-12-10", vehicle: "VEH-003", description: "תיקון מערכת הידראולית למנוף — צינור + משאבה", cost: 7800, garage: "פלפינגר שירות ישראל" },
  { date: "2025-11-15", vehicle: "VEH-005", description: "טיפול שנתי + החלפת סוללה", cost: 2400, garage: "מוסך אורן — חיפה" },
];

const FALLBACK_DOCUMENTS = [
  { vehicle: "VEH-001", type: "רישיון רכב", validUntil: "2026-12-31", status: "בתוקף" },
  { vehicle: "VEH-001", type: "ביטוח מקיף", validUntil: "2026-09-30", status: "בתוקף" },
  { vehicle: "VEH-001", type: "טסט שנתי", validUntil: "2027-01-15", status: "בתוקף" },
  { vehicle: "VEH-002", type: "רישיון רכב", validUntil: "2026-11-30", status: "בתוקף" },
  { vehicle: "VEH-002", type: "ביטוח מקיף", validUntil: "2026-07-15", status: "עומד לפוג" },
  { vehicle: "VEH-002", type: "טסט שנתי", validUntil: "2025-11-20", status: "פג תוקף" },
  { vehicle: "VEH-006", type: "רישיון רכב", validUntil: "2026-09-30", status: "בתוקף" },
  { vehicle: "VEH-006", type: "ביטוח מקיף", validUntil: "2026-06-30", status: "עומד לפוג" },
  { vehicle: "VEH-008", type: "רישיון רכב", validUntil: "2026-06-30", status: "עומד לפוג" },
  { vehicle: "VEH-008", type: "ביטוח מקיף", validUntil: "2026-05-31", status: "עומד לפוג" },
];

const DOC_STATUS_COLOR: Record<string, string> = {
  "בתוקף": "bg-green-600/20 text-green-300",
  "עומד לפוג": "bg-yellow-600/20 text-yellow-300",
  "פג תוקף": "bg-red-600/20 text-red-300",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function shekel(n: number) {
  return `${n.toLocaleString("he-IL")} \u20AA`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function VehicleRegistry() {
  const { data: vehicles = FALLBACK_VEHICLES } = useQuery({
    queryKey: ["logistics-vehicles"],
    queryFn: async () => {
      const res = await authFetch("/api/logistics/vehicle-registry/vehicles");
      if (!res.ok) return FALLBACK_VEHICLES;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_VEHICLES;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: maintenanceHistory = FALLBACK_MAINTENANCE_HISTORY } = useQuery({
    queryKey: ["logistics-maintenance-history"],
    queryFn: async () => {
      const res = await authFetch("/api/logistics/vehicle-registry/maintenance-history");
      if (!res.ok) return FALLBACK_MAINTENANCE_HISTORY;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_MAINTENANCE_HISTORY;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: documents = FALLBACK_DOCUMENTS } = useQuery({
    queryKey: ["logistics-documents"],
    queryFn: async () => {
      const res = await authFetch("/api/logistics/vehicle-registry/documents");
      if (!res.ok) return FALLBACK_DOCUMENTS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_DOCUMENTS;
    },
    staleTime: 30_000,
    retry: 1,
  });


  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);

  const activeCount = vehicles.filter(v => v.status === "תקין" || v.status === "דורש טיפול").length;
  const maintenanceCount = vehicles.filter(v => v.status === "בתחזוקה").length;
  const disabledCount = vehicles.filter(v => v.status === "מושבת").length;
  const totalMonthlyCost = vehicles.reduce((s, v) => s + v.monthlyCost, 0);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Car className="w-7 h-7 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">מאגר כלי רכב</h1>
          <p className="text-sm text-muted-foreground">טכנו-כל עוזי — ניהול צי רכבים ומסמכים</p>
        </div>
      </div>

      {/* ── Summary Cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <Truck className="w-8 h-8 text-blue-400" />
            <div>
              <p className="text-xs text-muted-foreground">סה"כ כלי רכב</p>
              <p className="text-2xl font-bold text-foreground">{vehicles.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <ShieldCheck className="w-8 h-8 text-green-400" />
            <div>
              <p className="text-xs text-muted-foreground">פעילים</p>
              <p className="text-2xl font-bold text-green-400">{activeCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <Wrench className="w-8 h-8 text-yellow-400" />
            <div>
              <p className="text-xs text-muted-foreground">בתחזוקה</p>
              <p className="text-2xl font-bold text-yellow-400">{maintenanceCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-8 h-8 text-red-400" />
            <div>
              <p className="text-xs text-muted-foreground">מושבת / בהשכרה</p>
              <p className="text-2xl font-bold text-red-400">{disabledCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────── */}
      <Tabs defaultValue="list" className="space-y-4">
        <TabsList>
          <TabsTrigger value="list">רשימה</TabsTrigger>
          <TabsTrigger value="detail">פרטי רכב</TabsTrigger>
          <TabsTrigger value="docs">מסמכים</TabsTrigger>
          <TabsTrigger value="costs">עלויות</TabsTrigger>
        </TabsList>

        {/* ── Tab: רשימה ─────────────────────────────────────────────── */}
        <TabsContent value="list">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ClipboardList className="w-5 h-5" /> רשימת כלי רכב
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">מזהה</TableHead>
                    <TableHead className="text-right">מספר רישוי</TableHead>
                    <TableHead className="text-right">סוג</TableHead>
                    <TableHead className="text-right">יצרן + דגם</TableHead>
                    <TableHead className="text-right">שנה</TableHead>
                    <TableHead className="text-right">ק"מ</TableHead>
                    <TableHead className="text-right">טסט</TableHead>
                    <TableHead className="text-right">ביטוח עד</TableHead>
                    <TableHead className="text-right">רישיון עד</TableHead>
                    <TableHead className="text-right">נהג</TableHead>
                    <TableHead className="text-right">מצב</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vehicles.map(v => (
                    <TableRow
                      key={v.id}
                      className="cursor-pointer hover:bg-muted/40 transition-colors"
                      onClick={() => setSelectedVehicle(v)}
                    >
                      <TableCell className="font-mono text-xs">{v.id}</TableCell>
                      <TableCell className="font-mono">{v.plate}</TableCell>
                      <TableCell>{v.type}</TableCell>
                      <TableCell>{v.makeModel}</TableCell>
                      <TableCell>{v.year}</TableCell>
                      <TableCell>{v.km.toLocaleString("he-IL")}</TableCell>
                      <TableCell className="text-xs">{v.testDate}</TableCell>
                      <TableCell className="text-xs">{v.insuranceUntil}</TableCell>
                      <TableCell className="text-xs">{v.licenseUntil}</TableCell>
                      <TableCell>{v.driver}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={STATUS_COLOR[v.status]}>
                          {v.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: פרטי רכב ──────────────────────────────────────────── */}
        <TabsContent value="detail">
          {selectedVehicle ? (
            <div className="space-y-4">
              <Card className="border-border">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Car className="w-5 h-5" />
                    {selectedVehicle.id} — {selectedVehicle.makeModel}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Specs */}
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-3">מפרט טכני</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div className="flex items-center gap-2">
                        <Weight className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">משקל כולל</p>
                          <p className="font-semibold">{selectedVehicle.weight.toLocaleString("he-IL")} ק"ג</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">נפח מטען</p>
                          <p className="font-semibold">{selectedVehicle.cargoVolume} מ"ק</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Fuel className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">צריכת דלק</p>
                          <p className="font-semibold">{selectedVehicle.fuelConsumption} ל'/100 ק"מ</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">תאריך רכישה</p>
                          <p className="font-semibold">{selectedVehicle.purchaseDate}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Driver */}
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-2">נהג משויך</h3>
                    <div className="flex items-center gap-2">
                      <User className="w-5 h-5 text-primary" />
                      <span className="font-medium">{selectedVehicle.driver}</span>
                      <Badge variant="outline" className={STATUS_COLOR[selectedVehicle.status]}>
                        {selectedVehicle.status}
                      </Badge>
                    </div>
                  </div>

                  {/* Documents summary */}
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-2">מסמכים</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {documents
                        .filter(d => d.vehicle === selectedVehicle.id)
                        .map((d, i) => (
                          <div key={i} className="border border-border rounded-lg p-3 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <FileText className="w-4 h-4 text-muted-foreground" />
                              <span className="text-sm">{d.type}</span>
                            </div>
                            <Badge variant="outline" className={DOC_STATUS_COLOR[d.status] ?? ""}>
                              {d.status}
                            </Badge>
                          </div>
                        ))}
                    </div>
                  </div>

                  {/* Maintenance history for this vehicle */}
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-2">היסטוריית תחזוקה</h3>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right">תאריך</TableHead>
                          <TableHead className="text-right">תיאור</TableHead>
                          <TableHead className="text-right">מוסך</TableHead>
                          <TableHead className="text-right">עלות</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {maintenanceHistory
                          .filter(m => m.vehicle === selectedVehicle.id)
                          .map((m, i) => (
                            <TableRow key={i}>
                              <TableCell className="text-xs">{m.date}</TableCell>
                              <TableCell>{m.description}</TableCell>
                              <TableCell className="text-xs">{m.garage}</TableCell>
                              <TableCell className="font-mono">{shekel(m.cost)}</TableCell>
                            </TableRow>
                          ))}
                        {maintenanceHistory.filter(m => m.vehicle === selectedVehicle.id).length === 0 && (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-muted-foreground">
                              אין רשומות תחזוקה לרכב זה
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card className="border-border">
              <CardContent className="p-10 text-center text-muted-foreground">
                <Car className="w-12 h-12 mx-auto mb-3 opacity-40" />
                <p>לחץ על שורה בטבלת הרשימה כדי לצפות בפרטי הרכב</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Tab: מסמכים ────────────────────────────────────────────── */}
        <TabsContent value="docs">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileText className="w-5 h-5" /> מסמכים ותוקף
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">רכב</TableHead>
                    <TableHead className="text-right">סוג מסמך</TableHead>
                    <TableHead className="text-right">בתוקף עד</TableHead>
                    <TableHead className="text-right">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map((d, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs">{d.vehicle}</TableCell>
                      <TableCell>{d.type}</TableCell>
                      <TableCell className="text-xs">{d.validUntil}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={DOC_STATUS_COLOR[d.status] ?? ""}>
                          {d.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: עלויות ────────────────────────────────────────────── */}
        <TabsContent value="costs">
          <div className="space-y-4">
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <DollarSign className="w-5 h-5" /> סיכום עלויות חודשי
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-muted-foreground">סה"כ עלות חודשית לצי</span>
                  <span className="text-xl font-bold text-primary">{shekel(totalMonthlyCost)}</span>
                </div>
                <div className="space-y-3">
                  {vehicles.map(v => {
                    const pct = Math.round((v.monthlyCost / totalMonthlyCost) * 100);
                    return (
                      <div key={v.id} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span>{v.id} — {v.type}</span>
                          <span className="font-mono">{shekel(v.monthlyCost)} ({pct}%)</span>
                        </div>
                        <Progress value={pct} className="h-2" />
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Wrench className="w-5 h-5" /> עלויות תחזוקה אחרונות
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">תאריך</TableHead>
                      <TableHead className="text-right">רכב</TableHead>
                      <TableHead className="text-right">תיאור</TableHead>
                      <TableHead className="text-right">מוסך</TableHead>
                      <TableHead className="text-right">עלות</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {maintenanceHistory.map((m, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs">{m.date}</TableCell>
                        <TableCell className="font-mono text-xs">{m.vehicle}</TableCell>
                        <TableCell>{m.description}</TableCell>
                        <TableCell className="text-xs">{m.garage}</TableCell>
                        <TableCell className="font-mono">{shekel(m.cost)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-bold">
                      <TableCell colSpan={4} className="text-left">סה"כ תחזוקה</TableCell>
                      <TableCell className="font-mono">
                        {shekel(maintenanceHistory.reduce((s, m) => s + m.cost, 0))}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
