import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { User, Star, Truck, Calendar, AlertTriangle, Shield, TrendingUp, Clock, Fuel, MapPin } from "lucide-react";

const drivers = [
  { id: 1, name: "אבי כהן", tz: "304578921", licenseType: "C1", licenseExpiry: "2026-05-12", vehicle: "משאית 8.5 טון - 78-432-01", deliveriesMonth: 42, kmMonth: 3850, safetyRating: 5, status: "פעיל", phone: "050-7341256", hireDate: "2019-03-10", incidents: 0, trainings: ["נהיגה מתקדמת", "חומ\"ס"], vehicleHistory: ["משאית 8.5 טון", "ואן 3.5 טון"] },
  { id: 2, name: "משה לוי", tz: "208934156", licenseType: "C1", licenseExpiry: "2026-04-28", vehicle: "משאית 12 טון - 91-205-33", deliveriesMonth: 38, kmMonth: 4120, safetyRating: 4, status: "פעיל", phone: "052-8843291", hireDate: "2020-06-15", incidents: 1, trainings: ["נהיגה מתקדמת"], vehicleHistory: ["משאית 12 טון", "משאית 8.5 טון"] },
  { id: 3, name: "יוסי אזולאי", tz: "312876540", licenseType: "C", licenseExpiry: "2027-11-03", vehicle: "משאית 18 טון - 55-671-82", deliveriesMonth: 31, kmMonth: 5200, safetyRating: 4, status: "פעיל", phone: "054-6219873", hireDate: "2018-01-22", incidents: 0, trainings: ["נהיגה מתקדמת", "חומ\"ס", "גרירה"], vehicleHistory: ["משאית 18 טון"] },
  { id: 4, name: "דוד מזרחי", tz: "287431065", licenseType: "C1", licenseExpiry: "2026-05-05", vehicle: "ואן 3.5 טון - 42-318-77", deliveriesMonth: 55, kmMonth: 2980, safetyRating: 3, status: "פעיל", phone: "053-4127890", hireDate: "2021-09-01", incidents: 2, trainings: ["נהיגה בסיסית"], vehicleHistory: ["ואן 3.5 טון", "רכב מסחרי"] },
  { id: 5, name: "רונן ביטון", tz: "345219087", licenseType: "B", licenseExpiry: "2028-02-18", vehicle: "רכב מסחרי - 63-894-22", deliveriesMonth: 61, kmMonth: 1870, safetyRating: 5, status: "פעיל", phone: "050-2198634", hireDate: "2022-04-11", incidents: 0, trainings: ["נהיגה בסיסית", "שירות לקוחות"], vehicleHistory: ["רכב מסחרי"] },
  { id: 6, name: "חיים פרץ", tz: "276543210", licenseType: "C1", licenseExpiry: "2027-08-25", vehicle: "משאית 8.5 טון - 34-562-19", deliveriesMonth: 0, kmMonth: 0, safetyRating: 4, status: "חופשה", phone: "058-3346721", hireDate: "2017-11-30", incidents: 1, trainings: ["נהיגה מתקדמת", "חומ\"ס"], vehicleHistory: ["משאית 8.5 טון", "משאית 12 טון", "ואן 3.5 טון"] },
  { id: 7, name: "עומר שלום", tz: "329187654", licenseType: "C", licenseExpiry: "2026-09-14", vehicle: "משאית 12 טון - 87-143-56", deliveriesMonth: 36, kmMonth: 4550, safetyRating: 2, status: "מושעה", phone: "052-9134567", hireDate: "2023-02-20", incidents: 4, trainings: ["נהיגה בסיסית"], vehicleHistory: ["משאית 12 טון"] },
];

const weeklySchedule: Record<number, Record<string, string>> = {
  1: { "ראשון": "06:00-14:00", "שני": "06:00-14:00", "שלישי": "14:00-22:00", "רביעי": "06:00-14:00", "חמישי": "06:00-14:00" },
  2: { "ראשון": "06:00-14:00", "שני": "14:00-22:00", "שלישי": "06:00-14:00", "רביעי": "06:00-14:00", "חמישי": "14:00-22:00" },
  3: { "ראשון": "14:00-22:00", "שני": "06:00-14:00", "שלישי": "06:00-14:00", "רביעי": "14:00-22:00", "חמישי": "06:00-14:00" },
  4: { "ראשון": "06:00-14:00", "שני": "06:00-14:00", "שלישי": "06:00-14:00", "רביעי": "06:00-14:00", "חמישי": "06:00-14:00" },
  5: { "ראשון": "06:00-14:00", "שני": "06:00-14:00", "שלישי": "06:00-14:00", "רביעי": "14:00-22:00", "חמישי": "06:00-14:00" },
  6: { "ראשון": "חופש", "שני": "חופש", "שלישי": "חופש", "רביעי": "חופש", "חמישי": "חופש" },
  7: { "ראשון": "מושעה", "שני": "מושעה", "שלישי": "מושעה", "רביעי": "מושעה", "חמישי": "מושעה" },
};

const days = ["ראשון", "שני", "שלישי", "רביעי", "חמישי"];

function statusColor(status: string) {
  if (status === "פעיל") return "bg-green-500/20 text-green-300 border-green-500/40";
  if (status === "חופשה") return "bg-yellow-500/20 text-yellow-300 border-yellow-500/40";
  return "bg-red-500/20 text-red-300 border-red-500/40";
}

function safetyStars(rating: number) {
  return Array.from({ length: 5 }, (_, i) => (
    <Star key={i} className={`w-3.5 h-3.5 inline-block ${i < rating ? "text-yellow-400 fill-yellow-400" : "text-gray-600"}`} />
  ));
}

function licenseExpiringIn30Days(expiry: string) {
  const diff = (new Date(expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  return diff > 0 && diff <= 30;
}

export default function DriverManagement() {
  const [selectedDriver, setSelectedDriver] = useState<number | null>(null);

  const activeCount = drivers.filter(d => d.status === "פעיל").length;
  const vacationCount = drivers.filter(d => d.status === "חופשה").length;
  const licenseAlerts = drivers.filter(d => licenseExpiringIn30Days(d.licenseExpiry));
  const selected = drivers.find(d => d.id === selectedDriver);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-blue-500/20">
          <User className="w-6 h-6 text-blue-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">ניהול נהגים</h1>
          <p className="text-sm text-muted-foreground">טכנו-כל עוזי - מערכת ניהול נהגים ומשלוחים</p>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/20"><User className="w-5 h-5 text-blue-400" /></div>
            <div>
              <p className="text-xs text-muted-foreground">סה"כ נהגים</p>
              <p className="text-2xl font-bold text-foreground">{drivers.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/20"><Truck className="w-5 h-5 text-green-400" /></div>
            <div>
              <p className="text-xs text-muted-foreground">פעילים היום</p>
              <p className="text-2xl font-bold text-foreground">{activeCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-500/20"><Calendar className="w-5 h-5 text-yellow-400" /></div>
            <div>
              <p className="text-xs text-muted-foreground">בחופשה</p>
              <p className="text-2xl font-bold text-foreground">{vacationCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/20"><AlertTriangle className="w-5 h-5 text-red-400" /></div>
            <div>
              <p className="text-xs text-muted-foreground">רישיונות לחידוש</p>
              <p className="text-2xl font-bold text-foreground">{licenseAlerts.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="drivers" className="space-y-4">
        <TabsList>
          <TabsTrigger value="drivers">נהגים</TabsTrigger>
          <TabsTrigger value="availability">זמינות שבועית</TabsTrigger>
          <TabsTrigger value="performance">ביצועים</TabsTrigger>
          <TabsTrigger value="alerts">התראות רישיון</TabsTrigger>
        </TabsList>

        {/* Drivers Table Tab */}
        <TabsContent value="drivers" className="space-y-4">
          <Card className="border-border/50">
            <CardHeader><CardTitle className="text-lg">רשימת נהגים</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>שם</TableHead>
                    <TableHead>ת.ז.</TableHead>
                    <TableHead>רישיון סוג</TableHead>
                    <TableHead>תוקף רישיון</TableHead>
                    <TableHead>רכב משויך</TableHead>
                    <TableHead>משלוחים החודש</TableHead>
                    <TableHead>ק"מ החודש</TableHead>
                    <TableHead>דירוג בטיחות</TableHead>
                    <TableHead>סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drivers.map(d => (
                    <TableRow key={d.id} className="cursor-pointer hover:bg-muted/70" onClick={() => setSelectedDriver(d.id)}>
                      <TableCell className="font-medium">{d.name}</TableCell>
                      <TableCell className="font-mono text-xs">{d.tz}</TableCell>
                      <TableCell><Badge variant="outline">{d.licenseType}</Badge></TableCell>
                      <TableCell className={licenseExpiringIn30Days(d.licenseExpiry) ? "text-red-400 font-semibold" : ""}>{d.licenseExpiry}</TableCell>
                      <TableCell className="text-xs">{d.vehicle}</TableCell>
                      <TableCell className="text-center">{d.deliveriesMonth}</TableCell>
                      <TableCell className="text-center">{d.kmMonth.toLocaleString()}</TableCell>
                      <TableCell>{safetyStars(d.safetyRating)}</TableCell>
                      <TableCell><Badge className={statusColor(d.status)}>{d.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Driver Profile Card */}
          {selected && (
            <Card className="border-border/50">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <User className="w-5 h-5 text-blue-400" />
                    כרטיס נהג - {selected.name}
                  </CardTitle>
                  <Badge className={statusColor(selected.status)}>{selected.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* License Details */}
                  <Card className="border-border/40 bg-muted/30">
                    <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Shield className="w-4 h-4 text-purple-400" />פרטי רישיון</CardTitle></CardHeader>
                    <CardContent className="text-sm space-y-1">
                      <p>סוג: <span className="font-bold">{selected.licenseType}</span></p>
                      <p>ת.ז.: <span className="font-mono">{selected.tz}</span></p>
                      <p>תוקף: <span className={licenseExpiringIn30Days(selected.licenseExpiry) ? "text-red-400 font-bold" : ""}>{selected.licenseExpiry}</span></p>
                      <p>טלפון: {selected.phone}</p>
                      <p>תאריך גיוס: {selected.hireDate}</p>
                    </CardContent>
                  </Card>

                  {/* Vehicle History */}
                  <Card className="border-border/40 bg-muted/30">
                    <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Truck className="w-4 h-4 text-green-400" />היסטוריית רכבים</CardTitle></CardHeader>
                    <CardContent className="text-sm space-y-1">
                      <p className="font-semibold">רכב נוכחי:</p>
                      <p className="text-xs text-muted-foreground">{selected.vehicle}</p>
                      <p className="font-semibold mt-2">רכבים קודמים:</p>
                      {selected.vehicleHistory.map((v, i) => (
                        <p key={i} className="text-xs text-muted-foreground">- {v}</p>
                      ))}
                    </CardContent>
                  </Card>

                  {/* Delivery Stats & Safety */}
                  <Card className="border-border/40 bg-muted/30">
                    <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="w-4 h-4 text-cyan-400" />סטטיסטיקות</CardTitle></CardHeader>
                    <CardContent className="text-sm space-y-2">
                      <div className="flex justify-between"><span>משלוחים החודש</span><span className="font-bold">{selected.deliveriesMonth}</span></div>
                      <div className="flex justify-between"><span>ק"מ החודש</span><span className="font-bold">{selected.kmMonth.toLocaleString()}</span></div>
                      <div className="flex justify-between"><span>תקריות בטיחות</span><span className={`font-bold ${selected.incidents > 2 ? "text-red-400" : ""}`}>{selected.incidents}</span></div>
                      <div className="flex justify-between items-center"><span>דירוג בטיחות</span><span>{safetyStars(selected.safetyRating)}</span></div>
                      <div>
                        <p className="font-semibold mt-1 mb-1">הכשרות:</p>
                        <div className="flex flex-wrap gap-1">
                          {selected.trainings.map((t, i) => (
                            <Badge key={i} variant="outline" className="text-xs">{t}</Badge>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Availability Tab */}
        <TabsContent value="availability">
          <Card className="border-border/50">
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Clock className="w-5 h-5 text-orange-400" />זמינות שבועית - ראשון עד חמישי</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>נהג</TableHead>
                    {days.map(d => <TableHead key={d} className="text-center">{d}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drivers.map(d => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">{d.name}</TableCell>
                      {days.map(day => {
                        const val = weeklySchedule[d.id]?.[day] || "-";
                        const isOff = val === "חופש" || val === "מושעה";
                        return (
                          <TableCell key={day} className={`text-center text-xs ${isOff ? "text-muted-foreground italic" : ""}`}>
                            {isOff ? (
                              <Badge variant="outline" className={val === "חופש" ? "bg-yellow-500/10 text-yellow-400" : "bg-red-500/10 text-red-400"}>{val}</Badge>
                            ) : val}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Deliveries Ranking */}
            <Card className="border-border/50">
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><MapPin className="w-4 h-4 text-blue-400" />דירוג משלוחים</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {[...drivers].filter(d => d.status !== "מושעה").sort((a, b) => b.deliveriesMonth - a.deliveriesMonth).map((d, i) => (
                  <div key={d.id} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>{i + 1}. {d.name}</span>
                      <span className="font-bold">{d.deliveriesMonth} משלוחים</span>
                    </div>
                    <Progress value={d.deliveriesMonth > 0 ? (d.deliveriesMonth / 65) * 100 : 0} className="h-2" />
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* KM Ranking */}
            <Card className="border-border/50">
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="w-4 h-4 text-green-400" />דירוג ק"מ</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {[...drivers].filter(d => d.status !== "מושעה").sort((a, b) => b.kmMonth - a.kmMonth).map((d, i) => (
                  <div key={d.id} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>{i + 1}. {d.name}</span>
                      <span className="font-bold">{d.kmMonth.toLocaleString()} ק"מ</span>
                    </div>
                    <Progress value={d.kmMonth > 0 ? (d.kmMonth / 5500) * 100 : 0} className="h-2" />
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Fuel Efficiency */}
            <Card className="border-border/50">
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Fuel className="w-4 h-4 text-amber-400" />יעילות דלק (ק"מ/ליטר)</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {[
                  { name: "רונן ביטון", efficiency: 14.2 },
                  { name: "אבי כהן", efficiency: 11.8 },
                  { name: "דוד מזרחי", efficiency: 11.1 },
                  { name: "משה לוי", efficiency: 9.6 },
                  { name: "יוסי אזולאי", efficiency: 8.3 },
                  { name: "חיים פרץ", efficiency: 0 },
                ].map((d, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>{i + 1}. {d.name}</span>
                      <span className="font-bold">{d.efficiency > 0 ? `${d.efficiency} ק"מ/ל` : "---"}</span>
                    </div>
                    <Progress value={d.efficiency > 0 ? (d.efficiency / 15) * 100 : 0} className="h-2" />
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Safety Score */}
            <Card className="border-border/50">
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Shield className="w-4 h-4 text-purple-400" />דירוג בטיחות</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {[...drivers].sort((a, b) => b.safetyRating - a.safetyRating || a.incidents - b.incidents).map((d, i) => (
                  <div key={d.id} className="space-y-1">
                    <div className="flex justify-between text-sm items-center">
                      <span>{i + 1}. {d.name}</span>
                      <span className="flex items-center gap-2">
                        {safetyStars(d.safetyRating)}
                        <span className="text-xs text-muted-foreground">({d.incidents} תקריות)</span>
                      </span>
                    </div>
                    <Progress value={(d.safetyRating / 5) * 100} className="h-2" />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* License Alerts Tab */}
        <TabsContent value="alerts">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-400" />
                התראות רישיון - פג תוקף תוך 30 יום
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {licenseAlerts.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">אין התראות כרגע</p>
              ) : (
                licenseAlerts.map(d => {
                  const daysLeft = Math.ceil((new Date(d.licenseExpiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                  return (
                    <Card key={d.id} className="border-red-500/30 bg-red-500/5">
                      <CardContent className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="p-2 rounded-lg bg-red-500/20">
                            <AlertTriangle className="w-5 h-5 text-red-400" />
                          </div>
                          <div>
                            <p className="font-bold text-foreground">{d.name}</p>
                            <p className="text-sm text-muted-foreground">ת.ז. {d.tz} | רישיון סוג {d.licenseType}</p>
                          </div>
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-semibold text-red-400">תוקף: {d.licenseExpiry}</p>
                          <p className="text-xs text-red-300">נותרו {daysLeft} ימים</p>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
