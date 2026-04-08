import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { translateStatus } from "@/lib/status-labels";
import {
  Shield, Search, Plus, Edit2, Trash2, X, Save, AlertTriangle,
  HardHat, BookOpen, Clock, CheckCircle2, AlertCircle, Download,
  Filter, Calendar, Users, TrendingUp, Activity, Eye,
  ChevronLeft, ChevronRight, ArrowUpDown, Flame, Zap,
  Droplets, Wind, Skull, Truck, Wrench, HeartPulse
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");
const token = () => localStorage.getItem("erp_token") || "";
const headers = () => ({ Authorization: `Bearer ${token()}`, "Content-Type": "application/json" });

// 10 incident types
const FALLBACK_INCIDENT_TYPES = [
  { value: "slip_fall", label: "\u05D4\u05D7\u05DC\u05E7\u05D4/\u05E0\u05E4\u05D9\u05DC\u05D4", icon: AlertTriangle },
  { value: "machinery", label: "\u05EA\u05D0\u05D5\u05E0\u05EA \u05DE\u05DB\u05D5\u05E0\u05D5\u05EA", icon: Wrench },
  { value: "fire", label: "\u05E9\u05E8\u05D9\u05E4\u05D4/\u05E4\u05D9\u05E6\u05D5\u05E5", icon: Flame },
  { value: "electrical", label: "\u05D7\u05E9\u05DE\u05DC\u05D9", icon: Zap },
  { value: "chemical", label: "\u05D7\u05D5\u05DE\u05E8\u05D9\u05DD \u05DE\u05E1\u05D5\u05DB\u05E0\u05D9\u05DD", icon: Droplets },
  { value: "ergonomic", label: "\u05D0\u05E8\u05D2\u05D5\u05E0\u05D5\u05DE\u05D9", icon: HeartPulse },
  { value: "vehicle", label: "\u05EA\u05D0\u05D5\u05E0\u05EA \u05E8\u05DB\u05D1", icon: Truck },
  { value: "noise", label: "\u05E8\u05E2\u05E9", icon: Wind },
  { value: "hazmat", label: "\u05D7\u05D5\u05DE\u05E8\u05D9\u05DD \u05DE\u05E1\u05D5\u05DB\u05E0\u05D9\u05DD", icon: Skull },
  { value: "other", label: "\u05D0\u05D7\u05E8", icon: AlertCircle },
];

// 5 severity levels
const severityLevels = [
  { value: "negligible", label: "\u05D6\u05E0\u05D9\u05D7", color: "bg-gray-100 text-gray-800" },
  { value: "low", label: "\u05E0\u05DE\u05D5\u05DA", color: "bg-blue-100 text-blue-800" },
  { value: "medium", label: "\u05D1\u05D9\u05E0\u05D5\u05E0\u05D9", color: "bg-yellow-100 text-yellow-800" },
  { value: "high", label: "\u05D2\u05D1\u05D5\u05D4", color: "bg-orange-100 text-orange-800" },
  { value: "critical", label: "\u05E7\u05E8\u05D9\u05D8\u05D9", color: "bg-red-100 text-red-800" },
];

const conditionOptions = ["\u05EA\u05E7\u05D9\u05DF", "\u05D8\u05D5\u05D1", "\u05D1\u05D9\u05E0\u05D5\u05E0\u05D9", "\u05D3\u05D5\u05E8\u05E9 \u05EA\u05D9\u05E7\u05D5\u05DF", "\u05DC\u05D0 \u05EA\u05E7\u05D9\u05DF"];
const trainingTypes = ["\u05D1\u05D8\u05D9\u05D7\u05D5\u05EA \u05DB\u05DC\u05DC\u05D9\u05EA", "\u05DB\u05D9\u05D1\u05D5\u05D9 \u05D0\u05E9", "\u05E2\u05D1\u05D5\u05D3\u05D4 \u05D1\u05D2\u05D5\u05D1\u05D4", "\u05E2\u05D6\u05E8\u05D4 \u05E8\u05D0\u05E9\u05D5\u05E0\u05D4", "\u05D7\u05D5\u05DE\u05E8\u05D9\u05DD \u05DE\u05E1\u05D5\u05DB\u05E0\u05D9\u05DD", "\u05E2\u05D1\u05D5\u05D3\u05D4 \u05D1\u05DE\u05DB\u05D5\u05E0\u05D5\u05EA", "\u05D0\u05E8\u05D2\u05D5\u05E0\u05D5\u05DE\u05D9\u05D4", "\u05D7\u05D9\u05E8\u05D5\u05DD"];

export default function HealthSafetyPage() {
  const { data: healthsafetyData } = useQuery({
    queryKey: ["health-safety"],
    queryFn: () => authFetch("/api/hr/health_safety"),
    staleTime: 5 * 60 * 1000,
  });

  const incidentTypes = healthsafetyData ?? FALLBACK_INCIDENT_TYPES;

  const [activeTab, setActiveTab] = useState("incidents");

  // Incidents state
  const [incidents, setIncidents] = useState<any[]>([]);
  const [incidentStats, setIncidentStats] = useState<any>({});
  const [incidentSearch, setIncidentSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [showIncidentForm, setShowIncidentForm] = useState(false);
  const [editIncident, setEditIncident] = useState<any>(null);
  const [incidentForm, setIncidentForm] = useState({
    incident_type: "slip_fall", severity: "low", incident_date: new Date().toISOString().slice(0, 16),
    location: "", department: "", reported_by: "", description: "", root_cause: "",
    corrective_actions: "", medical_treatment: false, days_lost: 0, status: "open",
  });

  // Equipment state
  const [equipment, setEquipment] = useState<any[]>([]);
  const [eqSearch, setEqSearch] = useState("");
  const [showEqForm, setShowEqForm] = useState(false);
  const [eqForm, setEqForm] = useState({
    equipment_name: "", equipment_type: "", serial_number: "", location: "",
    department: "", assigned_to: "", condition: "\u05EA\u05E7\u05D9\u05DF", next_inspection: "", status: "active",
  });

  // Training state
  const [training, setTraining] = useState<any[]>([]);
  const [trainSearch, setTrainSearch] = useState("");
  const [showTrainForm, setShowTrainForm] = useState(false);
  const [trainForm, setTrainForm] = useState({
    training_name: "", training_type: "\u05D1\u05D8\u05D9\u05D7\u05D5\u05EA \u05DB\u05DC\u05DC\u05D9\u05EA", employee_name: "",
    department: "", trainer: "", training_date: "", expiry_date: "",
    duration_hours: 0, score: 0, passed: true, status: "completed",
  });

  const [loading, setLoading] = useState(true);

  const fetchIncidents = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (incidentSearch) params.set("search", incidentSearch);
      if (severityFilter) params.set("status", severityFilter);
      const [res, statsRes] = await Promise.all([
        fetch(`${API}/hr-sap/safety_incidents?${params}`, { headers: headers() }),
        fetch(`${API}/hr-sap/safety_incidents/stats`, { headers: headers() }),
      ]);
      setIncidents(safeArray(await res.json()));
      setIncidentStats(await statsRes.json());
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const fetchEquipment = async () => {
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (eqSearch) params.set("search", eqSearch);
      const res = await fetch(`${API}/hr-sap/safety_equipment?${params}`, { headers: headers() });
      setEquipment(safeArray(await res.json()));
    } catch (err) { console.error(err); }
  };

  const fetchTraining = async () => {
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (trainSearch) params.set("search", trainSearch);
      const res = await fetch(`${API}/hr-sap/safety_training_log?${params}`, { headers: headers() });
      setTraining(safeArray(await res.json()));
    } catch (err) { console.error(err); }
  };

  useEffect(() => { fetchIncidents(); fetchEquipment(); fetchTraining(); }, []);
  useEffect(() => { fetchIncidents(); }, [incidentSearch, severityFilter]);
  useEffect(() => { fetchEquipment(); }, [eqSearch]);
  useEffect(() => { fetchTraining(); }, [trainSearch]);

  const saveIncident = async () => {
    const method = editIncident ? "PUT" : "POST";
    const url = editIncident ? `${API}/hr-sap/safety_incidents/${editIncident.id}` : `${API}/hr-sap/safety_incidents`;
    await fetch(url, { method, headers: headers(), body: JSON.stringify(incidentForm) });
    setShowIncidentForm(false); setEditIncident(null);
    fetchIncidents();
  };

  const saveEquipment = async () => {
    await fetch(`${API}/hr-sap/safety_equipment`, { method: "POST", headers: headers(), body: JSON.stringify(eqForm) });
    setShowEqForm(false); fetchEquipment();
  };

  const saveTraining = async () => {
    await fetch(`${API}/hr-sap/safety_training_log`, { method: "POST", headers: headers(), body: JSON.stringify(trainForm) });
    setShowTrainForm(false); fetchTraining();
  };

  const deleteItem = async (table: string, id: number, refresh: () => void) => {
    if (!confirm("\u05D4\u05D0\u05DD \u05DC\u05DE\u05D7\u05D5\u05E7?")) return;
    await fetch(`${API}/hr-sap/${table}/${id}`, { method: "DELETE", headers: headers() });
    refresh();
  };

  return (
    <div dir="rtl" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">\u05D1\u05E8\u05D9\u05D0\u05D5\u05EA \u05D5\u05D1\u05D8\u05D9\u05D7\u05D5\u05EA</h1>
          <p className="text-gray-500">\u05E0\u05D9\u05D4\u05D5\u05DC \u05D0\u05D9\u05E8\u05D5\u05E2\u05D9\u05DD, \u05E6\u05D9\u05D5\u05D3 \u05D5\u05D4\u05DB\u05E9\u05E8\u05D5\u05EA</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div><p className="text-sm text-gray-500">\u05D0\u05D9\u05E8\u05D5\u05E2\u05D9\u05DD \u05E4\u05EA\u05D5\u05D7\u05D9\u05DD</p><p className="text-2xl font-bold text-red-600">{incidentStats.byStatus?.find((s: any) => s.status === "open")?.count || 0}</p></div>
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div><p className="text-sm text-gray-500">\u05E1\u05D4"\u05DB \u05D0\u05D9\u05E8\u05D5\u05E2\u05D9\u05DD</p><p className="text-2xl font-bold">{fmt(incidentStats.total)}</p></div>
            <Shield className="w-8 h-8 text-blue-500" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div><p className="text-sm text-gray-500">\u05E6\u05D9\u05D5\u05D3 \u05E4\u05E2\u05D9\u05DC</p><p className="text-2xl font-bold">{fmt(equipment.length)}</p></div>
            <HardHat className="w-8 h-8 text-yellow-500" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div><p className="text-sm text-gray-500">\u05D4\u05DB\u05E9\u05E8\u05D5\u05EA</p><p className="text-2xl font-bold">{fmt(training.length)}</p></div>
            <BookOpen className="w-8 h-8 text-green-500" />
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="incidents"><AlertTriangle className="w-4 h-4 ml-1" />\u05D0\u05D9\u05E8\u05D5\u05E2\u05D9\u05DD</TabsTrigger>
          <TabsTrigger value="equipment"><HardHat className="w-4 h-4 ml-1" />\u05E6\u05D9\u05D5\u05D3</TabsTrigger>
          <TabsTrigger value="training"><BookOpen className="w-4 h-4 ml-1" />\u05D4\u05DB\u05E9\u05E8\u05D5\u05EA</TabsTrigger>
        </TabsList>

        {/* Incidents Tab */}
        <TabsContent value="incidents" className="space-y-4">
          <div className="flex gap-3 items-center">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
              <Input placeholder="\u05D7\u05D9\u05E4\u05D5\u05E9 \u05D0\u05D9\u05E8\u05D5\u05E2\u05D9\u05DD..." value={incidentSearch} onChange={e => setIncidentSearch(e.target.value)} className="pr-9" />
            </div>
            <select className="border rounded-md px-3 py-2 text-sm" value={severityFilter} onChange={e => setSeverityFilter(e.target.value)}>
              <option value="">\u05DB\u05DC \u05D4\u05D7\u05D5\u05DE\u05E8\u05D5\u05EA</option>
              {severityLevels.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <Button onClick={() => { setEditIncident(null); setShowIncidentForm(true); }}>
              <Plus className="w-4 h-4 ml-1" />\u05D3\u05D9\u05D5\u05D5\u05D7 \u05D0\u05D9\u05E8\u05D5\u05E2
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-3 text-right">\u05E1\u05D5\u05D2</th>
                    <th className="p-3 text-right">\u05D7\u05D5\u05DE\u05E8\u05D4</th>
                    <th className="p-3 text-right">\u05EA\u05D0\u05E8\u05D9\u05DA</th>
                    <th className="p-3 text-right">\u05DE\u05D9\u05E7\u05D5\u05DD</th>
                    <th className="p-3 text-right">\u05DE\u05D7\u05DC\u05E7\u05D4</th>
                    <th className="p-3 text-right">\u05EA\u05D9\u05D0\u05D5\u05E8</th>
                    <th className="p-3 text-right">\u05D9\u05DE\u05D9 \u05D0\u05D5\u05D1\u05D3\u05DF</th>
                    <th className="p-3 text-right">\u05E1\u05D8\u05D8\u05D5\u05E1</th>
                    <th className="p-3 text-right">\u05E4\u05E2\u05D5\u05DC\u05D5\u05EA</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={9} className="p-8 text-center text-gray-400">\u05D8\u05D5\u05E2\u05DF...</td></tr>
                  ) : incidents.length === 0 ? (
                    <tr><td colSpan={9} className="p-8 text-center text-gray-400">\u05DC\u05D0 \u05E0\u05DE\u05E6\u05D0\u05D5 \u05D0\u05D9\u05E8\u05D5\u05E2\u05D9\u05DD</td></tr>
                  ) : incidents.map(inc => {
                    const typeInfo = incidentTypes.find(t => t.value === inc.incident_type);
                    const sevInfo = severityLevels.find(s => s.value === inc.severity);
                    return (
                      <tr key={inc.id} className="border-t hover:bg-gray-50">
                        <td className="p-3"><Badge variant="outline">{typeInfo?.label || inc.incident_type}</Badge></td>
                        <td className="p-3"><Badge className={sevInfo?.color || "bg-gray-100"}>{sevInfo?.label || inc.severity}</Badge></td>
                        <td className="p-3">{inc.incident_date ? new Date(inc.incident_date).toLocaleDateString("he-IL") : "-"}</td>
                        <td className="p-3">{inc.location || "-"}</td>
                        <td className="p-3">{inc.department || "-"}</td>
                        <td className="p-3 max-w-[200px] truncate">{inc.description}</td>
                        <td className="p-3">{inc.days_lost || 0}</td>
                        <td className="p-3"><Badge className={inc.status === "open" ? "bg-red-100 text-red-800" : inc.status === "investigating" ? "bg-yellow-100 text-yellow-800" : "bg-green-100 text-green-800"}>{translateStatus(inc.status)}</Badge></td>
                        <td className="p-3">
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" onClick={() => { setEditIncident(inc); setIncidentForm(inc); setShowIncidentForm(true); }}><Edit2 className="w-4 h-4" /></Button>
                            <Button variant="ghost" size="sm" onClick={() => deleteItem("safety_incidents", inc.id, fetchIncidents)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Equipment Tab */}
        <TabsContent value="equipment" className="space-y-4">
          <div className="flex gap-3 items-center">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
              <Input placeholder="\u05D7\u05D9\u05E4\u05D5\u05E9 \u05E6\u05D9\u05D5\u05D3..." value={eqSearch} onChange={e => setEqSearch(e.target.value)} className="pr-9" />
            </div>
            <Button onClick={() => setShowEqForm(true)}><Plus className="w-4 h-4 ml-1" />\u05E6\u05D9\u05D5\u05D3 \u05D7\u05D3\u05E9</Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-3 text-right">\u05E9\u05DD</th>
                    <th className="p-3 text-right">\u05E1\u05D5\u05D2</th>
                    <th className="p-3 text-right">\u05DE\u05E1\u05E4\u05E8 \u05E1\u05D9\u05D3\u05D5\u05E8\u05D9</th>
                    <th className="p-3 text-right">\u05DE\u05D9\u05E7\u05D5\u05DD</th>
                    <th className="p-3 text-right">\u05DE\u05E6\u05D1</th>
                    <th className="p-3 text-right">\u05D1\u05D3\u05D9\u05E7\u05D4 \u05D4\u05D1\u05D0\u05D4</th>
                    <th className="p-3 text-right">\u05E4\u05E2\u05D5\u05DC\u05D5\u05EA</th>
                  </tr>
                </thead>
                <tbody>
                  {equipment.length === 0 ? (
                    <tr><td colSpan={7} className="p-8 text-center text-gray-400">\u05DC\u05D0 \u05E0\u05DE\u05E6\u05D0 \u05E6\u05D9\u05D5\u05D3</td></tr>
                  ) : equipment.map(eq => (
                    <tr key={eq.id} className="border-t hover:bg-gray-50">
                      <td className="p-3 font-medium">{eq.equipment_name}</td>
                      <td className="p-3">{eq.equipment_type}</td>
                      <td className="p-3">{eq.serial_number || "-"}</td>
                      <td className="p-3">{eq.location || "-"}</td>
                      <td className="p-3"><Badge variant="outline">{eq.condition}</Badge></td>
                      <td className="p-3">{eq.next_inspection ? new Date(eq.next_inspection).toLocaleDateString("he-IL") : "-"}</td>
                      <td className="p-3">
                        <Button variant="ghost" size="sm" onClick={() => deleteItem("safety_equipment", eq.id, fetchEquipment)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Training Tab */}
        <TabsContent value="training" className="space-y-4">
          <div className="flex gap-3 items-center">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
              <Input placeholder="\u05D7\u05D9\u05E4\u05D5\u05E9 \u05D4\u05DB\u05E9\u05E8\u05D5\u05EA..." value={trainSearch} onChange={e => setTrainSearch(e.target.value)} className="pr-9" />
            </div>
            <Button onClick={() => setShowTrainForm(true)}><Plus className="w-4 h-4 ml-1" />\u05D4\u05DB\u05E9\u05E8\u05D4 \u05D7\u05D3\u05E9\u05D4</Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-3 text-right">\u05E9\u05DD \u05D4\u05DB\u05E9\u05E8\u05D4</th>
                    <th className="p-3 text-right">\u05E1\u05D5\u05D2</th>
                    <th className="p-3 text-right">\u05E2\u05D5\u05D1\u05D3</th>
                    <th className="p-3 text-right">\u05DE\u05D3\u05E8\u05D9\u05DA</th>
                    <th className="p-3 text-right">\u05EA\u05D0\u05E8\u05D9\u05DA</th>
                    <th className="p-3 text-right">\u05E6\u05D9\u05D5\u05DF</th>
                    <th className="p-3 text-right">\u05E2\u05D1\u05E8</th>
                    <th className="p-3 text-right">\u05E4\u05E2\u05D5\u05DC\u05D5\u05EA</th>
                  </tr>
                </thead>
                <tbody>
                  {training.length === 0 ? (
                    <tr><td colSpan={8} className="p-8 text-center text-gray-400">\u05DC\u05D0 \u05E0\u05DE\u05E6\u05D0\u05D5 \u05D4\u05DB\u05E9\u05E8\u05D5\u05EA</td></tr>
                  ) : training.map(t => (
                    <tr key={t.id} className="border-t hover:bg-gray-50">
                      <td className="p-3 font-medium">{t.training_name}</td>
                      <td className="p-3"><Badge variant="outline">{t.training_type}</Badge></td>
                      <td className="p-3">{t.employee_name || "-"}</td>
                      <td className="p-3">{t.trainer || "-"}</td>
                      <td className="p-3">{t.training_date ? new Date(t.training_date).toLocaleDateString("he-IL") : "-"}</td>
                      <td className="p-3">{t.score || "-"}</td>
                      <td className="p-3">{t.passed ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <X className="w-4 h-4 text-red-500" />}</td>
                      <td className="p-3">
                        <Button variant="ghost" size="sm" onClick={() => deleteItem("safety_training_log", t.id, fetchTraining)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Incident Form Modal */}
      {showIncidentForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{editIncident ? "\u05E2\u05E8\u05D9\u05DB\u05EA \u05D0\u05D9\u05E8\u05D5\u05E2" : "\u05D3\u05D9\u05D5\u05D5\u05D7 \u05D0\u05D9\u05E8\u05D5\u05E2 \u05D7\u05D3\u05E9"}</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => { setShowIncidentForm(false); setEditIncident(null); }}><X className="w-4 h-4" /></Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-sm font-medium">\u05E1\u05D5\u05D2 \u05D0\u05D9\u05E8\u05D5\u05E2 *</label>
                  <select className="w-full border rounded-md px-3 py-2 text-sm mt-1" value={incidentForm.incident_type} onChange={e => setIncidentForm({ ...incidentForm, incident_type: e.target.value })}>
                    {incidentTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div><label className="text-sm font-medium">\u05D7\u05D5\u05DE\u05E8\u05D4 *</label>
                  <select className="w-full border rounded-md px-3 py-2 text-sm mt-1" value={incidentForm.severity} onChange={e => setIncidentForm({ ...incidentForm, severity: e.target.value })}>
                    {severityLevels.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div><label className="text-sm font-medium">\u05EA\u05D0\u05E8\u05D9\u05DA \u05D5\u05E9\u05E2\u05D4 *</label><Input type="datetime-local" className="mt-1" value={incidentForm.incident_date} onChange={e => setIncidentForm({ ...incidentForm, incident_date: e.target.value })} /></div>
                <div><label className="text-sm font-medium">\u05DE\u05D9\u05E7\u05D5\u05DD</label><Input className="mt-1" value={incidentForm.location} onChange={e => setIncidentForm({ ...incidentForm, location: e.target.value })} /></div>
                <div><label className="text-sm font-medium">\u05DE\u05D7\u05DC\u05E7\u05D4</label><Input className="mt-1" value={incidentForm.department} onChange={e => setIncidentForm({ ...incidentForm, department: e.target.value })} /></div>
                <div><label className="text-sm font-medium">\u05DE\u05D3\u05D5\u05D5\u05D7</label><Input className="mt-1" value={incidentForm.reported_by} onChange={e => setIncidentForm({ ...incidentForm, reported_by: e.target.value })} /></div>
              </div>
              <div><label className="text-sm font-medium">\u05EA\u05D9\u05D0\u05D5\u05E8 *</label><textarea className="w-full border rounded-md px-3 py-2 text-sm mt-1" rows={3} value={incidentForm.description} onChange={e => setIncidentForm({ ...incidentForm, description: e.target.value })} /></div>
              <div><label className="text-sm font-medium">\u05E1\u05D9\u05D1\u05D4 \u05E9\u05D5\u05E8\u05E9\u05D9\u05EA</label><textarea className="w-full border rounded-md px-3 py-2 text-sm mt-1" rows={2} value={incidentForm.root_cause} onChange={e => setIncidentForm({ ...incidentForm, root_cause: e.target.value })} /></div>
              <div><label className="text-sm font-medium">\u05E4\u05E2\u05D5\u05DC\u05D5\u05EA \u05DE\u05EA\u05E7\u05E0\u05D5\u05EA</label><textarea className="w-full border rounded-md px-3 py-2 text-sm mt-1" rows={2} value={incidentForm.corrective_actions} onChange={e => setIncidentForm({ ...incidentForm, corrective_actions: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2"><input type="checkbox" checked={incidentForm.medical_treatment} onChange={e => setIncidentForm({ ...incidentForm, medical_treatment: e.target.checked })} /><label className="text-sm">\u05D8\u05D9\u05E4\u05D5\u05DC \u05E8\u05E4\u05D5\u05D0\u05D9</label></div>
                <div><label className="text-sm font-medium">\u05D9\u05DE\u05D9 \u05D0\u05D5\u05D1\u05D3\u05DF</label><Input type="number" className="mt-1" value={incidentForm.days_lost} onChange={e => setIncidentForm({ ...incidentForm, days_lost: +e.target.value })} /></div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => { setShowIncidentForm(false); setEditIncident(null); }}>\u05D1\u05D9\u05D8\u05D5\u05DC</Button>
                <Button onClick={saveIncident}><Save className="w-4 h-4 ml-1" />\u05E9\u05DE\u05D9\u05E8\u05D4</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Equipment Form Modal */}
      {showEqForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>\u05E6\u05D9\u05D5\u05D3 \u05D7\u05D3\u05E9</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setShowEqForm(false)}><X className="w-4 h-4" /></Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div><label className="text-sm font-medium">\u05E9\u05DD \u05E6\u05D9\u05D5\u05D3 *</label><Input className="mt-1" value={eqForm.equipment_name} onChange={e => setEqForm({ ...eqForm, equipment_name: e.target.value })} /></div>
              <div><label className="text-sm font-medium">\u05E1\u05D5\u05D2 *</label><Input className="mt-1" value={eqForm.equipment_type} onChange={e => setEqForm({ ...eqForm, equipment_type: e.target.value })} /></div>
              <div><label className="text-sm font-medium">\u05DE\u05E1\u05E4\u05E8 \u05E1\u05D9\u05D3\u05D5\u05E8\u05D9</label><Input className="mt-1" value={eqForm.serial_number} onChange={e => setEqForm({ ...eqForm, serial_number: e.target.value })} /></div>
              <div><label className="text-sm font-medium">\u05DE\u05D9\u05E7\u05D5\u05DD</label><Input className="mt-1" value={eqForm.location} onChange={e => setEqForm({ ...eqForm, location: e.target.value })} /></div>
              <div><label className="text-sm font-medium">\u05DE\u05E6\u05D1</label>
                <select className="w-full border rounded-md px-3 py-2 text-sm mt-1" value={eqForm.condition} onChange={e => setEqForm({ ...eqForm, condition: e.target.value })}>
                  {conditionOptions.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div><label className="text-sm font-medium">\u05D1\u05D3\u05D9\u05E7\u05D4 \u05D4\u05D1\u05D0\u05D4</label><Input type="date" className="mt-1" value={eqForm.next_inspection} onChange={e => setEqForm({ ...eqForm, next_inspection: e.target.value })} /></div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowEqForm(false)}>\u05D1\u05D9\u05D8\u05D5\u05DC</Button>
                <Button onClick={saveEquipment}><Save className="w-4 h-4 ml-1" />\u05E9\u05DE\u05D9\u05E8\u05D4</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Training Form Modal */}
      {showTrainForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>\u05D4\u05DB\u05E9\u05E8\u05D4 \u05D7\u05D3\u05E9\u05D4</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setShowTrainForm(false)}><X className="w-4 h-4" /></Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div><label className="text-sm font-medium">\u05E9\u05DD \u05D4\u05DB\u05E9\u05E8\u05D4 *</label><Input className="mt-1" value={trainForm.training_name} onChange={e => setTrainForm({ ...trainForm, training_name: e.target.value })} /></div>
              <div><label className="text-sm font-medium">\u05E1\u05D5\u05D2</label>
                <select className="w-full border rounded-md px-3 py-2 text-sm mt-1" value={trainForm.training_type} onChange={e => setTrainForm({ ...trainForm, training_type: e.target.value })}>
                  {trainingTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div><label className="text-sm font-medium">\u05E9\u05DD \u05E2\u05D5\u05D1\u05D3</label><Input className="mt-1" value={trainForm.employee_name} onChange={e => setTrainForm({ ...trainForm, employee_name: e.target.value })} /></div>
              <div><label className="text-sm font-medium">\u05DE\u05D3\u05E8\u05D9\u05DA</label><Input className="mt-1" value={trainForm.trainer} onChange={e => setTrainForm({ ...trainForm, trainer: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-sm font-medium">\u05EA\u05D0\u05E8\u05D9\u05DA *</label><Input type="date" className="mt-1" value={trainForm.training_date} onChange={e => setTrainForm({ ...trainForm, training_date: e.target.value })} /></div>
                <div><label className="text-sm font-medium">\u05E6\u05D9\u05D5\u05DF</label><Input type="number" className="mt-1" value={trainForm.score} onChange={e => setTrainForm({ ...trainForm, score: +e.target.value })} /></div>
              </div>
              <div className="flex items-center gap-2"><input type="checkbox" checked={trainForm.passed} onChange={e => setTrainForm({ ...trainForm, passed: e.target.checked })} /><label className="text-sm">\u05E2\u05D1\u05E8 \u05D1\u05D4\u05E6\u05DC\u05D7\u05D4</label></div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowTrainForm(false)}>\u05D1\u05D9\u05D8\u05D5\u05DC</Button>
                <Button onClick={saveTraining}><Save className="w-4 h-4 ml-1" />\u05E9\u05DE\u05D9\u05E8\u05D4</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
