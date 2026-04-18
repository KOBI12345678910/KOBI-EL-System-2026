import { useState, useEffect } from "react";
import {
  BookOpen, Search, Plus, Edit2, Trash2, X, Save, Star, Award,
  TrendingUp, Users, BarChart3, Download, Filter, AlertTriangle,
  Target, ChevronLeft, ChevronRight, ArrowUpDown, CheckCircle2,
  Layers, Brain, Zap
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

const categories = ["\u05D8\u05DB\u05E0\u05D9", "\u05E0\u05D9\u05D4\u05D5\u05DC\u05D9", "\u05D1\u05D9\u05E0\u05D0\u05D9\u05E9\u05D9", "\u05DE\u05E7\u05E6\u05D5\u05E2\u05D9", "\u05D0\u05D9\u05DB\u05D5\u05EA", "\u05D1\u05D8\u05D9\u05D7\u05D5\u05EA", "\u05EA\u05E7\u05E9\u05D5\u05E8\u05EA", "\u05DE\u05E0\u05D4\u05D9\u05D2\u05D5\u05EA"];
const profLevels = [
  { level: 1, label: "\u05DE\u05EA\u05D7\u05D9\u05DC", color: "bg-red-100 text-red-800" },
  { level: 2, label: "\u05D1\u05E1\u05D9\u05E1\u05D9", color: "bg-orange-100 text-orange-800" },
  { level: 3, label: "\u05D1\u05D9\u05E0\u05D5\u05E0\u05D9", color: "bg-yellow-100 text-yellow-800" },
  { level: 4, label: "\u05DE\u05EA\u05E7\u05D3\u05DD", color: "bg-blue-100 text-blue-800" },
  { level: 5, label: "\u05DE\u05D5\u05DE\u05D7\u05D4", color: "bg-green-100 text-green-800" },
];

export default function SkillsMatrixPage() {
  const [activeTab, setActiveTab] = useState("catalog");
  // Catalog
  const [skills, setSkills] = useState<any[]>([]);
  const [skillsStats, setSkillsStats] = useState<any>({});
  const [skillSearch, setSkillSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [showSkillForm, setShowSkillForm] = useState(false);
  const [editSkill, setEditSkill] = useState<any>(null);
  const [skillForm, setSkillForm] = useState({ skill_name: "", category: "", description: "", is_critical: false, department: "" });

  // Assessments
  const [assessments, setAssessments] = useState<any[]>([]);
  const [assessSearch, setAssessSearch] = useState("");
  const [showAssessForm, setShowAssessForm] = useState(false);
  const [assessForm, setAssessForm] = useState({ employee_name: "", skill_name: "", current_level: 1, target_level: 3, assessed_by: "", certification: "", notes: "" });

  // Gap analysis
  const [gapData, setGapData] = useState<any>({ gaps: [], summary: [] });
  const [loading, setLoading] = useState(true);

  const fetchCatalog = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (skillSearch) params.set("search", skillSearch);
      if (catFilter) params.set("department", catFilter);
      const [res, statsRes] = await Promise.all([
        fetch(`${API}/hr-sap/skills_catalog?${params}`, { headers: headers() }),
        fetch(`${API}/hr-sap/skills_catalog/stats`, { headers: headers() }),
      ]);
      const data = await res.json();
      setSkills(safeArray(data));
      setSkillsStats(await statsRes.json());
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const fetchAssessments = async () => {
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (assessSearch) params.set("search", assessSearch);
      const res = await fetch(`${API}/hr-sap/employee_skills?${params}`, { headers: headers() });
      const data = await res.json();
      setAssessments(safeArray(data));
    } catch (err) { console.error(err); }
  };

  const fetchGaps = async () => {
    try {
      const res = await fetch(`${API}/hr-sap/skills-gap`, { headers: headers() });
      setGapData(await res.json());
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    fetchCatalog();
    fetchAssessments();
    fetchGaps();
  }, []);

  useEffect(() => { fetchCatalog(); }, [skillSearch, catFilter]);
  useEffect(() => { fetchAssessments(); }, [assessSearch]);

  const saveSkill = async () => {
    const method = editSkill ? "PUT" : "POST";
    const url = editSkill ? `${API}/hr-sap/skills_catalog/${editSkill.id}` : `${API}/hr-sap/skills_catalog`;
    await fetch(url, { method, headers: headers(), body: JSON.stringify(skillForm) });
    setShowSkillForm(false); setEditSkill(null);
    setSkillForm({ skill_name: "", category: "", description: "", is_critical: false, department: "" });
    fetchCatalog();
  };

  const saveAssess = async () => {
    await fetch(`${API}/hr-sap/employee_skills`, { method: "POST", headers: headers(), body: JSON.stringify(assessForm) });
    setShowAssessForm(false);
    setAssessForm({ employee_name: "", skill_name: "", current_level: 1, target_level: 3, assessed_by: "", certification: "", notes: "" });
    fetchAssessments(); fetchGaps();
  };

  const deleteSkill = async (id: number) => {
    if (!confirm("\u05D4\u05D0\u05DD \u05DC\u05DE\u05D7\u05D5\u05E7?")) return;
    await fetch(`${API}/hr-sap/skills_catalog/${id}`, { method: "DELETE", headers: headers() });
    fetchCatalog();
  };

  return (
    <div dir="rtl" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">\u05DE\u05D8\u05E8\u05D9\u05E6\u05EA \u05DB\u05D9\u05E9\u05D5\u05E8\u05D9\u05DD</h1>
          <p className="text-gray-500">\u05E7\u05D8\u05DC\u05D5\u05D2 \u05DB\u05D9\u05E9\u05D5\u05E8\u05D9\u05DD, \u05D4\u05E2\u05E8\u05DB\u05D5\u05EA \u05D5\u05E0\u05D9\u05EA\u05D5\u05D7 \u05E4\u05E2\u05E8\u05D9\u05DD</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">\u05DB\u05D9\u05E9\u05D5\u05E8\u05D9\u05DD \u05D1\u05E7\u05D8\u05DC\u05D5\u05D2</p>
              <p className="text-2xl font-bold">{fmt(skillsStats.total)}</p>
            </div>
            <BookOpen className="w-8 h-8 text-blue-500" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">\u05D4\u05E2\u05E8\u05DB\u05D5\u05EA</p>
              <p className="text-2xl font-bold">{fmt(assessments.length)}</p>
            </div>
            <Award className="w-8 h-8 text-green-500" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">\u05E4\u05E2\u05E8\u05D9\u05DD</p>
              <p className="text-2xl font-bold">{fmt(gapData.total)}</p>
            </div>
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">\u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D5\u05EA</p>
              <p className="text-2xl font-bold">{categories.length}</p>
            </div>
            <Layers className="w-8 h-8 text-purple-500" />
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="catalog"><BookOpen className="w-4 h-4 ml-1" />\u05E7\u05D8\u05DC\u05D5\u05D2 \u05DB\u05D9\u05E9\u05D5\u05E8\u05D9\u05DD</TabsTrigger>
          <TabsTrigger value="assessments"><Award className="w-4 h-4 ml-1" />\u05D4\u05E2\u05E8\u05DB\u05D5\u05EA</TabsTrigger>
          <TabsTrigger value="gap"><BarChart3 className="w-4 h-4 ml-1" />\u05E0\u05D9\u05EA\u05D5\u05D7 \u05E4\u05E2\u05E8\u05D9\u05DD</TabsTrigger>
        </TabsList>

        {/* Catalog Tab */}
        <TabsContent value="catalog" className="space-y-4">
          <div className="flex gap-3 items-center">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
              <Input placeholder="\u05D7\u05D9\u05E4\u05D5\u05E9 \u05DB\u05D9\u05E9\u05D5\u05E8..." value={skillSearch} onChange={e => setSkillSearch(e.target.value)} className="pr-9" />
            </div>
            <select className="border rounded-md px-3 py-2 text-sm" value={catFilter} onChange={e => setCatFilter(e.target.value)}>
              <option value="">\u05DB\u05DC \u05D4\u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D5\u05EA</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <Button onClick={() => { setEditSkill(null); setSkillForm({ skill_name: "", category: "", description: "", is_critical: false, department: "" }); setShowSkillForm(true); }}>
              <Plus className="w-4 h-4 ml-1" />\u05DB\u05D9\u05E9\u05D5\u05E8 \u05D7\u05D3\u05E9
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-3 text-right">\u05E9\u05DD \u05DB\u05D9\u05E9\u05D5\u05E8</th>
                    <th className="p-3 text-right">\u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D4</th>
                    <th className="p-3 text-right">\u05EA\u05D9\u05D0\u05D5\u05E8</th>
                    <th className="p-3 text-right">\u05E7\u05E8\u05D9\u05D8\u05D9</th>
                    <th className="p-3 text-right">\u05E4\u05E2\u05D5\u05DC\u05D5\u05EA</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={5} className="p-8 text-center text-gray-400">\u05D8\u05D5\u05E2\u05DF...</td></tr>
                  ) : skills.length === 0 ? (
                    <tr><td colSpan={5} className="p-8 text-center text-gray-400">\u05DC\u05D0 \u05E0\u05DE\u05E6\u05D0\u05D5 \u05DB\u05D9\u05E9\u05D5\u05E8\u05D9\u05DD</td></tr>
                  ) : skills.map(s => (
                    <tr key={s.id} className="border-t hover:bg-gray-50">
                      <td className="p-3 font-medium">{s.skill_name}</td>
                      <td className="p-3"><Badge variant="outline">{s.category}</Badge></td>
                      <td className="p-3 text-gray-500 max-w-[200px] truncate">{s.description}</td>
                      <td className="p-3">{s.is_critical && <Badge className="bg-red-100 text-red-800">\u05E7\u05E8\u05D9\u05D8\u05D9</Badge>}</td>
                      <td className="p-3">
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => { setEditSkill(s); setSkillForm(s); setShowSkillForm(true); }}><Edit2 className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="sm" onClick={() => deleteSkill(s.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Assessments Tab */}
        <TabsContent value="assessments" className="space-y-4">
          <div className="flex gap-3 items-center">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
              <Input placeholder="\u05D7\u05D9\u05E4\u05D5\u05E9 \u05E2\u05D5\u05D1\u05D3..." value={assessSearch} onChange={e => setAssessSearch(e.target.value)} className="pr-9" />
            </div>
            <Button onClick={() => setShowAssessForm(true)}>
              <Plus className="w-4 h-4 ml-1" />\u05D4\u05E2\u05E8\u05DB\u05D4 \u05D7\u05D3\u05E9\u05D4
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-3 text-right">\u05E2\u05D5\u05D1\u05D3</th>
                    <th className="p-3 text-right">\u05DB\u05D9\u05E9\u05D5\u05E8</th>
                    <th className="p-3 text-right">\u05E8\u05DE\u05D4 \u05E0\u05D5\u05DB\u05D7\u05D9\u05EA</th>
                    <th className="p-3 text-right">\u05E8\u05DE\u05D4 \u05D9\u05E2\u05D3</th>
                    <th className="p-3 text-right">\u05E4\u05E2\u05E8</th>
                    <th className="p-3 text-right">\u05D4\u05E1\u05DE\u05DB\u05D4</th>
                    <th className="p-3 text-right">\u05DE\u05E2\u05E8\u05D9\u05DA</th>
                  </tr>
                </thead>
                <tbody>
                  {assessments.length === 0 ? (
                    <tr><td colSpan={7} className="p-8 text-center text-gray-400">\u05DC\u05D0 \u05E0\u05DE\u05E6\u05D0\u05D5 \u05D4\u05E2\u05E8\u05DB\u05D5\u05EA</td></tr>
                  ) : assessments.map(a => {
                    const gap = (a.target_level || 0) - (a.current_level || 0);
                    const prof = profLevels.find(p => p.level === a.current_level);
                    return (
                      <tr key={a.id} className="border-t hover:bg-gray-50">
                        <td className="p-3 font-medium">{a.employee_name}</td>
                        <td className="p-3">{a.skill_name}</td>
                        <td className="p-3"><Badge className={prof?.color || "bg-gray-100"}>{prof?.label || a.current_level}</Badge></td>
                        <td className="p-3"><Badge variant="outline">{a.target_level}</Badge></td>
                        <td className="p-3">
                          {gap > 0 ? <Badge className="bg-red-100 text-red-800">-{gap}</Badge> : <Badge className="bg-green-100 text-green-800">\u05EA\u05E7\u05D9\u05DF</Badge>}
                        </td>
                        <td className="p-3">{a.certification || "-"}</td>
                        <td className="p-3 text-gray-500">{a.assessed_by || "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Gap Analysis Tab */}
        <TabsContent value="gap" className="space-y-4">
          <h3 className="text-lg font-semibold">\u05E1\u05D9\u05DB\u05D5\u05DD \u05E4\u05E2\u05E8\u05D9\u05DD \u05DC\u05E4\u05D9 \u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D4</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(gapData.summary || []).map((s: any, i: number) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <h4 className="font-medium text-lg">{s.category || "\u05DC\u05D0 \u05DE\u05E1\u05D5\u05D5\u05D2"}</h4>
                  <div className="mt-2 space-y-1 text-sm">
                    <div className="flex justify-between"><span>\u05E1\u05D4"\u05DB \u05E4\u05E2\u05E8\u05D9\u05DD:</span><span className="font-bold">{s.total_gaps}</span></div>
                    <div className="flex justify-between"><span>\u05E4\u05E2\u05E8 \u05DE\u05DE\u05D5\u05E6\u05E2:</span><span className="font-bold">{Number(s.avg_gap || 0).toFixed(1)}</span></div>
                    <div className="flex justify-between"><span>\u05E4\u05E2\u05E8\u05D9\u05DD \u05E7\u05E8\u05D9\u05D8\u05D9\u05D9\u05DD:</span><span className="font-bold text-red-600">{s.critical_gaps}</span></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader><CardTitle>\u05E4\u05D9\u05E8\u05D5\u05D8 \u05E4\u05E2\u05E8\u05D9\u05DD</CardTitle></CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-3 text-right">\u05E2\u05D5\u05D1\u05D3</th>
                    <th className="p-3 text-right">\u05DB\u05D9\u05E9\u05D5\u05E8</th>
                    <th className="p-3 text-right">\u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D4</th>
                    <th className="p-3 text-right">\u05E0\u05D5\u05DB\u05D7\u05D9</th>
                    <th className="p-3 text-right">\u05D9\u05E2\u05D3</th>
                    <th className="p-3 text-right">\u05E4\u05E2\u05E8</th>
                    <th className="p-3 text-right">\u05E7\u05E8\u05D9\u05D8\u05D9</th>
                  </tr>
                </thead>
                <tbody>
                  {(gapData.gaps || []).length === 0 ? (
                    <tr><td colSpan={7} className="p-8 text-center text-gray-400">\u05DC\u05D0 \u05E0\u05DE\u05E6\u05D0\u05D5 \u05E4\u05E2\u05E8\u05D9\u05DD</td></tr>
                  ) : (gapData.gaps || []).slice(0, 50).map((g: any, i: number) => (
                    <tr key={i} className="border-t hover:bg-gray-50">
                      <td className="p-3 font-medium">{g.employee_name}</td>
                      <td className="p-3">{g.skill_name}</td>
                      <td className="p-3"><Badge variant="outline">{g.category}</Badge></td>
                      <td className="p-3">{g.current_level}</td>
                      <td className="p-3">{g.target_level}</td>
                      <td className="p-3"><Badge className="bg-red-100 text-red-800">-{g.gap}</Badge></td>
                      <td className="p-3">{g.is_critical && <AlertTriangle className="w-4 h-4 text-red-500" />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Skill Form Modal */}
      {showSkillForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{editSkill ? "\u05E2\u05E8\u05D9\u05DB\u05EA \u05DB\u05D9\u05E9\u05D5\u05E8" : "\u05DB\u05D9\u05E9\u05D5\u05E8 \u05D7\u05D3\u05E9"}</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => { setShowSkillForm(false); setEditSkill(null); }}><X className="w-4 h-4" /></Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div><label className="text-sm font-medium">\u05E9\u05DD \u05DB\u05D9\u05E9\u05D5\u05E8 *</label><Input className="mt-1" value={skillForm.skill_name} onChange={e => setSkillForm({ ...skillForm, skill_name: e.target.value })} /></div>
              <div><label className="text-sm font-medium">\u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D4 *</label>
                <select className="w-full border rounded-md px-3 py-2 text-sm mt-1" value={skillForm.category} onChange={e => setSkillForm({ ...skillForm, category: e.target.value })}>
                  <option value="">\u05D1\u05D7\u05E8...</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div><label className="text-sm font-medium">\u05EA\u05D9\u05D0\u05D5\u05E8</label><textarea className="w-full border rounded-md px-3 py-2 text-sm mt-1" rows={3} value={skillForm.description} onChange={e => setSkillForm({ ...skillForm, description: e.target.value })} /></div>
              <div className="flex items-center gap-2"><input type="checkbox" checked={skillForm.is_critical} onChange={e => setSkillForm({ ...skillForm, is_critical: e.target.checked })} /><label className="text-sm">\u05DB\u05D9\u05E9\u05D5\u05E8 \u05E7\u05E8\u05D9\u05D8\u05D9</label></div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => { setShowSkillForm(false); setEditSkill(null); }}>\u05D1\u05D9\u05D8\u05D5\u05DC</Button>
                <Button onClick={saveSkill}><Save className="w-4 h-4 ml-1" />\u05E9\u05DE\u05D9\u05E8\u05D4</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Assessment Form Modal */}
      {showAssessForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>\u05D4\u05E2\u05E8\u05DB\u05D4 \u05D7\u05D3\u05E9\u05D4</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setShowAssessForm(false)}><X className="w-4 h-4" /></Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div><label className="text-sm font-medium">\u05E9\u05DD \u05E2\u05D5\u05D1\u05D3 *</label><Input className="mt-1" value={assessForm.employee_name} onChange={e => setAssessForm({ ...assessForm, employee_name: e.target.value })} /></div>
              <div><label className="text-sm font-medium">\u05DB\u05D9\u05E9\u05D5\u05E8 *</label><Input className="mt-1" value={assessForm.skill_name} onChange={e => setAssessForm({ ...assessForm, skill_name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-sm font-medium">\u05E8\u05DE\u05D4 \u05E0\u05D5\u05DB\u05D7\u05D9\u05EA</label>
                  <select className="w-full border rounded-md px-3 py-2 text-sm mt-1" value={assessForm.current_level} onChange={e => setAssessForm({ ...assessForm, current_level: +e.target.value })}>
                    {profLevels.map(p => <option key={p.level} value={p.level}>{p.level} - {p.label}</option>)}
                  </select>
                </div>
                <div><label className="text-sm font-medium">\u05E8\u05DE\u05D4 \u05D9\u05E2\u05D3</label>
                  <select className="w-full border rounded-md px-3 py-2 text-sm mt-1" value={assessForm.target_level} onChange={e => setAssessForm({ ...assessForm, target_level: +e.target.value })}>
                    {profLevels.map(p => <option key={p.level} value={p.level}>{p.level} - {p.label}</option>)}
                  </select>
                </div>
              </div>
              <div><label className="text-sm font-medium">\u05DE\u05E2\u05E8\u05D9\u05DA</label><Input className="mt-1" value={assessForm.assessed_by} onChange={e => setAssessForm({ ...assessForm, assessed_by: e.target.value })} /></div>
              <div><label className="text-sm font-medium">\u05D4\u05E1\u05DE\u05DB\u05D4</label><Input className="mt-1" value={assessForm.certification} onChange={e => setAssessForm({ ...assessForm, certification: e.target.value })} /></div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowAssessForm(false)}>\u05D1\u05D9\u05D8\u05D5\u05DC</Button>
                <Button onClick={saveAssess}><Save className="w-4 h-4 ml-1" />\u05E9\u05DE\u05D9\u05E8\u05D4</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
