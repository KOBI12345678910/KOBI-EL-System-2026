import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Globe, Users, MapPin, Clock, ShieldAlert, Star, TrendingUp, Search, Filter } from "lucide-react";

function MiniBar({ value, colorClass }: { value: number; colorClass: string }) {
  return (
    <div className="h-1.5 flex-1 rounded-full bg-gray-700 overflow-hidden">
      <div className={`h-full rounded-full transition-all ${colorClass}`} style={{ width: `${value}%` }} />
    </div>
  );
}

const FLAG: Record<string, string> = {
  CN: "\u{1F1E8}\u{1F1F3}", DE: "\u{1F1E9}\u{1F1EA}", GR: "\u{1F1EC}\u{1F1F7}",
  TR: "\u{1F1F9}\u{1F1F7}", BE: "\u{1F1E7}\u{1F1EA}", MX: "\u{1F1F2}\u{1F1FD}",
  IT: "\u{1F1EE}\u{1F1F9}", NO: "\u{1F1F3}\u{1F1F4}",
};

interface Supplier {
  code: string;
  name: string;
  country: string;
  countryCode: string;
  category: string;
  incoterm: string;
  currency: string;
  leadTime: number;
  riskScore: number;
  performance: number;
  status: "active" | "preferred" | "inactive" | "probation";
  totalOrders: number;
  lastOrder: string;
}

const FALLBACK_SUPPLIERS: Supplier[] = [
  { code: "SUP-CN-001", name: "Foshan Glass Co.", country: "\u05E1\u05D9\u05DF", countryCode: "CN", category: "\u05D6\u05DB\u05D5\u05DB\u05D9\u05EA", incoterm: "FOB", currency: "USD", leadTime: 42, riskScore: 65, performance: 78, status: "active", totalOrders: 34, lastOrder: "2026-03-15" },
  { code: "SUP-DE-001", name: "Sch\u00FCco International", country: "\u05D2\u05E8\u05DE\u05E0\u05D9\u05D4", countryCode: "DE", category: "\u05D0\u05DC\u05D5\u05DE\u05D9\u05E0\u05D9\u05D5\u05DD", incoterm: "CIF", currency: "EUR", leadTime: 28, riskScore: 15, performance: 96, status: "preferred", totalOrders: 67, lastOrder: "2026-04-02" },
  { code: "SUP-GR-001", name: "Alumil SA", country: "\u05D9\u05D5\u05D5\u05DF", countryCode: "GR", category: "\u05D0\u05DC\u05D5\u05DE\u05D9\u05E0\u05D9\u05D5\u05DD", incoterm: "CFR", currency: "EUR", leadTime: 21, riskScore: 30, performance: 88, status: "preferred", totalOrders: 52, lastOrder: "2026-03-28" },
  { code: "SUP-TR-001", name: "\u015Ei\u015Fecam", country: "\u05D8\u05D5\u05E8\u05E7\u05D9\u05D4", countryCode: "TR", category: "\u05D6\u05DB\u05D5\u05DB\u05D9\u05EA", incoterm: "EXW", currency: "USD", leadTime: 18, riskScore: 45, performance: 82, status: "active", totalOrders: 29, lastOrder: "2026-03-20" },
  { code: "SUP-BE-001", name: "Reynaers Aluminium", country: "\u05D1\u05DC\u05D2\u05D9\u05D4", countryCode: "BE", category: "\u05DE\u05E2\u05E8\u05DB\u05D5\u05EA", incoterm: "DAP", currency: "EUR", leadTime: 25, riskScore: 12, performance: 94, status: "preferred", totalOrders: 41, lastOrder: "2026-04-05" },
  { code: "SUP-MX-001", name: "Vitro Glass", country: "\u05DE\u05E7\u05E1\u05D9\u05E7\u05D5", countryCode: "MX", category: "\u05D6\u05DB\u05D5\u05DB\u05D9\u05EA", incoterm: "FOB", currency: "USD", leadTime: 35, riskScore: 50, performance: 74, status: "active", totalOrders: 12, lastOrder: "2026-02-10" },
  { code: "SUP-IT-001", name: "Aluk Group", country: "\u05D0\u05D9\u05D8\u05DC\u05D9\u05D4", countryCode: "IT", category: "\u05D0\u05DC\u05D5\u05DE\u05D9\u05E0\u05D9\u05D5\u05DD", incoterm: "CIF", currency: "EUR", leadTime: 22, riskScore: 20, performance: 91, status: "preferred", totalOrders: 38, lastOrder: "2026-03-30" },
  { code: "SUP-NO-001", name: "Hydro ASA", country: "\u05E0\u05D5\u05E8\u05D5\u05D5\u05D2\u05D9\u05D4", countryCode: "NO", category: "\u05D7\u05D5\u05DE\u05E8\u05D9 \u05D2\u05DC\u05DD", incoterm: "DDP", currency: "NOK", leadTime: 30, riskScore: 10, performance: 97, status: "preferred", totalOrders: 55, lastOrder: "2026-04-07" },
];

const statusConfig: Record<string, { label: string; color: string }> = {
  active: { label: "\u05E4\u05E2\u05D9\u05DC", color: "bg-blue-500/20 text-blue-400" },
  preferred: { label: "\u05DE\u05D5\u05E2\u05D3\u05E3", color: "bg-emerald-500/20 text-emerald-400" },
  inactive: { label: "\u05DC\u05D0 \u05E4\u05E2\u05D9\u05DC", color: "bg-gray-500/20 text-gray-400" },
  probation: { label: "\u05DE\u05E8\u05D0\u05D4", color: "bg-red-500/20 text-red-400" },
};

function riskColor(score: number) {
  if (score <= 20) return "text-emerald-400";
  if (score <= 40) return "text-yellow-400";
  if (score <= 60) return "text-orange-400";
  return "text-red-400";
}

function riskBg(score: number) {
  if (score <= 20) return "bg-emerald-500";
  if (score <= 40) return "bg-yellow-500";
  if (score <= 60) return "bg-orange-500";
  return "bg-red-500";
}

function perfColor(val: number) {
  if (val >= 90) return "bg-emerald-500";
  if (val >= 75) return "bg-blue-500";
  if (val >= 60) return "bg-yellow-500";
  return "bg-red-500";
}

export default function ForeignSuppliers() {
  const { data: suppliers = FALLBACK_SUPPLIERS } = useQuery({
    queryKey: ["import-suppliers"],
    queryFn: async () => {
      const res = await authFetch("/api/import/foreign-suppliers/suppliers");
      if (!res.ok) return FALLBACK_SUPPLIERS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_SUPPLIERS;
    },
    staleTime: 30_000,
    retry: 1,
  });


  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");

  const totalSuppliers = suppliers.length;
  const activeCount = suppliers.filter(s => s.status === "active" || s.status === "preferred").length;
  const countries = new Set(suppliers.map(s => s.countryCode)).size;
  const avgLead = Math.round(suppliers.reduce((a, s) => a + s.leadTime, 0) / totalSuppliers);
  const avgRisk = Math.round(suppliers.reduce((a, s) => a + s.riskScore, 0) / totalSuppliers);
  const preferredCount = suppliers.filter(s => s.status === "preferred").length;

  const filtered = suppliers.filter(s => {
    const matchSearch = !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.code.toLowerCase().includes(search.toLowerCase()) || s.country.includes(search);
    if (tab === "preferred") return matchSearch && s.status === "preferred";
    if (tab === "risk") return matchSearch && s.riskScore >= 40;
    return matchSearch;
  });

  const byCountry = suppliers.reduce<Record<string, Supplier[]>>((acc, s) => {
    (acc[s.country] = acc[s.country] || []).push(s);
    return acc;
  }, {});

  const SupplierTable = ({ data }: { data: Supplier[] }) => (
    <Table>
      <TableHeader>
        <TableRow className="border-gray-700">
          <TableHead className="text-right text-gray-400">\u05E7\u05D5\u05D3</TableHead>
          <TableHead className="text-right text-gray-400">\u05E9\u05DD \u05E1\u05E4\u05E7</TableHead>
          <TableHead className="text-right text-gray-400">\u05DE\u05D3\u05D9\u05E0\u05D4</TableHead>
          <TableHead className="text-right text-gray-400">\u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D4</TableHead>
          <TableHead className="text-right text-gray-400">Incoterm</TableHead>
          <TableHead className="text-right text-gray-400">\u05DE\u05D8\u05D1\u05E2</TableHead>
          <TableHead className="text-right text-gray-400">Lead Time</TableHead>
          <TableHead className="text-right text-gray-400">\u05E1\u05D9\u05DB\u05D5\u05DF</TableHead>
          <TableHead className="text-right text-gray-400">\u05D1\u05D9\u05E6\u05D5\u05E2\u05D9\u05DD</TableHead>
          <TableHead className="text-right text-gray-400">\u05E1\u05D8\u05D0\u05D8\u05D5\u05E1</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map(s => (
          <TableRow key={s.code} className="border-gray-700/50 hover:bg-gray-800/50">
            <TableCell className="font-mono text-xs text-gray-400">{s.code}</TableCell>
            <TableCell className="font-semibold text-gray-100">{s.name}</TableCell>
            <TableCell>
              <span className="flex items-center gap-1.5">
                <span className="text-base">{FLAG[s.countryCode]}</span>
                <span className="text-gray-300">{s.country}</span>
              </span>
            </TableCell>
            <TableCell className="text-gray-300">{s.category}</TableCell>
            <TableCell><Badge variant="outline" className="border-gray-600 text-gray-300">{s.incoterm}</Badge></TableCell>
            <TableCell className="text-gray-300">{s.currency}</TableCell>
            <TableCell className="text-gray-300">{s.leadTime} \u05D9\u05DE\u05D9\u05DD</TableCell>
            <TableCell>
              <div className="flex items-center gap-2 min-w-[100px]">
                <span className={`font-bold text-sm ${riskColor(s.riskScore)}`}>{s.riskScore}</span>
                <MiniBar value={s.riskScore} colorClass={riskBg(s.riskScore)} />
              </div>
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-2 min-w-[100px]">
                <span className="font-bold text-sm text-gray-200">{s.performance}%</span>
                <MiniBar value={s.performance} colorClass={perfColor(s.performance)} />
              </div>
            </TableCell>
            <TableCell><Badge className={statusConfig[s.status].color}>{statusConfig[s.status].label}</Badge></TableCell>
          </TableRow>
        ))}
        {data.length === 0 && (
          <TableRow><TableCell colSpan={10} className="text-center py-8 text-gray-500">\u05DC\u05D0 \u05E0\u05DE\u05E6\u05D0\u05D5 \u05E1\u05E4\u05E7\u05D9\u05DD</TableCell></TableRow>
        )}
      </TableBody>
    </Table>
  );

  return (
    <div className="p-6 space-y-6 bg-gray-950 min-h-screen text-gray-100" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Globe className="h-7 w-7 text-blue-400" />
          \u05E1\u05E4\u05E7\u05D9 \u05D7\u05D5\u05F4\u05DC
        </h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="\u05D7\u05D9\u05E4\u05D5\u05E9 \u05E1\u05E4\u05E7..."
              className="bg-gray-800 border border-gray-700 rounded-lg pr-9 pl-4 py-2 text-sm text-gray-200 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 w-64"
            />
          </div>
          <button className="flex items-center gap-1.5 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-gray-700">
            <Filter className="h-4 w-4" /> \u05E1\u05D9\u05E0\u05D5\u05DF
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="pt-5 text-center">
            <Users className="h-5 w-5 mx-auto text-blue-400 mb-1" />
            <p className="text-xs text-gray-500">\u05E1\u05D4\u05F4\u05DB \u05E1\u05E4\u05E7\u05D9\u05DD</p>
            <p className="text-2xl font-bold text-gray-100">{totalSuppliers}</p>
          </CardContent>
        </Card>
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="pt-5 text-center">
            <TrendingUp className="h-5 w-5 mx-auto text-emerald-400 mb-1" />
            <p className="text-xs text-gray-500">\u05E4\u05E2\u05D9\u05DC\u05D9\u05DD</p>
            <p className="text-2xl font-bold text-emerald-400">{activeCount}</p>
          </CardContent>
        </Card>
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="pt-5 text-center">
            <MapPin className="h-5 w-5 mx-auto text-purple-400 mb-1" />
            <p className="text-xs text-gray-500">\u05DE\u05D3\u05D9\u05E0\u05D5\u05EA</p>
            <p className="text-2xl font-bold text-purple-400">{countries}</p>
          </CardContent>
        </Card>
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="pt-5 text-center">
            <Clock className="h-5 w-5 mx-auto text-amber-400 mb-1" />
            <p className="text-xs text-gray-500">Lead Time \u05DE\u05DE\u05D5\u05E6\u05E2</p>
            <p className="text-2xl font-bold text-amber-400">{avgLead} <span className="text-sm font-normal">\u05D9\u05DE\u05D9\u05DD</span></p>
          </CardContent>
        </Card>
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="pt-5 text-center">
            <ShieldAlert className="h-5 w-5 mx-auto text-orange-400 mb-1" />
            <p className="text-xs text-gray-500">\u05E1\u05D9\u05DB\u05D5\u05DF \u05DE\u05DE\u05D5\u05E6\u05E2</p>
            <p className={`text-2xl font-bold ${riskColor(avgRisk)}`}>{avgRisk}</p>
          </CardContent>
        </Card>
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="pt-5 text-center">
            <Star className="h-5 w-5 mx-auto text-yellow-400 mb-1" />
            <p className="text-xs text-gray-500">\u05DE\u05D5\u05E2\u05D3\u05E4\u05D9\u05DD</p>
            <p className="text-2xl font-bold text-yellow-400">{preferredCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs + Table */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-gray-900 border border-gray-800">
          <TabsTrigger value="all" className="data-[state=active]:bg-gray-700 data-[state=active]:text-white text-gray-400">\u05DB\u05DC \u05D4\u05E1\u05E4\u05E7\u05D9\u05DD</TabsTrigger>
          <TabsTrigger value="preferred" className="data-[state=active]:bg-gray-700 data-[state=active]:text-white text-gray-400">\u05DE\u05D5\u05E2\u05D3\u05E4\u05D9\u05DD</TabsTrigger>
          <TabsTrigger value="country" className="data-[state=active]:bg-gray-700 data-[state=active]:text-white text-gray-400">\u05DC\u05E4\u05D9 \u05DE\u05D3\u05D9\u05E0\u05D4</TabsTrigger>
          <TabsTrigger value="risk" className="data-[state=active]:bg-gray-700 data-[state=active]:text-white text-gray-400">\u05E1\u05D9\u05DB\u05D5\u05DF</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4">
          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="p-0">
              <SupplierTable data={filtered} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preferred" className="mt-4">
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg text-gray-200 flex items-center gap-2">
                <Star className="h-5 w-5 text-yellow-400" /> \u05E1\u05E4\u05E7\u05D9\u05DD \u05DE\u05D5\u05E2\u05D3\u05E4\u05D9\u05DD
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <SupplierTable data={filtered} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="country" className="mt-4 space-y-4">
          {Object.entries(byCountry).map(([country, sups]) => (
            <Card key={country} className="bg-gray-900 border-gray-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg text-gray-200 flex items-center gap-2">
                  <span className="text-xl">{FLAG[sups[0].countryCode]}</span> {country}
                  <Badge variant="outline" className="border-gray-600 text-gray-400 mr-2">{sups.length} \u05E1\u05E4\u05E7\u05D9\u05DD</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <SupplierTable data={sups} />
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="risk" className="mt-4">
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg text-gray-200 flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-orange-400" /> \u05E1\u05E4\u05E7\u05D9\u05DD \u05D1\u05E1\u05D9\u05DB\u05D5\u05DF \u05D2\u05D1\u05D5\u05D4 (40+)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <SupplierTable data={filtered} />
            </CardContent>
          </Card>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            {filtered.map(s => (
              <Card key={s.code} className="bg-gray-900 border-gray-800">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{FLAG[s.countryCode]}</span>
                      <span className="font-semibold text-gray-100">{s.name}</span>
                    </div>
                    <span className={`text-xl font-bold ${riskColor(s.riskScore)}`}>{s.riskScore}</span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between text-gray-400">
                      <span>\u05D3\u05D9\u05E8\u05D5\u05D2 \u05E1\u05D9\u05DB\u05D5\u05DF</span>
                      <div className="h-2 w-32 rounded-full bg-gray-700 overflow-hidden">
                        <div className={`h-full rounded-full ${riskBg(s.riskScore)}`} style={{ width: `${s.riskScore}%` }} />
                      </div>
                    </div>
                    <div className="flex justify-between text-gray-400">
                      <span>\u05D1\u05D9\u05E6\u05D5\u05E2\u05D9\u05DD</span>
                      <span className="text-gray-200">{s.performance}%</span>
                    </div>
                    <div className="flex justify-between text-gray-400">
                      <span>Lead Time</span>
                      <span className="text-gray-200">{s.leadTime} \u05D9\u05DE\u05D9\u05DD</span>
                    </div>
                    <div className="flex justify-between text-gray-400">
                      <span>\u05D4\u05D6\u05DE\u05E0\u05D4 \u05D0\u05D7\u05E8\u05D5\u05E0\u05D4</span>
                      <span className="text-gray-200">{s.lastOrder}</span>
                    </div>
                    <div className="flex justify-between text-gray-400">
                      <span>\u05DE\u05D8\u05D1\u05E2</span>
                      <span className="text-gray-200">{s.currency}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Summary Footer */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="pt-4 text-center">
            <p className="text-xs text-gray-500">\u05E1\u05D4\u05F4\u05DB \u05D4\u05D6\u05DE\u05E0\u05D5\u05EA</p>
            <p className="text-xl font-bold text-gray-100">{suppliers.reduce((a, s) => a + s.totalOrders, 0)}</p>
          </CardContent>
        </Card>
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="pt-4 text-center">
            <p className="text-xs text-gray-500">\u05DE\u05D8\u05D1\u05E2\u05D5\u05EA</p>
            <p className="text-xl font-bold text-gray-100">EUR / USD / NOK</p>
          </CardContent>
        </Card>
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="pt-4 text-center">
            <p className="text-xs text-gray-500">\u05D1\u05D9\u05E6\u05D5\u05E2\u05D9\u05DD \u05DE\u05DE\u05D5\u05E6\u05E2</p>
            <p className="text-xl font-bold text-emerald-400">{Math.round(suppliers.reduce((a, s) => a + s.performance, 0) / totalSuppliers)}%</p>
          </CardContent>
        </Card>
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="pt-4 text-center">
            <p className="text-xs text-gray-500">\u05E2\u05D3\u05DB\u05D5\u05DF \u05D0\u05D7\u05E8\u05D5\u05DF</p>
            <p className="text-xl font-bold text-gray-100">2026-04-07</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
